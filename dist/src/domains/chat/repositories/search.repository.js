// src/domains/chat/repositories/search.repository.ts
import { prisma } from "../../../lib/prisma.js";
// ============================================================
// Repository
// ============================================================
export class SearchRepository {
    /**
     * Create a new lead-generation search belonging to a chat.
     */
    async create(data) {
        return prisma.search.create({
            data: {
                chatId: data.chatId,
                productDescription: data.productDescription,
                campaignTarget: data.campaignTarget ?? null,
                status: data.status ?? "pending",
            },
        });
    }
    /**
     * Find a search belonging to a specific chat.
     *
     * The chatId constraint prevents access to searches
     * belonging to another chat.
     */
    async findByIdAndChatId(searchId, chatId) {
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
    async findManyByChatId(chatId) {
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
    async update(searchId, data) {
        return prisma.search.update({
            where: {
                id: searchId,
            },
            data: {
                ...(data.productDescription !== undefined && {
                    productDescription: data.productDescription,
                }),
                ...(data.campaignTarget !== undefined && {
                    campaignTarget: data.campaignTarget,
                }),
                ...(data.status !== undefined && {
                    status: data.status,
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
    async updateStatus(searchId, status) {
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
    async delete(searchId) {
        await prisma.search.delete({
            where: {
                id: searchId,
            },
        });
    }
}
export const searchRepository = new SearchRepository();
//# sourceMappingURL=search.repository.js.map