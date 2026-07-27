#!/usr/bin/env node
// Unofficial, temporary workaround for a real @vercel/react-router /
// react-router v8 incompatibility — see infra-and-envs.md's "Vercel
// React Router preset" section for the full writeup and why this
// exists at all. Delete this whole script (and the CI step that calls
// it) once @vercel/react-router ships real react-router v8 support and
// `vercel build` alone produces a working `functions/` output again.
//
// Root cause, confirmed by inspecting @vercel/remix-builder's actual
// source: it correctly computes config.json's routing (regex rules,
// destination names) from .vercel/react-router-build-result.json (the
// manifest @vercel/react-router's vercelPreset() writes), and it
// correctly locates the real compiled server bundle
// (build/server/nodejs_<hash>/index.js) — but something further
// downstream, inside the vercel CLI's own closed-source Lambda-to-
// -Build-Output-v3 materialization step, mishandles routes whose `dest`
// contains a wildcard (e.g. "sign-in/*.data"): instead of a clean
// function directory, it writes the literal, unsanitized `path` string
// as a nested directory tree — a real, confirmed-on-disk
// "functions/sign-in/*.data.func/" containing an actual `.vc-config.json`,
// not a no-op. That's invalid for actions/upload-artifact (and most
// filesystems) regardless of whether Vercel's own platform can make
// sense of it — confirmed via a real CI failure ("Contains ... Asterisk
// *"). Plain top-level routes (no wildcard, e.g. "index") get a clean
// name and work fine; this only affects wildcard sub-routes. This
// script runs *after* `vercel build` (which is why it's a separate CI
// step, not chained into this package's own `build` script —
// config.json doesn't exist until vercel build's builder logic
// finishes): it first removes any such broken, invalid-named paths
// left behind, then hand-creates whatever function directories
// config.json expects but vercel build didn't actually produce a clean
// version of.
//
// Deliberately scoped to this app's actual current shape (one server
// bundle, no per-route `export const config` overrides splitting work
// across multiple runtimes) rather than generalized to handle
// multi-bundle apps — if that ever changes, this script will warn
// loudly rather than silently mis-wire things.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { build as esbuildBuild } from "esbuild";

// Characters actions/upload-artifact (and most non-Unix filesystems)
// reject in an artifact path.
const INVALID_PATH_CHARS = /["*:<>|?\r\n]/;

const OUTPUT_DIR = ".vercel/output";
const FUNCTIONS_DIR = join(OUTPUT_DIR, "functions");
const BUILD_RESULT_PATH = ".vercel/react-router-build-result.json";
const CONFIG_PATH = join(OUTPUT_DIR, "config.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function destToFunctionName(dest) {
  if (!dest || dest.startsWith("/")) return null; // static file rewrite (prerendered route), not a function
  // Vercel's `dest` templating uses a literal `*` as a positional
  // placeholder for captured URL segments (seen in the wild: "sign-in/*",
  // "sign-in/*.data") — the actual function identity is always the
  // *first* path segment, with everything after it forwarded to that
  // same function. Taking just the first segment, rather than trying to
  // strip every specific suffix shape ("/*", "/*.data", ...), is robust
  // to dest shapes this script hasn't been tested against — a prior
  // version stripped known suffixes explicitly and still produced an
  // invalid nested "sign-in/*.data.func" directory in a real CI run
  // when the dest didn't exactly match what it expected.
  const name = dest.split("/")[0];
  if (!name || name.includes("*")) return null; // still not a safe path segment — skip rather than create something broken
  return name;
}

// A function directory existing isn't enough — vercel build's own
// materialization has also been observed writing a *complete-looking*
// .func directory (a real .vc-config.json, no invalid characters) whose
// `handler` field points at a filename that doesn't match what
// react-router v8's Vite Environment API actually produces (a real CI
// failure: "File does not exist: apps/web/build/server/nodejs_.../
// server-index.mjs" — the real file is index.js, not server-index.mjs).
// Confirm the handler file genuinely exists before trusting an
// already-there function directory.
function isValidExistingFunction(funcDir) {
  const configPath = join(funcDir, ".vc-config.json");
  if (!existsSync(configPath)) return false;
  try {
    const config = readJson(configPath);
    return typeof config.handler === "string" && existsSync(join(funcDir, config.handler));
  } catch {
    return false;
  }
}

// Recursively removes anything under `dir` whose name contains a
// character invalid for artifact upload — vercel build's own broken
// wildcard-route materialization is the only thing that produces these
// (see the header comment), but this doesn't assume that's the only
// possible cause.
function removeInvalidPaths(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (INVALID_PATH_CHARS.test(entry.name)) {
      console.warn(
        `[fix-vercel-functions] Removing invalid path left by vercel build: ${fullPath}`,
      );
      rmSync(fullPath, { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory()) {
      removeInvalidPaths(fullPath);
    }
  }
}

async function main() {
  if (!existsSync(BUILD_RESULT_PATH)) {
    console.log(`[fix-vercel-functions] No ${BUILD_RESULT_PATH} found — nothing to do.`);
    return;
  }
  if (!existsSync(CONFIG_PATH)) {
    console.log(`[fix-vercel-functions] No ${CONFIG_PATH} found — nothing to do.`);
    return;
  }

  removeInvalidPaths(FUNCTIONS_DIR);

  const { buildManifest } = readJson(BUILD_RESULT_PATH);
  const serverBundles = Object.values(buildManifest?.serverBundles ?? {});
  if (serverBundles.length === 0) {
    console.log(
      "[fix-vercel-functions] No server bundles in the build manifest (fully static build?) — nothing to do.",
    );
    return;
  }

  const config = readJson(CONFIG_PATH);
  const neededNames = new Set();
  for (const route of config.routes ?? []) {
    const name = destToFunctionName(route.dest);
    if (name) neededNames.add(name);
  }

  const missing = [...neededNames].filter(
    (name) => !isValidExistingFunction(join(FUNCTIONS_DIR, `${name}.func`)),
  );
  if (missing.length === 0) {
    console.log(
      "[fix-vercel-functions] All expected function directories already exist — nothing to do (has @vercel/remix-builder been fixed? consider deleting this script).",
    );
    return;
  }

  console.warn(
    `[fix-vercel-functions] @vercel/remix-builder did not generate: ${missing.join(", ")} — creating by hand (react-router v8 workaround, see infra-and-envs.md).`,
  );

  if (serverBundles.length > 1) {
    console.warn(
      `[fix-vercel-functions] WARNING: found ${serverBundles.length} server bundles but this script only wires up one. Review it — the app now has per-route runtime config splitting it across bundles.`,
    );
  }

  const bundle = serverBundles[0];
  const primaryName = missing[0];
  const primaryFuncDir = join(FUNCTIONS_DIR, `${primaryName}.func`);
  // Clear first — vercel build may have already left a broken (but
  // directory-existing) attempt here, e.g. one with a real
  // .vc-config.json pointing at a handler file that doesn't exist. A
  // stray leftover file from that attempt sitting next to ours would be
  // harmless at best, but there's no reason to risk it.
  rmSync(primaryFuncDir, { recursive: true, force: true });
  mkdirSync(primaryFuncDir, { recursive: true });

  // Adapted from @vercel/remix-builder's own defaults/server-react-router.mjs
  // (the template it uses when its normal codepath works) — same handler
  // logic, but importing the already-built server bundle by relative
  // path instead of Vite's `virtual:react-router/server-build` module,
  // which only resolves inside a Vite build, not at plain Node runtime.
  // The import specifier must be relative to *this entry file's own
  // location* (ESM relative imports resolve against the importing
  // file, not process.cwd()) — esbuild only needs it to be correct at
  // bundle time anyway, since `bundle: true` inlines everything into
  // one output file regardless of where the entry file itself sits.
  const entryPath = join(FUNCTIONS_DIR, ".fix-vercel-functions-entry.mjs");
  let bundleImportSpecifier = relative(dirname(entryPath), bundle.file);
  if (!bundleImportSpecifier.startsWith(".")) {
    bundleImportSpecifier = `./${bundleImportSpecifier}`;
  }
  const entrySource = `import * as RR from 'react-router';
import * as build_ from ${JSON.stringify(bundleImportSpecifier)};
const build = build_.default || build_;

export default typeof build === 'function'
  ? build
  : (() => {
      const handler = RR.createRequestHandler(build);
      return (request) =>
        build.future?.v8_middleware
          ? handler(request, new RR.RouterContextProvider())
          : handler(request);
    })();
`;
  writeFileSync(entryPath, entrySource);

  const outfile = join(primaryFuncDir, "index.cjs");
  try {
    // Bundle everything (react-router, the compiled SSR build, and all
    // of their own dependencies) into one self-contained file — a
    // .func directory only ships what's physically inside it, so bare
    // `node_modules` imports would otherwise fail at runtime on Vercel.
    //
    // format: "cjs", not "esm" — confirmed via a real deploy crash:
    // "Dynamic require of 'util' is not supported". react-dom/server's
    // CJS build internally does a dynamic `require()` of a Node builtin;
    // esbuild's ESM output has to synthesize a `require` shim for CJS
    // interop, and that shim doesn't support this case. Bundling to CJS
    // avoids the problem entirely — react-dom's own require() calls are
    // then real, native Node requires, not an esbuild-synthesized shim.
    await esbuildBuild({
      entryPoints: [entryPath],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      outfile,
      logLevel: "warning",
    });
  } finally {
    rmSyncQuiet(entryPath);
  }

  writeFileSync(
    join(primaryFuncDir, ".vc-config.json"),
    `${JSON.stringify(
      {
        runtime: "nodejs22.x",
        handler: "index.cjs",
        launcherType: "Nodejs",
        // shouldAddHelpers defaults to false (per the Build Output API
        // docs) and must stay that way here — confirmed via a real
        // deployed crash: `new URL("/")` throwing ERR_INVALID_URL
        // inside react-router's request handler. `true` forces Vercel's
        // classic (req, res)-with-helpers invocation style, where
        // `req.url` is just a path ("/"), not a full URL — incompatible
        // with a Web Fetch API-style handler (a single `request: Request`
        // argument), which is what react-router's createRequestHandler,
        // and Vercel's own official react-router template, both export.
      },
      null,
      2,
    )}\n`,
  );

  // Copy rather than symlink: this whole .vercel/output directory gets
  // uploaded as a GitHub Actions artifact before the deploy job
  // consumes it, and actions/upload-artifact has a history of not
  // reliably preserving symlinks across that round-trip. A few extra
  // MB of duplicated bundle is a small price for not gambling on that.
  for (const name of missing.slice(1)) {
    const funcDir = join(FUNCTIONS_DIR, `${name}.func`);
    rmSync(funcDir, { recursive: true, force: true }); // same reasoning as clearing primaryFuncDir above
    cpSync(primaryFuncDir, funcDir, { recursive: true });
  }

  console.log(
    `[fix-vercel-functions] Created ${primaryName}.func` +
      (missing.length > 1 ? ` and copied it to ${missing.slice(1).join(", ")}` : "") +
      ".",
  );
}

function rmSyncQuiet(path) {
  try {
    rmSync(path);
  } catch {
    // best-effort cleanup of the temp entry file, not load-bearing
  }
}

await main();
