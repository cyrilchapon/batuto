import { oc } from "@orpc/contract";
import { z } from "zod";

// Deliberately throws server-side (see apps/api/src/router.ts) - proves an
// intentional error reaches AppSignal for an authenticated request, the
// other half of BAT-23's full-stack proof alongside privateHelloContract.
export const boomContract = oc
  .route({ method: "POST", path: "/private/boom" })
  .output(z.object({}));
