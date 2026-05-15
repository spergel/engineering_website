import { page, html, raw, esc } from "../_lib/html.js";
import { UNKNOWN_LC_ID, personLabel, orgLabel, placeLabel } from "../_lib/util.js";

export async function onRequestGet({ params, env }) {
  const org = await env.DB
    .prepare("SELECT * FROM organizations WHERE slug = ?1")
    .bind(params.slug)
    .first();
  if (!org) {
    return new Response("Not found", { status: 404 });
  }

  const conns = (await env.DB.prepare(`
    SELECT c.year, c.position, c.source,
           p.in_id, p.slug AS person_slug, p.name, p.simpname,
           l.lc_id, l.slug AS place_slug, l.locn
    FROM connections c
    JOIN people p ON p.in_id = c.in_id
    LEFT JOIN places l ON l.lc_id = c.lc_id
    WHERE c.og_id = ?1
    ORDER BY c.year IS NULL, c.year, p.lastname, p.firstname
  `).bind(org.og_id).all()).results || [];

  const rows = conns.map(c => {
    const isUnknownLoc = !c.lc_id || c.lc_id === UNKNOWN_LC_ID || !c.locn;
    const placeCell = isUnknownLoc
      ? `<span class="muted">Location unknown</span>`
      : `<a href="/places/${esc(c.place_slug)}">${esc(placeLabel(c))}</a>`;
    return html`
      <tr>
        <td>${c.year ?? ""}</td>
        <td><a href="/people/${raw(esc(c.person_slug))}">${personLabel(c)}</a></td>
        <td>${c.position || ""}</td>
        <td>${raw(placeCell)}</td>
        <td><small>${c.source || ""}</small></td>
      </tr>
    `;
  }).join("");

  const body = html`
    <p><a href="/organizations">&larr; All organizations</a></p>
    <h1>${orgLabel(org)}</h1>
    ${raw(org.company && org.company !== org.org ? `<p class="muted">Company: ${esc(org.company)}</p>` : "")}
    <h2>People connected (${conns.length})</h2>
    ${raw(conns.length === 0 ? '<p class="muted">No connections recorded.</p>' : `
      <table>
        <thead><tr><th>Year</th><th>Person</th><th>Role</th><th>Place</th><th>Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `)}
  `;
  return page({ title: orgLabel(org), body });
}
