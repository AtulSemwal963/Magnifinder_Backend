import { prisma } from "../../../lib/prisma.js";
// ============================================================
// Repository
// ============================================================
export class ChatRepository {
    /**
     * Create a new chat belonging to a specific user.
     *
     * userId is supplied by the authenticated service layer.
     * It is never accepted from an arbitrary client field.
     */
    async create(data) {
        return prisma.chat.create({
            data: {
                userId: data.userId,
                ...(data.name !== undefined && {
                    name: data.name,
                }),
                ...(data.productDescription !== undefined && {
                    productDescription: data.productDescription,
                }),
                ...(data.icpDescription !== undefined && {
                    icpDescription: data.icpDescription,
                }),
                ...(data.messages !== undefined && {
                    messages: data.messages,
                }),
                ...(data.engineConfig !== undefined && {
                    engineConfig: data.engineConfig,
                }),
            },
        });
    }
    /**
     * Find a single chat belonging to a specific user.
     *
     * IMPORTANT:
     *
     * The chat ID alone is never sufficient.
     *
     * The combined chatId + userId lookup prevents one
     * authenticated user from accessing another user's chat.
     */
    async findByIdAndUserId(chatId, userId) {
        return prisma.chat.findFirst({
            where: {
                id: chatId,
                userId,
            },
        });
    }
    /**
     * Retrieve all chats belonging to a specific user.
     *
     * Only chats owned by the authenticated user are returned.
     */
    async findManyByUserId(userId) {
        return prisma.chat.findMany({
            where: {
                userId,
            },
            orderBy: {
                updatedAt: "desc",
            },
        });
    }
    /**
     * Update a chat belonging to a specific user.
     *
     * Ownership is enforced through chatId + userId.
     */
    async updateByIdAndUserId(chatId, userId, data) {
        return prisma.chat
            .updateMany({
            where: {
                id: chatId,
                userId,
            },
            data: {
                ...(data.name !== undefined && {
                    name: data.name,
                }),
                ...(data.productDescription !== undefined && {
                    productDescription: data.productDescription,
                }),
                ...(data.icpDescription !== undefined && {
                    icpDescription: data.icpDescription,
                }),
                ...(data.messages !== undefined && {
                    messages: data.messages,
                }),
                ...(data.engineConfig !== undefined && {
                    engineConfig: data.engineConfig,
                }),
            },
        })
            .then(async (result) => {
            if (result.count === 0) {
                throw new Error("Chat not found or does not belong to the authenticated user.");
            }
            const chat = await prisma.chat.findFirst({
                where: {
                    id: chatId,
                    userId,
                },
            });
            if (!chat) {
                throw new Error("Chat not found or does not belong to the authenticated user.");
            }
            return chat;
        });
    }
    /**
     * Delete a chat belonging to a specific user.
     *
     * Ownership is enforced through chatId + userId.
     */
    async deleteByIdAndUserId(chatId, userId) {
        const result = await prisma.chat.deleteMany({
            where: {
                id: chatId,
                userId,
            },
        });
        if (result.count === 0) {
            throw new Error("Chat not found or does not belong to the authenticated user.");
        }
    }
    // ==========================================================
    // LEAD GENERATION PERSISTENCE
    // ==========================================================
    /**
     * Persist one completed lead-generation execution.
     *
     * One execution creates:
     *
     *   Chat
     *     └── Search
     *           ├── Lead
     *           ├── Lead
     *           └── Lead
     *
     * The optional assistant message is appended to the same Chat
     * in the same transaction.
     *
     * IMPORTANT:
     *
     * The entire operation is transactional. We never want:
     *
     *   Search created
     *   Leads partially created
     *   Chat message missing
     *
     * If anything fails, the complete operation rolls back.
     */
    async persistLeadGeneration(chatId, userId, data) {
        return prisma.$transaction(async (tx) => {
            // ------------------------------------------------------
            // Verify ownership inside the transaction
            // ------------------------------------------------------
            const chat = await tx.chat.findFirst({
                where: {
                    id: chatId,
                    userId,
                },
            });
            if (!chat) {
                throw new Error("Chat not found or does not belong to the authenticated user.");
            }
            // ------------------------------------------------------
            // Create Search
            // ------------------------------------------------------
            const search = await tx.search.create({
                data: {
                    chatId,
                    productDescription: data.productDescription,
                    campaignTarget: data.campaignTarget ?? null,
                    status: "completed",
                },
            });
            // ------------------------------------------------------
            // Create Leads
            // ------------------------------------------------------
            const leads = [];
            for (const lead of data.leads) {
                const createdLead = await tx.lead.create({
                    data: {
                        searchId: search.id,
                        email: lead.email ?? null,
                        firstName: lead.firstName ?? null,
                        lastName: lead.lastName ?? null,
                        company: lead.company ?? null,
                        title: lead.title ?? null,
                        website: lead.website ?? null,
                        linkedinUrl: lead.linkedinUrl ?? null,
                        reason: lead.reason ?? null,
                        externalId: lead.externalId ?? null,
                        qualifiedAt: lead.qualifiedAt ?? null,
                    },
                });
                leads.push(createdLead);
            }
            // ------------------------------------------------------
            // Append message to Chat
            // ------------------------------------------------------
            let updatedChat = chat;
            if (data.message !== undefined) {
                updatedChat =
                    await tx.chat.update({
                        where: {
                            id: chat.id,
                        },
                        data: {
                            messages: {
                                push: data.message,
                            },
                        },
                    });
            }
            // ------------------------------------------------------
            // Return complete persisted state
            // ------------------------------------------------------
            return {
                search,
                leads,
                chat: updatedChat,
            };
        });
    }
    /**
   * Retrieve all leads belonging to any of the supplied search IDs.
   *
   * Returns the results grouped by searchId so the service can
   * efficiently hydrate lead-generation messages in chat history.
   */
    async findLeadsGroupedBySearchIds(searchIds) {
        const result = new Map();
        if (searchIds.length === 0) {
            return result;
        }
        const leads = await prisma.lead.findMany({
            where: {
                searchId: {
                    in: searchIds,
                },
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        for (const lead of leads) {
            const existing = result.get(lead.searchId);
            if (existing) {
                existing.push(lead);
            }
            else {
                result.set(lead.searchId, [lead]);
            }
        }
        return result;
    }
}
export const chatRepository = new ChatRepository();
//# sourceMappingURL=chat.repository.js.map