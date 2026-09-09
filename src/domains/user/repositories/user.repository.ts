import { prisma } from "../../../lib/prisma.js";

export const userRepository = {
  async findById(userId: string) {
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

  async update(
    userId: string,
    data: {
      username?: string;
      googleImage?: string | null;
    }
  ) {
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

  async delete(userId: string) {
    return prisma.user.delete({
      where: {
        id: userId,
      },
    });
  },
};