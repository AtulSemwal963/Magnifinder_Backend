
import type { Prisma } from "../../../generated/prisma/client.js";

// ============================================================
// Chat Message
// ============================================================

export type ChatMessageRole =
  | "user"
  | "assistant"
  | "system";

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

// ============================================================
// Engine Configuration
// ============================================================

/**
 * Non-secret configuration for the search/AI engine.
 *
 * API keys MUST NOT be stored here.
 */
export interface ChatEngineConfig {
  aiModel?: string;
  leadProvider?: string;
}

// ============================================================
// Create Chat
// ============================================================

export interface CreateChatInput {
  name?: string;
  productDescription?: string;
  icpDescription?: string;
  engineConfig?: ChatEngineConfig;
}

// ============================================================
// Update Chat
// ============================================================

export interface UpdateChatInput {
  name?: string;
  productDescription?: string | null;
  icpDescription?: string | null;
  engineConfig?: ChatEngineConfig | null;
}

// ============================================================
// Send Message
// ============================================================

export interface SendMessageInput {
  content: string;
}

// ============================================================
// Chat Response
// ============================================================

export interface ChatResponse {
  id: string;
  name: string;
  productDescription: string | null;
  icpDescription: string | null;
  messages: ChatMessage[];
  engineConfig: ChatEngineConfig | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Chat List Response
// ============================================================

/**
 * Lightweight representation returned by GET /chats.
 *
 * The chat list does not need to return the entire conversation
 * history for every chat.
 */
export interface ChatListItem {
  id: string;
  name: string;
  productDescription: string | null;
  icpDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Prisma JSON Helpers
// ============================================================

/**
 * Convert our strongly typed engine configuration into the
 * JSON representation Prisma accepts.
 */
export function toPrismaEngineConfig(
  config: ChatEngineConfig | null | undefined
): Prisma.InputJsonValue | null | undefined {
  if (config === undefined) {
    return undefined;
  }

  if (config === null) {
    return null;
  }

  return {
    ...(config.aiModel !== undefined && {
      aiModel: config.aiModel,
    }),

    ...(config.leadProvider !== undefined && {
      leadProvider: config.leadProvider,
    }),
  };
}

/**
 * Convert a typed message into Prisma-compatible JSON.
 */
export function toPrismaChatMessage(
  message: ChatMessage
): Prisma.InputJsonValue {
  return {
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

