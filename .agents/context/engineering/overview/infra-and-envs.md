---
title: Infra and environments
summary: Doppler is the single secrets source syncing to Heroku/Vercel/CI; provisioned first, before anything that needs a secret
category: engineering
last_updated: 2026-07-15
related:
  - engineering/overview/stack.md
---

# Infra and environments

## Doppler — secrets, single source of truth

Doppler holds every secret and environment variable (Clerk keys, Neon connection string, Betterstack tokens, etc.) across all environments, syncing natively rather than being set by hand in multiple dashboards:

- **Heroku** — Doppler's Heroku integration pushes config vars automatically on change.
- **Vercel** — Doppler's Vercel integration does the same for frontend env vars.
- **CI (GitHub Actions)** — pulls secrets via a Doppler service token, not duplicated into GitHub Secrets.
- **Local dev** — `doppler run -- <command>` injects env vars directly; no committed `.env` files.

**Doppler comes first, before anything that needs a secret.** Every bootstrap item that needs one — DB connection string, Clerk keys, Betterstack tokens — should be pulled from Doppler from the moment it's introduced, not retrofitted after secrets are already scattered across dashboards and `.env` files.

## Environment structure

Decide dev/staging/prod vs. just dev/prod as one of the very first bootstrap decisions — don't leave it implicit and let it calcify around whatever the first deploy happened to need.

## Hosting targets

- **Frontend** — Vercel, triggered via Vercel's own GitHub integration.
- **Backend** — Heroku.
- **Database** — Neon (Postgres). Use the **pooled** connection string for the Heroku backend (a long-lived Express process making frequent short queries is exactly the case the pooler is built for), not the direct one.

Three deploy targets, one CI pipeline, secrets from one place (Doppler) — confirm both Vercel and Heroku deploys are actually wired through GitHub Actions / Vercel's integration, and that neither duplicates secrets by hand outside Doppler.

## Background jobs

Heroku Scheduler, not an in-process scheduler (e.g. node-cron living in the same web dyno). A cron job inside the web dyno is fragile on Heroku's ephemeral dynos (restarts, sleep on some plans); Heroku Scheduler spins up a one-off dyno per run instead. Used for recurring event generation in v0, extended to reminders/notifications in v1. Prove a trivial scheduled job actually fires before building real logic on top of it.

## Observability

Betterstack covers logs, error tracking, and uptime monitoring — one platform, not two. Wired via the Heroku log-drain addon for logs, plus the (Sentry-SDK-compatible) error tracking SDK on both frontend and backend. This consolidates what was originally scoped as a Sentry (errors) + Betterstack (logs) split, once Betterstack shipped native Sentry-compatible error tracking (GA April 2026) and running both became redundant.

## CI/CD

GitHub Actions: lint, typecheck, and test on PR; deploy pipelines to Vercel (frontend) and Heroku (backend). Secrets sourced from Doppler, never GitHub Secrets.
