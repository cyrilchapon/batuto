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

export const router = { hello, privatePing };
