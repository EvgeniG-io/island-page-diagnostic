export type LayerStatus = "ok" | "warn" | "fail" | "na" | "info";

export type LayerId =
  | "page"
  | "extension"
  | "app-params"
  | "browser-policy"
  | "swg"
  | "ztna"
  | "rbi"
  | "endpoint"
  | "identity"
  | "storage"
  | "files"
  | "perf"
  | "telemetry";

export type Fact = {
  label: string;
  value: string;
};

export type FactGroup = {
  id: string;
  label: string;
  origin: "page" | "local";
  facts: Fact[];
};

export type ReportLine = {
  tag: string;
  body: string;
  tone?: LayerStatus;
};

/** Node kinds for hop-to-hop path (browser → extension → …) */
export type HopKind =
  | "browser"
  | "extension"
  | "page"
  | "classify"
  | "rule"
  | "network"
  | "policy"
  | "storage"
  | "files"
  | "config"
  | "vpn"
  | "outcome";

/** One hop in the observed evaluation path */
export type PathStep = {
  kind: HopKind;
  /** Short label under the node */
  title: string;
  /** Secondary line (rule name, host, flag, …) */
  subtitle?: string;
  tone: LayerStatus;
  /** Time from this hop to the next (ms), when known from local timings */
  hopMs?: number;
};

export type LayerDetail = {
  id: LayerId;
  label: string;
  status: LayerStatus;
  summary: string;
  rows: [string, string][];
};

export type DiagnosticReport = {
  id: string;
  label: string;
  description: string;
  site: string;
  url: string;
  tenant: string;
  tenantId: string;
  /** Observed hop-to-hop path (browser / extension / rule / …) */
  rulePath: PathStep[];
  /** Sum of hopMs when available */
  pathTotalMs?: number;
  matchedRule: string;
  outcome: string;
  factGroups: FactGroup[];
  statusLines: ReportLine[];
  layers: LayerDetail[];
  focusPrimary?: boolean;
  primaryLayers?: LayerId[];
};

function layer(
  id: LayerId,
  label: string,
  detail: Omit<LayerDetail, "id" | "label">,
): LayerDetail {
  return { id, label, ...detail };
}

export const CLASSIFICATION_SAMPLE: DiagnosticReport = {
  id: "classify-block",
  label: "URL filter · block",
  description: "Page + local filter fields · rule path to Default deny",
  site: "files.internal.example.com",
  url: "https://files.internal.example.com",
  tenant: "acme-corp",
  tenantId: "abc-123",
  matchedRule: "Default deny",
  outcome: "Block",
  focusPrimary: true,
  primaryLayers: ["page", "swg", "app-params", "browser-policy", "extension"],
  pathTotalMs: 48,
  rulePath: [
    {
      kind: "browser",
      title: "Browser",
      subtitle: "Managed profile",
      tone: "ok",
      hopMs: 3,
    },
    {
      kind: "extension",
      title: "Extension",
      subtitle: "Content scripts",
      tone: "ok",
      hopMs: 12,
    },
    {
      kind: "classify",
      title: "Classify",
      subtitle: "Uncategorized · rep 40",
      tone: "warn",
      hopMs: 8,
    },
    {
      kind: "rule",
      title: "Rule",
      subtitle: "Default deny",
      tone: "fail",
      hopMs: 2,
    },
    {
      kind: "page",
      title: "Page",
      subtitle: "Block interstitial",
      tone: "fail",
      hopMs: 23,
    },
    {
      kind: "outcome",
      title: "Outcome",
      subtitle: "Block",
      tone: "fail",
    },
  ],
  factGroups: [
    {
      id: "page",
      label: "Page",
      origin: "page",
      facts: [
        { label: "URL", value: "https://files.internal.example.com/" },
        { label: "Title", value: "Access blocked" },
        { label: "Island block page", value: "Yes" },
      ],
    },
    {
      id: "filter",
      label: "Filter (local)",
      origin: "local",
      facts: [
        { label: "Category", value: "Uncategorized" },
        { label: "Reputation", value: "40" },
        { label: "Verdict", value: "Block" },
        { label: "Matched rule", value: "Default deny" },
        { label: "Host override", value: "No" },
        { label: "Fallback category", value: "Not set" },
        { label: "Fallback mode", value: "fail-open" },
      ],
    },
  ],
  statusLines: [
    { tag: "PAGE", body: "Block page in DOM · title: Access blocked", tone: "fail" },
    { tag: "CLASSIFY", body: "Uncategorized · rep 40 · cache=device", tone: "warn" },
    { tag: "RULE", body: 'Matched: "Default deny"', tone: "fail" },
    { tag: "OVERRIDE", body: "Trusted list: No", tone: "warn" },
    { tag: "OUTCOME", body: "Block", tone: "fail" },
  ],
  layers: [
    layer("page", "Page", {
      status: "fail",
      summary: "Block interstitial present",
      rows: [
        ["URL", "https://files.internal.example.com/"],
        ["Block page DOM", "Yes"],
        ["App UI", "Not loaded"],
      ],
    }),
    layer("extension", "Extension", {
      status: "ok",
      summary: "Scripts active · no LMC mask",
      rows: [
        ["Content scripts", "Active"],
        ["LMC / masks", "None"],
      ],
    }),
    layer("app-params", "App Params", {
      status: "warn",
      summary: "No app-group allow for host",
      rows: [
        ["Application Group", "None matched"],
        ["Evaluators", "Fell through to default web policy"],
      ],
    }),
    layer("browser-policy", "Browser Policy", {
      status: "ok",
      summary: "Classification cache on device",
      rows: [
        ["Cache entry", "Present"],
        ["Managed profile", "Yes"],
      ],
    }),
    layer("swg", "SWG / Filter", {
      status: "fail",
      summary: "Verdict Block · Default deny",
      rows: [
        ["Verdict", "Block"],
        ["Category", "Uncategorized"],
        ["Reputation", "40"],
        ["Matched rule", "Default deny"],
      ],
    }),
    layer("ztna", "ZTNA", {
      status: "na",
      summary: "Not a private app",
      rows: [["Private app", "No"]],
    }),
    layer("rbi", "RBI", {
      status: "na",
      summary: "Not active",
      rows: [["RBI", "No"]],
    }),
    layer("endpoint", "Endpoint", {
      status: "ok",
      summary: "Posture pass",
      rows: [["Posture", "Pass"]],
    }),
    layer("identity", "Identity", {
      status: "ok",
      summary: "SSO valid",
      rows: [
        ["IdP", "Okta"],
        ["Session", "Valid"],
      ],
    }),
    layer("storage", "Storage", {
      status: "na",
      summary: "Not central",
      rows: [["localStorage", "—"]],
    }),
    layer("files", "Files", {
      status: "na",
      summary: "No download",
      rows: [["Download", "—"]],
    }),
    layer("perf", "Performance", {
      status: "na",
      summary: "Blocked before app render",
      rows: [["LCP", "N/A"]],
    }),
    layer("telemetry", "Telemetry", {
      status: "info",
      summary: "blocked_navigation in local buffer",
      rows: [["Last event", "blocked_navigation"]],
    }),
  ],
};

export const POLICY_SAMPLE: DiagnosticReport = {
  id: "policy-applied",
  label: "Applied policy · default rule",
  description: "Config fetch state + matched rule path on device",
  site: "tools.example.com",
  url: "https://tools.example.com",
  tenant: "acme-corp",
  tenantId: "abc-123",
  matchedRule: "Default Rule",
  outcome: "Block",
  focusPrimary: true,
  primaryLayers: ["page", "app-params", "browser-policy", "swg", "identity"],
  pathTotalMs: 1120,
  rulePath: [
    {
      kind: "browser",
      title: "Browser",
      subtitle: "Profile session",
      tone: "ok",
      hopMs: 4,
    },
    {
      kind: "config",
      title: "Config",
      subtitle: "Fetch timeout",
      tone: "fail",
      hopMs: 1000,
    },
    {
      kind: "extension",
      title: "Extension",
      subtitle: "Fallback blob",
      tone: "warn",
      hopMs: 15,
    },
    {
      kind: "policy",
      title: "App params",
      subtitle: "No group match",
      tone: "warn",
      hopMs: 6,
    },
    {
      kind: "rule",
      title: "Rule",
      subtitle: "Default Rule",
      tone: "fail",
      hopMs: 3,
    },
    {
      kind: "outcome",
      title: "Outcome",
      subtitle: "Block page",
      tone: "fail",
    },
  ],
  factGroups: [
    {
      id: "page",
      label: "Page",
      origin: "page",
      facts: [
        { label: "URL", value: "https://tools.example.com/" },
        { label: "Title", value: "Access blocked" },
        { label: "Island block page", value: "Yes" },
      ],
    },
    {
      id: "policy",
      label: "Policy on device",
      origin: "local",
      facts: [
        { label: "Matched rule", value: "Default Rule" },
        { label: "Config last fetch", value: "Error / timeout" },
        { label: "Config last fetch time", value: "08:41 UTC" },
        { label: "Local policy blob", value: "Partial / fallback" },
      ],
    },
  ],
  statusLines: [
    { tag: "PAGE", body: "Block page shown", tone: "fail" },
    { tag: "CONFIG", body: "Last fetch: Error / timeout @ 08:41 UTC", tone: "fail" },
    { tag: "RULE", body: "Matched: Default Rule", tone: "fail" },
    { tag: "BLOB", body: "Local policy: Partial / fallback", tone: "warn" },
    { tag: "OUTCOME", body: "Block", tone: "fail" },
  ],
  layers: [
    layer("page", "Page", {
      status: "fail",
      summary: "Block page present",
      rows: [
        ["Block page", "Yes"],
        ["Title", "Access blocked"],
      ],
    }),
    layer("extension", "Extension", {
      status: "warn",
      summary: "Enforcing applied local config",
      rows: [["Config source", "Local applied blob"]],
    }),
    layer("app-params", "App Params", {
      status: "fail",
      summary: "No project allow match on device",
      rows: [
        ["Application Group", "None"],
        ["Matched rule", "Default Rule"],
      ],
    }),
    layer("browser-policy", "Browser Policy", {
      status: "fail",
      summary: "Config fetch failed for session",
      rows: [
        ["Config fetch", "Error / timeout"],
        ["Policy blob", "Partial / fallback"],
      ],
    }),
    layer("swg", "SWG / Filter", {
      status: "fail",
      summary: "Evaluating with Default Rule",
      rows: [["Matched rule", "Default Rule"]],
    }),
    layer("ztna", "ZTNA", {
      status: "na",
      summary: "N/A",
      rows: [["Private app", "No"]],
    }),
    layer("rbi", "RBI", {
      status: "na",
      summary: "N/A",
      rows: [["RBI", "No"]],
    }),
    layer("endpoint", "Endpoint", {
      status: "ok",
      summary: "Posture pass",
      rows: [["Posture", "Pass"]],
    }),
    layer("identity", "Identity", {
      status: "ok",
      summary: "SSO valid",
      rows: [["Session", "Valid"]],
    }),
    layer("storage", "Storage", {
      status: "na",
      summary: "—",
      rows: [["localStorage", "—"]],
    }),
    layer("files", "Files", {
      status: "na",
      summary: "—",
      rows: [["Download", "—"]],
    }),
    layer("perf", "Performance", {
      status: "na",
      summary: "—",
      rows: [["LCP", "N/A"]],
    }),
    layer("telemetry", "Telemetry", {
      status: "info",
      summary: "Default Rule in local event",
      rows: [["Matched rule logged", "Default Rule"]],
    }),
  ],
};

export const STORAGE_SAMPLE: DiagnosticReport = {
  id: "storage",
  label: "Site data · storage",
  description: "Page origin storage + siteData / LMC settings path",
  site: "portal.example.com",
  url: "https://portal.example.com",
  tenant: "acme-corp",
  tenantId: "abc-123",
  matchedRule: "Allow (navigation)",
  outcome: "Page loaded · origin storage empty",
  focusPrimary: true,
  primaryLayers: ["page", "storage", "browser-policy", "extension", "app-params"],
  pathTotalMs: 41,
  rulePath: [
    {
      kind: "browser",
      title: "Browser",
      subtitle: "Site data mode",
      tone: "warn",
      hopMs: 2,
    },
    {
      kind: "extension",
      title: "Extension",
      subtitle: "LMC wipe flags",
      tone: "info",
      hopMs: 9,
    },
    {
      kind: "network",
      title: "Filter",
      subtitle: "Allow",
      tone: "ok",
      hopMs: 11,
    },
    {
      kind: "page",
      title: "Page",
      subtitle: "portal.example.com",
      tone: "ok",
      hopMs: 14,
    },
    {
      kind: "storage",
      title: "Storage",
      subtitle: "localStorage 0",
      tone: "warn",
      hopMs: 5,
    },
    {
      kind: "outcome",
      title: "State",
      subtitle: "Origin empty",
      tone: "warn",
    },
  ],
  factGroups: [
    {
      id: "page",
      label: "Page",
      origin: "page",
      facts: [
        { label: "URL", value: "https://portal.example.com/" },
        { label: "Title", value: "Portal" },
        { label: "Block page", value: "No" },
      ],
    },
    {
      id: "storage",
      label: "Storage + site data (local)",
      origin: "local",
      facts: [
        { label: "localStorage keys", value: "0" },
        { label: "sessionStorage keys", value: "2" },
        { label: "IndexedDB", value: "0" },
        { label: "Site data mode", value: "Delete on close" },
        { label: "Origin allow-save", value: "No" },
        { label: "Inactivity wipe", value: "true · 10 min" },
      ],
    },
  ],
  statusLines: [
    { tag: "PAGE", body: "Loaded · no block page", tone: "ok" },
    { tag: "FILTER", body: "Allow", tone: "ok" },
    { tag: "SITEDATA", body: "Delete on close · origin not allow-saved", tone: "warn" },
    { tag: "STORAGE", body: "localStorage: 0 · IndexedDB: 0", tone: "warn" },
  ],
  layers: [
    layer("page", "Page", {
      status: "ok",
      summary: "App document loaded",
      rows: [
        ["Block page", "No"],
        ["Title", "Portal"],
      ],
    }),
    layer("storage", "Storage", {
      status: "warn",
      summary: "Origin storage empty",
      rows: [
        ["localStorage", "0 keys"],
        ["IndexedDB", "0"],
      ],
    }),
    layer("extension", "Extension", {
      status: "info",
      summary: "LMC wipe-related flags on device",
      rows: [
        ["Inactivity wipe", "true"],
        ["Minutes", "10"],
      ],
    }),
    layer("app-params", "App Params", {
      status: "ok",
      summary: "App reachable",
      rows: [["Application Group", "Internal portals"]],
    }),
    layer("browser-policy", "Browser Policy", {
      status: "warn",
      summary: "Site data = delete on close",
      rows: [
        ["Site data mode", "Delete on close"],
        ["Origin allow-save", "No"],
      ],
    }),
    layer("swg", "SWG / Filter", {
      status: "ok",
      summary: "Allow",
      rows: [["Verdict", "Allow"]],
    }),
    layer("ztna", "ZTNA", {
      status: "na",
      summary: "N/A",
      rows: [["Private app", "No"]],
    }),
    layer("rbi", "RBI", {
      status: "na",
      summary: "N/A",
      rows: [["RBI", "No"]],
    }),
    layer("endpoint", "Endpoint", {
      status: "ok",
      summary: "Posture pass",
      rows: [["Posture", "Pass"]],
    }),
    layer("identity", "Identity", {
      status: "ok",
      summary: "SSO valid",
      rows: [["Session", "Valid"]],
    }),
    layer("files", "Files", {
      status: "na",
      summary: "—",
      rows: [["Download", "—"]],
    }),
    layer("perf", "Performance", {
      status: "ok",
      summary: "Page interactive",
      rows: [["readyState", "complete"]],
    }),
    layer("telemetry", "Telemetry", {
      status: "info",
      summary: "page_view",
      rows: [["Last event", "page_view"]],
    }),
  ],
};

export const DOWNLOAD_SAMPLE: DiagnosticReport = {
  id: "download",
  label: "Download · file policy",
  description: "Download manager + file-policy path on device",
  site: "compliance.example.com",
  url: "https://compliance.example.com",
  tenant: "acme-corp",
  tenantId: "abc-123",
  matchedRule: "Download profile: Scan → OneDrive",
  outcome: "Download blocked / destination save failed",
  focusPrimary: true,
  primaryLayers: ["page", "files", "extension", "app-params", "swg"],
  pathTotalMs: 186,
  rulePath: [
    {
      kind: "browser",
      title: "Browser",
      subtitle: "Download start",
      tone: "ok",
      hopMs: 5,
    },
    {
      kind: "extension",
      title: "Extension",
      subtitle: "File intercept",
      tone: "info",
      hopMs: 18,
    },
    {
      kind: "network",
      title: "Filter",
      subtitle: "Nav Allow",
      tone: "ok",
      hopMs: 12,
    },
    {
      kind: "files",
      title: "Scan",
      subtitle: "danger=content",
      tone: "fail",
      hopMs: 141,
    },
    {
      kind: "rule",
      title: "Destination",
      subtitle: "OneDrive only",
      tone: "warn",
      hopMs: 10,
    },
    {
      kind: "outcome",
      title: "Outcome",
      subtitle: "Save failed",
      tone: "fail",
    },
  ],
  factGroups: [
    {
      id: "page",
      label: "Page",
      origin: "page",
      facts: [
        { label: "URL", value: "https://compliance.example.com/" },
        { label: "Block page", value: "No" },
      ],
    },
    {
      id: "dl",
      label: "Download + file policy (local)",
      origin: "local",
      facts: [
        { label: "File", value: "report.xlsx" },
        { label: "bytesReceived", value: "0" },
        { label: "danger", value: "content" },
        { label: "Island verdict", value: "Blocked" },
        { label: "Reason", value: "Failed to save to download destination" },
        { label: "Destination", value: "OneDrive" },
        { label: "fileVerdict", value: "Scan" },
      ],
    },
  ],
  statusLines: [
    { tag: "PAGE", body: "Loaded · navigation Allow", tone: "ok" },
    { tag: "DOWNLOAD", body: "report.xlsx · bytesReceived 0", tone: "fail" },
    { tag: "SCAN", body: "danger=content · fileVerdict=Scan", tone: "fail" },
    { tag: "DEST", body: "OneDrive · no local fallback", tone: "warn" },
    { tag: "OUTCOME", body: "Blocked · save to destination failed", tone: "fail" },
  ],
  layers: [
    layer("page", "Page", {
      status: "ok",
      summary: "Origin page loaded",
      rows: [["Block page", "No"]],
    }),
    layer("files", "Files", {
      status: "fail",
      summary: "Last download blocked",
      rows: [
        ["File", "report.xlsx"],
        ["bytesReceived", "0"],
        ["Verdict", "Blocked"],
      ],
    }),
    layer("extension", "Extension", {
      status: "fail",
      summary: "File policy applied",
      rows: [
        ["fileVerdict", "Scan"],
        ["Destination", "OneDrive"],
      ],
    }),
    layer("app-params", "App Params", {
      status: "warn",
      summary: "Download profile for app group",
      rows: [["Download profile", "Scan + remote destination"]],
    }),
    layer("browser-policy", "Browser Policy", {
      status: "ok",
      summary: "Download interception on",
      rows: [["Interception", "On"]],
    }),
    layer("swg", "SWG / Filter", {
      status: "ok",
      summary: "Navigation Allow",
      rows: [["Verdict", "Allow"]],
    }),
    layer("ztna", "ZTNA", {
      status: "na",
      summary: "N/A",
      rows: [["Private app", "No"]],
    }),
    layer("rbi", "RBI", {
      status: "na",
      summary: "N/A",
      rows: [["RBI", "No"]],
    }),
    layer("endpoint", "Endpoint", {
      status: "ok",
      summary: "Posture pass",
      rows: [["Posture", "Pass"]],
    }),
    layer("identity", "Identity", {
      status: "ok",
      summary: "SSO valid",
      rows: [["Session", "Valid"]],
    }),
    layer("storage", "Storage", {
      status: "na",
      summary: "—",
      rows: [["localStorage", "—"]],
    }),
    layer("perf", "Performance", {
      status: "na",
      summary: "—",
      rows: [["LCP", "—"]],
    }),
    layer("telemetry", "Telemetry", {
      status: "info",
      summary: "download_blocked event",
      rows: [["Event", "download_blocked"]],
    }),
  ],
};

export const NETWORK_SAMPLE: DiagnosticReport = {
  id: "network",
  label: "Network · SWG path",
  description: "Allow path through PAC / SSL inspect / filter",
  site: "app.example.com",
  url: "https://app.example.com",
  tenant: "acme-corp",
  tenantId: "abc-123",
  matchedRule: "SaaS Apps",
  outcome: "Allow · via SWG proxy",
  focusPrimary: true,
  primaryLayers: ["page", "swg", "browser-policy", "app-params", "extension", "perf"],
  pathTotalMs: 180,
  rulePath: [
    {
      kind: "browser",
      title: "Browser",
      subtitle: "Navigation",
      tone: "ok",
      hopMs: 8,
    },
    {
      kind: "extension",
      title: "Extension",
      subtitle: "Scripts inject",
      tone: "ok",
      hopMs: 28,
    },
    {
      kind: "classify",
      title: "Classify",
      subtitle: "Business/SaaS",
      tone: "ok",
      hopMs: 6,
    },
    {
      kind: "rule",
      title: "Rule",
      subtitle: "SaaS Apps",
      tone: "ok",
      hopMs: 4,
    },
    {
      kind: "network",
      title: "SWG",
      subtitle: "SSL inspect · PAC",
      tone: "warn",
      hopMs: 112,
    },
    {
      kind: "page",
      title: "Origin",
      subtitle: "app.example.com",
      tone: "ok",
      hopMs: 22,
    },
    {
      kind: "outcome",
      title: "Outcome",
      subtitle: "Allow",
      tone: "ok",
    },
  ],
  factGroups: [
    {
      id: "page",
      label: "Page",
      origin: "page",
      facts: [
        { label: "URL", value: "https://app.example.com/" },
        { label: "Title", value: "Example App" },
        { label: "Block page", value: "No" },
        { label: "readyState", value: "complete" },
      ],
    },
    {
      id: "net",
      label: "Network + policy (local)",
      origin: "local",
      facts: [
        { label: "Category", value: "Business/SaaS" },
        { label: "Verdict", value: "Allow" },
        { label: "Matched rule", value: "SaaS Apps" },
        { label: "PAC", value: "PROXY swg.example.internal:8080" },
        { label: "SSL inspect", value: "Yes" },
        { label: "DNS path", value: "Island DNS proxy" },
        { label: "LCP", value: "1.42s" },
      ],
    },
  ],
  statusLines: [
    { tag: "PAGE", body: "Loaded · Example App", tone: "ok" },
    { tag: "FILTER", body: "Allow · Business/SaaS", tone: "ok" },
    { tag: "RULE", body: 'Matched: "SaaS Apps"', tone: "ok" },
    { tag: "PAC", body: "PROXY swg.example.internal:8080", tone: "warn" },
    { tag: "SSL", body: "Inspect: Yes", tone: "warn" },
    { tag: "OUTCOME", body: "Allow", tone: "ok" },
  ],
  layers: [
    layer("page", "Page", {
      status: "ok",
      summary: "App loaded",
      rows: [
        ["Block page", "No"],
        ["readyState", "complete"],
      ],
    }),
    layer("extension", "Extension", {
      status: "ok",
      summary: "Scripts + watermark",
      rows: [
        ["Content scripts", "Active"],
        ["Watermark", "Present"],
      ],
    }),
    layer("app-params", "App Params", {
      status: "ok",
      summary: 'App group "SaaS Apps"',
      rows: [
        ["Application Group", "SaaS Apps"],
        ["Evaluators", "hostname + category match"],
      ],
    }),
    layer("browser-policy", "Browser Policy", {
      status: "ok",
      summary: "Managed · custom CA",
      rows: [
        ["Custom CA", "Installed"],
        ["PAC", "PROXY swg…"],
      ],
    }),
    layer("swg", "SWG / Filter", {
      status: "warn",
      summary: "Allow via SWG · SSL inspect",
      rows: [
        ["Verdict", "Allow"],
        ["SSL inspect", "Yes"],
        ["Path", "browser → SWG → origin"],
      ],
    }),
    layer("ztna", "ZTNA", {
      status: "na",
      summary: "N/A",
      rows: [["Private app", "No"]],
    }),
    layer("rbi", "RBI", {
      status: "na",
      summary: "N/A",
      rows: [["RBI", "No"]],
    }),
    layer("endpoint", "Endpoint", {
      status: "ok",
      summary: "Posture pass",
      rows: [["Posture", "Pass"]],
    }),
    layer("identity", "Identity", {
      status: "ok",
      summary: "SSO valid",
      rows: [
        ["IdP", "Okta"],
        ["Last refresh", "2m ago"],
      ],
    }),
    layer("storage", "Storage", {
      status: "ok",
      summary: "Session storage present",
      rows: [["localStorage keys", "12"]],
    }),
    layer("files", "Files", {
      status: "na",
      summary: "—",
      rows: [["Download", "—"]],
    }),
    layer("perf", "Performance", {
      status: "ok",
      summary: "LCP 1.42s",
      rows: [
        ["LCP", "1.42s"],
        ["Script inject sum", "28ms"],
      ],
    }),
    layer("telemetry", "Telemetry", {
      status: "ok",
      summary: "page_view",
      rows: [["Last event", "page_view"]],
    }),
  ],
};

export const SWG_MISS_SAMPLE: DiagnosticReport = {
  id: "swg-path",
  label: "SWG path · no verdict",
  description: "VPN up · dialer/flag fields · no filter verdict recorded",
  site: "risky.example.com",
  url: "https://risky.example.com",
  tenant: "acme-corp",
  tenantId: "abc-123",
  matchedRule: "(none recorded)",
  outcome: "Page loaded · no SWG filter verdict",
  focusPrimary: true,
  primaryLayers: ["page", "swg", "ztna", "browser-policy", "app-params"],
  pathTotalMs: 95,
  rulePath: [
    {
      kind: "browser",
      title: "Browser",
      subtitle: "iOS / managed",
      tone: "ok",
      hopMs: 5,
    },
    {
      kind: "vpn",
      title: "IPA tunnel",
      subtitle: "Connected",
      tone: "ok",
      hopMs: 18,
    },
    {
      kind: "policy",
      title: "Flags",
      subtitle: "device-wide SWG=false",
      tone: "fail",
      hopMs: 2,
    },
    {
      kind: "network",
      title: "SWG dialer",
      subtitle: "Create failed",
      tone: "fail",
      hopMs: 40,
    },
    {
      kind: "page",
      title: "Page",
      subtitle: "Loaded",
      tone: "ok",
      hopMs: 30,
    },
    {
      kind: "outcome",
      title: "Filter",
      subtitle: "No verdict",
      tone: "fail",
    },
  ],
  factGroups: [
    {
      id: "page",
      label: "Page",
      origin: "page",
      facts: [
        { label: "URL", value: "https://risky.example.com/" },
        { label: "Block page", value: "No" },
        { label: "Loaded", value: "Yes" },
      ],
    },
    {
      id: "swg",
      label: "SWG / tunnel (local)",
      origin: "local",
      facts: [
        { label: "IPA tunnel", value: "Connected" },
        { label: "SWG dialer", value: "Failed" },
        { label: "Filter verdict", value: "None recorded" },
        { label: "ios-device-wide-vpn-enabled", value: "false" },
        { label: "ipa-proxy-use-swg-direct-dialer", value: "true" },
      ],
    },
  ],
  statusLines: [
    { tag: "PAGE", body: "Loaded · no block page", tone: "ok" },
    { tag: "VPN", body: "IPA tunnel: Connected", tone: "ok" },
    { tag: "FLAG", body: "device-wide VPN/SWG = false", tone: "fail" },
    { tag: "DIALER", body: "SWG dialer: Failed", tone: "fail" },
    { tag: "FILTER", body: "Verdict: none recorded", tone: "fail" },
  ],
  layers: [
    layer("page", "Page", {
      status: "ok",
      summary: "Document loaded",
      rows: [
        ["Block page", "No"],
        ["Loaded", "Yes"],
      ],
    }),
    layer("extension", "Extension", {
      status: "na",
      summary: "N/A for this client path",
      rows: [["Role", "—"]],
    }),
    layer("app-params", "App Params", {
      status: "info",
      summary: "SWG rule present in local policy",
      rows: [["SWG rule in policy", "Yes"]],
    }),
    layer("browser-policy", "Browser Policy", {
      status: "fail",
      summary: "Flag values on device",
      rows: [
        ["ios-device-wide-vpn-enabled", "false"],
        ["ipa-proxy-use-swg-direct-dialer", "true"],
      ],
    }),
    layer("swg", "SWG / Filter", {
      status: "fail",
      summary: "No evaluation recorded",
      rows: [
        ["Dialer", "Failed"],
        ["Verdict", "None"],
      ],
    }),
    layer("ztna", "ZTNA", {
      status: "ok",
      summary: "IPA connected",
      rows: [
        ["Tunnel", "Connected"],
        ["Private apps", "Reachable"],
      ],
    }),
    layer("rbi", "RBI", {
      status: "na",
      summary: "N/A",
      rows: [["RBI", "No"]],
    }),
    layer("endpoint", "Endpoint", {
      status: "ok",
      summary: "Posture pass",
      rows: [["Posture", "Pass"]],
    }),
    layer("identity", "Identity", {
      status: "ok",
      summary: "SSO valid",
      rows: [["Session", "Valid"]],
    }),
    layer("storage", "Storage", {
      status: "na",
      summary: "—",
      rows: [["localStorage", "—"]],
    }),
    layer("files", "Files", {
      status: "na",
      summary: "—",
      rows: [["Download", "—"]],
    }),
    layer("perf", "Performance", {
      status: "ok",
      summary: "Page loaded",
      rows: [["readyState", "complete"]],
    }),
    layer("telemetry", "Telemetry", {
      status: "warn",
      summary: "Dialer error in local logs",
      rows: [["SWG dialer error", "Yes"]],
    }),
  ],
};

export const SCENARIOS: DiagnosticReport[] = [
  CLASSIFICATION_SAMPLE,
  POLICY_SAMPLE,
  STORAGE_SAMPLE,
  DOWNLOAD_SAMPLE,
  SWG_MISS_SAMPLE,
  NETWORK_SAMPLE,
];

/** Demo path patterns grouped for the library UI (not primary navigation). */
export type ScenarioGroup = {
  id: string;
  title: string;
  hint: string;
  scenarioIds: string[];
};

export const SCENARIO_GROUPS: ScenarioGroup[] = [
  {
    id: "policy-filter",
    title: "Policy & URL filter",
    hint: "Classification, matched rules, default deny / default rule",
    scenarioIds: ["classify-block", "policy-applied"],
  },
  {
    id: "data-files",
    title: "Site data & downloads",
    hint: "Origin storage, LMC, download manager / file policy",
    scenarioIds: ["storage", "download"],
  },
  {
    id: "network-swg",
    title: "Network & SWG",
    hint: "VPN / dialer, PAC, SSL inspect, filter verdict path",
    scenarioIds: ["swg-path", "network"],
  },
];

/** Parse host from user input; empty if invalid. */
export function parseHost(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    return new URL(withProto).hostname;
  } catch {
    return t.replace(/^https?:\/\//i, "").split("/")[0] ?? "";
  }
}

/** Normalize to absolute URL for display in the report. */
export function normalizeTestUrl(raw: string, fallback: string): string {
  const t = raw.trim() || fallback;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    return new URL(withProto).href;
  } catch {
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  }
}

function rewriteText(
  text: string,
  oldUrl: string,
  oldHost: string,
  nextUrl: string,
  nextHost: string,
): string {
  let out = text;
  if (oldUrl && oldUrl !== nextUrl) {
    out = out.split(oldUrl).join(nextUrl);
    const oldNoSlash = oldUrl.replace(/\/$/, "");
    const nextNoSlash = nextUrl.replace(/\/$/, "");
    if (oldNoSlash !== oldUrl) {
      out = out.split(oldNoSlash).join(nextNoSlash);
    }
  }
  if (oldHost && oldHost !== nextHost) {
    out = out.split(oldHost).join(nextHost);
  }
  return out;
}

/**
 * Bind a scenario template to the URL under test so every section
 * (path hops, status strip, facts, layers) shows that same URL/host.
 */
export function applyTestedUrl(
  report: DiagnosticReport,
  inputUrl: string,
): DiagnosticReport {
  const nextUrl = normalizeTestUrl(inputUrl, report.url);
  const nextHost = parseHost(nextUrl) || report.site;
  const oldUrl = report.url;
  const oldHost = report.site;
  const rw = (s: string) => rewriteText(s, oldUrl, oldHost, nextUrl, nextHost);

  const rulePath = report.rulePath.map((step) => {
    let subtitle = step.subtitle ? rw(step.subtitle) : step.subtitle;
    // Bind URL context into path hops that represent page / origin
    if (step.kind === "browser") {
      subtitle = nextHost;
    } else if (step.kind === "page") {
      const base =
        subtitle && subtitle !== oldHost && !subtitle.includes(nextHost)
          ? subtitle
          : undefined;
      subtitle = base ? `${base} · ${nextHost}` : nextHost;
    } else if (step.title === "Origin") {
      subtitle = nextHost;
    }
    return {
      ...step,
      title: rw(step.title),
      subtitle,
    };
  });

  const displayUrl = nextUrl.endsWith("/") ? nextUrl : `${nextUrl}/`;

  const factGroups = report.factGroups.map((g) => {
    const facts = g.facts.map((f) => {
      const label = f.label.toLowerCase();
      if (label === "url" || label === "tested url") {
        return { ...f, label: f.label, value: displayUrl };
      }
      if (label === "host" || label === "hostname") {
        return { ...f, value: nextHost };
      }
      return { ...f, value: rw(f.value) };
    });
    // Every fact group carries the tested URL in its path context
    if (!facts.some((f) => ["url", "tested url"].includes(f.label.toLowerCase()))) {
      facts.unshift({ label: "Tested URL", value: displayUrl });
    }
    if (!facts.some((f) => ["host", "hostname"].includes(f.label.toLowerCase()))) {
      const urlIdx = facts.findIndex((f) =>
        ["url", "tested url"].includes(f.label.toLowerCase()),
      );
      facts.splice(urlIdx + 1, 0, { label: "Host", value: nextHost });
    }
    return { ...g, label: rw(g.label), facts };
  });

  const statusLines = report.statusLines.map((line) => ({
    ...line,
    body: rw(line.body),
  }));

  // Always lead the status strip with the URL under test
  const withoutPriorUrl = statusLines.filter((l) => l.tag !== "URL");
  const nextStatus = [
    { tag: "URL", body: `Tested: ${displayUrl}`, tone: "info" as const },
    ...withoutPriorUrl.map((l) =>
      l.tag === "PAGE"
        ? { ...l, body: ensureHostInBody(l.body, nextHost, nextUrl) }
        : l,
    ),
  ];

  const layers = report.layers.map((l) => {
    const rows = l.rows.map(([k, v]) => {
      const key = k.toLowerCase();
      if (key === "url" || key === "tested url") {
        return [k, displayUrl] as [string, string];
      }
      if (key === "host" || key === "hostname") {
        return [k, nextHost] as [string, string];
      }
      return [rw(k), rw(v)] as [string, string];
    });
    // Every layer in the path includes the tested URL context
    if (!rows.some(([k]) => ["url", "tested url"].includes(k.toLowerCase()))) {
      rows.unshift(["Tested URL", displayUrl]);
    }
    if (!rows.some(([k]) => ["host", "hostname"].includes(k.toLowerCase()))) {
      const urlIdx = rows.findIndex(([k]) =>
        ["url", "tested url"].includes(k.toLowerCase()),
      );
      rows.splice(urlIdx + 1, 0, ["Host", nextHost]);
    }
    return {
      ...l,
      summary: rw(l.summary),
      rows,
    };
  });

  return {
    ...report,
    site: nextHost,
    url: nextUrl,
    description: rw(report.description),
    matchedRule: rw(report.matchedRule),
    outcome: rw(report.outcome),
    rulePath,
    factGroups,
    statusLines: nextStatus,
    layers,
  };
}

function ensureHostInBody(body: string, host: string, url: string): string {
  if (body.includes(host) || body.includes(url)) return body;
  return `${body} · ${host}`;
}
