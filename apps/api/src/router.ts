import { sendError } from "@appsignal/nodejs";
import { contract } from "@batuto/contract";
import { implement, ORPCError } from "@orpc/server";
import type { AppContext } from "./context.js";
import { db } from "./db.js";

const os = implement<typeof contract, AppContext>(contract);

const requireAuth = os.middleware(async ({ context, next }) => {
  if (!context.auth.userId) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({ context: { auth: { userId: context.auth.userId } } });
});

const hello = os.hello.handler(async ({ input }) => {
  const row = await db.helloWorld.create({
    data: { message: `Hello, ${input.name ?? "World"}!` },
  });

  return { message: row.message };
});

const privatePing = os.privatePing.use(requireAuth).handler(async ({ context }) => ({
  userId: context.auth.userId,
}));

// BAT-23's full-stack proof: an authenticated request that reads/writes a
// real row, going through the same requireAuth path as privatePing.
const privateHello = os.privateHello.use(requireAuth).handler(async ({ input, context }) => {
  const row = await db.helloWorld.create({
    data: { message: `Hello, ${input.name ?? "World"}! (from user ${context.auth.userId})` },
  });

  return { message: row.message };
});

// BAT-23's other half: an intentional error for an authenticated request,
// reported to AppSignal explicitly since oRPC's handler catches the throw
// internally and never lets it reach Express's own error middleware.
const boom = os.boom.use(requireAuth).handler(async ({ context }) => {
  const error = new Error(
    `Intentional error for AppSignal proof (BAT-23), from user ${context.auth.userId}`,
  );
  sendError(error);
  throw error;
});

export const router = { hello, privatePing, privateHello, boom };
