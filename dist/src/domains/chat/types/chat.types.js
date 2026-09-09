// ============================================================
// Prisma JSON Helpers
// ============================================================
/**
 * Convert our strongly typed engine configuration into the
 * JSON representation Prisma accepts.
 */
export function toPrismaEngineConfig(config) {
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
export function toPrismaChatMessage(message) {
    return {
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
    };
}
//# sourceMappingURL=chat.types.js.map