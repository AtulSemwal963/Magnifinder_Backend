import "dotenv/config";
import express, {} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./src/lib/prisma.js";
// ============================================================
// Domain Routes
// ============================================================
import identityRoutes from "./src/domains/identity/routes/identity.routes.js";
import userRoutes from "./src/domains/user/routes/user.routes.js";
import chatRoutes from "./src/domains/chat/routes/chat.routes.js";
import credentialsRoutes from "./src/domains/credentials/routes/credentials.routes.js";
const app = express();
const PORT = Number(process.env.PORT) || 8080;
// ============================================================
// Configuration
// ============================================================
const ALLOWED_ORIGINS = new Set(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : ["http://localhost:3000"]);
// ============================================================
// Middleware
// ============================================================
app.set("trust proxy", 1);
app.use(helmet());
app.use(cookieParser());
app.use(express.json({
    limit: "10mb",
}));
app.use(express.urlencoded({
    extended: true,
    limit: "10mb",
}));
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("CORS Policy Block: Origin not authorized."));
    },
    credentials: true,
    methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Accept",
    ],
}));
// ============================================================
// Health Check
// ============================================================
app.get("/health", async (_req, res) => {
    try {
        await prisma.$runCommandRaw({
            ping: 1,
        });
        return res.status(200).json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: "connected",
        });
    }
    catch (error) {
        console.error("[HEALTH] Database connection failed:", error);
        return res.status(500).json({
            status: "unhealthy",
            timestamp: new Date().toISOString(),
            error: error instanceof Error
                ? error.message
                : "Database connection failed.",
        });
    }
});
// ============================================================
// Domain Routes
// ============================================================
app.use("/api/v1/identity", identityRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/credentials", credentialsRoutes);
// ============================================================
// 404 Handler
// ============================================================
app.use((_req, res) => {
    return res.status(404).json({
        success: false,
        error: "Route not found.",
    });
});
app.use((err, _req, res, _next) => {
    console.error("[UNHANDLED EXPRESS ERROR]", err);
    const statusCode = err.statusCode ??
        err.status ??
        500;
    return res.status(statusCode).json({
        success: false,
        error: err.message ||
            "Internal server execution failure.",
        details: process.env.NODE_ENV === "development"
            ? err.stack
            : undefined,
    });
});
// ============================================================
// Server Bootstrap
// ============================================================
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SYSTEM] Magnifinder API Engine running on 0.0.0.0:${PORT}`);
});
// ============================================================
// Graceful Shutdown
// ============================================================
const shutdown = async (signal) => {
    console.log(`\n[SYSTEM] Received ${signal}. Terminating connection gates cleanly...`);
    server.close(async () => {
        try {
            await prisma.$disconnect();
            console.log("[SYSTEM] Prisma Client disconnected. Process terminated successfully.");
            process.exit(0);
        }
        catch (error) {
            console.error("[SYSTEM] Failed to disconnect Prisma cleanly:", error);
            process.exit(1);
        }
    });
};
process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
});
process.once("SIGINT", () => {
    void shutdown("SIGINT");
});
export default app;
//# sourceMappingURL=index.js.map