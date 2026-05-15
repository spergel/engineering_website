import { page, html, raw, esc } from "../_lib/html.js";
import { UNKNOWN_LC_ID, placeLabel, orgLabel, personLabel, osmUrl } from "../_lib/util.js";

export async function onRequestGet({ request, params, env }) {
  const slug = params.slug;
  const person = await env.DB
    .prepare("SELECT * FROM people WHERE slug = ?1")
    .bind(slug)
    .first();
  if (!person) {
    return new Response("Not found", { status: 404 });
  }

  // Career timeline: each connection joined to its org and place dimensions.
  const conns = (await env.DB.prepare(`
    SELECT c.year, c.position, c.source, c.type, c.edu, c.nationality, c.text,
           o.og_id, o.slug AS org_slug, o.org, o.company,
           l.lc_id, l.slug AS place_slug, l.locn, l.country
    FROM connections c
    LEFT JOIN organizations o ON o.og_id = c.og_id
    LEFT JOIN places        l ON l.lc_id = c.lc_id
    WHERE c.in_id = ?1
    ORDER BY c.year IS NULL, c.year, c.source
  `).bind(person.in_id).all()).results || [];

  const rows = conns.map((c, i) => {
    const orgCell = c.og_id
      ? `<a href="/organizations/${esc(c.org_slug)}">${esc(orgLabel(c))}</a>`
      : `<span class="muted">—</span>`;
    const isUnknownLoc = !c.lc_id || c.lc_id === UNKNOWN_LC_ID || !c.locn;
    const placeCell = isUnknownLoc
      ? `<span class="muted">Location unknown</span>`
      : `<a href="/places/${esc(c.place_slug)}">${esc(placeLabel(c))}</a>`;
    return html`
      <tr class="${raw(isUnknownLoc ? "unknown-loc" : "")}">
        <td>${c.year ?? ""}</td>
        <td>${c.position || ""}</td>
        <td>${raw(orgCell)}</td>
        <td>${raw(placeCell)}</td>
        <td><small>${c.source || ""}</small></td>
        <td>
          ${raw(c.text ? `
            <details class="snippet">
              <summary>source snippet</summary>
              <div class="text">${esc(c.text)}</div>
            </details>` : "")}
        </td>
      </tr>
    `;
  }).join("");

  const body = html`
    <p><a href="/people">&larr; All people</a></p>
    <h1>${personLabel(person)}</h1>
    <p class="muted">
      ${person.simpname || ""}
      ${raw(person.lastname || person.firstname ? ` · ${esc([person.firstname, person.middlename, person.lastname].filter(Boolean).join(" "))}` : "")}
    </p>
    <h2>Career timeline (${conns.length})</h2>
    ${raw(conns.length === 0 ? '<p class="muted">No connections recorded.</p>' : `
      <table>
        <thead>
          <tr><th>Year</th><th>Role</th><th>Organization</th><th>Place</th><th>Source</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `)}
  `;
  return page({ title: personLabel(person), body });
}
