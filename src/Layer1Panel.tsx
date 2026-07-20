import type { ReactNode } from "react";
import type { PageSnapshot } from "./pageCollector";
import { formatBytes } from "./pageCollector";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="fact-card origin-page">
      <header className="fact-card-head">
        <h4>{title}</h4>
        <span className="origin-pill">layer-1</span>
      </header>
      {children}
    </article>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function Layer1Panel({ snapshot }: { snapshot: PageSnapshot }) {
  const heuTotal = snapshot.dom.islandHeuristics.reduce(
    (a, h) => a + h.count,
    0,
  );

  return (
    <div className="layer1-panel">
      <div className="layer1-summary">
        <div className="stat">
          <span className="stat-label">Page</span>
          <span className="stat-value">{snapshot.page.hostname}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Collected</span>
          <span className="stat-value">{snapshot.collectedAt}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Island DOM hits</span>
          <span className="stat-value">{heuTotal}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Resources</span>
          <span className="stat-value">{snapshot.resources.length}</span>
        </div>
      </div>

      <p className="fact-url-chip">
        Snapshot URL · <code>{snapshot.page.href}</code>
      </p>

      <div className="facts-board">
        <div className="facts-column">
          <Section title="Page">
            <dl className="fact-list">
              <Kv label="Title" value={snapshot.page.title || "(none)"} />
              <Kv label="Origin" value={snapshot.page.origin} />
              <Kv label="Referrer" value={snapshot.page.referrer || "(none)"} />
              <Kv label="Ready" value={snapshot.dom.readyState} />
              <Kv label="Elements" value={String(snapshot.dom.elementCount)} />
              <Kv
                label="Online"
                value={snapshot.page.online ? "Yes" : "No"}
              />
              <Kv label="Language" value={snapshot.page.language} />
            </dl>
          </Section>

          <Section title="Storage (this origin)">
            <dl className="fact-list">
              <Kv
                label="localStorage keys"
                value={String(snapshot.storage.localStorage.length)}
              />
              <Kv
                label="sessionStorage keys"
                value={String(snapshot.storage.sessionStorage.length)}
              />
              <Kv
                label="Cookies (non-HttpOnly)"
                value={String(snapshot.storage.cookieCount)}
              />
              <Kv
                label="Quota used"
                value={formatBytes(snapshot.storage.quotaUsage)}
              />
              <Kv
                label="Quota total"
                value={formatBytes(snapshot.storage.quotaTotal)}
              />
            </dl>
            {snapshot.storage.localStorage.length > 0 && (
              <>
                <h5 className="mini-head">localStorage</h5>
                <ul className="mini-list">
                  {snapshot.storage.localStorage.map((k) => (
                    <li key={k.key}>
                      <code>{k.key}</code> · {k.bytes} B
                      <div className="mini-val">{k.valuePreview}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {snapshot.storage.sessionStorage.length > 0 && (
              <>
                <h5 className="mini-head">sessionStorage</h5>
                <ul className="mini-list">
                  {snapshot.storage.sessionStorage.map((k) => (
                    <li key={`ss-${k.key}`}>
                      <code>{k.key}</code> · {k.bytes} B
                      <div className="mini-val">{k.valuePreview}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {snapshot.storage.cookies ? (
              <>
                <h5 className="mini-head">document.cookie</h5>
                <pre className="mini-pre">{snapshot.storage.cookies}</pre>
              </>
            ) : null}
          </Section>

          <Section title="Island DOM heuristics">
            {snapshot.dom.islandHeuristics.length === 0 ? (
              <p className="muted-inline">No heuristic matches on this page.</p>
            ) : (
              <ul className="mini-list">
                {snapshot.dom.islandHeuristics.map((h) => (
                  <li key={h.selector}>
                    <strong>
                      {h.label} · {h.count}
                    </strong>
                    <div className="mini-val">{h.selector}</div>
                    {h.samples.length > 0 && (
                      <div className="mini-val">{h.samples.join(" · ")}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="facts-column">
          <Section title="Navigation timing">
            <dl className="fact-list">
              <Kv label="Type" value={snapshot.navigation.type} />
              <Kv
                label="DOMContentLoaded"
                value={
                  snapshot.navigation.domContentLoadedMs != null
                    ? `${snapshot.navigation.domContentLoadedMs} ms`
                    : "n/a"
                }
              />
              <Kv
                label="Load"
                value={
                  snapshot.navigation.loadEventMs != null
                    ? `${snapshot.navigation.loadEventMs} ms`
                    : "n/a"
                }
              />
              <Kv
                label="Response end"
                value={
                  snapshot.navigation.responseEndMs != null
                    ? `${snapshot.navigation.responseEndMs} ms`
                    : "n/a"
                }
              />
              <Kv
                label="Transfer size"
                value={formatBytes(snapshot.navigation.transferSize)}
              />
            </dl>
          </Section>

          <Section title="Scripts">
            <p className="muted-inline">
              {snapshot.scripts.length} listed (capped) ·{" "}
              {snapshot.scripts.filter((s) => s.inline).length} inline ·{" "}
              {snapshot.scripts.filter((s) => s.src).length} external
            </p>
            <ul className="mini-list">
              {snapshot.scripts.slice(0, 40).map((s, i) => (
                <li key={`${s.src ?? "inline"}-${i}`}>
                  {s.inline ? (
                    <em>inline</em>
                  ) : (
                    <code className="break">{s.src}</code>
                  )}
                  {(s.async || s.defer) && (
                    <span className="mini-val">
                      {s.async ? "async " : ""}
                      {s.defer ? "defer" : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Service workers & cache">
            <dl className="fact-list">
              <Kv
                label="Service workers"
                value={String(snapshot.serviceWorkers.length)}
              />
              <Kv
                label="Cache Storage keys"
                value={
                  snapshot.cacheStorageKeys.length
                    ? snapshot.cacheStorageKeys.join(", ")
                    : "None"
                }
              />
            </dl>
            {snapshot.serviceWorkers.length > 0 && (
              <ul className="mini-list">
                {snapshot.serviceWorkers.map((sw) => (
                  <li key={sw.scope}>
                    <code>{sw.scope}</code>
                    <div className="mini-val">
                      {sw.state} · {sw.scriptURL || "(no worker yet)"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Network resources (Performance)">
            <p className="muted-inline">
              Last {snapshot.resources.length} resource timings
            </p>
            <div className="resource-scroll">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>ms</th>
                    <th>xfer</th>
                    <th>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.resources.map((r, i) => (
                    <tr key={`${r.name}-${i}`}>
                      <td>{r.initiatorType}</td>
                      <td>{r.durationMs}</td>
                      <td>{formatBytes(r.transferSize)}</td>
                      <td className="break">{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>

      <details className="limitations">
        <summary>What this cannot see (needs Island / extension)</summary>
        <ul>
          {snapshot.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
