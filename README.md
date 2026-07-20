# Island Page Diagnostic (MVP UI)

Per-URL Island diagnostic report UI. Currently uses **mock path templates** so the layout and layers can be reviewed without a privileged collector.

## Live (GitHub Pages)

https://evgenig-io.github.io/island-page-diagnostic/

## Local

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Why mock today

A normal website cannot read Island extension state, filter verdicts, SWG path, policy match, or device config. Real diagnostics need a privileged source (managed Island profile + extension / `island://diagnose`-style collector) that posts facts into this UI.

## Build

```bash
npm run build
```

For GitHub Pages builds, CI sets `GITHUB_PAGES=true` so assets use the `/island-page-diagnostic/` base path.
