import {} from "express";
import { verifySessionToken, clearSessionCookie, } from "../infrastructure/auth/session.js";
export const requireAuth = (req, res, next) => {
    try {
        const token = req.cookies?.session;
        if (!token || typeof token !== "string") {
            res.status(401).json({
                success: false,
                error: "Unauthorized. Session missing.",
            });
            return;
        }
        const session = verifySessionToken(token);
        req.user = {
            id: session.userId,
        };
        next();
    }
    catch (error) {
        if (error instanceof Error) {
            console.warn("[AUTH] Session verification failed:", error.message);
        }
        else {
            console.warn("[AUTH] Session verification failed.");
        }
        clearSessionCookie(res);
        res.status(401).json({
            success: false,
            error: "Unauthorized. Invalid or expired session.",
        });
    }
};
//# sourceMappingURL=auth.middleware.js.map