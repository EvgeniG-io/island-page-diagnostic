import { useMemo, useState } from "react";
import type {
  DiagnosticReport,
  HopKind,
  LayerDetail,
  LayerStatus,
  PathStep,
} from "./reportTypes";
import { collectLiveProbe } from "./liveProbe";
import { buildLiveReport } from "./liveReport";
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
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [view, setView] = useState<View>("overview");
  const [copied, setCopied] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

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

  async function runDiagnose() {
    const input = url.trim();
    if (!input) return;
    setRunning(true);
    setCopied(false);
    setProbeError(null);
    try {
      const probe = await collectLiveProbe(input);
      const live = buildLiveReport(probe);
      setUrl(live.url);
      setReport(live);
      setView("overview");
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
            Real probe data only — no demo templates or invented Island fields
          </p>
        </div>
        <span className="mode-pill live">observed</span>
      </header>

      <section className="compose" aria-label="URL under test">
        <label className="field">
          <span>URL to diagnose</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://broken-site.example"
            spellCheck={false}
          />
        </label>
        <button
          className="primary"
          type="button"
          onClick={() => void runDiagnose()}
          disabled={running || !url.trim()}
        >
          {running ? "Probing…" : "Run diagnose"}
        </button>
      </section>

      {probeError && (
        <p className="probe-error" role="alert">
          Probe failed: {probeError}
        </p>
      )}

      {!report && !running && (
        <p className="empty-hint">
          Enter the URL under review and run diagnose. Results are measured from
          this browser (reachability, timing, HTTP/cache headers when readable).
          Island policy / classification / SWG are not shown — they are not
          readable here.
        </p>
      )}

      {report && (
        <>
          <section className="summary">
            <div className="stat">
              <span className="stat-label">Host</span>
              <span className="stat-value">{report.site}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Source</span>
              <span className="stat-value">Live probe</span>
            </div>
            <div className="stat">
              <span className="stat-label">Elapsed</span>
              <span className="stat-value">
                {report.pathTotalMs != null ? `${report.pathTotalMs} ms` : "—"}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Outcome</span>
              <span className="stat-value">{report.outcome}</span>
            </div>
          </section>

          <section className="actions-row">
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
            {report.layers.map((l) => (
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
                <span className="badge ok">observed only</span>
              </div>
              <HopPath
                path={report.rulePath}
                totalMs={report.pathTotalMs}
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
                  <h4 className="facts-col-title">From the probe</h4>
                  {pageGroups.map((g) => (
                    <article key={g.id} className="fact-card origin-page">
                      <header className="fact-card-head">
                        <h4>{g.label}</h4>
                        <span className="origin-pill">observed</span>
                      </header>
                      <p className="fact-url-chip">
                        For · <code>{report.url}</code>
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
                        <span className="origin-pill">observed</span>
                      </header>
                      <p className="fact-url-chip">
                        For · <code>{report.url}</code>
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

              <h3>Observed layers · {report.site}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Layer</th>
                    <th>Status</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {report.layers.map((l) => (
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
  network: "N",
  outcome: "O",
};

function HopPath({
  path,
  totalMs,
  testedUrl,
  testedHost,
}: {
  path: PathStep[];
  totalMs?: number;
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
