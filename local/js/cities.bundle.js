(() => {
  // js/utils.js
  var CATEGORIES = {
    building: { label: "\u5386\u53F2\u5EFA\u7B51", color: "#9a6a10", glyph: "building" },
    port: { label: "\u6E2F\u53E3\u7801\u5934", color: "#0f6e7c", glyph: "anchor" },
    trade: { label: "\u5546\u8D38\u9057\u5740", color: "#d0471f", glyph: "coins" },
    industry: { label: "\u5DE5\u4E1A\u9057\u4EA7", color: "#8a3b2a", glyph: "gear" },
    district: { label: "\u5386\u53F2\u8857\u533A", color: "#6b4fa1", glyph: "roof" },
    ruins: { label: "\u8003\u53E4\u9057\u5740", color: "#2d6b4d", glyph: "arch" }
  };
  function categoryColor(key) {
    return CATEGORIES[key] && CATEGORIES[key].color || "#cccccc";
  }
  function categoryLabel(key) {
    return CATEGORIES[key] && CATEGORIES[key].label || key || "\u5176\u4ED6";
  }
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== null && v !== void 0 && v !== false) {
        node.setAttribute(k, v === true ? "" : v);
      }
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  var qs = (sel, root = document) => root.querySelector(sel);
  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]);
  }
  var _cache = /* @__PURE__ */ new Map();
  function localDataKey(url) {
    try {
      const pathname = decodeURIComponent(new URL(url, location.href).pathname);
      const idx = pathname.lastIndexOf("/data/");
      if (idx >= 0) return pathname.slice(idx + 1);
    } catch (e) {
    }
    return String(url).split("?")[0].replace(/^(\.\.\/|\.\/)+/, "");
  }
  var _chunkPromises = /* @__PURE__ */ new Map();
  function ensureLocalChunk(key) {
    if (!window.__LOCAL_DATA__) window.__LOCAL_DATA__ = {};
    if (Object.prototype.hasOwnProperty.call(window.__LOCAL_DATA__, key)) return Promise.resolve(true);
    if (_chunkPromises.has(key)) return _chunkPromises.get(key);
    const prefix = location.pathname.includes("/pages/") ? "../" : "";
    const p = new Promise((resolve) => {
      const script = document.createElement("script");
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        _chunkPromises.delete(key);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 3e4);
      script.onload = () => finish(true);
      script.onerror = () => finish(false);
      script.src = prefix + key + ".js";
      document.head.appendChild(script);
    });
    _chunkPromises.set(key, p);
    return p;
  }
  async function fetchJSON(url, { signal, noCache = false } = {}) {
    if (!noCache && _cache.has(url)) return _cache.get(url);
    const key = localDataKey(url);
    if (window.__LOCAL_FILE_BUILD__ && !Object.prototype.hasOwnProperty.call(window.__LOCAL_DATA__ || {}, key)) {
      await ensureLocalChunk(key);
    }
    if (window.__LOCAL_DATA__ && Object.prototype.hasOwnProperty.call(window.__LOCAL_DATA__, key)) {
      const data2 = window.__LOCAL_DATA__[key];
      if (!noCache) _cache.set(url, data2);
      return data2;
    }
    const res = await fetch(url, { signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25 ${url}\uFF08HTTP ${res.status}\uFF09`);
    const data = await res.json();
    if (!noCache) _cache.set(url, data);
    return data;
  }
  var APP_VERSION = "16";
  function dataUrl(p) {
    const prefix = location.pathname.includes("/pages/") ? "../" : "";
    const sep = p.includes("?") ? "&" : "?";
    return prefix + "data/" + p + sep + "v=" + APP_VERSION;
  }
  function pageHref(p) {
    const prefix = location.pathname.includes("/pages/") ? "../" : "";
    return prefix + p;
  }
  function formatNumber(n, digits = 0) {
    if (n == null || isNaN(n)) return "-";
    return Number(n).toLocaleString("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }
  function formatArea(sqm) {
    if (sqm == null || isNaN(sqm)) return "-";
    const km2 = sqm / 1e6;
    if (km2 >= 1) return `${formatNumber(km2, 2)} km\xB2`;
    return `${formatNumber(sqm / 1e4, 1)} \u4E07\u33A1`;
  }
  function placeholderDataURI(name = "\u5F71\u50CF\u6682\u7F3A", category = "building", w = 880, h = 560) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 880 560">
  <rect width="${w}" height="${h}" fill="#eef1f4"/>
  <text x="${w / 2}" y="${h / 2 - 6}" text-anchor="middle" font-family="'Noto Serif SC','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="44" font-weight="600" fill="#93a0ab">\u7167\u7247\u6682\u7F3A</text>
  <text x="${w / 2}" y="${h / 2 + 54}" text-anchor="middle" font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="22" fill="#aab4bd">${escapeHtml(name)}</text>
</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function loadImage(imgEl, url, name, category) {
    if (!imgEl) return;
    const fallback = placeholderDataURI(name, category);
    if (!url) {
      imgEl.src = fallback;
      return;
    }
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = fallback;
    };
    imgEl.src = url;
  }
  function normalizeSourceUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url, location.href);
      if (u.protocol === "http:" || u.protocol === "https:") {
        u.pathname = u.pathname.split("/").map((seg) => /%[0-9a-fA-F]{2}/.test(seg) ? seg : encodeURIComponent(decodeURIComponent(seg))).join("/");
        return u.toString();
      }
    } catch (e) {
      return url;
    }
    return url;
  }
  function assetUrl(p) {
    if (!p) return "";
    if (/^(https?:|data:|blob:)/i.test(p)) return p;
    const prefix = location.pathname.includes("/pages/") ? "../" : "";
    return prefix + p.replace(/^\.?\/+/, "");
  }
  function isBaikeUrl(url) {
    return typeof url === "string" && /(^|\.)baike\.baidu\.com/i.test(url);
  }
  var _toastTimer = null;
  function toast(msg, type = "info", ms = 2600) {
    let box = qs("#toast");
    if (!box) {
      box = el("div", { id: "toast", role: "status", "aria-live": "polite" });
      document.body.appendChild(box);
    }
    box.className = `toast toast-${type}`;
    box.textContent = msg;
    box.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => box.classList.remove("show"), ms);
  }
  function showMapError(containerId, err) {
    const c = qs("#" + containerId);
    if (!c) return;
    const overlay = el("div", { class: "map-error", role: "alert" }, [
      el("div", { class: "map-error-box" }, [
        el("h3", { text: "\u5730\u56FE\u52A0\u8F7D\u5F02\u5E38" }),
        el("p", { text: err && err.message || "\u672A\u77E5\u9519\u8BEF" }),
        el("p", { class: "map-error-hint", text: window.__LOCAL_FILE_BUILD__ ? "\u672C\u5730\u6587\u4EF6\u7248\u5730\u56FE\u52A0\u8F7D\u5F02\u5E38\uFF0C\u8BF7\u4F7F\u7528\u6700\u65B0\u7248 Chrome \u6216 Edge \u6253\u5F00 local/index.html\u3002" : "\u8BF7\u786E\u8BA4\u901A\u8FC7\u672C\u5730 HTTP \u670D\u52A1\u5668\u8BBF\u95EE\uFF08\u5982 python -m http.server\uFF09\uFF0C\u800C\u975E file:// \u76F4\u63A5\u6253\u5F00\u3002" })
      ])
    ]);
    c.appendChild(overlay);
  }
  function guardFileProtocol(loadingSelector) {
    if (location.protocol !== "file:") return false;
    if (window.__LOCAL_FILE_BUILD__) return false;
    const loading = loadingSelector ? document.querySelector(loadingSelector) : null;
    if (loading) {
      loading.innerHTML = `
      <div class="file-protocol-warning">
        <strong>\u65E0\u6CD5\u901A\u8FC7 file:// \u76F4\u63A5\u6253\u5F00</strong>
        <p>\u6D4F\u89C8\u5668\u7981\u6B62\u672C\u5730\u6587\u4EF6\u534F\u8BAE\u52A0\u8F7D ES Module \u4E0E JSON/GeoJSON \u6570\u636E\uFF0C\u5BFC\u81F4\u5730\u56FE\u5361\u5728\u6B64\u5904\u3002</p>
        <p>\u8BF7\u901A\u8FC7\u672C\u5730 HTTP \u670D\u52A1\u8FD0\u884C\uFF1A</p>
        <code>python -m http.server 8000</code>
        <p>\u7136\u540E\u8BBF\u95EE <code>http://127.0.0.1:8000/</code>\uFF0C\u6216\u53CC\u51FB\u9879\u76EE\u6839\u76EE\u5F55\u7684 <code>start-server.bat</code>\u3002</p>
      </div>`;
      loading.classList.remove("hide");
    }
    return true;
  }

  // js/main.js
  var BUILD = location.protocol === "file:" ? "" : "20261028b";
  var withBuild = (href) => BUILD ? href + (href.includes("?") ? "&" : "?") + "build=" + BUILD : href;
  var NAV = [
    { href: withBuild("index.html"), label: "\u65F6\u7A7A\u5E8F\u5385", key: "home", index: "01" },
    { href: withBuild("pages/cities.html"), label: "\u56DB\u57CE\u8BB0\u5FC6", key: "cities", index: "02" },
    { href: withBuild("pages/analysis.html"), label: "\u5206\u6790\u5B9E\u9A8C\u5BA4", key: "analysis", index: "03" }
  ];
  function currentKey() {
    const p = location.pathname.split("/").pop() || "index.html";
    const hit = NAV.find((n) => n.href.split("?")[0].split("/").pop() === p);
    return hit ? hit.key : p === "index.html" ? "home" : "";
  }
  function initShell(opts = {}) {
    const header = document.getElementById("site-header");
    if (!header) return;
    const active = currentKey();
    const nav = el("nav", { class: "topnav", "aria-label": "\u4E3B\u5BFC\u822A" }, NAV.map(
      (n) => el("a", {
        href: pageHref(n.href),
        class: "topnav-link" + (n.key === active ? " active" : ""),
        "data-key": n.key,
        "data-index": n.index,
        "aria-current": n.key === active ? "page" : null
      }, n.label)
    ));
    header.innerHTML = "";
    const markUrl = pageHref("assets/brand/shanhai-mark.png");
    header.appendChild(el("a", { class: "brand", href: pageHref(withBuild("index.html")) }, [
      el("span", { class: "brand-mark" }, [
        el("img", { src: markUrl, alt: "", width: 36, height: 36, decoding: "async" })
      ]),
      el("div", { class: "brand-text" }, [
        el("span", { class: "brand-title", text: "\u5C71\u6D77\u65B0\u7BC7" }),
        el("span", { class: "brand-sub", text: "Chronicles of China" })
      ])
    ]));
    header.appendChild(nav);
    const syncHeader = () => {
      header.classList.toggle("scrolled", window.scrollY > 18);
    };
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
    buildFooter();
  }
  function buildFooter() {
    const footer = document.getElementById("site-footer");
    if (!footer) return;
    footer.innerHTML = "";
    footer.appendChild(el("div", { class: "footer-inner" }, [
      el("div", {}, [
        el("div", { class: "footer-brand", text: "\u5C71\u6D77\u65B0\u7BC7" }),
        el("div", { class: "footer-line", text: "\u56DB\u57CE\u8BB0\u5FC6\u4E0E GIS \u65F6\u7A7A\u5206\u6790\u5B9E\u9A8C\u5BA4 \xB7 \u57CE\u5E02\u7A7A\u95F4\u8BB0\u5FC6\u4E0E\u9065\u611F\u6F14\u53D8" })
      ]),
      el("div", { class: "footer-right" }, [
        el("span", { class: "footer-source", text: "AUE 2016 / JRC GHSL / \u516C\u5F00\u7EDF\u8BA1\u4E0E\u53F2\u5FD7\u8D44\u6599" }),
        el("a", { class: "footer-top", href: "#top", text: "\u56DE\u5230\u9876\u90E8" })
      ])
    ]));
  }

  // js/config.js
  var TIANDITU_TK = "0115fe79a0a766de4b4d1ea971fe18c3";
  var TIANDITU_TILE_MAX_ZOOM = 18;
  var TIANDITU_MIN_ZOOM = 2.2;
  var TIANDITU_MAX_ZOOM = 17;
  function tiandituTileURL(layer, z, x, y) {
    const sub = "t" + (x + y) % 8;
    return `https://${sub}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer.split("_")[0]}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=tiles&tk=${TIANDITU_TK}`;
  }

  // js/basemap.js
  var BASE_ONLINE_LAYERS = ["tdt-vec", "tdt-cva"];
  var TDT_VEC_PAINT = {
    "raster-opacity": 0.9,
    "raster-saturation": -0.56,
    "raster-contrast": -0.05,
    "raster-brightness-min": 0.05,
    "raster-brightness-max": 0.99
  };
  var TDT_CVA_PAINT = {
    "raster-opacity": 0.95,
    "raster-saturation": -0.45,
    "raster-contrast": 0.06
  };
  function tdtTiles(layer) {
    const subs = ["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"];
    return subs.map((s) => `tdtQ://${encodeURIComponent(`https://${s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer.split("_")[0]}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${TIANDITU_TK}`)}`);
  }
  var TDT_SCHEME = "tdtQ";
  var TDT_MAX_CONCURRENT = 6;
  var TDT_RETRY_MAX = 3;
  var TDT_RETRY_BASE_MS = 700;
  var TDT_QUEUE_MAX = 128;
  var tdtActive = 0;
  var tdtQueue = [];
  function abortErr() {
    return new DOMException("Aborted", "AbortError");
  }
  function tdtEnqueue(task, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortErr());
      if (tdtQueue.length >= TDT_QUEUE_MAX) {
        const qe = new Error("tdt queue overflow");
        qe.status = 429;
        return reject(qe);
      }
      const job = { task, done: false };
      job.cancel = () => {
        if (job.done) return;
        const idx = tdtQueue.indexOf(job);
        if (idx >= 0) tdtQueue.splice(idx, 1);
        job.done = true;
        job.cleanup();
        reject(abortErr());
      };
      job.cleanup = () => {
        if (signal) Signal_remove(signal, job.cancel);
      };
      job.settle = (err, value) => {
        if (job.done) return;
        job.done = true;
        tdtActive = Math.max(0, tdtActive - 1);
        job.cleanup();
        err ? reject(err) : resolve(value);
        pumpTdt();
      };
      if (signal) signal.addEventListener("abort", job.cancel, { once: true });
      tdtQueue.push(job);
      pumpTdt();
    });
  }
  function Signal_remove(signal, fn) {
    if (signal && typeof signal.removeEventListener === "function") signal.removeEventListener("abort", fn);
  }
  function pumpTdt() {
    while (tdtActive < TDT_MAX_CONCURRENT && tdtQueue.length) {
      const job = tdtQueue.shift();
      tdtActive += 1;
      Promise.resolve().then(() => job.task()).then(
        (v) => job.settle(null, v),
        (e) => job.settle(e)
      );
    }
  }
  async function tdtLoadProtocol(params, abortController) {
    const real = decodeURIComponent(String(params.url || "").slice((TDT_SCHEME + "://").length));
    const signal = abortController ? abortController.signal : void 0;
    for (let attempt = 0; ; attempt++) {
      let buf;
      try {
        if (signal && signal.aborted) throw abortErr();
        buf = await tdtEnqueue(async () => {
          const r = await fetch(real, { signal, credentials: "omit", referrerPolicy: "no-referrer-when-downgrade" });
          if (!r.ok) {
            const err = new Error("tianditu " + r.status);
            err.status = r.status;
            throw err;
          }
          return r.arrayBuffer();
        }, signal);
        if (!buf.byteLength) {
          const err = new Error("tianditu empty");
          err.status = 502;
          throw err;
        }
        noteTdtResult(true);
        return { data: buf };
      } catch (err) {
        if (signal && signal.aborted) throw abortErr();
        const status = err && err.status;
        const retriable = attempt < TDT_RETRY_MAX && (status === 429 || status >= 500 && status <= 599 || status === void 0);
        if (status === void 0 || status >= 400 && status <= 599 || status === 429) noteTdtResult(false);
        if (!retriable) throw err;
        await new Promise((r) => setTimeout(r, TDT_RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  function registerTdtProtocol() {
    if (typeof maplibregl === "undefined" || typeof maplibregl.addProtocol !== "function") return;
    if (maplibregl.__wbTdtThrottled) return;
    maplibregl.__wbTdtThrottled = true;
    maplibregl.addProtocol(TDT_SCHEME, tdtLoadProtocol);
  }
  registerTdtProtocol();
  var TDT_STALL_FAILS = 8;
  var TDT_STALL_WINDOW_MS = 1e4;
  var TDT_RECOVER_PROBES = 2;
  var TDT_PROBE_INTERVAL_MS = 6e4;
  var WB_FALLBACK_CHAIN = [
    {
      id: "wb-esr",
      label: "Esri \u7070\u5E95 Canvas",
      attr: "\xA9 Esri \xB7 World Light Gray Canvas",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
      maxzoom: 16,
      probe: { z: 9, y: 223, x: 419 }
    },
    {
      id: "wb-hot",
      label: "OSM FR HOT \u74E6\u7247",
      attr: "\xA9 OpenStreetMap contributors \xB7 \u98CE\u683C HOT\uFF08Humanitarian OSM Team\uFF09via openstreetmap.fr",
      tiles: ["a", "b", "c"].map((s) => `https://${s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`),
      maxzoom: 19,
      probe: { z: 9, y: 223, x: 419 }
    },
    {
      id: "wb-osm",
      label: "OSM \u5B98\u65B9\u6807\u51C6\u74E6\u7247",
      attr: "\xA9 OpenStreetMap contributors",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      maxzoom: 19,
      probe: { z: 9, y: 223, x: 419 }
    }
  ];
  var WB_FALLBACK_PAINT = { "raster-opacity": 0.92, "raster-saturation": -0.35, "raster-contrast": -0.03 };
  var TDT_FALLBACK_TIMEOUT_MS = 3e3;
  var basemapWatchers = /* @__PURE__ */ new Set();
  var tdtHealth = { fails: [], swapped: false, probeWins: 0, probeTimer: null, chainIdx: 0 };
  function wbFallbackSourceId(idx) {
    return WB_FALLBACK_CHAIN[idx].id;
  }
  function wbProbeUrl(item) {
    return item.tiles[0].replace("{z}", item.probe ? item.probe.z : 5).replace("{x}", item.probe ? item.probe.x : 13).replace("{y}", item.probe ? item.probe.y : 6);
  }
  function pickFallbackIdx() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (i) => {
        if (!done) {
          done = true;
          resolve(i);
        }
      };
      WB_FALLBACK_CHAIN.forEach((item, i) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TDT_FALLBACK_TIMEOUT_MS);
        fetch(wbProbeUrl(item), { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer-when-downgrade" }).then((res) => {
          clearTimeout(timer);
          const ct = res.headers.get("content-type") || "";
          if (res.ok && ct.indexOf("image/") === 0) finish(i);
        }).catch(() => clearTimeout(timer));
      });
      setTimeout(() => finish(0), TDT_FALLBACK_TIMEOUT_MS + 120);
    });
  }
  function ensureFallbackSources(map2) {
    const anchor = ["bu3d-city-ov", "bu3d-city", "tdt-vec", "tdt-cva"].find((id) => map2.getLayer(id)) || void 0;
    for (const item of WB_FALLBACK_CHAIN) {
      if (!map2.getSource(item.id)) {
        map2.addSource(item.id, {
          type: "raster",
          tiles: item.tiles,
          tileSize: 256,
          minzoom: 0,
          maxzoom: item.maxzoom,
          attribution: item.attr
        });
      }
      if (!map2.getLayer(item.id)) {
        map2.addLayer({ id: item.id, type: "raster", source: item.id, paint: WB_FALLBACK_PAINT, layout: { visibility: "none" } }, anchor);
      }
    }
  }
  function swapMapBasemap(map2, on) {
    ensureFallbackSources(map2);
    for (const item of WB_FALLBACK_CHAIN) {
      if (map2.getLayer(item.id)) {
        const want = on && item.id === wbFallbackSourceId(tdtHealth.chainIdx) ? "visible" : "none";
        map2.setLayoutProperty(item.id, "visibility", want);
      }
    }
    for (const id of BASE_ONLINE_LAYERS) {
      if (map2.getLayer(id)) map2.setLayoutProperty(id, "visibility", on ? "none" : "visible");
    }
  }
  function announceFallback(on, detail) {
    try {
      document.dispatchEvent(new CustomEvent("wb-basemap-fallback", { detail: Object.assign({ fallback: on }, detail || {}) }));
    } catch (e) {
    }
  }
  function flushTdtQueue(reason) {
    if (!tdtQueue.length) return;
    const queued = tdtQueue.splice(0, tdtQueue.length);
    for (const job of queued) {
      try {
        job.cancel();
      } catch (e) {
      }
    }
  }
  function wbTileUrl(item, z, x, y) {
    return item.tiles[(x + y) % item.tiles.length].replace("{z}", z).replace("{x}", x).replace("{y}", y);
  }
  function wbViewportTileUrls(map2, item) {
    const urls = [];
    try {
      const z = Math.max(2, Math.min(item.maxzoom, Math.ceil(Math.max(0, map2.getZoom()))));
      const c = map2.getCenter();
      const lat = Math.max(-85, Math.min(85, c.lat));
      const n = 1 << z;
      const xt = Math.floor((c.lng + 180) / 360 * n);
      const s = Math.sin(lat * Math.PI / 180);
      const yt = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = xt + dx, y = yt + dy;
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          urls.push(wbTileUrl(item, z, x, y));
        }
      }
    } catch (e) {
    }
    return urls;
  }
  async function warmViewportTiles(item) {
    const jobs = [];
    for (const map2 of basemapWatchers) {
      for (const url of wbViewportTileUrls(map2, item)) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4e3);
        jobs.push(fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer-when-downgrade" }).catch(() => {
        }).finally(() => clearTimeout(timer)));
      }
    }
    if (!jobs.length) return;
    const cap = new Promise((r) => setTimeout(r, 3e3));
    await Promise.race([Promise.allSettled(jobs), cap]);
  }
  async function swapToFallback() {
    flushTdtQueue("fallback");
    let idx = 0;
    try {
      idx = await pickFallbackIdx();
    } catch (e) {
    }
    tdtHealth.chainIdx = idx;
    await warmViewportTiles(WB_FALLBACK_CHAIN[idx]).catch(() => {
    });
    for (const map2 of basemapWatchers) {
      try {
        swapMapBasemap(map2, true);
      } catch (e) {
      }
    }
    const item = WB_FALLBACK_CHAIN[tdtHealth.chainIdx];
    announceFallback(true, { name: item.label, attr: item.attr });
  }
  function startRecoveryProbe() {
    if (tdtHealth.probeTimer) return;
    tdtHealth.probeWins = 0;
    tdtHealth.probeTimer = setInterval(async () => {
      try {
        window.__tdtProbeTicks = (window.__tdtProbeTicks || 0) + 1;
      } catch (e) {
      }
      if (!tdtHealth.swapped) {
        stopRecoveryProbe();
        return;
      }
      if (navigator.onLine === false) return;
      try {
        const ok = await probeOnlineAvailable(6e3);
        if (ok) {
          tdtHealth.probeWins += 1;
          if (tdtHealth.probeWins >= TDT_RECOVER_PROBES) {
            tdtHealth.swapped = false;
            stopRecoveryProbe();
            for (const map2 of basemapWatchers) {
              try {
                swapMapBasemap(map2, false);
              } catch (e) {
              }
            }
            announceFallback(false);
          }
        } else {
          tdtHealth.probeWins = 0;
        }
      } catch (e) {
      }
    }, TDT_PROBE_INTERVAL_MS);
  }
  function stopRecoveryProbe() {
    if (tdtHealth.probeTimer) {
      clearInterval(tdtHealth.probeTimer);
      tdtHealth.probeTimer = null;
    }
    tdtHealth.probeWins = 0;
  }
  function noteTdtResult(ok) {
    const now = Date.now();
    if (ok) {
      if (!tdtHealth.swapped) return;
      return;
    }
    tdtHealth.fails.push(now);
    while (tdtHealth.fails.length && now - tdtHealth.fails[0] > TDT_STALL_WINDOW_MS) tdtHealth.fails.shift();
    if (!tdtHealth.swapped && tdtHealth.fails.length >= TDT_STALL_FAILS) {
      tdtHealth.swapped = true;
      swapToFallback();
      startRecoveryProbe();
    }
  }
  function watchBasemapHealth(map2) {
    if (!map2 || basemapWatchers.has(map2)) return;
    basemapWatchers.add(map2);
    if (tdtHealth.swapped) {
      try {
        swapMapBasemap(map2, true);
      } catch (e) {
      }
    }
    const onRemove = () => {
      basemapWatchers.delete(map2);
      try {
        map2.off("remove", onRemove);
      } catch (e) {
      }
      if (!basemapWatchers.size) {
        tdtHealth.swapped = false;
        stopRecoveryProbe();
      }
    };
    try {
      map2.on("remove", onRemove);
    } catch (e) {
    }
  }
  function buildOnlineStyle() {
    return {
      version: 8,
      sources: {},
      layers: [
        { id: "tdt-bg", type: "background", paint: { "background-color": "#f3ede2" } }
      ]
    };
  }
  async function setupBasemap(map2) {
    await waitMapReady(map2);
    if (!mapReady(map2)) return;
    try {
      if (typeof map2.setMinZoom === "function") map2.setMinZoom(TIANDITU_MIN_ZOOM);
      if (typeof map2.setMaxZoom === "function") map2.setMaxZoom(TIANDITU_MAX_ZOOM);
    } catch (e) {
    }
    if (!map2.getSource("tdt-vec")) {
      map2.addSource("tdt-vec", {
        type: "raster",
        tiles: tdtTiles("vec_w"),
        tileSize: 256,
        minzoom: 1,
        maxzoom: TIANDITU_TILE_MAX_ZOOM
      });
    }
    if (!map2.getSource("tdt-cva")) {
      map2.addSource("tdt-cva", {
        type: "raster",
        tiles: tdtTiles("cva_w"),
        tileSize: 256,
        minzoom: 1,
        maxzoom: TIANDITU_TILE_MAX_ZOOM
      });
    }
    if (!map2.getLayer("tdt-vec")) {
      map2.addLayer({ id: "tdt-vec", type: "raster", source: "tdt-vec", paint: TDT_VEC_PAINT });
    }
    if (!map2.getLayer("tdt-cva")) {
      map2.addLayer({ id: "tdt-cva", type: "raster", source: "tdt-cva", paint: TDT_CVA_PAINT });
    }
    watchBasemapHealth(map2);
  }
  function bindZoomLimitControl(map2, hostEl) {
    if (!map2) return;
    const sync = () => {
      try {
        const z = map2.getZoom();
        const maxZ = typeof map2.getMaxZoom === "function" ? map2.getMaxZoom() : TIANDITU_MAX_ZOOM;
        const minZ = typeof map2.getMinZoom === "function" ? map2.getMinZoom() : TIANDITU_MIN_ZOOM;
        const atMax = z >= maxZ - 0.01;
        const atMin = z <= minZ + 0.01;
        const root = hostEl || map2.getContainer && map2.getContainer().parentElement || map2.getContainer && map2.getContainer();
        if (!root) return;
        const btnIn = root.querySelector(".maplibregl-ctrl-zoom-in");
        const btnOut = root.querySelector(".maplibregl-ctrl-zoom-out");
        if (btnIn) {
          btnIn.disabled = atMax;
          btnIn.setAttribute("aria-disabled", atMax ? "true" : "false");
          const tip = atMax ? `\u5DF2\u8FBE\u5929\u5730\u56FE\u6700\u5927\u7F29\u653E\u7EA7\u522B\uFF08Z${maxZ} / \u74E6\u724718\u7EA7\uFF09` : "\u653E\u5927";
          btnIn.title = tip;
          btnIn.setAttribute("aria-label", tip);
        }
        if (btnOut) {
          btnOut.disabled = atMin;
          btnOut.setAttribute("aria-disabled", atMin ? "true" : "false");
        }
      } catch (e) {
      }
    };
    map2.on("zoom", sync);
    map2.on("zoomend", sync);
    map2.on("load", sync);
    setTimeout(sync, 60);
  }
  function formatZoomReadout(map2) {
    const z = map2.getZoom();
    const maxZ = typeof map2.getMaxZoom === "function" ? map2.getMaxZoom() : TIANDITU_MAX_ZOOM;
    return z >= maxZ - 0.01 ? `${z.toFixed(2)} (\u4E0A\u9650)` : z.toFixed(2);
  }
  async function probeOnlineAvailable(timeoutMs = 3e3) {
    try {
      const url = tiandituTileURL("vec_w", 4, 12, 6);
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetch(url, { method: "GET", signal: ctrl ? ctrl.signal : void 0 });
      if (timer) clearTimeout(timer);
      if (!res.ok) return false;
      const buf = await res.arrayBuffer();
      const ct = res.headers.get("content-type") || "";
      return buf.byteLength > 500 && ct.indexOf("image") !== -1;
    } catch (e) {
      return false;
    }
  }
  function basemapLabel() {
    return "\u5929\u5730\u56FE \xB7 GS(2023)336\u53F7";
  }
  function mapReady(map2) {
    if (!map2 || map2._wbRemoved) return false;
    if (map2.style === void 0) return false;
    try {
      return !map2.isStyleLoaded || map2.isStyleLoaded();
    } catch (e) {
      return false;
    }
  }
  function waitMapReady(map2, timeoutMs = 8e3) {
    return new Promise((resolve) => {
      const ok = () => {
        try {
          return map2 && !map2._wbRemoved && map2.isStyleLoaded && map2.isStyleLoaded();
        } catch (e) {
          return false;
        }
      };
      if (ok()) return resolve();
      const t0 = Date.now();
      const tick = () => {
        if (ok() || Date.now() - t0 > timeoutMs) return resolve();
        setTimeout(tick, 90);
      };
      tick();
    });
  }

  // js/map.js
  var map = null;
  var loadPromise = null;
  var CHINA_CENTER = [104.5, 35.5];
  var CHINA_ZOOM = 3.1;
  function isMapReady() {
    return !!(map && !map._wbRemoved && map._wbLoaded);
  }
  function createMap(containerId, options = {}) {
    if (map && !map._wbRemoved) {
      if (options.onLoad) safeOnLoad(options.onLoad);
      return map;
    }
    const initZoom = Math.min(TIANDITU_MAX_ZOOM, Math.max(TIANDITU_MIN_ZOOM, options.zoom || CHINA_ZOOM));
    map = new maplibregl.Map({
      container: containerId,
      style: buildOnlineStyle(),
      center: options.center || CHINA_CENTER,
      zoom: initZoom,
      minZoom: TIANDITU_MIN_ZOOM,
      maxZoom: TIANDITU_MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      antialias: true
    });
    map._wbRemoved = false;
    map._wbLoaded = false;
    map._basemapMode = "online";
    if (typeof window !== "undefined") window.__wbMap = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 108, unit: "metric" }), "bottom-right");
    bindZoomLimitControl(map);
    map.on("error", (e) => {
      const msg = e && e.error && e.error.message || "";
      const src = e && e.sourceId || "";
      const isTileErr = /tianditu|tile|raster|GetTile|429|Too Many Requests/i.test(msg + " " + src);
      if (!isTileErr) console.warn("[map] \u975E\u81F4\u547D\u9519\u8BEF:", msg || e);
    });
    loadPromise = new Promise((resolve) => {
      map.on("load", async () => {
        try {
          await setupBasemap(map);
          map._wbLoaded = true;
          probeOnlineAvailable().then((ok) => {
            if (!ok) {
              showBasemapBanner("\u5929\u5730\u56FE\u5728\u7EBF\u74E6\u7247\u6682\u4E0D\u53EF\u8BBF\u95EE\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u6216\u5BC6\u94A5\u72B6\u6001\u3002");
            } else {
              hideBasemapBanner();
            }
          }).catch(() => {
          });
          resolve(map);
          if (options.onLoad) options.onLoad(map);
        } catch (err) {
          showMapError(containerId, err);
          resolve(null);
        }
      });
    });
    return map;
  }
  function showBasemapBanner(msg) {
    try {
      let bar = document.getElementById("basemap-banner");
      const host = map && map.getContainer && map.getContainer().closest("#map-root, #map-slot, #map-buf-root, .map-root, .swipe-wrap") || document.querySelector("#map-root, #map-slot, .map-root, .map-shell") || document.body;
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "basemap-banner";
        bar.className = "basemap-banner";
        host.appendChild(bar);
      } else if (bar.parentElement !== host) {
        host.appendChild(bar);
      }
      bar.textContent = msg;
      bar.setAttribute("role", "status");
      bar.setAttribute("aria-live", "polite");
      bar.classList.add("show");
      clearTimeout(bar._t);
      bar._t = setTimeout(() => bar.classList.remove("show"), 5500);
    } catch (e) {
    }
  }
  function hideBasemapBanner() {
    const bar = document.getElementById("basemap-banner");
    if (bar) {
      clearTimeout(bar._t);
      bar.classList.remove("show");
    }
  }
  function safeOnLoad(fn) {
    if (isMapReady()) fn(map);
    else if (loadPromise) loadPromise.then((m) => {
      if (m) fn(m);
    });
  }
  function whenReady(fn) {
    if (loadPromise) loadPromise.then((m) => {
      if (m) fn(m);
    });
    else if (fn) fn(map);
  }
  function attachStatusBar(containerId, opts = {}) {
    const host = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    const m = map;
    if (!host || !m || m._sbAttached) return;
    m._sbAttached = true;
    const bar = document.createElement("div");
    bar.className = "map-statusbar";
    bar.innerHTML = `
    <div class="msb-item"><span class="msb-label">\u4E2D\u5FC3\u70B9</span><span class="msb-value" data-sb="center">-</span></div>
    <div class="msb-item"><span class="msb-label">\u7F29\u653E</span><span class="msb-value" data-sb="zoom">-</span></div>
    <div class="msb-item"><span class="msb-label">\u6BD4\u4F8B\u5C3A</span><span class="msb-value" data-sb="scale">-</span></div>
    <div class="msb-item"><span class="msb-label">\u5206\u8FA8\u7387</span><span class="msb-value" data-sb="res">-</span></div>
    <div class="msb-spacer"></div>
    <div class="msb-item"><span class="msb-credit">${opts.credit || basemapLabel()}</span></div>`;
    host.appendChild(bar);
    const centerEl = bar.querySelector('[data-sb="center"]');
    const zoomEl = bar.querySelector('[data-sb="zoom"]');
    const scaleEl = bar.querySelector('[data-sb="scale"]');
    const resEl = bar.querySelector('[data-sb="res"]');
    const M_PER_PX_AT_EQ = 156543.03392;
    const update = () => {
      try {
        const c = m.getCenter();
        const z = m.getZoom();
        centerEl.textContent = `${Math.abs(c.lat).toFixed(4)}\xB0${c.lat >= 0 ? "N" : "S"} ${Math.abs(c.lng).toFixed(4)}\xB0${c.lng >= 0 ? "E" : "W"}`;
        zoomEl.textContent = formatZoomReadout(m);
        const latFactor = Math.max(0.05, Math.cos(c.lat * Math.PI / 180));
        const metersPerPx = M_PER_PX_AT_EQ * latFactor / Math.pow(2, z);
        const pxPerCm = 96 / 2.54;
        const groundPerCm = metersPerPx * pxPerCm;
        let sVal = groundPerCm, sUnit = "m";
        if (sVal >= 1e3) {
          sVal /= 1e3;
          sUnit = "km";
        }
        scaleEl.textContent = `1cm \u2248 ${sVal >= 100 ? Math.round(sVal) : sVal.toFixed(sVal < 10 ? 2 : 1)} ${sUnit}`;
        const denom = metersPerPx / (0.0254 / 96);
        resEl.textContent = `${metersPerPx >= 1 ? metersPerPx.toFixed(1) : metersPerPx.toFixed(3)} m/px \xB7 1:${Math.round(denom).toLocaleString("en-US")}`;
      } catch (e) {
      }
    };
    m.on("move", update);
    m.on("zoom", update);
    update();
  }
  var LAYER_ORDER = [
    "tdt-vec",
    "choropleth-fill",
    "gs-wms-layer",
    "bu-lyr",
    "newbu-lyr",
    "buffer-fill",
    "tdt-cva",
    "bu-casing",
    "bu-line",
    "newbu-line",
    "buffer-half-line",
    "buffer-casing",
    "buffer-line",
    "buffer-spokes",
    "reform-flow-line",
    "wfs-halo-layer",
    "sel-region-fill",
    "sel-region-line",
    "buffer-hit-halo",
    "buf-center-outer",
    "buf-center-inner",
    "active-pin-halo",
    "active-pin-ring",
    "heritage-label",
    "reform-label",
    "heritage-cluster",
    "heritage-symbol",
    "reform-symbol",
    "query-sel-symbol",
    "measure-poly",
    "measure-line",
    "measure-pts"
  ];
  function restackLayers(m) {
    const target = m || map;
    if (!target || !target.style || !target.moveLayer) return;
    LAYER_ORDER.forEach((id) => {
      if (target.getLayer(id)) target.moveLayer(id);
    });
  }
  function getOpticalPadding(targetMap) {
    const m = targetMap || map;
    if (!m || !m.getContainer) return { top: 20, right: 20, bottom: 32, left: 20 };
    const container = m.getContainer();
    const cw = container ? container.clientWidth : 0;
    if (cw < 680) return { top: 16, right: 16, bottom: 32, left: 16 };
    const root = container.closest(".map-root, .lab-map") || document;
    const lp = root.querySelector(".layer-panel");
    const lpOpen = lp && !lp.classList.contains("is-collapsed") && lp.offsetWidth > 60;
    return {
      top: 24,
      right: 28,
      bottom: 38,
      left: lpOpen ? Math.min(230, lp.offsetWidth + 24) : 28
    };
  }
  function flyTo(opts) {
    if (!map) return;
    const next = { ...opts };
    if (typeof next.zoom === "number") {
      next.zoom = Math.min(TIANDITU_MAX_ZOOM, Math.max(TIANDITU_MIN_ZOOM, next.zoom));
    }
    map.easeTo({ essential: true, duration: 1100, ...next });
  }
  function flyToCity(center, zoom = 10.5) {
    flyTo({ center, zoom, padding: getOpticalPadding(map), duration: 1200 });
  }
  function destroyMap() {
    if (map && !map._wbRemoved) {
      try {
        map.remove();
      } catch (e) {
      }
      map._wbRemoved = true;
      map = null;
      loadPromise = null;
    }
  }
  function bindLifecycle() {
    const cleanup = () => destroyMap();
    window.addEventListener("pagehide", cleanup);
    window.addEventListener("beforeunload", cleanup);
  }

  // js/layers.js
  var REFORM_COLORS = {
    "\u5386\u53F2\u8F6C\u6298": "#9a6a10",
    "\u7ECF\u6D4E\u7279\u533A": "#0f6e7c",
    "\u6CBF\u6D77\u5F00\u653E": "#d0471f",
    "\u5F00\u53D1\u533A": "#6b4fa1",
    "\u5165\u4E16": "#2d6b4d",
    "\u5236\u5EA6\u521B\u65B0": "#a3345c",
    "\u81EA\u8D38\u533A": "#1f5f9e"
  };
  function reformColor(t) {
    return REFORM_COLORS[t] || "#888888";
  }
  function mapReady2(map2) {
    if (!map2 || map2._wbRemoved) return false;
    if (map2.style === void 0) return false;
    try {
      return !map2.isStyleLoaded || map2.isStyleLoaded();
    } catch (e) {
      return false;
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hexToRgba(hex, alpha) {
    const m = String(hex || "").replace("#", "");
    if (m.length !== 6) return `rgba(9,11,17,${alpha})`;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function makeChip(drawGlyph, color, variant = "heritage", size = 72) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    const p = 7;
    const box = size - p * 2;
    const r = variant === "reform" ? 6 : 10;
    ctx.save();
    ctx.shadowColor = "rgba(9, 11, 17, 0.24)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2.5;
    roundRect(ctx, p, p, box, box, r);
    ctx.fillStyle = "#fffdf9";
    ctx.fill();
    ctx.restore();
    if (variant === "reform") {
      ctx.save();
      roundRect(ctx, p, p, box, box, r);
      ctx.clip();
      ctx.fillStyle = hexToRgba(color, 0.1);
      ctx.fillRect(p, p, box, box);
      ctx.fillStyle = color;
      ctx.fillRect(p, p, box, 6.5);
      ctx.restore();
      roundRect(ctx, p, p, box, box, r);
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      roundRect(ctx, p, p, box, box, r);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      roundRect(ctx, p + 4, p + 4, box - 8, box - 8, Math.max(3, r - 3));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = hexToRgba(color, 0.28);
      ctx.stroke();
    }
    ctx.save();
    if (variant === "reform") ctx.translate(0, 2);
    drawGlyph(ctx, size, color);
    ctx.restore();
    return ctx.getImageData(0, 0, size, size);
  }
  function strokeIcon(ctx, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  function star(ctx, cx, cy, R, r, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const ang = Math.PI / points * i - Math.PI / 2;
      const rad = i % 2 === 0 ? R : r;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  var GLYPH = {
    building(ctx, s, color) {
      strokeIcon(ctx, color);
      ctx.beginPath();
      ctx.moveTo(s * 0.25, s * 0.43);
      ctx.lineTo(s * 0.5, s * 0.27);
      ctx.lineTo(s * 0.75, s * 0.43);
      ctx.moveTo(s * 0.3, s * 0.47);
      ctx.lineTo(s * 0.3, s * 0.71);
      ctx.lineTo(s * 0.7, s * 0.71);
      ctx.lineTo(s * 0.7, s * 0.47);
      for (const x of [s * 0.39, s * 0.5, s * 0.61]) {
        ctx.moveTo(x, s * 0.5);
        ctx.lineTo(x, s * 0.71);
      }
      ctx.stroke();
    },
    port(ctx, s, color) {
      strokeIcon(ctx, color);
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.31, s * 0.055, 0, Math.PI * 2);
      ctx.moveTo(s * 0.5, s * 0.37);
      ctx.lineTo(s * 0.5, s * 0.71);
      ctx.moveTo(s * 0.36, s * 0.45);
      ctx.lineTo(s * 0.64, s * 0.45);
      ctx.moveTo(s * 0.31, s * 0.6);
      ctx.quadraticCurveTo(s * 0.5, s * 0.8, s * 0.69, s * 0.6);
      ctx.stroke();
    },
    trade(ctx, s, color) {
      strokeIcon(ctx, color);
      for (const [x, y, r] of [[0.39, 0.41, 0.1], [0.61, 0.41, 0.1], [0.5, 0.6, 0.1]]) {
        ctx.beginPath();
        ctx.arc(s * x, s * y, s * r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    industry(ctx, s, color) {
      strokeIcon(ctx, color);
      ctx.beginPath();
      ctx.moveTo(s * 0.25, s * 0.72);
      ctx.lineTo(s * 0.25, s * 0.51);
      ctx.lineTo(s * 0.38, s * 0.43);
      ctx.lineTo(s * 0.38, s * 0.52);
      ctx.lineTo(s * 0.51, s * 0.44);
      ctx.lineTo(s * 0.51, s * 0.53);
      ctx.lineTo(s * 0.63, s * 0.46);
      ctx.lineTo(s * 0.63, s * 0.72);
      ctx.closePath();
      ctx.moveTo(s * 0.7, s * 0.32);
      ctx.lineTo(s * 0.7, s * 0.72);
      ctx.moveTo(s * 0.25, s * 0.72);
      ctx.lineTo(s * 0.74, s * 0.72);
      ctx.stroke();
    },
    district(ctx, s, color) {
      strokeIcon(ctx, color);
      for (const x of [s * 0.26, s * 0.52]) {
        ctx.beginPath();
        ctx.moveTo(x, s * 0.47);
        ctx.lineTo(x + s * 0.11, s * 0.35);
        ctx.lineTo(x + s * 0.22, s * 0.47);
        ctx.moveTo(x, s * 0.47);
        ctx.lineTo(x, s * 0.71);
        ctx.lineTo(x + s * 0.22, s * 0.71);
        ctx.lineTo(x + s * 0.22, s * 0.47);
        ctx.moveTo(x + s * 0.09, s * 0.6);
        ctx.lineTo(x + s * 0.09, s * 0.71);
        ctx.stroke();
      }
    },
    ruins(ctx, s, color) {
      strokeIcon(ctx, color);
      for (const x of [s * 0.32, s * 0.5, s * 0.68]) {
        ctx.beginPath();
        ctx.moveTo(x, s * 0.45);
        ctx.lineTo(x, s * 0.67);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(s * 0.26, s * 0.39);
      ctx.lineTo(s * 0.74, s * 0.39);
      ctx.moveTo(s * 0.26, s * 0.72);
      ctx.lineTo(s * 0.74, s * 0.72);
      ctx.moveTo(s * 0.26, s * 0.32);
      ctx.lineTo(s * 0.43, s * 0.32);
      ctx.moveTo(s * 0.57, s * 0.32);
      ctx.lineTo(s * 0.74, s * 0.32);
      ctx.stroke();
    }
  };
  var RGLYPH = {
    "\u5386\u53F2\u8F6C\u6298": (ctx, s, color) => {
      strokeIcon(ctx, color);
      ctx.beginPath();
      ctx.moveTo(s * 0.35, s * 0.28);
      ctx.lineTo(s * 0.35, s * 0.73);
      ctx.moveTo(s * 0.35, s * 0.31);
      ctx.lineTo(s * 0.67, s * 0.39);
      ctx.lineTo(s * 0.35, s * 0.49);
      ctx.closePath();
      ctx.stroke();
    },
    "\u7ECF\u6D4E\u7279\u533A": (ctx, s, color) => {
      ctx.fillStyle = color;
      star(ctx, s / 2, s / 2, s * 0.2, s * 0.09, 5);
    },
    "\u6CBF\u6D77\u5F00\u653E": (ctx, s, color) => {
      strokeIcon(ctx, color);
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.29);
      ctx.lineTo(s * 0.5, s * 0.57);
      ctx.moveTo(s * 0.5, s * 0.31);
      ctx.lineTo(s * 0.67, s * 0.53);
      ctx.lineTo(s * 0.5, s * 0.53);
      ctx.closePath();
      ctx.moveTo(s * 0.28, s * 0.61);
      ctx.lineTo(s * 0.72, s * 0.61);
      ctx.lineTo(s * 0.65, s * 0.7);
      ctx.lineTo(s * 0.35, s * 0.7);
      ctx.closePath();
      ctx.moveTo(s * 0.28, s * 0.77);
      ctx.quadraticCurveTo(s * 0.5, s * 0.7, s * 0.72, s * 0.77);
      ctx.stroke();
    },
    "\u5F00\u53D1\u533A": (ctx, s, color) => {
      strokeIcon(ctx, color);
      ctx.lineWidth = 2.8;
      for (const [x, y, w, h] of [[0.27, 0.49, 0.13, 0.23], [0.44, 0.38, 0.15, 0.34], [0.63, 0.52, 0.11, 0.2]]) {
        ctx.strokeRect(x * s, y * s, w * s, h * s);
      }
    },
    "\u5165\u4E16": (ctx, s, color) => {
      strokeIcon(ctx, color);
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.22, 0, Math.PI * 2);
      ctx.ellipse(s * 0.5, s * 0.5, s * 0.11, s * 0.22, 0, 0, Math.PI * 2);
      ctx.moveTo(s * 0.28, s * 0.5);
      ctx.lineTo(s * 0.72, s * 0.5);
      ctx.stroke();
    },
    // 制度创新：钥匙（土地拍卖、证券交易所、中外合作等"第一次"）
    "\u5236\u5EA6\u521B\u65B0": (ctx, s, color) => {
      strokeIcon(ctx, color);
      ctx.beginPath();
      ctx.arc(s * 0.37, s * 0.5, s * 0.11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.48, s * 0.5);
      ctx.lineTo(s * 0.74, s * 0.5);
      ctx.moveTo(s * 0.66, s * 0.5);
      ctx.lineTo(s * 0.66, s * 0.6);
      ctx.moveTo(s * 0.74, s * 0.5);
      ctx.lineTo(s * 0.74, s * 0.62);
      ctx.stroke();
    },
    // 自贸区：带闸口的方框（海关监管区）
    "\u81EA\u8D38\u533A": (ctx, s, color) => {
      strokeIcon(ctx, color);
      ctx.strokeRect(s * 0.28, s * 0.3, s * 0.44, s * 0.4);
      ctx.beginPath();
      ctx.moveTo(s * 0.28, s * 0.5);
      ctx.lineTo(s * 0.44, s * 0.5);
      ctx.moveTo(s * 0.56, s * 0.5);
      ctx.lineTo(s * 0.72, s * 0.5);
      ctx.moveTo(s * 0.5, s * 0.36);
      ctx.lineTo(s * 0.5, s * 0.64);
      ctx.stroke();
    }
  };
  function makeLabelCallout(text, color) {
    const ratio = 2;
    const label = String(text || "").length > 14 ? String(text).slice(0, 13) + "\u2026" : String(text || "");
    const fs = 11.5 * ratio;
    const padX = 8 * ratio;
    const barW = 3.5 * ratio;
    const h = 23 * ratio;
    const margin = 2 * ratio;
    const c = document.createElement("canvas");
    let ctx = c.getContext("2d");
    const font = `600 ${fs}px "Noto Sans SC","Source Sans 3","PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(label).width);
    const boxW = barW + padX * 2 + tw;
    c.width = boxW + margin * 2;
    c.height = h + margin * 2;
    ctx = c.getContext("2d");
    ctx.save();
    ctx.shadowColor = "rgba(9, 11, 17, 0.16)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = "rgba(255, 253, 249, 0.95)";
    ctx.fillRect(margin, margin, boxW, h);
    ctx.restore();
    ctx.fillStyle = color;
    ctx.fillRect(margin, margin, barW, h);
    ctx.lineWidth = 1.2 * ratio;
    ctx.strokeStyle = "rgba(9, 11, 17, 0.45)";
    ctx.strokeRect(margin, margin, boxW, h);
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#090b11";
    ctx.fillText(label, margin + barW + padX, margin + h / 2 + 0.5);
    return { image: ctx.getImageData(0, 0, c.width, c.height), ratio };
  }
  var _iconUrlCache = /* @__PURE__ */ new Map();
  function markerIconDataURL(name) {
    if (_iconUrlCache.has(name)) return _iconUrlCache.get(name);
    let imageData = null;
    if (name.startsWith("mk-")) {
      const k = name.slice(3);
      imageData = makeChip(GLYPH[k] || GLYPH.building, (CATEGORIES[k] || {}).color || "#9a6a10", "heritage");
    } else if (name.startsWith("rk-")) {
      const t = name.slice(3);
      imageData = makeChip(RGLYPH[t] || GLYPH.building, REFORM_COLORS[t] || "#888888", "reform");
    } else {
      return "";
    }
    try {
      const c = document.createElement("canvas");
      c.width = imageData.width;
      c.height = imageData.height;
      c.getContext("2d").putImageData(imageData, 0, 0);
      const url = c.toDataURL("image/png");
      _iconUrlCache.set(name, url);
      return url;
    } catch (e) {
      return "";
    }
  }
  function ensureMarkerImages(map2) {
    if (!map2 || !map2.addImage) return;
    const addImg = (id, imgData, ratio = 2) => {
      if (map2.hasImage && map2.hasImage(id)) return;
      try {
        map2.addImage(id, imgData, { pixelRatio: ratio });
      } catch (e) {
      }
    };
    Object.entries(CATEGORIES).forEach(([k, c]) => addImg("mk-" + k, makeChip(GLYPH[k] || GLYPH.building, c.color, "heritage"), 2));
    Object.entries(REFORM_COLORS).forEach(([t, c]) => addImg("rk-" + t, makeChip(RGLYPH[t] || GLYPH.building, c, "reform"), 2));
    addImg("sel", makeChip((ctx, s) => {
      ctx.fillStyle = "#bf3718";
      star(ctx, s / 2, s / 2, s * 0.2, s * 0.09, 4);
    }, "#bf3718", "heritage"), 2);
    map2.__wbMarkersAdded = true;
  }
  function ensureLabelImage(map2, id, text, color) {
    if (!map2 || !map2.addImage) return;
    if (map2.hasImage && map2.hasImage(id)) return;
    try {
      const sp = makeLabelCallout(text, color);
      map2.addImage(id, sp.image, { pixelRatio: sp.ratio });
    } catch (e) {
    }
  }
  var SYMBOL_OFFSET_EXPR = [
    "match",
    ["coalesce", ["get", "_slot"], 0],
    1,
    ["literal", [-12, 8]],
    2,
    ["literal", [12, -8]],
    3,
    ["literal", [15, 13]],
    4,
    ["literal", [-15, -13]],
    ["literal", [0, 0]]
  ];
  var LABEL_ANCHOR_EXPR = [
    "match",
    ["coalesce", ["get", "_slot"], 0],
    [1, 4, 5],
    "right",
    "left"
  ];
  var LABEL_OFFSET_EXPR = [
    "match",
    ["coalesce", ["get", "_slot"], 0],
    1,
    ["literal", [-42, 8]],
    2,
    ["literal", [42, -8]],
    3,
    ["literal", [45, 13]],
    4,
    ["literal", [-45, -13]],
    5,
    ["literal", [-26, 0]],
    ["literal", [26, 0]]
  ];
  function applyColocationOffsets(map2) {
    if (!map2) return;
    const herSrc = map2.getSource && map2.getSource("heritage");
    const refSrc = map2.getSource && map2.getSource("reform");
    const hFeats = map2.__wbHerData && map2.__wbHerData.features || [];
    const rFeats = map2.__wbRefData && map2.__wbRefData.features || [];
    const all = [
      ...hFeats.map((f) => ({ kind: "h", f, c: f.geometry && f.geometry.coordinates })),
      ...rFeats.map((f) => ({ kind: "r", f, c: f.geometry && f.geometry.coordinates }))
    ].filter((x) => Array.isArray(x.c));
    const visited = /* @__PURE__ */ new Set();
    for (let i = 0; i < all.length; i++) {
      if (visited.has(i)) continue;
      const group = [i];
      for (let j = i + 1; j < all.length; j++) {
        if (visited.has(j)) continue;
        const dx = all[i].c[0] - all[j].c[0];
        const dy = all[i].c[1] - all[j].c[1];
        if (Math.hypot(dx, dy) < 85e-4) {
          group.push(j);
          visited.add(j);
        }
      }
      visited.add(i);
      if (group.length === 1) {
        const self = all[i];
        let hasEastNeighbor = false;
        let hasWestNeighbor = false;
        for (let k = 0; k < all.length; k++) {
          if (k === i) continue;
          const dlng = all[k].c[0] - self.c[0];
          const dlat = Math.abs(all[k].c[1] - self.c[1]);
          if (dlat < 0.016 && dlng > 8e-3 && dlng < 0.068) hasEastNeighbor = true;
          if (dlat < 0.016 && dlng < -8e-3 && dlng > -0.068) hasWestNeighbor = true;
        }
        self.f.properties._slot = hasEastNeighbor && !hasWestNeighbor ? 5 : 0;
      } else {
        group.sort((a, b) => all[a].c[0] + all[a].c[1] - (all[b].c[0] + all[b].c[1]));
        group.forEach((idx, gIdx) => {
          all[idx].f.properties._slot = gIdx % 4 + 1;
        });
      }
    }
    if (herSrc && map2.__wbHerData) {
      try {
        herSrc.setData(map2.__wbHerData);
      } catch (e) {
      }
    }
    if (refSrc && map2.__wbRefData) {
      try {
        refSrc.setData(map2.__wbRefData);
      } catch (e) {
      }
    }
  }
  var EMPTY_FC = { type: "FeatureCollection", features: [] };
  function setActiveMarker(map2, coords, color = "#bf3718") {
    if (!mapReady2(map2)) return;
    const fc = Array.isArray(coords) && coords.length >= 2 ? {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { color }, geometry: { type: "Point", coordinates: coords } }]
    } : EMPTY_FC;
    if (!map2.getSource("active-pin-src")) {
      map2.addSource("active-pin-src", { type: "geojson", data: fc });
      map2.addLayer({
        id: "active-pin-halo",
        type: "circle",
        source: "active-pin-src",
        paint: {
          "circle-radius": 26,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.18,
          "circle-blur": 0.25
        }
      });
      map2.addLayer({
        id: "active-pin-ring",
        type: "circle",
        source: "active-pin-src",
        paint: {
          "circle-radius": 21,
          "circle-color": "rgba(255, 253, 249, 0.35)",
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2.2
        }
      });
    } else {
      map2.getSource("active-pin-src").setData(fc);
    }
    restackLayers(map2);
  }
  var _hoverTip = null;
  function bindHoverPreview(map2, layerId, formatHtml) {
    map2.on("mouseenter", layerId, (e) => {
      map2.getCanvas().style.cursor = "pointer";
      if (!e.features || !e.features.length) return;
      const feat = e.features[0];
      const coords = feat.geometry && feat.geometry.coordinates || [e.lngLat.lng, e.lngLat.lat];
      if (_hoverTip) {
        try {
          _hoverTip.remove();
        } catch (err) {
        }
      }
      _hoverTip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 20,
        maxWidth: "240px",
        className: "map-hover-popup"
      }).setLngLat(coords).setHTML(formatHtml(feat.properties || {})).addTo(map2);
    });
    map2.on("mouseleave", layerId, () => {
      map2.getCanvas().style.cursor = "";
      if (_hoverTip) {
        try {
          _hoverTip.remove();
        } catch (err) {
        }
        _hoverTip = null;
      }
    });
  }
  var _heritageAll = null;
  function buildHeritageData(map2, features) {
    return {
      type: "FeatureCollection",
      features: features.map((f, idx) => {
        const p = f.properties || {};
        const col = categoryColor(p.category);
        const lblId = "hlbl-" + (p.id || idx);
        ensureLabelImage(map2, lblId, p.name || "", col);
        return {
          ...f,
          properties: {
            ...p,
            color: col,
            _lbl: lblId,
            _slot: 0
          }
        };
      })
    };
  }
  function addHeritagePoints(map2, features, { onClick } = {}) {
    ensureMarkerImages(map2);
    _heritageAll = features;
    const data = buildHeritageData(map2, features);
    map2.__wbHerData = data;
    if (!map2.getSource("heritage")) {
      map2.addSource("heritage", { type: "geojson", data });
    } else {
      map2.getSource("heritage").setData(data);
    }
    const allowOverlap = features.length <= 25;
    if (!map2.getLayer("heritage-symbol")) {
      map2.addLayer({
        id: "heritage-symbol",
        type: "symbol",
        source: "heritage",
        layout: {
          "icon-image": ["concat", "mk-", ["get", "category"]],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.72, 7, 0.92, 11, 1.06, 14, 1.2],
          "icon-offset": SYMBOL_OFFSET_EXPR,
          "icon-allow-overlap": allowOverlap,
          "icon-ignore-placement": false,
          "icon-padding": 1
        },
        paint: { "icon-opacity": 0.99 }
      });
    }
    if (!map2.getLayer("heritage-label")) {
      map2.addLayer({
        id: "heritage-label",
        type: "symbol",
        source: "heritage",
        minzoom: 9.2,
        layout: {
          "icon-image": ["get", "_lbl"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 9.2, 0.92, 11, 1, 14, 1.06],
          "icon-anchor": LABEL_ANCHOR_EXPR,
          "icon-offset": LABEL_OFFSET_EXPR,
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
          "icon-padding": 1
        },
        paint: { "icon-opacity": 0.97 }
      });
    }
    applyColocationOffsets(map2);
    const fmtHover = (p) => `<div class="popup-kicker">${escapeHtml(categoryLabel(p.category))}${p.period ? " \xB7 " + escapeHtml(p.period) : ""}</div><div class="popup-title">${escapeHtml(p.name || "")}</div>`;
    ["heritage-symbol", "heritage-label"].forEach((lid) => {
      map2.off("click", lid);
      map2.off("mouseenter", lid);
      map2.off("mouseleave", lid);
      if (onClick) {
        map2.on("click", lid, (e) => {
          if (_hoverTip) {
            try {
              _hoverTip.remove();
            } catch (err) {
            }
            _hoverTip = null;
          }
          onClick(e.features[0].properties, e.lngLat, e.features[0].geometry.coordinates);
        });
      }
      bindHoverPreview(map2, lid, fmtHover);
    });
    restackLayers(map2);
    return data;
  }
  function setHeritageVisible(map2, visible) {
    if (!mapReady2(map2)) return;
    const v = visible ? "visible" : "none";
    if (map2.getLayer("heritage-symbol")) map2.setLayoutProperty("heritage-symbol", "visibility", v);
    if (map2.getLayer("heritage-label")) map2.setLayoutProperty("heritage-label", "visibility", v);
  }
  var _reformAll = null;
  function buildReformData(map2, events) {
    return {
      type: "FeatureCollection",
      features: events.map((e, idx) => {
        const col = reformColor(e.type);
        const lblId = "rlbl-" + (e.id || idx);
        const shortTitle = `${e.year ? e.year + " " : ""}${e.title || ""}`;
        ensureLabelImage(map2, lblId, shortTitle, col);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: e.coordinates },
          properties: {
            ...e,
            color: col,
            _lbl: lblId,
            _slot: 0
          }
        };
      })
    };
  }
  function addReformPoints(map2, events, { onClick } = {}) {
    ensureMarkerImages(map2);
    _reformAll = events;
    const data = buildReformData(map2, events);
    map2.__wbRefData = data;
    if (!map2.getSource("reform")) {
      map2.addSource("reform", { type: "geojson", data });
    } else {
      map2.getSource("reform").setData(data);
    }
    const allowOverlap = events.length <= 25;
    if (!map2.getLayer("reform-symbol")) {
      map2.addLayer({
        id: "reform-symbol",
        type: "symbol",
        source: "reform",
        layout: {
          "icon-image": ["concat", "rk-", ["get", "type"]],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.7, 7, 0.9, 11, 1.04, 14, 1.16],
          "icon-offset": SYMBOL_OFFSET_EXPR,
          "icon-allow-overlap": allowOverlap,
          "icon-ignore-placement": false,
          "icon-padding": 1
        },
        paint: { "icon-opacity": 0.98 }
      });
    }
    if (!map2.getLayer("reform-label")) {
      map2.addLayer({
        id: "reform-label",
        type: "symbol",
        source: "reform",
        minzoom: 9.2,
        layout: {
          "icon-image": ["get", "_lbl"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 9.2, 0.9, 11, 0.98, 14, 1.04],
          "icon-anchor": LABEL_ANCHOR_EXPR,
          "icon-offset": LABEL_OFFSET_EXPR,
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
          "icon-padding": 1
        },
        paint: { "icon-opacity": 0.96 }
      });
    }
    applyColocationOffsets(map2);
    const fmtHover = (p) => `<div class="popup-kicker">${escapeHtml(p.type || "\u6539\u9769\u4E8B\u4EF6")}${p.year ? " \xB7 " + escapeHtml(String(p.year)) : ""}</div><div class="popup-title">${escapeHtml(p.title || "")}</div>`;
    ["reform-symbol", "reform-label"].forEach((lid) => {
      map2.off("click", lid);
      map2.off("mouseenter", lid);
      map2.off("mouseleave", lid);
      if (onClick) {
        map2.on("click", lid, (e) => {
          if (_hoverTip) {
            try {
              _hoverTip.remove();
            } catch (err) {
            }
            _hoverTip = null;
          }
          onClick(e.features[0].properties, e.lngLat, e.features[0].geometry.coordinates);
        });
      }
      bindHoverPreview(map2, lid, fmtHover);
    });
    restackLayers(map2);
    return data;
  }
  function setReformVisible(map2, visible) {
    if (!mapReady2(map2)) return;
    const v = visible ? "visible" : "none";
    if (map2.getLayer("reform-symbol")) map2.setLayoutProperty("reform-symbol", "visibility", v);
    if (map2.getLayer("reform-label")) map2.setLayoutProperty("reform-label", "visibility", v);
  }

  // js/gis-tools.js
  var EMPTY_FC2 = { type: "FeatureCollection", features: [] };
  function attachMeasureTools(container, getMap) {
    if (!container) return;
    let mode = null;
    let pts = [];
    let mapBound = null;
    const wrap = el("div", { class: "lp-group" }, [
      el("div", { class: "lp-title", text: "GIS \u91CF\u7B97\u5DE5\u5177" })
    ]);
    const btnRow = el("div", { class: "lp-basemap", style: "gap:4px;" });
    const btnDist = el("button", { class: "lp-btn", type: "button", title: "\u5728\u5730\u56FE\u4E0A\u70B9\u51FB\u591A\u4E2A\u70B9\u6D4B\u91CF\u7403\u9762\u6D4B\u5730\u8DDD\u79BB", text: "\u6D4B\u8DDD" });
    const btnArea = el("button", { class: "lp-btn", type: "button", title: "\u5728\u5730\u56FE\u4E0A\u70B9\u51FB\u81F3\u5C113\u4E2A\u70B9\u6D4B\u91CF\u7403\u9762\u6D4B\u5730\u9762\u79EF", text: "\u6D4B\u9762" });
    const btnClear = el("button", { class: "lp-btn", type: "button", title: "\u6E05\u9664\u91CF\u7B97\u56FE\u5F62", style: "flex:0 0 auto;padding:4px 9px;white-space:nowrap;", text: "\u6E05\u9664" });
    btnRow.appendChild(btnDist);
    btnRow.appendChild(btnArea);
    btnRow.appendChild(btnClear);
    const readout = el("div", {
      class: "measure-readout",
      style: "display:none;margin-top:6px;padding:6px 8px;background:var(--blue-pale);border:1px solid var(--blue-light);border-radius:2px;font-size:11.5px;color:var(--blue-dark);line-height:1.45;",
      text: ""
    });
    wrap.appendChild(btnRow);
    wrap.appendChild(readout);
    container.appendChild(wrap);
    function ensureMeasureLayers(map2) {
      if (!map2 || !map2.getSource) return false;
      if (!map2.getSource("measure-src")) {
        map2.addSource("measure-src", { type: "geojson", data: EMPTY_FC2 });
      }
      if (!map2.getLayer("measure-poly")) {
        map2.addLayer({
          id: "measure-poly",
          type: "fill",
          source: "measure-src",
          filter: ["==", "$type", "Polygon"],
          paint: { "fill-color": "#c63a18", "fill-opacity": 0.18 }
        });
      }
      if (!map2.getLayer("measure-line")) {
        map2.addLayer({
          id: "measure-line",
          type: "line",
          source: "measure-src",
          filter: ["in", "$type", "LineString", "Polygon"],
          paint: { "line-color": "#090b11", "line-width": 2.5, "line-dasharray": [2, 1.5] }
        });
      }
      if (!map2.getLayer("measure-pts")) {
        map2.addLayer({
          id: "measure-pts",
          type: "circle",
          source: "measure-src",
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 4.5,
            "circle-color": "#ffffff",
            "circle-stroke-color": "#c63a18",
            "circle-stroke-width": 2.2
          }
        });
      }
      return true;
    }
    function renderGeometry() {
      const map2 = getMap && getMap();
      if (!map2 || !ensureMeasureLayers(map2)) return;
      const features = pts.map((c, idx) => ({
        type: "Feature",
        properties: { idx },
        geometry: { type: "Point", coordinates: c }
      }));
      if (mode === "distance" && pts.length >= 2) {
        const line = {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: pts }
        };
        features.push(line);
        const km = turf.length(line, { units: "kilometers" });
        const distStr = km >= 1 ? `${formatNumber(km, 2)} km` : `${formatNumber(km * 1e3, 0)} m`;
        readout.style.display = "block";
        readout.innerHTML = `<strong>\u6D4B\u5730\u8DDD\u79BB\uFF1A${distStr}</strong><br><span style="color:var(--text-2);">\u8282\u70B9\u6570\uFF1A${pts.length}\uFF08\u7EE7\u7EED\u70B9\u51FB\u5730\u56FE\u7D2F\u52A0\uFF09</span>`;
      } else if (mode === "area" && pts.length >= 3) {
        const ring = [...pts, pts[0]];
        const poly = {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [ring] }
        };
        features.push(poly);
        const sqm = turf.area(poly);
        const perimKm = turf.length({ type: "Feature", geometry: { type: "LineString", coordinates: ring } }, { units: "kilometers" });
        readout.style.display = "block";
        readout.innerHTML = `<strong>\u6D4B\u5730\u9762\u79EF\uFF1A${formatArea(sqm)}</strong><br><span style="color:var(--text-2);">\u5468\u957F\uFF1A${formatNumber(perimKm, 2)} km\uFF08${pts.length} \u9876\u70B9\uFF09</span>`;
      } else if (mode === "area" && pts.length === 2) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: pts }
        });
        readout.style.display = "block";
        readout.textContent = "\u5DF2\u9009 2 \u4E2A\u70B9\uFF0C\u8BF7\u518D\u70B9\u51FB\u81F3\u5C11 1 \u4E2A\u70B9\u95ED\u5408\u591A\u8FB9\u5F62\u2026";
      } else if (mode && pts.length === 1) {
        readout.style.display = "block";
        readout.textContent = "\u5DF2\u9009\u8D77\u70B9\uFF0C\u8BF7\u7EE7\u7EED\u70B9\u51FB\u5730\u56FE\u6DFB\u52A0\u6D4B\u91CF\u8282\u70B9\u2026";
      }
      map2.getSource("measure-src").setData({ type: "FeatureCollection", features });
    }
    function onMapClick(e) {
      if (!mode) return;
      pts.push([+e.lngLat.lng.toFixed(5), +e.lngLat.lat.toFixed(5)]);
      renderGeometry();
    }
    function bindMapEvents() {
      const map2 = getMap && getMap();
      if (!map2 || mapBound === map2) return;
      mapBound = map2;
      map2.on("click", onMapClick);
    }
    function setMode(nextMode) {
      bindMapEvents();
      const map2 = getMap && getMap();
      if (mode === nextMode) nextMode = null;
      mode = nextMode;
      pts = [];
      btnDist.classList.toggle("active", mode === "distance");
      btnArea.classList.toggle("active", mode === "area");
      if (map2 && map2.getCanvas) {
        map2.getCanvas().style.cursor = mode ? "crosshair" : "";
      }
      if (!mode) {
        readout.style.display = "none";
        if (map2 && map2.getSource && map2.getSource("measure-src")) {
          map2.getSource("measure-src").setData(EMPTY_FC2);
        }
      } else {
        readout.style.display = "block";
        readout.textContent = mode === "distance" ? "\u6D4B\u8DDD\u6A21\u5F0F\uFF1A\u8BF7\u5728\u5730\u56FE\u4E0A\u4F9D\u6B21\u70B9\u51FB\u4E24\u4E2A\u6216\u591A\u4E2A\u4F4D\u7F6E" : "\u6D4B\u9762\u6A21\u5F0F\uFF1A\u8BF7\u5728\u5730\u56FE\u4E0A\u4F9D\u6B21\u70B9\u51FB\u81F3\u5C11 3 \u4E2A\u9876\u70B9";
      }
    }
    btnDist.addEventListener("click", () => setMode("distance"));
    btnArea.addEventListener("click", () => setMode("area"));
    btnClear.addEventListener("click", () => {
      pts = [];
      setMode(null);
    });
  }
  var _choroplethData = null;
  async function loadChoroplethData() {
    if (_choroplethData) return _choroplethData;
    try {
      const res = await fetch("/api/spatial/provinces-stats");
      if (res.ok) {
        const d = await res.json();
        if (d && d.features && d.features.length) {
          _choroplethData = d;
          return d;
        }
      }
    } catch (e) {
    }
    const [provFc, herFc, refData] = await Promise.all([
      fetchJSON(dataUrl("china-provinces.geojson")),
      fetchJSON(dataUrl("heritage.geojson")),
      fetchJSON(dataUrl("reform-events.json"))
    ]);
    const features = (provFc.features || []).map((pf) => {
      let herCount = 0;
      let refCount = 0;
      try {
        (herFc.features || []).forEach((hf) => {
          if (hf.geometry && turf.booleanPointInPolygon(hf.geometry.coordinates, pf)) herCount++;
        });
        (refData.events || []).forEach((re) => {
          if (re.coordinates && turf.booleanPointInPolygon(re.coordinates, pf)) refCount++;
        });
      } catch (e) {
      }
      return {
        ...pf,
        properties: {
          ...pf.properties,
          heritage_count: herCount,
          reform_count: refCount,
          total_score: herCount + refCount
        }
      };
    });
    _choroplethData = { type: "FeatureCollection", features };
    return _choroplethData;
  }
  async function setChoroplethVisible(map2, visible, field = "heritage_count") {
    if (!map2 || !map2.style) return;
    if (!map2.getSource("choropleth-src")) {
      const fc = await loadChoroplethData();
      if (!map2.getSource("choropleth-src")) {
        map2.addSource("choropleth-src", { type: "geojson", data: fc });
      }
    }
    if (!map2.getLayer("choropleth-fill")) {
      map2.addLayer({
        id: "choropleth-fill",
        type: "fill",
        source: "choropleth-src",
        layout: { visibility: visible ? "visible" : "none" },
        paint: {
          "fill-color": [
            "step",
            ["coalesce", ["get", field], 0],
            "rgba(239, 243, 255, 0.35)",
            1,
            "rgba(189, 215, 231, 0.58)",
            2,
            "rgba(107, 174, 214, 0.65)",
            3,
            "rgba(49, 130, 189, 0.72)",
            5,
            "rgba(8, 81, 156, 0.78)"
          ],
          "fill-outline-color": "#2b6cb0"
        }
      });
    } else {
      map2.setPaintProperty("choropleth-fill", "fill-color", [
        "step",
        ["coalesce", ["get", field], 0],
        "rgba(239, 243, 255, 0.35)",
        1,
        "rgba(189, 215, 231, 0.58)",
        2,
        "rgba(107, 174, 214, 0.65)",
        3,
        "rgba(49, 130, 189, 0.72)",
        5,
        "rgba(8, 81, 156, 0.78)"
      ]);
      map2.setLayoutProperty("choropleth-fill", "visibility", visible ? "visible" : "none");
    }
    restackLayers(map2);
  }
  function setReformFlowVisible(map2, visible) {
    if (!map2 || !map2.style) return;
    if (map2.getLayer("reform-flow-line")) {
      map2.setLayoutProperty("reform-flow-line", "visibility", visible ? "visible" : "none");
    }
  }
  async function setGeoServerWfsVisible(map2, visible, typeName = "webgis:heritage_sites") {
    if (!map2 || !map2.style) return;
    if (!visible) {
      if (map2.getLayer("wfs-halo-layer")) {
        map2.setLayoutProperty("wfs-halo-layer", "visibility", "none");
      }
      return;
    }
    const wfsUrl = `/geoserver/webgis/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(typeName)}&outputFormat=application/json&srsName=EPSG:4326`;
    let fc = null;
    try {
      const res = await fetch(wfsUrl);
      if (res.ok) fc = await res.json();
    } catch (e) {
    }
    if (!fc || !fc.features) {
      fc = await fetchJSON(dataUrl("heritage.geojson"));
    }
    if (!map2.getSource("wfs-src")) {
      map2.addSource("wfs-src", { type: "geojson", data: fc });
    } else {
      map2.getSource("wfs-src").setData(fc);
    }
    if (!map2.getLayer("wfs-halo-layer")) {
      map2.addLayer({
        id: "wfs-halo-layer",
        type: "circle",
        source: "wfs-src",
        paint: {
          "circle-radius": 15,
          "circle-color": "rgba(0, 122, 194, 0.14)",
          "circle-stroke-color": "#c63a18",
          "circle-stroke-width": 2
        }
      });
    } else {
      map2.setLayoutProperty("wfs-halo-layer", "visibility", "visible");
    }
    restackLayers(map2);
    toast(`\u5DF2\u52A0\u8F7D GeoServer WFS \u56FE\u5C42 (${typeName}\uFF0C\u5171 ${fc.features.length} \u4E2A\u7A7A\u95F4\u8981\u7D20)`, "info", 2800);
  }
  function setGeoServerWmsVisible(map2, visible, layersStr = "webgis:china_provinces,webgis:heritage_sites") {
    if (!map2 || !map2.style) return;
    if (!visible) {
      if (map2.getLayer("gs-wms-layer")) {
        map2.setLayoutProperty("gs-wms-layer", "visibility", "none");
      }
      return;
    }
    const wmsTileTemplate = `/geoserver/webgis/wms?service=WMS&version=1.1.1&request=GetMap&layers=${encodeURIComponent(layersStr)}&styles=&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&format=image/png&transparent=true`;
    if (!map2.getSource("gs-wms-src")) {
      map2.addSource("gs-wms-src", {
        type: "raster",
        tiles: [wmsTileTemplate],
        tileSize: 256
      });
    }
    if (!map2.getLayer("gs-wms-layer")) {
      map2.addLayer({
        id: "gs-wms-layer",
        type: "raster",
        source: "gs-wms-src",
        paint: { "raster-opacity": 0.72 }
      });
    } else {
      map2.setLayoutProperty("gs-wms-layer", "visibility", "visible");
    }
    restackLayers(map2);
    toast(`\u5DF2\u52A0\u8F7D GeoServer WMS \u670D\u52A1\u56FE\u5C42 (${layersStr})`, "info", 2600);
  }

  // js/layerpanel.js
  function initLayerPanel(container, getMap, opts = {}) {
    if (!container) return;
    container.innerHTML = "";
    container.classList.remove("is-collapsed");
    const startCollapsed = typeof window !== "undefined" && window.innerWidth <= 640;
    if (startCollapsed) container.classList.add("is-collapsed");
    const toggleBtn = el("button", {
      class: "lp-toggle",
      type: "button",
      "aria-expanded": startCollapsed ? "false" : "true",
      "aria-label": "\u6536\u8D77\u6216\u5C55\u5F00\u56FE\u5C42\u9762\u677F",
      text: startCollapsed ? "\u5C55\u5F00" : "\u6536\u8D77"
    });
    const head = el("div", { class: "lp-head" }, [
      el("span", { class: "lp-head-title", text: "\u5236\u56FE\u63A7\u5236" }),
      toggleBtn
    ]);
    const bodyWrap = el("div", { class: "lp-body" });
    toggleBtn.addEventListener("click", () => {
      const collapsed = container.classList.toggle("is-collapsed");
      toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggleBtn.textContent = collapsed ? "\u5C55\u5F00" : "\u6536\u8D77";
    });
    container.appendChild(head);
    container.appendChild(bodyWrap);
    if (opts.resetView) {
      const b = el("button", { class: "lp-btn lp-tool", type: "button", text: opts.resetLabel || "\u590D\u4F4D\u89C6\u56FE" });
      b.addEventListener("click", () => {
        try {
          opts.resetView();
        } catch (e) {
        }
      });
      bodyWrap.appendChild(el("div", { class: "lp-group" }, [
        el("div", { class: "lp-title", text: "\u89C6\u56FE\u63A7\u5236" }),
        b
      ]));
    }
    const layers = Array.isArray(opts.layers) ? opts.layers : [];
    if (layers.length) {
      const lyrWrap = el("div", { class: "lp-group" }, [el("div", { class: "lp-title", text: "\u56FE\u5C42\u63A7\u5236" })]);
      const list = el("div", { class: "lp-layers" });
      layers.forEach((lyr) => {
        const chk = el("input", { type: "checkbox" });
        chk.checked = lyr.on !== false;
        chk.addEventListener("change", () => {
          const m = getMap && getMap();
          const on = chk.checked;
          if (typeof lyr.onChange === "function") {
            lyr.onChange(on, m);
            return;
          }
          if (!m) return;
          if (lyr.type === "heritage") setHeritageVisible(m, on);
          else if (lyr.type === "reform") setReformVisible(m, on);
          else if (lyr.type === "choropleth") {
            setChoroplethVisible(m, on, lyr.field || "heritage_count");
          } else if (lyr.type === "flow") {
            setReformFlowVisible(m, on);
          } else if (lyr.type === "wfs") {
            setGeoServerWfsVisible(m, on, lyr.typeName || "webgis:heritage_sites");
          } else if (lyr.type === "wms") {
            setGeoServerWmsVisible(m, on, lyr.layers || "webgis:china_provinces,webgis:heritage_sites");
          }
        });
        const row = el("label", { class: "lp-layer" }, [
          chk,
          el("span", { text: lyr.label })
        ]);
        list.appendChild(row);
      });
      lyrWrap.appendChild(list);
      bodyWrap.appendChild(lyrWrap);
    }
    if (opts.measure !== false && getMap) {
      attachMeasureTools(bodyWrap, getMap);
    }
    if (opts.legend !== false) {
      const lg = el("div", { class: "lp-group" }, [el("div", { class: "lp-title", text: "\u56FE\u4F8B" })]);
      const body = el("div", { class: "lp-legend" });
      if (Array.isArray(opts.customLegend) && opts.customLegend.length) {
        opts.customLegend.forEach((item) => {
          body.appendChild(el("div", { class: "lg-row", style: "grid-column:1/-1;" }, [
            el("span", { class: "lp-sw", style: `background:${item.color};border:1.5px solid ${item.border || item.color};` }),
            el("span", { text: item.label })
          ]));
        });
      } else {
        const types = new Set(layers.map((l) => l.type));
        const showHer = types.size === 0 || types.has("heritage");
        const showRef = types.size === 0 || types.has("reform");
        if (showHer) {
          Object.entries(CATEGORIES).forEach(([k, c]) => {
            const icoUrl = markerIconDataURL("mk-" + k);
            body.appendChild(el("div", { class: "lg-row" }, [
              icoUrl ? el("img", { class: "lg-ico", src: icoUrl, alt: "", "aria-hidden": "true" }) : el("span", { class: "lg-dot", style: `background:${c.color}` }),
              el("span", { text: c.label })
            ]));
          });
        }
        if (showRef) {
          Object.entries(REFORM_COLORS).forEach(([t, c]) => {
            const icoUrl = markerIconDataURL("rk-" + t);
            body.appendChild(el("div", { class: "lg-row" }, [
              icoUrl ? el("img", { class: "lg-ico", src: icoUrl, alt: "", "aria-hidden": "true" }) : el("span", { class: "lg-dot", style: `background:${c}` }),
              el("span", { text: t })
            ]));
          });
        }
      }
      lg.appendChild(body);
      bodyWrap.appendChild(lg);
    }
  }

  // js/charts.js
  var _charts = /* @__PURE__ */ new Set();
  var INK = "#090b11";
  var LILAC = "#5f58c7";
  function createChart(dom, option) {
    if (!dom || typeof echarts === "undefined") return null;
    const existing = echarts.getInstanceByDom(dom);
    if (existing) {
      _charts.delete(existing);
      existing.dispose();
    }
    const chart = echarts.init(dom, null, { renderer: "canvas" });
    chart.setOption(option);
    _charts.add(chart);
    return chart;
  }
  function resizeAll() {
    _charts.forEach((c) => {
      try {
        c.resize();
      } catch (e) {
      }
    });
  }
  window.addEventListener("resize", resizeAll);
  var CHART_FONT_SANS = '"Source Sans 3", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Atlas Sans SC", "Microsoft YaHei UI", sans-serif';
  var CHART_FONT_MONO = '"JetBrains Mono", "Source Sans 3", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Atlas Sans SC", monospace';
  function axisStyle() {
    return {
      axisLine: { lineStyle: { color: "rgba(9, 11, 17, 0.22)" } },
      axisLabel: { color: "rgba(9, 11, 17, 0.72)", fontFamily: CHART_FONT_MONO, fontSize: 11, fontWeight: 400 },
      splitLine: { lineStyle: { color: "rgba(9, 11, 17, 0.08)", type: "dashed" } }
    };
  }
  var TOOLTIP_STYLE = {
    backgroundColor: "#fffdfb",
    borderColor: INK,
    borderWidth: 1,
    textStyle: { color: INK, fontSize: 12, fontFamily: CHART_FONT_SANS },
    extraCssText: "box-shadow: 0 18px 44px -36px rgba(9,11,17,.5); border-radius: 0;"
  };
  function dualAxisCityOption(years, popValues, gdpValues) {
    return {
      grid: { left: 46, right: 54, top: 34, bottom: 26 },
      tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
      legend: {
        data: ["\u5E38\u4F4F\u4EBA\u53E3 (\u4E07\u4EBA)", "\u5730\u533A GDP (\u4EBF\u5143)"],
        textStyle: { color: "rgba(9, 11, 17, 0.68)", fontSize: 11.5, fontWeight: 600 },
        top: 2,
        itemWidth: 14,
        itemHeight: 10
      },
      xAxis: { type: "category", data: years, ...axisStyle() },
      yAxis: [
        {
          type: "value",
          ...axisStyle()
        },
        {
          type: "value",
          ...axisStyle(),
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: "\u5E38\u4F4F\u4EBA\u53E3 (\u4E07\u4EBA)",
          type: "bar",
          yAxisIndex: 0,
          data: popValues,
          barWidth: "38%",
          itemStyle: { color: "rgba(224, 73, 37, 0.62)", borderRadius: 0 }
        },
        {
          name: "\u5730\u533A GDP (\u4EBF\u5143)",
          type: "line",
          yAxisIndex: 1,
          smooth: false,
          symbolSize: 6,
          data: gdpValues,
          itemStyle: { color: LILAC },
          lineStyle: { width: 2.4, color: LILAC }
        }
      ]
    };
  }

  // js/cities.js
  var MAP = null;
  var CITIES = [];
  var HERITAGE = [];
  var REFORM = [];
  var CITY_STATS = {};
  var current = "shenzhen";
  function richPlaceCard(p) {
    const img = assetUrl(p.image);
    const gal = Array.isArray(p.gallery) ? p.gallery.filter(Boolean).slice(0, 4) : [];
    const tags = [
      `<span class="tag tag-blue">${escapeHtml(categoryLabel(p.category))}</span>`,
      p.period ? `<span class="tag">${escapeHtml(p.period)}</span>` : "",
      p.city ? `<span class="tag">${escapeHtml(p.city)}</span>` : ""
    ].join("");
    const gallery = gal.length ? `<div class="rc-gallery">${gal.map((g) => `<img src="${assetUrl(g)}" alt="">`).join("")}</div>` : "";
    const baike = p.sourceUrl ? `<a class="rc-baike" href="${normalizeSourceUrl(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${isBaikeUrl(p.sourceUrl) ? "\u5728\u767E\u5EA6\u767E\u79D1\u67E5\u770B\u300C" + escapeHtml(p.name) + "\u300D" : "\u67E5\u770B\u8D44\u6599\u51FA\u5904"}</a>` : "";
    return `<div class="rc-card">
    ${img ? `<img class="rc-img" src="${img}" alt="${escapeHtml(p.name)}\u5B9E\u666F\u7167\u7247">` : ""}
    <div class="rc-body">
      <div class="rc-tags">${tags}</div>
      <h3 class="rc-title">${escapeHtml(p.name)}</h3>
      <p class="rc-desc">${escapeHtml(p.description || "")}</p>
      ${gallery}
      ${baike}
    </div>
  </div>`;
  }
  function richReformCard(e) {
    const img = assetUrl(e.image);
    const tags = [
      `<span class="tag tag-blue">${escapeHtml(e.type || "\u4E8B\u4EF6")}</span>`,
      e.year ? `<span class="tag">${e.year}</span>` : "",
      e.city ? `<span class="tag">${escapeHtml(e.city)}</span>` : ""
    ].join("");
    const baike = e.sourceUrl ? `<a class="rc-baike" href="${normalizeSourceUrl(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">${isBaikeUrl(e.sourceUrl) ? "\u5728\u767E\u5EA6\u767E\u79D1\u67E5\u770B\u300C" + escapeHtml(e.title || e.city || "\u6539\u9769\u4E8B\u4EF6") + "\u300D" : "\u67E5\u770B\u8D44\u6599\u51FA\u5904"}</a>` : "";
    return `<div class="rc-card">
    ${img ? `<img class="rc-img" src="${img}" alt="${escapeHtml(e.title || "")}\u5386\u53F2\u4E0E\u57CE\u5E02\u5F71\u50CF">` : ""}
    <div class="rc-body">
      <div class="rc-tags">${tags}</div>
      <h3 class="rc-title">${escapeHtml(e.title || e.name || "")}</h3>
      ${e.description ? `<p class="rc-desc">${escapeHtml(e.description)}${e.significance ? " " + escapeHtml(e.significance) : ""}</p>` : ""}
      ${baike}
    </div>
  </div>`;
  }
  function updateCityMapBadge(city, herCount, refCount) {
    const root = document.getElementById("map-root");
    if (!root || !city) return;
    let badge = document.getElementById("city-map-badge");
    if (!badge) {
      badge = el("div", { id: "city-map-badge", class: "map-plate-badge", "aria-hidden": "true" });
      root.appendChild(badge);
    }
    badge.innerHTML = `
    <span class="mpb-city">${escapeHtml(city.name)}</span>
    <span class="mpb-en">${escapeHtml(city.en || "")}</span>
    <span class="mpb-sep">\xB7</span>
    <span class="mpb-meta">${herCount} \u5904\u5386\u53F2\u5730\u6807 / ${refCount} \u8D77\u6539\u9769\u4E8B\u4EF6</span>`;
  }
  function setSidebarActiveItem(nodeId) {
    document.querySelectorAll("#city-detail .place-item").forEach((btn) => {
      btn.classList.toggle("is-active", Boolean(nodeId && btn.dataset.nodeId === nodeId));
    });
  }
  var _overlay = null;
  var _overlayReturnFocus = null;
  function ensureOverlay() {
    if (_overlay) return _overlay;
    const root = document.getElementById("map-root");
    if (!root) return null;
    _overlay = el("div", {
      class: "rich-overlay",
      role: "dialog",
      "aria-label": "\u5730\u6807\u6863\u6848"
    });
    root.appendChild(_overlay);
    return _overlay;
  }
  function focusNodeOnMap({ id, coords, color, html, pan = false }) {
    if (!Array.isArray(coords) || coords.length < 2) return;
    setSidebarActiveItem(id);
    if (MAP) {
      setActiveMarker(MAP, coords, color || "#bf3718");
      if (pan) {
        const city = CITIES.find((c) => c.key === current) || CITIES[0];
        const targetZoom = Math.max(MAP.getZoom() || 10.5, (city && city.zoom || 10.6) + 0.35);
        const pad = getOpticalPadding(MAP);
        flyTo({
          center: coords,
          zoom: Math.min(13.2, targetZoom),
          padding: { ...pad, right: Math.max(pad.right, 160) },
          duration: 720
        });
      }
    }
    showRichCard({ lng: coords[0], lat: coords[1] }, html);
  }
  function showRichCard(lngLat, html) {
    const o = ensureOverlay();
    if (!o) return;
    _overlayReturnFocus = document.activeElement;
    o.innerHTML = html + '<button class="ro-close" type="button" aria-label="\u5173\u95ED">\xD7</button>';
    const close = o.querySelector(".ro-close");
    close.addEventListener("click", hideRichCard);
    o.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hideRichCard();
      }
    };
    o._lngLat = Array.isArray(lngLat) ? { lng: lngLat[0], lat: lngLat[1] } : lngLat;
    o.classList.add("show");
    positionOverlay();
    requestAnimationFrame(() => {
      try {
        close.focus({ preventScroll: true });
      } catch (e) {
      }
    });
  }
  function hideRichCard() {
    if (_overlay) {
      _overlay.classList.remove("show");
      _overlay._lngLat = null;
    }
    setSidebarActiveItem(null);
    if (MAP) setActiveMarker(MAP, null);
    const back = _overlayReturnFocus;
    _overlayReturnFocus = null;
    if (back && back.isConnected) {
      try {
        back.focus({ preventScroll: true });
      } catch (e) {
      }
    }
  }
  function positionOverlay() {
    const o = _overlay;
    if (!o || !o.classList.contains("show") || !o._lngLat || !MAP) return;
    const root = document.getElementById("map-root");
    if (!root) return;
    const mr = root.getBoundingClientRect();
    const pr = MAP.project(o._lngLat);
    const cw = o.offsetWidth || 320;
    const ch = o.offsetHeight || 320;
    const gap = 24;
    const lp = document.getElementById("layer-panel");
    const lpCollapsed = lp && lp.classList.contains("is-collapsed");
    const lpRight = lp && !lpCollapsed ? lp.offsetLeft + lp.offsetWidth + 12 : 14;
    const availMid = (lpRight + mr.width) / 2;
    let x = pr.x <= availMid ? pr.x + gap : pr.x - cw - gap;
    let y = pr.y - ch / 2;
    x = Math.max(lpRight, Math.min(Math.max(lpRight, mr.width - cw - 12), x));
    y = Math.max(46, Math.min(Math.max(12, mr.height - ch - 36), y));
    o.style.left = Math.round(x) + "px";
    o.style.top = Math.round(y) + "px";
  }
  function initCitiesPage() {
    bindLifecycle();
    if (guardFileProtocol("#map-loading")) return;
    const params = new URLSearchParams(location.search);
    current = params.get("city") || "shenzhen";
    MAP = createMap("map-city", { zoom: 10.5 });
    MAP.on("move", () => {
      try {
        positionOverlay();
      } catch (e) {
      }
    });
    window.addEventListener("pagehide", () => {
      try {
        hideRichCard();
      } catch (e) {
      }
    });
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        try {
          hideRichCard();
        } catch (e2) {
        }
      }
    });
    const loading = document.getElementById("map-loading");
    initLayerPanel(document.getElementById("layer-panel"), () => MAP, {
      layers: [
        { id: "heritage", label: "\u6587\u5316\u9057\u4EA7\u70B9", type: "heritage", on: true },
        { id: "reform", label: "\u6539\u9769\u5F00\u653E\u4E8B\u4EF6", type: "reform", on: true },
        ...window.__LOCAL_FILE_BUILD__ ? [] : [
          { id: "wfs", label: "GeoServer WFS \u8981\u7D20", type: "wfs", typeName: "webgis:heritage_sites", on: false }
        ]
      ],
      resetView: () => {
        const c = CITIES.find((x) => x.key === current) || CITIES[0];
        if (c) {
          hideRichCard();
          flyToCity(c.center, c.zoom);
        }
      },
      resetLabel: "\u590D\u4F4D \xB7 \u5F53\u524D\u57CE\u5E02"
    });
    Promise.all([
      fetchJSON(dataUrl("cities.json")),
      fetchJSON(dataUrl("heritage.geojson")),
      fetchJSON(dataUrl("reform-events.json")),
      fetchJSON(dataUrl("city-statistics.json")).catch(() => ({ series: {} }))
    ]).then(([cities, her, ref, stats]) => {
      CITIES = cities;
      REFORM = ref.events;
      HERITAGE = her.features;
      CITY_STATS = stats && stats.series || {};
      buildTabs();
      if (loading) loading.classList.add("hide");
      attachStatusBar("map-root");
      whenReady(() => selectCity(current));
    }).catch((e) => {
      if (loading) loading.textContent = "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A" + e.message;
    });
  }
  function buildTabs() {
    const tabs = document.getElementById("city-tabs");
    tabs.innerHTML = "";
    CITIES.forEach((c) => {
      const t = el("button", {
        class: "city-tab" + (c.key === current ? " active" : ""),
        type: "button",
        "aria-pressed": c.key === current ? "true" : "false"
      }, [
        el("span", { class: "ct-name", text: c.name }),
        el("span", { class: "ct-en", text: c.en || "" }),
        el("span", { class: "ct-period", text: c.period || "" })
      ]);
      t.addEventListener("click", () => {
        current = c.key;
        [...tabs.children].forEach((x) => {
          x.classList.remove("active");
          x.setAttribute("aria-pressed", "false");
        });
        t.classList.add("active");
        t.setAttribute("aria-pressed", "true");
        selectCity(c.key);
      });
      tabs.appendChild(t);
    });
  }
  function selectCity(key) {
    const city = CITIES.find((c) => c.key === key) || CITIES[0];
    current = city.key;
    hideRichCard();
    try {
      const nextUrl = new URL(location.href);
      nextUrl.searchParams.set("city", city.key);
      history.replaceState(null, "", nextUrl);
    } catch (e) {
    }
    const intro = document.getElementById("city-intro");
    const cover = el("img", { alt: city.name + "\u57CE\u5E02\u5B9E\u666F", width: 640, height: 480, decoding: "async" });
    const realCover = assetUrl(city.cover);
    if (realCover) loadImage(cover, realCover, city.name, city.coverCategory);
    else cover.src = placeholderDataURI(city.name, city.coverCategory, 640, 480);
    const stats = CITY_STATS[city.key] || {};
    const lastPop = Array.isArray(stats.population) && stats.population.length ? stats.population[stats.population.length - 1] : null;
    const lastGdp = Array.isArray(stats.gdp) && stats.gdp.length ? stats.gdp[stats.gdp.length - 1] : null;
    const figures = el("div", { class: "city-figures" });
    if (lastPop) {
      figures.appendChild(el("div", { class: "city-figure" }, [
        el("span", { class: "cf-value", text: `\u7EA6 ${formatNumber(lastPop[1])}` }),
        el("span", { class: "cf-label", text: `${lastPop[0]} \u5E38\u4F4F\u4EBA\u53E3\uFF08\u4E07\u4EBA\uFF09` })
      ]));
    }
    if (lastGdp) {
      figures.appendChild(el("div", { class: "city-figure" }, [
        el("span", { class: "cf-value", text: `\u7EA6 ${formatNumber(lastGdp[1])}` }),
        el("span", { class: "cf-label", text: `${lastGdp[0]} \u5730\u533A GDP\uFF08\u4EBF\u5143\uFF09` })
      ]));
    }
    intro.innerHTML = "";
    intro.appendChild(el("figure", { class: "city-cover" }, [cover]));
    intro.appendChild(el("div", { class: "city-copy" }, [
      el("div", {}, [
        el("span", { class: "city-name", text: city.name }),
        el("span", { class: "city-en", text: city.en || "" })
      ]),
      el("span", { class: "city-period", text: city.period || "" }),
      el("p", { class: "city-desc", text: city.description || "" })
    ]));
    intro.appendChild(figures);
    const herFeats = HERITAGE.filter((f) => f.properties.city && f.properties.city.includes(city.name));
    const refEvents = REFORM.filter((e) => e.city === city.name);
    updateCityMapBadge(city, herFeats.length, refEvents.length);
    addHeritagePoints(MAP, herFeats, {
      onClick: (p, ll, coords) => {
        const src = (HERITAGE.find((h) => h.properties && h.properties.id === p.id) || {}).properties || p;
        focusNodeOnMap({
          id: "her-" + src.id,
          coords: coords || [ll.lng, ll.lat],
          color: categoryColor(src.category),
          html: richPlaceCard(src),
          pan: false
        });
      }
    });
    addReformPoints(MAP, refEvents, {
      onClick: (p, ll, coords) => {
        const src = REFORM.find((e) => e.id === p.id) || p;
        focusNodeOnMap({
          id: "ref-" + src.id,
          coords: coords || [ll.lng, ll.lat],
          color: REFORM_COLORS[src.type] || "#bf3718",
          html: richReformCard(src),
          pan: false
        });
      }
    });
    flyToCity(city.center, city.zoom);
    renderDetail(city, herFeats, refEvents);
    renderGallery(city);
  }
  function renderGallery(city) {
    const box = document.getElementById("city-gallery");
    if (!box) return;
    const items = Array.isArray(city.gallery) ? city.gallery.filter((g) => g && g.image) : [];
    box.innerHTML = "";
    box.hidden = !items.length;
    if (!items.length) return;
    box.appendChild(el("div", { class: "city-gallery-head" }, [
      el("h2", { class: "city-gallery-title", text: "\u57CE\u5E02\u5F71\u50CF" }),
      el("p", { class: "city-gallery-count", text: `${city.name} \xB7 ${items.length} \u5F20\u6863\u6848\u5F71\u50CF` })
    ]));
    const grid = el("div", { class: "city-gallery-grid" });
    items.forEach((item) => {
      const src = assetUrl(item.image);
      const img = el("img", {
        alt: item.caption || city.name + "\u57CE\u5E02\u5F71\u50CF",
        width: 640,
        height: 420,
        loading: "lazy",
        decoding: "async"
      });
      if (src) loadImage(img, src, item.caption || city.name, city.coverCategory);
      else img.src = placeholderDataURI(item.caption || city.name, city.coverCategory, 640, 420);
      const link = el("a", {
        class: "gallery-link",
        href: src || "#",
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": `\u67E5\u770B\u5927\u56FE\uFF1A${item.caption || city.name}`
      }, [img, el("span", { class: "gallery-caption", text: item.caption || "" })]);
      grid.appendChild(el("figure", { class: "gallery-item" }, [link]));
    });
    box.appendChild(grid);
    box.appendChild(el("p", { class: "gallery-source", text: "\u56FE\u7247\uFF1A\u767E\u5EA6\u767E\u79D1\u8BCD\u6761\u914D\u56FE\uFF1B\u7248\u6743\u5F52\u539F\u4F5C\u8005\u4E0E\u673A\u6784\u6240\u6709\u3002" }));
  }
  function renderDetail(city, herFeats, refEvents) {
    const box = document.getElementById("city-detail");
    box.innerHTML = "";
    box.appendChild(el("h3", { text: "\u5386\u53F2\u5730\u6807" }));
    if (herFeats.length) {
      const list = el("div", { class: "place-list" });
      herFeats.forEach((f) => {
        const p = f.properties;
        const iconUrl = markerIconDataURL("mk-" + p.category);
        const nodeId = "her-" + p.id;
        const item = el("button", { class: "place-item", type: "button", "data-node-id": nodeId }, [
          iconUrl ? el("img", { class: "pi-icon", src: iconUrl, alt: "" }) : el("span", { class: "pi-dot", style: `background:${categoryColor(p.category)}` }),
          el("div", { style: "flex:1;min-width:0;" }, [
            el("div", { class: "pi-name", text: p.name }),
            el("div", { class: "pi-meta", text: categoryLabel(p.category) + " \xB7 " + (p.period || "") })
          ])
        ]);
        const realSrc = assetUrl(p.image);
        const thumbImg = el("img", {
          alt: p.name + "\u7167\u7247",
          style: "width:56px;height:38px;object-fit:cover;border-radius:0;border:1px solid var(--line);flex:none;"
        });
        if (realSrc) loadImage(thumbImg, realSrc, p.name, p.category);
        else thumbImg.src = placeholderDataURI(p.name, p.category, 112, 76);
        item.appendChild(thumbImg);
        item.addEventListener("click", () => {
          focusNodeOnMap({
            id: nodeId,
            coords: f.geometry.coordinates,
            color: categoryColor(p.category),
            html: richPlaceCard(p),
            pan: true
          });
        });
        list.appendChild(item);
      });
      box.appendChild(list);
    } else {
      box.appendChild(el("p", { style: "color:var(--muted);font-size:13px;", text: "\u8BE5\u57CE\u5E02\u5728\u9057\u4EA7\u540D\u5F55\u4E2D\u6682\u65E0\u72EC\u7ACB\u6761\u76EE\u3002" }));
    }
    box.appendChild(el("h3", { text: "\u6539\u9769\u5F00\u653E\u5173\u952E\u4E8B\u4EF6" }));
    if (refEvents.length) {
      const list = el("div", { class: "place-list" });
      refEvents.forEach((e) => {
        const iconUrl = markerIconDataURL("rk-" + e.type);
        const nodeId = "ref-" + e.id;
        const item = el("button", { class: "place-item", type: "button", "data-node-id": nodeId }, [
          iconUrl ? el("img", { class: "pi-icon", src: iconUrl, alt: "" }) : el("span", { class: "pi-dot", style: `background:${REFORM_COLORS[e.type] || "#ccc"}` }),
          el("div", {}, [el("div", { class: "pi-name", text: `${e.year} \xB7 ${e.title}` }), el("div", { class: "pi-meta", text: e.type })])
        ]);
        item.addEventListener("click", () => {
          focusNodeOnMap({
            id: nodeId,
            coords: e.coordinates,
            color: REFORM_COLORS[e.type] || "#bf3718",
            html: richReformCard(e),
            pan: true
          });
        });
        list.appendChild(item);
      });
      box.appendChild(list);
    } else {
      box.appendChild(el("p", { style: "color:var(--muted);font-size:13px;", text: "\u8BE5\u57CE\u5E02\u5728\u6539\u9769\u5F00\u653E\u4E8B\u4EF6\u5E93\u4E2D\u6682\u65E0\u6807\u6CE8\u4E8B\u4EF6\u3002" }));
    }
    const st = CITY_STATS[city.key];
    if (st && Array.isArray(st.population) && st.population.length) {
      box.appendChild(el("h3", { text: `${city.name} 1980-2020 \u4EBA\u53E3\u4E0E GDP \u8DC3\u8FC1` }));
      const chartDom = el("div", { style: "width:100%;height:195px;margin-top:4px;" });
      box.appendChild(chartDom);
      const years = st.population.map((x) => String(x[0]));
      const pops = st.population.map((x) => x[1]);
      const gdps = (st.gdp || []).map((x) => x[1]);
      setTimeout(() => {
        createChart(chartDom, dualAxisCityOption(years, pops, gdps));
      }, 30);
    }
    box.appendChild(el("h3", { text: "\u7A7A\u95F4\u53D8\u5316\u4E0E\u7F13\u51B2\u533A\u5206\u6790" }));
    box.appendChild(el("p", { style: "color:var(--muted);font-size:12.5px;", text: `\u8FDB\u5165 GIS \u5206\u6790\u5B9E\u9A8C\u5BA4\uFF0C\u5BF9 ${city.name} \u8FDB\u884C\u591A\u671F\u5EFA\u6210\u533A\u5377\u5E18\u5BF9\u6BD4\u4E0E PostGIS \u6D4B\u5730\u7F13\u51B2\u533A\u5206\u6790\u3002` }));
    const buildSuffix = window.__LOCAL_FILE_BUILD__ ? "" : "&build=20261028b";
    const btn = el("a", { id: "to-analysis", class: "btn btn-primary btn-sm", href: `analysis.html?city=${city.key}${buildSuffix}`, text: `\u5206\u6790 ${city.name} \u5EFA\u6210\u533A\u4E0E\u7F13\u51B2\u533A` });
    box.appendChild(btn);
  }

  // scripts/local-entries/cities.js
  initShell();
  initCitiesPage();
})();
