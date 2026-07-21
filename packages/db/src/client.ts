import { PrismaPg } from "@prisma/adapter-pg";
import type { DbEnv } from "./env.js";
import { PrismaClient } from "./generated/client.js";

export const createDb = (env: DbEnv) => {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

export type Db = ReturnType<typeof createDb>;
