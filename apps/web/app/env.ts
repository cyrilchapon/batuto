import { parseEnvFromSchema } from "@batuto/env";
import { z } from "zod";

const appEnvSchema = z.object({
  VITE_API_URL: z.string().default("http://localhost:3001"),
});

const parseAppEnv = parseEnvFromSchema(appEnvSchema);

export const appEnv = parseAppEnv(import.meta.env);
