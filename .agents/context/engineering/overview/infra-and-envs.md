---
title: Infra and environments
summary: Doppler is the single secrets source syncing to Heroku/Vercel/CI; provisioned first, before anything that needs a secret
category: engineering
last_updated: 2026-07-24
related:
  - engineering/overview/stack.md
  - engineering/modules/auth.md
  - engineering/modules/frontend-auth.md
  - engineering/overview/quality-gates.md
---

# Infra and environments

## Doppler — secrets, single source of truth

Doppler holds every secret and environment variable (Clerk keys, Neon connection string, Betterstack tokens, etc.) across all environments, syncing natively rather than being set by hand in multiple dashboards:

- **Heroku** — Doppler's Heroku integration pushes config vars automatically on change.
- **Vercel** — Doppler's Vercel integration does the same for frontend env vars.
- **CI (GitHub Actions)** — pulls secrets via `dopplerhq/secrets-fetch-action`, not duplicated into GitHub Secrets. The one exception is the Doppler credential itself: a single `DOPPLER_TOKEN` GitHub Actions secret, set by hand (there's no way around that — it's what authenticates the fetch). It's a **personal** Doppler token, not a service token — the plan in use doesn't have Service Accounts. The action's own docs only explicitly cover service/service-account tokens, but a personal token works the same way against Doppler's API for reads. Workflow steps reference `steps.doppler.outputs.<SECRET_NAME>` (output-per-secret is the action's default mode). `doppler-project: batuto-db` / `doppler-config: dev` — the shared, non-personal branch, since CI isn't tied to one developer.
- **Deploy credentials — deliberate exception, not Doppler.** `HEROKU_API_KEY`, `HEROKU_APP_NAME`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (the credentials the deploy pipeline itself needs, not the running apps) live directly in GitHub instead of a Doppler project — an earlier `batuto-deploy` Doppler project was tried first and abandoned because of a Doppler plan limitation. Concretely: `HEROKU_API_KEY` and `VERCEL_TOKEN` are **repository secrets** (not per-environment — one token each, used everywhere); `HEROKU_APP_NAME`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` are **environment variables** (GitHub's `vars.*` context, not `secrets.*`) set per GitHub Environment, once each under `Preview` and `Production` (Settings → Environments). This is the one deliberate carve-out from "Doppler is the single secrets source" in this repo — scoped specifically to CI/deploy-time credentials, not the app's own runtime config (Clerk keys, `DATABASE_URL`, etc. below are still Doppler-native-synced to Heroku/Vercel, untouched by this). See "Imperative deploys" below for how each workflow references these.
- **Local dev** — each runnable package (`apps/api`, `apps/web`, `packages/db`) has its own dedicated Doppler project and an `env:pull` script that writes a real, gitignored `.env` file on disk:

  ```json
  "env:pull": "doppler secrets download --project=THE_PROJECT --config=dev_personal --no-file --format=env > .env"
  ```

  This is not `doppler run -- <command>` wrapping every invocation — the `.env` file is the actual local-dev mechanism, injected by `dotenv-cli` (the `dotenv` CLI binary, not the `dotenv` npm package — application code never loads env files itself) wrapping the dev-only package.json scripts that need it, and hashed into Turborepo's cache key per `quality-gates.md`'s env-vars section. `.env` files are gitignored, never committed, but they do exist on disk between `env:pull` runs. One dedicated Doppler project per runnable package (not shared) keeps each package's secrets scoped to what it actually needs.

  `apps/api` and `packages/db` load a second, higher-priority file on top: `.env.local`. Unlike `.env`, `.env.local` is never written by `env:pull` — it exists specifically to hold the personal Neon branch connection string from `db:branch` (see below), which must survive repeated `env:pull` runs and must not collide across parallel worktrees/sessions the way a shared Doppler config value would. See "Neon database branching (local dev)" for the mechanism.

**Doppler comes first, before anything that needs a secret.** Every bootstrap item that needs one — DB connection string, Clerk keys, Betterstack tokens — should be pulled from Doppler from the moment it's introduced, not retrofitted after secrets are already scattered across dashboards and `.env` files.

The actual Doppler projects and `env:pull` scripts land with BAT-4 (Doppler provisioning) — this repo doesn't add them speculatively before real projects exist.

A real Clerk application exists (test-mode keys). `batuto-api`'s `dev`/`dev_personal` configs carry `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`. `batuto-web`'s `dev`/`dev_personal` carry both `VITE_CLERK_PUBLISHABLE_KEY` (client-safe) and a copy of `CLERK_SECRET_KEY` (server-only, used by `apps/web`'s SSR loader — see [frontend-auth.md](../modules/frontend-auth.md)) — the same duplication pattern as `DATABASE_URL` across `batuto-db`/`batuto-api`: each runnable package's Doppler project holds what it actually needs, even when the underlying value is shared. `prd` configs on both projects are still empty; that's expected until a real production deploy exists, not a bootstrap blocker.

## Environment structure

**Decided: dev/prod, not dev/staging/prod** (BAT-4). Two environments, matching the project's actual scale — a solo-maintained, single-band-at-launch app on a three-week bootstrap runway. `dev` is today's default/trunk branch and deploys to the dev environment; `main` is reserved for a future production branch and will deploy to prod once it exists (see `quality-gates.md`'s CI section for where the branch triggers will need to move). Staging can be added later if a real need shows up — it isn't blocked by this choice, just not provisioned speculatively now.

Each runnable package's dedicated Doppler project (see below) carries two configs: `dev` (with a `dev_personal` branch per developer, per Doppler's own convention) and `prd`. Project naming follows the package name: `batuto-api`, `batuto-web`, `batuto-db`.

## Hosting targets

- **Frontend** — Vercel, triggered via Vercel's own GitHub integration.
- **Backend** — Heroku.
- **Database** — Neon (Postgres). Use the **pooled** connection string for the Heroku backend (a long-lived Express process making frequent short queries is exactly the case the pooler is built for), not the direct one.

Three deploy targets, one CI pipeline, secrets from one place (Doppler).

### Imperative deploys — CI-driven, not Git-integration auto-deploy

**Decided:** deploys are triggered imperatively from GitHub Actions, not by Vercel's or Heroku's own git-push auto-deploy. Two separate workflow files, not two jobs in one file — same reasoning as `checks.yml`/`build-and-test.yml`/`db-checks.yml`'s split, and made a hard requirement once the two platforms' triggers actually diverged (see below):

- **Vercel** (`.github/workflows/deploy-vercel.yml`) — `apps/web/vercel.json` sets `git.deploymentEnabled: false`, disabling Vercel's own Git-triggered deploys (production **and** PR preview deployments) for every branch, in-repo and versioned rather than a dashboard toggle. This deliberately reintroduces a `vercel.json` after an earlier commit removed one — that removal was about a now-unneeded `installCommand`/`buildCommand` override (Vercel's native Turborepo detection covers that); `git.deploymentEnabled` is unrelated and doesn't reintroduce that problem. The Git repository connection itself stays intact (Root Directory, framework preset, env var sync all still depend on it) — only automatic deployment-on-push is turned off.

  The build itself runs in the GitHub Actions runner, not on Vercel's remote build infrastructure: `vercel pull --environment=<production|preview>` (fetches the project's linked settings **and** its configured Environment Variables into `.vercel/.env.<target>.local` — this is still how Doppler's Vercel integration reaches the build, just consumed via `vercel pull` instead of Vercel's own remote build reading it directly) → `vercel build [--prod]` (Turborepo-aware the same way Vercel's removed remote `buildCommand` override used to be — see below — and, thanks to `vercelPreset()`, produces a real Build Output API `.vercel/output/` directory) → deploy via [`BetaHuhn/deploy-to-vercel-action`](https://github.com/marketplace/actions/deploy-to-vercel-action) (`@v1`) with `PREBUILT: true`, which only appends `--prebuilt` to its `vercel deploy` call and uploads the already-built output — Vercel never sees or builds from source. The action still creates a GitHub Deployment and a PR comment with the preview URL, restoring the preview-on-PR behavior that `git.deploymentEnabled: false` otherwise removes. `--prebuilt` deliberately means Vercel's own System Environment Variables (`VERCEL_ENV`, `VERCEL_URL`, etc.) are unavailable at build time — irrelevant today since nothing in `apps/web` reads them, but the reason to know if that ever changes.

  Triggered on `push` to **both** `dev` and `main`, plus `pull_request` targeting `dev`; a `Determine Vercel target` step maps `pull_request` → `preview` (no `--prod`) and any `push` → `production` (`--prod`), matching the action's own `PRODUCTION` default (left unset, since it already infers the same split from the event type). The job's `environment:` is set dynamically from the same split (`${{ github.event_name == 'pull_request' && 'Preview' || 'Production' }}`) — this is what scopes `vars.VERCEL_ORG_ID`/`vars.VERCEL_PROJECT_ID` to the right GitHub Environment; `secrets.VERCEL_TOKEN` is a repository secret so it resolves the same regardless. `main` is included ahead of the rest of this repo's convention (every other CI workflow is `dev`-only until `main` exists as a real branch, per "Environment structure" below) — this is a deliberate exception for the Vercel job specifically, not yet mirrored on the Heroku side or the other workflows. **Open consideration:** once `main` exists for real, both `dev` and `main` pushing to the same Vercel Production alias/domain would race — this needs revisiting before `main` becomes a real branch, not left as-is.

- **Heroku** (`.github/workflows/deploy-heroku.yml`) — app → Deploy tab → if a GitHub auto-deploy branch is configured, disable it by hand (Heroku has no in-repo equivalent to `vercel.json`'s `git.deploymentEnabled`; and don't use `git push heroku` / `heroku.yml`-based deploys either — those are also git-triggered). The `deploy-api` job builds a Docker image from `apps/api/Dockerfile` (build context = repo root, per the Yarn workspaces dependency chain — see the Dockerfile's own comments), pushes it to Heroku's Container Registry, and releases it via the Platform API's `formation` endpoint (`Accept: application/vnd.heroku+json; version=3.docker-releases`) — the documented imperative Docker-deploy flow, no Heroku CLI install needed in CI. Still `dev`-only, unlike Vercel's job. Its `environment:` is hardcoded to `Production` — it's the only trigger this workflow has (no PR-preview equivalent for the API), so there's no split to make dynamic the way Vercel's job does.

Neither workflow uses Doppler at all anymore (see "Deploy credentials" above) — `HEROKU_API_KEY`/`VERCEL_TOKEN` come from `secrets.*` (repository secrets), `HEROKU_APP_NAME`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from `vars.*` (GitHub Environment variables, scoped by each job's `environment:`). `GITHUB_TOKEN` in `deploy-vercel.yml` is the default per-workflow token GitHub Actions injects automatically, not a manually-set secret — it only needs `deployments: write`/`pull-requests: write` permissions (set at the workflow level) to create the GitHub Deployment and PR comment.

### Vercel React Router preset

`apps/web`'s `react-router.config.ts` registers `vercelPreset()` from `@vercel/react-router/vite` (per [Vercel's React Router framework docs](https://vercel.com/docs/frameworks/frontend/react-router)) rather than deploying with zero framework-specific config. The preset gives per-route runtime bundle splitting (confirmed locally: `yarn turbo run build --filter=@batuto/web` produces a runtime-tagged SSR bundle) and an accurate deployment summary on Vercel; it writes build artifacts to `.vercel/` (gitignored, root `.gitignore`).

**Known version mismatch to watch:** `@vercel/react-router`'s latest release (1.3.1, as of this writing) declares `peerDependencies` on `@react-router/dev@^7` / `@react-router/node@^7`, while this repo is on react-router **v8** (`^8.0.0` across `react-router`/`@react-router/dev`/`@react-router/node`/`@react-router/serve`). Installing it prints a Yarn peer-dependency warning (`YN0060`) but isn't fatal — the repo uses the `node-modules` linker, not PnP, so mismatched peers don't hard-fail the install, and the build was verified working end-to-end despite the warning. Don't assume the warning means it's broken, and don't assume future upgrades of either package are guaranteed to stay compatible — re-verify with a real `turbo build` after bumping either one until `@vercel/react-router` publishes explicit v8 support.

## Neon database branching (local dev)

Local dev against the database can go two ways, in priority order:

1. **A personal Neon branch** (preferred) — `yarn workspace @batuto/db db:branch` calls the Neon API to create-or-reuse a branch named `local/<current-git-branch>`, forked from the project's primary branch, and writes its pooled connection string as `DATABASE_URL` into `.env.local` in both `packages/db` and `apps/api`. Re-running it is idempotent (reuses the existing branch for that git branch name instead of creating a duplicate). Because `.env.local` lives on disk per-directory and is never touched by `env:pull`, each worktree or parallel Claude Code session gets its own isolated branch with no risk of collision — this is exactly why the connection string is **not** stored in Doppler's `dev_personal` config: that config is a single shared value, unsafe for multiple concurrent sessions with different lifecycles.
2. **The local Postgres fallback** — `DATABASE_URL` in Doppler's `dev`/`dev_personal` config for `batuto-db`/`batuto-api`, pointing at a local Postgres instance (from BAT-4). Used automatically whenever no `.env.local` exists yet.

Dev-only scripts that need `DATABASE_URL` are individually wrapped with `dotenv-cli`: `dotenv -e .env.local -e .env -- <command>` (e.g. `apps/api`'s `dev`/`test`, `packages/db`'s `migrate:dev`/`studio`/`db:branch`). `dotenv-cli`'s documented "first file wins" rule means `.env.local`'s `DATABASE_URL`, when present, overrides `.env`'s; a real env var already set in the process (e.g. by CI) always wins over both, and a missing file is silently skipped rather than erroring — so wrapping is harmless even where the files don't exist. Application code itself never loads env files (no `dotenv` import anywhere) — env vars simply need to already be in `process.env` by the time the process starts. Production/CI-facing scripts (`start`, `migrate:deploy`) are deliberately **not** wrapped, relying on the real deployed/CI environment instead; `codegen` (`prisma generate`) doesn't need `DATABASE_URL` at all, so it isn't wrapped either.

`apps/web`'s `dev`/`start` scripts are now `dotenv-cli`-wrapped too (BAT-17) — not for `DATABASE_URL`, but because `CLERK_SECRET_KEY` is a genuine server-side secret that must reach `process.env` for the SSR loader, and Vite's `import.meta.env` alone doesn't safely cover that case (see [frontend-auth.md](../modules/frontend-auth.md) for why). This supersedes the earlier assumption that `apps/web` needed no such wiring — that held only while every var it used was client-safe.

The Neon project backing this (`batuto-db`'s Doppler `dev` config) also carries `NEON_API_KEY` (an org key scoped to just this Neon project), `NEON_PROJECT_ID`, and `BASE_DATABASE_URL` (the shared/primary branch's own pooled connection string — the parent every `local/*` branch, and every `check:migrations` CI run's ephemeral clone, forks from).

**Still open, deliberately out of scope for now:** keeping the shared dev Neon branch itself in sync with what's pushed to `dev` (running `prisma migrate deploy` directly against it, as opposed to `check:migrations`' throwaway clone — see below), and ephemeral per-PR Neon branches for `build-and-test.yml`'s app-level test run. The latter is planned via Neon's own GitHub integration rather than a hand-rolled create/delete-branch CI step.

## CI database checks: check:schema and check:migrations

`.github/workflows/db-checks.yml` runs two jobs, each creating and tearing down its own ephemeral Neon branch (named `ci-<run_id>-<run_attempt>`, globally unique per workflow run/attempt — this, not any shared/locking mechanism, is what makes concurrent PRs and re-runs safe) via `neondatabase/create-branch-action` / `delete-branch-action`, cleanup always running (`if: always()`) so nothing lingers even on failure.

- **`check:migrations`** (`yarn workspace @batuto/db migrate:deploy`, run against the branch's `DATABASE_URL`) — forks a **full, data-bearing clone** of the shared dev branch (`BASE_DATABASE_URL`'s branch) and applies whatever new migrations the PR introduces to it. This is what catches a migration that's syntactically fine but fails against real existing data (e.g. a `NOT NULL` column added with no default to a table that already has rows) — something an empty test database never would.
- **`check:schema`** (`prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`, exit 0 = in sync, exit 2 = drift) — detects the case where `schema.prisma` was edited without generating a corresponding migration, i.e. **the migrations directory has fallen out of sync with the schema in source control.** This is the convention `check:schema` enforces: `prisma/migrations` must always be regenerable from `schema.prisma`'s history — never hand-edit `schema.prisma` without immediately running `migrate:dev` to produce the matching migration.

  This direction of the diff (`--from-migrations`) needs a **shadow database** — an empty scratch database Prisma replays the full migration history into, to compute the resulting schema, wired via `prisma.config.ts`'s `datasource.shadowDatabaseUrl` (there is no CLI flag for it in this Prisma version; without it, `migrate diff --from-migrations` refuses to run). Shadow DB values live in `batuto-db`'s Doppler `dev` config, mirroring `DATABASE_URL`/`BASE_DATABASE_URL` exactly: `SHADOW_DATABASE_URL` is the local Postgres fallback (a second empty local database, `batuto_shadow`), `BASE_SHADOW_DATABASE_URL` is the Neon branch `check:schema`'s ephemeral branches fork from — in a **separate Neon project** from the main one (own `NEON_SHADOW_API_KEY`/`NEON_SHADOW_PROJECT_ID`), so the two are credentialed independently.

  **The shadow project's forked-from branch must stay structurally empty (no tables) at all times.** Prisma's shadow-db mechanism requires starting from nothing so it can replay migrations from scratch; unlike `check:migrations`, there's no benefit to it holding real data — Neon's branch creation is fast regardless of parent size, so an empty parent costs nothing.

## Background jobs

Heroku Scheduler, not an in-process scheduler (e.g. node-cron living in the same web dyno). A cron job inside the web dyno is fragile on Heroku's ephemeral dynos (restarts, sleep on some plans); Heroku Scheduler spins up a one-off dyno per run instead. Used for recurring event generation in v0, extended to reminders/notifications in v1. Prove a trivial scheduled job actually fires before building real logic on top of it.

## Observability

Betterstack covers logs, error tracking, and uptime monitoring — one platform, not two. Wired via the Heroku log-drain addon for logs, plus the (Sentry-SDK-compatible) error tracking SDK on both frontend and backend. This consolidates what was originally scoped as a Sentry (errors) + Betterstack (logs) split, once Betterstack shipped native Sentry-compatible error tracking (GA April 2026) and running both became redundant.

## CI/CD

GitHub Actions: lint, typecheck, and test on PR (`checks.yml`, `build-and-test.yml`, `db-checks.yml`); imperative deploy pipelines to Vercel (frontend) and Heroku (backend, via Docker) on push to `dev` (`deploy.yml` — see "Imperative deploys" above). Secrets sourced from Doppler, never GitHub Secrets.
