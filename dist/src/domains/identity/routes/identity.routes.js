// src/domains/identity/routes/identity.routes.ts
import { Router } from "express";
import { identityController } from "../controllers/identity.controller.js";
import { requireAuth } from "../../../middleware/auth.middleware.js";
const router = Router();
// ============================================================
// Public / Google OAuth Routes
// ============================================================
/**
 * Start Google OAuth authentication.
 *
 * GET /api/v1/identity/login
 *
 * The backend generates the Google authorization URL and
 * redirects the browser to Google.
 *
 * No identity information is accepted from the browser.
 */
router.get("/login", identityController.googleLogin);
/**
 * Google OAuth callback.
 *
 * GET /api/v1/identity/callback
 *
 * Google redirects the browser here after authentication.
 *
 * The backend:
 *
 * 1. Receives Google's authorization code.
 * 2. Exchanges the code with Google.
 * 3. Verifies Google's ID token.
 * 4. Establishes the verified Google identity server-side.
 * 5. Determines whether the application account exists.
 * 6. Creates the application session for an existing user.
 * 7. Starts secure onboarding state for a new user.
 *
 * The browser never supplies oauthId.
 */
router.get("/callback", identityController.googleCallback);
router.get("/onboarding/status", identityController.onboardingStatus);
// ============================================================
// Account / Onboarding Routes
// ============================================================
/**
 * Complete creation of a new application account.
 *
 * The browser supplies only user-controlled onboarding data,
 * such as username.
 *
 * The verified Google identity must come from server-controlled
 * OAuth onboarding state established during the callback.
 */
router.post("/account", identityController.createAccount);
// ============================================================
// Authenticated Identity Routes
// ============================================================
/**
 * Return the currently authenticated application user.
 *
 * GET /api/v1/identity/me
 *
 * Authentication comes exclusively from the HttpOnly
 * application session cookie.
 */
router.get("/me", requireAuth, identityController.me);
/**
 * Logout the current application session.
 *
 * Authentication comes from the HttpOnly session cookie.
 */
router.post("/logout", requireAuth, identityController.logout);
/**
 * Permanently delete the authenticated user's account.
 *
 * The account ID comes exclusively from req.user,
 * populated by requireAuth after verifying the session.
 */
router.delete("/account", requireAuth, identityController.deleteAccount);
export default router;
//# sourceMappingURL=identity.routes.js.map