// Worker entry. Single fetch handler that routes GET requests to the
// per-route modules and falls through to the static-assets binding for
// everything else (CSS, CSVs, etc.).
//
// Each route module exports `onRequestGet({ request, env, ctx, params })`
// — same signature we used under Pages Functions, so the handlers needed
// no changes during the migration.

import * as home from "./routes/home.js";
import * as people from "./routes/people.js";
import * as person from "./routes/person.js";
import * as places from "./routes/places.js";
import * as place from "./routes/place.js";
import * as organizations from "./routes/organizations.js";
import * as organization from "./routes/organization.js";
import * as map from "./routes/map.js";
import * as placesJson from "./routes/places_json.js";
import * as connections from "./routes/connections.js";
import * as connectionsJson from "./routes/connections_json.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const p = url.pathname;

      if (p === "/")               return home.onRequestGet({ request, env, ctx });
      if (p === "/people")         return people.onRequestGet({ request, env, ctx });
      if (p === "/places")         return places.onRequestGet({ request, env, ctx });
      if (p === "/organizations")  return organizations.onRequestGet({ request, env, ctx });
      if (p === "/map")            return map.onRequestGet({ request, env, ctx });
      if (p === "/places.json")    return placesJson.onRequestGet({ request, env, ctx });
      if (p === "/connections")    return connections.onRequestGet({ request, env, ctx });
      if (p === "/connections.json") return connectionsJson.onRequestGet({ request, env, ctx });

      let m;
      if ((m = p.match(/^\/people\/([^\/]+)\/?$/)))
        return person.onRequestGet({ request, env, ctx, params: { slug: decodeURIComponent(m[1]) } });
      if ((m = p.match(/^\/places\/([^\/]+)\/?$/)))
        return place.onRequestGet({ request, env, ctx, params: { slug: decodeURIComponent(m[1]) } });
      if ((m = p.match(/^\/organizations\/([^\/]+)\/?$/)))
        return organization.onRequestGet({ request, env, ctx, params: { slug: decodeURIComponent(m[1]) } });
    }

    // Anything we didn't handle (style.css, /csv/*.csv, /favicon.ico, etc.)
    // is served from public/ via the ASSETS binding.
    return env.ASSETS.fetch(request);
  },
};
