---
title: "Quality gates — check:/fix: scripts"
summary: check:type (tsgo), check:lint/format/assist (Biome), check:unused (Knip), check:depsync (Syncpack) — how to check after working, how to fix what's found, and why every invocation goes through turbo directly
category: engineering
last_updated: 2026-07-17
related:
  - engineering/overview/monorepo-layout.md
  - engineering/overview/stack.md
---

# Quality gates — check:/fix: scripts

Every quality check in this repo follows one naming convention: `check:<thing>` is always pure (never writes to disk), and `fix:<thing>` is its mutative counterpart where one exists. There is no `fix:type` — there's nothing a tool can auto-fix about a type error. Checks are deliberately **not** bundled behind a single aggregate command (no `yarn check`) — run the one(s) relevant to what you're doing, individually.

## turbo-first: invoke turbo directly, don't wrap it in yarn aliases

**The rule:** `turbo.json` tasks proxy to `package.json` scripts — never the other way around. Don't add a root `package.json` script whose body is just `"turbo run <task>"`; that's an indirection that hides what's actually running and stops you from reaching for turbo's own flags (`--filter`, `--dry`, `--force`, etc.) without fighting through a yarn alias first.

Concretely:

- Root `package.json` only holds **atomic** scripts — the actual tool invocations (`"check:lint": "biome lint ."`, `"check:unused": "knip"`, etc.) that `turbo.json`'s root tasks (`//#check:lint`, `//#check:unused`, ...) reference. It does **not** hold `"build": "turbo run build"`-style pass-throughs.
- To run anything that benefits from turbo's dependency graph, parallelism, or cache — `check:type`, `build`, `build:declaration`, `test`, `dev`, or any of the root-only checks — invoke turbo directly: `yarn turbo run <task>` (Yarn resolves `turbo` as a workspace-installed binary; this is not a proxy script, it's running the real CLI). CI does exactly this — see the workflow files below.
- `turbo run <taskname>` does **not** automatically pick up a root-only task — those are registered as `//#<taskname>` in `turbo.json` and must be referenced with that exact `//#` prefix (e.g. `yarn turbo run //#check:lint`), never bare.
- The only scripts that legitimately chain multiple `yarn` commands are the `fix:*` convenience ones (`fix`, dev-only, never used by turbo or CI) — those aren't proxying to turbo, so the rule above doesn't apply to them.

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

`yarn fix` runs every fixable check's `fix:` variant in a safe order (format → assist → lint → depsync → unused — code style settles before Knip's `--fix` potentially removes files/exports, so the resulting diff is clean). Individual variants: `fix:lint`, `fix:format`, `fix:assist`, `fix:unused`, `fix:depsync`.

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

### `dependsOn` wiring (`turbo.json`)

```
check:type        dependsOn ^build:declaration, build:declaration   (deps' types AND its own — see below)
build              dependsOn ^build                                  (JS-only, --noCheck, doesn't strictly need deps' types)
build:declaration  dependsOn ^build:declaration                      (needs deps' types to resolve its own)
test               dependsOn ^build                                  (runtime imports, no type resolution needed)
dev                dependsOn ^build                                  (tsx/vite resolve workspace deps via their compiled dist/)
```

Note `check:type`'s **same-package** `build:declaration` dependency (no `^`, unlike everything else in that list): a package with no workspace dependencies at all (like `packages/db`) still needs *its own* codegen to have run before it can typecheck itself — `^build:declaration` alone only covers *dependencies*, never the package's own tasks. This was a real, initially-masked bug: it only surfaced once `packages/db/src/generated` was deleted and rebuilt from a genuinely clean state, because leftover artifacts from an earlier run had been silently satisfying the missing edge.

The four "global" checks (`check:lint`, `check:format`, `check:assist`, `check:unused`, `check:depsync`) are registered in `turbo.json` as **root tasks** (`//#check:lint` etc.) — Turborepo's mechanism for a task that only ever runs once, against the root `package.json`'s own script, never fanning out per-workspace. `turbo run <taskname>` does **not** automatically pick these up; they have to be referenced explicitly with the `//#` prefix.

### Turbo's strict env mode strips env vars that aren't declared

By default Turborepo runs tasks in **strict env mode**: a task's subprocess only sees a filtered baseline environment, not whatever the invoking shell happened to have exported — even a var set at the GitHub Actions job level. `DATABASE_URL` and `WEB_URL` are declared via `passThroughEnv` on the `test` and `dev` tasks in `turbo.json` for exactly this reason. This stayed invisible for a long time locally because every package had its own gitignored `.env` file — `dotenv` reads those directly off disk, so nothing depended on the var surviving turbo's env filtering. CI has no `.env` files, only the job-level `env:` block, so the gap only showed up there: `apps/api`'s test failed with a Postgres SASL auth error (`client password must be a string`) because `process.env.DATABASE_URL` was genuinely `undefined` inside the `vitest` subprocess despite being set on the job. If a new task ever needs an env var it isn't currently getting, add it to that task's `passThroughEnv` — don't assume "it's set in the workflow file" is enough.

### Cache hits don't replay side effects that aren't declared as `outputs`

A subtler version of the same bug: `prisma generate` (writes `packages/db/src/generated`) and `react-router typegen` (writes `apps/web/.react-router/types`) are side effects of running a task for real. On a turbo **cache hit**, the task's command never actually re-executes — only its declared `outputs` get restored to disk, and its logs get replayed. If a directory a downstream task's compiler needs to read isn't declared as an output, a cache hit silently leaves it missing (or stale) even though the log replay makes it look like everything succeeded.

Fixed by giving the affected tasks package-specific output overrides in `turbo.json` (`@batuto/db#build`, `@batuto/db#build:declaration`, `@batuto/web#check:type`) that include the codegen directory alongside the "real" output (`dist/`, `dist-types/`, `.react-router/**`). Anything that later depends on these tasks — even transitively, even when the dependency itself is a cache hit — gets the codegen directory correctly restored first.

### `packages/db` is not a special case

Prisma's generator writes into `packages/db/src/generated` (not a sibling folder outside `src/`), and a small barrel (`packages/db/src/index.ts`) re-exports it. This means the generated client compiles through the exact same `build`/`build:declaration` pipeline as hand-authored source — no special-casing needed in the scripts themselves (only the `outputs` override noted above). `build`/`build:declaration` both start with `prisma generate` (idempotent, cheap) before compiling, so the generated client is always fresh whenever the task actually executes.

One gotcha this setup required: Prisma's generated files author their own cross-references with a literal `.ts` extension (`import ... from "./enums.ts"`). Emitting that verbatim into `dist/*.js` breaks at runtime (Node/tsx would look for a `.ts` file that no longer exists next to the compiled `.js`). Fixed with `"rewriteRelativeImportExtensions": true` in `@batuto/config-typescript`'s `base.json` — tsgo rewrites `.ts`/`.tsx` extensions in relative imports to their JS equivalent in JS output. Declaration (`.d.ts`) output still contains the literal `.ts` extensions, but that's fine and expected: TypeScript's own resolver understands `.ts`-suffixed specifiers inside `.d.ts` files as referring to the sibling declaration file, so cross-package type resolution works correctly regardless.

## Knip and Syncpack — config lives close to what it ignores

`knip.json` and `.syncpackrc.json` are both at the repo root (these are genuinely repo-wide orchestration configs, not per-package build config — they don't fit the `packages/config/` pattern above, which is specifically for config that individual packages *extend*). Knip's config declares per-workspace `entry`/`project` globs (kept minimal — Knip's framework plugins auto-detect most of this; only add explicit config where its own "configuration hints" ask for it) plus targeted `ignoreDependencies` for real-but-untraceable usage (CSS-only imports like `@import "tailwindcss"`, or a dependency only used by Prisma's generated code, which Knip's default `generated/` folder-name ignore skips scanning). Syncpack's config pins every `@batuto/*` internal package to the `workspace:*` protocol and requires caret ranges everywhere else.

When either tool flags something, resist the urge to reflexively add an ignore — check whether it's a real unused dependency/export/version-mismatch first. Ignores should always carry an implicit or explicit reason (see the `ignoreDependencies` entries in `knip.json` for the pattern).

## CI

Two separate workflow files, not two jobs in one file: `.github/workflows/checks.yml` (no database needed, one step per check, fast) and `.github/workflows/build-and-test.yml` (needs the Postgres service container, runs `prisma migrate deploy` then `build` then `test`). Split this way so the fast static checks don't wait on — or get blocked by — database setup, and each check's pass/fail is independently visible in the PR checks list rather than buried inside one combined job.

Both trigger on PRs and pushes targeting `dev` — the current default/trunk branch. `main` doesn't exist yet; it's reserved for a future production branch. Re-point these triggers at `main` (or add it alongside `dev`) once that branch exists and takes over as the deploy target — see `infra-and-envs.md`/Doppler environment structure for when that's likely to happen.

**`actions/setup-node`'s `cache: yarn` input is incompatible with a Corepack-pinned Yarn version and must not be used.** `setup-node` resolves the yarn cache directory *during its own step*, before any later `corepack enable` step gets a chance to run — so it always shells out to whatever `yarn` happens to be on the runner's default PATH (classic Yarn 1.x), which immediately errors on a repo pinning `packageManager: "yarn@4.x"` via Corepack. The fix isn't step-reordering (moving `corepack enable` earlier doesn't reliably survive `setup-node` prepending Node 22's own toolcache bin dir to `PATH`, which can re-shadow the shim) — it's dropping `cache: yarn` entirely and just not caching the yarn install for now. Order stays `checkout` → `setup-node` (no `cache` input) → `corepack enable` → `yarn install --immutable`.

Every step in both workflows invokes `turbo` directly (`yarn turbo run <task>` or `yarn workspace <pkg> <script>` for the one-off, non-turbo `migrate:deploy` step) — never a root `package.json` alias — per the turbo-first rule above.
