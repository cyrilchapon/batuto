import { clerkMiddleware, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import type { AuthEnv } from "./env.js";

export const createAuthMiddleware = (env: AuthEnv) =>
  clerkMiddleware({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });

export const requireAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
