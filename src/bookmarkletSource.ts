/**
 * Self-contained bookmarklet (no imports). Collects Layer-1 page data and
 * shows it on the problem page; can open the diagnostic UI with a hash payload.
 */
export function buildBookmarkletHref(diagnosticBaseUrl: string): string {
  const base = diagnosticBaseUrl.replace(/\/$/, "");
  // Keep this as one expression for javascript: URL
  const body = `
(async()=>{
  const BASE=${JSON.stringify(base)};
  const lim={vp:120,sk:60,rs:80,sc:50};
  const prev=v=>{v=String(v??'');return v.length>lim.vp?v.slice(0,lim.vp)+'…':v;};
  const readStore=s=>{const o=[];try{for(let i=0;i<Math.min(s.length,lim.sk);i++){const k=s.key(i);if(!k)continue;let v='';try{v=s.getItem(k)||'';}catch{v='?';}o.push({key:k,valuePreview:prev(v),bytes:k.length+v.length});}}catch{}return o;};
  const heu=[
    ['data-island*','[data-island], [data-island-id], [data-island-component]'],
    ['class/id island','[class*=\"island\" i], [id*=\"island\" i]'],
    ['watermark/overlay','[class*=\"watermark\" i], [class*=\"overlay\" i], [class*=\"mask\" i]'],
    ['lmc/block','[class*=\"lmc\" i], [class*=\"block-page\" i]'],
    ['island/ext iframes','iframe[src*=\"island\"], iframe[src*=\"chrome-extension\"]']
  ].map(([label,selector])=>{let n=[];try{n=[...document.querySelectorAll(selector)];}catch{}return{label,selector,count:n.length,samples:n.slice(0,4).map(el=> (el.tagName+(el.id?'#'+el.id:'')).slice(0,80));};}).filter(h=>h.count>0);
  let quotaUsage=null,quotaTotal=null;
  try{if(navigator.storage?.estimate){const e=await navigator.storage.estimate();quotaUsage=e.usage??null;quotaTotal=e.quota??null;}}catch{}
  let cacheStorageKeys=[];try{if('caches' in window)cacheStorageKeys=await caches.keys();}catch{}
  let serviceWorkers=[];
  try{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();serviceWorkers=regs.map(r=>{const w=r.active||r.waiting||r.installing;return{scope:r.scope,state:w?.state||'registered',scriptURL:w?.scriptURL||''};});}}catch{}
  const cookies=(()=>{try{return document.cookie||'';}catch{return'';}})();
  const scripts=[...document.querySelectorAll('script')].slice(0,lim.sc).map(s=>({src:s.src||null,inline:!s.src,async:!!s.async,defer:!!s.defer,type:s.type||'text/javascript'}));
  const resources=performance.getEntriesByType('resource').slice(-lim.rs).map(e=>({name:e.name,initiatorType:e.initiatorType,durationMs:Math.round(e.duration),transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,protocol:e.nextHopProtocol||'',deliveryType:e.deliveryType||''}));
  const nav=performance.getEntriesByType('navigation')[0];
  const snap={
    version:1,kind:'layer1',collectedAt:new Date().toISOString(),
    page:{href:location.href,origin:location.origin,hostname:location.hostname,title:document.title||'',referrer:document.referrer||'',visibilityState:document.visibilityState,userAgent:navigator.userAgent,language:navigator.language,online:navigator.onLine},
    storage:{localStorage:readStore(localStorage),sessionStorage:readStore(sessionStorage),cookies,cookieCount:cookies?cookies.split(';').filter(c=>c.trim()).length:0,quotaUsage,quotaTotal},
    dom:{readyState:document.readyState,elementCount:document.getElementsByTagName('*').length,islandHeuristics:heu},
    scripts,resources,
    navigation:nav?{type:nav.type,domContentLoadedMs:Math.round(nav.domContentLoadedEventEnd),loadEventMs:Math.round(nav.loadEventEnd),responseEndMs:Math.round(nav.responseEnd),transferSize:nav.transferSize,encodedBodySize:nav.encodedBodySize}:{type:'unknown',domContentLoadedMs:null,loadEventMs:null,responseEndMs:null,transferSize:null,encodedBodySize:null},
    serviceWorkers,cacheStorageKeys,
    limitations:['Origin-only storage/SW/caches','Non-HttpOnly cookies only','Island DOM hints are heuristic','No extension/policy/connector APIs']
  };
  const json=JSON.stringify(snap,null,2);
  document.getElementById('ipd-l1-overlay')?.remove();
  const wrap=document.createElement('div');
  wrap.id='ipd-l1-overlay';
  wrap.style.cssText='position:fixed;inset:12px;z-index:2147483647;background:#0f1418;color:#e7eef3;font:13px/1.4 ui-sans-serif,system-ui;border:1px solid #3a4650;border-radius:8px;display:flex;flex-direction:column;max-width:920px;margin:0 auto;box-shadow:0 12px 40px rgba(0,0,0,.45)';
  const heuN=heu.reduce((a,h)=>a+h.count,0);
  wrap.innerHTML='<div style=\"padding:12px 14px;border-bottom:1px solid #2a343c;display:flex;gap:8px;align-items:center;flex-wrap:wrap\"><strong style=\"flex:1\">Layer-1 page collect</strong><button data-a=\"copy\" style=\"cursor:pointer\">Copy JSON</button><button data-a=\"open\" style=\"cursor:pointer\">Open in diagnostic</button><button data-a=\"close\" style=\"cursor:pointer\">Close</button></div><div style=\"padding:10px 14px;color:#9aa7b2;font-size:12px\">'+snap.page.href+' · LS '+snap.storage.localStorage.length+' · SS '+snap.storage.sessionStorage.length+' · cookies '+snap.storage.cookieCount+' · scripts '+scripts.length+' · resources '+resources.length+' · Island DOM hits '+heuN+'</div><pre style=\"margin:0;padding:12px 14px;overflow:auto;flex:1;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word\"></pre>';
  wrap.querySelector('pre').textContent=json;
  wrap.onclick=async(ev)=>{
    const t=ev.target.closest('button'); if(!t) return;
    const a=t.getAttribute('data-a');
    if(a==='close'){wrap.remove();return;}
    if(a==='copy'){try{await navigator.clipboard.writeText(json);t.textContent='Copied';}catch{t.textContent='Copy failed';}return;}
    if(a==='open'){
      const bytes=new TextEncoder().encode(JSON.stringify(snap));
      let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b));
      const enc=btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
      const url=BASE+'#l1='+enc;
      if(url.length>700000){alert('Payload too large for URL — use Copy JSON and paste in the diagnostic app.');return;}
      window.open(url,'_blank');
    }
  };
  document.documentElement.appendChild(wrap);
})();
`.replace(/\n/g, "").replace(/\s+/g, " ");

  return `javascript:${encodeURIComponent(body)}`;
}
