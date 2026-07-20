import { useEffect, useMemo, useState } from "react";
import {
  SCENARIOS,
  SCENARIO_GROUPS,
  applyTestedUrl,
  type DiagnosticReport,
  type HopKind,
  type LayerDetail,
  type LayerStatus,
  type PathStep,
} from "./mockReport";
import { collectLiveProbe } from "./liveProbe";
import { buildLiveReport } from "./liveReport";
import {
  collectPageSnapshot,
  decodeSnapshotFromHash,
  type PageSnapshot,
} from "./pageCollector";
import { buildBookmarkletHref } from "./bookmarkletSource";
import { Layer1Panel } from "./Layer1Panel";
import "./App.css";

type View = "overview" | LayerDetail["id"];
type DataMode = "live" | "demo";

function statusLabel(s: LayerStatus): string {
  if (s === "ok") return "OK";
  if (s === "warn") return "Warn";
  if (s === "fail") return "Issue";
  if (s === "info") return "Info";
  return "N/A";
}

function App() {
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [url, setUrl] = useState("https://example.com");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [dataMode, setDataMode] = useState<DataMode>("live");
  const [view, setView] = useState<View>("overview");
  const [copied, setCopied] = useState(false);
  const [showAllLayers, setShowAllLayers] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [layer1, setLayer1] = useState<PageSnapshot | null>(null);
  const [layer1Busy, setLayer1Busy] = useState(false);
  const [layer1Error, setLayer1Error] = useState<string | null>(null);
  const [pasteJson, setPasteJson] = useState("");
  const [bookmarkCopied, setBookmarkCopied] = useState(false);

  const bookmarkHref = useMemo(
    () => buildBookmarkletHref(window.location.origin + window.location.pathname),
    [],
  );

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw.startsWith("l1=")) return;
    const snap = decodeSnapshotFromHash(raw.slice(3));
    if (snap) {
      setLayer1(snap);
      setUrl(snap.page.href);
      setLayer1Error(null);
    } else {
      setLayer1Error("Could not decode Layer-1 payload from URL hash.");
    }
  }, []);

  async function collectThisPage() {
    setLayer1Busy(true);
    setLayer1Error(null);
    try {
      const snap = await collectPageSnapshot();
      setLayer1(snap);
      setUrl(snap.page.href);
    } catch (err) {
      setLayer1Error(err instanceof Error ? err.message : String(err));
    } finally {
      setLayer1Busy(false);
    }
  }

  function loadPastedSnapshot() {
    setLayer1Error(null);
    try {
      const data = JSON.parse(pasteJson) as PageSnapshot;
      if (data?.kind !== "layer1" || data.version !== 1) {
        setLayer1Error("JSON is not a Layer-1 snapshot (kind/version).");
        return;
      }
      setLayer1(data);
      setUrl(data.page.href);
    } catch (err) {
      setLayer1Error(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(bookmarkHref);
      setBookmarkCopied(true);
      window.setTimeout(() => setBookmarkCopied(false), 1600);
    } catch {
      setLayer1Error("Could not copy bookmarklet — drag the link instead.");
    }
  }

  const visibleLayers = useMemo(() => {
    if (!report) return [];
    if (!report.focusPrimary || showAllLayers || !report.primaryLayers) {
      return report.layers;
    }
    const primary = new Set(report.primaryLayers);
    return report.layers.filter((l) => primary.has(l.id));
  }, [report, showAllLayers]);

  const activeLayer = useMemo(() => {
    if (!report || view === "overview") return null;
    return report.layers.find((l) => l.id === view) ?? null;
  }, [report, view]);

  const pageGroups = useMemo(
    () => report?.factGroups.filter((g) => g.origin === "page") ?? [],
    [report],
  );
  const localGroups = useMemo(
    () => report?.factGroups.filter((g) => g.origin === "local") ?? [],
    [report],
  );

  function selectScenario(id: string) {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (!scenario) return;
    // Demo templates only — keep URL, mark as demo (not live)
    const keepUrl = url.trim() || report?.url || scenario.url;
    const bound = applyTestedUrl(scenario, keepUrl);
    setScenarioId(id);
    setDataMode("demo");
    setUrl(bound.url);
    setReport(bound);
    setProbeError(null);
    setView("overview");
    setCopied(false);
    setShowAllLayers(false);
  }

  async function runDiagnose() {
    const input = url.trim();
    if (!input) return;
    setRunning(true);
    setCopied(false);
    setProbeError(null);
    setScenarioId(null);
    setDataMode("live");
    try {
      const probe = await collectLiveProbe(input);
      const live = buildLiveReport(probe);
      setUrl(live.url);
      setReport(live);
      setView("overview");
      setShowAllLayers(false);
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function copyReport() {
    if (!report) return;
    const parts = [
      `Tested URL: ${report.url}`,
      `Host: ${report.site}`,
      `Tenant: ${report.tenant} (${report.tenantId})`,
      `Matched rule: ${report.matchedRule}`,
      `Outcome: ${report.outcome}`,
      "",
      "Hop path:",
      ...report.rulePath.map((s, i) => {
        const hop = s.hopMs != null ? ` → ${s.hopMs}ms` : "";
        return `${i + 1}. [${s.kind}] ${s.title}${s.subtitle ? ` · ${s.subtitle}` : ""}${hop}`;
      }),
      report.pathTotalMs != null ? `Total: ${report.pathTotalMs}ms` : "",
      "",
      ...report.statusLines.map((l) => `[${l.tag.padEnd(8)}] ${l.body}`),
      "",
      "Extracted data:",
      ...report.factGroups.flatMap((g) => [
        `[${g.origin}] ${g.label}`,
        ...g.facts.map((f) => `  ${f.label}: ${f.value}`),
      ]),
      "",
      "Layers:",
      ...report.layers.map(
        (l) =>
          `- ${l.label}: ${l.summary} | ${l.rows.map(([k, v]) => `${k}=${v}`).join("; ")}`,
      ),
    ];
    void navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand-block">
          <p className="brand">Island Page Diagnostic</p>
          <p className="tagline">
            Layer 1: page JS collect (no Island code) · show on this page
          </p>
        </div>
        <span className={`mode-pill ${layer1 ? "live" : dataMode}`}>
          {layer1 ? "layer-1" : dataMode === "live" ? "live probe" : "demo"}
        </span>
      </header>

      <section className="layer1-collect" aria-label="Layer 1 collection">
        <h2>Layer 1 · page collect</h2>
        <p className="layer1-lead">
          Collects storage, cookies (non-HttpOnly), DOM heuristics, scripts,
          performance resources, service workers, and Cache Storage —{" "}
          <strong>from the page you’re on</strong>. No extension APIs.
        </p>

        <div className="layer1-actions">
          <button
            type="button"
            className="primary"
            disabled={layer1Busy}
            onClick={() => void collectThisPage()}
          >
            {layer1Busy ? "Collecting…" : "Collect this page"}
          </button>
          <a className="bookmarklet" href={bookmarkHref}>
            ⧉ Collect problem page
          </a>
          <button type="button" className="ghost" onClick={() => void copyBookmarklet()}>
            {bookmarkCopied ? "Bookmarklet copied" : "Copy bookmarklet"}
          </button>
        </div>
        <p className="muted-inline">
          Drag <em>Collect problem page</em> to your bookmarks bar. On the broken
          site, click it — data shows in an overlay there, or use{" "}
          <em>Open in diagnostic</em> / paste JSON below.
        </p>

        <label className="field paste-field">
          <span>Paste Layer-1 JSON</span>
          <textarea
            value={pasteJson}
            onChange={(e) => setPasteJson(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder='{"version":1,"kind":"layer1",…}'
          />
        </label>
        <button
          type="button"
          className="ghost"
          disabled={!pasteJson.trim()}
          onClick={loadPastedSnapshot}
        >
          Load pasted snapshot
        </button>

        {layer1Error && (
          <p className="probe-error" role="alert">
            {layer1Error}
          </p>
        )}
      </section>

      {layer1 && (
        <section className="panel" aria-label="Layer 1 report">
          <div className="panel-head">
            <h2>Layer 1 report</h2>
            <span className="badge ok">page context</span>
          </div>
          <Layer1Panel snapshot={layer1} />
        </section>
      )}

      <details className="remote-probe">
        <summary>Optional · remote URL probe (from this browser)</summary>
        <section className="compose" aria-label="URL under test">
          <label className="field">
            <span>URL to probe</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… or localhost:5173"
              spellCheck={false}
            />
          </label>
          <button
            className="primary"
            type="button"
            onClick={() => void runDiagnose()}
            disabled={running || !url.trim()}
          >
            {running ? "Probing…" : "Run remote probe"}
          </button>
        </section>
        {probeError && (
          <p className="probe-error" role="alert">
            Probe failed: {probeError}
          </p>
        )}
      </details>

      {report && (
        <>
          <section className="summary">
            <div className="stat">
              <span className="stat-label">Host</span>
              <span className="stat-value">{report.site}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Data</span>
              <span className="stat-value">
                {dataMode === "live" ? "Live probe" : "Demo template"}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Matched rule</span>
              <span className="stat-value">{report.matchedRule}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Outcome</span>
              <span className="stat-value">{report.outcome}</span>
            </div>
          </section>

          <section className="actions-row">
            {report.focusPrimary && report.primaryLayers && (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showAllLayers}
                  onChange={(e) => setShowAllLayers(e.target.checked)}
                />
                Show all layers
              </label>
            )}
            <button type="button" className="ghost" onClick={copyReport}>
              {copied ? "Copied" : "Copy report"}
            </button>
          </section>

          <nav className="layers" aria-label="Layers">
            <button
              type="button"
              className={view === "overview" ? "layer active" : "layer"}
              onClick={() => setView("overview")}
            >
              Report
            </button>
            {visibleLayers.map((l) => (
              <button
                key={l.id}
                type="button"
                className={
                  view === l.id
                    ? `layer active tone-${l.status}`
                    : `layer tone-${l.status}`
                }
                onClick={() => setView(l.id)}
              >
                {l.label}
                <span className="layer-status">{statusLabel(l.status)}</span>
              </button>
            ))}
          </nav>

          {view === "overview" ? (
            <section className="panel">
              <div className="panel-head">
                <h2>Hop to hop</h2>
                <span className={`badge ${dataMode === "live" ? "ok" : "warn"}`}>
                  {dataMode === "live"
                    ? "live browser · network"
                    : "demo template — not live"}
                </span>
              </div>
              <HopPath
                path={report.rulePath}
                totalMs={report.pathTotalMs}
                matchedRule={report.matchedRule}
                testedUrl={report.url}
                testedHost={report.site}
              />

              <div className="panel-head">
                <h2>Status strip</h2>
              </div>
              <div className="status-strip">
                {report.statusLines.map((line, i) => (
                  <div
                    key={`${line.tag}-${i}`}
                    className={`status-line tone-${line.tone ?? "info"}`}
                  >
                    <span className="tag">[{line.tag}]</span>
                    <span className="body">{line.body}</span>
                  </div>
                ))}
              </div>

              <h3>Extracted data</h3>
              <div className="facts-board">
                <div className="facts-column">
                  <h4 className="facts-col-title">From the page</h4>
                  {pageGroups.map((g) => (
                    <article key={g.id} className="fact-card origin-page">
                      <header className="fact-card-head">
                        <h4>{g.label}</h4>
                        <span className="origin-pill">page</span>
                      </header>
                      <p className="fact-url-chip">
                        Path for · <code>{report.url}</code>
                      </p>
                      <dl className="fact-list">
                        {g.facts.map((f) => (
                          <div key={f.label} className="fact-row">
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
                <div className="facts-column">
                  <h4 className="facts-col-title">From this browser</h4>
                  {localGroups.map((g) => (
                    <article key={g.id} className="fact-card origin-local">
                      <header className="fact-card-head">
                        <h4>{g.label}</h4>
                        <span className="origin-pill">local</span>
                      </header>
                      <p className="fact-url-chip">
                        Path for · <code>{report.url}</code>
                      </p>
                      <dl className="fact-list">
                        {g.facts.map((f) => (
                          <div key={f.label} className="fact-row">
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              </div>

              <h3>Component layers · {report.site}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Layer</th>
                    <th>Status</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLayers.map((l) => (
                    <tr key={l.id} className={`tone-${l.status}`}>
                      <td>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => setView(l.id)}
                        >
                          {l.label}
                        </button>
                      </td>
                      <td>{statusLabel(l.status)}</td>
                      <td>{l.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <section className="path-library" aria-label="Demo path templates">
                <div className="path-library-head">
                  <h3>Demo path templates</h3>
                  <p>
                    Mock case-shaped paths only. Selecting one switches to demo
                    mode — use Run diagnose again for live probe data.
                  </p>
                </div>
                {SCENARIO_GROUPS.map((group) => {
                  const items = group.scenarioIds
                    .map((id) => SCENARIOS.find((s) => s.id === id))
                    .filter((s): s is DiagnosticReport => Boolean(s));
                  return (
                    <div key={group.id} className="path-group">
                      <div className="path-group-head">
                        <h3>{group.title}</h3>
                        <p>{group.hint}</p>
                      </div>
                      <div className="path-group-cards">
                        {items.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={
                              dataMode === "demo" && scenarioId === s.id
                                ? "scenario-card active"
                                : "scenario-card"
                            }
                            onClick={() => selectScenario(s.id)}
                          >
                            <span className="scenario-label">{s.label}</span>
                            <span className="scenario-desc">
                              {s.description}
                            </span>
                            {dataMode === "demo" && scenarioId === s.id ? (
                              <span className="scenario-bound">
                                Demo · {report.site}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            </section>
          ) : (
            activeLayer && (
              <section className="panel">
                <div className="panel-head">
                  <h2>{activeLayer.label}</h2>
                  <span className={`badge ${activeLayer.status}`}>
                    {statusLabel(activeLayer.status)}
                  </span>
                </div>
                <p className="layer-url-chip">
                  For URL · <code>{report.url}</code>
                </p>
                <p className="layer-summary">{activeLayer.summary}</p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLayer.rows.map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          )}
        </>
      )}
    </div>
  );
}

const HOP_GLYPH: Record<HopKind, string> = {
  browser: "B",
  extension: "E",
  page: "P",
  classify: "C",
  rule: "R",
  network: "N",
  policy: "A",
  storage: "S",
  files: "F",
  config: "G",
  vpn: "V",
  outcome: "O",
};

function HopPath({
  path,
  totalMs,
  matchedRule,
  testedUrl,
  testedHost,
}: {
  path: PathStep[];
  totalMs?: number;
  matchedRule: string;
  testedUrl: string;
  testedHost: string;
}) {
  const totalTone =
    path.some((p) => p.tone === "fail")
      ? "fail"
      : path.some((p) => p.tone === "warn")
        ? "warn"
        : "ok";

  return (
    <div className="hop-view">
      <div className="hop-meta">
        <span className="hop-meta-label">Tested URL</span>
        <span className="hop-meta-value">{testedUrl}</span>
        <span className="hop-meta-label">Host</span>
        <span className="hop-meta-value">{testedHost}</span>
        <span className="hop-meta-label">Matched rule</span>
        <span className="hop-meta-value">{matchedRule}</span>
      </div>

      <div className="hop-stage">
        {totalMs != null && (
          <div className={`hop-total tone-${totalTone}`} aria-label="Path total">
            <span className="hop-total-line" />
            <span className="hop-total-badge">{totalMs}ms</span>
          </div>
        )}

        <ol className="hop-track">
          {path.map((step, i) => (
            <li key={`${step.kind}-${i}`} className="hop-item">
              <div className={`hop-node tone-${step.tone} kind-${step.kind}`}>
                <span className="hop-glyph" aria-hidden>
                  {HOP_GLYPH[step.kind]}
                </span>
              </div>
              <div className="hop-caption">
                <strong>{step.title}</strong>
                {step.subtitle ? <span>{step.subtitle}</span> : null}
              </div>
              {i < path.length - 1 && (
                <div className="hop-link">
                  <span className="hop-link-line" />
                  {step.hopMs != null && (
                    <span
                      className={`hop-ms tone-${
                        step.hopMs >= 100
                          ? "fail"
                          : step.hopMs >= 40
                            ? "warn"
                            : "ok"
                      }`}
                    >
                      {step.hopMs}ms
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default App;
