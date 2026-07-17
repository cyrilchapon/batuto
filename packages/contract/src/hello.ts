import { helloWorldDto } from "@batuto/dtos";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const helloContract = oc
  .route({ method: "GET", path: "/hello" })
  .input(z.object({ name: z.string().optional() }))
  .output(helloWorldDto);
