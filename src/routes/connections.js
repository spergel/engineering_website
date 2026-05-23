import { page } from "../lib/html.js";

// Force-directed network graph of organizations, built as a "comparison
// playground": the visualization options (view, color, click behaviour)
// are exposed as live toggles so we can A/B them with real users.
//
// graphology + graphology-library (forceAtlas2 + Louvain) + sigma are loaded
// as UMD builds from jsDelivr, so there is no build step.
//
// NOTE: the whole `body` below is a backtick template literal, so the embedded
// client code deliberately avoids backticks and ${...} — it uses plain quotes
// and string concatenation throughout.
export async function onRequestGet() {
  const body = `
    <style>
      main { max-width: none; padding: 0; }
      .net-header { max-width: 960px; margin: 0 auto; padding: 1rem 1rem 0; }
      .net-header h1 { margin: 0 0 0.25rem; }

      .net-controls {
        max-width: 960px; margin: 0 auto; padding: 0.5rem 1rem;
        display: flex; flex-direction: column; gap: 0.6rem;
      }
      .net-row { display: flex; gap: 1rem 1.25rem; align-items: center; flex-wrap: wrap; }
      .net-row label { display: flex; gap: 0.5rem; align-items: center; font-size: 0.9em; }
      .net-row input[type=range] { width: 130px; }
      .val { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 3ch; text-align: right; }

      /* Segmented toggle groups */
      .seg { display: inline-flex; align-items: center; gap: 0.4rem; }
      .seg > .seg-label { font-size: 0.8em; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .seg-btns { display: inline-flex; border: 1px solid #cdbfa6; border-radius: 999px; overflow: hidden; }
      .seg-btns button {
        border: 0; background: #f3eddf; color: #5a4a33; cursor: pointer;
        padding: 0.25rem 0.7rem; font-size: 0.85em; line-height: 1.4;
      }
      .seg-btns button + button { border-left: 1px solid #cdbfa6; }
      .seg-btns button[aria-pressed="true"] { background: #6a3a17; color: #fbf7ee; font-weight: 600; }
      .seg-btns button:focus-visible { outline: 2px solid #1b6f8c; outline-offset: -2px; }

      .net-search { padding: 0.25rem 0.5rem; border: 1px solid #cdbfa6; border-radius: 6px; min-width: 12rem; }
      .net-controls button.plain {
        border: 1px solid #cdbfa6; background: #f3eddf; color: #5a4a33;
        border-radius: 6px; padding: 0.25rem 0.7rem; cursor: pointer; font-size: 0.85em;
      }

      #graph-status[role="status"] {
        color: var(--muted); font-size: 0.9em;
        /* Own full-width line with a reserved height, so updating the text
           (hover/select descriptions) never reflows the page. Truncate rather
           than wrap to keep it a single, fixed-height line. */
        flex: 1 0 100%;
        min-height: 1.4em; line-height: 1.4em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .stage { position: relative; }
      #graph { width: 100%; height: calc(100vh - 300px); min-height: 440px; background: #faf8f1; }
      #graph[hidden] { display: none; }

      .spinner {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        color: var(--muted); font-size: 0.95em; pointer-events: none;
      }

      /* Floating info card for the "Highlight" click mode */
      #node-card {
        position: absolute; top: 12px; right: 12px; width: 260px; z-index: 5;
        background: #fffdf7; border: 1px solid #cdbfa6; border-radius: 10px;
        padding: 0.75rem 0.9rem; box-shadow: 0 6px 24px rgba(60,40,10,0.18);
        font-size: 0.9em;
      }
      #node-card[hidden] { display: none; }
      #node-card h2 { margin: 0 0 0.25rem; font-size: 1.05em; }
      #node-card .card-meta { color: var(--muted); margin: 0 0 0.5rem; }
      #node-card .card-actions { display: flex; gap: 0.75rem; align-items: center; }
      #node-card .card-close { margin-left: auto; }

      /* Legend */
      .legend {
        position: absolute; left: 12px; bottom: 12px; z-index: 4;
        background: rgba(255,253,247,0.92); border: 1px solid #e0d6c2; border-radius: 8px;
        padding: 0.5rem 0.7rem; font-size: 0.8em; color: var(--muted); max-width: 230px;
      }
      .legend[hidden] { display: none; }
      .legend b { color: #5a4a33; }
      .legend .swatches { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
      .legend .swatches i { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }

      /* Accessible list view */
      #list-wrap { max-width: 960px; margin: 0 auto; padding: 0 1rem 2rem; }
      #list-wrap[hidden] { display: none; }
      table.net-table { width: 100%; border-collapse: collapse; font-size: 0.92em; }
      table.net-table caption { text-align: left; color: var(--muted); padding: 0.5rem 0; }
      table.net-table th, table.net-table td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #ece4d3; }
      table.net-table th[scope="col"] { border-bottom: 2px solid #cdbfa6; }
      table.net-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
      table.net-table .chip { display: inline-flex; align-items: center; gap: 0.4rem; }
      table.net-table .chip i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    </style>

    <div class="net-header">
      <h1>Connections network</h1>
      <p class="muted">Each organization is a node, sized by how many people are associated with it. Lines connect organizations that share people; thicker lines mean more shared people. Try the display options below &mdash; the address bar updates so you can share a specific view.</p>
    </div>

    <form class="net-controls" id="net-controls" aria-label="Network controls">
      <div class="net-row">
        <label>Top orgs <input type="range" id="n" min="50" max="800" step="50" value="300" aria-describedby="n-val"> <span class="val" id="n-val">300</span></label>
        <label>Min shared people <input type="range" id="min" min="1" max="10" step="1" value="2" aria-describedby="min-val"> <span class="val" id="min-val">2</span></label>
        <button type="button" id="reload" class="plain">Reload data</button>
      </div>

      <div class="net-row" id="display-options">
        <span class="seg" role="group" aria-label="View">
          <span class="seg-label">View</span>
          <span class="seg-btns">
            <button type="button" data-group="view" data-value="graph">Graph</button>
            <button type="button" data-group="view" data-value="list">List</button>
          </span>
        </span>
        <span class="seg" role="group" aria-label="Color">
          <span class="seg-label">Color</span>
          <span class="seg-btns">
            <button type="button" data-group="color" data-value="community">Community</button>
            <button type="button" data-group="color" data-value="rainbow">Rainbow</button>
          </span>
        </span>
        <span class="seg" role="group" aria-label="Click action">
          <span class="seg-label">Click</span>
          <span class="seg-btns">
            <button type="button" data-group="click" data-value="highlight">Highlight</button>
            <button type="button" data-group="click" data-value="open">Open page</button>
          </span>
        </span>
      </div>

      <div class="net-row">
        <label>Find org
          <input type="search" id="search" class="net-search" placeholder="Type an organization name" autocomplete="off" list="org-list">
        </label>
        <datalist id="org-list"></datalist>
        <button type="button" id="reset-view" class="plain">Reset view</button>
        <span id="graph-status" role="status" aria-live="polite">Loading&hellip;</span>
      </div>
    </form>

    <div class="stage">
      <div id="graph"></div>
      <div class="spinner" id="spinner">Building network&hellip;</div>

      <aside id="node-card" hidden aria-live="polite">
        <h2 id="card-name"></h2>
        <p class="card-meta" id="card-meta"></p>
        <div class="card-actions">
          <a id="card-link" href="#">View organization &rarr;</a>
          <button type="button" id="card-close" class="plain card-close">Clear</button>
        </div>
      </aside>

      <div class="legend" id="legend">
        <div><b>Size</b> = connections (links to other orgs)</div>
        <div id="legend-color"><b>Color</b> = community</div>
        <div class="swatches" id="legend-swatches"></div>
      </div>
    </div>

    <div id="list-wrap" hidden>
      <table class="net-table" id="net-table">
        <caption id="list-caption">Organizations</caption>
        <thead>
          <tr>
            <th scope="col">Organization</th>
            <th scope="col">People</th>
            <th scope="col">Connections</th>
            <th scope="col">Community</th>
          </tr>
        </thead>
        <tbody id="net-tbody"></tbody>
      </table>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/graphology@0.25.4/dist/graphology.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/graphology-library@0.8.0/dist/graphology-library.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sigma@2.4.0/build/sigma.min.js"></script>
    <script>
    (function () {
      "use strict";
      // UMD globals from the scripts above. Loading these as classic scripts
      // (rather than ES modules via esm.sh) avoids a class-inheritance interop
      // bug where sigma's transpiled constructor invoked an ES-module base
      // class without the new operator.
      var Graph = graphology.Graph;
      var forceAtlas2 = graphologyLibrary.layoutForceAtlas2;
      // communitiesLouvain may be the function itself or a namespace object
      // (with .default/.detailed) depending on how the UMD bundle re-exports
      // it. Resolve a callable that returns a { node: community } mapping.
      var louvain = (function (ns) {
        if (typeof ns === "function") return ns;
        if (ns && typeof ns.default === "function") return ns.default;
        if (ns && typeof ns.detailed === "function") {
          return function (g) { return ns.detailed(g).communities; };
        }
        return null;
      })(graphologyLibrary.communitiesLouvain);

      var container = document.getElementById("graph");
      var spinner = document.getElementById("spinner");
      var status = document.getElementById("graph-status");
      var nSlider = document.getElementById("n");
      var minSlider = document.getElementById("min");
      var nVal = document.getElementById("n-val");
      var minVal = document.getElementById("min-val");
      var searchInput = document.getElementById("search");
      var orgList = document.getElementById("org-list");
      var listWrap = document.getElementById("list-wrap");
      var tbody = document.getElementById("net-tbody");
      var listCaption = document.getElementById("list-caption");
      var legend = document.getElementById("legend");
      var legendColor = document.getElementById("legend-color");
      var legendSwatches = document.getElementById("legend-swatches");
      var card = document.getElementById("node-card");

      // Warm, sepia-friendly qualitative palette for community colors.
      var PALETTE = [
        "#b5651d", "#1b6f8c", "#9c3848", "#3f7d4f", "#7a5ba6", "#c28b1a",
        "#2c7873", "#a14a3a", "#566b2f", "#8a4f9e", "#3d5a99", "#94693a"
      ];
      var DIM = "#d9d2c2";
      var GRAPH_BG = "#faf8f1";  // matches #graph background; neighbors fade toward it
      var EDGE = "rgba(106, 58, 23, 0.35)";
      var EDGE_DIM = "rgba(106, 58, 23, 0.06)";
      var EDGE_HI = "#1b6f8c";   // hovered edge: solid teal, stands out from the sepia

      var state = readState();
      // Apply persisted slider values from the hash before first load.
      nSlider.value = state.n;
      minSlider.value = state.min;
      nVal.textContent = state.n;
      minVal.textContent = state.min;

      var renderer = null;
      var graph = null;
      var data = null;
      var communityOf = {};   // node id -> community index
      var rngColorOf = {};    // node id -> rainbow color
      var selected = null;    // currently highlighted node id
      var neighborSet = new Set();
      var hoveredEdge = null;  // edge key currently under the cursor
      var selectedEdge = null; // edge key pinned by a click (focus mode)
      function esc(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      }

      // Stable hashed hue per node (the original "rainbow" coloring).
      function rainbowFor(id) {
        var h = (id * 2654435761) >>> 0;
        return "hsl(" + (h % 360) + ", 55%, 45%)";
      }
      function communityFor(id) {
        return PALETTE[(communityOf[id] || 0) % PALETTE.length];
      }
      function baseColor(id) {
        return state.color === "community" ? communityFor(id) : rngColorOf[id];
      }

      // Blend any CSS color (hex / hsl / rgb) into [r,g,b] using a 1px canvas to
      // normalize it, so we can fade neighbor colors part-way toward the
      // background. Results are memoized — only ~30 distinct colors ever appear.
      var _faderCtx = (function () {
        var c = document.createElement("canvas");
        c.width = c.height = 1;
        return c.getContext("2d");
      })();
      function toRgb(color) {
        _faderCtx.fillStyle = "#000";
        _faderCtx.fillStyle = color;
        var s = _faderCtx.fillStyle;
        if (s.charAt(0) === "#") {
          return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
        }
        var inner = s.slice(s.indexOf("(") + 1, s.indexOf(")")).split(",");
        return [parseInt(inner[0], 10), parseInt(inner[1], 10), parseInt(inner[2], 10)];
      }
      var _fadeCache = {};
      var BG_RGB = toRgb(GRAPH_BG);
      // Fade a color halfway toward the page background — present but recessed.
      function fadedColor(color) {
        var hit = _fadeCache[color];
        if (hit) return hit;
        var a = toRgb(color), t = 0.5;
        var out = "rgb(" +
          Math.round(a[0] + (BG_RGB[0] - a[0]) * t) + "," +
          Math.round(a[1] + (BG_RGB[1] - a[1]) * t) + "," +
          Math.round(a[2] + (BG_RGB[2] - a[2]) * t) + ")";
        _fadeCache[color] = out;
        return out;
      }

      // ---- URL hash state (shareable views) ----
      function readState() {
        var p = new URLSearchParams(location.hash.slice(1));
        return {
          n: p.get("n") || "300",
          min: p.get("min") || "2",
          view: p.get("view") || "graph",
          color: p.get("color") || "community",
          click: p.get("click") || "highlight"
        };
      }
      function writeState() {
        var p = new URLSearchParams();
        p.set("n", nSlider.value);
        p.set("min", minSlider.value);
        p.set("view", state.view);
        p.set("color", state.color);
        p.set("click", state.click);
        history.replaceState(null, "", "#" + p.toString());
      }

      // ---- Segmented toggle wiring ----
      var groupButtons = document.querySelectorAll("button[data-group]");
      function syncToggleUI() {
        groupButtons.forEach(function (btn) {
          var on = state[btn.dataset.group] === btn.dataset.value;
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
      groupButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var group = btn.dataset.group, value = btn.dataset.value;
          if (state[group] === value) return;
          state[group] = value;
          syncToggleUI();
          writeState();
          applyOption(group);
        });
      });

      function applyOption(group) {
        if (group === "view") applyView();
        else if (group === "color") { recolor(); updateLegend(); }
        // "click" needs no immediate work — the handlers read state at click time.
      }

      function applyView() {
        var isList = state.view === "list";
        listWrap.hidden = !isList;
        container.hidden = isList;
        legend.hidden = isList;
        if (isList) {
          clearSelection();
        } else if (renderer) {
          renderer.refresh();
        }
        setStatus();
      }

      function setStatus() {
        if (!data) return;
        status.textContent = data.nodes.length.toLocaleString() + " orgs, " +
          data.edges.length.toLocaleString() + " connections. " +
          (state.view === "list"
            ? "Use Tab to move through the table."
            : (state.click === "highlight"
                ? "Click a node to highlight its connections, or a link to focus it."
                : "Click a node to open its page, or a link to focus it."));
      }

      function updateLegend() {
        legendColor.innerHTML = state.color === "community"
          ? "<b>Color</b> = community (auto-detected clusters)"
          : "<b>Color</b> = arbitrary (one hue per org)";
        legendSwatches.innerHTML = "";
        if (state.color === "community") {
          var seen = {}, html = "";
          // Show up to the first dozen distinct community swatches.
          Object.keys(communityOf).forEach(function (id) {
            var c = communityOf[id] % PALETTE.length;
            if (!seen[c]) { seen[c] = 1; }
          });
          Object.keys(seen).slice(0, PALETTE.length).forEach(function (c) {
            html += '<i style="background:' + PALETTE[c] + '"></i>';
          });
          legendSwatches.innerHTML = html;
        }
      }

      // ---- Coloring ----
      function recolor() {
        if (!graph) return;
        graph.forEachNode(function (node) {
          graph.setNodeAttribute(node, "color", baseColor(Number(node)));
        });
        if (selected) applyHighlight();  // keep dimming consistent
        if (renderer) renderer.refresh();
        buildList();
      }

      // ---- Highlight (ego-network) ----
      function applyHighlight() {
        // Recomputes neighborSet membership styling via sigma reducers.
        if (renderer) renderer.refresh();
      }
      function selectNode(node) {
        selectedEdge = null;
        selected = node;
        neighborSet = new Set(graph.neighbors(node));
        neighborSet.add(node);
        showCard(node);
        if (renderer) renderer.refresh();
      }
      // Pin a link: focus its two endpoints, dim everything else.
      function selectEdge(edge) {
        selected = null;
        neighborSet = new Set();
        card.hidden = true;
        selectedEdge = edge;
        showEdgeStatus(edge);
        if (renderer) renderer.refresh();
      }
      function showEdgeStatus(edge) {
        var ext = graph.extremities(edge);
        var a = graph.getNodeAttribute(ext[0], "label") || "(unnamed)";
        var b = graph.getNodeAttribute(ext[1], "label") || "(unnamed)";
        var w = graph.getEdgeAttribute(edge, "weight");
        status.textContent = a + " ↔ " + b + " — " + w.toLocaleString() + " shared people";
      }
      function clearSelection() {
        selected = null;
        neighborSet = new Set();
        selectedEdge = null;
        card.hidden = true;
        if (renderer) renderer.refresh();
        setStatus();
      }
      function showCard(node) {
        var label = graph.getNodeAttribute(node, "label");
        var people = graph.getNodeAttribute(node, "people");
        var slug = graph.getNodeAttribute(node, "slug");
        var deg = graph.degree(node);
        document.getElementById("card-name").textContent = label || "(unnamed)";
        document.getElementById("card-meta").textContent =
          people.toLocaleString() + " people · " + deg.toLocaleString() + " connections";
        var link = document.getElementById("card-link");
        if (slug) { link.href = "/organizations/" + encodeURIComponent(slug); link.style.display = ""; }
        else { link.style.display = "none"; }
        card.hidden = false;
      }
      document.getElementById("card-close").addEventListener("click", clearSelection);

      // ---- Layout ----
      function runLayout() {
        if (!graph) return;
        var iters = Math.min(600, 100 + graph.order * 2);
        var settings = forceAtlas2.inferSettings(graph);
        // Make edge weight (people shared between two orgs) drive attraction,
        // so strongly-connected orgs settle closer together. Default is 0,
        // which ignores weight entirely.
        settings.edgeWeightInfluence = 1;
        // Keep outbound-attraction distribution OFF: with it off, a node's
        // pull grows with its degree, so the big hub orgs act as gravity wells
        // that smaller orgs cluster around (rather than everyone spreading out
        // evenly). For even tighter clusters, set settings.linLogMode = true —
        // it rescales the layout though, so the camera may need a reset.
        settings.outboundAttractionDistribution = false;
        // Respect node radius during repulsion so small orgs settle into rings
        // *around* the big hub they're most tied to, instead of overlapping it.
        settings.adjustSizes = true;
        // Assign the whole run in one pass: ForceAtlas2's adaptive cooling only
        // works within a single assign() call (it doesn't persist speed state
        // between calls), so batching across frames produced a worse, more
        // spread-out layout than this.
        forceAtlas2.assign(graph, { iterations: iters, settings: settings });
        if (renderer) renderer.refresh();
      }

      // ---- Accessible list view ----
      function buildList() {
        if (!graph || !data) return;
        var rows = data.nodes.map(function (row) {
          var id = row[0];
          return {
            id: id, slug: row[1], label: row[2], people: row[3],
            deg: graph.hasNode(String(id)) ? graph.degree(String(id)) : 0,
            comm: communityOf[id] || 0
          };
        });
        rows.sort(function (a, b) { return b.people - a.people; });
        var html = "";
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var name = r.slug
            ? '<a href="/organizations/' + esc(encodeURIComponent(r.slug)) + '">' + esc(r.label || "(unnamed)") + "</a>"
            : esc(r.label || "(unnamed)");
          var chip = '<span class="chip"><i style="background:' + PALETTE[r.comm % PALETTE.length] + '"></i>#' + (r.comm + 1) + "</span>";
          html += "<tr><td>" + name + '</td><td class="num">' + r.people.toLocaleString() +
            '</td><td class="num">' + r.deg.toLocaleString() + "</td><td>" + chip + "</td></tr>";
        }
        tbody.innerHTML = html;
        listCaption.textContent = rows.length.toLocaleString() +
          " organizations, ranked by number of associated people.";
      }

      function buildDatalist() {
        var html = "";
        for (var i = 0; i < data.nodes.length; i++) {
          html += '<option value="' + esc(data.nodes[i][2]) + '"></option>';
        }
        orgList.innerHTML = html;
      }

      // ---- Search ----
      function focusByName(name) {
        if (!graph || !name) return;
        var want = name.trim().toLowerCase();
        if (!want) return;
        var match = null;
        graph.forEachNode(function (node, attr) {
          if (match) return;
          if ((attr.label || "").toLowerCase() === want) match = node;
        });
        if (!match) {
          graph.forEachNode(function (node, attr) {
            if (match) return;
            if ((attr.label || "").toLowerCase().indexOf(want) !== -1) match = node;
          });
        }
        if (!match) { status.textContent = 'No organization matching "' + name + '".'; return; }
        if (state.view === "list") { state.view = "graph"; syncToggleUI(); writeState(); applyView(); }
        selectNode(match);
        var pos = renderer.getNodeDisplayData(match);
        if (pos) {
          renderer.getCamera().animate(
            { x: pos.x, y: pos.y, ratio: 0.4 }, { duration: 500 });
        }
      }

      // ---- Main load ----
      async function load() {
        clearSelection();
        spinner.style.display = "";
        status.textContent = "Loading…";
        try {
          var res = await fetch("/connections.json?n=" + nSlider.value + "&min=" + minSlider.value);
          if (!res.ok) throw new Error("HTTP " + res.status);
          data = await res.json();
        } catch (err) {
          spinner.style.display = "none";
          status.textContent = "Failed to load: " + err.message;
          return;
        }
        if (!data.nodes.length) {
          spinner.style.display = "none";
          status.textContent = "No data for these settings.";
          return;
        }

        graph = new Graph({ multi: false, type: "undirected" });
        var i;
        for (i = 0; i < data.nodes.length; i++) {
          var node = data.nodes[i];
          var id = node[0];
          rngColorOf[id] = rainbowFor(id);
          graph.addNode(String(id), {
            label: node[2],
            slug: node[1],
            people: node[3],
            // size is assigned below, once edge degree is known.
            // Seed positions on a circle so FA2 has something to push apart.
            x: Math.cos(id) * 100,
            y: Math.sin(id) * 100
          });
        }

        var maxW = 1;
        for (i = 0; i < data.edges.length; i++) maxW = Math.max(maxW, data.edges[i][2]);
        for (i = 0; i < data.edges.length; i++) {
          var e = data.edges[i];
          var s = String(e[0]), d = String(e[1]);
          if (!graph.hasNode(s) || !graph.hasNode(d)) continue;
          // size: thickness scales with shared people; sqrt so a few huge
          // links don't flatten everything else into hairlines.
          // weight: consumed by the layout (see edgeWeightInfluence) so that
          // orgs sharing more people pull together harder.
          graph.addEdge(s, d, { size: 0.4 + 3.6 * Math.sqrt(e[2] / maxW), weight: e[2] });
        }

        // Node size scales with degree (how many other orgs it links to), so
        // the most-connected hubs render largest. Degree isn't known until the
        // edges above are wired up, hence this second pass.
        var maxDeg = 1;
        graph.forEachNode(function (n) { maxDeg = Math.max(maxDeg, graph.degree(n)); });
        graph.forEachNode(function (n) {
          graph.setNodeAttribute(n, "size", 3 + 17 * Math.sqrt(graph.degree(n) / maxDeg));
        });

        // Community detection (Louvain) -> stash index per node id.
        communityOf = {};
        if (louvain) {
          try {
            var communities = louvain(graph);
            Object.keys(communities).forEach(function (k) { communityOf[k] = communities[k]; });
          } catch (err) { /* leave everyone in community 0 */ }
        }

        // Initial colors per current mode.
        graph.forEachNode(function (n) { graph.setNodeAttribute(n, "color", baseColor(Number(n))); });

        if (renderer) { renderer.kill(); renderer = null; }
        renderer = new Sigma(graph, container, {
          renderLabels: true,
          labelDensity: 0.5,
          labelGridCellSize: 80,
          labelRenderedSizeThreshold: 8,
          defaultEdgeColor: EDGE,
          // Edge hit-testing is comparatively expensive, so debounce hover.
          enableEdgeHoverEvents: "debounce",
          enableEdgeClickEvents: true,
          nodeReducer: function (node, d) {
            var copy = Object.assign({}, d);
            // A pinned (clicked) edge focuses just its two endpoints.
            if (selectedEdge) {
              var sx = graph.extremities(selectedEdge);
              if (node === sx[0] || node === sx[1]) { copy.zIndex = 2; return copy; }
              copy.color = DIM; copy.label = ""; copy.zIndex = 0;
              return copy;
            }
            // Merely hovering an edge keeps its two endpoints prominent
            // without dimming the rest.
            if (hoveredEdge) {
              var hx = graph.extremities(hoveredEdge);
              if (node === hx[0] || node === hx[1]) { copy.zIndex = 2; return copy; }
            }
            if (!selected) return copy;
            // The clicked node stays fully bright and on top.
            if (node === selected) { copy.zIndex = 2; return copy; }
            // Its neighbors are highlighted a bit less — faded toward the
            // background but still clearly readable.
            if (neighborSet.has(node)) {
              copy.color = fadedColor(copy.color);
              copy.zIndex = 1;
              return copy;
            }
            // Everything unconnected is darkened out of the way.
            copy.color = DIM;
            copy.label = "";
            copy.zIndex = 0;
            return copy;
          },
          edgeReducer: function (edge, d) {
            var copy = Object.assign({}, d);
            // Pinned or hovered edge wins: thicken it and paint it the
            // highlight color.
            if (edge === selectedEdge || edge === hoveredEdge) {
              copy.color = EDGE_HI;
              copy.size = (d.size || 1) + 2;
              copy.zIndex = 2;
              return copy;
            }
            // In edge-focus mode, push every other link to the background.
            if (selectedEdge) { copy.color = EDGE_DIM; return copy; }
            if (!selected) return copy;
            var ext = graph.extremities(edge);
            if (ext[0] === selected || ext[1] === selected) { copy.color = EDGE; copy.zIndex = 1; }
            else { copy.color = EDGE_DIM; }
            return copy;
          }
        });

        renderer.on("clickNode", function (e) {
          if (state.click === "open") {
            var slug = graph.getNodeAttribute(e.node, "slug");
            if (slug) window.location.href = "/organizations/" + encodeURIComponent(slug);
          } else {
            selectNode(e.node);
          }
        });
        renderer.on("clickStage", clearSelection);
        renderer.on("enterNode", function (e) {
          container.style.cursor = "pointer";
          if (!selected) {
            var label = graph.getNodeAttribute(e.node, "label");
            var people = graph.getNodeAttribute(e.node, "people");
            status.textContent = (label || "(unnamed)") + " — " + people.toLocaleString() + " people";
          }
        });
        renderer.on("leaveNode", function () {
          container.style.cursor = "default";
          if (!selected) setStatus();
        });
        renderer.on("clickEdge", function (e) { selectEdge(e.edge); });
        renderer.on("enterEdge", function (e) {
          hoveredEdge = e.edge;
          container.style.cursor = "pointer";
          showEdgeStatus(e.edge);
          renderer.refresh();
        });
        renderer.on("leaveEdge", function () {
          hoveredEdge = null;
          container.style.cursor = "default";
          // Restore whatever the persistent state wants to show.
          if (selectedEdge) showEdgeStatus(selectedEdge);
          else if (!selected) setStatus();
          renderer.refresh();
        });

        spinner.style.display = "none";
        buildList();
        buildDatalist();
        updateLegend();
        applyView();
        if (state.view === "graph") runLayout();
        setStatus();
      }

      // ---- Wire up controls ----
      nSlider.addEventListener("input", function () { nVal.textContent = nSlider.value; });
      minSlider.addEventListener("input", function () { minVal.textContent = minSlider.value; });
      nSlider.addEventListener("change", writeState);
      minSlider.addEventListener("change", writeState);
      document.getElementById("reload").addEventListener("click", function () { writeState(); load(); });
      document.getElementById("reset-view").addEventListener("click", function () {
        if (renderer) renderer.getCamera().animatedReset({ duration: 400 });
      });
      searchInput.addEventListener("change", function () { focusByName(searchInput.value); });
      searchInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); focusByName(searchInput.value); }
      });

      syncToggleUI();
      writeState();
      load();
    })();
    </script>
  `;
  return page({ title: "Connections network", body });
}
