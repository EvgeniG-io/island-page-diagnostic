export type LayerStatus = "ok" | "warn" | "fail" | "na" | "info";

export type LayerId = "page" | "endpoint" | "perf";

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

export type HopKind = "browser" | "network" | "outcome";

export type PathStep = {
  kind: HopKind;
  title: string;
  subtitle?: string;
  tone: LayerStatus;
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
  /** Observed hop-to-hop path */
  rulePath: PathStep[];
  pathTotalMs?: number;
  outcome: string;
  factGroups: FactGroup[];
  statusLines: ReportLine[];
  layers: LayerDetail[];
};

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
