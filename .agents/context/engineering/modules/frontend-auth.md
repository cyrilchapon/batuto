---
title: Frontend auth (@clerk/react-router)
summary: Clerk's React Router SSR SDK, wired via a root middleware + rootAuthLoader, with the secret key kept out of the Vite client bundle by construction
category: engineering
last_updated: 2026-07-21
related:
  - engineering/modules/auth.md
  - engineering/overview/infra-and-envs.md
---

# Frontend auth (`@clerk/react-router`)

`apps/web` uses `@clerk/react-router`, not the plain `@clerk/clerk-react` — because `react-router.config.ts` sets `ssr: true`, and `@clerk/react-router` is Clerk's SDK built specifically for React Router's framework-mode SSR (loaders, middleware, a server-rendered auth state), where `@clerk/clerk-react` would only give client-side auth with no SSR support. Under the hood it's the same `@clerk/backend` core the API backend uses (see [auth.md](auth.md)) — Clerk's React Router package is one more thin adapter over that shared core, same as `@clerk/express` would have been for Express.

## Wiring

`app/root.tsx`:

- `export const middleware: Route.MiddlewareFunction[] = [clerkMiddleware({ publishableKey, secretKey })]` — a real React Router v8 middleware (stable in v8, no future flag needed — the flag mentioned in Clerk's own JSDoc is v7-only). This is what actually authenticates the request; without it, `rootAuthLoader`/`getAuth` throw `"clerkMiddleware() not detected"` rather than silently no-op-ing.
- `export async function loader(args) { return rootAuthLoader(args); }` — bridges the middleware's resolved auth state into `loaderData`, which `<ClerkProvider loaderData={loaderData} publishableKey={...}>` (wrapping `<Outlet/>`) needs to hydrate client-side without a flash of unauthenticated content.
- Both imported from `@clerk/react-router/server`, not `@clerk/react-router/ssr.server` — the latter is deprecated in this version and only differs in import path, but using it prints a deprecation warning on every request.

Protected routes call `getAuth(args)` (same `@clerk/react-router/server` import) in their own `loader`, redirecting when `userId` is absent — `app/routes/dashboard.tsx` is the proof route for this, mirroring `apps/api`'s `/private/ping`. Sign-in itself uses Clerk's hosted `<SignIn />` component mounted at a splat route (`sign-in/*` in `app/routes.ts`) so Clerk's own internal step navigation (email verification, MFA, ...) stays under that path prefix.

`<SignedIn>`/`<SignedOut>` don't exist in the installed Clerk version — they were replaced by a single `<Show when="signed-in">`/`<Show when="signed-out">` component. Check the installed version's actual exports before assuming component names from older Clerk docs or memory; this project got it wrong on the first pass and had to fix it against the real `.d.ts`.

## Why the secret key doesn't leak into the client bundle

`CLERK_SECRET_KEY` is read via a dedicated `app/env.server.ts` (parsed from plain `process.env`, not `import.meta.env`) — deliberately not folded into the existing client-safe `app/env.ts` (which reads `import.meta.env`, Vite's client-exposed env). Two reasons this split matters, not just style:

1. **React Router's `.server.ts` suffix convention** strips that module from the client bundle at build time — a hard guarantee, not a runtime check. Verified directly: `grep`ing the built `build/client/` output for the secret key's value found nothing; the only match for the string `CLERK_SECRET_KEY` anywhere in the client bundle is a generic error-message literal baked into Clerk's own SDK code, not a leaked value.
2. **`process.env` needs to actually be populated** for that server-only code to read a real value — `apps/web`'s `dev`/`start` scripts are now `dotenv-cli`-wrapped (`dotenv -e .env.local -e .env -- ...`), matching `apps/api`/`packages/db`'s existing pattern, specifically because of this. See `infra-and-envs.md` for why this is a change from the original assumption that `apps/web` needed no such wiring.

`VITE_CLERK_PUBLISHABLE_KEY` stays in the ordinary client-safe `app/env.ts` — it's not a secret, and both `clerkMiddleware()` (server) and `<ClerkProvider>` (client) need the same value, so reading it once from the client-safe source and passing it explicitly to both is simpler than duplicating it into the server-only file too.

## A known upstream dev-SSR bug: `ssr.noExternal`

Without `ssr: { noExternal: ["@clerk/react-router"] }` in `vite.config.ts`, every page fails in dev with `useNavigate() may be used only in the context of a <Router> component`, thrown from inside `ClerkProvider`. This is a known Clerk/React Router issue ([clerk/javascript#4826](https://github.com/clerk/javascript/issues/4826)): Vite's dev-server externalizes `@clerk/react-router` by default, which pulls in a second copy of `react-router` whose context doesn't match the app's — `useNavigate()` (used internally by `ClerkProvider`) then can't find the router. Forcing it into `noExternal` fixes it; production builds were unaffected either way (Vite doesn't externalize during a real build).

## Package pinning note: Yarn quarantine

`@clerk/react-router` is pinned to `^3.5.12`, not the newer `3.5.13` available at the time this was wired — `3.5.13` was published hours before this work and Yarn's supply-chain quarantine (a lag window for very recently published packages) rejected it outright at `yarn install`. The caret range still lets a future `yarn install` pick up `3.5.13`+ automatically once it clears quarantine; nothing needs to be manually bumped back.
