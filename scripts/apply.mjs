#!/usr/bin/env node
// Apply every data/*.sql file (in lexical order) to D1.
//
//   node scripts/apply.mjs --local
//   node scripts/apply.mjs --remote

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_NAME = "engineers-db";
const flags = new Set(process.argv.slice(2));
const REMOTE = flags.has("--remote");
const LOCAL = flags.has("--local") || !REMOTE; // default to local

if (!fs.existsSync(DATA_DIR)) {
  console.error(`No ${DATA_DIR} — run \`npm run import\` first.`);
  process.exit(1);
}
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error(`No .sql files in ${DATA_DIR}.`);
  process.exit(1);
}

const target = REMOTE ? "--remote" : "--local";
const persist = LOCAL ? ["--persist-to=.wrangler/state"] : [];
const t0 = Date.now();

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const p = path.join(DATA_DIR, f);
  const size = (fs.statSync(p).size / 1024).toFixed(0);
  console.log(`[${i + 1}/${files.length}] ${f} (${size} KB)`);
  const r = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, target, ...persist, `--file=${p}`],
    { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" }
  );
  if (r.status !== 0) {
    console.error(`Failed on ${f} (exit ${r.status}). Re-run after fixing.`);
    process.exit(r.status || 1);
  }
}

const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\nAll ${files.length} files applied in ${mins} min.`);
