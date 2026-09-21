---
title: Adding an API procedure end to end
summary: The DTO → contract → handler → client chain in practice, plus the two things it gets wrong silently — errors that never reach AppSignal, and the Clerk token the browser has to attach per request
category: engineering
last_updated: 2026-09-20
related:
  - engineering/overview/monorepo-layout.md
  - engineering/modules/auth.md
  - engineering/modules/frontend-auth.md
  - engineering/modules/logs.md
---

# Adding an API procedure end to end

[monorepo-layout.md](../overview/monorepo-layout.md) explains *why* DTOs → contract → (backend, frontend) is a real dependency chain. This document is the working recipe for adding one link to it, and — more importantly — the two places where the obvious code is quietly wrong.

It was written when the bootstrap proof procedures (`hello`, `privateHello`, `boom`, from BAT-23) were removed. Those procedures were the only worked examples of several of these steps, so what they demonstrated is written down here rather than left to be rediscovered.

## The chain, one step per package

1. **`packages/dtos`** — the Zod shape, if the payload is worth naming. One file per concept, re-exported from `src/index.ts`. Small inline shapes (`z.object({ userId: z.string() })`) can live in the contract; anything shared between procedures, or meaningful to the domain, belongs here. DTOs are the source of truth for shapes across the repo.
2. **`packages/contract`** — one file per procedure, exporting an `oc.route({ method, path }).input(...).output(...)`, added to the `contract` object in `src/index.ts` and re-exported. Paths under `/private/*` are the convention for authenticated procedures.
3. **`apps/api/src/router.ts`** — implement it with `os.<name>.handler(...)`, adding `.use(requireAuth)` for anything authenticated. The `os` object is `implement<typeof contract, AppContext>(contract)`, so the handler is typed against the contract and the context both. See [auth.md](auth.md) for the middleware itself and for how `context.auth.userId` is narrowed to non-nullable.
4. **Tests** — a contract test asserting method and path (`packages/contract/src/*.test.ts`), and a `supertest` test against `createApp()` in `apps/api`. For an authenticated procedure, assert the 401 with no token, the way `apps/api/src/auth.test.ts` does for `privatePing`.
5. **`apps/web`** — consume it through the typed client, below.

`check:type` will not catch a procedure you added to the contract and forgot to implement until something calls it, so add the handler in the same change as the contract.

## Errors: oRPC swallows throws, so AppSignal has to be told

**This is the one that looks fine and silently loses production errors.** `apps/api/src/app.ts` mounts `expressErrorHandler()` from `@appsignal/nodejs` after all routes, which is the normal way an Express app reports errors. It never fires for a procedure, because the app's real routing is oRPC, not Express: the `OpenAPIHandler` catches whatever a handler throws, turns it into an error response itself, and returns `matched: true` — so `next(err)` is never called and Express's error middleware is never reached.

A handler that throws therefore produces a correct HTTP error response and **no AppSignal report at all**. To report an unexpected failure, call `sendError` explicitly:

```ts
import { sendError } from "@appsignal/nodejs";

const error = new Error("...");
sendError(error);
throw error;
```

This applies to genuinely unexpected failures. Deliberate, typed rejections — `throw new ORPCError("UNAUTHORIZED")`, a validation failure, a 404 for a missing row — are part of the contract, not incidents, and should not be reported.

If oRPC-level error reporting is ever wired properly (a handler plugin, the way [logs.md](logs.md) discusses for Pino), this manual step goes away. Until then it is per-handler and easy to forget.

## Calling it from the frontend

`apps/web/app/lib/orpc.ts` builds one `OpenAPILink` against the contract at module load and exports two things:

- **`orpc`** — `createORPCReactQueryUtils(client)`, the React Query surface: `orpc.<name>.queryOptions({ input, context })` for a `useQuery`, `orpc.<name>.mutationOptions(...)` for a mutation. This is the default path.
- **`orpcClient`** — the raw typed client, for an imperative call outside React Query.

The link is typed `OpenAPILink<OrpcClientContext>` where `OrpcClientContext` is `{ token?: string }`, and its `headers` callback turns that context into `Authorization: Bearer <token>`.

**Why a per-call context rather than a token baked into the link:** the link is constructed once, at module load, while a Clerk session token is short-lived and has to be fetched fresh per request, from Clerk's `useAuth()`.

That makes `context` awkward with React Query, and there is a trap here worth knowing before writing the obvious thing. `queryOptions`' `context` is a **plain value**, resolved once when the options object is built — it is not a thunk, and oRPC has no async-context hook. Passing `context: async () => ({ token })` **typechecks and then silently sends no `Authorization` header**, because `OrpcClientContext` is `{ token?: string }` — every property optional, so a function satisfies the type structurally while `options.context?.token` reads `undefined` at request time.

So await the token inside `queryFn`, and take the query key from the utils so it still matches what `invalidateQueries` expects:

```ts
const { getToken } = useAuth();

const ping = useQuery({
  queryKey: orpc.privatePing.key(),
  queryFn: async () => {
    const token = await getToken();
    return orpcClient.privatePing(undefined, { context: { token: token ?? undefined } });
  },
});
```

A public procedure needs none of this — `useQuery(orpc.<name>.queryOptions({ input }))` is enough. Getting the authenticated case wrong fails as a 401 at runtime rather than as a type error, so when a call returns 401 in the browser but works from `curl` with a token, this is the first thing to check. See [frontend-auth.md](frontend-auth.md) for how Clerk itself is wired into the React Router SSR app.

## What is deliberately not here

No procedure currently reads the database — the first ones will arrive with [BAT-42](https://linear.app/cyc-personal/issue/BAT-42/band-membership-and-roster-api). `apps/api/src/db.ts` exports a ready `db` client (`createDb(appEnv)`), and [data-model.md](data-model.md) covers the schema-side conventions those handlers will need, including the band-scoping rules every read and write has to respect.
