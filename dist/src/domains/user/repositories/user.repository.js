import { prisma } from "../../../lib/prisma.js";
export const userRepository = {
    async findById(userId) {
        return prisma.user.findUnique({
            where: {
                id: userId,
            },
            select: {
                id: true,
                username: true,
                googleImage: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    },
    async update(userId, data) {
        return prisma.user.update({
            where: {
                id: userId,
            },
            data,
            select: {
                id: true,
                username: true,
                googleImage: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    },
    async delete(userId) {
        return prisma.user.delete({
            where: {
                id: userId,
            },
        });
    },
};
//# sourceMappingURL=user.repository.js.map