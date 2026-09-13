
// src/domains/chat/services/chat.service.ts

import {
  randomUUID,
} from "node:crypto";

import type {
  Chat,
  Lead,
  Prisma,
} from "../../../generated/prisma/client.js";

import {
  prisma,
} from "../../../lib/prisma.js";

import {
  openOutFindClient,
  type FetchLeadsResult,
  type FetchLeadsInput,
  type OpenOutFindCredentials,
  type OpenOutFindRuntimeOptions,
} from "../../../infrastructure/fetch-leads/index.js";

import {
  credentialsService,
} from "../../credentials/services/credentials.service.js";

import {
  chatRepository,
} from "../repositories/chat.repository.js";

import {
  searchRepository,
} from "../repositories/search.repository.js";

import {
  leadRepository,
} from "../repositories/lead.repository.js";

import type {
  CreateChatData,
  UpdateChatData,
} from "../repositories/chat.repository.js";

// ============================================================
// Request Types
// ============================================================

export interface CreateChatRequest {
  name: string;
}

export interface UpdateChatRequest {
  name?: string;
  productDescription?: string;
  icpDescription?: string;
  messages?: Chat["messages"];
  engineConfig?: Prisma.InputJsonValue | null;
}

export interface GenerateLeadsRequest {
  count: number;
  runtime: OpenOutFindRuntimeOptions;
}

// ============================================================
// Response Types
// ============================================================

export interface GenerateLeadsResponse {
  count: number;
  leads: FetchLeadsResult["leads"];
  searchId: string;
}

// ============================================================
// Chat History Types
// ============================================================

/**
 * A normal JSON chat message.
 *
 * We intentionally keep this as Prisma.JsonObject rather
 * than inventing a stricter schema for messages that the
 * chat domain does not currently control.
 */
export type NormalChatHistoryMessage =
  Prisma.JsonObject;

/**
 * A lead-generation message after hydration.
 *
 * The database stores the searchId.
 * The service resolves that searchId into the persisted
 * Lead records before returning the history.
 */
export interface LeadGenerationHistoryMessage {
  id: string;
  role: string;
  type: "lead_generation";
  content: string;
  searchId: string;
  count: number;
  createdAt: string;
  leads: Lead[];
}

/**
 * The only two message shapes that the history API returns.
 */
export type ChatHistoryMessage =
  | NormalChatHistoryMessage
  | LeadGenerationHistoryMessage;

/**
 * Chat history returned to the frontend.
 */
export interface ChatHistoryResponse {
  id: string;
  name: string;
  userId: string;
  productDescription: string | null;
  icpDescription: string | null;
  engineConfig: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatHistoryMessage[];
}

// ============================================================
// Chat Service
// ============================================================

export class ChatService {
  // ==========================================================
  // CREATE
  // ==========================================================

  async createChat(
    userId: string,
    input: CreateChatRequest
  ): Promise<Chat> {
    this.validateUserId(userId);

    const name =
      this.validateRequiredString(
        input.name,
        "Chat name"
      );

    const data: CreateChatData = {
      userId,
      name,
    };

    return chatRepository.create(data);
  }

  // ==========================================================
  // READ ONE
  // ==========================================================

  async getChat(
    userId: string,
    chatId: string
  ): Promise<Chat | null> {
    this.validateUserId(userId);
    this.validateChatId(chatId);

    return chatRepository.findByIdAndUserId(
      chatId,
      userId
    );
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
  async getChatHistory(
    userId: string,
    chatId: string
  ): Promise<ChatHistoryResponse | null> {
    this.validateUserId(userId);
    this.validateChatId(chatId);

    // --------------------------------------------------------
    // Load chat
    // --------------------------------------------------------

    const chat =
      await chatRepository.findByIdAndUserId(
        chatId,
        userId
      );

    if (!chat) {
      return null;
    }

    // --------------------------------------------------------
    // Normalize stored messages
    // --------------------------------------------------------

    const storedMessages =
      Array.isArray(chat.messages)
        ? chat.messages
        : [];

    // --------------------------------------------------------
    // Extract search IDs
    // --------------------------------------------------------

    const searchIds: string[] = [];

    for (
      const message of storedMessages
    ) {
      if (
        !this.isJsonObject(message)
      ) {
        continue;
      }

      if (
        message.type !==
        "lead_generation"
      ) {
        continue;
      }

      if (
        typeof message.searchId !==
        "string"
      ) {
        continue;
      }

      searchIds.push(
        message.searchId
      );
    }

    // --------------------------------------------------------
    // Deduplicate search IDs
    // --------------------------------------------------------

    const uniqueSearchIds =
      [...new Set(searchIds)];

    // --------------------------------------------------------
    // Fetch leads
    // --------------------------------------------------------

    const leadResults =
      await Promise.all(
        uniqueSearchIds.map(
          async (searchId) => {
            const leads =
              await leadRepository.findManyBySearchId(
                searchId
              );

            return {
              searchId,
              leads,
            };
          }
        )
      );

    // --------------------------------------------------------
    // Build searchId -> Lead[] lookup
    // --------------------------------------------------------

    const leadsBySearchId =
      new Map<string, Lead[]>();

    for (
      const result of leadResults
    ) {
      leadsBySearchId.set(
        result.searchId,
        result.leads
      );
    }

    // --------------------------------------------------------
    // Hydrate messages
    // --------------------------------------------------------

    const hydratedMessages: ChatHistoryMessage[] =
      [];

    for (
      const message of storedMessages
    ) {
      // ------------------------------------------------------
      // Ignore invalid JSON values.
      //
      // Chat history messages are expected to be objects.
      // This prevents primitives/null/arrays from leaking
      // into the typed API response.
      // ------------------------------------------------------

      if (
        !this.isJsonObject(message)
      ) {
        continue;
      }

      // ------------------------------------------------------
      // Normal message
      // ------------------------------------------------------

      if (
        message.type !==
          "lead_generation" ||
        typeof message.searchId !==
          "string"
      ) {
        hydratedMessages.push(
          message
        );

        continue;
      }

      // ------------------------------------------------------
      // Lead-generation message
      // ------------------------------------------------------

      const searchId =
        message.searchId;

      const leads =
        leadsBySearchId.get(
          searchId
        ) ?? [];

      /**
       * We explicitly construct the object instead of
       * spreading `message`.
       *
       * This gives TypeScript a concrete guarantee that
       * every required field in LeadGenerationHistoryMessage
       * exists with the correct type.
       */
      const hydratedMessage: LeadGenerationHistoryMessage = {
        id:
          typeof message.id ===
          "string"
            ? message.id
            : randomUUID(),

        role:
          typeof message.role ===
          "string"
            ? message.role
            : "assistant",

        type:
          "lead_generation",

        content:
          typeof message.content ===
          "string"
            ? message.content
            : "",

        searchId,

        count:
          typeof message.count ===
          "number"
            ? message.count
            : leads.length,

        createdAt:
          typeof message.createdAt ===
          "string"
            ? message.createdAt
            : new Date().toISOString(),

        leads,
      };

      hydratedMessages.push(
        hydratedMessage
      );
    }

    // --------------------------------------------------------
    // Return hydrated history
    // --------------------------------------------------------

    return {
      id:
        chat.id,

      name:
        chat.name,

      userId:
        chat.userId,

      productDescription:
        chat.productDescription,

      icpDescription:
        chat.icpDescription,

      engineConfig:
        chat.engineConfig,

      createdAt:
        chat.createdAt,

      updatedAt:
        chat.updatedAt,

      messages:
        hydratedMessages,
    };
  }

  // ==========================================================
  // READ MANY
  // ==========================================================

  async getChats(
    userId: string
  ): Promise<Chat[]> {
    this.validateUserId(userId);

    return chatRepository.findManyByUserId(
      userId
    );
  }

  // ==========================================================
  // UPDATE
  // ==========================================================

  async updateChat(
    userId: string,
    chatId: string,
    input: UpdateChatRequest
  ): Promise<Chat> {
    this.validateUserId(userId);
    this.validateChatId(chatId);

    const data: UpdateChatData = {};

    if (
      input.name !==
      undefined
    ) {
      data.name =
        this.validateRequiredString(
          input.name,
          "Chat name"
        );
    }

    if (
      input.productDescription !==
      undefined
    ) {
      data.productDescription =
        this.validateRequiredString(
          input.productDescription,
          "Product description"
        );
    }

    if (
      input.icpDescription !==
      undefined
    ) {
      data.icpDescription =
        this.validateRequiredString(
          input.icpDescription,
          "ICP description"
        );
    }

    if (
      input.messages !==
      undefined
    ) {
      data.messages =
        input.messages as Prisma.InputJsonValue[];
    }

    if (
      input.engineConfig !==
      undefined
    ) {
      data.engineConfig =
        input.engineConfig;
    }

    if (
      Object.keys(data).length ===
      0
    ) {
      throw new Error(
        "At least one chat field must be provided."
      );
    }

    return chatRepository.updateByIdAndUserId(
      chatId,
      userId,
      data
    );
  }

  // ==========================================================
  // DELETE
  // ==========================================================

  async deleteChat(
    userId: string,
    chatId: string
  ): Promise<void> {
    this.validateUserId(userId);
    this.validateChatId(chatId);

    await chatRepository.deleteByIdAndUserId(
      chatId,
      userId
    );
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
  async generateLeads(
    userId: string,
    chatId: string,
    request: GenerateLeadsRequest
  ): Promise<GenerateLeadsResponse> {
    this.validateUserId(userId);
    this.validateChatId(chatId);

    this.validateLeadCount(
      request.count
    );

    // --------------------------------------------------------
    // Load chat
    // --------------------------------------------------------

    const chat =
      await chatRepository.findByIdAndUserId(
        chatId,
        userId
      );

    if (!chat) {
      throw new Error(
        "Chat not found."
      );
    }

    // --------------------------------------------------------
    // Resolve product documentation
    // --------------------------------------------------------

    const productDocs =
      chat.productDescription?.trim();

    if (!productDocs) {
      throw new Error(
        "Product description is required before generating leads."
      );
    }

    // --------------------------------------------------------
    // Resolve campaign target
    // --------------------------------------------------------

    const campaignTarget =
      chat.icpDescription?.trim();

    if (!campaignTarget) {
      throw new Error(
        "ICP description is required before generating leads."
      );
    }

    // --------------------------------------------------------
    // Resolve LLM credentials
    // --------------------------------------------------------

    const llmCredential =
      await credentialsService.getDecryptedCredential(
        userId,
        "llm"
      );

    if (!llmCredential) {
      throw new Error(
        "LLM credentials are not configured."
      );
    }

    if (
      !llmCredential.modelName?.trim()
    ) {
      throw new Error(
        "LLM model name is not configured."
      );
    }

    if (
      !llmCredential.apiKey?.trim()
    ) {
      throw new Error(
        "LLM API key is not configured."
      );
    }

    // --------------------------------------------------------
    // Resolve application-level BetterContact credentials
    // --------------------------------------------------------

    const betterContactApiKey =
      process.env.BETTERCONTACT_API_KEY;

    if (!betterContactApiKey?.trim()) {
      throw new Error(
        "BetterContact API key is not configured."
      );
    }

    // --------------------------------------------------------
    // Resolve authenticated user's email
    // --------------------------------------------------------

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          email: true,
        },
      });

    if (!user) {
      throw new Error(
        "Authenticated user not found."
      );
    }

    if (!user.email?.trim()) {
      throw new Error(
        "A valid operator email is required before generating leads."
      );
    }

    // --------------------------------------------------------
    // Construct OpenOutFind credentials
    // --------------------------------------------------------

    const credentials:
      OpenOutFindCredentials = {
      aiModel:
        llmCredential.modelName.trim(),

      llmApiKey:
        llmCredential.apiKey,

      betterContactApiKey:
        betterContactApiKey.trim(),

      operatorEmail:
        user.email.trim(),
    };

    // --------------------------------------------------------
    // Application-controlled runtime
    // --------------------------------------------------------

    const runtime:
      OpenOutFindRuntimeOptions = {
      country:
        "IN",

      acceptLegalNotice:
        true,
    };

    // --------------------------------------------------------
    // Create isolated campaign ID
    // --------------------------------------------------------

    const campaignId =
      this.createCampaignId(
        chatId
      );

    // --------------------------------------------------------
    // CREATE SEARCH RECORD
    // --------------------------------------------------------

    const search =
      await searchRepository.create({
        chatId,

        productDescription:
          productDocs,

        campaignTarget:
          campaignTarget,

        status:
          "running",
      });

    try {
      // ------------------------------------------------------
      // Construct OpenOutFind input
      // ------------------------------------------------------

      const input:
        FetchLeadsInput = {
        campaignId,

        productDocs,

        campaignTarget,

        count:
          request.count,

        credentials,

        runtime,
      };

      // ------------------------------------------------------
      // Execute OpenOutFind
      // ------------------------------------------------------

      const result =
        await openOutFindClient.findLeads(
          input
        );

      // ------------------------------------------------------
      // Persist returned leads
      // ------------------------------------------------------

      if (
        result.leads.length >
        0
      ) {
        await leadRepository.createMany({
          searchId:
            search.id,

          leads:
            result.leads,
        });
      }

      // ------------------------------------------------------
      // Mark search completed
      // ------------------------------------------------------

      await searchRepository.updateStatus(
        search.id,
        "completed"
      );

      // ------------------------------------------------------
      // Persist generation result into Chat.messages
      // ------------------------------------------------------

      const existingMessages =
        Array.isArray(
          chat.messages
        )
          ? chat.messages
          : [];

      const generationMessage:
        Prisma.InputJsonValue = {
        id:
          randomUUID(),

        role:
          "assistant",

        type:
          "lead_generation",

        content:
          `Found ${result.count} leads.`,

        searchId:
          search.id,

        count:
          result.count,

        createdAt:
          new Date().toISOString(),
      };

      const updatedMessages =
        [
          ...existingMessages,
          generationMessage,
        ] as Prisma.InputJsonValue[];

      await chatRepository.updateByIdAndUserId(
        chatId,
        userId,
        {
          messages:
            updatedMessages,
        }
      );

      // ------------------------------------------------------
      // Return application response
      // ------------------------------------------------------

      return {
        count:
          result.count,

        leads:
          result.leads,

        searchId:
          search.id,
      };
    } catch (error) {
      // ------------------------------------------------------
      // Mark search as failed
      // ------------------------------------------------------

      try {
        await searchRepository.updateStatus(
          search.id,
          "failed"
        );
      } catch (
        persistenceError
      ) {
        console.error(
          "Failed to mark search as failed:",
          persistenceError
        );
      }

      throw error;
    }
  }

  // ==========================================================
  // INTERNAL HELPERS
  // ==========================================================

  private createCampaignId(
    chatId: string
  ): string {
    return [
      "chat",
      chatId,
      Date.now().toString(),
      randomUUID(),
    ].join("-");
  }

  private validateUserId(
    userId: string
  ): void {
    if (
      typeof userId !==
        "string" ||
      !userId.trim()
    ) {
      throw new Error(
        "Authenticated user is required."
      );
    }
  }

  private validateChatId(
    chatId: string
  ): void {
    if (
      typeof chatId !==
        "string" ||
      !chatId.trim()
    ) {
      throw new Error(
        "Chat ID is required."
      );
    }
  }

  private validateRequiredString(
    value: string,
    fieldName: string
  ): string {
    if (
      typeof value !==
      "string"
    ) {
      throw new Error(
        `${fieldName} is required.`
      );
    }

    const normalized =
      value.trim();

    if (!normalized) {
      throw new Error(
        `${fieldName} cannot be empty.`
      );
    }

    return normalized;
  }

  private validateLeadCount(
    count: number
  ): void {
    if (
      !Number.isInteger(count) ||
      count <= 0
    ) {
      throw new Error(
        "Lead count must be a positive integer."
      );
    }

    if (count > 20) {
      throw new Error(
        "Lead count cannot exceed 20."
      );
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
  private isJsonObject(
    value: unknown
  ): value is Prisma.JsonObject {
    return (
      typeof value ===
        "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }
}

// ============================================================
// Singleton
// ============================================================

export const chatService =
  new ChatService();

