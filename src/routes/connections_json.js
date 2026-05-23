// Co-occurrence graph data for /connections.
//
// Nodes: top-N orgs by distinct person count.
// Edges: pairs of those orgs sharing >= `min` people. Weight = shared count.
//
// Query params:
//   n   — top-N org cap   (default 300, clamped to [10, 1000])
//   min — min edge weight (default 2,   clamped to >= 1)
//
// Returned shape (compact arrays to keep payload small):
//   { nodes: [[og_id, slug, label, people], ...],
//     edges: [[src_og_id, dst_og_id, weight], ...] }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const n = clamp(parseInt(url.searchParams.get("n") || "300", 10), 10, 1000, 300);
  const min = Math.max(parseInt(url.searchParams.get("min") || "2", 10) || 2, 1);

  const nodes = (await env.DB.prepare(`
    SELECT o.og_id, o.slug, o.org, o.company,
           COUNT(DISTINCT c.in_id) AS people
    FROM organizations o
    JOIN connections c ON c.og_id = o.og_id
    GROUP BY o.og_id
    ORDER BY people DESC
    LIMIT ?1
  `).bind(n).all()).results || [];

  if (nodes.length === 0) {
    return json({ nodes: [], edges: [] });
  }

  // Self-join the connections fact table restricted to top-N org ids.
  // a.og_id < b.og_id gives undirected pairs without duplicates.
  //
  // D1 caps bound placeholders at ?1..?100, well under the n we want (up to
  // 1000). Org ids come from our own integers column so it's safe to inline —
  // we still defensively filter to integers below.
  const orgIds = nodes.map(r => r.og_id).filter(Number.isInteger);
  const idList = orgIds.join(",");
  const edges = (await env.DB.prepare(`
    SELECT a.og_id AS src, b.og_id AS dst,
           COUNT(DISTINCT a.in_id) AS w
    FROM connections a
    JOIN connections b
      ON a.in_id = b.in_id AND a.og_id < b.og_id
    WHERE a.og_id IN (${idList})
      AND b.og_id IN (${idList})
    GROUP BY a.og_id, b.og_id
    HAVING w >= ?1
  `).bind(min).all()).results || [];

  return json({
    nodes: nodes.map(r => [r.og_id, r.slug, r.org || r.company || `Org ${r.og_id}`, r.people]),
    edges: edges.map(e => [e.src, e.dst, e.w]),
  });
}

function clamp(v, lo, hi, fallback) {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, lo), hi);
}

function json(payload) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
