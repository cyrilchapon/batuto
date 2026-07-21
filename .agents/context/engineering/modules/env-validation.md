---
title: Env validation convention
summary: "@batuto/env's parseEnvFromSchema, provider packages exporting a typed env shape, and apps composing them into one validated appEnv"
category: engineering
last_updated: 2026-07-21
related:
  - engineering/overview/monorepo-layout.md
  - engineering/overview/infra-and-envs.md
---

# Env validation convention

Every runnable app (`apps/api`, `apps/web`, and any future one) parses and validates its full environment through Zod at startup, rather than reading `process.env`/`import.meta.env` ad hoc wherever a value is needed. Three layers, each with a fixed responsibility:

## 1. `@batuto/env` — the parsing primitive

A tiny shared package (`packages/env`), one export:

```ts
export const parseEnvFromSchema =
  <T extends object>(schema: ZodType<T>) =>
  (rawEnv: object): T =>
    schema.parse(rawEnv);
```

Curried so a schema can be bound once (`const parseAppEnv = parseEnvFromSchema(appEnvSchema)`) and reused. This is the only place `schema.parse` gets called — everything downstream just imports the resulting typed value.

## 2. Provider packages — export a shape, not a schema

Any package that wraps an external integration (`@batuto/db` wrapping Prisma/Neon today; the same pattern applies to any future Clerk/Betterstack/etc. package) exports its env needs as a plain **shape object** — not a `z.object(...)` instance — plus the inferred type, from its own `src/env.ts`:

```ts
export const dbEnvShape = {
  DATABASE_URL: z.string(),
};

export type DbEnv = z.infer<z.ZodObject<typeof dbEnvShape>>;
```

Exporting the raw shape (not a pre-built `ZodObject`) is what lets an app spread several providers' shapes into one combined `z.object({...shapeA, ...shapeB, OWN_VAR: z.string()})` without nesting.

The provider's client construction becomes a factory taking that typed env, replacing any singleton that used to read `process.env` directly — `@batuto/db`'s `src/client.ts`:

```ts
export const createDb = (env: DbEnv) => {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

export type Db = ReturnType<typeof createDb>;
```

(The exported `Db` type is needed, not optional: `tsgo`'s declaration emit can't always name the inferred return type of a generic factory across a package boundary — annotate the instantiation site with it explicitly, e.g. `export const db: Db = createDb(appEnv);`, or `check:type`/`build:declaration` fails with "inferred type ... cannot be named without a reference to ...".)

## 3. Apps — compose, parse once, use everywhere

Each app's own `src/env.ts` (or `app/env.ts` for `apps/web`) spreads every provider shape it needs plus its own direct vars into one schema, parses once against the real raw env, and exports the result:

```ts
import { dbEnvShape } from "@batuto/db";
import { parseEnvFromSchema } from "@batuto/env";
import { z } from "zod";

const appEnvSchema = z.object({
  ...dbEnvShape,
  PORT: z.coerce.number().default(3001),
  WEB_URL: z.string().default("http://localhost:5173"),
});

export const appEnv = parseEnvFromSchema(appEnvSchema)(process.env);
```

`appEnv` is exported as a module-level constant (not dependency-injected) — this repo's apps are small enough that DI would be pure ceremony; revisit if that stops being true. Consumers import `appEnv` directly (`apps/api/src/app.ts`'s CORS `origin`, `apps/api/src/index.ts`'s `PORT`) or receive a provider client built from it (`apps/api/src/db.ts`: `export const db: Db = createDb(appEnv);`, imported by `router.ts` and `hello.test.ts` instead of either reaching into `@batuto/db` directly).

`apps/web` follows the same shape with one difference: the raw env is `import.meta.env` (Vite's real runtime object, not just its per-reference static-replace optimization — passing the whole object to a generic parser works) instead of `process.env`.

## Why parse instead of `?? fallback`-ing individual reads

The old pattern (`process.env.PORT ?? 3001` scattered at each read site) tolerates a malformed or missing var silently at the point of use, however deep in the call stack that happens to be. Parsing the whole schema once at startup fails fast, in one place, with a clear Zod error naming exactly which var is wrong — before the app does anything with a bad value. `.default(...)` on individual schema fields preserves the same "missing var is fine, here's the fallback" behavior where that's actually wanted (`PORT`, `WEB_URL`, `VITE_API_URL`); required fields with no default (`DATABASE_URL`) now genuinely fail startup instead of quietly connecting to `undefined`.
