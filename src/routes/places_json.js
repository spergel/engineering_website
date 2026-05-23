import { UNKNOWN_LC_ID } from "../lib/util.js";

// All places with coords + connection counts, for the /map page.
// Returned as a compact array-of-arrays to keep the payload small:
//   [lc_id, slug, locn, country, lat, lon, conn_count]
export async function onRequestGet({ env }) {
  const rows = (await env.DB.prepare(`
    SELECT p.lc_id, p.slug, p.locn, p.country, p.lat, p.lon,
           (SELECT COUNT(*) FROM connections c WHERE c.lc_id = p.lc_id) AS conn_count
    FROM places p
    WHERE p.lc_id != ${UNKNOWN_LC_ID}
      AND p.lat IS NOT NULL
      AND p.lon IS NOT NULL
  `).all()).results || [];

  const data = rows.map(r => [r.lc_id, r.slug, r.locn, r.country, r.lat, r.lon, r.conn_count]);
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
