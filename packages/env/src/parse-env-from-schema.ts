import type { ZodType } from "zod";

export const parseEnvFromSchema =
  <T extends object>(schema: ZodType<T>) =>
  (rawEnv: object): T =>
    schema.parse(rawEnv);
