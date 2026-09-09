
// src/infrastructure/fetch-leads/openoutfind.types.ts

/**
 * Credentials supplied by the authenticated paid user
 * for a specific OpenOutFind job.
 */
export interface OpenOutFindCredentials {
  aiModel: string;
  llmApiKey: string;
  betterContactApiKey: string;
  operatorEmail: string;

  /**
   * Required when using an openai_compatible:* model.
   */
  llmApiBase?: string;

  apolloApiKey?: string;

  newsletter?: string;
}

/**
 * Non-secret runtime options supplied for a specific job.
 */
export interface OpenOutFindRuntimeOptions {
  country: string;
  acceptLegalNotice: boolean;
}

/**
 * Complete input required to execute one OpenOutFind job.
 */
export interface FetchLeadsInput {
  campaignId: string;
  productDocs: string;
  campaignTarget: string;
  count: number;

  credentials: OpenOutFindCredentials;

  runtime: OpenOutFindRuntimeOptions;
}

/**
 * Normalized lead representation exposed by the
 * fetch-leads infrastructure.
 *
 * OpenOutFind emits snake_case CSV fields.
 *
 * The infrastructure layer converts them into this
 * application-facing camelCase representation.
 */
export interface OpenOutFindLead {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  website: string;
  linkedinUrl: string;
  reason: string;
  leadId: string;
  qualifiedAt: string;
}

/**
 * Clean result returned by the fetch-leads infrastructure.
 *
 * No raw CSV, stdout, stderr, CLI output, or database
 * path leaves this boundary.
 */
export interface FetchLeadsResult {
  campaignId: string;
  count: number;
  leads: OpenOutFindLead[];
}

/**
 * Internal result produced while executing OpenOutFind.
 */
export interface OpenOutFindExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

