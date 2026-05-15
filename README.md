# Historical Engineers — prototype

A small Cloudflare Pages + D1 prototype for browsing a dataset of historical
engineers, the organizations they worked for, and the places they were
associated with. Built as the minimum needed to validate the data shape — not
the final product.

Stack: Cloudflare Pages (static + Pages Functions), Cloudflare D1 (SQLite),
server-rendered HTML, no build step.

## Layout

```
migrations/0001_init.sql      D1 schema
seed.sql                      Sample data (~48 people, 19 places, 23 orgs, ~109 connections)
wrangler.toml                 Cloudflare project config (account_id + D1 binding)
public/                       Static assets served by Pages
  style.css
  csv/                        Source CSVs (large ones are gitignored — see below)
functions/                    Pages Functions (one file per route)
  index.js                    GET /
  people.js                   GET /people
  people/[slug].js            GET /people/:slug
  places.js                   GET /places
  places/[slug].js            GET /places/:slug
  organizations.js            GET /organizations
  organizations/[slug].js     GET /organizations/:slug
  _lib/                       Shared helpers (HTML rendering, pagination, labels)
scripts/
  setup.mjs                   One-shot: creates D1, writes binding, migrates + seeds
  import.mjs                  Generates bulk-import SQL chunks from the full CSVs
  apply.mjs                   Walks data/*.sql chunks and applies them to D1
```

## Routes

| Path                       | Purpose                                             |
|----------------------------|-----------------------------------------------------|
| `/`                        | Homepage with table counts                          |
| `/people`                  | Paginated list — filter by name (substring), source |
| `/people/[slug]`           | Career timeline for one person                      |
| `/places`                  | Paginated list — filter by location, country        |
| `/places/[slug]`           | Place detail + everyone connected to it             |
| `/organizations`           | Paginated list — filter by name                     |
| `/organizations/[slug]`    | Org detail + everyone connected to it               |

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

That's it. The `setup` script is idempotent — re-running is safe. The first
deploy creates a Pages project named `engineers`; rename it via the `deploy`
script in `package.json`.

### Local dev only

```bash
npm install
npx wrangler login        # one time
npm run setup:local       # creates D1 + migrates + seeds locally; skips remote
npm run dev               # http://localhost:8788
```

## Loading the full dataset

The committed `seed.sql` is a curated ~50-person slice — fine for quick
iteration. To load all 129k people / 5.5k places / 53k orgs / ~315k
connections, use the bulk-import pipeline.

```bash
npm run import            # reads public/csv/*.csv, writes data/*.sql chunks
npm run load:local        # applies every data/*.sql to local D1
npm run load:remote       # applies every data/*.sql to remote D1
```

`scripts/import.mjs` writes multi-row `INSERT` statements, ~500 rows per
statement, ~3MB per file. `scripts/apply.mjs` walks them in lexical order
and calls `wrangler d1 execute --file=...` for each.

### CSV files

```
public/csv/indidx.csv      ~7 MB    committed
public/csv/locidx.csv     ~0.5 MB   committed
public/csv/orgidx.csv      ~3 MB    committed
public/csv/combo5_3b.csv  ~36 MB    gitignored (over GitHub's recommended size)
public/csv/crp3_1b.csv   ~129 MB    gitignored (over GitHub's 100 MB hard limit)
public/csv/emjdbase1_4b.csv ~702 MB gitignored (way over)
```

The small dimension CSVs travel with the repo. The three large
connection-style CSVs are gitignored — keep them in `public/csv/` locally,
or pass a different `--csv-dir` to `scripts/import.mjs`. For sharing, Git
LFS or a separate object store (R2) would be the next step.

Only `combo5_3b.csv` is loaded right now — it's the canonical merged
corpis+alumni+professional fact table. `crp3_1b.csv` and
`emjdbase1_4b.csv` carry extra columns (minerals/output/technology, journal
volume/page) the schema doesn't model yet.

## Data model

Star schema, three dimensions + one fact table. See
`migrations/0001_init.sql` for full column types and indexes.

- **people** — `in_id` PK, `slug`, plus name fields
- **places** — `lc_id` PK, `slug`, `locn`, `country`, `lat`, `lon`
- **organizations** — `og_id` PK, `slug`, `org`, `company`
- **connections** — `in_id` × `og_id` × `lc_id` × `year` plus `position`,
  `source`, `type`, `edu`, `nationality`, and the raw OCR `text`

### Quirks handled in code

- **`NA` sentinel** — source CSVs use `"NA"` everywhere a value is missing.
  Both the seed generator and `scripts/import.mjs` convert these to SQL
  `NULL` via a one-line helper.
- **`lc_id = 52793`** — "unknown location" placeholder. A synthetic `places`
  row with that id is inserted so connection FKs stay valid. `/places`
  filters it out; the place detail route returns 404 for it; person/org
  detail rows render it as "Location unknown".
- **OCR garble** — names like `"V Molesworth Aabyn"` are displayed as-is.
  Search hits `name` *and* `simpname` (case-insensitive substring), so an
  alternate transliteration in `simpname` can still match.
- **Slug collisions** — common with OCR variants of the same name. The
  importer keeps a per-table `Map` of base slugs and appends `-2`, `-3`, …
  on collision. Slugs fall back to `person-{id}` / `place-{id}` /
  `org-{id}` when the name is empty.

## What's intentionally not here

- No SPA, no build step, no client-side JS. Each route is one file that
  returns server-rendered HTML.
- No full-text search. `LOWER(col) LIKE '%…%'` is fine for hundreds of
  thousands of rows but won't scale to OCR `text` search. Comments mark the
  Meilisearch/Typesense/FTS5 slot.
- No auth, no write paths, no admin.
