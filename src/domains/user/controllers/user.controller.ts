import { type Request, type Response } from "express";
import { userService } from "../services/user.service.js";

export const userController = {
  async getCurrentUser(req: Request, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized.",
        });
      }

      const user = await userService.getCurrentUser(userId);

      return res.status(200).json({
        user,
      });
    } catch (error: any) {
      console.error("Failed to fetch current user:", error);

      return res.status(error?.statusCode ?? 500).json({
        error:
          error?.statusCode
            ? error.message
            : "Internal server error.",
      });
    }
  },

  async updateCurrentUser(req: Request, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized.",
        });
      }

      const { username, googleImage } = req.body;

      const user = await userService.updateCurrentUser(userId, {
        username,
        googleImage,
      });

      return res.status(200).json({
        user,
      });
    } catch (error: any) {
      console.error("Failed to update current user:", error);

      return res.status(error?.statusCode ?? 500).json({
        error:
          error?.statusCode
            ? error.message
            : "Internal server error.",
      });
    }
  },

  async deleteCurrentUser(req: Request, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized.",
        });
      }

      await userService.deleteCurrentUser(userId);

      return res.status(204).send();
    } catch (error: any) {
      console.error("Failed to delete current user:", error);

      return res.status(error?.statusCode ?? 500).json({
        error:
          error?.statusCode
            ? error.message
            : "Internal server error.",
      });
    }
  },
};