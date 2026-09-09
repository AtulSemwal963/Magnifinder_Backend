import {
type Request,
type Response,
type NextFunction,
} from "express";

import {
verifySessionToken,
clearSessionCookie,
} from "../infrastructure/auth/session.js";

declare global {
namespace Express {
interface Request {
user?: {
id: string;
};
}
}
}

export const requireAuth = (
req: Request,
res: Response,
next: NextFunction
): void => {
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


} catch (error: unknown) {
if (error instanceof Error) {
console.warn("[AUTH] Session verification failed:", error.message);
} else {
console.warn("[AUTH] Session verification failed.");
}

clearSessionCookie(res);

res.status(401).json({
  success: false,
  error: "Unauthorized. Invalid or expired session.",
});


}
};
