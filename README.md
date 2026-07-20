# Island Page Diagnostic (MVP UI)

Per-URL diagnostic report UI.

**Run diagnose** collects **live** browser + network probe facts (HTTP status when readable, timing, online/UA/timezone). Island filter / SWG / policy fields stay **N/A** until a privileged collector is wired. Path cards at the bottom are optional **demo templates** only.

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
