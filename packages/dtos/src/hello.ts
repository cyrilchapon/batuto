import { z } from "zod";

export const helloWorldDto = z.object({
  message: z.string(),
});

export type HelloWorldDto = z.infer<typeof helloWorldDto>;
