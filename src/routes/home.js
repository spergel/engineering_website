import { page, html } from "../lib/html.js";

export async function onRequestGet({ env }) {
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM people) AS people,
      (SELECT COUNT(*) FROM places WHERE lc_id != 52793) AS places,
      (SELECT COUNT(*) FROM organizations) AS orgs,
      (SELECT COUNT(*) FROM connections) AS connections
  `).first();

  const body = html`
    <h1>Historical Engineers</h1>
    <p>A prototype browser for a dataset of historical engineers, the organizations they worked for, and the places they were associated with. Data is OCR'd from mining yearbooks, university alumni records, and professional society rolls.</p>
    <div class="cards">
      <div class="card"><h3>People</h3><div class="count">${counts.people}</div><a href="/people">Browse &rarr;</a></div>
      <div class="card"><h3>Places</h3><div class="count">${counts.places}</div><a href="/places">Browse &rarr;</a></div>
      <div class="card"><h3>Organizations</h3><div class="count">${counts.orgs}</div><a href="/organizations">Browse &rarr;</a></div>
      <div class="card"><h3>Connections</h3><div class="count">${counts.connections}</div><small>person × org × place × year</small></div>
    </div>
  `;
  return page({ title: "Home", body });
}
