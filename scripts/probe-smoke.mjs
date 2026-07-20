/**
 * Smoke-check: real HTTP probes from Node (same idea as the browser collector).
 * Usage: node scripts/probe-smoke.mjs [url...]
 */
const targets = process.argv.slice(2);
const urls =
  targets.length > 0
    ? targets
    : [
        "https://example.com",
        "https://httpbin.org/status/403",
        "http://127.0.0.1:5173/",
        "https://this-host-should-not-resolve.invalid/",
      ];

async function probe(url) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    const elapsedMs = Math.round(performance.now() - t0);
    const buf = await res.arrayBuffer();
    return {
      url,
      ok: true,
      status: res.status,
      redirected: res.redirected,
      finalUrl: res.url,
      contentType: res.headers.get("content-type"),
      bytes: buf.byteLength,
      elapsedMs,
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: null,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      elapsedMs: Math.round(performance.now() - t0),
    };
  }
}

console.log("Live probe smoke (Node fetch — real network)\n");
for (const url of urls) {
  const r = await probe(url);
  console.log(JSON.stringify(r, null, 2));
  console.log("---");
}
