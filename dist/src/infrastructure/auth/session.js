// src/auth/session.ts
import jwt from "jsonwebtoken";
import { authConfig } from "../../config/auth.config.js";
/**
 * Create a signed application session JWT.
 *
 * SECURITY:
 * - Contains only the internal application user ID.
 * - Never returned to the frontend.
 * - Never stored in localStorage/sessionStorage.
 * - Stored exclusively in the HttpOnly session cookie
 *   by setSessionCookie().
 */
export const createSessionToken = (userId) => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
        throw new Error("User ID is required to create a session.");
    }
    return jwt.sign({
        userId: normalizedUserId,
    }, authConfig.jwt.secret, {
        algorithm: "HS256",
        expiresIn: authConfig.jwt.expiresIn,
    });
};
/**
 * Store the session token in the HttpOnly session cookie.
 *
 * The JWT is intentionally inaccessible to browser JavaScript.
 */
export const setSessionCookie = (res, token) => {
    if (!token) {
        throw new Error("Session token is required.");
    }
    res.cookie(authConfig.cookie.name, token, authConfig.cookie.options);
};
/**
 * Remove the current application session.
 *
 * The same cookie identity and security attributes used
 * when setting the cookie are used when clearing it.
 */
export const clearSessionCookie = (res) => {
    const { httpOnly, secure, sameSite, path, } = authConfig.cookie.options;
    res.clearCookie(authConfig.cookie.name, {
        httpOnly,
        secure,
        sameSite,
        path,
    });
};
/**
 * Verify and decode an application session JWT.
 *
 * SECURITY:
 * - Only backend authentication code should call this.
 * - The accepted signing algorithm is explicitly restricted
 *   to HS256.
 * - The returned userId originates from a cryptographically
 *   verified JWT.
 */
export const verifySessionToken = (token) => {
    if (typeof token !== "string" ||
        !token.trim()) {
        throw new Error("Session token is required.");
    }
    const decoded = jwt.verify(token, authConfig.jwt.secret, {
        algorithms: ["HS256"],
    });
    if (typeof decoded !== "object" ||
        decoded === null ||
        typeof decoded.userId !== "string" ||
        !decoded.userId.trim()) {
        throw new Error("Invalid session payload.");
    }
    return {
        userId: decoded.userId.trim(),
    };
};
//# sourceMappingURL=session.js.map