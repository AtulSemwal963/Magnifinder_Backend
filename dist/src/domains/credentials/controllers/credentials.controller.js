import { credentialsService, } from "../services/credentials.service.js";
export class CredentialsController {
    /**
     * POST /api/v1/credentials
     *
     * Create a provider credential for the
     * authenticated user.
     *
     * The plaintext API key is passed to the service,
     * where it is encrypted before persistence.
     *
     * The response contains metadata only.
     */
    async createCredential(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const input = req.body;
            const credential = await credentialsService.createCredential(userId, input);
            res.status(201).json({
                credential,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /api/v1/credentials
     *
     * Return all credentials belonging to the
     * authenticated user.
     *
     * The service deliberately strips the encrypted
     * API key and returns `hasApiKey` instead.
     */
    async getCredentials(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const credentials = await credentialsService.getCredentials(userId);
            res.status(200).json({
                credentials,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * GET /api/v1/credentials/:provider
     *
     * Return metadata for one provider credential.
     *
     * The plaintext API key and encrypted API key
     * are never returned.
     */
    async getCredential(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const provider = this.getProvider(req);
            const credential = await credentialsService.getCredential(userId, provider);
            if (!credential) {
                res.status(404).json({
                    error: "Credential not found.",
                });
                return;
            }
            res.status(200).json({
                credential,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * PATCH /api/v1/credentials/:provider
     *
     * Update an existing provider credential.
     *
     * Possible updates:
     *
     * - provider
     * - modelName
     * - apiKey
     *
     * If a new API key is supplied, the service encrypts
     * it before persistence.
     *
     * If no API key is supplied, the existing API key
     * remains unchanged.
     */
    async updateCredential(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const provider = this.getProvider(req);
            const input = req.body;
            const credential = await credentialsService.updateCredential(userId, provider, input);
            res.status(200).json({
                credential,
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * DELETE /api/v1/credentials/:provider
     *
     * Delete a provider credential belonging to
     * the authenticated user.
     */
    async deleteCredential(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const provider = this.getProvider(req);
            await credentialsService.deleteCredential(userId, provider);
            res.status(204).send();
        }
        catch (error) {
            next(error);
        }
    }
    // ==========================================================
    // Request Helpers
    // ==========================================================
    /**
     * Extract the authenticated user's ID.
     *
     * IMPORTANT:
     *
     * The client must never provide a userId for credential
     * operations.
     *
     * The user ID comes exclusively from the authenticated
     * request established by the authentication middleware.
     */
    getUserId(req) {
        const userId = req.user?.id;
        if (typeof userId !== "string" ||
            !userId.trim()) {
            throw new Error("Authenticated user is required.");
        }
        return userId;
    }
    /**
     * Extract and validate the provider route parameter.
     *
     * Example:
     *
     * PATCH /api/v1/credentials/llm
     *
     * req.params.provider === "llm"
     */
    getProvider(req) {
        const provider = req.params.provider;
        if (typeof provider !== "string" ||
            !provider.trim()) {
            throw new Error("Credential provider is required.");
        }
        return provider.trim();
    }
}
export const credentialsController = new CredentialsController();
//# sourceMappingURL=credentials.controller.js.map