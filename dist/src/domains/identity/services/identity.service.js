// src/domains/identity/services/identity.service.ts
import { prisma } from "../../../lib/prisma.js";
class IdentityService {
    /**
     * Create a new application account.
     *
     * The Google identity must already have been verified by the
     * server-side OAuth layer before this method is called.
     *
     * This method does not perform Google authentication.
     * It only persists an identity that the authentication layer
     * has already established as trusted.
     */
    async createAccount(input) {
        const oauthId = input.googleIdentity.oauthId.trim();
        const username = input.username.trim();
        const email = input.googleIdentity.email?.trim() ||
            null;
        if (!oauthId) {
            throw new Error("Verified Google identity is required.");
        }
        if (!username) {
            throw new Error("Username is required.");
        }
        /*
         * Check whether this Google identity already belongs
         * to an application account.
         */
        const existingUser = await prisma.user.findUnique({
            where: {
                oauthId,
            },
            select: {
                id: true,
            },
        });
        if (existingUser) {
            throw new Error("An account already exists for this Google account.");
        }
        /*
         * Check username uniqueness before creation.
         *
         * The database should also have a UNIQUE constraint on
         * User.username. The database constraint remains the
         * final authority in case of concurrent requests.
         */
        const existingUsername = await prisma.user.findUnique({
            where: {
                username,
            },
            select: {
                id: true,
            },
        });
        if (existingUsername) {
            throw new Error("Username is already taken.");
        }
        try {
            const user = await prisma.user.create({
                data: {
                    oauthId,
                    username,
                    email,
                    googleImage: input.googleIdentity.googleImage ??
                        null,
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    googleImage: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return user;
        }
        catch (error) {
            /*
             * The pre-checks above are not sufficient by themselves
             * because two requests can race between the lookup and
             * create operations.
             *
             * Prisma/database uniqueness constraints therefore remain
             * the authoritative protection.
             */
            if (this.isPrismaUniqueConstraintError(error)) {
                throw new Error("Account or username already exists.");
            }
            throw error;
        }
    }
    /**
     * Find an existing application account from a verified
     * Google identity.
     *
     * This method is intended to be called by the server-side
     * OAuth callback after Google identity verification.
     *
     * The oauthId must therefore originate from the trusted
     * Google verification layer.
     */
    async login(oauthId, email) {
        const normalizedOauthId = oauthId.trim();
        if (!normalizedOauthId) {
            throw new Error("Verified Google identity is required.");
        }
        const user = await prisma.user.findUnique({
            where: {
                oauthId: normalizedOauthId,
            },
            select: {
                id: true,
                username: true,
                email: true,
                googleImage: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user) {
            throw new Error("Account not found.");
        }
        const normalizedEmail = email?.trim();
        if (!user.email && normalizedEmail) {
            return prisma.user.update({
                where: {
                    id: user.id,
                },
                data: {
                    email: normalizedEmail,
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    googleImage: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }
        return user;
    }
    /**
     * Find an application user by internal database ID.
     *
     * This is the identity lookup used by the normal
     * authenticated application flow.
     *
     * The ID originates from:
     *
     *   HttpOnly session cookie
     *          ↓
     *   verifySessionToken()
     *          ↓
     *   req.user.id
     */
    async getUserById(userId) {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            throw new Error("Invalid user ID.");
        }
        const user = await prisma.user.findUnique({
            where: {
                id: normalizedUserId,
            },
            select: {
                id: true,
                username: true,
                email: true,
                googleImage: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user) {
            throw new Error("Account not found.");
        }
        return user;
    }
    /**
     * Delete an application account by its internal user ID.
     *
     * The caller is responsible for obtaining this ID from
     * the authenticated request context.
     *
     * No OAuth identity or browser-supplied account identifier
     * is involved.
     */
    async deleteAccount(userId) {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            throw new Error("Invalid user ID.");
        }
        const user = await prisma.user.findUnique({
            where: {
                id: normalizedUserId,
            },
            select: {
                id: true,
            },
        });
        if (!user) {
            throw new Error("Account not found.");
        }
        await prisma.user.delete({
            where: {
                id: normalizedUserId,
            },
        });
        return {
            userId: user.id,
        };
    }
    /**
     * Detect Prisma unique-constraint violations without
     * coupling the rest of the service to Prisma error handling.
     */
    isPrismaUniqueConstraintError(error) {
        if (!error ||
            typeof error !== "object") {
            return false;
        }
        return ("code" in error &&
            error.code === "P2002");
    }
}
export const identityService = new IdentityService();
//# sourceMappingURL=identity.service.js.map