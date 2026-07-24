# syntax=docker/dockerfile:1
#
# Build context is the repo root (Yarn workspaces need every package.json
# to resolve `workspace:*` deps): `docker build -f apps/api/Dockerfile .`
# See .agents/context/engineering/overview/infra-and-envs.md for the deploy
# pipeline this feeds into.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY . .
RUN yarn install --immutable

# @batuto/api has no build step of its own (runs src/ directly via tsx —
# see quality-gates.md), but its workspace dependencies (@batuto/db,
# @batuto/contract, ...) do. `--filter=...@batuto/api` builds api's full
# dependency chain (and, via each package's own `build` -> `codegen`
# dependsOn edge, runs `prisma generate` before packages/db builds).
FROM deps AS build
RUN yarn turbo run build --filter=...@batuto/api

ENV NODE_ENV=production
EXPOSE 3000
CMD ["yarn", "workspace", "@batuto/api", "start"]
