---
title: "Quality gates — check:/fix: scripts"
summary: check:type (tsgo), check:lint/format/assist (Biome), check:unused (Knip), check:depsync (Syncpack) — how to check after working and how to fix what's found
category: engineering
last_updated: 2026-07-17
related:
  - engineering/overview/monorepo-layout.md
  - engineering/overview/stack.md
---

# Quality gates — check:/fix: scripts

Every quality check in this repo follows one naming convention: `check:<thing>` is always pure (never writes to disk), and `fix:<thing>` is its mutative counterpart where one exists. There is no `fix:type` — there's nothing a tool can auto-fix about a type error.

## How to check after working

Run `yarn check` from the repo root. It runs all six checks below in one Turborepo invocation (parallelized, cached — a check against unchanged files replays instantly instead of re-running):

| Script | Tool | Scope |
|---|---|---|
| `check:type` | `tsgo` (TypeScript 7 native preview) | Per-package, fans out via Turborepo |
| `check:lint` | Biome | Global, one invocation from the root |
| `check:format` | Biome | Global |
| `check:assist` | Biome (assist actions only, e.g. `organizeImports`) | Global |
| `check:unused` | Knip | Global |
| `check:depsync` | Syncpack | Global |

Each is also runnable individually (`yarn check:lint`, `yarn check:unused`, etc.) when iterating on one concern.

## How to fix

`yarn fix` runs every fixable check's `fix:` variant in a safe order (format → assist → lint → depsync → unused — code style settles before Knip's `--fix` potentially removes files/exports, so the resulting diff is clean). Individual variants: `fix:lint`, `fix:format`, `fix:assist`, `fix:unused`, `fix:depsync`.

`fix:lint` and `fix:assist` pass Biome's `--unsafe` flag — real auto-fixes, not just the safe subset, since these are developer-triggered and expected to be reviewed via `git diff` before committing. `fix:unused` passes Knip's `--allow-remove-files`, meaning it can delete files it considers fully unused — always review its diff, don't blindly trust it in a script.

None of the `fix:*` scripts are wired into CI. CI only ever runs `check:*` — fixing is a local, human-reviewed action.

## Why tsgo, not tsc

Every TypeScript-backed project in this repo uses `tsgo` (`@typescript/native-preview`, the TypeScript 7 native compiler preview) for typechecking, not `tsc`. Each package/app that runs `check:type` declares its own `@typescript/native-preview` devDependency (don't rely on hoisting — declare it explicitly per package, the way every other direct usage is declared).

tsgo's declaration (`.d.ts`) emit is more mature than early previews suggested, verified working for this repo's real packages including cross-package type resolution — see the `build`/`build:declaration` split below.

## The build / build:declaration / check:type split (dependency-packages only)

This applies to `packages/dtos`, `packages/contract`, and `packages/db` — the packages other packages/apps depend on. It does **not** apply to `apps/api` or `apps/web` (leaf apps, nothing depends on them — they only have `check:type`, plus their own normal `build`/`dev` scripts as needed).

Each dependency-package exposes three pure, non-overlapping scripts:

- **`check:type`** — `tsgo -p tsconfig.json --noEmit`. Typecheck only, no artifacts.
- **`build`** — `tsgo -p tsconfig.build.json`, emits JS only (no declarations) to `dist/`. Uses `--noCheck`, so it strips types per-file without resolving the full dependency type graph — this is what makes it safe for `build` to depend only on its dependencies' `build` (JS), not their `build:declaration` (types): a `--noCheck` compile genuinely doesn't need any dependency's types to succeed.
- **`build:declaration`** — `tsgo -p tsconfig.declaration.json`, emits `.d.ts` only (no JS) to `dist-types/`. This one *does* need full type resolution, so it needs its dependencies' `build:declaration` to have already run (their `dist-types/` must exist for import resolution to succeed).

A package's `package.json` points `main` at `./dist/index.js` and `types` at `./dist-types/index.d.ts` (both under `exports`, plus a flat top-level fallback for older tooling).

Root-level shared partials (`tsconfig.build.json`, `tsconfig.declaration.json` at the repo root) hold the emit-mode-specific compiler options; each package's own `tsconfig.build.json`/`tsconfig.declaration.json` extends the matching root partial and only adds `outDir`/`rootDir`.

### `dependsOn` wiring (`turbo.json`)

```
check:type      dependsOn ^build:declaration   (needs deps' types to typecheck)
build           dependsOn ^build               (JS-only, --noCheck, doesn't strictly need deps' types)
build:declaration dependsOn ^build:declaration (needs deps' types to resolve its own)
test            dependsOn ^build               (runtime imports, no type resolution needed)
dev             dependsOn ^build               (tsx/vite resolve workspace deps via their compiled dist/)
```

The four "global" checks (`check:lint`, `check:format`, `check:assist`, `check:unused`, `check:depsync`) are registered in `turbo.json` as **root tasks** (`//#check:lint` etc.) — Turborepo's mechanism for a task that only ever runs once, against the root `package.json`'s own script, never fanning out per-workspace. `turbo run <taskname>` does **not** automatically pick these up; they have to be referenced explicitly (which `yarn check` does).

### `packages/db` is not a special case

Prisma's generator writes into `packages/db/src/generated` (not a sibling folder outside `src/`), and a small barrel (`packages/db/src/index.ts`) re-exports it. This means the generated client compiles through the exact same `build`/`build:declaration` pipeline as hand-authored source — no special-casing needed in `turbo.json` or anywhere else. `build`/`build:declaration` both start with `prisma generate` (idempotent, cheap) before compiling, so the generated client is always fresh.

One gotcha this setup required: Prisma's generated files author their own cross-references with a literal `.ts` extension (`import ... from "./enums.ts"`). Emitting that verbatim into `dist/*.js` breaks at runtime (Node/tsx would look for a `.ts` file that no longer exists next to the compiled `.js`). Fixed with `"rewriteRelativeImportExtensions": true` in the shared `tsconfig.base.json` — tsgo rewrites `.ts`/`.tsx` extensions in relative imports to their JS equivalent in JS output. Declaration (`.d.ts`) output still contains the literal `.ts` extensions, but that's fine and expected: TypeScript's own resolver understands `.ts`-suffixed specifiers inside `.d.ts` files as referring to the sibling declaration file, so cross-package type resolution works correctly regardless.

## Knip and Syncpack — config lives close to what it ignores

`knip.json` and `.syncpackrc.json` are both at the repo root. Knip's config declares per-workspace `entry`/`project` globs (kept minimal — Knip's framework plugins auto-detect most of this; only add explicit config where its own "configuration hints" ask for it) plus targeted `ignoreDependencies` for real-but-untraceable usage (CSS-only imports like `@import "tailwindcss"`, or a dependency only used by Prisma's generated code, which Knip's default `generated/` folder-name ignore skips scanning). Syncpack's config pins every `@batuto/*` internal package to the `workspace:*` protocol and requires caret ranges everywhere else.

When either tool flags something, resist the urge to reflexively add an ignore — check whether it's a real unused dependency/export/version-mismatch first. Ignores should always carry an implicit or explicit reason (see the `ignoreDependencies` entries in `knip.json` for the pattern).

## CI

`.github/workflows/ci.yml` has two jobs: `checks` (runs `yarn check` — no database needed, fast) and `build-and-test` (needs the Postgres service container, runs `prisma migrate deploy` then `yarn build` and `yarn test`). Split this way so the fast static checks don't wait on — or get blocked by — database setup, and so a static-check failure surfaces without waiting for the build.
