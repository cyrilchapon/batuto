#!/usr/bin/env node
// Creates (or reuses) a Neon branch named `local/<git-branch>`, forked from
// the project's primary branch, and writes its pooled connection string as
// DATABASE_URL into .env.local in packages/db and apps/api. .env.local is
// gitignored and never touched by env:pull, so it survives re-runs of
// env:pull and stays local to whichever worktree/session it was created in.
//
// Expects NEON_API_KEY, NEON_PROJECT_ID and BASE_DATABASE_URL to already be
// in the environment — injected by the `db:branch` package.json script via
// `dotenv -e .env --`, not loaded here.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, "..");
const repoRoot = join(dbDir, "..", "..");

const { NEON_API_KEY, NEON_PROJECT_ID, BASE_DATABASE_URL } = process.env;

if (!NEON_API_KEY || !NEON_PROJECT_ID || !BASE_DATABASE_URL) {
  console.error(
    "Missing NEON_API_KEY, NEON_PROJECT_ID or BASE_DATABASE_URL in packages/db/.env — run `yarn env:pull` first.",
  );
  process.exit(1);
}

const NEON_API = "https://console.neon.tech/api/v2";

async function neon(path, options = {}) {
  const res = await fetch(`${NEON_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NEON_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Neon API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function currentGitBranch() {
  return execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoRoot }).toString().trim();
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9/_-]/g, "-");
}

function upsertEnvLocal(filePath, key, value) {
  const line = `${key}="${value}"`;
  const existingLines = existsSync(filePath)
    ? readFileSync(filePath, "utf8").split("\n").filter(Boolean)
    : [];
  const otherLines = existingLines.filter((l) => !l.startsWith(`${key}=`));
  writeFileSync(filePath, `${[...otherLines, line].join("\n")}\n`);
}

async function waitUntilReady(branchId) {
  for (;;) {
    const { branch } = await neon(`/projects/${NEON_PROJECT_ID}/branches/${branchId}`);
    if (branch.current_state === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function main() {
  const branchName = `local/${sanitize(currentGitBranch())}`;

  const { branches } = await neon(`/projects/${NEON_PROJECT_ID}/branches`);
  const parent = branches.find((b) => b.primary || b.default);
  if (!parent) {
    throw new Error("No primary/default Neon branch found to fork from.");
  }

  let branch = branches.find((b) => b.name === branchName);
  if (branch) {
    console.log(`Reusing existing Neon branch "${branchName}".`);
  } else {
    console.log(`Creating Neon branch "${branchName}" from "${parent.name}"...`);
    const created = await neon(`/projects/${NEON_PROJECT_ID}/branches`, {
      method: "POST",
      body: JSON.stringify({
        branch: { parent_id: parent.id, name: branchName },
        endpoints: [{ type: "read_write" }],
      }),
    });
    branch = created.branch;
  }

  await waitUntilReady(branch.id);

  const base = new URL(BASE_DATABASE_URL);
  const databaseName = base.pathname.replace(/^\//, "");
  const roleName = decodeURIComponent(base.username);

  const { uri } = await neon(
    `/projects/${NEON_PROJECT_ID}/connection_uri?branch_id=${branch.id}&database_name=${encodeURIComponent(databaseName)}&role_name=${encodeURIComponent(roleName)}&pooled=true`,
  );

  for (const targetDir of [dbDir, join(repoRoot, "apps/api")]) {
    upsertEnvLocal(join(targetDir, ".env.local"), "DATABASE_URL", uri);
  }

  console.log(
    `DATABASE_URL for "${branchName}" written to .env.local in packages/db and apps/api.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
