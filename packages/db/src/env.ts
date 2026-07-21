import { z } from "zod";

export const dbEnvShape = {
  DATABASE_URL: z.string(),
};

export type DbEnv = z.infer<z.ZodObject<typeof dbEnvShape>>;
