import { page, html, esc, raw } from "./_lib/html.js";
import { getPage, paginationHtml, personLabel } from "./_lib/util.js";

const SORTS = {
  name:            { sql: "p.lastname, p.firstname, p.in_id", label: "Name (A–Z)" },
  connections:     { sql: "conn_count DESC, p.lastname",      label: "Most connections" },
  connections_asc: { sql: "conn_count ASC, p.lastname",       label: "Fewest connections" },
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const source = (url.searchParams.get("source") || "").trim();
  const sortKey = SORTS[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "name";
  const { page: pageNum, limit, offset } = getPage(url);

  // Build WHERE clause. Forgiving substring match on both name and simpname.
  // Lowercase comparison since we don't have a collation set. Later: swap for
  // Meilisearch/Typesense or D1 FTS5 — this LIKE scan is the obvious bottleneck.
  const where = [];
  const params = [];
  if (q) {
    where.push("(LOWER(p.name) LIKE ?1 OR LOWER(p.simpname) LIKE ?1)");
    params.push(`%${q.toLowerCase()}%`);
  }
  if (source) {
    // EXISTS keeps people who have at least one connection with the given source.
    where.push(`EXISTS (SELECT 1 FROM connections c WHERE c.in_id = p.in_id AND c.source = ?${params.length + 1})`);
    params.push(source);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const listSql = `
    SELECT p.in_id, p.slug, p.name, p.simpname, p.lastname,
           (SELECT COUNT(*) FROM connections c WHERE c.in_id = p.in_id) AS conn_count
    FROM people p
    ${whereSql}
    ORDER BY ${SORTS[sortKey].sql}
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
  const rows = (await env.DB.prepare(listSql).bind(...params).all()).results || [];
  const hasNext = rows.length > limit;
  const display = hasNext ? rows.slice(0, limit) : rows;

  // Source dropdown options — derived from the data.
  const sources = (await env.DB.prepare(
    `SELECT DISTINCT source FROM connections WHERE source IS NOT NULL ORDER BY source`
  ).all()).results || [];

  const sourceOptions = sources
    .map(s => `<option value="${esc(s.source)}"${s.source === source ? " selected" : ""}>${esc(s.source)}</option>`)
    .join("");

  const sortOptions = Object.entries(SORTS)
    .map(([k, v]) => `<option value="${esc(k)}"${k === sortKey ? " selected" : ""}>${esc(v.label)}</option>`)
    .join("");

  const tableRows = display.map(r => html`
    <tr>
      <td><a href="/people/${raw(esc(r.slug))}">${personLabel(r)}</a></td>
      <td class="muted">${r.simpname || ""}</td>
      <td>${r.conn_count}</td>
    </tr>
  `).join("");

  const body = html`
    <h1>People</h1>
    <form class="filter-bar" method="get" action="/people">
      <input type="search" name="q" value="${q}" placeholder="Search name (case-insensitive)">
      <select name="source">
        <option value="">All sources</option>
        ${raw(sourceOptions)}
      </select>
      <select name="sort">${raw(sortOptions)}</select>
      <button type="submit">Filter</button>
      ${raw(q || source || sortKey !== "name" ? `<a href="/people">Clear</a>` : "")}
    </form>
    <table>
      <thead><tr><th>Name</th><th>Simp. name</th><th># connections</th></tr></thead>
      <tbody>${raw(tableRows)}</tbody>
    </table>
    ${raw(paginationHtml(pageNum, hasNext, "/people", { q, source, sort: sortKey === "name" ? "" : sortKey }))}
    ${raw(display.length === 0 ? '<p class="muted">No matches.</p>' : "")}
  `;
  return page({ title: "People", body });
}
