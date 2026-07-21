// Env vars are injected by dotenv-cli in the relevant package.json scripts
// (migrate:dev, studio — see infra-and-envs.md), not loaded here. migrate:deploy
// and codegen get theirs from the real environment (CI/Doppler) or don't need one.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
