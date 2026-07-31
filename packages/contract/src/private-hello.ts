import { helloWorldDto } from "@batuto/dtos";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const privateHelloContract = oc
  .route({ method: "POST", path: "/private/hello" })
  .input(z.object({ name: z.string().optional() }))
  .output(helloWorldDto);
