import { page, html, esc, raw } from "./_lib/html.js";
import { getPage, paginationHtml, UNKNOWN_LC_ID, displayCountry } from "./_lib/util.js";

const SORTS = {
  name:          { sql: "p.country, p.locn",                          label: "Name (A–Z)" },
  connections:   { sql: "conn_count DESC, p.locn",                    label: "Most connections" },
  connections_asc: { sql: "conn_count ASC, p.locn",                   label: "Fewest connections" },
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const country = (url.searchParams.get("country") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const sortKey = SORTS[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "name";
  const { page: pageNum, limit, offset } = getPage(url);

  // Filter out the "unknown location" sentinel from listings.
  const where = [`p.lc_id != ${UNKNOWN_LC_ID}`, "p.locn IS NOT NULL"];
  const params = [];
  if (country) {
    // Case-insensitive match — the source CSV mixes 'canada' and 'Canada'.
    where.push(`LOWER(p.country) = ?${params.length + 1}`);
    params.push(country.toLowerCase());
  }
  if (q) {
    where.push(`LOWER(p.locn) LIKE ?${params.length + 1}`);
    params.push(`%${q.toLowerCase()}%`);
  }

  const listSql = `
    SELECT p.lc_id, p.slug, p.locn, p.country, p.lat, p.lon,
           (SELECT COUNT(*) FROM connections c WHERE c.lc_id = p.lc_id) AS conn_count
    FROM places p
    WHERE ${where.join(" AND ")}
    ORDER BY ${SORTS[sortKey].sql}
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
  const rows = (await env.DB.prepare(listSql).bind(...params).all()).results || [];
  const hasNext = rows.length > limit;
  const display = hasNext ? rows.slice(0, limit) : rows;

  // Dropdown: deduped, lowercased.
  const countries = (await env.DB.prepare(`
    SELECT LOWER(country) AS country, COUNT(*) AS n
    FROM places
    WHERE country IS NOT NULL AND country != 'NA' AND lc_id != ${UNKNOWN_LC_ID}
    GROUP BY LOWER(country)
    ORDER BY country
  `).all()).results || [];

  const countryOptions = countries
    .map(c => `<option value="${esc(c.country)}"${c.country === country.toLowerCase() ? " selected" : ""}>${esc(c.country)} (${c.n})</option>`)
    .join("");

  const sortOptions = Object.entries(SORTS)
    .map(([k, v]) => `<option value="${esc(k)}"${k === sortKey ? " selected" : ""}>${esc(v.label)}</option>`)
    .join("");

  const tableRows = display.map(r => html`
    <tr>
      <td><a href="/places/${raw(esc(r.slug))}">${r.locn}</a></td>
      <td class="muted">${displayCountry(r)}</td>
      <td>${r.conn_count}</td>
    </tr>
  `).join("");

  const body = html`
    <h1>Places</h1>
    <form class="filter-bar" method="get" action="/places">
      <input type="search" name="q" value="${q}" placeholder="Search location">
      <select name="country">
        <option value="">All countries</option>
        ${raw(countryOptions)}
      </select>
      <select name="sort">${raw(sortOptions)}</select>
      <button type="submit">Filter</button>
      ${raw(q || country || sortKey !== "name" ? `<a href="/places">Clear</a>` : "")}
    </form>
    <table>
      <thead><tr><th>Location</th><th>Country</th><th># connections</th></tr></thead>
      <tbody>${raw(tableRows)}</tbody>
    </table>
    ${raw(paginationHtml(pageNum, hasNext, "/places", { q, country, sort: sortKey === "name" ? "" : sortKey }))}
    ${raw(display.length === 0 ? '<p class="muted">No matches.</p>' : "")}
  `;
  return page({ title: "Places", body });
}
