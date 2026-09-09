// src/infrastructure/fetch-leads/openoutfind.client.ts

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { getOpenOutFindConfig, type OpenOutFindConfig } from "./openoutfind.config.js";
import type { FetchLeadsInput, FetchLeadsResult, OpenOutFindExecutionResult, OpenOutFindLead } from "./openoutfind.types.js";

/**
 * Error patterns emitted by OpenOutFind when the runtime
 * cannot start a lead-generation job because required
 * configuration is missing.
 */
const OPENOUTFIND_CONFIGURATION_ERRORS = [
  "onboarding_incomplete:",
  "not ready to find",
  "set OPENOUTFIND_PRODUCT_DOCS",
  "set OPENOUTFIND_CAMPAIGN_TARGET",
  "OPENOUTFIND_ACCEPT_LEGAL_NOTICE must be set to 'true'",
] as const;

/**
 * Expected OpenOutFind CSV columns.
 *
 * OpenOutFind emits snake_case column names while the
 * Magnifinder infrastructure exposes camelCase objects.
 */
const CSV_HEADERS = [
  "email",
  "first_name",
  "last_name",
  "company",
  "title",
  "website",
  "linkedin_url",
  "reason",
  "lead_id",
  "qualified_at",
] as const;

/**
 * Execute the OpenOutFind CLI.
 *
 * This class is deliberately isolated from:
 * - Express, HTTP, Prisma, authentication, users, chat
 *
 * Its responsibility is translating FetchLeadsInput into
 * one isolated OpenOutFind process execution and returning
 * normalized lead data.
 */
class OpenOutFindClient {
  private readonly config: OpenOutFindConfig;

  constructor(config: OpenOutFindConfig = getOpenOutFindConfig()) {
    this.config = config;
  }

  /**
   * Execute one OpenOutFind lead-generation job.
   */
  async findLeads(input: FetchLeadsInput): Promise<FetchLeadsResult> {
    this.validateInput(input);
    const databasePath = this.getCampaignDatabasePath(input.campaignId);
    await fs.mkdir(this.config.databaseDirectory, { recursive: true });

    const execution = await this.executeOpenOutFind(databasePath, input);
    const csv = this.extractCsv(execution.stdout);
    const leads = this.parseCsv(csv);

    return {
      campaignId: input.campaignId,
      count: leads.length,
      leads,
    };
  }

  /**
   * Resolve the dedicated SQLite database for a campaign/job.
   */
  private getCampaignDatabasePath(campaignId: string): string {
    const normalizedCampaignId = campaignId.trim();
    if (normalizedCampaignId.includes("/") || normalizedCampaignId.includes("\\") || normalizedCampaignId.includes("..")) {
      throw new Error("Invalid campaign ID.");
    }

    const databaseDirectory = path.resolve(this.config.databaseDirectory);
    const databasePath = path.resolve(databaseDirectory, `${normalizedCampaignId}.sqlite3`);
    const relativePath = path.relative(databaseDirectory, databasePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("Invalid campaign database path.");
    }

    return databasePath;
  }

  /**
   * Execute: outfind --db <database> find <count>
   * User-specific credentials are injected only into this child process environment.
   */
  private executeOpenOutFind(databasePath: string, input: FetchLeadsInput): Promise<OpenOutFindExecutionResult> {
    return new Promise((resolve, reject) => {
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        OPENOUTFIND_AI_MODEL: input.credentials.aiModel,
        OPENOUTFIND_LLM_API_KEY: input.credentials.llmApiKey,
        OPENOUTFIND_BETTERCONTACT_API_KEY: input.credentials.betterContactApiKey,
        OPENOUTFIND_OPERATOR_EMAIL: input.credentials.operatorEmail,
        OPENOUTFIND_OPERATOR_COUNTRY: input.runtime.country,
        OPENOUTFIND_ACCEPT_LEGAL_NOTICE: String(input.runtime.acceptLegalNotice),
        OPENOUTFIND_PRODUCT_DOCS: input.productDocs,
        OPENOUTFIND_CAMPAIGN_TARGET: input.campaignTarget,
        ...(input.credentials.llmApiBase ? { OPENOUTFIND_LLM_API_BASE: input.credentials.llmApiBase } : {}),
        ...(input.credentials.apolloApiKey ? { OPENOUTFIND_APOLLO_API_KEY: input.credentials.apolloApiKey } : {}),
        ...(input.credentials.newsletter ? { OPENOUTFIND_NEWSLETTER: input.credentials.newsletter } : {}),
      };

      const child = spawn(
        this.config.executable,
        ["--db", databasePath, "find", String(input.count)],
        {
          env: environment,
          cwd: this.config.workingDirectory,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      let stdout = "";
      let stderr = "";
      let outputLimitExceeded = false;

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        if (outputLimitExceeded) return;
        stdout += chunk;
        if (Buffer.byteLength(stdout) > this.config.maxOutputSize) {
          outputLimitExceeded = true;
          child.kill("SIGTERM");
          reject(new Error("OpenOutFind output exceeded the maximum allowed size."));
        }
      });

      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (error: Error) => {
        if (outputLimitExceeded) return;
        reject(new Error(`Failed to execute OpenOutFind: ${error.message}`));
      });

      child.on("close", (exitCode, signal) => {
        if (outputLimitExceeded) return;

        const configurationError = this.detectConfigurationError(stdout, stderr);
        if (configurationError) {
          reject(new Error(configurationError));
          return;
        }

        if (exitCode === 0) {
          resolve({ stdout, stderr, exitCode, signal: signal as NodeJS.Signals | null });
          return;
        }

        const details = this.extractFailureDetails(stderr, stdout);
        if (signal) {
          reject(new Error(details ? `OpenOutFind terminated by signal ${signal}: ${details}` : `OpenOutFind terminated by signal ${signal}.`));
          return;
        }

        reject(new Error(details ? `OpenOutFind exited with code ${exitCode}: ${details}` : `OpenOutFind exited with code ${exitCode}.`));
      });
    });
  }

  /**
   * Detect known OpenOutFind configuration failures.
   */
  private detectConfigurationError(stdout: string, stderr: string): string | null {
    const combinedOutput = `${stdout}\n${stderr}`;
    const normalizedOutput = combinedOutput.toLowerCase();

    const hasConfigurationError = OPENOUTFIND_CONFIGURATION_ERRORS.some((pattern) =>
      normalizedOutput.includes(pattern.toLowerCase())
    );

    if (!hasConfigurationError) return null;

    const missingVariables = this.extractMissingEnvironmentVariables(combinedOutput);
    if (missingVariables.length > 0) {
      return `OpenOutFind configuration incomplete. Missing required configuration: ${missingVariables.join(", ")}.`;
    }

    if (normalizedOutput.includes("accept_legal_notice")) {
      return "OpenOutFind configuration incomplete. OPENOUTFIND_ACCEPT_LEGAL_NOTICE must be set to true.";
    }

    return "OpenOutFind configuration is incomplete. Required OpenOutFind configuration is missing.";
  }

  /**
   * Extract known missing environment variables.
   */
  private extractMissingEnvironmentVariables(output: string): string[] {
    const knownVariables = [
      "OPENOUTFIND_PRODUCT_DOCS",
      "OPENOUTFIND_CAMPAIGN_TARGET",
      "OPENOUTFIND_AI_MODEL",
      "OPENOUTFIND_LLM_API_KEY",
      "OPENOUTFIND_BETTERCONTACT_API_KEY",
      "OPENOUTFIND_OPERATOR_EMAIL",
      "OPENOUTFIND_OPERATOR_COUNTRY",
    ];

    const foundVariables: string[] = [];
    for (const variable of knownVariables) {
      if (output.includes(variable)) foundVariables.push(variable);
    }
    return foundVariables;
  }

  /**
   * Extract a concise useful failure detail.
   */
  private extractFailureDetails(stderr: string, stdout: string): string {
    const source = stderr.trim() || stdout.trim();
    if (!source) return "";

    const errorLine = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^error\s*:/i.test(line));

    if (errorLine) return errorLine.replace(/^error\s*:\s*/i, "").trim();

    const firstLine = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    return firstLine ?? "";
  }

  /**
   * Extract the CSV section from OpenOutFind stdout.
   * OpenOutFind may print informational messages before the actual CSV.
   */
  private extractCsv(stdout: string): string {
    const lines = stdout.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => this.isCsvHeader(line));

    if (headerIndex === -1) {
      throw new Error("OpenOutFind completed without returning lead data.");
    }

    return lines.slice(headerIndex).join("\n").trim();
  }

  /**
   * Identify OpenOutFind's lead CSV header.
   */
  private isCsvHeader(line: string): boolean {
    const normalized = line.trim().toLowerCase();
    return (
      normalized.startsWith("email,") &&
      normalized.includes("first_name") &&
      normalized.includes("last_name") &&
      normalized.includes("company")
    );
  }

  /**
   * Validate the complete job input.
   */
  private validateInput(input: FetchLeadsInput): void {
    if (!input || typeof input !== "object") throw new Error("OpenOutFind input is required.");
    if (typeof input.campaignId !== "string" || !input.campaignId.trim()) throw new Error("Campaign ID is required.");
    if (typeof input.productDocs !== "string" || !input.productDocs.trim()) throw new Error("Product documentation is required.");
    if (typeof input.campaignTarget !== "string" || !input.campaignTarget.trim()) throw new Error("Campaign target is required.");
    if (!Number.isInteger(input.count) || input.count <= 0) throw new Error("Lead count must be a positive integer.");
    if (input.count > 1000) throw new Error("Lead count cannot exceed 1000.");
    if (!input.credentials || typeof input.credentials !== "object") throw new Error("OpenOutFind credentials are required.");
    if (typeof input.credentials.aiModel !== "string" || !input.credentials.aiModel.trim()) throw new Error("OpenOutFind AI model is required.");
    if (typeof input.credentials.llmApiKey !== "string" || !input.credentials.llmApiKey.trim()) throw new Error("OpenOutFind LLM API key is required.");
    if (typeof input.credentials.betterContactApiKey !== "string" || !input.credentials.betterContactApiKey.trim()) throw new Error("BetterContact API key is required.");
    if (typeof input.credentials.operatorEmail !== "string" || !input.credentials.operatorEmail.trim()) throw new Error("OpenOutFind operator email is required.");
    if (!input.runtime || typeof input.runtime !== "object") throw new Error("OpenOutFind runtime configuration is required.");
    if (typeof input.runtime.country !== "string" || !input.runtime.country.trim()) throw new Error("OpenOutFind country is required.");
    if (typeof input.runtime.acceptLegalNotice !== "boolean") throw new Error("OpenOutFind legal notice acceptance is required.");
    if (!input.runtime.acceptLegalNotice) throw new Error("OpenOutFind legal notice must be accepted.");
  }


/**
 * Derive a first name and last name from a LinkedIn
 * profile URL slug.
 *
 * Examples:
 *
 * https://www.linkedin.com/in/john-doe-123456
 * -> { firstName: "John", lastName: "Doe" }
 *
 * https://www.linkedin.com/in/john-doe-22b791
 * -> { firstName: "John", lastName: "Doe" }
 *
 * https://www.linkedin.com/in/john-paul-smith-42
 * -> { firstName: "John", lastName: "Paul Smith" }
 *
 * Logic:
 * - Extract the /in/<slug> portion.
 * - Split the slug on hyphens.
 * - Remove any segment containing a number.
 * - First remaining segment becomes firstName.
 * - Remaining segments become lastName.
 */
private deriveNameFromLinkedInUrl(
  linkedinUrl: string
): {
  firstName: string;
  lastName: string;
} {
  const trimmedUrl =
    linkedinUrl.trim();

  if (
    !trimmedUrl
  ) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const match =
    trimmedUrl.match(
      /linkedin\.com\/in\/([^/?#]+)/i
    );

  if (
    !match?.[1]
  ) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts =
    match[1]
      .split("-")
      .map(
        (part) =>
          part.trim()
      )
      .filter(
        (part) =>
          part.length > 0
      )
      // Remove the entire segment if it contains
      // ANY numeric character.
      .filter(
        (part) =>
          !/\d/.test(part)
      );

  if (
    parts.length === 0
  ) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const formatNamePart =
    (part: string): string =>
      part.length > 0
        ? part.charAt(0).toUpperCase() +
          part.slice(1).toLowerCase()
        : "";

  const firstName =
    formatNamePart(
      parts[0] ?? ""
    );

  const lastName =
    parts
      .slice(1)
      .map(
        formatNamePart
      )
      .join(" ");

  return {
    firstName,
    lastName,
  };
}



  /**
   * Parse OpenOutFind CSV into the strongly typed Magnifinder lead representation.
   * First and last names are derived from the LinkedIn profile slug rather than
   * relying on OpenOutFind's first_name and last_name values.
   */
  private parseCsv(csv: string): OpenOutFindLead[] {
    const rows = this.parseCsvRows(csv);
    if (rows.length === 0) return [];

    const headerRow = rows[0];
    if (!headerRow) return [];

    const headers = headerRow.map((header) => header.trim());
    const headerIndexes = this.createHeaderIndexes(headers);
    const leads: OpenOutFindLead[] = [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (!row || row.length === 0 || row.every((value) => !value.trim())) continue;

      const linkedinUrl = this.getCsvValue(row, headerIndexes.linkedin_url);
      const { firstName, lastName } = this.deriveNameFromLinkedInUrl(linkedinUrl);

      const lead: OpenOutFindLead = {
        email: this.getCsvValue(row, headerIndexes.email),
        firstName,
        lastName,
        company: this.getCsvValue(row, headerIndexes.company),
        title: this.getCsvValue(row, headerIndexes.title),
        website: this.getCsvValue(row, headerIndexes.website),
        linkedinUrl,
        reason: this.getCsvValue(row, headerIndexes.reason),
        leadId: this.getCsvValue(row, headerIndexes.lead_id),
        qualifiedAt: this.getCsvValue(row, headerIndexes.qualified_at),
      };

      leads.push(lead);
    }

    return leads;
  }

  /**
   * Create a lookup table for CSV columns.
   */
  private createHeaderIndexes(headers: string[]): Partial<Record<typeof CSV_HEADERS[number], number>> {
    const indexes: Partial<Record<typeof CSV_HEADERS[number], number>> = {};

    for (let index = 0; index < headers.length; index++) {
      const header = headers[index];
      if (!header) continue;

      const normalizedHeader = header.toLowerCase().trim();
      if ((CSV_HEADERS as readonly string[]).includes(normalizedHeader)) {
        indexes[normalizedHeader as typeof CSV_HEADERS[number]] = index;
      }
    }

    return indexes;
  }

  /**
   * Safely retrieve a CSV column. Missing columns become an empty string rather than undefined.
   */
  private getCsvValue(row: string[], index: number | undefined): string {
    if (index === undefined) return "";
    return row[index]?.trim() ?? "";
  }

  /**
   * Dependency-free CSV parser.
   */
  private parseCsvRows(csv: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let insideQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const character = csv.charAt(i);

      if (insideQuotes) {
        if (character === '"') {
          if (csv.charAt(i + 1) === '"') {
            field += '"';
            i++;
          } else {
            insideQuotes = false;
          }
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"') {
        insideQuotes = true;
        continue;
      }

      if (character === ",") {
        row.push(field);
        field = "";
        continue;
      }

      if (character === "\n") {
        row.push(field);
        field = "";
        const lastValue = row[row.length - 1];
        if (lastValue !== undefined && lastValue.endsWith("\r")) {
          row[row.length - 1] = lastValue.slice(0, -1);
        }
        rows.push(row);
        row = [];
        continue;
      }

      field += character;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      const lastValue = row[row.length - 1];
      if (lastValue !== undefined && lastValue.endsWith("\r")) {
        row[row.length - 1] = lastValue.slice(0, -1);
      }
      rows.push(row);
    }

    return rows;
  }
}

export const openOutFindClient = new OpenOutFindClient();