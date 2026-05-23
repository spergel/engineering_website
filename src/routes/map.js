import { page } from "../lib/html.js";

// Full-page Leaflet map with marker clustering. Data is fetched from
// /places.json on load and grouped by Leaflet.markercluster — the plugin
// handles all the zoom-dependent grouping client-side.
export async function onRequestGet() {
  const body = `
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
    <style>
      main { max-width: none; padding: 0; }
      #map { width: 100%; height: calc(100vh - 180px); min-height: 480px; }
      .map-header { max-width: 960px; margin: 0 auto; padding: 1rem; }
      .map-header h1 { margin: 0 0 0.25rem; }
      .leaflet-popup-content { font-size: 0.9em; }
      .leaflet-popup-content a { color: var(--accent); }
    </style>
    <div class="map-header">
      <h1>Map of places</h1>
      <p class="muted" id="map-status">Loading…</p>
    </div>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
            integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
    <script>
    (async function () {
      const status = document.getElementById("map-status");
      const map = L.map("map", { worldCopyJump: true }).setView([20, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const cluster = L.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 50,
      });

      function esc(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      }

      try {
        const res = await fetch("/places.json");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();

        const markers = [];
        let skipped = 0;
        for (const row of data) {
          const [lc_id, slug, locn, country, lat, lon, conn_count] = row;
          const latN = Number(lat), lonN = Number(lon);
          if (!Number.isFinite(latN) || !Number.isFinite(lonN)) { skipped++; continue; }
          const m = L.marker([latN, lonN]);
          const country_part = country && country !== "NA" ? " &middot; " + esc(country) : "";
          m.bindPopup(
            '<strong><a href="/places/' + esc(slug) + '">' + esc(locn || "(unnamed)") + "</a></strong>" +
            '<div class="muted">' + esc(conn_count) + " connection" + (conn_count === 1 ? "" : "s") + country_part + "</div>"
          );
          markers.push(m);
        }
        cluster.addLayers(markers);
        map.addLayer(cluster);

        if (markers.length) {
          const bounds = cluster.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
          }
        }
        status.textContent = markers.length.toLocaleString() + " places. Click a cluster to zoom in." +
          (skipped ? " (" + skipped + " skipped — bad coordinates)" : "");
      } catch (err) {
        status.textContent = "Failed to load places: " + err.message;
      }
    })();
    </script>
  `;
  return page({ title: "Map", body });
}
