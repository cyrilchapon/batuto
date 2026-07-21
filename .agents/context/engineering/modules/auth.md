---
title: Auth module (@batuto/auth)
summary: Clerk backend wiring lives in its own provider package; use clerkMiddleware + getAuth for API routes, not the deprecated requireAuth
category: engineering
last_updated: 2026-07-21
related:
  - engineering/modules/env-validation.md
  - engineering/overview/infra-and-envs.md
  - engineering/overview/stack.md
---

# Auth module (`@batuto/auth`)

`packages/auth` wraps `@clerk/express` the same way `@batuto/db` wraps Prisma — see [env-validation.md](env-validation.md) for the general provider-package pattern this follows (env shape exported from `src/env.ts`, a factory taking that typed env, apps composing and parsing once). This document is the Clerk-specific detail that pattern doesn't cover on its own.

## What it exports

- `authEnvShape` / `AuthEnv` — `{ CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY }`.
- `createAuthMiddleware(env: AuthEnv)` — configured `clerkMiddleware()`, mounted globally (`app.use(...)`) in `apps/api/src/app.ts`. Non-blocking: it attaches an auth object to every request, authenticated or not.
- `requireAuthenticated` — a hand-rolled Express middleware, not re-exported from `@clerk/express`. Checks `getAuth(req).userId` and responds `401 { error: "Unauthorized" }` if absent, otherwise calls `next()`.
- `getAuth` — re-exported straight from `@clerk/express`, for reading `userId`/session info inside a route handler.

## Why `requireAuthenticated` is hand-rolled, not Clerk's `requireAuth()`

`@clerk/express`'s own `requireAuth()` is deprecated as of the version installed here (2.1.43) and is designed for browser-facing routes: on an unauthenticated request it redirects to a sign-in URL rather than returning a JSON error. That's the wrong behavior for `apps/api`, which is a pure JSON API with no server-rendered pages. Clerk's own type-doc for `requireAuth()` recommends the replacement used here — `clerkMiddleware()` mounted globally, plus a per-route (or, as done here, shared) check against `getAuth(req).userId` that returns 401 JSON directly.

## Proof route

`GET /private/ping` in `apps/api/src/app.ts` exists solely to prove the middleware blocks unauthenticated requests (`apps/api/src/auth.test.ts` asserts the 401). It is not a real feature route — the first real auth-gated business route will replace it as actual screens get built.

## Frontend is a separate concern

`apps/web` will use Clerk's React SDK (`@clerk/clerk-react` or similar), not this package — `@batuto/auth` wraps the Express-specific backend SDK only, the same way `@batuto/db` has no frontend counterpart. `CLERK_PUBLISHABLE_KEY` is not secret and reaches the frontend too, but through its own Vite env var (`VITE_CLERK_PUBLISHABLE_KEY`), not by importing this package. `batuto-web`'s Doppler `dev`/`dev_personal` configs already carry `VITE_CLERK_PUBLISHABLE_KEY`, prepared ahead of the actual frontend wiring (BAT-17).

## Real Clerk application — resolved for dev

A real Clerk application exists (test-mode keys). `batuto-api`'s `dev`/`dev_personal` Doppler configs carry `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`; `batuto-web`'s `dev`/`dev_personal` carry the matching `VITE_CLERK_PUBLISHABLE_KEY`. Verified working: `apps/api/src/auth.test.ts` passes against the real keys (pulled via `env:pull`), confirming `/private/ping` genuinely 401s an unauthenticated request end-to-end, not just against a placeholder.

**Still open:** `prd` configs (both `batuto-api` and `batuto-web`) are still empty — no Clerk Production instance/live keys yet. That's expected to stay open until there's an actual production deploy to point it at (see `infra-and-envs.md`'s environment structure), not a bootstrap blocker.
