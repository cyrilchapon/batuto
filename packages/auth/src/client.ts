import { createClerkClient } from "@clerk/backend";
import type { AuthEnv } from "./env.js";

export const createAuthClient = (env: AuthEnv) =>
  createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });

export type AuthClient = ReturnType<typeof createAuthClient>;
