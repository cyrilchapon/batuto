// Env vars are injected by dotenv-cli in the relevant package.json scripts
// (migrate:dev, studio — see infra-and-envs.md), not loaded here. migrate:deploy,
// check:schema and codegen get theirs from the real environment (CI/Doppler) or
// don't need one.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Required by `check:schema`'s `migrate diff --from-migrations`, which
    // replays the full migration history into this database to compute its
    // resultant schema. Must point at an empty database — see
    // infra-and-envs.md's "Neon database branching" section.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
