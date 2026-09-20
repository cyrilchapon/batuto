import { contract } from "@batuto/contract";
import { implement, ORPCError } from "@orpc/server";
import type { AppContext } from "./context.js";

const os = implement<typeof contract, AppContext>(contract);

const requireAuth = os.middleware(async ({ context, next }) => {
  if (!context.auth.userId) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({ context: { auth: { userId: context.auth.userId } } });
});

// The canonical shape for an authenticated procedure — see
// .agents/context/engineering/modules/api-procedures.md for the full recipe,
// including the AppSignal reporting a throwing handler has to do by hand.
const privatePing = os.privatePing.use(requireAuth).handler(async ({ context }) => ({
  userId: context.auth.userId,
}));

export const router = { privatePing };
