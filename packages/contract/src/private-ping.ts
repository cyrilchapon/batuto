import { oc } from "@orpc/contract";
import { z } from "zod";

export const privatePingContract = oc
  .route({ method: "GET", path: "/private/ping" })
  .output(z.object({ userId: z.string() }));
