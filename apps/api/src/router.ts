import { contract } from "@batuto/contract";
import { implement } from "@orpc/server";
import { db } from "./db.js";

const os = implement(contract);

const hello = os.hello.handler(async ({ input }) => {
  const row = await db.helloWorld.create({
    data: { message: `Hello, ${input.name ?? "World"}!` },
  });

  return { message: row.message };
});

export const router = { hello };
