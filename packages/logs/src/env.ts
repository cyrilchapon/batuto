import { z } from "zod";

export const appsignalEnvShape = {
  APPSIGNAL_PUSH_API_KEY: z.string(),
};

export type AppsignalEnv = z.infer<z.ZodObject<typeof appsignalEnvShape>>;
