import { normalizeTestUrl, parseHost } from "./mockReport";

export type ProbeKind =
  | "ok"
  | "http-error"
  | "cors-opaque"
  | "network-error"
  | "timeout"
  | "invalid-url";

export type LiveProbe = {
  input: string;
  url: string;
  host: string;
  collectedAt: string;
  kind: ProbeKind;
  /** HTTP status when readable (CORS-success responses) */
  httpStatus: number | null;
  /** True when body/headers were readable (not opaque) */
  headersReadable: boolean;
  contentType: string | null;
  redirected: boolean;
  finalUrl: string | null;
  /** Wall time for the probe attempt (ms) */
  elapsedMs: number;
  errorName: string | null;
  errorMessage: string | null;
  online: boolean;
  userAgent: string;
  language: string;
  timezone: string;
  platform: string;
  connectionType: string | null;
  effectiveType: string | null;
  /** Same-origin note when diagnosing the app itself */
  isSameOrigin: boolean;
};

type NavConnection = {
  type?: string;
  effectiveType?: string;
};

const PROBE_TIMEOUT_MS = 12_000;

function connectionInfo(): Pick<LiveProbe, "connectionType" | "effectiveType"> {
  const conn = (
    navigator as Navigator & { connection?: NavConnection }
  ).connection;
  return {
    connectionType: conn?.type ?? null,
    effectiveType: conn?.effectiveType ?? null,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Collect real browser + network observations for a URL.
 * Cannot read Island filter/SWG/policy — those need a privileged collector.
 */
export async function collectLiveProbe(rawInput: string): Promise<LiveProbe> {
  const collectedAt = new Date().toISOString();
  const online = navigator.onLine;
  const baseEnv = {
    collectedAt,
    online,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    platform: navigator.platform || "unknown",
    ...connectionInfo(),
  };

  let url: string;
  try {
    url = normalizeTestUrl(rawInput, rawInput.trim());
    // Validate
    void new URL(url);
  } catch {
    return {
      input: rawInput,
      url: rawInput.trim(),
      host: "",
      kind: "invalid-url",
      httpStatus: null,
      headersReadable: false,
      contentType: null,
      redirected: false,
      finalUrl: null,
      elapsedMs: 0,
      errorName: "InvalidURL",
      errorMessage: "Could not parse URL",
      isSameOrigin: false,
      ...baseEnv,
    };
  }

  const host = parseHost(url);
  let isSameOrigin = false;
  try {
    isSameOrigin = new URL(url).origin === window.location.origin;
  } catch {
    isSameOrigin = false;
  }

  const t0 = performance.now();

  // 1) Prefer a real CORS-visible GET (works for same-origin + many public APIs)
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
      },
      PROBE_TIMEOUT_MS,
    );
    const elapsedMs = Math.round(performance.now() - t0);
    const contentType = res.headers.get("content-type");
    const kind: ProbeKind =
      res.status >= 200 && res.status < 400 ? "ok" : "http-error";
    // Drain a small amount so the request fully completes
    try {
      await res.arrayBuffer();
    } catch {
      /* ignore body read errors */
    }
    return {
      input: rawInput,
      url,
      host,
      kind,
      httpStatus: res.status,
      headersReadable: true,
      contentType,
      redirected: res.redirected,
      finalUrl: res.url || url,
      elapsedMs,
      errorName: null,
      errorMessage: null,
      isSameOrigin,
      ...baseEnv,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    if (name === "AbortError") {
      return {
        input: rawInput,
        url,
        host,
        kind: "timeout",
        httpStatus: null,
        headersReadable: false,
        contentType: null,
        redirected: false,
        finalUrl: null,
        elapsedMs: Math.round(performance.now() - t0),
        errorName: name,
        errorMessage: `Timed out after ${PROBE_TIMEOUT_MS}ms`,
        isSameOrigin,
        ...baseEnv,
      };
    }

    // 2) CORS/network failure — try no-cors (opaque) to see if anything answers
    try {
      const t1 = performance.now();
      const opaque = await fetchWithTimeout(
        url,
        {
          method: "GET",
          mode: "no-cors",
          credentials: "omit",
          cache: "no-store",
        },
        PROBE_TIMEOUT_MS,
      );
      const elapsedMs = Math.round(performance.now() - t1);
      // Opaque responses always report type "opaque" and status 0
      if (opaque.type === "opaque" || opaque.status === 0) {
        return {
          input: rawInput,
          url,
          host,
          kind: "cors-opaque",
          httpStatus: null,
          headersReadable: false,
          contentType: null,
          redirected: false,
          finalUrl: null,
          elapsedMs,
          errorName: name,
          errorMessage:
            "Reachable enough for an opaque response; status/headers hidden by CORS",
          isSameOrigin,
          ...baseEnv,
        };
      }
    } catch (err2) {
      const name2 = err2 instanceof Error ? err2.name : "Error";
      const message2 = err2 instanceof Error ? err2.message : String(err2);
      return {
        input: rawInput,
        url,
        host,
        kind: name2 === "AbortError" ? "timeout" : "network-error",
        httpStatus: null,
        headersReadable: false,
        contentType: null,
        redirected: false,
        finalUrl: null,
        elapsedMs: Math.round(performance.now() - t0),
        errorName: name2,
        errorMessage: message2 || message,
        isSameOrigin,
        ...baseEnv,
      };
    }

    return {
      input: rawInput,
      url,
      host,
      kind: "network-error",
      httpStatus: null,
      headersReadable: false,
      contentType: null,
      redirected: false,
      finalUrl: null,
      elapsedMs: Math.round(performance.now() - t0),
      errorName: name,
      errorMessage: message,
      isSameOrigin,
      ...baseEnv,
    };
  }
}

export function probeOutcomeLabel(probe: LiveProbe): string {
  switch (probe.kind) {
    case "ok":
      return `Reachable · HTTP ${probe.httpStatus}`;
    case "http-error":
      return `HTTP ${probe.httpStatus}`;
    case "cors-opaque":
      return "Opaque response (CORS)";
    case "timeout":
      return "Timeout";
    case "invalid-url":
      return "Invalid URL";
    case "network-error":
    default:
      return "Network error / blocked";
  }
}
