#!/bin/bash
set -euo pipefail

# Claude Code web sessions only - never runs on a real dev machine or CI.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- Fix: force Node's default http/https agents through this sandbox's
# proxy, so native-dependency installers that don't read HTTPS_PROXY
# themselves (e.g. @appsignal/nodejs's install-time extension download)
# stop silently failing. See .claude/hooks/force-proxy.cjs for the why.
#
# Exported here (not just written to CLAUDE_ENV_FILE) so it's already in
# effect for this same script's own `yarn install` below - that's the step
# that actually triggers native installers like @appsignal/nodejs's. The
# CLAUDE_ENV_FILE lines make it persist for the rest of the session too.
if [ -n "${HTTPS_PROXY:-}" ]; then
  npm install --prefix .claude/hooks --no-audit --no-fund >/dev/null 2>&1

  export NODE_OPTIONS="${NODE_OPTIONS:-} --require $CLAUDE_PROJECT_DIR/.claude/hooks/force-proxy.cjs"
  echo "export NODE_OPTIONS=\"\${NODE_OPTIONS:-} --require $CLAUDE_PROJECT_DIR/.claude/hooks/force-proxy.cjs\"" >> "$CLAUDE_ENV_FILE"

  if [ -f /root/.ccr/ca-bundle.crt ]; then
    export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/root/.ccr/ca-bundle.crt}"
    echo "export NODE_EXTRA_CA_CERTS=\"\${NODE_EXTRA_CA_CERTS:-/root/.ccr/ca-bundle.crt}\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

# --- Local Postgres, so `yarn turbo run test`/`build-and-test` work without
# a live Neon connection. Idempotent: no-op if already running.
if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! pg_lsclusters 2>/dev/null | awk '{print $4}' | grep -q "^online$"; then
    sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
  fi

  if psql -U postgres -h localhost -tc "SELECT 1" >/dev/null 2>&1; then :; fi
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='batuto'" 2>/dev/null | grep -q 1 \
    || sudo -u postgres psql -c "CREATE ROLE batuto WITH LOGIN PASSWORD 'batuto' SUPERUSER;" >/dev/null 2>&1 || true
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='batuto_dev'" 2>/dev/null | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE batuto_dev OWNER batuto;" >/dev/null 2>&1 || true
fi

# --- Local dev env files, copied from their tracked .example templates so
# apps/api and packages/db can parse their env schemas without Doppler.
for pkg in apps/api packages/db; do
  if [ -f "$pkg/.env.example" ] && [ ! -f "$pkg/.env" ]; then
    cp "$pkg/.env.example" "$pkg/.env"
  fi
done

# apps/api's schema also requires APPSIGNAL_PUSH_API_KEY, which isn't a
# format-validated secret (just z.string()) - a placeholder is enough
# locally, real requests still go through the proxy fix above.
if [ -f apps/api/.env ] && ! grep -q "^APPSIGNAL_PUSH_API_KEY=" apps/api/.env; then
  echo 'APPSIGNAL_PUSH_API_KEY="00000000-0000-0000-0000-000000000000"' >> apps/api/.env
fi

# --- Dependencies + build order (DTOs -> contract -> backend/frontend, see
# .agents/context/engineering/overview/monorepo-layout.md).
corepack enable >/dev/null 2>&1 || true
yarn install --immutable
yarn turbo run codegen codegen:declaration >/dev/null

if [ -f packages/db/.env ]; then
  yarn workspace @batuto/db exec dotenv -e .env -- npx prisma migrate deploy >/dev/null 2>&1 || true
fi
