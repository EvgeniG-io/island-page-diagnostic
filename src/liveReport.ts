import type {
  DiagnosticReport,
  FactGroup,
  LayerDetail,
  LayerId,
  LayerStatus,
  PathStep,
  ReportLine,
} from "./mockReport";
import {
  cacheSummary,
  probeOutcomeLabel,
  type LiveProbe,
} from "./liveProbe";

const UNAVAILABLE =
  "Unavailable from this web page — needs Island privileged collector";

function toneForProbe(probe: LiveProbe): LayerStatus {
  if (probe.kind === "ok") return "ok";
  if (probe.kind === "cors-opaque") return "warn";
  if (probe.kind === "http-error") return "warn";
  return "fail";
}

function layer(
  id: LayerId,
  label: string,
  detail: Omit<LayerDetail, "id" | "label">,
): LayerDetail {
  return { id, label, ...detail };
}

function islandNa(id: LayerId, label: string): LayerDetail {
  return layer(id, label, {
    status: "na",
    summary: UNAVAILABLE,
    rows: [
      ["Tested URL", ""], // filled below
      ["Host", ""],
      ["Source", "Not collected"],
      ["Reason", UNAVAILABLE],
    ],
  });
}

/**
 * Build a diagnostic report from real browser/network probe data.
 * Island policy/filter/SWG fields are explicitly N/A (not mocked).
 */
export function buildLiveReport(probe: LiveProbe): DiagnosticReport {
  const displayUrl = probe.url.endsWith("/") ? probe.url : `${probe.url}/`;
  const host = probe.host || "(unknown)";
  const outcome = probeOutcomeLabel(probe);
  const tone = toneForProbe(probe);
  const uaShort =
    probe.userAgent.length > 64
      ? `${probe.userAgent.slice(0, 61)}…`
      : probe.userAgent;

  const rulePath: PathStep[] = [
    {
      kind: "browser",
      title: "Browser",
      subtitle: host,
      tone: probe.online ? "ok" : "fail",
      hopMs: 1,
    },
    {
      kind: "network",
      title: "Network probe",
      subtitle:
        probe.kind === "ok"
          ? `HTTP ${probe.httpStatus}`
          : probe.kind === "cors-opaque"
            ? "opaque / CORS"
            : probe.kind,
      tone,
      hopMs: probe.elapsedMs,
    },
    {
      kind: "extension",
      title: "Island",
      subtitle: "Not available here",
      tone: "na",
      hopMs: 0,
    },
    {
      kind: "outcome",
      title: "Outcome",
      subtitle: outcome,
      tone,
    },
  ];

  const pathTotalMs = probe.elapsedMs;

  const factGroups: FactGroup[] = [
    {
      id: "page-probe",
      label: "URL probe (observed)",
      origin: "page",
      facts: [
        { label: "Tested URL", value: displayUrl },
        { label: "Host", value: host },
        { label: "Probe result", value: outcome },
        {
          label: "HTTP status",
          value:
            probe.httpStatus != null ? String(probe.httpStatus) : "Not readable",
        },
        {
          label: "Headers readable",
          value: probe.headersReadable ? "Yes" : "No",
        },
        {
          label: "Content-Type",
          value: probe.contentType ?? "Not readable",
        },
        {
          label: "Redirected",
          value: probe.redirected ? "Yes" : "No",
        },
        {
          label: "Final URL",
          value: probe.finalUrl ?? "n/a",
        },
        { label: "Elapsed", value: `${probe.elapsedMs} ms` },
        {
          label: "Error",
          value: probe.errorMessage
            ? `${probe.errorName}: ${probe.errorMessage}`
            : "None",
        },
      ],
    },
    {
      id: "cache-observed",
      label: "Cache (observed)",
      origin: "page",
      facts: [
        { label: "Tested URL", value: displayUrl },
        { label: "Host", value: host },
        { label: "Browser cache hint", value: probe.cache.browserCacheHint },
        {
          label: "Cache-Control",
          value: probe.cache.cacheControl ?? "Not readable",
        },
        { label: "Age", value: probe.cache.age ?? "Not readable" },
        { label: "ETag", value: probe.cache.etag ?? "Not readable" },
        {
          label: "Last-Modified",
          value: probe.cache.lastModified ?? "Not readable",
        },
        { label: "Expires", value: probe.cache.expires ?? "Not readable" },
        { label: "Vary", value: probe.cache.vary ?? "Not readable" },
        {
          label: "CF-Cache-Status",
          value: probe.cache.cfCacheStatus ?? "Not present / not readable",
        },
        {
          label: "X-Cache",
          value: probe.cache.xCache ?? "Not present / not readable",
        },
        {
          label: "transferSize",
          value:
            probe.cache.transferSize != null
              ? String(probe.cache.transferSize)
              : "Not exposed",
        },
        {
          label: "force-cache probe",
          value: probe.cache.forceCacheHint ?? "n/a",
        },
        {
          label: "Island classification cache",
          value: probe.cache.islandClassificationCache,
        },
      ],
    },
    {
      id: "browser-local",
      label: "This browser (observed)",
      origin: "local",
      facts: [
        { label: "Tested URL", value: displayUrl },
        { label: "Host", value: host },
        { label: "Collected at", value: probe.collectedAt },
        { label: "Online", value: probe.online ? "Yes" : "No" },
        { label: "Language", value: probe.language },
        { label: "Timezone", value: probe.timezone },
        { label: "Platform", value: probe.platform },
        {
          label: "Connection",
          value:
            [probe.connectionType, probe.effectiveType]
              .filter(Boolean)
              .join(" · ") || "Not exposed",
        },
        { label: "User-Agent", value: uaShort },
        {
          label: "Same origin as diagnostic UI",
          value: probe.isSameOrigin ? "Yes" : "No",
        },
        {
          label: "Cache Storage keys",
          value:
            probe.cache.cacheStorageKeys.length > 0
              ? probe.cache.cacheStorageKeys.join(", ")
              : probe.isSameOrigin
                ? "None"
                : "n/a (cross-origin)",
        },
        { label: "Service worker", value: probe.cache.serviceWorker },
      ],
    },
    {
      id: "island-gap",
      label: "Island layers (not collected)",
      origin: "local",
      facts: [
        { label: "Tested URL", value: displayUrl },
        { label: "Host", value: host },
        { label: "Matched rule", value: UNAVAILABLE },
        { label: "URL category / reputation", value: UNAVAILABLE },
        { label: "Classification cache", value: UNAVAILABLE },
        { label: "SWG verdict", value: UNAVAILABLE },
        { label: "Config / tenant policy", value: UNAVAILABLE },
        { label: "Extension / LMC", value: UNAVAILABLE },
      ],
    },
  ];

  const statusLines: ReportLine[] = [
    { tag: "URL", body: `Tested: ${displayUrl}`, tone: "info" },
    {
      tag: "PROBE",
      body: `${outcome} · ${probe.elapsedMs}ms · ${probe.collectedAt}`,
      tone,
    },
    {
      tag: "CACHE",
      body: cacheSummary(probe.cache),
      tone: probe.headersReadable ? "info" : "warn",
    },
    {
      tag: "BROWSER",
      body: `online=${probe.online ? "yes" : "no"} · ${probe.timezone} · ${probe.language}`,
      tone: probe.online ? "ok" : "fail",
    },
    {
      tag: "ISLAND",
      body: UNAVAILABLE,
      tone: "na",
    },
    { tag: "OUTCOME", body: outcome, tone },
  ];

  const fillUrl = (rows: [string, string][]): [string, string][] =>
    rows.map(([k, v]) => {
      if (k === "Tested URL") return [k, displayUrl];
      if (k === "Host") return [k, host];
      return [k, v];
    });

  const layers: LayerDetail[] = [
    layer("page", "Page / probe", {
      status: tone,
      summary: outcome,
      rows: [
        ["Tested URL", displayUrl],
        ["Host", host],
        ["Probe kind", probe.kind],
        [
          "HTTP status",
          probe.httpStatus != null ? String(probe.httpStatus) : "Not readable",
        ],
        ["Headers readable", probe.headersReadable ? "Yes" : "No"],
        ["Content-Type", probe.contentType ?? "Not readable"],
        ["Elapsed ms", String(probe.elapsedMs)],
        ["Collected at", probe.collectedAt],
      ],
    }),
    layer("endpoint", "This browser", {
      status: probe.online ? "ok" : "fail",
      summary: probe.online ? "Browser online · env collected" : "Browser offline",
      rows: [
        ["Tested URL", displayUrl],
        ["Host", host],
        ["Online", probe.online ? "Yes" : "No"],
        ["Timezone", probe.timezone],
        ["Language", probe.language],
        ["Platform", probe.platform],
        ["User-Agent", uaShort],
      ],
    }),
    layer("perf", "Probe timing + cache", {
      status: probe.elapsedMs >= 3000 ? "warn" : "ok",
      summary: `${probe.elapsedMs} ms · ${cacheSummary(probe.cache)}`,
      rows: [
        ["Tested URL", displayUrl],
        ["Host", host],
        ["Elapsed ms", String(probe.elapsedMs)],
        ["Timeout budget", "12000 ms"],
        ["Browser cache hint", probe.cache.browserCacheHint],
        [
          "Cache-Control",
          probe.cache.cacheControl ?? "Not readable",
        ],
        ["Age", probe.cache.age ?? "Not readable"],
        ["ETag", probe.cache.etag ?? "Not readable"],
        [
          "CF-Cache-Status",
          probe.cache.cfCacheStatus ?? "Not present / not readable",
        ],
        ["X-Cache", probe.cache.xCache ?? "Not present / not readable"],
        [
          "transferSize",
          probe.cache.transferSize != null
            ? String(probe.cache.transferSize)
            : "Not exposed",
        ],
        [
          "force-cache ms",
          probe.cache.forceCacheElapsedMs != null
            ? String(probe.cache.forceCacheElapsedMs)
            : "n/a",
        ],
        [
          "Island classification cache",
          probe.cache.islandClassificationCache,
        ],
      ],
    }),
    {
      ...islandNa("extension", "Extension"),
      rows: fillUrl(islandNa("extension", "Extension").rows),
    },
    {
      ...islandNa("browser-policy", "Browser Policy"),
      rows: fillUrl([
        ["Tested URL", ""],
        ["Host", ""],
        ["Classification cache", UNAVAILABLE],
        ["Source", "Not collected"],
        ["Reason", UNAVAILABLE],
      ]),
    },
    {
      ...islandNa("swg", "SWG"),
      rows: fillUrl(islandNa("swg", "SWG").rows),
    },
    {
      ...islandNa("app-params", "App Params"),
      rows: fillUrl(islandNa("app-params", "App Params").rows),
    },
    {
      ...islandNa("ztna", "ZTNA"),
      rows: fillUrl(islandNa("ztna", "ZTNA").rows),
    },
    {
      ...islandNa("rbi", "RBI"),
      rows: fillUrl(islandNa("rbi", "RBI").rows),
    },
    {
      ...islandNa("identity", "Identity"),
      rows: fillUrl(islandNa("identity", "Identity").rows),
    },
    {
      ...islandNa("storage", "Storage"),
      rows: fillUrl(islandNa("storage", "Storage").rows),
    },
    {
      ...islandNa("files", "Files"),
      rows: fillUrl(islandNa("files", "Files").rows),
    },
    {
      ...islandNa("telemetry", "Telemetry"),
      rows: fillUrl(islandNa("telemetry", "Telemetry").rows),
    },
  ];

  return {
    id: "live-probe",
    label: "Live probe",
    description: "Real browser + network observations · Island fields N/A",
    site: host,
    url: probe.url,
    tenant: "n/a",
    tenantId: "n/a",
    matchedRule: "n/a — Island collector required",
    outcome,
    rulePath,
    pathTotalMs,
    factGroups,
    statusLines,
    layers,
    focusPrimary: true,
    primaryLayers: [
      "page",
      "endpoint",
      "perf",
      "extension",
      "swg",
      "browser-policy",
    ],
  };
}
