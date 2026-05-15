-- D1 schema for the historical engineers prototype.
-- Star schema: people / places / organizations are dimensions,
-- connections is the fact table.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  in_id       INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT,
  simpname    TEXT,
  lastname    TEXT,
  firstname   TEXT,
  middlename  TEXT
);

CREATE INDEX IF NOT EXISTS idx_people_simpname ON people(simpname);
CREATE INDEX IF NOT EXISTS idx_people_lastname ON people(lastname);
-- name index supports the LIKE-based search; swap for FTS later if needed.
CREATE INDEX IF NOT EXISTS idx_people_name     ON people(name);

CREATE TABLE IF NOT EXISTS places (
  lc_id    INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,
  locn     TEXT,
  country  TEXT,
  lat      REAL,
  lon      REAL
);

CREATE INDEX IF NOT EXISTS idx_places_country ON places(country);
CREATE INDEX IF NOT EXISTS idx_places_locn    ON places(locn);

CREATE TABLE IF NOT EXISTS organizations (
  og_id    INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,
  org      TEXT,
  company  TEXT
);

CREATE INDEX IF NOT EXISTS idx_orgs_org ON organizations(org);

CREATE TABLE IF NOT EXISTS connections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  in_id        INTEGER NOT NULL REFERENCES people(in_id),
  og_id        INTEGER          REFERENCES organizations(og_id),
  lc_id        INTEGER          REFERENCES places(lc_id),
  year         INTEGER,
  position     TEXT,
  source       TEXT,
  type         TEXT,
  edu          TEXT,
  nationality  TEXT,
  -- Raw OCR snippet. Kept verbatim for provenance.
  -- Full-text search on `text` would slot in here later (FTS5 virtual table
  -- mirroring this column, or a Meilisearch/Typesense index).
  text         TEXT
);

CREATE INDEX IF NOT EXISTS idx_conn_in_id   ON connections(in_id);
CREATE INDEX IF NOT EXISTS idx_conn_og_id   ON connections(og_id);
CREATE INDEX IF NOT EXISTS idx_conn_lc_id   ON connections(lc_id);
CREATE INDEX IF NOT EXISTS idx_conn_year    ON connections(year);
CREATE INDEX IF NOT EXISTS idx_conn_source  ON connections(source);
