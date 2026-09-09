import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.middleware.js";
import { userController } from "../controllers/user.controller.js";
const router = Router();
router.use(requireAuth);
router.get("/me", userController.getCurrentUser);
router.patch("/me", userController.updateCurrentUser);
router.delete("/me", userController.deleteCurrentUser);
export default router;
//# sourceMappingURL=user.routes.js.map