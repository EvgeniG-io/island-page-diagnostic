# Island Page Diagnostic

Per-URL diagnostic UI. **Observed data only** — no demo templates, no invented Island policy fields.

## Live (GitHub Pages)

https://evgenig-io.github.io/island-page-diagnostic/

## Local

```bash
npm install
npm run dev
```

## What Run diagnose collects (real)

- HTTP reachability / status when CORS allows
- Probe timing
- Cache-related response headers when readable (`Cache-Control`, `Age`, `ETag`, CDN hints)
- Browser env (online, timezone, UA)
- Same-origin Cache Storage / service worker only if the tested URL is this app’s origin

## What is not shown

Island classification cache, matched rules, SWG, tenant config, extension state — those are not readable from this webpage, so they are omitted (not faked).

## Probe smoke (Node)

```bash
node scripts/probe-smoke.mjs https://example.com
```

## Build

```bash
npm run build
```

CI sets `GITHUB_PAGES=true` for the `/island-page-diagnostic/` base path.
