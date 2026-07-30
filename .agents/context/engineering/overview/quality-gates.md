---
title: "Quality gates — check:/fix: scripts"
summary: check:type (tsgo), check:lint/format/assist (Biome), check:unused (Knip), check:depsync (Syncpack) — how to check after working, how to fix what's found, and why every invocation goes through turbo directly
category: engineering
last_updated: 2026-07-21
related:
  - engineering/overview/monorepo-layout.md
  - engineering/overview/stack.md
  - engineering/overview/infra-and-envs.md
---

# Quality gates — check:/fix: scripts

Every quality check in this repo follows one naming convention: `check:<thing>` is always pure (never writes to disk), and `fix:<thing>` is its mutative counterpart where one exists. There is no `fix:type` — there's nothing a tool can auto-fix about a type error. Checks and fixes are deliberately **not** bundled behind aggregate commands (no `yarn check`, no `yarn fix`) — run the one(s) relevant to what you're doing, individually.

## turbo-first: invoke turbo directly, don't wrap it in yarn aliases

**The rule:** `turbo.json` tasks proxy to `package.json` scripts — never the other way around. Don't add a root `package.json` script whose body is just `"turbo run <task>"`; that's an indirection that hides what's actually running and stops you from reaching for turbo's own flags (`--filter`, `--dry`, `--force`, etc.) without fighting through a yarn alias first.

Concretely:

- Root `package.json` only holds **atomic** scripts — the actual tool invocations (`"check:lint": "biome lint ."`, `"check:unused": "knip"`, etc.) that `turbo.json`'s root tasks (`//#check:lint`, `//#check:unused`, ...) reference. It does **not** hold `"build": "turbo run build"`-style pass-throughs.
- To run anything that benefits from turbo's dependency graph, parallelism, or cache — `check:type`, `build`, `build:declaration`, `test`, `dev`, or any of the root-only checks — invoke turbo directly: `yarn turbo run <task>` (Yarn resolves `turbo` as a workspace-installed binary; this is not a proxy script, it's running the real CLI). CI does exactly this — see the workflow files below.
- `turbo run <taskname>` does **not** automatically pick up a root-only task — those are registered as `//#<taskname>` in `turbo.json` and must be referenced with that exact `//#` prefix (e.g. `yarn turbo run //#check:lint`), never bare.
- No script chains multiple other scripts either — same reasoning as the no-aggregate-`check`/`fix` rule below: run the atomic one(s) relevant to what you're doing.

This exists specifically so automation (CI first, but also any future scripting) gets turbo's caching for free instead of silently bypassing it through a yarn indirection layer.

## How to check after working

| Script | Tool | Scope | Invocation |
|---|---|---|---|
| `check:type` | `tsgo` (TypeScript 7 native preview) | Per-package, fans out via Turborepo | `yarn turbo run check:type` |
| `check:lint` | Biome | Global, one invocation from the root | `yarn turbo run //#check:lint` (or `yarn check:lint` uncached) |
| `check:format` | Biome | Global | `yarn turbo run //#check:format` |
| `check:assist` | Biome (assist actions only, e.g. `organizeImports`) | Global | `yarn turbo run //#check:assist` |
| `check:unused` | Knip | Global | `yarn turbo run //#check:unused` |
| `check:depsync` | Syncpack | Global | `yarn turbo run //#check:depsync` |

Run the ones relevant to what changed. `yarn turbo run check:type //#check:lint //#check:format //#check:assist //#check:unused //#check:depsync` runs all six in a single turbo invocation (still not a package.json alias — it's one direct turbo call with six task arguments) when you want the full sweep locally before pushing.

## How to fix

Run the `fix:` variant for whatever you just found broken: `fix:lint`, `fix:format`, `fix:assist`, `fix:unused`, `fix:depsync`. When running more than one by hand, format → assist → lint → depsync → unused is a sensible order (code style settles before Knip's `--fix` potentially removes files/exports), but there's no script that chains them for you.

`fix:lint` and `fix:assist` pass Biome's `--unsafe` flag — real auto-fixes, not just the safe subset, since these are developer-triggered and expected to be reviewed via `git diff` before committing. `fix:unused` passes Knip's `--allow-remove-files`, meaning it can delete files it considers fully unused — always review its diff, don't blindly trust it in a script.

None of the `fix:*` scripts are wired into CI. CI only ever runs `check:*` — fixing is a local, human-reviewed action.

## Why tsgo, not tsc

Every TypeScript-backed project in this repo uses `tsgo` (`@typescript/native-preview`, the TypeScript 7 native compiler preview) for typechecking, not `tsc`. Each package/app that runs `check:type` declares its own `@typescript/native-preview` devDependency (don't rely on hoisting — declare it explicitly per package, the way every other direct usage is declared).

tsgo's declaration (`.d.ts`) emit is more mature than early previews suggested, verified working for this repo's real packages including cross-package type resolution — see the `build`/`build:declaration` split below.

## Shared tool configs live in `packages/config/`, not the repo root

`packages/config/typescript` is a real workspace package (`@batuto/config-typescript`, `private: true`, no build step — just `.json` files exposed through `package.json` `exports`). It holds `base.json`, `build.json`, and `declaration.json`. Every consumer declares `"@batuto/config-typescript": "workspace:*"` as a devDependency and extends it by package name:

```json
{ "extends": "@batuto/config-typescript/base.json" }
```

**Never** `"extends": "../../tsconfig.base.json"` — a relative reach into the repo root. The repo root is not "the shared place" for monorepo-wide tool config; a real (even if unpublished) workspace package is, the same way any other cross-cutting dependency is modeled in this repo. If another locally-installed CLI tool ever needs its config shared across sub-packages the same way (none do yet), it gets its own `packages/config/<tool>` package rather than a root-level file — that's the general pattern, not something specific to TypeScript.

## The build / build:declaration / check:type split (dependency-packages only)

This applies to `packages/dtos`, `packages/contract`, and `packages/db` — the packages other packages/apps depend on. It does **not** apply to `apps/api` or `apps/web` (leaf apps, nothing depends on them — they only have `check:type`, plus their own normal `build`/`dev` scripts as needed).

Each dependency-package exposes three pure, non-overlapping scripts:

- **`check:type`** — `tsgo -p tsconfig.json --noEmit`. Typecheck only, no artifacts.
- **`build`** — `tsgo -p tsconfig.build.json`, emits JS only (no declarations) to `dist/`. Uses `--noCheck`, so it strips types per-file without resolving the full dependency type graph — this is what makes it safe for `build` to depend only on its dependencies' `build` (JS), not their `build:declaration` (types): a `--noCheck` compile genuinely doesn't need any dependency's types to succeed.
- **`build:declaration`** — `tsgo -p tsconfig.declaration.json`, emits `.d.ts` only (no JS) to `dist-types/`. This one *does* need full type resolution, so it needs its dependencies' `build:declaration` to have already run (their `dist-types/` must exist for import resolution to succeed).

A package's `package.json` points `main` at `./dist/index.js` and `types` at `./dist-types/index.d.ts` (both under `exports`, plus a flat top-level fallback for older tooling). Each package's own `tsconfig.build.json`/`tsconfig.declaration.json` extends `@batuto/config-typescript`'s matching partial and only adds `outDir`/`rootDir`.

## `codegen` / `codegen:declaration` — code generation is never a side effect of another task

Some packages need a code-generation step before anything else can run against them: `packages/db`'s `prisma generate` (writes real runtime code *and* types to `src/generated`) and `apps/web`'s `react-router typegen` (writes types only, to `.react-router/types`, nothing runtime). These are their own tasks, never inlined into `check:type`, `build`, or `build:declaration` — every one of those has to stay pure (no side effects, `check:type` above all: a typecheck that silently writes files on disk is not a typecheck you can trust).

Two standard tasks, declared once at the top level of `turbo.json` (not per-package overrides) so any current or future package picks them up automatically just by defining the matching script:

- **`codegen`** — for generators that produce real runtime code (possibly bundled with types, like Prisma's). `packages/db` is the only package that defines it today: `"codegen": "prisma generate"`.
- **`codegen:declaration`** — for generators that produce types only, nothing runtime. `apps/web` is the only package that defines it today: `"codegen:declaration": "react-router typegen"`.

Every dependency edge below is only added where a task genuinely reads something the upstream task produces — nothing is wired "just in case" (see the no-`^codegen` note below for what that ruled out).

### `dependsOn` wiring (`turbo.json`)

```
codegen             (no dependsOn)
codegen:declaration (no dependsOn)
build                dependsOn ^build, codegen                        (JS-only, --noCheck — no type resolution, so no codegen:declaration, no ^build:declaration)
build:declaration    dependsOn ^build:declaration, codegen             (compiles the same real source build does, just emits .d.ts — needs the same own-package codegen, not codegen:declaration)
check:type           dependsOn ^build:declaration, codegen, codegen:declaration   (deps' types, plus both flavors of its own package's generated source)
test                 dependsOn ^build                                  (runtime imports, no type resolution needed)
dev                  dependsOn ^build                                  (tsx/vite resolve workspace deps via their compiled dist/)
```

Three things worth calling out, because each one looks plausible until you check what actually reads what:

- **`codegen`/`codegen:declaration` don't `dependsOn` their `^` (cross-package) counterpart.** No package's generator currently reads another workspace package's generated output — `prisma generate` reads `schema.prisma`, `react-router typegen` reads `apps/web`'s own route files. A `^codegen` edge here would be a no-op today for every package, added purely on spec. Add it back if and when a real package needs it (most likely pattern: a codegen step consuming a dependency's *build* output, e.g. an OpenAPI client generated from a built contract — which would be a dependency on `^build`, not `^codegen`, anyway).
- **`build` doesn't `dependsOn` `codegen:declaration`.** `codegen:declaration` produces *types only* (`apps/web`'s `.react-router/types`) — irrelevant to a `--noCheck` JS emission that never resolves types in the first place. Same reasoning that already keeps `build` off `^build:declaration`.
- **`check:type` doesn't `dependsOn` its own-package `build:declaration`.** This used to be there (see `check:type`'s history below) purely to force `packages/db`'s inlined `prisma generate` to run before typechecking — a side effect of a design that's since been replaced by the `codegen` task itself. Now that `check:type` depends on own-package `codegen`/`codegen:declaration` directly, depending on `build:declaration` too would just force an irrelevant `dist-types/` emission before every typecheck for no reason `check:type` actually needs.

The `^build:declaration` edge on `check:type` is unchanged and still real: typechecking a package that imports `@batuto/contract` needs `@batuto/contract`'s `dist-types/index.d.ts` to exist, because `package.json`'s `types` field points there, not at source. That's a *dependency's* build:declaration — the caret matters. The historical bug this entire split was built to catch (a package with no workspace dependencies, like `packages/db`, still needing *its own* codegen to run before it can typecheck itself, because `^build:declaration` alone only ever covers dependencies) is now fixed by the direct `codegen`/`codegen:declaration` same-package edges on `check:type`, not by a same-package `build:declaration` edge.

The four "global" checks (`check:lint`, `check:format`, `check:assist`, `check:unused`, `check:depsync`) are registered in `turbo.json` as **root tasks** (`//#check:lint` etc.) — Turborepo's mechanism for a task that only ever runs once, against the root `package.json`'s own script, never fanning out per-workspace. `turbo run <taskname>` does **not** automatically pick these up; they have to be referenced explicitly with the `//#` prefix.

`//#check:unused` (Knip) is the one root task with a real cross-package dependency: it scans `apps/web`'s source, which imports React Router's generated route types (`./+types/...`), so it needs those files on disk first. It `dependsOn` `@batuto/web#codegen:declaration` directly — not `@batuto/web#check:type` — because what Knip needs is the generated file existing, not web's typecheck having passed; coupling it to `check:type` would mean an unrelated type error in `apps/web` blocks Knip from running at all, which has nothing to do with what Knip actually checks.

### Env vars: `envMode: "loose"` + hashing `.env*` as a global dependency, not `passThroughEnv`

Turborepo defaults to **strict env mode**: a task's subprocess only sees a filtered baseline environment, not whatever the invoking shell (or a GitHub Actions job's `env:` block) exported. The obvious fix — enumerating every var a task needs under that task's `passThroughEnv` in `turbo.json` — doesn't scale once the app has dozens of env vars (Clerk, AppSignal, Neon, etc. once wired), so this repo doesn't use it.

Instead, root `turbo.json` sets `"envMode": "loose"` (every var the process inherits reaches every task, no enumeration, ever) paired with `"globalDependencies": ["**/.env*"]` (any `.env*` file's *content*, anywhere in the repo, is hashed into every task's cache key). This restores the cache-correctness that loose mode alone gives up: a changed secret still busts the cache, just via file hashing instead of a maintained var allowlist. The `**/` prefix is required — `globalDependencies` globs are resolved from the repo root, not per-package, and a bare `.env*` pattern does **not** reach nested files like `apps/api/.env` (verified empirically: editing a nested `.env` left every task's hash unchanged with `.env*`, and changed every task's hash with `**/.env*`). This is deliberately coarse — any `.env*` change busts *every* task's cache, not just the ones that read that var — which is the right trade for "dozens of vars, minimal upkeep" over precise per-var invalidation.

This is why `apps/api`'s test originally failed in CI with a Postgres SASL auth error (`client password must be a string`, `DATABASE_URL` genuinely `undefined` inside the `vitest` subprocess despite being set at the job level) — it stayed invisible locally because every package's gitignored `.env` file made the var available regardless of what turbo was filtering, and CI has no `.env` files to fall back on.

`.env` files are the actual long-term local-dev mechanism here, not a Phase-1 stopgap replaced by `doppler run --` — see `infra-and-envs.md` for the `env:pull` convention (Doppler → `.env` file per runnable package) once Doppler is wired.

### Cache hits don't replay side effects that aren't declared as `outputs`

`prisma generate` (writes `packages/db/src/generated`) and `react-router typegen` (writes `apps/web/.react-router/types`) are side effects of running a task for real. On a turbo **cache hit**, the task's command never actually re-executes — only its declared `outputs` get restored to disk, and its logs get replayed. If a directory a downstream task's compiler needs to read isn't declared as an output, a cache hit silently leaves it missing (or stale) even though the log replay makes it look like everything succeeded.

This is precisely why `codegen`/`codegen:declaration` are their own tasks rather than a step glued onto `build`/`build:declaration`/`check:type`: each declares its own `outputs` (`codegen` → `src/generated/**`, `codegen:declaration` → `.react-router/**`), so a cache hit on `codegen` correctly restores `packages/db/src/generated` on disk *before* anything that depends on it runs — no output ever has to be smuggled into an unrelated task's `outputs` list. (An earlier version of this setup did exactly that — package-specific overrides on `@batuto/db#build`, `@batuto/db#build:declaration`, and `@batuto/web#check:type` — before the codegen split existed; those overrides are gone now, made unnecessary by giving the side effect its own tracked task.)

### `packages/db` is not a special case

Prisma's generator writes into `packages/db/src/generated` (not a sibling folder outside `src/`), and a small barrel (`packages/db/src/index.ts`) re-exports it. This means the generated client compiles through the exact same `build`/`build:declaration` pipeline as hand-authored source — no special-casing needed in the scripts themselves, since `build`/`build:declaration` `dependsOn` the package's own `codegen` task and never call `prisma generate` directly.

One gotcha this setup required: Prisma's generated files author their own cross-references with a literal `.ts` extension (`import ... from "./enums.ts"`). Emitting that verbatim into `dist/*.js` breaks at runtime (Node/tsx would look for a `.ts` file that no longer exists next to the compiled `.js`). Fixed with `"rewriteRelativeImportExtensions": true` in `@batuto/config-typescript`'s `base.json` — tsgo rewrites `.ts`/`.tsx` extensions in relative imports to their JS equivalent in JS output. Declaration (`.d.ts`) output still contains the literal `.ts` extensions, but that's fine and expected: TypeScript's own resolver understands `.ts`-suffixed specifiers inside `.d.ts` files as referring to the sibling declaration file, so cross-package type resolution works correctly regardless.

## Knip and Syncpack — config lives close to what it ignores

`knip.json` and `.syncpackrc.json` are both at the repo root (these are genuinely repo-wide orchestration configs, not per-package build config — they don't fit the `packages/config/` pattern above, which is specifically for config that individual packages *extend*). Knip's config declares per-workspace `entry`/`project` globs (kept minimal — Knip's framework plugins auto-detect most of this; only add explicit config where its own "configuration hints" ask for it) plus targeted `ignoreDependencies` for real-but-untraceable usage (CSS-only imports like `@import "tailwindcss"`, or a dependency only used by Prisma's generated code, which Knip's default `generated/` folder-name ignore skips scanning). Syncpack's config pins every `@batuto/*` internal package to the `workspace:*` protocol and requires caret ranges everywhere else.

When either tool flags something, resist the urge to reflexively add an ignore — check whether it's a real unused dependency/export/version-mismatch first. Ignores should always carry an implicit or explicit reason (see the `ignoreDependencies` entries in `knip.json` for the pattern).

## CI

Three separate workflow files, not three jobs in one file: `.github/workflows/checks.yml` (no database needed, one step per check, fast), `.github/workflows/build-and-test.yml` (needs the local Postgres service container, runs `prisma migrate deploy` then `build` then `test`), and `.github/workflows/db-checks.yml` (`check:schema`/`check:migrations`, each against its own ephemeral Neon branch — see `infra-and-envs.md`'s "CI database checks" section). Split this way so the fast static checks don't wait on — or get blocked by — database setup, and each check's pass/fail is independently visible in the PR checks list rather than buried inside one combined job.

All three trigger on PRs and pushes targeting `dev` — the current default/trunk branch. `main` doesn't exist yet; it's reserved for a future production branch. Re-point these triggers at `main` (or add it alongside `dev`) once that branch exists and takes over as the deploy target — see `infra-and-envs.md`/Doppler environment structure for when that's likely to happen.

**`actions/setup-node`'s `cache: yarn` input is incompatible with a Corepack-pinned Yarn version and must not be used.** `setup-node` resolves the yarn cache directory *during its own step*, before any later `corepack enable` step gets a chance to run — so it always shells out to whatever `yarn` happens to be on the runner's default PATH (classic Yarn 1.x), which immediately errors on a repo pinning `packageManager: "yarn@4.x"` via Corepack. The fix isn't step-reordering (moving `corepack enable` earlier doesn't reliably survive `setup-node` prepending Node 22's own toolcache bin dir to `PATH`, which can re-shadow the shim) — it's dropping `cache: yarn` entirely and just not caching the yarn install for now. Order stays `checkout` → `setup-node` (no `cache` input) → `corepack enable` → `yarn install --immutable`.

Every step in all three workflows invokes `turbo` directly (`yarn turbo run <task>`) or `yarn workspace <pkg> <script>` for one-off, non-turbo scripts (`migrate:deploy`, `check:schema`) — never a root `package.json` alias — per the turbo-first rule above. `check:schema`/`check:migrations` aren't turbo tasks: they depend on live, non-deterministic external state (an ephemeral Neon branch created fresh each run), which turbo's caching model has nothing meaningful to offer.
