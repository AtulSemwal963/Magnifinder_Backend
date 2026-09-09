
// src/infrastructure/fetch-leads/openoutfind.config.ts

import path from "node:path";

/**
 * Infrastructure-level configuration for the OpenOutFind
 * runtime.
 *
 * This configuration belongs to Magnifinder itself.
 *
 * User-specific values MUST NOT be stored here.
 *
 * User/job-specific values are supplied through
 * FetchLeadsInput at execution time.
 */
export interface OpenOutFindConfig {
  /**
   * OpenOutFind CLI executable.
   *
   * In the Docker runtime, "outfind" is available on PATH.
   */
  executable: string;

  /**
   * Root directory used for OpenOutFind's per-job SQLite
   * databases.
   *
   * Example:
   *
   * /data/openoutfind
   */
  databaseDirectory: string;

  /**
   * Maximum amount of process output that can be captured.
   *
   * This prevents an unexpectedly verbose OpenOutFind
   * execution from consuming unbounded Node.js memory.
   */
  maxOutputSize: number;

  /**
   * Working directory for the OpenOutFind child process.
   */
  workingDirectory: string;
}

/**
 * Infrastructure defaults.
 *
 * Keeping these in one place makes the runtime behavior
 * explicit and prevents magic values from being scattered
 * throughout the configuration factory.
 */
const DEFAULTS = {
  executable: "outfind",
  databaseDirectory: "/data/openoutfind",
  workingDirectory: "/app",

  /*
   * 25 MiB maximum captured output.
   *
   * OpenOutFind's normal output is substantially smaller,
   * but this provides a reasonable safety boundary.
   */
  maxOutputSize: 25 * 1024 * 1024,
} as const;

/**
 * Read a runtime environment variable.
 *
 * Empty/whitespace-only values fall back to the supplied
 * default.
 *
 * This helper is ONLY for infrastructure configuration.
 *
 * User-owned credentials are intentionally not read here.
 */
const getEnvironmentVariable = (
  name: string,
  fallback: string
): string => {
  const value = process.env[name]?.trim();

  return value && value.length > 0
    ? value
    : fallback;
};

/**
 * Parse a positive integer configuration value.
 *
 * Configuration errors are detected during application
 * startup/configuration rather than later during a lead job.
 */
const getPositiveIntegerEnvironmentVariable = (
  name: string,
  fallback: number
): number => {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer.`
    );
  }

  return parsedValue;
};

/**
 * Build the OpenOutFind infrastructure configuration.
 *
 * This function intentionally does NOT read:
 *
 * - OPENOUTFIND_AI_MODEL
 * - OPENOUTFIND_LLM_API_KEY
 * - OPENOUTFIND_BETTERCONTACT_API_KEY
 * - OPENOUTFIND_OPERATOR_EMAIL
 * - OPENOUTFIND_COUNTRY
 * - OPENOUTFIND_ACCEPT_LEGAL_NOTICE
 * - OPENOUTFIND_PRODUCT_DOCS
 * - OPENOUTFIND_CAMPAIGN_TARGET
 *
 * Those values belong to an individual lead-generation
 * execution and are supplied through FetchLeadsInput.
 *
 * Therefore the Magnifinder application can boot without
 * any OpenOutFind user credentials configured.
 */
export const getOpenOutFindConfig =
  (): OpenOutFindConfig => {
    const executable =
      getEnvironmentVariable(
        "OPENOUTFIND_EXECUTABLE",
        DEFAULTS.executable
      );

    const databaseDirectory =
      getEnvironmentVariable(
        "OPENOUTFIND_DATABASE_DIRECTORY",
        DEFAULTS.databaseDirectory
      );

    const workingDirectory =
      getEnvironmentVariable(
        "OPENOUTFIND_WORKING_DIRECTORY",
        DEFAULTS.workingDirectory
      );

    const maxOutputSize =
      getPositiveIntegerEnvironmentVariable(
        "OPENOUTFIND_MAX_OUTPUT_SIZE",
        DEFAULTS.maxOutputSize
      );

    return {
      executable,

      databaseDirectory:
        path.resolve(
          databaseDirectory
        ),

      maxOutputSize,

      workingDirectory:
        path.resolve(
          workingDirectory
        ),
    };
  };

