// src/domains/identity/controllers/identity.controller.ts
import jwt from "jsonwebtoken";
import { identityService } from "../services/identity.service.js";
import { createSessionToken, setSessionCookie, clearSessionCookie, } from "../../../infrastructure/auth/session.js";
import { getGoogleAuthorizationUrl, exchangeGoogleCode, } from "../../../infrastructure/auth/google.js";
import { authConfig } from "../../../config/auth.config.js";
/**
 * Temporary onboarding cookie configuration.
 *
 * This cookie contains a signed JWT representing the
 * server-verified Google identity.
 *
 * It must never contain the application's permanent
 * authentication session.
 */
const GOOGLE_ONBOARDING_COOKIE = "google_onboarding";
/**
 * Google onboarding state lifetime.
 *
 * Ten minutes is intentionally short because this cookie
 * exists only while the user completes account onboarding.
 */
const GOOGLE_ONBOARDING_MAX_AGE = 10 * 60 * 1000;
/**
 * Frontend URL used after OAuth completes.
 *
 * Configure FRONTEND_URL in the environment.
 *
 * Development fallback:
 *
 *   http://localhost:3000
 */
const frontendUrl = process.env.FRONTEND_URL ??
    "http://localhost:3000";
class IdentityController {
    constructor() {
        this.googleLogin =
            this.googleLogin.bind(this);
        this.googleCallback =
            this.googleCallback.bind(this);
        this.onboardingStatus =
            this.onboardingStatus.bind(this);
        this.createAccount =
            this.createAccount.bind(this);
        this.me =
            this.me.bind(this);
        this.deleteAccount =
            this.deleteAccount.bind(this);
        this.logout =
            this.logout.bind(this);
    }
    // ============================================================
    // Google OAuth
    // ============================================================
    /**
     * Start Google OAuth authentication.
     *
     * GET /api/v1/identity/login
     *
     * The browser does not provide any identity information.
     *
     * The backend generates the Google authorization URL and
     * redirects the browser to Google.
     */
    async googleLogin(_req, res) {
        try {
            const authorizationUrl = getGoogleAuthorizationUrl();
            res.redirect(authorizationUrl);
        }
        catch (error) {
            console.error("[IDENTITY] Failed to start Google OAuth:", error);
            res.status(500).json({
                success: false,
                error: "Failed to start Google authentication.",
            });
        }
    }
    /**
     * Handle Google's OAuth callback.
     *
     * GET /api/v1/identity/callback
     *
     * Flow:
     *
     * 1. Receive Google's authorization code.
     * 2. Exchange the code with Google.
     * 3. Verify Google's ID token.
     * 4. Obtain Google's stable `sub`.
     * 5. Look for an existing application account.
     *
     * Existing account:
     *
     *   Google → application session → frontend
     *
     * New account:
     *
     *   Google → signed onboarding cookie → frontend
     *
     * IMPORTANT:
     *
     * The browser never supplies oauthId.
     */
    async googleCallback(req, res) {
        try {
            const code = req.query.code;
            if (typeof code !== "string" ||
                !code.trim()) {
                res.status(400).json({
                    success: false,
                    error: "Google authorization code is required.",
                });
                return;
            }
            /*
             * Exchange Google's authorization code and verify
             * Google's ID token.
             *
             * `googleProfile.sub` is trusted only because
             * exchangeGoogleCode() successfully verified the
             * ID token against our Google OAuth client.
             */
            const googleProfile = await exchangeGoogleCode(code);
            /*
             * Check whether this verified Google identity
             * already has an application account.
             */
            try {
                const user = await identityService.login(googleProfile.sub, googleProfile.email);
                /*
                 * Existing account.
                 *
                 * Create the application's own session.
                 *
                 * The Google OAuth identity is NOT stored in the
                 * application session.
                 */
                const token = createSessionToken(user.id);
                setSessionCookie(res, token);
                /*
                 * No onboarding cookie should remain when the
                 * user already has an account.
                 */
                this.clearGoogleOnboardingCookie(res);
                res.redirect(`${frontendUrl}/`);
                return;
            }
            catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : "";
                /*
                 * Account not found is expected for a first-time
                 * Google user.
                 *
                 * Any other error should not be treated as a
                 * normal onboarding case.
                 */
                if (message !==
                    "Account not found.") {
                    throw error;
                }
            }
            /*
             * This is a verified Google identity for which
             * no application account exists yet.
             *
             * Create a short-lived signed onboarding token.
             *
             * IMPORTANT:
             *
             * The frontend does not receive the oauthId.
             *
             * The browser only receives an HttpOnly cookie.
             */
            const onboardingToken = this.createGoogleOnboardingToken({
                oauthId: googleProfile.sub,
                email: googleProfile.email ??
                    null,
                googleImage: googleProfile.picture ??
                    null,
            });
            this.setGoogleOnboardingCookie(res, onboardingToken);
            /*
             * Send the user to the frontend onboarding screen.
             *
             * The frontend can now ask for a username.
             *
             * It does NOT need to know the Google oauthId.
             */
            res.redirect(`${frontendUrl}/onboarding`);
        }
        catch (error) {
            console.error("[IDENTITY] Google OAuth callback failed:", error);
            res.status(500).json({
                success: false,
                error: "Google authentication failed.",
            });
        }
    }
    // ============================================================
    // Account / Onboarding
    // ============================================================
    /**
     * Check whether the browser has a valid temporary Google
     * onboarding session.
     */
    async onboardingStatus(req, res) {
        const onboardingToken = req.cookies?.[GOOGLE_ONBOARDING_COOKIE];
        if (typeof onboardingToken !== "string" ||
            !onboardingToken.trim()) {
            res.status(401).json({
                success: false,
                error: "Google onboarding session is missing or expired.",
            });
            return;
        }
        try {
            this.verifyGoogleOnboardingToken(onboardingToken);
            res.status(200).json({
                success: true,
                ready: true,
            });
        }
        catch {
            this.clearGoogleOnboardingCookie(res);
            res.status(401).json({
                success: false,
                error: "Google onboarding session is missing or expired.",
            });
        }
    }
    /**
     * Create a new application account.
     *
     * POST /api/v1/identity/account
     *
     * The browser supplies:
     *
     *   username
     *
     * The browser does NOT supply:
     *
     *   oauthId
     *   googleImage
     *
     * Those values come exclusively from the signed,
     * HttpOnly onboarding cookie created by googleCallback().
     */
    async createAccount(req, res) {
        try {
            /*
             * Recover the server-created Google onboarding state.
             */
            const onboardingToken = req.cookies?.[GOOGLE_ONBOARDING_COOKIE];
            if (typeof onboardingToken !== "string" ||
                !onboardingToken.trim()) {
                res.status(401).json({
                    success: false,
                    error: "Google onboarding session is missing or expired.",
                });
                return;
            }
            /*
             * Verify the signed onboarding token.
             *
             * The oauthId is therefore not coming from the
             * browser's request body.
             */
            const googleIdentity = this.verifyGoogleOnboardingToken(onboardingToken);
            /*
             * Username is the only user-controlled identity
             * field accepted from the frontend.
             */
            const { username } = req.body;
            if (typeof username !== "string" ||
                !username.trim()) {
                res.status(400).json({
                    success: false,
                    error: "Username is required.",
                });
                return;
            }
            /*
             * Create the application account using:
             *
             *   trusted Google identity
             *              +
             *   user-controlled username
             */
            const user = await identityService.createAccount({
                googleIdentity,
                username: username.trim(),
            });
            /*
             * Account creation succeeded.
             *
             * The temporary onboarding state is no longer
             * required.
             */
            this.clearGoogleOnboardingCookie(res);
            /*
             * Create the permanent application session.
             *
             * Only the internal application user ID enters
             * the session JWT.
             */
            const token = createSessionToken(user.id);
            setSessionCookie(res, token);
            res.status(201).json({
                success: true,
                user,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Failed to create account.";
            if (message ===
                "Google onboarding session is invalid or expired.") {
                this.clearGoogleOnboardingCookie(res);
                res.status(401).json({
                    success: false,
                    error: "Google onboarding session is invalid or expired.",
                });
                return;
            }
            if (message ===
                "An account already exists for this Google account.") {
                this.clearGoogleOnboardingCookie(res);
                res.status(409).json({
                    success: false,
                    error: message,
                });
                return;
            }
            if (message ===
                "Username is already taken.") {
                res.status(409).json({
                    success: false,
                    error: message,
                });
                return;
            }
            if (message ===
                "Account or username already exists.") {
                res.status(409).json({
                    success: false,
                    error: "An account or username already exists.",
                });
                return;
            }
            console.error("[IDENTITY] Account creation failed:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create account.",
            });
        }
    }
    // ============================================================
    // Authenticated Identity
    // ============================================================
    /**
     * Return the currently authenticated application user.
     *
     * GET /api/v1/identity/me
     *
     * Authentication comes exclusively from the application
     * HttpOnly session cookie.
     */
    async me(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: "Unauthorized.",
                });
                return;
            }
            const user = await identityService.getUserById(userId);
            res.status(200).json({
                success: true,
                user,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Failed to retrieve account.";
            if (message ===
                "Account not found.") {
                /*
                 * The session JWT may still be cryptographically
                 * valid, but its referenced account no longer exists.
                 *
                 * Remove the stale session.
                 */
                clearSessionCookie(res);
                res.status(401).json({
                    success: false,
                    error: "Unauthorized.",
                });
                return;
            }
            console.error("[IDENTITY] Failed to retrieve authenticated user:", error);
            res.status(500).json({
                success: false,
                error: "Failed to retrieve account.",
            });
        }
    }
    /**
     * Delete the currently authenticated user's account.
     *
     * The browser cannot choose which account to delete.
     *
     * The account ID comes exclusively from req.user,
     * populated by requireAuth.
     */
    async deleteAccount(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: "Unauthorized.",
                });
                return;
            }
            const result = await identityService.deleteAccount(userId);
            clearSessionCookie(res);
            res.status(200).json({
                success: true,
                message: "Account deleted successfully.",
                userId: result.userId,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Failed to delete account.";
            if (message ===
                "Account not found.") {
                clearSessionCookie(res);
                res.status(404).json({
                    success: false,
                    error: message,
                });
                return;
            }
            console.error("[IDENTITY] Account deletion failed:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete account.",
            });
        }
    }
    /**
     * Logout the current application session.
     *
     * The JWT is stored exclusively inside the HttpOnly
     * session cookie, therefore logout removes that cookie.
     */
    async logout(_req, res) {
        try {
            clearSessionCookie(res);
            res.status(200).json({
                success: true,
                message: "Logged out successfully.",
            });
        }
        catch (error) {
            console.error("[IDENTITY] Logout failed:", error);
            res.status(500).json({
                success: false,
                error: "Failed to logout.",
            });
        }
    }
    // ============================================================
    // Google Onboarding Token
    // ============================================================
    /**
     * Create a short-lived signed token containing the
     * server-verified Google identity.
     *
     * This is NOT the application session.
     */
    createGoogleOnboardingToken(identity) {
        const oauthId = identity.oauthId.trim();
        if (!oauthId) {
            throw new Error("Verified Google identity is required.");
        }
        return jwt.sign({
            oauthId,
            email: identity.email ??
                null,
            googleImage: identity.googleImage ??
                null,
        }, authConfig.jwt.secret, {
            algorithm: "HS256",
            expiresIn: "10m",
        });
    }
    /**
     * Verify the temporary Google onboarding token.
     *
     * The token must:
     *
     * - be correctly signed
     * - use HS256
     * - not be expired
     * - contain a valid oauthId
     */
    verifyGoogleOnboardingToken(token) {
        try {
            const decoded = jwt.verify(token, authConfig.jwt.secret, {
                algorithms: ["HS256"],
            });
            if (typeof decoded !== "object" ||
                decoded === null ||
                typeof decoded.oauthId !==
                    "string" ||
                !decoded.oauthId.trim()) {
                throw new Error("Invalid onboarding payload.");
            }
            let googleImage = null;
            let email = null;
            if (typeof decoded.email ===
                "string" &&
                decoded.email.trim()) {
                email = decoded.email.trim();
            }
            if (typeof decoded.googleImage ===
                "string" &&
                decoded.googleImage.trim()) {
                googleImage =
                    decoded.googleImage.trim();
            }
            return {
                oauthId: decoded.oauthId.trim(),
                email,
                googleImage,
            };
        }
        catch {
            throw new Error("Google onboarding session is invalid or expired.");
        }
    }
    /**
     * Store the temporary Google onboarding token
     * in an HttpOnly cookie.
     */
    setGoogleOnboardingCookie(res, token) {
        res.cookie(GOOGLE_ONBOARDING_COOKIE, token, {
            httpOnly: true,
            /*
             * HTTPS is required for secure cookies in production.
             */
            secure: process.env.NODE_ENV ===
                "production",
            /*
             * `lax` works for the normal development
             * localhost flow.
             *
             * Cross-site production deployments require
             * `none` together with `secure`.
             */
            sameSite: process.env.NODE_ENV ===
                "production"
                ? "none"
                : "lax",
            maxAge: GOOGLE_ONBOARDING_MAX_AGE,
            path: "/",
        });
    }
    /**
     * Remove the temporary Google onboarding cookie.
     */
    clearGoogleOnboardingCookie(res) {
        res.clearCookie(GOOGLE_ONBOARDING_COOKIE, {
            httpOnly: true,
            secure: process.env.NODE_ENV ===
                "production",
            sameSite: process.env.NODE_ENV ===
                "production"
                ? "none"
                : "lax",
            path: "/",
        });
    }
}
export const identityController = new IdentityController();
//# sourceMappingURL=identity.controller.js.map