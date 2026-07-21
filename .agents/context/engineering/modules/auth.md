---
title: Auth module (@batuto/auth)
summary: Clerk auth is wired as a thin oRPC-native middleware on top of @clerk/backend, not Clerk's Express SDK
category: engineering
last_updated: 2026-07-21
related:
  - engineering/modules/env-validation.md
  - engineering/overview/infra-and-envs.md
  - engineering/overview/stack.md
---

# Auth module (`@batuto/auth`)

`packages/auth` wraps `@clerk/backend` — Clerk's framework-agnostic core SDK — the same way `@batuto/db` wraps Prisma. See [env-validation.md](env-validation.md) for the general provider-package pattern this follows (env shape exported from `src/env.ts`, a factory taking that typed env, apps composing and parsing once). This document is the Clerk-specific detail that pattern doesn't cover on its own.

## Why `@clerk/backend` directly, not `@clerk/express`

The first version of this package used `@clerk/express`, Clerk's Express-specific adapter. That was reconsidered: `@clerk/express`'s `clerkMiddleware()` is a thin wrapper that internally calls `@clerk/backend`'s `authenticateRequest(request: Request, options)` — a function that takes a standard Fetch `Request`, not an Express `req`. There's no real Express-specific logic in the middleware itself; `@clerk/express` exists purely as a convenience for apps already committed to Express routing conventions (`req.auth`, `app.use()`).

Since `apps/api` is Express-as-transport-only with oRPC handling all real routing (`app.ts` mounts one catch-all handler that delegates to oRPC's `OpenAPIHandler`), going through `@clerk/express` meant threading auth through a layer the app doesn't actually use for anything else. Depending on `@clerk/backend` directly and building a thin oRPC-native middleware instead removed `@clerk/express` and `express` as dependencies of this package entirely — `packages/auth` no longer needs to know Express exists.

## What it exports

- `authEnvShape` / `AuthEnv` — `{ CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY }`.
- `createAuthClient(env: AuthEnv)` — a configured `ClerkClient` (`@clerk/backend`'s `createClerkClient`). `AuthClient` is the exported return type.
- `authenticateRequest(client: AuthClient, request: Request): Promise<AuthResult>` — calls `client.authenticateRequest(request)` and reduces Clerk's `RequestState` down to `{ userId: string | null }` via `.toAuth()`. Framework-agnostic: takes a standard Fetch `Request`, nothing Node- or Express-specific.

## How `apps/api` wires it in

Node's raw `IncomingMessage` isn't a Fetch `Request`, so `apps/api/src/context.ts` builds one per request — reusing `@orpc/standard-server-node`'s `toStandardUrl(req)` for correct URL derivation (handles `x-forwarded-*` the same way oRPC's own Node adapter does) plus a small headers conversion — and calls `authenticateRequest` to produce the oRPC request context:

```ts
export type AppContext = { auth: AuthResult };

export const createContext = async (req: IncomingMessage): Promise<AppContext> => {
  const request = new Request(toStandardUrl(req), { method: req.method, headers: toFetchHeaders(req.headers) });
  return { auth: await authenticateRequest(authClient, request) };
};
```

`app.ts`'s catch-all handler builds this context per request and passes it to `handler.handle(req, res, { context })` — previously this was always `{}`, thrown away.

`apps/api/src/router.ts` defines the oRPC side: `implement<typeof contract, AppContext>(contract)` types the context, and a `requireAuth` middleware (`os.middleware(...)`) checks `context.auth.userId`, throwing `new ORPCError("UNAUTHORIZED")` if absent (oRPC maps this to HTTP 401 automatically) and otherwise narrowing the context so the handler gets a non-nullable `userId`:

```ts
const requireAuth = os.middleware(async ({ context, next }) => {
  if (!context.auth.userId) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { auth: { userId: context.auth.userId } } });
});
```

Applied per-procedure via `.use(requireAuth)` — contract-visible, typed, and using oRPC's own error path instead of a hand-rolled `res.status(401).json(...)`.

## Proof procedure

`privatePing` (`GET /private/ping`, defined in `packages/contract/src/private-ping.ts`) exists solely to prove the middleware blocks unauthenticated requests end-to-end (`apps/api/src/auth.test.ts` asserts a 401 with `code: "UNAUTHORIZED"`). Unlike the original version of this proof (a plain Express route bypassing the contract entirely), this is a real oRPC procedure using `.use(requireAuth)` — the actual pattern future auth-gated business procedures (BAT-27, BAT-29, ...) should copy, not a throwaway shape to replace later.

## Frontend is a separate concern

`apps/web` will use Clerk's React SDK (`@clerk/clerk-react` or similar), not this package — `@batuto/auth` wraps server-side token verification only, the same way `@batuto/db` has no frontend counterpart. `CLERK_PUBLISHABLE_KEY` is not secret and reaches the frontend too, but through its own Vite env var (`VITE_CLERK_PUBLISHABLE_KEY`), not by importing this package. `batuto-web`'s Doppler `dev`/`dev_personal` configs already carry `VITE_CLERK_PUBLISHABLE_KEY`, prepared ahead of the actual frontend wiring (BAT-17).

## Real Clerk application — resolved for dev

A real Clerk application exists (test-mode keys). `batuto-api`'s `dev`/`dev_personal` Doppler configs carry `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`; `batuto-web`'s `dev`/`dev_personal` carry the matching `VITE_CLERK_PUBLISHABLE_KEY`. Verified working: `apps/api/src/auth.test.ts` passes against the real keys (pulled via `env:pull`), confirming `/private/ping` genuinely 401s an unauthenticated request end-to-end, not just against a placeholder.

**Still open:** `prd` configs (both `batuto-api` and `batuto-web`) are still empty — no Clerk Production instance/live keys yet. That's expected to stay open until there's an actual production deploy to point it at (see `infra-and-envs.md`'s environment structure), not a bootstrap blocker.

## Ambient Node types need explicit opt-in with tsgo

`Request`/`Headers` come from `@types/node`'s bundled Fetch API ambient types (`web-globals/fetch.d.ts`), but tsgo did not auto-include them for `packages/auth` the way plain `tsc` typically auto-scans all installed `@types/*` packages when a tsconfig has no `"types"` field. `apps/api/tsconfig.json` already had `"types": ["node"]` set explicitly (predating this change) for the same reason. `packages/auth`'s three tsconfigs (`tsconfig.json`, `tsconfig.build.json`, `tsconfig.declaration.json`) now set it too — the working rule for this repo's tsgo setup is: any package referencing bare Node/Fetch ambient globals (`process`, `Request`, `Headers`, ...) needs `"types": ["node"]` declared explicitly, it will not be picked up automatically.
