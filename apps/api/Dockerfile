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

# Two named final stages, both FROM build so they share every cached layer
# up through the turbo build — building `release` after `web` (or vice
# versa) is nearly free. Heroku runs `release` as a one-off release-phase
# dyno before promoting `web`, gated atomically by Heroku itself (see
# deploy workflows' `release-api`/`deploy-api-review` jobs, which push
# and release both images in a single formation update).
FROM build AS web
EXPOSE 3000
CMD ["yarn", "workspace", "@batuto/api", "start"]

FROM build AS release
CMD ["yarn", "workspace", "@batuto/db", "migrate:deploy"]
