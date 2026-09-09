// src/domains/chat/routes/chat.routes.ts
import { Router } from "express";
import { chatController, } from "../controllers/chat.controller.js";
import { requireAuth, } from "../../../middleware/auth.middleware.js";
const router = Router();
// ============================================================
// AUTHENTICATION
// ============================================================
//
// Every Chat-domain endpoint requires an authenticated
// session.
//
// requireAuth:
// - validates the session cookie
// - resolves the authenticated user
// - populates req.user.id
//
// Therefore no individual route needs to repeat
// requireAuth.
//
router.use(requireAuth);
// ============================================================
// CHAT CRUD
// ============================================================
/**
 * POST /api/v1/chat
 *
 * Create a new chat.
 *
 * Client provides only:
 *
 * {
 *   name: string
 * }
 *
 * The authenticated user is determined from req.user.
 */
router.post("/", (req, res, next) => {
    return chatController.createChat(req, res, next);
});
/**
 * GET /api/v1/chat
 *
 * Retrieve the authenticated user's chat list.
 *
 * Used by the sidebar/recent-chat UI.
 */
router.get("/", (req, res, next) => {
    return chatController.getChats(req, res, next);
});
/**
 * GET /api/v1/chat/:chatId/history
 *
 * Retrieve a chat with hydrated lead-generation history.
 */
router.get("/:chatId/history", (req, res, next) => {
    return chatController.getChatHistory(req, res, next);
});
// ============================================================
// LEAD EXPORT
// ============================================================
/**
 * GET /api/v1/chat/:chatId/export
 *
 * Stream all leads belonging to a search as an XLSX file.
 *
 * The authenticated user is resolved by requireAuth.
 *
 * The controller:
 *
 * - resolves the authenticated user
 * - validates chatId and chat ownership
 * - sets XLSX download headers
 * - passes the HTTP response stream to the export service
 *
 * The XLSX file is streamed directly to the browser.
 *
 * No:
 *
 * - cloud storage
 * - temporary file
 * - complete XLSX buffer
 *
 * is required.
 */
router.get("/:chatId/export", (req, res, next) => {
    return chatController.exportLeads(req, res, next);
});
// ============================================================
// CHAT BY ID
// ============================================================
/**
 * GET /api/v1/chat/:chatId
 *
 * Retrieve one chat belonging to the authenticated user.
 */
router.get("/:chatId", (req, res, next) => {
    return chatController.getChat(req, res, next);
});
/**
 * PATCH /api/v1/chat/:chatId
 *
 * Update an existing chat.
 *
 * This can persist:
 *
 * - chat name
 * - product description
 * - ICP description
 * - messages
 * - engine configuration
 *
 * API credentials are never accepted.
 */
router.patch("/:chatId", (req, res, next) => {
    return chatController.updateChat(req, res, next);
});
/**
 * DELETE /api/v1/chat/:chatId
 *
 * Delete a chat belonging to the authenticated user.
 */
router.delete("/:chatId", (req, res, next) => {
    return chatController.deleteChat(req, res, next);
});
// ============================================================
// LEAD GENERATION
// ============================================================
/**
 * POST /api/v1/chat/:chatId/leads
 *
 * Generate leads for an existing chat.
 *
 * Client provides only:
 *
 * {
 *   count: number
 * }
 *
 * Server resolves/packages:
 *
 * - product description from the chat
 * - ICP description from the chat
 * - LLM model from user credentials
 * - LLM API key from user credentials
 * - BetterContact API key from user credentials
 * - operator email from the authenticated user's account
 * - country
 * - legal-notice acceptance
 * - campaign ID
 *
 * No credentials or runtime configuration are accepted
 * from the client.
 */
router.post("/:chatId/leads", (req, res, next) => {
    return chatController.generateLeads(req, res, next);
});
export default router;
//# sourceMappingURL=chat.routes.js.map