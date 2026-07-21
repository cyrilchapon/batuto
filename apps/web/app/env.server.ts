import { parseEnvFromSchema } from "@batuto/env";
import { z } from "zod";

const serverEnvSchema = z.object({
  CLERK_SECRET_KEY: z.string(),
});

const parseServerEnv = parseEnvFromSchema(serverEnvSchema);

export const serverEnv = parseServerEnv(process.env);
