import { page, html, esc, raw } from "./_lib/html.js";
import { getPage, paginationHtml, UNKNOWN_LC_ID } from "./_lib/util.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const country = (url.searchParams.get("country") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const { page: pageNum, limit, offset } = getPage(url);

  // Filter out the "unknown location" sentinel from listings.
  const where = [`p.lc_id != ${UNKNOWN_LC_ID}`, "p.locn IS NOT NULL"];
  const params = [];
  if (country) {
    where.push(`p.country = ?${params.length + 1}`);
    params.push(country);
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
    ORDER BY p.country, p.locn
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
  const rows = (await env.DB.prepare(listSql).bind(...params).all()).results || [];
  const hasNext = rows.length > limit;
  const display = hasNext ? rows.slice(0, limit) : rows;

  const countries = (await env.DB.prepare(
    `SELECT DISTINCT country FROM places WHERE country IS NOT NULL AND lc_id != ${UNKNOWN_LC_ID} ORDER BY country`
  ).all()).results || [];

  const countryOptions = countries
    .map(c => `<option value="${esc(c.country)}"${c.country === country ? " selected" : ""}>${esc(c.country)}</option>`)
    .join("");

  const tableRows = display.map(r => html`
    <tr>
      <td>${r.locn}</td>
      <td class="muted">${r.country || ""}</td>
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
      <button type="submit">Filter</button>
      ${raw(q || country ? `<a href="/places">Clear</a>` : "")}
    </form>
    <table>
      <thead><tr><th>Location</th><th>Country</th><th># connections</th></tr></thead>
      <tbody>${raw(tableRows)}</tbody>
    </table>
    ${raw(paginationHtml(pageNum, hasNext, "/places", { q, country }))}
    ${raw(display.length === 0 ? '<p class="muted">No matches.</p>' : "")}
  `;
  return page({ title: "Places", body });
}
