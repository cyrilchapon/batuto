---
title: Tech stack overview
summary: Turborepo/Yarn monorepo, React+Vite frontend, Express+oRPC backend, Prisma/Postgres, Clerk, Doppler, AppSignal — full detail lives in Linear
category: engineering
last_updated: 2026-07-29
related:
  - engineering/overview/monorepo-layout.md
  - engineering/overview/infra-and-envs.md
  - engineering/overview/quality-gates.md
---

# Tech stack overview

**Source of truth:** the Linear project document ["Tech stack"](https://linear.app/cyc-personal/document/tech-stack-119edf90d39d). This file is a summary for quick agent orientation — if it and the Linear document ever disagree, the Linear document wins, and this file should be updated to match (via `knowledge-update`).

## Monorepo

Turborepo + Yarn workspaces. Yarn only, everywhere — never `npm`, never a global install; see `infra-and-envs.md`'s "Package manager: yarn only, nothing global" for the full convention and why it matters.

## Frontend

React + Vite, react-router (framework mode), Shadcn UI, oRPC client + TanStack React Query.

## Backend

Bare Node.js + Express, oRPC bindings. Fully decoupled from the frontend — no shared runtime, communication only through the API contract.

## Shared packages

- **DTOs** — Zod schemas, shared package, source of truth for data shapes across the repo.
- **API contract** — oRPC (OpenAPI-style), contract-first, built on the DTOs. Shared package, consumed by both the API implementation and the frontend client.
- **Database** — Prisma schema + generated client, shared package, backed by Postgres.

## Tooling

Biome for linting and formatting across the whole monorepo — one tool, one config, replacing an ESLint + Prettier combo. Typechecking uses `tsgo` (TypeScript 7 native preview), not `tsc`. Knip for unused code/dependencies, Syncpack for cross-package dependency version consistency. All six checks (`check:type`/`check:lint`/`check:format`/`check:assist`/`check:unused`/`check:depsync`) and their `fix:*` counterparts are documented in `quality-gates.md` — that's the "how to check after working" / "how to fix" reference.

## Auth

Clerk, scoped to identity only. Clerk answers "who is this person" — band membership, musical role, and event ownership all live in the Postgres schema via Prisma, not in Clerk's org/role primitives. See `../../domain/role-hierarchy.md` for why those primitives aren't a good fit for this domain.

## Background jobs

Simple cron, run via Heroku Scheduler rather than an in-process scheduler. Used for recurring event generation in v0, extended to reminders/notifications in v1.

## Hosting

Frontend on Vercel, backend on Heroku, database on Neon (Postgres) — using Neon's **pooled** connection string, not the direct one.

## Observability

AppSignal only — error tracking, structured logging, and performance monitoring in one platform, with frontend JS errors/Core Web Vitals correlated to backend traces out of the box. Replaced an earlier Betterstack pick on 2026-07-29 after benchmarking against Betterstack, Dash0, and Superlog — see the Linear document for the full comparison.

## Secrets

Doppler is the single source of truth for all secrets/environment variables, syncing natively to Heroku, Vercel, and CI — see `infra-and-envs.md`.

For the full narrative and the reasoning behind each choice (e.g. why AppSignal replaced Betterstack, why Clerk is identity-only), read the Linear document directly rather than assuming this summary captures it all.
