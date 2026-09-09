import { userRepository } from "../repositories/user.repository.js";
export const userService = {
    async getCurrentUser(userId) {
        const user = await userRepository.findById(userId);
        if (!user) {
            const error = new Error("User not found.");
            error.statusCode = 404;
            throw error;
        }
        return user;
    },
    async updateCurrentUser(userId, data) {
        const user = await userRepository.findById(userId);
        if (!user) {
            const error = new Error("User not found.");
            error.statusCode = 404;
            throw error;
        }
        try {
            return await userRepository.update(userId, data);
        }
        catch (error) {
            // Prisma unique constraint violation.
            if (error?.code === "P2002") {
                const conflict = new Error("Username is already taken.");
                conflict.statusCode = 409;
                throw conflict;
            }
            throw error;
        }
    },
    async deleteCurrentUser(userId) {
        const user = await userRepository.findById(userId);
        if (!user) {
            const error = new Error("User not found.");
            error.statusCode = 404;
            throw error;
        }
        await userRepository.delete(userId);
    },
};
//# sourceMappingURL=user.service.js.map