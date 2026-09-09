// src/auth/google.ts
import { OAuth2Client } from "google-auth-library";
import { authConfig } from "../../config/auth.config.js";
const googleClient = new OAuth2Client(authConfig.google.clientId, authConfig.google.clientSecret, authConfig.google.redirectUri);
/**
 * Generate the Google OAuth authorization URL.
 *
 * The browser is redirected to Google.
 *
 * No application identity or session token is stored
 * in localStorage, sessionStorage, or the URL by our
 * application.
 */
export const getGoogleAuthorizationUrl = () => {
    return googleClient.generateAuthUrl({
        /*
         * We only need Google authentication/identity.
         * A Google refresh token is not required because we are
         * not using this OAuth flow to call Google APIs on behalf
         * of the user.
         */
        access_type: "online",
        /*
         * Force the Google account-selection screen.
         */
        prompt: "select_account",
        scope: [
            "openid",
            "email",
            "profile",
        ],
    });
};
/**
 * Exchange a Google authorization code for Google's ID token
 * and cryptographically verify the resulting identity.
 *
 * IMPORTANT:
 *
 * The authorization code must originate from the Google OAuth
 * callback.
 *
 * The resulting Google `sub` is trusted only after
 * verifyIdToken() succeeds.
 */
export const exchangeGoogleCode = async (code) => {
    if (typeof code !== "string" ||
        !code.trim()) {
        throw new Error("Google authorization code is required.");
    }
    /*
     * Exchange the short-lived authorization code with Google.
     *
     * The authorization code itself is never persisted as
     * application identity.
     */
    const { tokens } = await googleClient.getToken(code.trim());
    if (!tokens.id_token) {
        throw new Error("Google did not return an ID token.");
    }
    /*
     * Google verifies the ID token signature and validates
     * the token against our configured OAuth client.
     *
     * The audience check prevents an ID token issued for a
     * different Google OAuth client from being accepted.
     */
    const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: authConfig.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload) {
        throw new Error("Google returned an invalid identity payload.");
    }
    /*
     * `sub` is Google's stable unique identifier for this
     * Google account.
     *
     * It becomes trusted application identity only after
     * successful ID-token verification above.
     */
    if (typeof payload.sub !== "string" ||
        !payload.sub.trim()) {
        throw new Error("Invalid Google identity payload.");
    }
    const profile = {
        sub: payload.sub.trim(),
    };
    /*
     * These fields are informational profile data.
     *
     * They are optional because Google's verified payload
     * does not guarantee that every field is present.
     */
    if (typeof payload.email === "string" &&
        payload.email.trim()) {
        profile.email = payload.email;
    }
    if (typeof payload.name === "string" &&
        payload.name.trim()) {
        profile.name = payload.name;
    }
    if (typeof payload.picture === "string" &&
        payload.picture.trim()) {
        profile.picture = payload.picture;
    }
    return profile;
};
//# sourceMappingURL=google.js.map