---
title: Infra and environments
summary: Doppler is the single secrets source syncing to Heroku/Vercel/CI; provisioned first, before anything that needs a secret
category: engineering
last_updated: 2026-07-21
related:
  - engineering/overview/stack.md
---

# Infra and environments

## Doppler — secrets, single source of truth

Doppler holds every secret and environment variable (Clerk keys, Neon connection string, Betterstack tokens, etc.) across all environments, syncing natively rather than being set by hand in multiple dashboards:

- **Heroku** — Doppler's Heroku integration pushes config vars automatically on change.
- **Vercel** — Doppler's Vercel integration does the same for frontend env vars.
- **CI (GitHub Actions)** — pulls secrets via a Doppler service token, not duplicated into GitHub Secrets.
- **Local dev** — each runnable package (`apps/api`, `apps/web`, `packages/db`) has its own dedicated Doppler project and an `env:pull` script that writes a real, gitignored `.env` file on disk:

  ```json
  "env:pull": "doppler secrets download --project=THE_PROJECT --config=dev_personal --no-file --format=env > .env"
  ```

  This is not `doppler run -- <command>` wrapping every invocation — the `.env` file is the actual local-dev mechanism, injected by `dotenv-cli` (the `dotenv` CLI binary, not the `dotenv` npm package — application code never loads env files itself) wrapping the dev-only package.json scripts that need it, and hashed into Turborepo's cache key per `quality-gates.md`'s env-vars section. `.env` files are gitignored, never committed, but they do exist on disk between `env:pull` runs. One dedicated Doppler project per runnable package (not shared) keeps each package's secrets scoped to what it actually needs.

  `apps/api` and `packages/db` load a second, higher-priority file on top: `.env.local`. Unlike `.env`, `.env.local` is never written by `env:pull` — it exists specifically to hold the personal Neon branch connection string from `db:branch` (see below), which must survive repeated `env:pull` runs and must not collide across parallel worktrees/sessions the way a shared Doppler config value would. See "Neon database branching (local dev)" for the mechanism.

**Doppler comes first, before anything that needs a secret.** Every bootstrap item that needs one — DB connection string, Clerk keys, Betterstack tokens — should be pulled from Doppler from the moment it's introduced, not retrofitted after secrets are already scattered across dashboards and `.env` files.

The actual Doppler projects and `env:pull` scripts land with BAT-4 (Doppler provisioning) — this repo doesn't add them speculatively before real projects exist.

## Environment structure

**Decided: dev/prod, not dev/staging/prod** (BAT-4). Two environments, matching the project's actual scale — a solo-maintained, single-band-at-launch app on a three-week bootstrap runway. `dev` is today's default/trunk branch and deploys to the dev environment; `main` is reserved for a future production branch and will deploy to prod once it exists (see `quality-gates.md`'s CI section for where the branch triggers will need to move). Staging can be added later if a real need shows up — it isn't blocked by this choice, just not provisioned speculatively now.

Each runnable package's dedicated Doppler project (see below) carries two configs: `dev` (with a `dev_personal` branch per developer, per Doppler's own convention) and `prd`. Project naming follows the package name: `batuto-api`, `batuto-web`, `batuto-db`.

## Hosting targets

- **Frontend** — Vercel, triggered via Vercel's own GitHub integration.
- **Backend** — Heroku.
- **Database** — Neon (Postgres). Use the **pooled** connection string for the Heroku backend (a long-lived Express process making frequent short queries is exactly the case the pooler is built for), not the direct one.

Three deploy targets, one CI pipeline, secrets from one place (Doppler) — confirm both Vercel and Heroku deploys are actually wired through GitHub Actions / Vercel's integration, and that neither duplicates secrets by hand outside Doppler.

## Neon database branching (local dev)

Local dev against the database can go two ways, in priority order:

1. **A personal Neon branch** (preferred) — `yarn workspace @batuto/db db:branch` calls the Neon API to create-or-reuse a branch named `local/<current-git-branch>`, forked from the project's primary branch, and writes its pooled connection string as `DATABASE_URL` into `.env.local` in both `packages/db` and `apps/api`. Re-running it is idempotent (reuses the existing branch for that git branch name instead of creating a duplicate). Because `.env.local` lives on disk per-directory and is never touched by `env:pull`, each worktree or parallel Claude Code session gets its own isolated branch with no risk of collision — this is exactly why the connection string is **not** stored in Doppler's `dev_personal` config: that config is a single shared value, unsafe for multiple concurrent sessions with different lifecycles.
2. **The local Postgres fallback** — `DATABASE_URL` in Doppler's `dev`/`dev_personal` config for `batuto-db`/`batuto-api`, pointing at a local Postgres instance (from BAT-4). Used automatically whenever no `.env.local` exists yet.

Dev-only scripts that need `DATABASE_URL` are individually wrapped with `dotenv-cli`: `dotenv -e .env.local -e .env -- <command>` (e.g. `apps/api`'s `dev`/`test`, `packages/db`'s `migrate:dev`/`studio`/`db:branch`). `dotenv-cli`'s documented "first file wins" rule means `.env.local`'s `DATABASE_URL`, when present, overrides `.env`'s; a real env var already set in the process (e.g. by CI) always wins over both, and a missing file is silently skipped rather than erroring — so wrapping is harmless even where the files don't exist. Application code itself never loads env files (no `dotenv` import anywhere) — env vars simply need to already be in `process.env` by the time the process starts. Production/CI-facing scripts (`start`, `migrate:deploy`) are deliberately **not** wrapped, relying on the real deployed/CI environment instead; `codegen` (`prisma generate`) doesn't need `DATABASE_URL` at all, so it isn't wrapped either. `apps/web` needs no equivalent wiring: Vite already treats `.env.local` as highest-priority and gitignored by default.

The Neon project backing this (`batuto-db`'s Doppler `dev` config) also carries `NEON_API_KEY` (an org key scoped to just this Neon project), `NEON_PROJECT_ID`, and `BASE_DATABASE_URL` (the shared/primary branch's own pooled connection string — the parent every `local/*` branch forks from, and the one thing CI keeps in sync on push to `dev`, once that's wired).

**Still open, deliberately out of scope for now:** keeping the shared dev Neon branch in sync with what's pushed to `dev` (running `prisma migrate deploy` against it in CI), and ephemeral per-PR Neon branches for CI test runs. The latter is planned via Neon's own GitHub integration rather than a hand-rolled create/delete-branch CI step.

## Background jobs

Heroku Scheduler, not an in-process scheduler (e.g. node-cron living in the same web dyno). A cron job inside the web dyno is fragile on Heroku's ephemeral dynos (restarts, sleep on some plans); Heroku Scheduler spins up a one-off dyno per run instead. Used for recurring event generation in v0, extended to reminders/notifications in v1. Prove a trivial scheduled job actually fires before building real logic on top of it.

## Observability

Betterstack covers logs, error tracking, and uptime monitoring — one platform, not two. Wired via the Heroku log-drain addon for logs, plus the (Sentry-SDK-compatible) error tracking SDK on both frontend and backend. This consolidates what was originally scoped as a Sentry (errors) + Betterstack (logs) split, once Betterstack shipped native Sentry-compatible error tracking (GA April 2026) and running both became redundant.

## CI/CD

GitHub Actions: lint, typecheck, and test on PR; deploy pipelines to Vercel (frontend) and Heroku (backend). Secrets sourced from Doppler, never GitHub Secrets.
