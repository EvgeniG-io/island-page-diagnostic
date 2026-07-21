/**
 * Validates probe classification expectations (run in Node for network truth,
 * plus documents expected browser CORS behavior).
 *
 * Usage: node scripts/browser-probe-validate.mjs
 */
const cases = [
  {
    url: "https://example.com",
    expectNode: { reachable: true, status: 200 },
    expectBrowserNote: "Often CORS-readable or cors-limited; never network-error",
  },
  {
    url: "https://www.google.com",
    expectNode: { reachable: true, status: 200 },
    expectBrowserNote: "Usually cors-limited (no ACAO); still reachable",
  },
  {
    url: "https://httpbin.org/status/200",
    expectNode: { reachable: true, status: 200 },
    expectBrowserNote: "CORS-friendly; expect ok + HTTP 200",
  },
  {
    url: "https://httpbin.org/status/403",
    expectNode: { reachable: true, status: 403 },
    expectBrowserNote: "Reachable with HTTP 403 — not network-error",
  },
  {
    url: "https://www.cloudflare.com",
    expectNode: { reachable: true, status: 200 },
    expectBrowserNote: "May be cors-limited; still reachable",
  },
  {
    url: "https://github.com",
    expectNode: { reachable: true, status: 200 },
    expectBrowserNote: "May be cors-limited; still reachable",
  },
  {
    url: "https://evgenig-io.github.io/island-page-diagnostic/",
    expectNode: { reachable: true, status: 200 },
    expectBrowserNote: "Same-site Pages; expect ok when testing from Pages",
  },
  {
    url: "https://this-host-should-not-resolve.invalid/",
    expectNode: { reachable: false, status: null },
    expectBrowserNote: "Expect network-error / unreachable",
  },
];

function classifyNode(res, err) {
  if (err) return { kind: "network-error", status: null, reachable: false };
  if (res.status >= 200 && res.status < 400)
    return { kind: "ok", status: res.status, reachable: true };
  return { kind: "http-error", status: res.status, reachable: true };
}

console.log("Internal validity check (Node fetch = network truth)\n");
let failed = 0;
for (const c of cases) {
  const t0 = performance.now();
  let got;
  try {
    const res = await fetch(c.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    await res.arrayBuffer().catch(() => {});
    got = classifyNode(res, null);
    got.elapsedMs = Math.round(performance.now() - t0);
  } catch (e) {
    got = classifyNode(null, e);
    got.elapsedMs = Math.round(performance.now() - t0);
    got.error = e instanceof Error ? e.message : String(e);
  }

  const okReach = got.reachable === c.expectNode.reachable;
  const okStatus =
    c.expectNode.status == null
      ? got.status == null
      : got.status === c.expectNode.status;
  const pass = okReach && okStatus;
  if (!pass) failed++;
  console.log(
    `${pass ? "PASS" : "FAIL"} ${c.url}\n` +
      `  got: kind=${got.kind} status=${got.status} reachable=${got.reachable} ${got.elapsedMs}ms\n` +
      `  expect node: reachable=${c.expectNode.reachable} status=${c.expectNode.status}\n` +
      `  browser note: ${c.expectBrowserNote}\n`,
  );
}

if (failed) {
  console.error(`FAILED ${failed}/${cases.length}`);
  process.exit(1);
}
console.log(`OK ${cases.length}/${cases.length} node network checks`);
