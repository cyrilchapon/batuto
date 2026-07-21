import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";
import type { DbEnv } from "./env.js";

export const createDb = (env: DbEnv) => {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

export type Db = ReturnType<typeof createDb>;
