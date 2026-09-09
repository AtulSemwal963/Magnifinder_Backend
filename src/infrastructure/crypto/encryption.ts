
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const KEY_ENVIRONMENT_VARIABLE =
  "CREDENTIAL_ENCRYPTION_KEY";

const ENCRYPTION_VERSION = "v1";

/**
 * Read the application's master encryption key.
 *
 * Expected format:
 *
 * CREDENTIAL_ENCRYPTION_KEY=<64 hexadecimal characters>
 *
 * 64 hexadecimal characters = 32 bytes = 256 bits.
 *
 * This key must NEVER be stored in MongoDB.
 */
const getEncryptionKey = (): Buffer => {
  const rawKey =
    process.env[
      KEY_ENVIRONMENT_VARIABLE
    ]?.trim();

  if (!rawKey) {
    throw new Error(
      `${KEY_ENVIRONMENT_VARIABLE} is not configured.`
    );
  }

  if (
    !/^[0-9a-fA-F]+$/.test(rawKey) ||
    rawKey.length !== KEY_LENGTH * 2
  ) {
    throw new Error(
      `${KEY_ENVIRONMENT_VARIABLE} must be a 32-byte hexadecimal key.`
    );
  }

  return Buffer.from(
    rawKey,
    "hex"
  );
};

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * Stored format:
 *
 * v1:<iv>:<authTag>:<ciphertext>
 *
 * The encryption key is never included in the result.
 */
export const encrypt = (
  plaintext: string
): string => {
  if (
    typeof plaintext !== "string" ||
    plaintext.length === 0
  ) {
    throw new Error(
      "Plaintext must be a non-empty string."
    );
  }

  const key =
    getEncryptionKey();

  /*
   * Generate a fresh IV for every encryption.
   */
  const iv =
    randomBytes(
      IV_LENGTH
    );

  const cipher =
    createCipheriv(
      ALGORITHM,
      key,
      iv
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        plaintext,
        "utf8"
      ),
      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

/**
 * Decrypt an AES-256-GCM encrypted value.
 *
 * Expected format:
 *
 * v1:<iv>:<authTag>:<ciphertext>
 */
export const decrypt = (
  encryptedValue: string
): string => {
  if (
    typeof encryptedValue !== "string" ||
    encryptedValue.length === 0
  ) {
    throw new Error(
      "Encrypted value is required."
    );
  }

  const parts =
    encryptedValue.split(":");

  /*
   * Validate the envelope before accessing
   * individual positions.
   */
  if (
    parts.length !== 4
  ) {
    throw new Error(
      "Invalid encrypted value format."
    );
  }

  const version =
    parts[0];

  const ivBase64 =
    parts[1];

  const authTagBase64 =
    parts[2];

  const ciphertextBase64 =
    parts[3];

  /*
   * The length check above guarantees these values
   * exist at runtime. The explicit checks also make
   * the contract clear to TypeScript.
   */
  if (
    !version ||
    !ivBase64 ||
    !authTagBase64 ||
    !ciphertextBase64
  ) {
    throw new Error(
      "Invalid encrypted value format."
    );
  }

  if (
    version !==
    ENCRYPTION_VERSION
  ) {
    throw new Error(
      `Unsupported encryption version: ${version}.`
    );
  }

  const iv =
    Buffer.from(
      ivBase64,
      "base64"
    );

  const authTag =
    Buffer.from(
      authTagBase64,
      "base64"
    );

  const ciphertext =
    Buffer.from(
      ciphertextBase64,
      "base64"
    );

  if (
    iv.length !==
    IV_LENGTH
  ) {
    throw new Error(
      "Invalid encryption IV."
    );
  }

  if (
    authTag.length !==
    AUTH_TAG_LENGTH
  ) {
    throw new Error(
      "Invalid encryption authentication tag."
    );
  }

  const key =
    getEncryptionKey();

  const decipher =
    createDecipheriv(
      ALGORITHM,
      key,
      iv
    );

  decipher.setAuthTag(
    authTag
  );

  try {
    const plaintext =
      Buffer.concat([
        decipher.update(
          ciphertext
        ),
        decipher.final(),
      ]);

    return plaintext.toString(
      "utf8"
    );
  } catch {
    /*
     * Do not reveal whether the failure came from:
     *
     * - an incorrect key
     * - modified ciphertext
     * - modified authentication tag
     * - corrupted data
     */
    throw new Error(
      "Failed to decrypt value."
    );
  }
};

