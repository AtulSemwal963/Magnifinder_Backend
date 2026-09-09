// src/config/auth.config.ts
/**
 * JWT configuration
 */
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || !jwtSecret.trim()) {
    throw new Error("JWT_SECRET is not configured.");
}
/**
 * Give expiresIn a concrete, non-undefined value.
 *
 * Using the nullish fallback before assigning it to the
 * configuration object ensures session.ts receives a valid
 * SignOptions-compatible value.
 */
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
/**
 * Google OAuth configuration
 */
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
if (!googleClientId ||
    !googleClientId.trim()) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured.");
}
if (!googleClientSecret ||
    !googleClientSecret.trim()) {
    throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is not configured.");
}
if (!googleRedirectUri ||
    !googleRedirectUri.trim()) {
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI is not configured.");
}
/**
 * Session cookie configuration
 */
const isProduction = process.env.NODE_ENV === "production";
const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction
        ? "none"
        : "lax",
    maxAge: 7 *
        24 *
        60 *
        60 *
        1000,
    path: "/",
};
export const authConfig = {
    jwt: {
        secret: jwtSecret,
        expiresIn: jwtExpiresIn,
    },
    cookie: {
        name: "session",
        options: cookieOptions,
    },
    google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        redirectUri: googleRedirectUri,
    },
};
//# sourceMappingURL=auth.config.js.map