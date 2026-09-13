// src/domains/chat/services/chat.service.ts
import { randomUUID, } from "node:crypto";
import { prisma, } from "../../../lib/prisma.js";
import { openOutFindClient, } from "../../../infrastructure/fetch-leads/index.js";
import { credentialsService, } from "../../credentials/services/credentials.service.js";
import { chatRepository, } from "../repositories/chat.repository.js";
import { searchRepository, } from "../repositories/search.repository.js";
import { leadRepository, } from "../repositories/lead.repository.js";
// ============================================================
// Chat Service
// ============================================================
export class ChatService {
    // ==========================================================
    // CREATE
    // ==========================================================
    async createChat(userId, input) {
        this.validateUserId(userId);
        const name = this.validateRequiredString(input.name, "Chat name");
        const data = {
            userId,
            name,
        };
        return chatRepository.create(data);
    }
    // ==========================================================
    // READ ONE
    // ==========================================================
    async getChat(userId, chatId) {
        this.validateUserId(userId);
        this.validateChatId(chatId);
        return chatRepository.findByIdAndUserId(chatId, userId);
    }
    // ==========================================================
    // READ CHAT HISTORY
    // ==========================================================
    /**
     * Return the complete chat history with persisted leads
     * attached to their corresponding lead-generation messages.
     *
     * Database:
     *
     * Chat.messages
     *      ↓
     *   searchId
     *      ↓
     * Lead.searchId
     *
     * API:
     *
     * Chat.messages
     *      ↓
     * lead_generation
     *      ├── searchId
     *      └── leads[]
     */
    async getChatHistory(userId, chatId) {
        this.validateUserId(userId);
        this.validateChatId(chatId);
        // --------------------------------------------------------
        // Load chat
        // --------------------------------------------------------
        const chat = await chatRepository.findByIdAndUserId(chatId, userId);
        if (!chat) {
            return null;
        }
        // --------------------------------------------------------
        // Normalize stored messages
        // --------------------------------------------------------
        const storedMessages = Array.isArray(chat.messages)
            ? chat.messages
            : [];
        // --------------------------------------------------------
        // Extract search IDs
        // --------------------------------------------------------
        const searchIds = [];
        for (const message of storedMessages) {
            if (!this.isJsonObject(message)) {
                continue;
            }
            if (message.type !==
                "lead_generation") {
                continue;
            }
            if (typeof message.searchId !==
                "string") {
                continue;
            }
            searchIds.push(message.searchId);
        }
        // --------------------------------------------------------
        // Deduplicate search IDs
        // --------------------------------------------------------
        const uniqueSearchIds = [...new Set(searchIds)];
        // --------------------------------------------------------
        // Fetch leads
        // --------------------------------------------------------
        const leadResults = await Promise.all(uniqueSearchIds.map(async (searchId) => {
            const leads = await leadRepository.findManyBySearchId(searchId);
            return {
                searchId,
                leads,
            };
        }));
        // --------------------------------------------------------
        // Build searchId -> Lead[] lookup
        // --------------------------------------------------------
        const leadsBySearchId = new Map();
        for (const result of leadResults) {
            leadsBySearchId.set(result.searchId, result.leads);
        }
        // --------------------------------------------------------
        // Hydrate messages
        // --------------------------------------------------------
        const hydratedMessages = [];
        for (const message of storedMessages) {
            // ------------------------------------------------------
            // Ignore invalid JSON values.
            //
            // Chat history messages are expected to be objects.
            // This prevents primitives/null/arrays from leaking
            // into the typed API response.
            // ------------------------------------------------------
            if (!this.isJsonObject(message)) {
                continue;
            }
            // ------------------------------------------------------
            // Normal message
            // ------------------------------------------------------
            if (message.type !==
                "lead_generation" ||
                typeof message.searchId !==
                    "string") {
                hydratedMessages.push(message);
                continue;
            }
            // ------------------------------------------------------
            // Lead-generation message
            // ------------------------------------------------------
            const searchId = message.searchId;
            const leads = leadsBySearchId.get(searchId) ?? [];
            /**
             * We explicitly construct the object instead of
             * spreading `message`.
             *
             * This gives TypeScript a concrete guarantee that
             * every required field in LeadGenerationHistoryMessage
             * exists with the correct type.
             */
            const hydratedMessage = {
                id: typeof message.id ===
                    "string"
                    ? message.id
                    : randomUUID(),
                role: typeof message.role ===
                    "string"
                    ? message.role
                    : "assistant",
                type: "lead_generation",
                content: typeof message.content ===
                    "string"
                    ? message.content
                    : "",
                searchId,
                count: typeof message.count ===
                    "number"
                    ? message.count
                    : leads.length,
                createdAt: typeof message.createdAt ===
                    "string"
                    ? message.createdAt
                    : new Date().toISOString(),
                leads,
            };
            hydratedMessages.push(hydratedMessage);
        }
        // --------------------------------------------------------
        // Return hydrated history
        // --------------------------------------------------------
        return {
            id: chat.id,
            name: chat.name,
            userId: chat.userId,
            productDescription: chat.productDescription,
            icpDescription: chat.icpDescription,
            engineConfig: chat.engineConfig,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            messages: hydratedMessages,
        };
    }
    // ==========================================================
    // READ MANY
    // ==========================================================
    async getChats(userId) {
        this.validateUserId(userId);
        return chatRepository.findManyByUserId(userId);
    }
    // ==========================================================
    // UPDATE
    // ==========================================================
    async updateChat(userId, chatId, input) {
        this.validateUserId(userId);
        this.validateChatId(chatId);
        const data = {};
        if (input.name !==
            undefined) {
            data.name =
                this.validateRequiredString(input.name, "Chat name");
        }
        if (input.productDescription !==
            undefined) {
            data.productDescription =
                this.validateRequiredString(input.productDescription, "Product description");
        }
        if (input.icpDescription !==
            undefined) {
            data.icpDescription =
                this.validateRequiredString(input.icpDescription, "ICP description");
        }
        if (input.messages !==
            undefined) {
            data.messages =
                input.messages;
        }
        if (input.engineConfig !==
            undefined) {
            data.engineConfig =
                input.engineConfig;
        }
        if (Object.keys(data).length ===
            0) {
            throw new Error("At least one chat field must be provided.");
        }
        return chatRepository.updateByIdAndUserId(chatId, userId, data);
    }
    // ==========================================================
    // DELETE
    // ==========================================================
    async deleteChat(userId, chatId) {
        this.validateUserId(userId);
        this.validateChatId(chatId);
        await chatRepository.deleteByIdAndUserId(chatId, userId);
    }
    // ==========================================================
    // GENERATE LEADS
    // ==========================================================
    /**
     * Generate and persist a lead search.
     *
     * Persistence lifecycle:
     *
     * Chat
     *   ↓
     * Search(status = running)
     *   ↓
     * OpenOutFind
     *   ↓
     * Lead[]
     *   ↓
     * Search(status = completed)
     *   ↓
     * Chat.messages updated
     */
    async generateLeads(userId, chatId, request) {
        this.validateUserId(userId);
        this.validateChatId(chatId);
        this.validateLeadCount(request.count);
        // --------------------------------------------------------
        // Load chat
        // --------------------------------------------------------
        const chat = await chatRepository.findByIdAndUserId(chatId, userId);
        if (!chat) {
            throw new Error("Chat not found.");
        }
        // --------------------------------------------------------
        // Resolve product documentation
        // --------------------------------------------------------
        const productDocs = chat.productDescription?.trim();
        if (!productDocs) {
            throw new Error("Product description is required before generating leads.");
        }
        // --------------------------------------------------------
        // Resolve campaign target
        // --------------------------------------------------------
        const campaignTarget = chat.icpDescription?.trim();
        if (!campaignTarget) {
            throw new Error("ICP description is required before generating leads.");
        }
        // --------------------------------------------------------
        // Resolve LLM credentials
        // --------------------------------------------------------
        const llmCredential = await credentialsService.getDecryptedCredential(userId, "llm");
        if (!llmCredential) {
            throw new Error("LLM credentials are not configured.");
        }
        if (!llmCredential.modelName?.trim()) {
            throw new Error("LLM model name is not configured.");
        }
        if (!llmCredential.apiKey?.trim()) {
            throw new Error("LLM API key is not configured.");
        }
        // --------------------------------------------------------
        // Resolve application-level BetterContact credentials
        // --------------------------------------------------------
        const betterContactApiKey = process.env.BETTERCONTACT_API_KEY;
        if (!betterContactApiKey?.trim()) {
            throw new Error("BetterContact API key is not configured.");
        }
        // --------------------------------------------------------
        // Resolve authenticated user's email
        // --------------------------------------------------------
        const user = await prisma.user.findUnique({
            where: {
                id: userId,
            },
            select: {
                email: true,
            },
        });
        if (!user) {
            throw new Error("Authenticated user not found.");
        }
        if (!user.email?.trim()) {
            throw new Error("A valid operator email is required before generating leads.");
        }
        // --------------------------------------------------------
        // Construct OpenOutFind credentials
        // --------------------------------------------------------
        const credentials = {
            aiModel: llmCredential.modelName.trim(),
            llmApiKey: llmCredential.apiKey,
            betterContactApiKey: betterContactApiKey.trim(),
            operatorEmail: user.email.trim(),
        };
        // --------------------------------------------------------
        // Application-controlled runtime
        // --------------------------------------------------------
        const runtime = {
            country: "IN",
            acceptLegalNotice: true,
        };
        // --------------------------------------------------------
        // Create isolated campaign ID
        // --------------------------------------------------------
        const campaignId = this.createCampaignId(chatId);
        // --------------------------------------------------------
        // CREATE SEARCH RECORD
        // --------------------------------------------------------
        const search = await searchRepository.create({
            chatId,
            productDescription: productDocs,
            campaignTarget: campaignTarget,
            status: "running",
        });
        try {
            // ------------------------------------------------------
            // Construct OpenOutFind input
            // ------------------------------------------------------
            const input = {
                campaignId,
                productDocs,
                campaignTarget,
                count: request.count,
                credentials,
                runtime,
            };
            // ------------------------------------------------------
            // Execute OpenOutFind
            // ------------------------------------------------------
            const result = await openOutFindClient.findLeads(input);
            // ------------------------------------------------------
            // Persist returned leads
            // ------------------------------------------------------
            if (result.leads.length >
                0) {
                await leadRepository.createMany({
                    searchId: search.id,
                    leads: result.leads,
                });
            }
            // ------------------------------------------------------
            // Mark search completed
            // ------------------------------------------------------
            await searchRepository.updateStatus(search.id, "completed");
            // ------------------------------------------------------
            // Persist generation result into Chat.messages
            // ------------------------------------------------------
            const existingMessages = Array.isArray(chat.messages)
                ? chat.messages
                : [];
            const generationMessage = {
                id: randomUUID(),
                role: "assistant",
                type: "lead_generation",
                content: `Found ${result.count} leads.`,
                searchId: search.id,
                count: result.count,
                createdAt: new Date().toISOString(),
            };
            const updatedMessages = [
                ...existingMessages,
                generationMessage,
            ];
            await chatRepository.updateByIdAndUserId(chatId, userId, {
                messages: updatedMessages,
            });
            // ------------------------------------------------------
            // Return application response
            // ------------------------------------------------------
            return {
                count: result.count,
                leads: result.leads,
                searchId: search.id,
            };
        }
        catch (error) {
            // ------------------------------------------------------
            // Mark search as failed
            // ------------------------------------------------------
            try {
                await searchRepository.updateStatus(search.id, "failed");
            }
            catch (persistenceError) {
                console.error("Failed to mark search as failed:", persistenceError);
            }
            throw error;
        }
    }
    // ==========================================================
    // INTERNAL HELPERS
    // ==========================================================
    createCampaignId(chatId) {
        return [
            "chat",
            chatId,
            Date.now().toString(),
            randomUUID(),
        ].join("-");
    }
    validateUserId(userId) {
        if (typeof userId !==
            "string" ||
            !userId.trim()) {
            throw new Error("Authenticated user is required.");
        }
    }
    validateChatId(chatId) {
        if (typeof chatId !==
            "string" ||
            !chatId.trim()) {
            throw new Error("Chat ID is required.");
        }
    }
    validateRequiredString(value, fieldName) {
        if (typeof value !==
            "string") {
            throw new Error(`${fieldName} is required.`);
        }
        const normalized = value.trim();
        if (!normalized) {
            throw new Error(`${fieldName} cannot be empty.`);
        }
        return normalized;
    }
    validateLeadCount(count) {
        if (!Number.isInteger(count) ||
            count <= 0) {
            throw new Error("Lead count must be a positive integer.");
        }
        if (count > 20) {
            throw new Error("Lead count cannot exceed 20.");
        }
    }
    /**
     * Runtime type guard for Prisma JSON objects.
     *
     * This deliberately excludes:
     * - null
     * - arrays
     * - strings
     * - numbers
     * - booleans
     */
    isJsonObject(value) {
        return (typeof value ===
            "object" &&
            value !== null &&
            !Array.isArray(value));
    }
}
// ============================================================
// Singleton
// ============================================================
export const chatService = new ChatService();
//# sourceMappingURL=chat.service.js.map