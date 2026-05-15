import { page, html, raw, esc } from "../_lib/html.js";
import { UNKNOWN_LC_ID, personLabel, orgLabel, osmUrl, displayCountry } from "../_lib/util.js";

export async function onRequestGet({ params, env }) {
  const place = await env.DB
    .prepare("SELECT * FROM places WHERE slug = ?1")
    .bind(params.slug)
    .first();
  if (!place || place.lc_id === UNKNOWN_LC_ID) {
    return new Response("Not found", { status: 404 });
  }

  // Everyone connected to this place.
  const conns = (await env.DB.prepare(`
    SELECT c.year, c.position, c.source,
           p.in_id, p.slug AS person_slug, p.name, p.simpname,
           o.og_id, o.slug AS org_slug, o.org, o.company
    FROM connections c
    JOIN people p ON p.in_id = c.in_id
    LEFT JOIN organizations o ON o.og_id = c.og_id
    WHERE c.lc_id = ?1
    ORDER BY c.year IS NULL, c.year, p.lastname, p.firstname
  `).bind(place.lc_id).all()).results || [];

  const rows = conns.map(c => html`
    <tr>
      <td>${c.year ?? ""}</td>
      <td><a href="/people/${raw(esc(c.person_slug))}">${personLabel(c)}</a></td>
      <td>${c.position || ""}</td>
      <td>${raw(c.og_id ? `<a href="/organizations/${esc(c.org_slug)}">${esc(orgLabel(c))}</a>` : "")}</td>
      <td><small>${c.source || ""}</small></td>
    </tr>
  `).join("");

  const map = osmUrl(place.lat, place.lon);
  const body = html`
    <p><a href="/places">&larr; All places</a></p>
    <h1>${place.locn}</h1>
    <p class="muted">
      ${displayCountry(place)}
      ${raw(place.lat != null && place.lon != null ? ` · ${esc(place.lat)}, ${esc(place.lon)}` : "")}
      ${raw(map ? ` · <a href="${esc(map)}" target="_blank" rel="noopener">View on OpenStreetMap</a>` : "")}
    </p>
    <h2>People connected here (${conns.length})</h2>
    ${raw(conns.length === 0 ? '<p class="muted">No connections recorded.</p>' : `
      <table>
        <thead><tr><th>Year</th><th>Person</th><th>Role</th><th>Organization</th><th>Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `)}
  `;
  return page({ title: place.locn || "Place", body });
}
