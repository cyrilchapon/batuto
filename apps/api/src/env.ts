import { authEnvShape } from "@batuto/auth";
import { dbEnvShape } from "@batuto/db";
import { parseEnvFromSchema } from "@batuto/env";
import { z } from "zod";

const appEnvSchema = z.object({
  ...authEnvShape,
  ...dbEnvShape,
  PORT: z.coerce.number().default(3001),
  WEB_URL: z.string().default("http://localhost:5173"),
});

const parseAppEnv = parseEnvFromSchema(appEnvSchema);

export const appEnv = parseAppEnv(process.env);
