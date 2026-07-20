/** Layer-1 snapshot: everything readable from page JS (no Island / extension APIs). */

export type KeyValuePreview = {
  key: string;
  valuePreview: string;
  bytes: number;
};

export type IslandHeuristicHit = {
  label: string;
  selector: string;
  count: number;
  samples: string[];
};

export type ScriptInfo = {
  src: string | null;
  inline: boolean;
  async: boolean;
  defer: boolean;
  type: string;
};

export type ResourceInfo = {
  name: string;
  initiatorType: string;
  durationMs: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  protocol: string;
  deliveryType: string;
};

export type PageSnapshot = {
  version: 1;
  kind: "layer1";
  collectedAt: string;
  page: {
    href: string;
    origin: string;
    hostname: string;
    title: string;
    referrer: string;
    visibilityState: string;
    userAgent: string;
    language: string;
    online: boolean;
  };
  storage: {
    localStorage: KeyValuePreview[];
    sessionStorage: KeyValuePreview[];
    cookies: string;
    cookieCount: number;
    quotaUsage: number | null;
    quotaTotal: number | null;
  };
  dom: {
    readyState: string;
    elementCount: number;
    islandHeuristics: IslandHeuristicHit[];
  };
  scripts: ScriptInfo[];
  resources: ResourceInfo[];
  navigation: {
    type: string;
    domContentLoadedMs: number | null;
    loadEventMs: number | null;
    responseEndMs: number | null;
    transferSize: number | null;
    encodedBodySize: number | null;
  };
  serviceWorkers: {
    scope: string;
    state: string;
    scriptURL: string;
  }[];
  cacheStorageKeys: string[];
  limitations: string[];
};

const VALUE_PREVIEW = 160;
const MAX_STORAGE_KEYS = 80;
const MAX_RESOURCES = 120;
const MAX_SCRIPTS = 80;

const ISLAND_HEURISTICS: { label: string; selector: string }[] = [
  { label: "data-island*", selector: "[data-island], [data-island-id], [data-island-component]" },
  { label: "class/id contains island", selector: '[class*="island" i], [id*="island" i]' },
  { label: "watermark / overlay hints", selector: '[class*="watermark" i], [class*="overlay" i], [class*="mask" i]' },
  { label: "LMC / block hints", selector: '[class*="lmc" i], [class*="block-page" i], [id*="block" i]' },
  {
    label: "island iframes / pages",
    selector: 'iframe[src*="island"], iframe[src*="chrome-extension"]',
  },
];

function previewValue(value: string): KeyValuePreview["valuePreview"] {
  if (value.length <= VALUE_PREVIEW) return value;
  return `${value.slice(0, VALUE_PREVIEW)}…`;
}

function readStorage(storage: Storage): KeyValuePreview[] {
  const out: KeyValuePreview[] = [];
  try {
    const n = Math.min(storage.length, MAX_STORAGE_KEYS);
    for (let i = 0; i < n; i++) {
      const key = storage.key(i);
      if (!key) continue;
      let value = "";
      try {
        value = storage.getItem(key) ?? "";
      } catch {
        value = "(unreadable)";
      }
      out.push({
        key,
        valuePreview: previewValue(value),
        bytes: key.length + value.length,
      });
    }
  } catch {
    /* blocked / unavailable */
  }
  return out;
}

function collectHeuristics(): IslandHeuristicHit[] {
  return ISLAND_HEURISTICS.map(({ label, selector }) => {
    let nodes: Element[] = [];
    try {
      nodes = Array.from(document.querySelectorAll(selector));
    } catch {
      nodes = [];
    }
    const samples = nodes.slice(0, 5).map((el) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls =
        typeof el.className === "string" && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
          : "";
      return `${tag}${id}${cls}`.slice(0, 120);
    });
    return { label, selector, count: nodes.length, samples };
  }).filter((h) => h.count > 0);
}

function collectScripts(): ScriptInfo[] {
  const nodes = Array.from(document.querySelectorAll("script"));
  return nodes.slice(0, MAX_SCRIPTS).map((s) => ({
    src: s.src || null,
    inline: !s.src,
    async: s.async,
    defer: s.defer,
    type: s.type || "text/javascript",
  }));
}

function collectResources(): ResourceInfo[] {
  const entries = performance.getEntriesByType(
    "resource",
  ) as (PerformanceResourceTiming & { deliveryType?: string })[];
  return entries.slice(-MAX_RESOURCES).map((e) => ({
    name: e.name,
    initiatorType: e.initiatorType,
    durationMs: Math.round(e.duration),
    transferSize: e.transferSize,
    encodedBodySize: e.encodedBodySize,
    decodedBodySize: e.decodedBodySize,
    protocol: e.nextHopProtocol || "",
    deliveryType: e.deliveryType || "",
  }));
}

function collectNavigation(): PageSnapshot["navigation"] {
  const nav = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  if (!nav) {
    return {
      type: "unknown",
      domContentLoadedMs: null,
      loadEventMs: null,
      responseEndMs: null,
      transferSize: null,
      encodedBodySize: null,
    };
  }
  return {
    type: nav.type,
    domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
    loadEventMs: Math.round(nav.loadEventEnd),
    responseEndMs: Math.round(nav.responseEnd),
    transferSize: nav.transferSize,
    encodedBodySize: nav.encodedBodySize,
  };
}

async function collectServiceWorkers(): Promise<PageSnapshot["serviceWorkers"]> {
  if (!("serviceWorker" in navigator)) return [];
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => {
      const w = r.active ?? r.waiting ?? r.installing;
      return {
        scope: r.scope,
        state: w?.state ?? "registered",
        scriptURL: w?.scriptURL ?? "",
      };
    });
  } catch {
    return [];
  }
}

async function collectQuota(): Promise<{
  quotaUsage: number | null;
  quotaTotal: number | null;
}> {
  try {
    if (!navigator.storage?.estimate) {
      return { quotaUsage: null, quotaTotal: null };
    }
    const est = await navigator.storage.estimate();
    return {
      quotaUsage: est.usage ?? null,
      quotaTotal: est.quota ?? null,
    };
  } catch {
    return { quotaUsage: null, quotaTotal: null };
  }
}

/**
 * Collect Layer-1 diagnostics from the current page context.
 * Safe to call from the diagnostic app or from a bookmarklet on the problem page.
 */
export async function collectPageSnapshot(
  win: Window = window,
): Promise<PageSnapshot> {
  const doc = win.document;
  const loc = win.location;
  const quota = await collectQuota();
  let cacheStorageKeys: string[] = [];
  try {
    if ("caches" in win) cacheStorageKeys = await win.caches.keys();
  } catch {
    cacheStorageKeys = [];
  }

  const cookies = (() => {
    try {
      return doc.cookie || "";
    } catch {
      return "";
    }
  })();

  return {
    version: 1,
    kind: "layer1",
    collectedAt: new Date().toISOString(),
    page: {
      href: loc.href,
      origin: loc.origin,
      hostname: loc.hostname,
      title: doc.title || "",
      referrer: doc.referrer || "",
      visibilityState: doc.visibilityState,
      userAgent: win.navigator.userAgent,
      language: win.navigator.language,
      online: win.navigator.onLine,
    },
    storage: {
      localStorage: readStorage(win.localStorage),
      sessionStorage: readStorage(win.sessionStorage),
      cookies,
      cookieCount: cookies
        ? cookies.split(";").filter((c) => c.trim()).length
        : 0,
      quotaUsage: quota.quotaUsage,
      quotaTotal: quota.quotaTotal,
    },
    dom: {
      readyState: doc.readyState,
      elementCount: doc.getElementsByTagName("*").length,
      islandHeuristics: collectHeuristics(),
    },
    scripts: collectScripts(),
    resources: collectResources(),
    navigation: collectNavigation(),
    serviceWorkers: await collectServiceWorkers(),
    cacheStorageKeys,
    limitations: [
      "Current origin only (storage / SW / Cache Storage)",
      "Cookies: non-HttpOnly only (document.cookie)",
      "Island DOM hints are heuristic — not an enumeration of content scripts",
      "Extension state, applied policy, connector/tunnel, full cert chain: not available without Island/extension APIs",
      "Other origins' storage blocked by same-origin policy",
    ],
  };
}

export function encodeSnapshotForHash(snapshot: PageSnapshot): string {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSnapshotFromHash(encoded: string): PageSnapshot | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json) as PageSnapshot;
    if (data?.kind !== "layer1" || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function formatBytes(n: number | null): string {
  if (n == null) return "n/a";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
