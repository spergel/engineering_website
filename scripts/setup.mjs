#!/usr/bin/env node
// One-shot Cloudflare setup:
//   1. Make sure a D1 database named `engineers-db` exists
//   2. Write its database_id into wrangler.toml
//   3. Apply migrations + seed (local AND remote)
//
// Run: npm run setup       # both local + remote
//      npm run setup:local # local only (skips remote D1)

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_TOML = path.join(ROOT, "wrangler.toml");
const DB_NAME = "engineers-db";
const LOCAL_ONLY = process.argv.includes("--local-only");

function run(cmd, args, { capture = false } = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(" ")}`);
  }
  return r.stdout || "";
}

function findUuidForDb(jsonText) {
  let data;
  try { data = JSON.parse(jsonText); } catch { return null; }
  const list = Array.isArray(data) ? data : data?.result || data?.databases || [];
  for (const db of list) {
    const name = db.name || db.database_name;
    const id = db.uuid || db.id || db.database_id;
    if (name === DB_NAME && id) return id;
  }
  return null;
}

// 1. Look up an existing engineers-db
let dbId;
try {
  const listOut = run("npx", ["wrangler", "d1", "list", "--json"], { capture: true });
  dbId = findUuidForDb(listOut);
} catch (e) {
  console.error("Could not list D1 databases. Are you logged in? Run `npx wrangler login`.");
  throw e;
}

// 2. Create it if missing
if (!dbId) {
  console.log(`No D1 database named "${DB_NAME}" found; creating it.`);
  const createOut = run("npx", ["wrangler", "d1", "create", DB_NAME], { capture: true });
  process.stdout.write(createOut);
  const m = createOut.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i) ||
            createOut.match(/"uuid"\s*:\s*"([0-9a-f-]{36})"/i);
  if (!m) {
    throw new Error("Could not parse database_id from `wrangler d1 create` output.");
  }
  dbId = m[1];
}
console.log(`Using D1 database id: ${dbId}`);

// 3. Patch wrangler.toml
let toml = fs.readFileSync(WRANGLER_TOML, "utf8");
const before = toml;
toml = toml.replace(
  /database_id\s*=\s*"[^"]*"/,
  `database_id = "${dbId}"`
);
if (toml === before) {
  console.warn("wrangler.toml: no database_id line found to update — skipping.");
} else if (toml !== fs.readFileSync(WRANGLER_TOML, "utf8")) {
  fs.writeFileSync(WRANGLER_TOML, toml);
  console.log("wrangler.toml updated.");
}

// 4. Run migrations + seed locally.
//    --persist-to keeps these in the SAME directory `wrangler pages dev` reads
//    from. Without it, the CLI and dev server can pick different SQLite files
//    and you'll see "no such table: people" at runtime.
console.log("\n=== Local D1: migrate + seed ===");
run("npx", ["wrangler", "d1", "migrations", "apply", DB_NAME, "--local", "--persist-to=.wrangler/state"]);
run("npx", ["wrangler", "d1", "execute", DB_NAME, "--local", "--file=./seed.sql", "--persist-to=.wrangler/state"]);

if (LOCAL_ONLY) {
  console.log("\nLocal setup complete. Run `npm run dev`.");
  process.exit(0);
}

// 5. Run migrations + seed on remote
console.log("\n=== Remote D1: migrate + seed ===");
run("npx", ["wrangler", "d1", "migrations", "apply", DB_NAME, "--remote"]);
run("npx", ["wrangler", "d1", "execute", DB_NAME, "--remote", "--file=./seed.sql"]);

console.log("\nDone. Next: `npm run deploy`.");
