---
title: Monorepo layout
summary: DTOs → contract → (backend, frontend) is a real dependency chain in Turborepo, not a flat set of packages
category: engineering
last_updated: 2026-07-17
related:
  - engineering/overview/stack.md
  - engineering/overview/quality-gates.md
---

# Monorepo layout

Turborepo + Yarn workspaces. The build order between shared packages matters and should be reflected explicitly in `turbo.json`'s task graph (`dependsOn`), not left implicit.

## Dependency chain

```
DTOs (Zod schemas)
  └──> API contract (oRPC, contract-first, built on the DTOs)
         ├──> backend (implements the contract)
         └──> frontend (oRPC client + React Query, consumes the contract)
```

DTOs are the source of truth for data shapes across the whole repo. The contract is built on top of them. Backend and frontend both depend on the contract, but not on each other — they communicate only through it, with no shared runtime.

Getting this graph right early matters: without it, CI can pass locally (where a dev's local state happens to have things built in the right order already) and fail in the pipeline, where it doesn't.

## Why this is called out separately from the stack overview

`stack.md` lists *what* the shared packages are; this document is about *the order they must build in*. That distinction was flagged explicitly during bootstrap as one of the likelier places to hit a real, non-obvious bug (a monorepo build-order issue), so it gets its own document rather than being a bullet point.

## Database package

Prisma schema + generated client, its own shared package, backed by Postgres (Neon, pooled connection string — see `infra-and-envs.md`).

## Each shared package builds JS and declarations separately

`packages/dtos`, `packages/contract`, and `packages/db` each expose three pure scripts — `check:type` (typecheck only), `build` (JS only, to `dist/`), `build:declaration` (declarations only, to `dist-types/`) — wired through `turbo.json` so a consumer's `check:type` waits on its dependencies' `build:declaration`, and a package's `build` waits on its dependencies' `build`. `apps/api` and `apps/web` don't follow this split — they're leaf apps, nothing depends on them. See `quality-gates.md` for the full mechanics (including why `tsgo`, and the `--noCheck`/`rewriteRelativeImportExtensions` details).
