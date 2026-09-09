// src/domains/chat/controllers/chat.controller.ts
import { randomBytes, } from "node:crypto";
import { chatService, } from "../services/chat.service.js";
import { leadExportService, } from "../services/lead-export.service.js";
/**
 * HTTP controller for the Chat domain.
 *
 * Responsibility:
 *
 * - receive HTTP requests
 * - extract authenticated user identity
 * - extract route/body parameters
 * - delegate application work to ChatService
 * - return HTTP responses
 * - forward errors to Express
 *
 * The controller does NOT:
 *
 * - access credentials directly
 * - decrypt API keys
 * - accept API keys from the client
 * - execute OpenOutFind
 * - construct OpenOutFind runtime configuration
 * - access Prisma directly
 * - contain chat business logic
 */
export class ChatController {
    // ============================================================
    // CREATE CHAT
    // ============================================================
    /**
     * POST /api/v1/chats
     */
    async createChat(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const input = req.body;
            const chat = await chatService.createChat(userId, input);
            res
                .status(201)
                .json({
                chat,
            });
        }
        catch (error) {
            next(error);
        }
    }
    // ============================================================
    // GET CHAT
    // ============================================================
    /**
     * GET /api/v1/chats/:chatId
     *
     * Retrieve the raw persisted chat belonging to the
     * authenticated user.
     */
    async getChat(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const chatId = this.getChatId(req);
            const chat = await chatService.getChat(userId, chatId);
            if (!chat) {
                res
                    .status(404)
                    .json({
                    error: "Chat not found.",
                });
                return;
            }
            res
                .status(200)
                .json({
                chat,
            });
        }
        catch (error) {
            next(error);
        }
    }
    // ============================================================
    // GET CHAT HISTORY
    // ============================================================
    /**
     * GET /api/v1/chats/:chatId/history
     *
     * Retrieve the complete chat history.
     *
     * Unlike getChat(), this endpoint hydrates every
     * lead-generation message with the persisted leads
     * belonging to its searchId.
     *
     * Example:
     *
     * {
     *   "id": "...",
     *   "name": "Axiorem",
     *   "messages": [
     *     {
     *       "id": "...",
     *       "role": "assistant",
     *       "type": "lead_generation",
     *       "content": "Found 20 leads.",
     *       "searchId": "...",
     *       "count": 20,
     *       "createdAt": "...",
     *       "leads": [
     *         {
     *           "id": "...",
     *           "firstName": "...",
     *           "lastName": "...",
     *           "company": "...",
     *           "title": "...",
     *           "linkedinUrl": "..."
     *         }
     *       ]
     *     }
     *   ]
     * }
     */
    async getChatHistory(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const chatId = this.getChatId(req);
            const history = await chatService.getChatHistory(userId, chatId);
            if (!history) {
                res
                    .status(404)
                    .json({
                    error: "Chat not found.",
                });
                return;
            }
            res
                .status(200)
                .json({
                history,
            });
        }
        catch (error) {
            next(error);
        }
    }
    // ============================================================
    // LIST CHATS
    // ============================================================
    /**
     * GET /api/v1/chats
     *
     * Retrieve the authenticated user's chats.
     *
     * Intended for the sidebar/recent-chat list.
     */
    async getChats(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const chats = await chatService.getChats(userId);
            res
                .status(200)
                .json({
                chats,
            });
        }
        catch (error) {
            next(error);
        }
    }
    // ============================================================
    // UPDATE CHAT
    // ============================================================
    /**
     * PATCH /api/v1/chats/:chatId
     */
    async updateChat(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const chatId = this.getChatId(req);
            const input = req.body;
            const chat = await chatService.updateChat(userId, chatId, input);
            res
                .status(200)
                .json({
                chat,
            });
        }
        catch (error) {
            next(error);
        }
    }
    // ============================================================
    // DELETE CHAT
    // ============================================================
    /**
     * DELETE /api/v1/chats/:chatId
     */
    async deleteChat(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const chatId = this.getChatId(req);
            await chatService.deleteChat(userId, chatId);
            res
                .status(204)
                .send();
        }
        catch (error) {
            next(error);
        }
    }
    // ============================================================
    // GENERATE LEADS
    // ============================================================
    /**
     * POST /api/v1/chats/:chatId/leads
     *
     * Generate leads for an existing chat.
     *
     * The client provides:
     *
     * - count
     *
     * The service resolves:
     *
     * - product documentation
     * - ICP
     * - LLM credentials
     * - BetterContact credentials
     * - operator email
     * - runtime configuration
     * - campaign ID
     */
    async generateLeads(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const chatId = this.getChatId(req);
            const input = req.body;
            const result = await chatService.generateLeads(userId, chatId, input);
            res
                .status(200)
                .json(result);
        }
        catch (error) {
            next(error);
        }
    }
    // ============================================================
    // AUTHENTICATED USER
    // ============================================================
    /**
     * Extract the authenticated user's ID.
     *
     * The user ID is NEVER accepted from:
     *
     * - req.body
     * - req.query
     * - req.params
     *
     * It comes exclusively from authentication middleware.
     */
    getUserId(req) {
        const userId = req.user?.id;
        if (typeof userId !== "string" ||
            !userId.trim()) {
            throw new Error("Authenticated user is required.");
        }
        return userId;
    }
    // ============================================================
    // CHAT ID
    // ============================================================
    /**
     * Extract and validate the chat ID from
     * the route parameter.
     */
    getChatId(req) {
        const chatId = req.params.chatId;
        if (typeof chatId !== "string" ||
            !chatId.trim()) {
            throw new Error("Chat ID is required.");
        }
        return chatId.trim();
    }
    // ============================================================
    // EXPORT LEADS
    // ============================================================
    /**
     * GET /api/v1/chat/:chatId/export
     *
     * Export all leads belonging to a search as a streamed XLSX
     * download.
     *
     * The controller does NOT:
     *
     * - retrieve leads directly
     * - access Prisma
     * - construct Excel workbooks
     * - format Excel cells
     * - buffer the generated file
     *
     * It only:
     *
     * - authenticates the request
     * - extracts route parameters
     * - configures the HTTP response
     * - delegates the export to LeadExportService
     */
    async exportLeads(req, res, next) {
        try {
            const userId = this.getUserId(req);
            const chatId = this.getChatId(req);
            const chat = await chatService.getChat(userId, chatId);
            if (!chat) {
                res
                    .status(404)
                    .json({
                    error: "Chat not found.",
                });
                return;
            }
            /*
             * Configure the response BEFORE starting the XLSX
             * stream. Once the workbook starts writing, headers
             * may already have been sent.
             */
            res.status(200);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename="${this.createExportFileName(chat.name)}"`);
            /*
             * Delegate the actual export.
             *
             * The service retrieves the leads and passes them to
             * the streaming XLSX infrastructure.
             *
             * Express's Response implements Node's Writable
             * interface, so it can be passed directly.
             */
            await leadExportService.exportChatLeads(chatId, res);
        }
        catch (error) {
            /*
             * If the response has already started streaming, Express
             * cannot safely replace it with a JSON error response.
             */
            if (res.headersSent) {
                res.end();
                return;
            }
            next(error);
        }
    }
    /**
     * Create a filesystem-safe, unique filename for a lead export.
     */
    createExportFileName(chatName) {
        const safeChatName = chatName
            .trim()
            .replace(/[^a-zA-Z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80) ||
            "Search";
        const randomSuffix = randomBytes(6).toString("hex");
        return `Magnifinder_${safeChatName}_leads_${randomSuffix}.xlsx`;
    }
}
export const chatController = new ChatController();
//# sourceMappingURL=chat.controller.js.map