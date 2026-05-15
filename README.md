# Historical Engineers — prototype

A small Cloudflare Pages + D1 prototype for browsing a dataset of historical
engineers, the organizations they worked for, and the places they were
associated with. Built as the minimum needed to validate the data shape — not
the final product.

Stack: Cloudflare Pages (static + Pages Functions), Cloudflare D1 (SQLite),
server-rendered HTML, no build step.

## Layout

```
migrations/0001_init.sql   D1 schema
seed.sql                   Sample data (~48 people, 19 places, 23 orgs, ~109 connections)
wrangler.toml              Cloudflare project config (paste your D1 id here)
public/                    Static assets served as-is
  style.css
functions/                 Pages Functions (one file per route)
  index.js                 GET /
  people.js                GET /people
  places.js                GET /places
  organizations.js         GET /organizations
  _lib/                    Shared helpers (HTML rendering, pagination)
scripts/import.mjs         Sketch CSV importer for the real dataset
```

## Routes

Each route is a paginated list with one or two filters:

| Path             | Filters                          |
|------------------|----------------------------------|
| `/`              | (homepage with table counts)     |
| `/people`        | name (substring), source         |
| `/places`        | location (substring), country    |
| `/organizations` | name (substring)                 |

Substring search is case-insensitive `LOWER(col) LIKE '%...%'`. Comments mark
where a real search service (Meilisearch / Typesense / D1 FTS5) would slot in.

## Get it running on Cloudflare

```bash
npm install
npx wrangler login        # one time — opens a browser
npm run setup             # creates D1, writes the binding into wrangler.toml,
                          # then applies migrations + seed on both local and remote
npm run deploy            # ships to Cloudflare Pages
```

That's it. The `setup` script is idempotent — re-running it is safe and just
re-seeds. The first deploy will create a Pages project named `engineers`; if
you want a different name, edit the `deploy` script in `package.json` or pass
`--project-name=...` directly to `wrangler pages deploy public`.

### Local dev only

```bash
npm install
npx wrangler login        # one time
npm run setup:local       # creates D1 + migrates + seeds locally; skips remote
npm run dev               # http://localhost:8788
```

### Useful individual commands

```bash
npm run d1:migrate:local      # re-apply migrations to local D1
npm run d1:migrate:remote     # re-apply migrations to remote D1
npm run d1:seed:local         # re-load seed.sql locally
npm run d1:seed:remote        # re-load seed.sql remotely
```

Wrangler reads the `[[d1_databases]]` binding from `wrangler.toml` and wires
it into the deployed Pages project. The D1 binding is exposed inside Pages
Functions as `env.DB`.

## Data model

Star schema with three dimensions and one fact table. See
`migrations/0001_init.sql` for column types and indexes.

- **people** — `in_id` PK, `slug`, plus name fields
- **places** — `lc_id` PK, `slug`, `locn`, `country`, `lat`, `lon`
- **organizations** — `og_id` PK, `slug`, `org`, `company`
- **connections** — `in_id` × `og_id` × `lc_id` × `year` plus `position`,
  `source`, `type`, `edu`, `nationality`, and the raw OCR `text`

### Quirks the seed already accounts for

- **`NA` sentinel** — the source CSVs use the string `"NA"` everywhere a value
  is missing. The seed and the import sketch convert these to SQL `NULL`.
- **`lc_id = 52793`** — "unknown location" placeholder. A synthetic `places`
  row with that id is inserted so connection FKs stay valid. The `/places`
  listing filters it out (`WHERE lc_id != 52793 AND locn IS NOT NULL`).
- **OCR garble** — names like `"V Molesworth Aabyn"` are displayed as-is.
  Search hits `name` and `simpname` (case-insensitive substring) so an
  alternate transliteration in `simpname` can still match.

## How to load the real dataset

The seed in this repo is a curated ~50-person slice. To load all ~100k
people / ~7.5k places / ~50k orgs / millions of connections, use the import
script sketch in `scripts/import.mjs` as a starting point.

1. **Put the CSVs somewhere local** (not in the repo — they're large). The
   importer expects `indidx.csv`, `locidx.csv`, `orgidx.csv`, and the
   connections CSVs in one directory.
2. **Run the importer to generate SQL** (this does not touch D1; it only
   writes a file):
   ```bash
   node scripts/import.mjs --csv-dir "/path/to/csvs" --out import.sql
   ```
3. **Apply the SQL**. Locally:
   ```bash
   wrangler d1 execute engineers-db --local --file=./import.sql
   ```
   For remote D1, you'll likely need to split `import.sql` into chunks (the
   `wrangler d1 execute --file` path has a size cap). Splitting by table
   then by 5k-statement batches is a reasonable starting point.

### What the importer already handles

- **`NA` → `NULL`** via a small `NA()` helper. Applies to every text/int/real
  column on insert.
- **`lc_id = 52793` placeholder** — inserted once at the top as a synthetic
  row (`'location-unknown'`), and the locidx loop skips any real row with
  that id so it can't conflict.
- **Slug collisions** — `makeSlugAssigner()` keeps a per-table `Set` of used
  slugs and appends `-2`, `-3`, … when a base slug repeats. Slugs default
  to `person-{id}` / `place-{id}` / `org-{id}` when the name is empty.

### What you still need to decide

- **Multiple connections CSVs** — `combo5_3b.csv` is the canonical fact
  table; `crp3_1b.csv` and `emjdbase1_4b.csv` carry overlapping but not
  identical columns (mineral / output / technology / page / vol …). The
  importer only loads `combo5_3b.csv`. Add the others once you've decided
  whether to extend the schema or drop those fields.
- **Indexes during bulk insert** — for millions of rows, drop the
  `connections` indexes before insert and recreate them after, or insert
  inside a single transaction. The sketch wraps in `BEGIN; … COMMIT;`.
- **Full-text search** — at this scale, `LOWER(col) LIKE '%…%'` will be slow
  on `connections.text`. The schema reserves `text` for the raw OCR; the
  obvious next step is either an FTS5 virtual table mirroring it, or
  shipping a copy to Meilisearch / Typesense and querying that from the
  Pages Functions. Comments mark the call sites.

## What's intentionally not here

- No detail pages (`/people/[slug]`, etc.). The prototype is just lists with
  filters — enough to validate the data shape.
- No build step, no SPA, no client-side JS. Each route is one file that
  returns server-rendered HTML.
- No auth, no write paths, no admin.
