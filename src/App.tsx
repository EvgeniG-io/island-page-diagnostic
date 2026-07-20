import { useMemo, useState } from "react";
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
import "./App.css";

type View = "overview" | LayerDetail["id"];

function statusLabel(s: LayerStatus): string {
  if (s === "ok") return "OK";
  if (s === "warn") return "Warn";
  if (s === "fail") return "Issue";
  if (s === "info") return "Info";
  return "N/A";
}

function App() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [url, setUrl] = useState(SCENARIOS[0].url);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(() =>
    applyTestedUrl(SCENARIOS[0], SCENARIOS[0].url),
  );
  const [view, setView] = useState<View>("overview");
  const [copied, setCopied] = useState(false);
  const [showAllLayers, setShowAllLayers] = useState(false);

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
    // Keep the URL under test — only swap the path/layer template
    const keepUrl = url.trim() || report?.url || scenario.url;
    const bound = applyTestedUrl(scenario, keepUrl);
    setScenarioId(id);
    setUrl(bound.url);
    setReport(bound);
    setView("overview");
    setCopied(false);
    setShowAllLayers(false);
  }

  function runDiagnose() {
    const input = url.trim();
    if (!input) return;
    setRunning(true);
    setCopied(false);
    window.setTimeout(() => {
      const base =
        SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
      const bound = applyTestedUrl(base, input);
      setUrl(bound.url);
      setReport(bound);
      setView("overview");
      setRunning(false);
    }, 700);
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
            Enter a URL · see the same URL on every hop, fact, and layer
          </p>
        </div>
        <span className="mode-pill">diagnostic</span>
      </header>

      <section className="compose" aria-label="URL under test">
        <label className="field">
          <span>URL to diagnose</span>
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
          onClick={runDiagnose}
          disabled={running || !url.trim()}
        >
          {running ? "Collecting…" : "Run diagnose"}
        </button>
      </section>

      {report && (
        <>
          <section className="summary">
            <div className="stat">
              <span className="stat-label">Host</span>
              <span className="stat-value">{report.site}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Path pattern</span>
              <span className="stat-value">{report.label}</span>
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
                <span className="badge warn">browser · extension · rules</span>
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

              <section className="path-library" aria-label="Path patterns">
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
                              scenarioId === s.id
                                ? "scenario-card active"
                                : "scenario-card"
                            }
                            onClick={() => selectScenario(s.id)}
                          >
                            <span className="scenario-label">{s.label}</span>
                            <span className="scenario-desc">
                              {s.description}
                            </span>
                            {scenarioId === s.id ? (
                              <span className="scenario-bound">
                                Bound to · {report.site}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

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
