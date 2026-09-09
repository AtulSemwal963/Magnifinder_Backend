import { prisma } from "../../../lib/prisma.js";
export class CredentialsRepository {
    /**
     * Find every credential belonging to a specific user.
     *
     * The repository returns the database representation.
     * It does not decrypt API keys and does not expose
     * any presentation-specific fields such as `hasApiKey`.
     */
    async findByUserId(userId) {
        return prisma.providerCredential.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
    }
    /**
     * Find one credential belonging to a specific user
     * and provider.
     *
     * Ownership is enforced through the compound unique
     * constraint:
     *
     * userId + provider
     */
    async findByUserIdAndProvider(userId, provider) {
        return prisma.providerCredential.findUnique({
            where: {
                userId_provider: {
                    userId,
                    provider,
                },
            },
        });
    }
    /**
     * Create a provider credential.
     *
     * The API key MUST already be encrypted before this
     * method is called.
     *
     * Encryption/decryption does not belong in the repository.
     */
    async create(data) {
        return prisma.providerCredential.create({
            data: {
                userId: data.userId,
                provider: data.provider,
                ...(data.modelName !== undefined && {
                    modelName: data.modelName,
                }),
                encryptedApiKey: data.encryptedApiKey,
                keyVersion: data.keyVersion,
            },
        });
    }
    /**
     * Update an existing provider credential.
     *
     * The caller is responsible for encrypting a new API key
     * before passing `encryptedApiKey` here.
     *
     * This method does not decrypt or otherwise inspect secrets.
     */
    async updateByUserIdAndProvider(userId, provider, data) {
        return prisma.providerCredential.update({
            where: {
                userId_provider: {
                    userId,
                    provider,
                },
            },
            data: {
                ...(data.provider !== undefined && {
                    provider: data.provider,
                }),
                ...(data.modelName !== undefined && {
                    modelName: data.modelName,
                }),
                ...(data.encryptedApiKey !== undefined && {
                    encryptedApiKey: data.encryptedApiKey,
                }),
                ...(data.keyVersion !== undefined && {
                    keyVersion: data.keyVersion,
                }),
            },
        });
    }
    /**
     * Delete a provider credential belonging to a user.
     */
    async deleteByUserIdAndProvider(userId, provider) {
        return prisma.providerCredential.delete({
            where: {
                userId_provider: {
                    userId,
                    provider,
                },
            },
        });
    }
}
export const credentialsRepository = new CredentialsRepository();
//# sourceMappingURL=credentials.repository.js.map