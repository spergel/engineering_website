// Shared utilities for routes.

export const UNKNOWN_LC_ID = 52793; // "Location unknown" sentinel.
export const PAGE_SIZE = 50;

// Pagination from a URL search params object.
export function getPage(url, pageSize = PAGE_SIZE) {
  const p = parseInt(url.searchParams.get("page") || "1", 10);
  const page = Number.isFinite(p) && p > 0 ? p : 1;
  return { page, limit: pageSize, offset: (page - 1) * pageSize };
}

// Render a label even when locn is NULL or the lc_id is the unknown sentinel.
export function placeLabel(row) {
  if (!row || row.lc_id === UNKNOWN_LC_ID || !row.locn) return "Location unknown";
  return row.locn;
}

// Same idea for org rows.
export function orgLabel(row) {
  if (!row) return "Unknown organization";
  return row.org || row.company || "Unknown organization";
}

// "Smith, J. P." style display name when name is missing.
export function personLabel(row) {
  if (!row) return "Unknown person";
  return row.name || row.simpname || `Person #${row.in_id}`;
}

// OSM URL from lat/lon. Don't render anything if either is missing.
export function osmUrl(lat, lon) {
  if (lat == null || lon == null) return null;
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=10/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
}

// Build a URL on the same path with merged query params. Omits empty values.
export function withPage(basePath, params, page) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  sp.set("page", String(page));
  return `${basePath}?${sp.toString()}`;
}

// Pagination links footer.
export function paginationHtml(page, hasNext, basePath, params = {}) {
  const prev = page > 1 ? `<a href="${withPage(basePath, params, page - 1)}">&larr; Prev</a>` : "";
  const next = hasNext ? `<a href="${withPage(basePath, params, page + 1)}">Next &rarr;</a>` : "";
  if (!prev && !next) return "";
  return `<nav class="pagination">${prev}<span>Page ${page}</span>${next}</nav>`;
}
