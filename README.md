# Island Page Diagnostic (MVP UI)

Per-URL diagnostic report UI.

**Layer 1 (primary):** collect page-context data with no Island code — storage, non-HttpOnly cookies, DOM heuristics, scripts, Performance resources, service workers, Cache Storage. Use **Collect this page**, the **bookmarklet** on the problem page, or paste JSON.

**Remote probe (optional):** HTTP reachability from this browser. Path cards remain **demo templates** only.

**Layer 2 (not built yet):** backend enrichment (Coralogix / policy / connector) from tenant/user signals in the snapshot.

## Live (GitHub Pages)

https://evgenig-io.github.io/island-page-diagnostic/

## Local

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Probe smoke (real network, Node)

```bash
node scripts/probe-smoke.mjs
node scripts/probe-smoke.mjs https://example.com
```

## Island-only data

Matched rule, category/reputation, SWG verdict, tenant config, extension/LMC need a managed Island profile + privileged collector (not available to a normal website).

## Build

```bash
npm run build
```

CI sets `GITHUB_PAGES=true` for the `/island-page-diagnostic/` base path.
