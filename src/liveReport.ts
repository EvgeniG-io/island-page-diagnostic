import type {
  DiagnosticReport,
  FactGroup,
  LayerDetail,
  LayerStatus,
  PathStep,
  ReportLine,
} from "./reportTypes";
import {
  cacheSummary,
  probeOutcomeLabel,
  type LiveProbe,
} from "./liveProbe";

function toneForProbe(probe: LiveProbe): LayerStatus {
  if (probe.kind === "ok") return "ok";
  if (probe.kind === "cors-opaque") return "warn";
  if (probe.kind === "http-error") return "warn";
  return "fail";
}

function layer(
  id: LayerDetail["id"],
  label: string,
  detail: Omit<LayerDetail, "id" | "label">,
): LayerDetail {
  return { id, label, ...detail };
}

function observed(value: string | null | undefined, empty = "Not readable"): string {
  if (value == null || value === "") return empty;
  return value;
}

/**
 * Build a report from real browser/network probe data only.
 * No demo templates, no invented Island policy fields.
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
      kind: "outcome",
      title: "Outcome",
      subtitle: outcome,
      tone,
    },
  ];

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
          value: observed(probe.contentType),
        },
        {
          label: "Redirected",
          value: probe.redirected ? "Yes" : "No",
        },
        {
          label: "Final URL",
          value: observed(probe.finalUrl, "Same as tested / not exposed"),
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
          value: observed(probe.cache.cacheControl),
        },
        { label: "Age", value: observed(probe.cache.age) },
        { label: "ETag", value: observed(probe.cache.etag) },
        {
          label: "Last-Modified",
          value: observed(probe.cache.lastModified),
        },
        { label: "Expires", value: observed(probe.cache.expires) },
        { label: "Vary", value: observed(probe.cache.vary) },
        {
          label: "CF-Cache-Status",
          value: observed(probe.cache.cfCacheStatus, "Not present / not readable"),
        },
        {
          label: "X-Cache",
          value: observed(probe.cache.xCache, "Not present / not readable"),
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
          value: observed(probe.cache.forceCacheHint, "Not run"),
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
                : "Not available (cross-origin)",
        },
        { label: "Service worker", value: probe.cache.serviceWorker },
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
    { tag: "OUTCOME", body: outcome, tone },
  ];

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
        ["Content-Type", observed(probe.contentType)],
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
        ["Browser cache hint", probe.cache.browserCacheHint],
        ["Cache-Control", observed(probe.cache.cacheControl)],
        ["Age", observed(probe.cache.age)],
        ["ETag", observed(probe.cache.etag)],
        [
          "CF-Cache-Status",
          observed(probe.cache.cfCacheStatus, "Not present / not readable"),
        ],
        [
          "X-Cache",
          observed(probe.cache.xCache, "Not present / not readable"),
        ],
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
            : "Not run",
        ],
      ],
    }),
  ];

  return {
    id: "live-probe",
    label: "Live probe",
    description: "Observed browser + network facts only",
    site: host,
    url: probe.url,
    outcome,
    rulePath,
    pathTotalMs: probe.elapsedMs,
    factGroups,
    statusLines,
    layers,
  };
}
