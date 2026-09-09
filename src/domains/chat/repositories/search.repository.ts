
// src/domains/chat/repositories/search.repository.ts

import { prisma } from "../../../lib/prisma.js";

import type {
  Search,
  Prisma,
} from "../../../generated/prisma/client.js";

// ============================================================
// Input Types
// ============================================================

export interface CreateSearchData {
  chatId: string;
  productDescription: string;
  campaignTarget?: string | null;
  status?: string;
}

export interface UpdateSearchData {
  productDescription?: string;
  campaignTarget?: string | null;
  status?: string;
}

// ============================================================
// Repository
// ============================================================

export class SearchRepository {
  /**
   * Create a new lead-generation search belonging to a chat.
   */
  async create(
    data: CreateSearchData
  ): Promise<Search> {
    return prisma.search.create({
      data: {
        chatId: data.chatId,

        productDescription:
          data.productDescription,

        campaignTarget:
          data.campaignTarget ?? null,

        status:
          data.status ?? "pending",
      },
    });
  }

  /**
   * Find a search belonging to a specific chat.
   *
   * The chatId constraint prevents access to searches
   * belonging to another chat.
   */
  async findByIdAndChatId(
    searchId: string,
    chatId: string
  ): Promise<Search | null> {
    return prisma.search.findFirst({
      where: {
        id: searchId,
        chatId,
      },
    });
  }

  /**
   * Retrieve all searches belonging to a chat.
   */
  async findManyByChatId(
    chatId: string
  ): Promise<Search[]> {
    return prisma.search.findMany({
      where: {
        chatId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Update search fields.
   */
  async update(
    searchId: string,
    data: UpdateSearchData
  ): Promise<Search> {
    return prisma.search.update({
      where: {
        id: searchId,
      },
      data: {
        ...(data.productDescription !== undefined && {
          productDescription:
            data.productDescription,
        }),

        ...(data.campaignTarget !== undefined && {
          campaignTarget:
            data.campaignTarget,
        }),

        ...(data.status !== undefined && {
          status:
            data.status,
        }),
      },
    });
  }

  /**
   * Update only the search status.
   *
   * Used during the generation lifecycle:
   *
   * pending → running → completed
   *
   * or:
   *
   * pending → running → failed
   */
  async updateStatus(
    searchId: string,
    status: string
  ): Promise<Search> {
    return prisma.search.update({
      where: {
        id: searchId,
      },
      data: {
        status,
      },
    });
  }

  /**
   * Delete a search.
   *
   * Associated leads are deleted automatically through
   * the Search → Lead cascade relation.
   */
  async delete(
    searchId: string
  ): Promise<void> {
    await prisma.search.delete({
      where: {
        id: searchId,
      },
    });
  }
}

export const searchRepository =
  new SearchRepository();

