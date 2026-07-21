import { z } from "zod";

export const authEnvShape = {
  CLERK_SECRET_KEY: z.string(),
  CLERK_PUBLISHABLE_KEY: z.string(),
};

export type AuthEnv = z.infer<z.ZodObject<typeof authEnvShape>>;
