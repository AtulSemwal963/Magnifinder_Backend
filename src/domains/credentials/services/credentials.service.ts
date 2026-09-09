
import {
  encrypt,
  decrypt,
} from "../../../infrastructure/crypto/index.js";

import {
  credentialsRepository,
  type UpdateCredentialData,
} from "../repositories/credentials.repository.js";

// ============================================================
// Public Types
// ============================================================

export interface Credential {
  id: string;
  provider: string;
  modelName: string | null;
  hasApiKey: boolean;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialInput {
  provider: string;
  modelName?: string;
  apiKey: string;
}

export interface UpdateCredentialInput {
  provider?: string;
  modelName?: string;
  apiKey?: string;
}

// ============================================================
// Internal Backend Type
// ============================================================
//
// This type is ONLY used inside the backend.
//
// It must never be returned by an HTTP controller.
// The plaintext API key exists only for the duration of
// the backend operation that needs it.
//

export interface DecryptedCredential {
  id: string;
  provider: string;
  modelName: string | null;
  apiKey: string;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Service
// ============================================================

export class CredentialsService {
  /**
   * Create a provider credential for the authenticated user.
   *
   * Plaintext API key:
   *
   * Controller
   *      ↓
   * Service
   *      ↓ encrypt()
   * Repository
   *      ↓
   * Database
   *
   * The repository never receives plaintext.
   */
  async createCredential(
    userId: string,
    input: CreateCredentialInput
  ): Promise<Credential> {
    this.validateUserId(userId);

    const provider = this.validateProvider(
      input.provider
    );

    const apiKey = this.validateApiKey(
      input.apiKey
    );

    const modelName =
      this.validateOptionalModelName(
        input.modelName
      );

    const encryptedApiKey = encrypt(apiKey);

    const credential =
      await credentialsRepository.create({
        userId,
        provider,
        ...(modelName !== undefined && {
          modelName,
        }),
        encryptedApiKey,
        keyVersion: 1,
      });

    return this.toPublicCredential(
      credential
    );
  }

  /**
   * Return all credentials belonging to the
   * authenticated user.
   *
   * Plaintext API keys and encrypted API keys are
   * never returned.
   *
   * The frontend receives:
   *
   * {
   *   provider,
   *   modelName,
   *   hasApiKey,
   *   ...
   * }
   */
  async getCredentials(
    userId: string
  ): Promise<Credential[]> {
    this.validateUserId(userId);

    const credentials =
      await credentialsRepository.findByUserId(
        userId
      );

    return credentials.map(
      (credential) =>
        this.toPublicCredential(
          credential
        )
    );
  }

  /**
   * Return metadata for one provider credential.
   *
   * The API key itself is never returned.
   */
  async getCredential(
    userId: string,
    provider: string
  ): Promise<Credential | null> {
    this.validateUserId(userId);

    const normalizedProvider =
      this.validateProvider(provider);

    const credential =
      await credentialsRepository.findByUserIdAndProvider(
        userId,
        normalizedProvider
      );

    if (!credential) {
      return null;
    }

    return this.toPublicCredential(
      credential
    );
  }

  /**
   * Update an existing provider credential.
   *
   * Supported updates:
   *
   * - provider
   * - modelName
   * - apiKey
   *
   * If apiKey is supplied, it is encrypted before
   * persistence.
   *
   * If apiKey is omitted, the existing encrypted key
   * remains untouched.
   */
  async updateCredential(
    userId: string,
    provider: string,
    input: UpdateCredentialInput
  ): Promise<Credential> {
    this.validateUserId(userId);

    const currentProvider =
      this.validateProvider(provider);

    const updateData: UpdateCredentialData = {};

    // ----------------------------------------------------------
    // Provider
    // ----------------------------------------------------------

    if (input.provider !== undefined) {
      updateData.provider =
        this.validateProvider(
          input.provider
        );
    }

    // ----------------------------------------------------------
    // Model name
    // ----------------------------------------------------------

    if (input.modelName !== undefined) {
      const modelName =
        this.validateOptionalModelName(
          input.modelName
        );

      if (modelName !== undefined) {
        updateData.modelName =
          modelName;
      }
    }

    // ----------------------------------------------------------
    // API key
    // ----------------------------------------------------------
    //
    // An empty apiKey means:
    //
    // "Do not modify the existing API key."
    //
    // A non-empty apiKey means:
    //
    // "Replace the existing API key."
    //

    if (input.apiKey !== undefined) {
      const trimmedApiKey =
        input.apiKey.trim();

      if (trimmedApiKey) {
        const encryptedApiKey =
          encrypt(trimmedApiKey);

        updateData.encryptedApiKey =
          encryptedApiKey;

        // Current encryption version.
        updateData.keyVersion = 1;
      }
    }

    // ----------------------------------------------------------
    // Prevent empty updates
    // ----------------------------------------------------------

    if (
      Object.keys(updateData).length === 0
    ) {
      throw new Error(
        "At least one credential field must be provided."
      );
    }

    const credential =
      await credentialsRepository.updateByUserIdAndProvider(
        userId,
        currentProvider,
        updateData
      );

    return this.toPublicCredential(
      credential
    );
  }

  /**
   * Delete a provider credential belonging
   * to the authenticated user.
   */
  async deleteCredential(
    userId: string,
    provider: string
  ): Promise<void> {
    this.validateUserId(userId);

    const normalizedProvider =
      this.validateProvider(provider);

    await credentialsRepository.deleteByUserIdAndProvider(
      userId,
      normalizedProvider
    );
  }

  // ==========================================================
  // Internal Credential Retrieval
  // ==========================================================

  /**
   * Backend-only credential retrieval.
   *
   * This method exists for infrastructure integrations such
   * as OpenOutFind.
   *
   * It:
   *
   * 1. Finds the credential by user + provider.
   * 2. Retrieves the encrypted key from the database.
   * 3. Decrypts it using the crypto infrastructure.
   * 4. Returns the plaintext key to the calling backend service.
   *
   * This method MUST NOT be called from an HTTP controller.
   *
   * This method MUST NOT be exposed to the frontend.
   */
  async getDecryptedCredential(
    userId: string,
    provider: string
  ): Promise<DecryptedCredential | null> {
    this.validateUserId(userId);

    const normalizedProvider =
      this.validateProvider(provider);

    const credential =
      await credentialsRepository.findByUserIdAndProvider(
        userId,
        normalizedProvider
      );

    if (!credential) {
      return null;
    }

    const apiKey = decrypt(
      credential.encryptedApiKey
    );

    return {
      id: credential.id,
      provider: credential.provider,
      modelName: credential.modelName,
      apiKey,
      keyVersion: credential.keyVersion,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }

  // ==========================================================
  // Public Representation
  // ==========================================================

  /**
   * Convert the database representation into the
   * representation safe for the frontend.
   *
   * IMPORTANT:
   *
   * encryptedApiKey is deliberately excluded.
   *
   * `hasApiKey` is derived from the existence of the
   * encrypted value.
   */
  private toPublicCredential(
    credential: {
      id: string;
      provider: string;
      modelName: string | null;
      encryptedApiKey: string;
      keyVersion: number;
      createdAt: Date;
      updatedAt: Date;
    }
  ): Credential {
    return {
      id: credential.id,

      provider:
        credential.provider,

      modelName:
        credential.modelName,

      hasApiKey:
        Boolean(
          credential.encryptedApiKey
        ),

      keyVersion:
        credential.keyVersion,

      createdAt:
        credential.createdAt,

      updatedAt:
        credential.updatedAt,
    };
  }

  // ==========================================================
  // Validation
  // ==========================================================

  private validateUserId(
    userId: string
  ): void {
    if (
      typeof userId !== "string" ||
      !userId.trim()
    ) {
      throw new Error(
        "User ID is required."
      );
    }
  }

  private validateProvider(
    provider: string
  ): string {
    if (
      typeof provider !== "string" ||
      !provider.trim()
    ) {
      throw new Error(
        "Credential provider is required."
      );
    }

    return provider
      .trim()
      .toLowerCase();
  }

  private validateApiKey(
    apiKey: string
  ): string {
    if (
      typeof apiKey !== "string" ||
      !apiKey.trim()
    ) {
      throw new Error(
        "API key is required."
      );
    }

    return apiKey.trim();
  }

  private validateOptionalModelName(
    modelName: string | undefined
  ): string | undefined {
    if (modelName === undefined) {
      return undefined;
    }

    if (
      typeof modelName !== "string" ||
      !modelName.trim()
    ) {
      throw new Error(
        "Model name cannot be empty."
      );
    }

    return modelName.trim();
  }
}

// ============================================================
// Singleton
// ============================================================

export const credentialsService =
  new CredentialsService();

