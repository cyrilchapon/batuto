---
title: Logs module (@batuto/logs)
summary: Pino + the AppSignal Pino transport, wrapped as a provider package exporting createLogger(group) and AppSignal's env shape
category: engineering
last_updated: 2026-07-30
related:
  - engineering/modules/env-validation.md
  - engineering/overview/infra-and-envs.md
---

# Logs module (`@batuto/logs`)

`packages/logs` wraps Pino plus AppSignal's own Pino transport (`@appsignal/nodejs/pino`, per [AppSignal's writeup](https://blog.appsignal.com/2024/11/14/manage-your-pino-logs-with-appsignal.html)) — the same provider-package shape as `@batuto/auth`/`@batuto/db`: see [env-validation.md](env-validation.md) for the general pattern (env shape exported from `src/env.ts`, a factory, apps composing and parsing once). This document is the AppSignal/Pino-specific detail that pattern doesn't cover on its own.

## What it exports

- `appsignalEnvShape` / `AppsignalEnv` — `{ APPSIGNAL_PUSH_API_KEY }`. Moved here from `apps/api`'s inline schema once this package existed, even though nothing in this package directly consumes the parsed value (see below) — validating it at startup still gets the fail-fast benefit `env-validation.md` describes.
- `createLogger(group: string)` — builds a Pino instance with two transport targets: `@appsignal/nodejs/pino` (`{ group }`) and a plain stdout target (`pino/file`, `destination: 1`), so logs stay visible locally without giving up AppSignal delivery.

## Why `createLogger` doesn't take `AppsignalEnv`

The AppSignal Pino transport doesn't take a push API key or any auth — it isn't a standalone client, it talks to the already-running AppSignal agent process (the same one `new Appsignal(...)` starts). Pino transports run in their own worker thread; AppSignal's transport (read directly from its compiled source, `pino_transport.js`) creates its own `Extension` instance there with `{ active: false }` specifically to avoid re-initializing the agent — it just expects the extension to already be loaded and started on the main thread. Communication with the actual agent happens over a local Unix socket (`/tmp/appsignal/agent.socket` at the OS level), not in-process JS state, so this works across threads without needing to pass anything through.

**The one real ordering constraint this creates:** `new Appsignal(...)` must run before any `createLogger(...)`-produced logger's first write (which is when Pino actually spins up the transport worker). In `apps/api`, `appsignal.ts` is the first import in `index.ts`, well before `logger.ts` is ever touched, so this holds by construction — but it's worth knowing if this package is ever used somewhere that doesn't already guarantee that ordering.

## How `apps/api` wires it in

- `src/logger.ts` — `export const logger = createLogger("api");`
- `src/app.ts` — `pino-http` (`app.use(pinoHttp({ logger }))`), added early so it wraps the whole request lifecycle, giving real per-request structured logs (method, status, timing) without a hand-written log line per route. Verified locally: request/response JSON lines print to stdout and (per BAT-13's manual dashboard check) reach AppSignal.
- `src/index.ts` — the startup line goes through the same `logger`, replacing an earlier ad hoc `Appsignal.logger(...)` call.

## Alternative considered and skipped: `@orpc/experimental-pino`

oRPC has its own Pino integration (`LoggingHandlerPlugin`, plugged into the oRPC handler directly rather than at the Express layer) — would give logger access scoped to the actual matched procedure via `getLogger(context)`, arguably a better fit for an app whose real routing is oRPC, not Express (see [auth.md](auth.md) for that architecture note). Skipped for now because it's marked experimental and would mean restructuring how procedures access the logger; `pino-http` at the Express layer was the simpler, stable choice for this bootstrap-stage task. Worth revisiting if oRPC-level request tracing (matched procedure, typed input/output in the log) becomes worth the trade-off later.

## AppSignal environment tagging

`apps/api/src/appsignal.ts` (not this package — the `Appsignal` client itself is app-level, initialized first-import-in-`index.ts` for ordering reasons that don't generalize well into a shared package) sets `environment: process.env.DOPPLER_ENVIRONMENT`. This is what actually separates local dev / staging / production data in the AppSignal dashboard — see `infra-and-envs.md`'s "Environment structure" section for the dev/stg/prd split this depends on, and why it didn't work at all before that split existed (every tier resolved to the same default bucket).
