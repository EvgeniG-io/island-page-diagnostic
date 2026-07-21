import { normalizeTestUrl, parseHost } from "./reportTypes";

export type ProbeKind =
  | "ok"
  | "http-error"
  | "cors-limited"
  | "network-error"
  | "timeout"
  | "invalid-url";

/** Cache signals readable from HTTP headers + Performance + same-origin APIs */
export type CacheInfo = {
  cacheControl: string | null;
  age: string | null;
  etag: string | null;
  lastModified: string | null;
  expires: string | null;
  pragma: string | null;
  vary: string | null;
  cfCacheStatus: string | null;
  xCache: string | null;
  xCacheHits: string | null;
  transferSize: number | null;
  encodedBodySize: number | null;
  decodedBodySize: number | null;
  deliveryType: string | null;
  browserCacheHint: string;
  forceCacheElapsedMs: number | null;
  forceCacheHint: string | null;
  cacheStorageKeys: string[];
  serviceWorker: string;
};

export type LiveProbe = {
  input: string;
  url: string;
  host: string;
  collectedAt: string;
  kind: ProbeKind;
  httpStatus: number | null;
  headersReadable: boolean;
  contentType: string | null;
  redirected: boolean;
  finalUrl: string | null;
  elapsedMs: number;
  errorName: string | null;
  errorMessage: string | null;
  /** True when network answered (including opaque / CORS-limited). */
  networkReachable: boolean;
  online: boolean;
  userAgent: string;
  language: string;
  timezone: string;
  platform: string;
  connectionType: string | null;
  effectiveType: string | null;
  isSameOrigin: boolean;
  cache: CacheInfo;
};

type NavConnection = {
  type?: string;
  effectiveType?: string;
};

type PerfResource = PerformanceResourceTiming & {
  deliveryType?: string;
};

const PROBE_TIMEOUT_MS = 12_000;

function emptyCache(partial?: Partial<CacheInfo>): CacheInfo {
  return {
    cacheControl: null,
    age: null,
    etag: null,
    lastModified: null,
    expires: null,
    pragma: null,
    vary: null,
    cfCacheStatus: null,
    xCache: null,
    xCacheHits: null,
    transferSize: null,
    encodedBodySize: null,
    decodedBodySize: null,
    deliveryType: null,
    browserCacheHint: "Not measured",
    forceCacheElapsedMs: null,
    forceCacheHint: null,
    cacheStorageKeys: [],
    serviceWorker: "Not checked",
    ...partial,
  };
}

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

function headerOrNull(res: Response, name: string): string | null {
  try {
    return res.headers.get(name);
  } catch {
    return null;
  }
}

function extractCacheHeaders(res: Response): Partial<CacheInfo> {
  return {
    cacheControl: headerOrNull(res, "cache-control"),
    age: headerOrNull(res, "age"),
    etag: headerOrNull(res, "etag"),
    lastModified: headerOrNull(res, "last-modified"),
    expires: headerOrNull(res, "expires"),
    pragma: headerOrNull(res, "pragma"),
    vary: headerOrNull(res, "vary"),
    cfCacheStatus: headerOrNull(res, "cf-cache-status"),
    xCache: headerOrNull(res, "x-cache"),
    xCacheHits: headerOrNull(res, "x-cache-hits"),
  };
}

function browserCacheHintFromPerf(entry: PerfResource | null): string {
  if (!entry) return "No Performance timing entry for this URL";
  if (entry.deliveryType === "cache") {
    return "Browser cache (deliveryType=cache)";
  }
  if (
    entry.transferSize === 0 &&
    (entry.decodedBodySize > 0 || entry.encodedBodySize > 0)
  ) {
    return "Likely browser disk/memory cache (transferSize=0)";
  }
  if (entry.transferSize > 0) {
    return `Network transfer (${entry.transferSize} bytes)`;
  }
  return "Unknown (sizes not exposed — often cross-origin)";
}

function latestResourceEntry(url: string): PerfResource | null {
  const entries = performance.getEntriesByName(url, "resource") as PerfResource[];
  if (entries.length > 0) return entries[entries.length - 1] ?? null;
  const all = performance.getEntriesByType("resource") as PerfResource[];
  const match = all.filter(
    (e) => e.name === url || e.name.startsWith(url) || url.startsWith(e.name),
  );
  return match[match.length - 1] ?? null;
}

async function collectSameOriginCache(): Promise<
  Pick<CacheInfo, "cacheStorageKeys" | "serviceWorker">
> {
  let cacheStorageKeys: string[] = [];
  let serviceWorker = "No serviceWorker API";
  try {
    if ("caches" in window) {
      cacheStorageKeys = await caches.keys();
    }
  } catch {
    cacheStorageKeys = [];
  }
  try {
    if (!("serviceWorker" in navigator)) {
      serviceWorker = "Not supported";
    } else {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) serviceWorker = "None registered (this origin)";
      else {
        const worker = reg.active ?? reg.waiting ?? reg.installing;
        serviceWorker = worker
          ? `${worker.state} · scope ${reg.scope}`
          : `Registered · scope ${reg.scope}`;
      }
    }
  } catch (err) {
    serviceWorker =
      err instanceof Error ? `Error: ${err.message}` : "Error reading SW";
  }
  return { cacheStorageKeys, serviceWorker };
}

async function measureForceCache(url: string): Promise<{
  forceCacheElapsedMs: number | null;
  forceCacheHint: string | null;
}> {
  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "force-cache",
        redirect: "follow",
      },
      PROBE_TIMEOUT_MS,
    );
    try {
      await res.arrayBuffer();
    } catch {
      /* ignore */
    }
    const forceCacheElapsedMs = Math.round(performance.now() - t0);
    const entry = latestResourceEntry(res.url || url);
    const hint = browserCacheHintFromPerf(entry);
    return {
      forceCacheElapsedMs,
      forceCacheHint: `${hint} · ${forceCacheElapsedMs}ms (force-cache)`,
    };
  } catch {
    return {
      forceCacheElapsedMs: null,
      forceCacheHint: "force-cache not readable (CORS)",
    };
  }
}

async function buildCacheInfo(opts: {
  url: string;
  finalUrl: string | null;
  headersReadable: boolean;
  res: Response | null;
  isSameOrigin: boolean;
}): Promise<CacheInfo> {
  const headerPart =
    opts.headersReadable && opts.res ? extractCacheHeaders(opts.res) : {};

  await new Promise((r) => window.setTimeout(r, 0));
  const entry =
    latestResourceEntry(opts.finalUrl || opts.url) ??
    latestResourceEntry(opts.url);

  const force = opts.headersReadable
    ? await measureForceCache(opts.finalUrl || opts.url)
    : {
        forceCacheElapsedMs: null,
        forceCacheHint: "Skipped — response headers not readable",
      };

  const sameOrigin = opts.isSameOrigin
    ? await collectSameOriginCache()
    : {
        cacheStorageKeys: [],
        serviceWorker: "Not available (cross-origin)",
      };

  return emptyCache({
    ...headerPart,
    transferSize: entry?.transferSize ?? null,
    encodedBodySize: entry?.encodedBodySize ?? null,
    decodedBodySize: entry?.decodedBodySize ?? null,
    deliveryType: entry?.deliveryType ?? null,
    browserCacheHint: opts.headersReadable
      ? browserCacheHintFromPerf(entry)
      : "Headers not readable (CORS) — host may still be reachable",
    ...force,
    ...sameOrigin,
  });
}

type Attempt =
  | { ok: true; res: Response; elapsedMs: number }
  | { ok: false; name: string; message: string; elapsedMs: number; timedOut: boolean };

async function attemptFetch(
  url: string,
  mode: RequestMode,
): Promise<Attempt> {
  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        mode,
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
      },
      PROBE_TIMEOUT_MS,
    );
    return { ok: true, res, elapsedMs: Math.round(performance.now() - t0) };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      name,
      message,
      elapsedMs: Math.round(performance.now() - t0),
      timedOut: name === "AbortError",
    };
  }
}

/**
 * Link-prefetch style reachability check when fetch modes disagree.
 * Resolves true if the browser completed a network attempt (load or error
 * from server). Resolves false only on clear failure to start.
 */
function probeWithLink(url: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      link.remove();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(false), ms);
    link.rel = "prefetch";
    link.as = "document";
    link.href = url;
    link.onload = () => finish(true);
    // error often still means the host answered (e.g. HTML not a valid prefetch)
    link.onerror = () => finish(true);
    document.head.appendChild(link);
  });
}

/**
 * Collect real browser + network observations for a URL.
 * CORS failure ≠ unreachable: many sites block cross-origin reads but still load.
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
      networkReachable: false,
      isSameOrigin: false,
      cache: emptyCache({
        browserCacheHint: "n/a — invalid URL",
        serviceWorker: "n/a",
      }),
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

  // 1) Prefer CORS when the site allows it (status + headers readable)
  const cors = await attemptFetch(url, "cors");
  if (cors.ok) {
    const res = cors.res;
    try {
      await res.arrayBuffer();
    } catch {
      /* ignore */
    }
    const kind: ProbeKind =
      res.status >= 200 && res.status < 400 ? "ok" : "http-error";
    const finalUrl = res.url || url;
    const cache = await buildCacheInfo({
      url,
      finalUrl,
      headersReadable: true,
      res,
      isSameOrigin,
    });
    return {
      input: rawInput,
      url,
      host,
      kind,
      httpStatus: res.status,
      headersReadable: true,
      contentType: res.headers.get("content-type"),
      redirected: res.redirected,
      finalUrl,
      elapsedMs: Math.round(performance.now() - t0),
      errorName: null,
      errorMessage: null,
      networkReachable: true,
      isSameOrigin,
      cache,
      ...baseEnv,
    };
  }

  if (cors.timedOut) {
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
      elapsedMs: cors.elapsedMs,
      errorName: cors.name,
      errorMessage: `Timed out after ${PROBE_TIMEOUT_MS}ms`,
      networkReachable: false,
      isSameOrigin,
      cache: emptyCache({
        browserCacheHint: "n/a — probe timed out",
        ...(isSameOrigin
          ? await collectSameOriginCache()
          : {
              cacheStorageKeys: [],
              serviceWorker: "Not available (cross-origin)",
            }),
      }),
      ...baseEnv,
    };
  }

  // 2) no-cors: proves reachability without readable status/headers
  const opaque = await attemptFetch(url, "no-cors");
  if (opaque.ok) {
    // Opaque responses report type "opaque" and status 0 in browsers
    const same = isSameOrigin
      ? await collectSameOriginCache()
      : {
          cacheStorageKeys: [] as string[],
          serviceWorker: "Not available (cross-origin)",
        };
    return {
      input: rawInput,
      url,
      host,
      kind: "cors-limited",
      httpStatus: null,
      headersReadable: false,
      contentType: null,
      redirected: false,
      finalUrl: null,
      elapsedMs: Math.round(performance.now() - t0),
      errorName: null,
      errorMessage:
        "Host answered; HTTP status/headers hidden by CORS (not a network block)",
      networkReachable: true,
      isSameOrigin,
      cache: emptyCache({
        browserCacheHint:
          "Cache headers not readable cross-origin (CORS) — site still reached",
        ...same,
      }),
      ...baseEnv,
    };
  }

  // 3) Last resort: link prefetch — distinguishes DNS/offline from CORS noise
  const linkOk = await probeWithLink(url, 8000);
  if (linkOk) {
    return {
      input: rawInput,
      url,
      host,
      kind: "cors-limited",
      httpStatus: null,
      headersReadable: false,
      contentType: null,
      redirected: false,
      finalUrl: null,
      elapsedMs: Math.round(performance.now() - t0),
      errorName: null,
      errorMessage:
        "Reachability via link prefetch; fetch status/headers not readable",
      networkReachable: true,
      isSameOrigin,
      cache: emptyCache({
        browserCacheHint: "Headers not readable — prefetch reachability only",
        serviceWorker: isSameOrigin
          ? (await collectSameOriginCache()).serviceWorker
          : "Not available (cross-origin)",
      }),
      ...baseEnv,
    };
  }

  return {
    input: rawInput,
    url,
    host,
    kind: opaque.timedOut || cors.timedOut ? "timeout" : "network-error",
    httpStatus: null,
    headersReadable: false,
    contentType: null,
    redirected: false,
    finalUrl: null,
    elapsedMs: Math.round(performance.now() - t0),
    errorName: opaque.name || cors.name,
    errorMessage: opaque.message || cors.message,
    networkReachable: false,
    isSameOrigin,
    cache: emptyCache({
      browserCacheHint: "n/a — host did not respond to probe",
      serviceWorker: isSameOrigin
        ? (await collectSameOriginCache()).serviceWorker
        : "Not available (cross-origin)",
    }),
    ...baseEnv,
  };
}

export function probeOutcomeLabel(probe: LiveProbe): string {
  switch (probe.kind) {
    case "ok":
      return `Reachable · HTTP ${probe.httpStatus}`;
    case "http-error":
      return `Reachable · HTTP ${probe.httpStatus}`;
    case "cors-limited":
      return "Reachable · headers hidden (CORS)";
    case "timeout":
      return "Timeout";
    case "invalid-url":
      return "Invalid URL";
    case "network-error":
    default:
      return "Unreachable from this browser";
  }
}

export function cacheSummary(cache: CacheInfo): string {
  const bits = [
    cache.cfCacheStatus && `CF ${cache.cfCacheStatus}`,
    cache.xCache,
    cache.cacheControl && `Cache-Control: ${cache.cacheControl}`,
    cache.age && `Age ${cache.age}s`,
    cache.browserCacheHint,
  ].filter(Boolean);
  return bits[0] ? bits.slice(0, 2).join(" · ") : cache.browserCacheHint;
}
