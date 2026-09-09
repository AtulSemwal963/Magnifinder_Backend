import { userRepository } from "../repositories/user.repository.js";

export const userService = {
  async getCurrentUser(userId: string) {
    const user = await userRepository.findById(userId);

    if (!user) {
      const error = new Error("User not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    return user;
  },

  async updateCurrentUser(
    userId: string,
    data: {
      username?: string;
      googleImage?: string | null;
    }
  ) {
    const user = await userRepository.findById(userId);

    if (!user) {
      const error = new Error("User not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    try {
      return await userRepository.update(userId, data);
    } catch (error: any) {
      // Prisma unique constraint violation.
      if (error?.code === "P2002") {
        const conflict = new Error("Username is already taken.");
        (conflict as any).statusCode = 409;
        throw conflict;
      }

      throw error;
    }
  },

  async deleteCurrentUser(userId: string) {
    const user = await userRepository.findById(userId);

    if (!user) {
      const error = new Error("User not found.");
      (error as any).statusCode = 404;
      throw error;
    }

    await userRepository.delete(userId);
  },
};