// Tiny server-render helpers. No framework on purpose — keep it CDN-cacheable
// and trivial to read.

export function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Tagged template that escapes interpolations by default.
// Use `raw(html)` to opt out (e.g. embedding pre-built HTML fragments).
export function html(strings, ...values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === "object" && v.__raw) out += v.value;
      else if (Array.isArray(v)) out += v.join("");
      else out += esc(v);
    }
  }
  return out;
}

export function raw(value) {
  return { __raw: true, value: value ?? "" };
}

function renderDocument({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Historical Engineers</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="/">Historical Engineers</a>
  <nav>
    <a href="/people">People</a>
    <a href="/places">Places</a>
    <a href="/organizations">Organizations</a>
  </nav>
</header>
<main>
${body}
</main>
<footer><small>Prototype · Sample data drawn from OCR'd historical sources</small></footer>
</body>
</html>`;
}

// Standard page response. CDN-friendly cache headers.
export function page(opts) {
  return new Response(renderDocument(opts), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
}

export function notFound(title = "Not found") {
  const body = `<h1>${esc(title)}</h1><p><a href="/">Home</a></p>`;
  return new Response(renderDocument({ title, body }), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
