#!/usr/bin/env node
// Build SQL chunks for a full dataset load.
//
//   node scripts/import.mjs --csv-dir "./csv files" --out ./data
//
// Outputs:
//   data/01_wipe.sql                — clears all four tables
//   data/02_people_NNN.sql          — ~129k rows, multi-row INSERTs
//   data/03_places.sql              — ~5.5k rows + synthetic lc_id=52793
//   data/04_organizations_NNN.sql   — ~53k rows
//   data/05_connections_NNN.sql     — ~315k rows from combo5_3b.csv
//
// Apply with:  npm run load:local    or    npm run load:remote
// (Those scripts walk the files in lexical order via `wrangler d1 execute`.)
//
// We import combo5_3b.csv only — it's the merged corpis+alumni+professional
// fact table. crp3_1b.csv and emjdbase1_4b.csv have extra columns this schema
// doesn't model yet; extend the schema first if you want them.

import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => {
    if (v.startsWith("--")) acc.push([v.slice(2), a[i + 1]]);
    return acc;
  }, [])
);
const CSV_DIR = args["csv-dir"] || "./public/csv";
const OUT_DIR = args.out || "./data";

const UNKNOWN_LC_ID = 52793;
const ROWS_PER_INSERT = 500;          // safe under any reasonable param/stmt cap
const MAX_FILE_BYTES = 3 * 1024 * 1024; // ~3MB per file

fs.mkdirSync(OUT_DIR, { recursive: true });

const NA = (v) => (v == null || v === "" || v === "NA" ? null : v);

// --- CSV parser (handles quoted multi-line OCR text) -----------------------
function* readCsv(file) {
  const text = fs.readFileSync(file, "utf8");
  const rows = [];
  let cur = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); rows.push(cur); cur = []; field = "";
      } else field += c;
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  const header = rows.shift();
  for (const r of rows) {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i] ?? "";
    yield o;
  }
}

// --- Slug generation -------------------------------------------------------
function slugBase(s, fallback) {
  if (!s || s === "NA") return fallback;
  const b = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return b || fallback;
}
function makeSlugAssigner(prefix) {
  // Map keeps a counter for each base slug. Collisions get -2, -3, …
  const seen = new Map();
  return (name, id) => {
    const base = slugBase(name, `${prefix}-${id}`);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
}

// --- SQL value helpers -----------------------------------------------------
function sqlStr(v) {
  v = NA(v);
  if (v == null) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlInt(v) {
  v = NA(v);
  if (v == null) return "NULL";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? String(n) : "NULL";
}
function sqlReal(v) {
  v = NA(v);
  if (v == null) return "NULL";
  const n = parseFloat(v);
  return Number.isFinite(n) ? String(n) : "NULL";
}

// --- Chunked writer --------------------------------------------------------
// Writes multi-row INSERT statements, opening a new file when the current one
// grows past MAX_FILE_BYTES.
class ChunkWriter {
  constructor(prefix, columns) {
    this.prefix = prefix; // e.g. "02_people"
    this.columns = columns;
    this.table = prefix.split("_").slice(1).join("_"); // "people"
    this.fileIdx = 0;
    this.fd = null;
    this.bytes = 0;
    this.rowsInInsert = 0;
    this.firstRowInInsert = true;
  }
  _open() {
    this.fileIdx += 1;
    const name = `${this.prefix}_${String(this.fileIdx).padStart(3, "0")}.sql`;
    const p = path.join(OUT_DIR, name);
    this.fd = fs.openSync(p, "w");
    this.bytes = 0;
    console.log(`  → ${name}`);
  }
  _startInsert() {
    const head = `INSERT INTO ${this.table} (${this.columns.join(", ")}) VALUES\n`;
    this._write(head);
    this.rowsInInsert = 0;
    this.firstRowInInsert = true;
  }
  _write(s) {
    if (!this.fd) this._open();
    const buf = Buffer.from(s, "utf8");
    fs.writeSync(this.fd, buf);
    this.bytes += buf.length;
  }
  add(valuesTuple) {
    if (!this.fd) { this._open(); this._startInsert(); }
    const sep = this.firstRowInInsert ? "" : ",\n";
    this._write(`${sep}(${valuesTuple})`);
    this.firstRowInInsert = false;
    this.rowsInInsert += 1;
    if (this.rowsInInsert >= ROWS_PER_INSERT) {
      this._write(";\n");
      // Rotate file if it's getting large; otherwise start a new INSERT in the
      // same file.
      if (this.bytes >= MAX_FILE_BYTES) {
        this._close();
      } else {
        this._startInsert();
      }
    }
  }
  _close() {
    if (!this.fd) return;
    if (this.rowsInInsert > 0 && !this.firstRowInInsert) this._write(";\n");
    fs.closeSync(this.fd);
    this.fd = null;
    this.rowsInInsert = 0;
    this.firstRowInInsert = true;
  }
  flush() { this._close(); }
}

// --- 01: wipe --------------------------------------------------------------
{
  const f = path.join(OUT_DIR, "01_wipe.sql");
  fs.writeFileSync(
    f,
    [
      "-- Clear all tables before the bulk load. Re-runnable.",
      "PRAGMA foreign_keys = OFF;",
      "DELETE FROM connections;",
      "DELETE FROM people;",
      "DELETE FROM places;",
      "DELETE FROM organizations;",
      "PRAGMA foreign_keys = ON;",
      "",
    ].join("\n")
  );
  console.log(`Wrote ${f}`);
}

// --- 02: people ------------------------------------------------------------
{
  console.log("People (indidx.csv):");
  const slug = makeSlugAssigner("person");
  const w = new ChunkWriter("02_people", [
    "in_id", "slug", "name", "simpname", "lastname", "firstname", "middlename",
  ]);
  let n = 0;
  for (const r of readCsv(path.join(CSV_DIR, "indidx.csv"))) {
    const id = parseInt(r.in_id, 10);
    if (!Number.isFinite(id)) continue;
    const s = slug(NA(r.name), id);
    w.add(
      `${id}, ${sqlStr(s)}, ${sqlStr(r.name)}, ${sqlStr(r.simpname)}, ` +
      `${sqlStr(r.lastname)}, ${sqlStr(r.firstname)}, ${sqlStr(r.middlename)}`
    );
    n++;
  }
  w.flush();
  console.log(`  ${n} rows`);
}

// --- 03: places (single file is fine; ~5.5k rows) --------------------------
{
  console.log("Places (locidx.csv + synthetic lc_id=52793):");
  const slug = makeSlugAssigner("place");
  // Reserve the unknown slug first so a real row can't claim it.
  slug("Location unknown", UNKNOWN_LC_ID);
  const w = new ChunkWriter("03_places", [
    "lc_id", "slug", "locn", "country", "lat", "lon",
  ]);
  w.add(`${UNKNOWN_LC_ID}, 'location-unknown', NULL, NULL, NULL, NULL`);
  let n = 1;
  for (const r of readCsv(path.join(CSV_DIR, "locidx.csv"))) {
    const id = parseInt(r.lc_id, 10);
    if (!Number.isFinite(id) || id === UNKNOWN_LC_ID) continue;
    const s = slug(NA(r.locn), id);
    w.add(
      `${id}, ${sqlStr(s)}, ${sqlStr(r.locn)}, ${sqlStr(r.country)}, ` +
      `${sqlReal(r.lat)}, ${sqlReal(r.lon)}`
    );
    n++;
  }
  w.flush();
  console.log(`  ${n} rows`);
}

// --- 04: organizations -----------------------------------------------------
{
  console.log("Organizations (orgidx.csv):");
  const slug = makeSlugAssigner("org");
  const w = new ChunkWriter("04_organizations", [
    "og_id", "slug", "org", "company",
  ]);
  let n = 0;
  for (const r of readCsv(path.join(CSV_DIR, "orgidx.csv"))) {
    const id = parseInt(r.og_id, 10);
    if (!Number.isFinite(id)) continue;
    const s = slug(NA(r.org), id);
    w.add(
      `${id}, ${sqlStr(s)}, ${sqlStr(r.org)}, ${sqlStr(r.company)}`
    );
    n++;
  }
  w.flush();
  console.log(`  ${n} rows`);
}

// --- 05: connections (from combo5_3b.csv) ----------------------------------
{
  console.log("Connections (combo5_3b.csv):");
  const w = new ChunkWriter("05_connections", [
    "in_id", "og_id", "lc_id", "year", "position", "source", "type", "edu", "nationality", "text",
  ]);
  let n = 0;
  for (const r of readCsv(path.join(CSV_DIR, "combo5_3b.csv"))) {
    const in_id = parseInt(r.in_id, 10);
    if (!Number.isFinite(in_id)) continue;
    w.add(
      `${in_id}, ${sqlInt(r.og_id)}, ${sqlInt(r.lc_id)}, ${sqlInt(r.year)}, ` +
      `${sqlStr(r.position)}, ${sqlStr(r.source)}, ${sqlStr(r.type)}, ` +
      `${sqlStr(r.edu)}, ${sqlStr(r.nationality)}, ${sqlStr(r.text)}`
    );
    n++;
    if (n % 50000 === 0) console.log(`  ${n}…`);
  }
  w.flush();
  console.log(`  ${n} rows`);
}

console.log("\nDone. Apply with: npm run load:local  (or  load:remote)");
