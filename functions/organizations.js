import { page, html, raw, esc } from "./_lib/html.js";
import { getPage, paginationHtml, orgLabel } from "./_lib/util.js";

const SORTS = {
  name:            { sql: "COALESCE(o.org, o.company), o.og_id", label: "Name (A–Z)" },
  connections:     { sql: "conn_count DESC, o.og_id",            label: "Most connections" },
  connections_asc: { sql: "conn_count ASC, o.og_id",             label: "Fewest connections" },
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const sortKey = SORTS[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "name";
  const { page: pageNum, limit, offset } = getPage(url);

  const where = [];
  const params = [];
  if (q) {
    where.push("(LOWER(o.org) LIKE ?1 OR LOWER(o.company) LIKE ?1)");
    params.push(`%${q.toLowerCase()}%`);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const listSql = `
    SELECT o.og_id, o.slug, o.org, o.company,
           (SELECT COUNT(*) FROM connections c WHERE c.og_id = o.og_id) AS conn_count
    FROM organizations o
    ${whereSql}
    ORDER BY ${SORTS[sortKey].sql}
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
  const rows = (await env.DB.prepare(listSql).bind(...params).all()).results || [];
  const hasNext = rows.length > limit;
  const display = hasNext ? rows.slice(0, limit) : rows;

  const sortOptions = Object.entries(SORTS)
    .map(([k, v]) => `<option value="${esc(k)}"${k === sortKey ? " selected" : ""}>${esc(v.label)}</option>`)
    .join("");

  const tableRows = display.map(r => html`
    <tr>
      <td><a href="/organizations/${raw(esc(r.slug))}">${orgLabel(r)}</a></td>
      <td class="muted">${r.company && r.company !== r.org ? r.company : ""}</td>
      <td>${r.conn_count}</td>
    </tr>
  `).join("");

  const body = html`
    <h1>Organizations</h1>
    <form class="filter-bar" method="get" action="/organizations">
      <input type="search" name="q" value="${q}" placeholder="Search organization or company">
      <select name="sort">${raw(sortOptions)}</select>
      <button type="submit">Filter</button>
      ${raw(q || sortKey !== "name" ? `<a href="/organizations">Clear</a>` : "")}
    </form>
    <table>
      <thead><tr><th>Organization</th><th>Company (if different)</th><th># connections</th></tr></thead>
      <tbody>${raw(tableRows)}</tbody>
    </table>
    ${raw(paginationHtml(pageNum, hasNext, "/organizations", { q, sort: sortKey === "name" ? "" : sortKey }))}
    ${raw(display.length === 0 ? '<p class="muted">No matches.</p>' : "")}
  `;
  return page({ title: "Organizations", body });
}
