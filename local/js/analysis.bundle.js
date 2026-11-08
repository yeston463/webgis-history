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
  var TIANDITU_TK = "6a7dc42ae90a528588b9f69989ae4e66";
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
    return subs.map((s) => `tdtQ://${encodeURIComponent(`https://${s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer.split("_")[0]}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${TIANDITU_TK}`).replace(/%7B/g, "{").replace(/%7D/g, "}")}`);
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
  var basemapWatchers = /* @__PURE__ */ new Set();
  var tdtHealth = { fails: [], swapped: false, probeWins: 0, probeTimer: null };
  var WB_FB_SRC_LAND = "wb-fb-land-src";
  var WB_FB_SRC_DASH = "wb-fb-dash-src";
  var WB_FB_L_LAND = "wb-fb-land";
  var WB_FB_L_PROV = "wb-fb-prov";
  var WB_FB_L_DASH = "wb-fb-dash";
  var WB_TEN_DASH_COORDS = [
    [[109.51763678906526, 16.360467782665847], [109.72339159230361, 16.05587198177934], [109.8780414893003, 15.766823920473868], [109.96506402665503, 15.526031073258686], [109.98526818797363, 15.335615618596712]],
    [[110.48331454715199, 12.431407837351566], [110.48240767589328, 12.085792287259398], [110.45136562643113, 11.863835000833953], [110.25652028695671, 11.393616070326182]],
    [[108.3388949586325, 7.26656318024262], [108.30727608084116, 6.727803403200289], [108.35631901989032, 6.112648053307836]],
    [[111.94112275674237, 3.553559321848772], [112.40151782268552, 3.646409974664658], [112.92104341055976, 3.845112027649191]],
    [[115.69079809651517, 7.29016984601141], [116.4095482213759, 8.137962397303875]],
    [[118.63503455703679, 11.080904139262175], [118.85587024190139, 11.457907321145406], [119.10128629647166, 12.062751715859875], [119.12181771101825, 12.135585760471585]],
    [[119.60808384544805, 18.143451232827125], [119.91075760817219, 18.77194701315816], [120.11918953031866, 19.117669954512905]],
    [[121.40591812413318, 20.8001943859176], [122.12216430894797, 21.716094829922323]],
    [[122.80328441666389, 23.665545127578547], [123.00481138309124, 24.74934291726869]],
    [[119.16836075308866, 15.107448879733406], [119.16981236678279, 15.755038547478351], [119.17823197590195, 16.265658015720753]]
  ];
  var WB_FB_CITY_LABELS = [
    { name: "\u6DF1\u5733", lng: 114.0579, lat: 22.5431 },
    { name: "\u4E0A\u6D77", lng: 121.4737, lat: 31.2304 },
    { name: "\u5E7F\u5DDE", lng: 113.2644, lat: 23.1291 },
    { name: "\u53A6\u95E8", lng: 118.0894, lat: 24.4798 },
    { name: "\u5317\u4EAC", lng: 116.4074, lat: 39.9042 },
    { name: "\u676D\u5DDE", lng: 120.1551, lat: 30.2741 },
    { name: "\u6B66\u6C49", lng: 114.3055, lat: 30.5928 },
    { name: "\u6210\u90FD", lng: 104.0668, lat: 30.5728 },
    { name: "\u9752\u5C9B", lng: 120.3826, lat: 36.0671 }
  ];
  var wbFbDataPromise = null;
  function wbFbGeoJson() {
    if (!wbFbDataPromise) {
      wbFbDataPromise = fetchJSON(dataUrl("china-provinces.geojson"), { noCache: true }).then((provinces) => ({ provinces })).catch((err) => {
        wbFbDataPromise = null;
        throw err;
      });
    }
    return wbFbDataPromise;
  }
  function wbFbPreload() {
    if (wbFbDataPromise) return;
    setTimeout(() => {
      try {
        wbFbGeoJson().catch(() => {
        });
      } catch (e) {
      }
    }, 300);
  }
  function polygonCentroid(geom) {
    try {
      const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
      let sx = 0, sy = 0, n = 0;
      for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
        sx += x;
        sy += y;
        n += 1;
      }
      return n ? { lng: sx / n, lat: sy / n } : null;
    } catch (e) {
      return null;
    }
  }
  function ensureFbLayers(map2, provinces) {
    if (!map2.getSource(WB_FB_SRC_LAND)) {
      map2.addSource(WB_FB_SRC_LAND, { type: "geojson", data: provinces });
    }
    if (!map2.getSource(WB_FB_SRC_DASH)) {
      map2.addSource(WB_FB_SRC_DASH, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { name: "\u5341\u6BB5\u7EBF" },
            geometry: { type: "MultiLineString", coordinates: WB_TEN_DASH_COORDS }
          }]
        }
      });
      map2._wbFbDashCoords = WB_TEN_DASH_COORDS;
      map2._wbFbProvNames = (() => {
        try {
          const names = /* @__PURE__ */ new Set();
          for (const f of provinces.features || []) {
            const n = f.properties && f.properties.name;
            if (n && !/^(香港|澳门)特别行政区$/.test(n)) names.add(n);
          }
          return [...names];
        } catch (e) {
          return [];
        }
      })();
    }
    const anchor = ["bu3d-city-ov", "bu3d-city", "tdt-vec", "tdt-cva"].find((id) => map2.getLayer(id)) || void 0;
    let at = anchor;
    if (!map2.getLayer(WB_FB_L_LAND)) {
      map2.addLayer({
        id: WB_FB_L_LAND,
        type: "fill",
        source: WB_FB_SRC_LAND,
        paint: { "fill-color": "#ece2cc", "fill-opacity": 0.97 }
      }, at);
      at = WB_FB_L_LAND;
    }
    if (!map2.getLayer(WB_FB_L_PROV)) {
      map2.addLayer({
        id: WB_FB_L_PROV,
        type: "line",
        source: WB_FB_SRC_LAND,
        paint: { "line-color": "#c3b28c", "line-width": 0.9, "line-opacity": 0.9 }
      }, at);
      at = WB_FB_L_PROV;
    }
    if (!map2.getLayer(WB_FB_L_DASH)) {
      map2.addLayer({
        id: WB_FB_L_DASH,
        type: "line",
        source: WB_FB_SRC_DASH,
        paint: { "line-color": "#9a5524", "line-width": 1.8, "line-dasharray": [2, 1.8], "line-opacity": 0.95 }
      }, at);
    }
  }
  function ensureFbMarkers(map2, provinces) {
    if (map2._wbFbMarkers) return;
    const made = [];
    const add = (lng, lat, cls, text, isCity) => {
      const node = el("span", { class: `wbfb-label ${cls}` });
      node.textContent = text;
      node._wbCity = !!isCity;
      made.push(new maplibregl.Marker({ element: node, anchor: "center" }).setLngLat([lng, lat]).addTo(map2));
    };
    const seen = /* @__PURE__ */ new Set();
    for (const f of provinces.features || []) {
      const name = f.properties && f.properties.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (/^(香港|澳门)特别行政区$/.test(name)) continue;
      const c = polygonCentroid(f.geometry);
      if (c) add(c.lng, c.lat, "wbfb-label-prov", name, false);
    }
    add(114.6, 13.6, "wbfb-label-dash", "\u5357\u6D77\u8BF8\u5C9B", false);
    for (const c of WB_FB_CITY_LABELS) add(c.lng, c.lat, "wbfb-label-city", c.name, true);
    const sync = () => {
      let showCity = false;
      try {
        showCity = map2.getZoom() >= 6.3;
      } catch (e) {
        return;
      }
      for (const mk of made) {
        const node = mk.getElement();
        node.style.display = !!node._wbCity === showCity ? "block" : "none";
      }
    };
    map2.on("zoom", sync);
    sync();
    map2._wbFbMarkers = {
      made,
      off() {
        try {
          map2.off("zoom", sync);
        } catch (e) {
        }
        for (const mk of made) {
          try {
            mk.remove();
          } catch (e) {
          }
        }
      }
    };
  }
  async function swapMapBasemap(map2, on) {
    if (!map2 || map2._wbRemoved) return;
    for (const id of BASE_ONLINE_LAYERS) {
      if (map2.getLayer(id)) map2.setLayoutProperty(id, "visibility", on ? "none" : "visible");
    }
    if (!on) {
      for (const id of [WB_FB_L_LAND, WB_FB_L_PROV, WB_FB_L_DASH]) {
        if (map2.getLayer(id)) map2.setLayoutProperty(id, "visibility", "none");
      }
      if (map2._wbFbMarkers) {
        map2._wbFbMarkers.off();
        map2._wbFbMarkers = null;
      }
      return;
    }
    try {
      const { provinces } = await wbFbGeoJson();
      ensureFbLayers(map2, provinces);
      ensureFbMarkers(map2, provinces);
      for (const id of [WB_FB_L_LAND, WB_FB_L_PROV, WB_FB_L_DASH]) {
        if (map2.getLayer(id)) map2.setLayoutProperty(id, "visibility", "visible");
      }
    } catch (err) {
      console.warn("[basemap] \u81EA\u7ED8\u964D\u7EA7\u5E95\u56FE\u6570\u636E\u52A0\u8F7D\u5931\u8D25", err);
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
  async function swapToFallback() {
    flushTdtQueue("fallback");
    for (const map2 of basemapWatchers) {
      try {
        await swapMapBasemap(map2, true);
      } catch (e) {
      }
    }
    announceFallback(true, {
      name: "\u81EA\u7ED8\u4E2D\u56FD\u6807\u51C6\u77E2\u91CF\u5E95\u56FE",
      attr: "\u7701\u7EA7\u533A\u5212\uFF08\u542B\u53F0\u6E7E\u7701\uFF09\u4E0E\u5341\u6BB5\u7EBF\u5747\u4E3A\u4ED3\u5E93\u81EA\u7ED8\u6570\u636E"
    });
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
              swapMapBasemap(map2, false).catch(() => {
              });
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
    wbFbPreload();
    if (tdtHealth.swapped) swapMapBasemap(map2, true).catch(() => {
    });
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
  function basemapFallbackActive() {
    return tdtHealth.swapped;
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
  function repairBasemapTiles(map2) {
    if (!map2 || map2._wbRemoved || typeof map2.isStyleLoaded !== "function") return;
    if (basemapFallbackActive()) return;
    let once = 0;
    const attempt = () => {
      if (!map2 || map2._wbRemoved) return;
      let reloaded = false;
      try {
        const caches = map2.style && map2.style.sourceCaches || {};
        for (const id of BASE_ONLINE_LAYERS) {
          const c = caches[id];
          if (!c || typeof c.reload !== "function" || typeof c.loaded !== "function") continue;
          if (!c.loaded()) {
            try {
              c.reload();
              reloaded = true;
            } catch (e) {
            }
          }
        }
      } catch (e) {
      }
      once += 1;
      if (reloaded && once < 4) setTimeout(attempt, 2600);
    };
    attempt();
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
  var _activePopup = null;
  function closePopup() {
    if (_activePopup) {
      try {
        _activePopup.remove();
      } catch (e) {
      }
      _activePopup = null;
    }
  }
  function showPopup(map2, lngLat, html, opts = {}) {
    closePopup();
    const popupOpts = {
      closeButton: true,
      closeOnClick: opts.closeOnClick ?? true,
      offset: opts.offset ?? 16,
      focusAfterOpen: false,
      maxWidth: opts.maxWidth || "272px",
      className: opts.className || ""
    };
    if (opts.anchor) popupOpts.anchor = opts.anchor;
    const popup = new maplibregl.Popup(popupOpts).setLngLat(lngLat).setHTML(html).addTo(map2);
    const elRoot = popup.getElement && popup.getElement();
    if (elRoot) {
      elRoot.querySelectorAll("img[data-fallback]").forEach((img) => {
        img.addEventListener("error", () => {
          const fb = img.getAttribute("data-fallback");
          if (fb && img.src !== fb) img.src = fb;
        }, { once: true });
      });
    }
    _activePopup = popup;
    popup.on("close", () => {
      if (_activePopup === popup) _activePopup = null;
    });
    return popup;
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
  async function setChoroplethVisible(map2, visible, field2 = "heritage_count") {
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
            ["coalesce", ["get", field2], 0],
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
        ["coalesce", ["get", field2], 0],
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
  var CORAL = "#c63a18";
  var CORAL_BRIGHT = "#e04925";
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
  function baseGrid() {
    return { left: 52, right: 24, top: 38, bottom: 32 };
  }
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
  function barOption(categories, values, { name = "", color = CORAL_BRIGHT, unit = "" } = {}) {
    return {
      grid: baseGrid(),
      tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
      xAxis: { type: "category", data: categories, ...axisStyle() },
      yAxis: { type: "value", name: unit, nameTextStyle: { color: "rgba(9, 11, 17, 0.68)", fontWeight: 600 }, ...axisStyle() },
      series: [{ name, type: "bar", data: values, itemStyle: { color, borderRadius: 0 }, barWidth: "48%" }]
    };
  }
  var MINUS = "\u2212";
  var signed = (n, digits = 1) => `${n < 0 ? MINUS : "+"}${Math.abs(n).toFixed(digits)}`;
  var fmtKm2 = (n) => n.toLocaleString("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  var PERIOD_COLORS = [LILAC, CORAL];
  function computeBuiltupMetrics({ key, label, years, areasKm2 }) {
    const periods = [];
    for (let i = 1; i < years.length; i++) {
      const from = years[i - 1];
      const to = years[i];
      const a0 = areasKm2[i - 1];
      const a1 = areasKm2[i];
      const span = Math.max(1, to - from);
      const delta = a1 - a0;
      periods.push({
        from,
        to,
        span,
        a0,
        a1,
        delta,
        rate: delta / span,
        cagr: a0 > 0 ? (Math.pow(a1 / a0, 1 / span) - 1) * 100 : null
      });
    }
    const first = areasKm2[0];
    const last = areasKm2[areasKm2.length - 1];
    return { key, label, years, areas: areasKm2, periods, mult: first > 0 ? last / first : null };
  }
  function describeBuiltupTrend(m) {
    if (!m || m.periods.length < 2) return "";
    const p1 = m.periods[0];
    const p2 = m.periods[m.periods.length - 1];
    const parts = [];
    const r = p1.rate !== 0 ? p2.rate / p1.rate : null;
    const rates = `${p1.rate.toFixed(1)} \u2192 ${p2.rate.toFixed(1)} km\xB2/\u5E74`;
    if (r != null && r >= 1.15) parts.push(`${p2.from}\u2014${p2.to} \u5E74\u5747\u65B0\u589E\u9762\u79EF\u4E3A\u524D\u4E00\u9636\u6BB5\u7684 ${r.toFixed(1)} \u500D\uFF08${rates}\uFF09`);
    else if (r != null && r <= 0.85) parts.push(`${p2.from}\u2014${p2.to} \u5E74\u5747\u65B0\u589E\u9762\u79EF\u6BD4\u524D\u4E00\u9636\u6BB5\u4E0B\u964D ${((1 - r) * 100).toFixed(0)}%\uFF08${rates}\uFF09`);
    else parts.push(`\u4E24\u9636\u6BB5\u5E74\u5747\u65B0\u589E\u9762\u79EF\u57FA\u672C\u6301\u5E73\uFF08${rates}\uFF09`);
    if (p1.cagr != null && p2.cagr != null) {
      parts.push(`\u5E74\u5747\u590D\u5408\u589E\u901F\u7531 ${p1.cagr.toFixed(1)}% \u53D8\u4E3A ${p2.cagr.toFixed(1)}%\uFF08${signed(p2.cagr - p1.cagr)} \u4E2A\u767E\u5206\u70B9\uFF09`);
    }
    if (m.mult != null) parts.push(`${m.years[0]}\u2014${m.years[m.years.length - 1]} \u603B\u9762\u79EF\u4E3A\u521D\u671F\u7684 ${m.mult.toFixed(1)} \u500D`);
    return parts.join("\uFF1B");
  }
  function periodTooltip(label, p) {
    const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:18px;"><span style="color:rgba(9,11,17,.62);">${k}</span><strong>${v}</strong></div>`;
    return `<div style="font-weight:700;margin-bottom:6px;">${label} \xB7 ${p.from}\u2014${p.to}\uFF08${p.span} \u5E74\uFF09</div>` + row("\u9762\u79EF", `${fmtKm2(p.a0)} \u2192 ${fmtKm2(p.a1)} km\xB2`) + row("\u51C0\u589E", `${signed(p.delta, 2)} km\xB2`) + row("\u5E74\u5747\u65B0\u589E", `${signed(p.rate)} km\xB2/\u5E74`) + (p.cagr == null ? "" : row("\u5E74\u5747\u590D\u5408\u589E\u901F", `${signed(p.cagr)}%/\u5E74`));
  }
  function niceLinearScale(raw, factor = 1.2, maxSplits = 4) {
    const target = raw * factor;
    if (!(target > 0)) return { max: 10, interval: 5 };
    const exp = Math.pow(10, Math.floor(Math.log10(target)) - 1);
    let best = null;
    for (const m of [1, 2, 2.5, 5, 10, 20, 25, 50, 100]) {
      const tick = m * exp;
      for (let k = 3; k <= maxSplits; k++) {
        const top = tick * k;
        if (top >= target && (!best || top < best.max)) {
          best = { max: +top.toPrecision(6), interval: +tick.toPrecision(6) };
        }
      }
    }
    return best || { max: +target.toPrecision(6), interval: void 0 };
  }
  function builtupExpansionOption(m, { logScale = false, compact = false } = {}) {
    const years = m.years;
    const xMin = years[0];
    const xMax = years[years.length - 1];
    const pad = Math.max(1, Math.round((xMax - xMin) * 0.04));
    const left = compact ? 46 : 70;
    const right = compact ? 14 : 24;
    const areaScale = niceLinearScale(Math.max(...m.areas, 1), 1.18, 5);
    const rateScale = niceLinearScale(Math.max(...m.periods.map((p) => p.rate), 1), 1.32, 4);
    const periodSeriesNames = m.periods.map((p) => `${p.from}\u2014${p.to} \u5E74\u5747\u65B0\u589E`);
    const xAxis = (gridIndex, showLabel) => ({
      type: "value",
      gridIndex,
      min: xMin - pad,
      max: xMax + pad,
      ...axisStyle(),
      splitLine: { show: false },
      axisTick: { customValues: years },
      axisLabel: { ...axisStyle().axisLabel, show: showLabel, customValues: years, formatter: (v) => String(v) }
    });
    return {
      animationDuration: 300,
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      legend: {
        left: 0,
        top: 0,
        itemWidth: 12,
        itemHeight: 8,
        itemGap: compact ? 10 : 16,
        textStyle: { color: "rgba(9, 11, 17, 0.68)", fontSize: compact ? 9.5 : 11.5 },
        data: ["\u5EFA\u6210\u533A\u9762\u79EF", ...periodSeriesNames]
      },
      tooltip: {
        trigger: "item",
        ...TOOLTIP_STYLE,
        formatter: (p) => {
          if (p.seriesIndex === 0) {
            const [yr, area] = p.value;
            return `<div style="font-weight:700;margin-bottom:4px;">${m.label} \xB7 ${yr}</div>\u5EFA\u6210\u533A\u9762\u79EF <strong>${fmtKm2(area)} km\xB2</strong>`;
          }
          const per = m.periods[p.seriesIndex - 1];
          return per ? periodTooltip(m.label, per) : "";
        }
      },
      grid: [
        { left, right, top: compact ? 42 : 48, height: "39%" },
        { left, right, top: compact ? "63%" : "62%", bottom: 26 }
      ],
      xAxis: [xAxis(0, false), xAxis(1, true)],
      yAxis: [
        {
          type: logScale ? "log" : "value",
          gridIndex: 0,
          min: logScale ? void 0 : 0,
          max: logScale ? void 0 : areaScale.max,
          interval: logScale ? void 0 : areaScale.interval,
          name: compact ? "" : logScale ? "\u9762\u79EF km\xB2\uFF08\u5BF9\u6570\uFF09" : "\u9762\u79EF km\xB2",
          nameTextStyle: { color: "rgba(9, 11, 17, 0.68)", fontSize: 10.5, align: "left" },
          ...axisStyle()
        },
        {
          type: "value",
          gridIndex: 1,
          min: 0,
          max: rateScale.max,
          interval: rateScale.interval,
          name: compact ? "" : "\u5E74\u5747\u65B0\u589E km\xB2/\u5E74",
          nameTextStyle: { color: "rgba(9, 11, 17, 0.68)", fontSize: 10.5, align: "left" },
          ...axisStyle()
        }
      ],
      series: [
        {
          name: "\u5EFA\u6210\u533A\u9762\u79EF",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          clip: false,
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: INK, borderColor: "#fffdfb", borderWidth: 2 },
          lineStyle: { color: INK, width: 2 },
          label: {
            show: !compact,
            position: "top",
            distance: 7,
            color: INK,
            fontSize: 11,
            fontFamily: CHART_FONT_MONO,
            formatter: (p) => `${fmtKm2(p.value[1])}`
          },
          data: years.map((y, i) => ({
            value: [y, m.areas[i]],
            label: { offset: [i === 0 ? 14 : i === years.length - 1 ? -14 : 0, 0] }
          }))
        },
        ...m.periods.map((per, idx) => {
          const color = PERIOD_COLORS[idx % PERIOD_COLORS.length];
          return {
            name: periodSeriesNames[idx],
            type: "custom",
            xAxisIndex: 1,
            yAxisIndex: 1,
            itemStyle: { color },
            encode: { x: [0, 1], y: 2 },
            renderItem: (_params, api) => {
              const topLeft = api.coord([api.value(0), api.value(2)]);
              const bottomRight = api.coord([api.value(1), 0]);
              const gap = 2;
              const x = topLeft[0] + gap;
              const width = Math.max(1, bottomRight[0] - topLeft[0] - gap * 2);
              const y = topLeft[1];
              const height = Math.max(0, bottomRight[1] - topLeft[1]);
              const text = compact ? `${per.rate.toFixed(1)}
${per.cagr == null ? "" : signed(per.cagr) + "%"}` : `${per.rate.toFixed(1)} km\xB2/\u5E74${per.cagr == null ? "" : `
\u5E74\u5747\u589E\u901F ${signed(per.cagr)}%`}`;
              return {
                type: "group",
                children: [
                  { type: "rect", shape: { x, y, width, height }, style: { fill: color, opacity: 0.85 } },
                  {
                    type: "text",
                    style: {
                      text,
                      x: x + width / 2,
                      y: y - 4,
                      align: "center",
                      verticalAlign: "bottom",
                      fill: INK,
                      font: `500 ${compact ? 10.5 : 11.5}px ${CHART_FONT_SANS}`,
                      lineHeight: compact ? 13 : 15
                    }
                  }
                ]
              };
            },
            data: [[per.from, per.to, per.rate]]
          };
        })
      ]
    };
  }
  function builtupCompareOption(list, { activeKey, metric = "rate", compact = false, flaggedKeys = [] } = {}) {
    const valid = list.filter((m) => m.periods.length >= 2);
    const ref = valid[0];
    if (!ref) return {};
    const periodNames = ref.periods.map((p) => `${p.from}\u2014${p.to}`);
    const unit = metric === "cagr" ? "%/\u5E74" : "km\xB2/\u5E74";
    const pick = (p) => metric === "cagr" ? p.cagr : p.rate;
    const flagged = new Set(flaggedKeys);
    return {
      animationDuration: 300,
      grid: { left: compact ? 40 : 60, right: compact ? 8 : 20, top: compact ? 40 : 52, bottom: 30 },
      legend: {
        left: 0,
        top: 0,
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { color: "rgba(9, 11, 17, 0.68)", fontSize: compact ? 10 : 11.5 },
        data: periodNames
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        ...TOOLTIP_STYLE,
        formatter: (params) => {
          const m = valid[params[0]?.dataIndex ?? 0];
          if (!m) return "";
          const rows = m.periods.map((p) => periodTooltip(m.label, p)).join('<div style="height:6px"></div>');
          const mult = m.mult == null ? "" : `<div style="margin-top:6px;color:rgba(9,11,17,.62);">${m.years[0]}\u2014${m.years[m.years.length - 1]} \u603B\u9762\u79EF\u4E3A\u521D\u671F\u7684 ${m.mult.toFixed(1)} \u500D</div>`;
          const flag = flagged.has(m.key) ? '<div style="margin-top:4px;color:rgba(9,11,17,.62);">* \u6570\u636E\u53E3\u5F84\u4E0E\u5176\u4ED6\u57CE\u5E02\u4E0D\u540C\uFF0C\u89C1\u56FE\u4E0B\u8BF4\u660E</div>' : "";
          return rows + mult + flag;
        }
      },
      xAxis: {
        type: "category",
        data: valid.map((m) => m.key),
        ...axisStyle(),
        axisLabel: {
          ...axisStyle().axisLabel,
          fontFamily: CHART_FONT_SANS,
          fontSize: compact ? 11 : 12.5,
          interval: 0,
          formatter: (key, idx) => {
            const m = valid[idx];
            const text = m.label + (flagged.has(key) ? "*" : "");
            return key === activeKey ? `{active|${text}}` : text;
          },
          rich: { active: { color: INK, fontWeight: "bold", fontFamily: CHART_FONT_SANS, backgroundColor: "#fff0df", padding: [2, 4] } }
        }
      },
      yAxis: {
        type: "value",
        min: 0,
        name: compact ? "" : unit,
        nameTextStyle: { color: "rgba(9, 11, 17, 0.68)", fontSize: 10.5, align: "left" },
        ...axisStyle()
      },
      series: periodNames.map((name, pi) => ({
        name,
        type: "bar",
        barWidth: compact ? "30%" : "28%",
        barGap: "12%",
        itemStyle: { color: PERIOD_COLORS[pi % PERIOD_COLORS.length], borderRadius: 0 },
        data: valid.map((m) => {
          const p = m.periods[pi];
          const v = p ? pick(p) : null;
          const active = m.key === activeKey;
          return {
            value: v == null ? null : +v.toFixed(2),
            itemStyle: { opacity: active ? 1 : 0.42 },
            label: {
              show: active && !compact && v != null,
              position: "top",
              color: INK,
              fontSize: 10.5,
              fontFamily: CHART_FONT_MONO,
              formatter: () => metric === "cagr" ? `${v.toFixed(1)}%` : v.toFixed(1)
            }
          };
        })
      }))
    };
  }

  // js/analysis.js
  var URBAN = null;
  var mapA = null;
  var mapB = null;
  var mapBuf = null;
  var buChart = null;
  var bufChart = null;
  var startCity = "shenzhen";
  var buView = { mode: "single", scale: "linear", metric: "rate", compact: null };
  var _lastBuCityKey = "shenzhen";
  var _lastBuMetrics = null;
  var _allCityMetricsPromise = null;
  var _buRenderSeq = 0;
  var _mergedCache = /* @__PURE__ */ new Map();
  var _diffCache = /* @__PURE__ */ new Map();
  function initAnalysisPage() {
    bindLifecycle();
    if (guardFileProtocol("#map-loading")) return;
    window.addEventListener("pagehide", () => {
      try {
        if (mapA && !mapA._removed) {
          mapA.remove();
          mapA._removed = true;
        }
      } catch (e) {
      }
      try {
        if (mapB && !mapB._removed) {
          mapB.remove();
          mapB._removed = true;
        }
      } catch (e) {
      }
      try {
        if (mapBuf && !mapBuf._removed) {
          mapBuf.remove();
          mapBuf._removed = true;
        }
      } catch (e) {
      }
      try {
        if (BU3D.timer) clearTimeout(BU3D.timer);
      } catch (e) {
      }
      try {
        if (map3D && !map3D._removed) {
          map3D.remove();
          map3D._removed = true;
        }
      } catch (e) {
      }
      try {
        if (map3D && !map3D._removed) {
          map3D.remove();
          map3D._removed = true;
        }
      } catch (e) {
      }
    });
    const params = new URLSearchParams(location.search);
    startCity = params.get("city") || "shenzhen";
    probeArchitectureStatus();
    fetchJSON(dataUrl("urban-expansion/urban-index.json")).then((urban) => {
      URBAN = urban;
      const cities = URBAN.cities ? Object.keys(URBAN.cities) : [];
      if (cities.length && !cities.includes(startCity)) startCity = cities[0];
      buildControls();
      buildLabA();
      initBuChartControls();
      initLayerPanel(document.getElementById("layer-panel"), () => mapA, {
        layers: [
          {
            id: "newbu-toggle",
            label: "\u65B0\u589E\u5EFA\u6210\u533A\u5DEE\u503C (\u5E03\u5C14\u5DEE)",
            on: true,
            onChange: (on) => {
              [mapA, mapB].forEach((m) => {
                ["newbu-lyr", "newbu-line"].forEach((lid) => {
                  if (m && m.getLayer && m.getLayer(lid)) {
                    m.setLayoutProperty(lid, "visibility", on ? "visible" : "none");
                  }
                });
              });
            }
          }
        ],
        customLegend: [
          { color: "rgba(200, 90, 23, 0.56)", border: "#7a2e06", label: "\u8D77\u59CB\u5E74\u5EFA\u6210\u533A (\u5DE6\u5E18)" },
          { color: "rgba(15, 110, 124, 0.34)", border: "#0a4c57", label: "\u5BF9\u6BD4\u5E74\u5B58\u91CF\u57FA\u5E95 (\u53F3\u5E18)" },
          { color: "rgba(224, 62, 26, 0.64)", border: "#7f1907", label: "\u65B0\u589E\u6269\u5F20\u6591\u5757 (ST_Difference)" }
        ],
        resetView: () => {
          const curCity = (document.querySelector("#a-controls select") || {}).value || startCity;
          jumpSwipeToCity(curCity, true);
        },
        resetLabel: "\u590D\u4F4D \xB7 \u5F53\u524D\u57CE\u5E02",
        measure: false
      });
      window.analysisAPI = {
        setCity: (c) => {
          const s = document.querySelector("#a-controls select");
          if (s) {
            s.value = c;
            s.dispatchEvent(new Event("change"));
          }
        },
        loadYears: (a, b) => {
          const s = document.querySelectorAll("#a-controls select");
          s[1].value = a;
          s[2].value = b;
          reloadA(false);
        }
      };
    }).catch((e) => toast("\u5206\u6790\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A" + e.message, "error", 4e3));
    initPostgisBufferLab();
    initOgcAndInsertPanel();
    initBuiltup3D();
  }
  async function probeArchitectureStatus() {
    const bPg = document.getElementById("badge-pg");
    const bGs = document.getElementById("badge-gs");
    if (window.__LOCAL_FILE_BUILD__) {
      if (bPg) {
        bPg.textContent = "\u672C\u5730\u6587\u4EF6\u7248 \xB7 Turf.js \u6D4B\u5730\u5F15\u64CE";
        bPg.className = "tag tag-blue";
      }
      if (bGs) {
        bGs.textContent = "OGC \u670D\u52A1\u9700\u672C\u5730\u5168\u6808";
        bGs.className = "tag tag-blue";
      }
      return;
    }
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const st = await res.json();
        if (bPg) {
          bPg.textContent = st.postgis.engineLabel;
          bPg.className = "tag tag-blue";
        }
        if (bGs) {
          bGs.textContent = st.geoserver.serviceLabel;
          bGs.className = "tag tag-blue";
        }
        return;
      }
    } catch (e) {
    }
    if (bPg) bPg.textContent = "\u79BB\u7EBF\u6D4B\u5730\u5F15\u64CE (Turf.js)";
    if (bGs) bGs.textContent = "\u672C\u5730\u9759\u6001\u8981\u7D20\u6E90";
  }
  function cityZoom(city) {
    if (city === "xiamen") return 9.6;
    if (city === "shanghai" || city === "beijing" || city === "guangzhou") return 8.3;
    if (city === "wuhan" || city === "chengdu" || city === "hangzhou") return 8.6;
    return 8.8;
  }
  function jumpSwipeToCity(city, animate = true) {
    if (!URBAN || !URBAN.cities || !URBAN.cities[city]) return;
    const meta = URBAN.cities[city];
    if (!Array.isArray(meta.center)) return;
    const z = cityZoom(city);
    if (mapA) {
      try {
        mapA.stop();
      } catch (e) {
      }
      if (animate) {
        mapA.easeTo({ center: meta.center, zoom: z, bearing: 0, pitch: 0, duration: 600, essential: true });
      } else {
        mapA.jumpTo({ center: meta.center, zoom: z, bearing: 0, pitch: 0 });
      }
    }
    if (mapB) {
      try {
        mapB.stop();
      } catch (e) {
      }
      mapB.jumpTo({ center: meta.center, zoom: z, bearing: 0, pitch: 0 });
    }
    syncMaps();
    setTimeout(syncMaps, 120);
    setTimeout(syncMaps, 650);
  }
  function isSwipeMapReady(m) {
    if (!m) return false;
    if (m._swipeReady) return true;
    return Boolean(m.style && m.style._loaded);
  }
  function buildControls() {
    const ctl = document.getElementById("a-controls");
    if (!ctl) return;
    ctl.innerHTML = "";
    const years = (c) => URBAN.cities[c].years;
    const citySel = field("\u57CE\u5E02", selectEl(Object.keys(URBAN.cities).map((c) => [c, URBAN.cities[c].label]), startCity));
    const yaSel = field("\u8D77\u59CB\u5E74\u4EFD", selectEl(years(startCity).map((y) => [String(y), String(y)]), String(years(startCity)[0])));
    const ybSel = field("\u5BF9\u6BD4\u5E74\u4EFD", selectEl(years(startCity).map((y) => [String(y), String(y)]), String(years(startCity).slice(-1)[0])));
    citySel.querySelector("select").addEventListener("change", (e) => {
      const c = e.target.value;
      const ys = years(c);
      replaceOptions(yaSel, ys.map((y) => [String(y), String(y)]), String(ys[0]));
      replaceOptions(ybSel, ys.map((y) => [String(y), String(y)]), String(ys[ys.length - 1]));
      jumpSwipeToCity(c, false);
      loadBuiltup(c, ys[0], ys[ys.length - 1], true);
      if (BU3D.started) {
        applyCity(c).catch(() => {
        });
      } else {
        BU3D.city = c;
      }
    });
    yaSel.querySelector("select").addEventListener("change", () => reloadA(false));
    ybSel.querySelector("select").addEventListener("change", () => reloadA(false));
    ctl.appendChild(citySel);
    ctl.appendChild(yaSel);
    ctl.appendChild(ybSel);
    const note = document.getElementById("a-note");
    if (note && URBAN && URBAN.metadata && URBAN.metadata.note) note.textContent = URBAN.metadata.note;
  }
  function reloadA(moveCamera = false) {
    const c = document.querySelector("#a-controls select").value;
    const ya = document.querySelectorAll("#a-controls select")[1].value;
    const yb = document.querySelectorAll("#a-controls select")[2].value;
    loadBuiltup(c, Number(ya), Number(yb), moveCamera);
  }
  function buildLabA() {
    const divider = document.getElementById("swipe-divider");
    const wrap = document.getElementById("swipe-wrap");
    let dragging = false;
    const applyPos = (p) => {
      const next = Math.max(2, Math.min(98, p));
      divider.style.left = next + "%";
      const mb = document.getElementById("map-b");
      if (mb) mb.style.clipPath = `inset(0 0 0 ${next}%)`;
      divider.setAttribute("aria-valuenow", String(Math.round(next)));
      divider.setAttribute("aria-valuetext", `\u5377\u5E18\u4F4D\u7F6E ${Math.round(next)}%`);
    };
    const setPos = (clientX) => {
      const r = wrap.getBoundingClientRect();
      if (!r.width) return;
      applyPos((clientX - r.left) / r.width * 100);
    };
    divider.addEventListener("pointerdown", (e) => {
      dragging = true;
      divider.setPointerCapture(e.pointerId);
    });
    divider.addEventListener("pointermove", (e) => {
      if (dragging) setPos(e.clientX);
    });
    divider.addEventListener("pointerup", () => {
      dragging = false;
    });
    divider.addEventListener("keydown", (e) => {
      const cur = parseFloat(divider.style.left) || 50;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        applyPos(cur + (e.key === "ArrowRight" ? 2 : -2));
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        applyPos(e.key === "Home" ? 2 : 98);
      }
    });
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target === divider) return;
      setPos(e.clientX);
    });
    const applyClip = () => {
      const r = wrap.getBoundingClientRect();
      if (!r || !r.width) return false;
      setPos(r.left + r.width / 2);
      return true;
    };
    if (!applyClip()) {
      let tries = 0;
      const t = setInterval(() => {
        if (applyClip() || ++tries > 40) clearInterval(t);
      }, 120);
    }
    const years = URBAN.cities[startCity].years;
    loadBuiltup(startCity, years[0], years.slice(-1)[0], true);
  }
  function ensureSwipeCurtainBadges() {
    const host = document.getElementById("map-slot");
    if (!host) return;
    if (!document.getElementById("swipe-badge-left")) {
      host.appendChild(el("div", { id: "swipe-badge-left", class: "swipe-year-badge is-left", "aria-hidden": "true" }));
    }
    if (!document.getElementById("swipe-badge-right")) {
      host.appendChild(el("div", { id: "swipe-badge-right", class: "swipe-year-badge is-right", "aria-hidden": "true" }));
    }
  }
  function ensureSwipeMaps() {
    if (mapA) return;
    const initMeta = URBAN && URBAN.cities && URBAN.cities[startCity] || { center: [114.06, 22.55] };
    const initCenter = initMeta.center || [114.06, 22.55];
    const initZ = cityZoom(startCity);
    const style = buildOnlineStyle();
    mapA = new maplibregl.Map({
      container: "map-a",
      style,
      center: initCenter,
      zoom: initZ,
      minZoom: TIANDITU_MIN_ZOOM,
      maxZoom: TIANDITU_MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false
    });
    mapB = new maplibregl.Map({
      container: "map-b",
      style,
      center: initCenter,
      zoom: initZ,
      minZoom: TIANDITU_MIN_ZOOM,
      maxZoom: TIANDITU_MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      interactive: false
    });
    mapA.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapA.addControl(new maplibregl.ScaleControl({ maxWidth: 108, unit: "metric" }), "bottom-right");
    const slot = document.getElementById("map-slot");
    const ctrlBox = mapA.getContainer() && mapA.getContainer().querySelector(".maplibregl-control-container");
    if (slot && ctrlBox) slot.appendChild(ctrlBox);
    bindZoomLimitControl(mapA, slot);
    ensureSwipeCurtainBadges();
    let readyCount = 0;
    const onReady = async () => {
      readyCount++;
      if (readyCount < 2) return;
      await setupBasemap(mapA);
      await setupBasemap(mapB);
      mapA._basemapMode = "online";
      mapB._basemapMode = "online";
      mapA._swipeReady = true;
      mapB._swipeReady = true;
      attachSwipeStatusBar();
      loadBuiltup(
        document.querySelector("#a-controls select").value,
        Number(document.querySelectorAll("#a-controls select")[1].value),
        Number(document.querySelectorAll("#a-controls select")[2].value),
        true
      );
    };
    mapA.on("load", onReady);
    mapB.on("load", onReady);
    mapA.on("move", syncMaps);
    mapA.on("error", () => {
    });
    mapB.on("error", () => {
    });
    window.__swipeA = mapA;
    window.__swipeB = mapB;
  }
  function attachSwipeStatusBar() {
    const host = document.getElementById("map-slot");
    if (!host || !mapA || host.querySelector(".map-statusbar")) return;
    const suffix = " \xB7 \u5EFA\u6210\u533A\u4E3A AUE / GHSL \u9065\u611F\u89E3\u8BD1\u6570\u636E";
    const bar = document.createElement("div");
    bar.className = "map-statusbar";
    bar.innerHTML = `
    <div class="msb-item"><span class="msb-label">\u4E2D\u5FC3\u70B9</span><span class="msb-value" data-sb="center">-</span></div>
    <div class="msb-item"><span class="msb-label">\u7F29\u653E</span><span class="msb-value" data-sb="zoom">-</span></div>
    <div class="msb-item"><span class="msb-label">\u6BD4\u4F8B\u5C3A</span><span class="msb-value" data-sb="scale">-</span></div>
    <div class="msb-item"><span class="msb-label">\u5BF9\u6BD4</span><span class="msb-value">\u5377\u5E18\u53CC\u56FE \xB7 \u5DE6\u8D77\u59CB / \u53F3\u5BF9\u6BD4+\u65B0\u589E</span></div>
    <div class="msb-spacer"></div>
    <div class="msb-item"><span class="msb-credit" data-suffix="${suffix}">${basemapLabel()}${suffix}</span></div>`;
    host.appendChild(bar);
    const cEl = bar.querySelector('[data-sb="center"]');
    const zEl = bar.querySelector('[data-sb="zoom"]');
    const sEl = bar.querySelector('[data-sb="scale"]');
    const M_PER_PX_AT_EQ = 156543.03392;
    const update = () => {
      try {
        const c = mapA.getCenter();
        const z = mapA.getZoom();
        cEl.textContent = `${Math.abs(c.lat).toFixed(4)}\xB0${c.lat >= 0 ? "N" : "S"} ${Math.abs(c.lng).toFixed(4)}\xB0${c.lng >= 0 ? "E" : "W"}`;
        zEl.textContent = formatZoomReadout(mapA);
        const latFactor = Math.max(0.05, Math.cos(c.lat * Math.PI / 180));
        const metersPerPx = M_PER_PX_AT_EQ * latFactor / Math.pow(2, z);
        const groundPerCm = metersPerPx * (96 / 2.54);
        let sVal = groundPerCm, u = "m";
        if (sVal >= 1e3) {
          sVal /= 1e3;
          u = "km";
        }
        sEl.textContent = `1cm \u2248 ${sVal >= 100 ? Math.round(sVal) : sVal.toFixed(sVal < 10 ? 2 : 1)} ${u}`;
      } catch (e) {
      }
    };
    mapA.on("move", update);
    mapA.on("zoom", update);
    update();
  }
  function syncMaps() {
    if (!mapA || !mapB) return;
    mapB.jumpTo({ center: mapA.getCenter(), zoom: mapA.getZoom(), bearing: mapA.getBearing(), pitch: mapA.getPitch() });
  }
  function whenMapReady(map2, cb, timeoutMs = 4e3) {
    if (!map2) return;
    const ready = () => isSwipeMapReady(map2);
    if (ready()) {
      cb();
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      if (ready() || Date.now() - t0 > timeoutMs) {
        try {
          cb();
        } catch (e) {
        }
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  }
  async function getMergedCityYear(city, yr) {
    const key = `${city}_${yr}`;
    if (_mergedCache.has(key)) return _mergedCache.get(key);
    const fc = await fetchJSON(dataUrl(`urban-expansion/${city}_${yr}.geojson`));
    const merged = mergeBuiltup(fc);
    let area = 0;
    if (merged) {
      try {
        area = turf.area(merged);
      } catch (e) {
      }
    } else {
      (fc.features || []).forEach((f) => {
        try {
          area += turf.area(f);
        } catch (e) {
        }
      });
    }
    const entry = { fc, merged, area };
    _mergedCache.set(key, entry);
    return entry;
  }
  var _lastSwipeCity = null;
  var _buReqSeq = 0;
  async function loadBuiltup(city, ya, yb, moveCamera = false, _retryDepth = 0) {
    const reqId = _retryDepth === 0 ? ++_buReqSeq : _buReqSeq;
    ensureSwipeMaps();
    if (!mapA || !mapB) {
      if (_retryDepth < 5) setTimeout(() => loadBuiltup(city, ya, yb, moveCamera, _retryDepth + 1), 120);
      return;
    }
    if (moveCamera || _lastSwipeCity !== city) {
      _lastSwipeCity = city;
      jumpSwipeToCity(city, false);
    }
    if (!isSwipeMapReady(mapA) || !isSwipeMapReady(mapB)) {
      if (_retryDepth < 4) {
        whenMapReady(mapA, () => whenMapReady(mapB, () => {
          if (reqId === _buReqSeq) loadBuiltup(city, ya, yb, moveCamera, _retryDepth + 1);
        }));
      }
      return;
    }
    const meta = URBAN.cities[city];
    if (!meta) return;
    const [yearEntries, pgBuiltup] = await Promise.all([
      Promise.all(meta.years.map((y) => getMergedCityYear(city, y))),
      window.__LOCAL_FILE_BUILD__ ? Promise.resolve(null) : fetch(`/api/spatial/builtup?city=${encodeURIComponent(city)}&ya=${ya}&yb=${yb}&slim=1`).then((r) => r.ok ? r.json() : null).catch(() => null)
    ]);
    if (reqId !== _buReqSeq) return;
    const areas = meta.years.map((y, idx) => [y, yearEntries[idx].area]);
    const entryA = await getMergedCityYear(city, ya);
    const entryB = await getMergedCityYear(city, yb);
    if (reqId !== _buReqSeq) return;
    const okA = putBuiltup(mapA, "bu", entryA.fc, "#c85a17", 0.52, "#7a2e06", 1.45);
    const okB = putBuiltup(mapB, "bu", entryB.fc, "#0f6e7c", 0.28, "#0a4c57", 1.15);
    if (!okA || !okB) {
      if (_retryDepth < 3) {
        whenMapReady(mapA, () => whenMapReady(mapB, () => {
          if (reqId === _buReqSeq) loadBuiltup(city, ya, yb, moveCamera, _retryDepth + 1);
        }));
      }
      return;
    }
    const areaA = entryA.area, areaB = entryB.area;
    const delta = areaB - areaA;
    const rate = areaA > 0 ? delta / areaA * 100 : null;
    const diffKey = `${city}_${ya}_${yb}`;
    let diffResult = _diffCache.get(diffKey);
    if (!diffResult) {
      let newArea = null;
      let diffFc = { type: "FeatureCollection", features: [] };
      try {
        if (entryA.merged && entryB.merged) {
          const diff = turf.difference(entryB.merged, entryA.merged);
          if (diff && diff.geometry) {
            newArea = turf.area(diff);
            diffFc = { type: "FeatureCollection", features: Array.isArray(diff) ? diff : [diff] };
          }
        }
      } catch (e) {
      }
      if (newArea == null && pgBuiltup && pgBuiltup.newArea != null) {
        newArea = pgBuiltup.newArea;
      }
      diffResult = { newArea, diffFc };
      _diffCache.set(diffKey, diffResult);
    }
    putBuiltup(mapB, "newbu", diffResult.diffFc, "#e03e1a", 0.62, "#7f1907", 1.35);
    if (mapA.getSource("newbu-src")) {
      mapA.getSource("newbu-src").setData({ type: "FeatureCollection", features: [] });
    }
    _lastBuCityKey = city;
    _lastBuMetrics = computeBuiltupMetrics({
      key: city,
      label: meta.label,
      years: meta.years,
      areasKm2: areas.map((a) => a[1] / 1e6)
    });
    const note = document.getElementById("a-note");
    if (note) {
      const engineTag = pgBuiltup && pgBuiltup.engine || (window.__LOCAL_FILE_BUILD__ ? "Turf.js \u692D\u7403\u6D4B\u5730\u8BA1\u7B97" : "PostGIS (ST_UnaryUnion + ST_Area) + Turf.js");
      const trend = describeBuiltupTrend(_lastBuMetrics);
      note.replaceChildren(
        el("strong", { text: `${meta.label}\uFF1A` }),
        document.createTextNode(trend ? `${trend}\u3002` : ""),
        el("span", {
          class: "lab-note-source",
          text: `\u6570\u636E\uFF1A${meta.source || "\u2014"}\uFF1B\u53E3\u5F84\uFF1A${meta.resolution || "\u2014"}\uFF1B\u9762\u79EF\u8BA1\u7B97\uFF1A${engineTag}\u3002`
        })
      );
    }
    renderBuStats({ city: meta.label, ya, yb, areaA, areaB, delta, rate, newArea: diffResult.newArea });
    renderBuChart();
    if (moveCamera) {
      jumpSwipeToCity(city, false);
    } else {
      syncMaps();
    }
  }
  function initBuChartControls() {
    const bindGroup = (selector, attr, key) => {
      const group = document.querySelector(selector);
      if (!group) return;
      group.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
        btn.addEventListener("click", () => {
          const value = btn.dataset[attr];
          if (buView[key] === value) return;
          buView[key] = value;
          group.querySelectorAll(`[data-${attr}]`).forEach((b) => {
            const on = b === btn;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
          });
          renderBuChart();
        });
      });
    };
    bindGroup("#bu-view-group", "view", "mode");
    bindGroup("#bu-scale-group", "scale", "scale");
    bindGroup("#bu-metric-group", "metric", "metric");
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (isBuChartCompact() !== buView.compact) renderBuChart();
      }, 150);
    });
  }
  function isBuChartCompact() {
    const dom = document.getElementById("bu-chart");
    return !!dom && dom.clientWidth > 0 && dom.clientWidth < 620;
  }
  function flaggedBuiltupCities() {
    const cities = URBAN && URBAN.cities || {};
    const ghsl = [];
    const metro = [];
    Object.entries(cities).forEach(([key, meta]) => {
      if (/GHSL|JRC/i.test(meta.source || "")) ghsl.push({ key, meta });
      else if (/广佛|Metropolitan/i.test(`${meta.resolution || ""} ${meta.source || ""}`)) metro.push({ key, meta });
    });
    const parts = [];
    if (ghsl.length) {
      const lastYearNote = ghsl.some(({ meta }) => /2015\s*→\s*2014/.test(meta.source || "")) ? "\uFF0C\u672B\u671F\u4E3A 2015 \u5E74\u6570\u636E\u6309 2014 \u6807\u6CE8" : "";
      parts.push(`${ghsl.map((c) => c.meta.label).join("\u3001")}\u91C7\u7528 JRC GHSL 100m \u5EFA\u6210\u533A${lastYearNote}`);
    }
    if (metro.length) parts.push(`${metro.map((c) => c.meta.label).join("\u3001")}\u4E3A\u5E7F\u4F5B\u8FDE\u7247\u5927\u90FD\u5E02\u533A\u8303\u56F4`);
    if (parts.length) parts.push("\u5176\u4F59\u57CE\u5E02\u4E3A AUE 2016 \u57CE\u5E02\u8F6E\u5ED3\uFF08\u7EA6 30m\uFF09\u3002\u53E3\u5F84\u4E0D\u540C\uFF0C\u8DE8\u57CE\u6570\u503C\u4EC5\u4F5C\u8D8B\u52BF\u53C2\u8003");
    return { keys: [...ghsl, ...metro].map((c) => c.key), caption: parts.length ? `* ${parts.join("\uFF1B")}\u3002` : "" };
  }
  function loadAllCityMetrics() {
    if (!_allCityMetricsPromise) {
      const keys = Object.keys(URBAN && URBAN.cities || {});
      _allCityMetricsPromise = Promise.all(keys.map(async (key) => {
        const meta = URBAN.cities[key];
        const entries = await Promise.all(meta.years.map((y) => getMergedCityYear(key, y)));
        return computeBuiltupMetrics({ key, label: meta.label, years: meta.years, areasKm2: entries.map((e) => e.area / 1e6) });
      })).catch((err) => {
        _allCityMetricsPromise = null;
        throw err;
      });
    }
    return _allCityMetricsPromise;
  }
  function putBuiltup(map2, id, fc, color, opacity = 0.5, lineColor = color, lineWidth = 1.35) {
    if (!isSwipeMapReady(map2)) return false;
    const srcId = id + "-src";
    const lyId = id + "-lyr";
    const lineId = id + "-line";
    try {
      if (!map2.getSource(srcId)) map2.addSource(srcId, { type: "geojson", data: fc });
      else map2.getSource(srcId).setData(fc);
      if (!map2.getLayer(lyId)) {
        map2.addLayer({ id: lyId, type: "fill", source: srcId, paint: { "fill-color": color, "fill-opacity": opacity } });
      } else {
        map2.setPaintProperty(lyId, "fill-color", color);
        map2.setPaintProperty(lyId, "fill-opacity", opacity);
      }
      if (!map2.getLayer(lineId)) {
        const vis = map2.getLayoutProperty(lyId, "visibility") || "visible";
        map2.addLayer({
          id: lineId,
          type: "line",
          source: srcId,
          layout: { "line-join": "round", "line-cap": "round", visibility: vis },
          paint: { "line-color": lineColor, "line-width": lineWidth, "line-opacity": 0.9 }
        });
      } else {
        map2.setPaintProperty(lineId, "line-color", lineColor);
        map2.setPaintProperty(lineId, "line-width", lineWidth);
      }
      restackLayers(map2);
      return true;
    } catch (e) {
      return false;
    }
  }
  function mergeBuiltup(fc) {
    const feats = fc && fc.features || [];
    if (feats.length === 0) return null;
    if (feats.length === 1) return feats[0];
    try {
      const comb = turf.combine(fc);
      if (comb && comb.features && comb.features[0]) return comb.features[0];
    } catch (e) {
    }
    return feats[0];
  }
  function renderBuStats(d) {
    const grid = document.getElementById("bu-stats");
    if (!grid) return;
    grid.innerHTML = "";
    const rateText = d.rate == null ? "-" : (d.rate >= 0 ? "+" : "") + d.rate.toFixed(1) + "%";
    const boxes = [
      [`${d.city} ${d.ya} \u5EFA\u6210\u533A`, formatArea(d.areaA), "\u8D77\u59CB\u89C4\u6A21"],
      [`${d.city} ${d.yb} \u5EFA\u6210\u533A`, formatArea(d.areaB), "\u5BF9\u6BD4\u89C4\u6A21"],
      ["\u9762\u79EF\u53D8\u5316\u91CF", (d.delta >= 0 ? "+" : "") + formatArea(d.delta), "B \u2212 A"],
      ["\u53D8\u5316\u7387", rateText, "\u76F8\u5BF9\u8D77\u59CB"],
      ["\u65B0\u589E\u5EFA\u6210\u533A", d.newArea == null ? "-" : formatArea(d.newArea), "\u7A7A\u95F4\u5206\u5E03"]
    ];
    boxes.forEach(([l, v, s], idx) => {
      grid.appendChild(el("div", { class: "stat-box" + (idx === 2 || idx === 3 ? " stat-box-highlight" : "") }, [
        el("div", { class: "sb-label", text: l }),
        el("div", { class: "sb-value", text: v }),
        el("div", { class: "sb-sub", text: s })
      ]));
    });
    ensureSwipeCurtainBadges();
    const badgeL = document.getElementById("swipe-badge-left");
    const badgeR = document.getElementById("swipe-badge-right");
    if (badgeL) {
      badgeL.innerHTML = `<span class="syb-dir">\u25C0 \u5DE6\u5E18</span><span class="syb-sw" style="background:rgba(200,90,23,0.62);border-color:#7a2e06"></span><strong>${escapeHtml(String(d.ya))}</strong><span class="syb-meta">${escapeHtml(formatArea(d.areaA))}</span>`;
    }
    if (badgeR) {
      badgeR.innerHTML = `<span class="syb-sw" style="background:rgba(224,62,26,0.68);border-color:#7f1907"></span><strong>${escapeHtml(String(d.yb))}</strong><span class="syb-meta">${escapeHtml(formatArea(d.areaB))}${d.rate != null ? " (" + escapeHtml(rateText) + ")" : ""}</span><span class="syb-dir">\u53F3\u5E18 \u25B6</span>`;
    }
  }
  async function renderBuChart() {
    const dom = document.getElementById("bu-chart");
    if (!dom) return;
    const seq = ++_buRenderSeq;
    const compact = isBuChartCompact();
    buView.compact = compact;
    const isCompare = buView.mode === "compare";
    const scaleGroup = document.getElementById("bu-scale-group");
    const metricGroup = document.getElementById("bu-metric-group");
    const desc = document.getElementById("bu-chart-desc");
    const caption = document.getElementById("bu-chart-caption");
    if (scaleGroup) scaleGroup.hidden = isCompare;
    if (metricGroup) metricGroup.hidden = !isCompare;
    if (desc) {
      desc.textContent = isCompare ? "\u4E5D\u57CE\u4E24\u4E2A\u9636\u6BB5\u7684\u5BF9\u6BD4\uFF0C\u53EF\u5207\u6362\u5E74\u5747\u65B0\u589E\u9762\u79EF\uFF08km\xB2/\u5E74\uFF09\u6216\u5E74\u5747\u590D\u5408\u589E\u901F\uFF08%/\u5E74\uFF09\uFF1B\u5F53\u524D\u57CE\u5E02\u4EE5\u6DF1\u8272\u663E\u793A" : "\u4E0A\uFF1A\u5404\u671F\u6D4B\u5730\u9762\u79EF\uFF0C\u6A2A\u8F74\u6309\u5B9E\u9645\u5E74\u4EFD\u95F4\u9694\u6392\u5E03\uFF1B\u4E0B\uFF1A\u5404\u9636\u6BB5\u5E74\u5747\u65B0\u589E\u9762\u79EF\uFF0C\u67F1\u5BBD\u5BF9\u5E94\u9636\u6BB5\u65F6\u957F";
    }
    if (!isCompare) {
      if (caption) caption.hidden = true;
      if (!_lastBuMetrics) return;
      buChart = createChart(dom, builtupExpansionOption(_lastBuMetrics, { logScale: buView.scale === "log", compact }));
      return;
    }
    const flagged = flaggedBuiltupCities();
    if (caption) {
      caption.textContent = flagged.caption;
      caption.hidden = !flagged.caption;
    }
    if (buChart && !buChart.isDisposed()) {
      buChart.showLoading({ text: "\u6B63\u5728\u8BA1\u7B97\u4E5D\u57CE\u9762\u79EF\u2026", color: "#c63a18", textColor: "#090b11", maskColor: "rgba(255,253,251,0.8)" });
    }
    let list;
    try {
      list = await loadAllCityMetrics();
    } catch (e) {
      if (buChart && !buChart.isDisposed()) buChart.hideLoading();
      toast("\u4E5D\u57CE\u9762\u79EF\u8BA1\u7B97\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      return;
    }
    if (seq !== _buRenderSeq || buView.mode !== "compare") return;
    buChart = createChart(dom, builtupCompareOption(list, {
      activeKey: _lastBuCityKey,
      metric: buView.metric,
      compact,
      flaggedKeys: flagged.keys
    }));
  }
  var BUFFER_PRESETS = [
    { key: "shenzhen", label: "\u6DF1\u5733 \xB7 \u86C7\u53E3 / \u5357\u5934", lng: 113.95, lat: 22.52, r: 90 },
    { key: "guangzhou", label: "\u5E7F\u5DDE \xB7 \u5341\u4E09\u884C / \u6C99\u9762", lng: 113.25, lat: 23.11, r: 120 },
    { key: "shanghai", label: "\u4E0A\u6D77 \xB7 \u5916\u6EE9 / \u6D66\u4E1C", lng: 121.48, lat: 31.24, r: 150 },
    { key: "xiamen", label: "\u53A6\u95E8 \xB7 \u9F13\u6D6A\u5C7F / \u6CC9\u5DDE", lng: 118.12, lat: 24.55, r: 100 },
    { key: "beijing", label: "\u5317\u4EAC \xB7 \u6545\u5BAB / \u4E09\u4E2D\u5168\u4F1A", lng: 116.4, lat: 39.92, r: 120 },
    { key: "xian", label: "\u897F\u5B89 \xB7 \u5175\u9A6C\u4FD1 / \u5927\u96C1\u5854", lng: 109.05, lat: 34.28, r: 80 }
  ];
  var _herFeaturesAll = [];
  var _refEventsAll = [];
  var _bufReqSeq = 0;
  var _rebindBufferMarkers = null;
  function mountBufferMapHud(host) {
    if (!host || host.querySelector("#buf-map-hud")) return;
    const startCollapsed = typeof window !== "undefined" && window.innerWidth <= 640;
    const hud = el("aside", {
      id: "buf-map-hud",
      class: "layer-panel buf-hud" + (startCollapsed ? " is-collapsed" : ""),
      "aria-label": "\u7F13\u51B2\u533A\u5236\u56FE\u63A7\u5236"
    });
    const toggleBtn = el("button", {
      class: "lp-toggle",
      type: "button",
      "aria-expanded": startCollapsed ? "false" : "true",
      text: startCollapsed ? "\u5C55\u5F00" : "\u6536\u8D77"
    });
    const head = el("div", { class: "lp-head" }, [
      el("span", { class: "lp-head-title", text: "\u6D4B\u5730\u56FE\u4F8B" }),
      toggleBtn
    ]);
    const body = el("div", { class: "lp-body" });
    toggleBtn.addEventListener("click", () => {
      const collapsed = hud.classList.toggle("is-collapsed");
      toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggleBtn.textContent = collapsed ? "\u5C55\u5F00" : "\u6536\u8D77";
    });
    const lgWrap = el("div", { class: "lp-group" }, [
      el("div", { class: "lp-title", text: "\u6D4B\u5730\u7B26\u53F7" }),
      el("div", { class: "buf-legend-list" }, [
        el("div", { class: "lg-row" }, [
          el("span", { class: "buf-sw-target", "aria-hidden": "true" }),
          el("span", { text: "\u7F13\u51B2\u533A\u4E2D\u5FC3\u9776\u6807" })
        ]),
        el("div", { class: "lg-row" }, [
          el("span", { class: "buf-sw-ring", "aria-hidden": "true" }),
          el("span", { text: "50% / 100% \u6D4B\u5730\u7F13\u51B2\u5708" })
        ]),
        el("div", { class: "lg-row" }, [
          el("span", { class: "buf-sw-spoke", "aria-hidden": "true" }),
          el("span", { text: "ST_DWithin \u547D\u4E2D\u8FDE\u7EBF" })
        ])
      ]),
      el("div", { class: "buf-hud-hint", text: "\u70B9\u51FB\u7A7A\u767D\u5904\u91CD\u8BBE\u9776\u5FC3 \xB7 \u70B9\u51FB\u8981\u7D20\u770B\u5B9E\u666F\u4E0E\u8DDD\u79BB" })
    ]);
    body.appendChild(lgWrap);
    hud.appendChild(head);
    hud.appendChild(body);
    host.appendChild(hud);
  }
  function attachBufferStatusBar() {
    const host = document.getElementById("map-buf-root");
    if (!host || !mapBuf || host.querySelector(".map-statusbar")) return;
    const suffix = " \xB7 ST_Buffer(geography) \u692D\u7403\u6D4B\u5730\u5206\u6790";
    const bar = document.createElement("div");
    bar.className = "map-statusbar";
    bar.innerHTML = `
    <div class="msb-item"><span class="msb-label">\u4E2D\u5FC3\u70B9</span><span class="msb-value" data-sb="center">-</span></div>
    <div class="msb-item"><span class="msb-label">\u7F29\u653E</span><span class="msb-value" data-sb="zoom">-</span></div>
    <div class="msb-item"><span class="msb-label">\u6BD4\u4F8B\u5C3A</span><span class="msb-value" data-sb="scale">-</span></div>
    <div class="msb-item"><span class="msb-label">\u9776\u5FC3\u534A\u5F84</span><span class="msb-value" data-sb="buf-meta">-</span></div>
    <div class="msb-spacer"></div>
    <div class="msb-item"><span class="msb-credit" data-suffix="${suffix}">${basemapLabel()}${suffix}</span></div>`;
    host.appendChild(bar);
    const cEl = bar.querySelector('[data-sb="center"]');
    const zEl = bar.querySelector('[data-sb="zoom"]');
    const sEl = bar.querySelector('[data-sb="scale"]');
    const M_PER_PX_AT_EQ = 156543.03392;
    const update = () => {
      try {
        const c = mapBuf.getCenter();
        const z = mapBuf.getZoom();
        cEl.textContent = `${Math.abs(c.lat).toFixed(4)}\xB0${c.lat >= 0 ? "N" : "S"} ${Math.abs(c.lng).toFixed(4)}\xB0${c.lng >= 0 ? "E" : "W"}`;
        zEl.textContent = formatZoomReadout(mapBuf);
        const latFactor = Math.max(0.05, Math.cos(c.lat * Math.PI / 180));
        const metersPerPx = M_PER_PX_AT_EQ * latFactor / Math.pow(2, z);
        const groundPerCm = metersPerPx * (96 / 2.54);
        let sVal = groundPerCm, u = "m";
        if (sVal >= 1e3) {
          sVal /= 1e3;
          u = "km";
        }
        sEl.textContent = `1cm \u2248 ${sVal >= 100 ? Math.round(sVal) : sVal.toFixed(sVal < 10 ? 2 : 1)} ${u}`;
      } catch (e) {
      }
    };
    mapBuf.on("move", update);
    mapBuf.on("zoom", update);
    update();
  }
  function findHeritageRecord(id, fallback = {}) {
    const hit = _herFeaturesAll.find((f) => f && f.properties && String(f.properties.id) === String(id));
    return hit ? { ...fallback, ...hit.properties } : fallback;
  }
  function findReformRecord(id, fallback = {}) {
    const hit = _refEventsAll.find((e) => e && String(e.id) === String(id));
    return hit ? { ...fallback, ...hit } : fallback;
  }
  function buildBufferPopupHtml({ title, kicker, city, period, image, category, description, sourceUrl, distKm, statusLabel }) {
    const realImg = assetUrl(image);
    const fallbackImg = placeholderDataURI(title || "\u8981\u7D20\u5F71\u50CF", category || "building", 560, 320);
    const imgSrc = realImg || fallbackImg;
    const metaParts = [kicker, city, period].filter(Boolean).map((x) => escapeHtml(String(x)));
    const descText = description ? escapeHtml(String(description)) : "";
    const srcHref = sourceUrl ? normalizeSourceUrl(sourceUrl) : "";
    const srcLabel = isBaikeUrl(sourceUrl) ? "\u767E\u5EA6\u767E\u79D1 \u2197" : "\u8D44\u6599\u51FA\u5904 \u2197";
    const distStr = Number.isFinite(Number(distKm)) ? Number(distKm).toFixed(2) : String(distKm || "0.00");
    return `<div class="buf-popup-card"><div class="popup-media"><img class="popup-img" src="${escapeHtml(imgSrc)}" data-fallback="${escapeHtml(fallbackImg)}" alt="${escapeHtml(title || "")}\u5B9E\u666F\u7167\u7247" /></div><div class="popup-body"><div class="popup-kicker">${metaParts.join(" \xB7 ")}</div><div class="popup-title">${escapeHtml(title || "")}</div>` + (descText ? `<p class="popup-desc">${descText}</p>` : "") + `<div class="popup-foot"><span class="popup-meta">\u8DDD\u9776\u5FC3 <strong>${distStr} km</strong> \xB7 ${escapeHtml(statusLabel || "")}</span>` + (srcHref ? `<a class="popup-link" href="${escapeHtml(srcHref)}" target="_blank" rel="noopener noreferrer">${srcLabel}</a>` : "") + `</div></div></div>`;
  }
  async function initPostgisBufferLab() {
    const ctl = document.getElementById("pg-buf-controls");
    const mapHost = document.getElementById("map-pg-buffer");
    const mapRoot = document.getElementById("map-buf-root");
    if (!ctl || !mapHost) return;
    try {
      const [herFc, refData] = await Promise.all([
        fetchJSON(dataUrl("heritage.geojson")),
        fetchJSON(dataUrl("reform-events.json"))
      ]);
      _herFeaturesAll = herFc.features || [];
      _refEventsAll = refData.events || [];
    } catch (e) {
    }
    const presetSel = selectEl(BUFFER_PRESETS.map((p) => [p.key, p.label]), startCity);
    const radSel = selectEl([
      ["30", "30 km\uFF08\u57CE\u5E02\u5C3A\u5EA6\uFF09"],
      ["60", "60 km\uFF08\u90FD\u5E02\u5708\u5185\u5708\uFF09"],
      ["100", "100 km\uFF08\u533A\u57DF\u90FD\u5E02\u5708\uFF09"],
      ["150", "150 km\uFF08\u57CE\u5E02\u7FA4\u8D70\u5ECA\uFF09"],
      ["250", "250 km\uFF08\u8DE8\u7701\u7ECF\u6D4E\u5E26\uFF09"]
    ], "100");
    const coordReadout = el("input", {
      type: "text",
      readonly: true,
      style: "min-width:190px;background:var(--surface-2);font-family:var(--font-mono);font-size:12.5px;",
      value: "113.9500\xB0E, 22.5200\xB0N"
    });
    ctl.appendChild(field("\u7F13\u51B2\u533A\u4E2D\u5FC3\u70B9\uFF08\u6216\u70B9\u51FB\u5730\u56FE\u9009\u70B9\uFF09", presetSel));
    ctl.appendChild(field("PostGIS ST_Buffer \u6D4B\u5730\u534A\u5F84", radSel));
    ctl.appendChild(field("\u5F53\u524D\u4E2D\u5FC3\u5750\u6807 (WGS84)", coordReadout));
    mapBuf = new maplibregl.Map({
      container: "map-pg-buffer",
      style: buildOnlineStyle(),
      center: [113.95, 22.52],
      zoom: 6.4,
      minZoom: TIANDITU_MIN_ZOOM,
      maxZoom: TIANDITU_MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false
    });
    window.__bufMap = mapBuf;
    mapBuf.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapBuf.addControl(new maplibregl.ScaleControl({ maxWidth: 108, unit: "metric" }), "bottom-right");
    bindZoomLimitControl(mapBuf, mapRoot);
    let curCenter = [113.95, 22.52];
    const initPreset = BUFFER_PRESETS.find((p) => p.key === startCity) || BUFFER_PRESETS[0];
    curCenter = [initPreset.lng, initPreset.lat];
    radSel.value = String(initPreset.r >= 140 ? 150 : 100);
    const highlightBufferHitRow = (nodeKey) => {
      document.querySelectorAll("#pg-hit-list .place-item").forEach((btn) => {
        btn.classList.toggle("is-active", Boolean(nodeKey && btn.dataset.nodeKey === nodeKey));
      });
    };
    const inspectBufferNode = ({
      nodeKey,
      title,
      kicker,
      city,
      period,
      image,
      category,
      description,
      sourceUrl,
      coords,
      color,
      distOverride,
      statusOverride,
      pan = false
    }) => {
      if (!mapBuf || !Array.isArray(coords)) return;
      const rKm = Number(radSel.value) || 100;
      let distKm = distOverride;
      if (!Number.isFinite(distKm)) {
        distKm = 0;
        try {
          distKm = turf.distance(turf.point(curCenter), turf.point(coords), { units: "kilometers" });
        } catch (e) {
        }
      }
      const inside = distKm <= rKm + 0.05;
      highlightBufferHitRow(inside ? nodeKey : null);
      setActiveMarker(mapBuf, coords, color || "#bf3718");
      const container = mapBuf.getContainer();
      const w = container && container.clientWidth || 860;
      const h = container && container.clientHeight || 500;
      if (pan) {
        const targetY = Math.max(Math.round(h * 0.5), Math.min(h - 56, 346));
        mapBuf.easeTo({
          center: coords,
          zoom: Math.min(TIANDITU_MAX_ZOOM, Math.max(mapBuf.getZoom() || 7.5, 8.4)),
          offset: [0, targetY - Math.round(h / 2)],
          duration: 620
        });
      } else {
        try {
          const pt = mapBuf.project(coords);
          const safeX = Math.min(w - 160, Math.max(160, pt.x));
          const safeY = Math.min(h - 52, Math.max(284, pt.y));
          if (Math.abs(safeX - pt.x) > 4 || Math.abs(safeY - pt.y) > 4) {
            mapBuf.easeTo({
              center: coords,
              offset: [Math.round(safeX - w / 2), Math.round(safeY - h / 2)],
              duration: 380
            });
          }
        } catch (e) {
        }
      }
      showPopup(
        mapBuf,
        coords,
        buildBufferPopupHtml({
          title,
          kicker,
          city,
          period,
          image,
          category,
          description,
          sourceUrl,
          distKm,
          statusLabel: statusOverride || (inside ? "\u5708\u5185\u547D\u4E2D" : "\u5708\u5916\u8981\u7D20")
        }),
        { maxWidth: "296px", className: "map-rich-popup", anchor: "bottom", offset: 16, closeOnClick: false }
      );
    };
    const bindBufferMarkers = () => {
      if (!mapBuf) return;
      addHeritagePoints(mapBuf, _herFeaturesAll, {
        onClick: (p, ll, coords) => {
          const rec = findHeritageRecord(p.id, p);
          inspectBufferNode({
            nodeKey: "her-" + rec.id,
            title: rec.name || "",
            kicker: `\u6587\u5316\u9057\u4EA7 \xB7 ${categoryLabel(rec.category)}`,
            city: rec.city || "",
            period: rec.period || "",
            image: rec.image || "",
            category: rec.category || "building",
            description: rec.description || "",
            sourceUrl: rec.sourceUrl || "",
            coords: coords || [ll.lng, ll.lat],
            color: categoryColor(rec.category)
          });
        }
      });
      addReformPoints(mapBuf, _refEventsAll, {
        onClick: (p, ll, coords) => {
          const rec = findReformRecord(p.id, p);
          const fullDesc = [rec.description, rec.significance].filter(Boolean).join(" ");
          inspectBufferNode({
            nodeKey: "ref-" + rec.id,
            title: `${rec.year ? rec.year + " \xB7 " : ""}${rec.title || ""}`,
            kicker: `\u6539\u9769\u4E8B\u4EF6 \xB7 ${rec.type || "\u4E8B\u4EF6"}`,
            city: rec.city || "",
            period: rec.year ? `${rec.year} \u5E74` : "",
            image: rec.image || "",
            category: "trade",
            description: fullDesc,
            sourceUrl: rec.sourceUrl || "",
            coords: coords || [ll.lng, ll.lat],
            color: REFORM_COLORS[rec.type] || "#bf3718"
          });
        }
      });
    };
    _rebindBufferMarkers = bindBufferMarkers;
    mapBuf.on("load", async () => {
      await setupBasemap(mapBuf);
      mapBuf._basemapMode = "online";
      mapBuf._swipeReady = true;
      mountBufferMapHud(mapRoot);
      attachBufferStatusBar();
      bindBufferMarkers();
      runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), true);
    });
    mapBuf.on("click", (e) => {
      try {
        const checkLayers = ["heritage-symbol", "heritage-label", "reform-symbol", "reform-label"].filter((id) => mapBuf.getLayer(id));
        if (checkLayers.length) {
          const hit = mapBuf.queryRenderedFeatures(e.point, { layers: checkLayers });
          if (hit && hit.length) return;
        }
      } catch (err) {
      }
      closePopup();
      highlightBufferHitRow(null);
      setActiveMarker(mapBuf, null);
      curCenter = [+e.lngLat.lng.toFixed(4), +e.lngLat.lat.toFixed(4)];
      coordReadout.value = `${curCenter[0]}\xB0E, ${curCenter[1]}\xB0N`;
      runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), false);
    });
    presetSel.addEventListener("change", () => {
      const p = BUFFER_PRESETS.find((x) => x.key === presetSel.value) || BUFFER_PRESETS[0];
      closePopup();
      highlightBufferHitRow(null);
      setActiveMarker(mapBuf, null);
      curCenter = [p.lng, p.lat];
      coordReadout.value = `${curCenter[0].toFixed(4)}\xB0E, ${curCenter[1].toFixed(4)}\xB0N`;
      runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), true);
    });
    radSel.addEventListener("change", () => {
      runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), true);
    });
    async function runBufferAnalysis(lng, lat, radiusKm, shouldFly) {
      const reqId = ++_bufReqSeq;
      coordReadout.value = `${lng.toFixed(4)}\xB0E, ${lat.toFixed(4)}\xB0N`;
      const metaSb = document.querySelector('#map-buf-root [data-sb="buf-meta"]');
      if (metaSb) metaSb.textContent = `R = ${radiusKm} km`;
      if (shouldFly && mapBuf) {
        const z = radiusKm <= 40 ? 8.6 : radiusKm <= 80 ? 7.5 : radiusKm <= 150 ? 6.5 : 5.5;
        try {
          mapBuf.stop();
        } catch (e) {
        }
        mapBuf.easeTo({ center: [lng, lat], zoom: z, duration: 700, essential: true });
      }
      let data = null;
      if (!window.__LOCAL_FILE_BUILD__) {
        try {
          const res = await fetch(`/api/spatial/buffer?lng=${lng}&lat=${lat}&radiusKm=${radiusKm}`);
          if (res.ok) data = await res.json();
        } catch (e) {
        }
      }
      if (reqId !== _bufReqSeq) return;
      if (!data || !data.ok) {
        const pt = turf.point([lng, lat]);
        const bufFeat = turf.buffer(pt, radiusKm, { units: "kilometers", steps: 64 });
        const areaSqm = turf.area(bufFeat);
        const heritageHits = [];
        _herFeaturesAll.forEach((f) => {
          const c = f.geometry && f.geometry.coordinates;
          if (!c) return;
          const dKm = turf.distance(pt, turf.point(c), { units: "kilometers" });
          if (dKm <= radiusKm) {
            heritageHits.push({
              id: f.properties.id,
              name: f.properties.name,
              category: f.properties.category,
              city: f.properties.city,
              dist_km: +dKm.toFixed(2),
              coordinates: c
            });
          }
        });
        heritageHits.sort((a, b) => a.dist_km - b.dist_km);
        const reformHits = [];
        _refEventsAll.forEach((e) => {
          if (!e.coordinates) return;
          const dKm = turf.distance(pt, turf.point(e.coordinates), { units: "kilometers" });
          if (dKm <= radiusKm) {
            reformHits.push({
              id: e.id,
              year: e.year,
              title: e.title,
              city: e.city,
              type: e.type,
              dist_km: +dKm.toFixed(2),
              coordinates: e.coordinates
            });
          }
        });
        reformHits.sort((a, b) => a.dist_km - b.dist_km);
        data = {
          ok: true,
          engine: "Turf.js Geodesic Engine",
          sql: `SELECT h.id, h.name, h.category, ROUND((ST_Distance(h.geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)/1000)::numeric, 2) AS dist_km
FROM heritage_sites h
WHERE ST_DWithin(h.geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusKm * 1e3});`,
          bufferAreaSqm: areaSqm,
          bufferFeature: bufFeat,
          heritageHits,
          reformHits
        };
      }
      if (isSwipeMapReady(mapBuf)) {
        try {
          const fc = { type: "FeatureCollection", features: [data.bufferFeature] };
          if (!mapBuf.getSource("pg-buf-src")) {
            mapBuf.addSource("pg-buf-src", { type: "geojson", data: fc });
            mapBuf.addLayer({ id: "buffer-fill", type: "fill", source: "pg-buf-src", paint: { "fill-color": "#bf3718", "fill-opacity": 0.11 } });
            mapBuf.addLayer({ id: "buffer-casing", type: "line", source: "pg-buf-src", paint: { "line-color": "#fffdf9", "line-width": 4.4, "line-opacity": 0.82 } });
            mapBuf.addLayer({ id: "buffer-line", type: "line", source: "pg-buf-src", paint: { "line-color": "#090b11", "line-width": 2.1, "line-dasharray": [4, 2] } });
          } else {
            mapBuf.getSource("pg-buf-src").setData(fc);
          }
          let halfFc = { type: "FeatureCollection", features: [] };
          try {
            const halfFeat = turf.buffer(turf.point([lng, lat]), radiusKm * 0.5, { units: "kilometers", steps: 64 });
            if (halfFeat) halfFc = { type: "FeatureCollection", features: [halfFeat] };
          } catch (err) {
          }
          if (!mapBuf.getSource("pg-buf-half-src")) {
            mapBuf.addSource("pg-buf-half-src", { type: "geojson", data: halfFc });
            mapBuf.addLayer({
              id: "buffer-half-line",
              type: "line",
              source: "pg-buf-half-src",
              paint: { "line-color": "#bf3718", "line-width": 1.25, "line-opacity": 0.48, "line-dasharray": [2, 2.5] }
            });
          } else {
            mapBuf.getSource("pg-buf-half-src").setData(halfFc);
          }
          const spokeFeatures = [];
          const hitFeatures = [];
          data.heritageHits.forEach((h) => {
            if (!Array.isArray(h.coordinates)) return;
            const col = categoryColor(h.category);
            spokeFeatures.push({
              type: "Feature",
              properties: { color: col },
              geometry: { type: "LineString", coordinates: [[lng, lat], h.coordinates] }
            });
            hitFeatures.push({
              type: "Feature",
              properties: { color: col },
              geometry: { type: "Point", coordinates: h.coordinates }
            });
          });
          data.reformHits.forEach((r) => {
            if (!Array.isArray(r.coordinates)) return;
            const col = REFORM_COLORS[r.type] || "#bf3718";
            spokeFeatures.push({
              type: "Feature",
              properties: { color: col },
              geometry: { type: "LineString", coordinates: [[lng, lat], r.coordinates] }
            });
            hitFeatures.push({
              type: "Feature",
              properties: { color: col },
              geometry: { type: "Point", coordinates: r.coordinates }
            });
          });
          const spokesFc = { type: "FeatureCollection", features: spokeFeatures };
          const hitsFc = { type: "FeatureCollection", features: hitFeatures };
          if (!mapBuf.getSource("pg-buf-spokes-src")) {
            mapBuf.addSource("pg-buf-spokes-src", { type: "geojson", data: spokesFc });
            mapBuf.addLayer({
              id: "buffer-spokes",
              type: "line",
              source: "pg-buf-spokes-src",
              paint: { "line-color": ["get", "color"], "line-width": 1.3, "line-opacity": 0.52, "line-dasharray": [2, 2] }
            });
          } else {
            mapBuf.getSource("pg-buf-spokes-src").setData(spokesFc);
          }
          if (!mapBuf.getSource("pg-buf-hits-src")) {
            mapBuf.addSource("pg-buf-hits-src", { type: "geojson", data: hitsFc });
            mapBuf.addLayer({
              id: "buffer-hit-halo",
              type: "circle",
              source: "pg-buf-hits-src",
              paint: {
                "circle-radius": 17,
                "circle-color": ["get", "color"],
                "circle-opacity": 0.18,
                "circle-stroke-color": ["get", "color"],
                "circle-stroke-width": 1.2,
                "circle-stroke-opacity": 0.52
              }
            });
          } else {
            mapBuf.getSource("pg-buf-hits-src").setData(hitsFc);
          }
          const centerFc = {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } }]
          };
          if (!mapBuf.getSource("pg-buf-center-src")) {
            mapBuf.addSource("pg-buf-center-src", { type: "geojson", data: centerFc });
            mapBuf.addLayer({
              id: "buf-center-outer",
              type: "circle",
              source: "pg-buf-center-src",
              paint: {
                "circle-radius": 11,
                "circle-color": "rgba(255, 253, 249, 0.88)",
                "circle-stroke-color": "#bf3718",
                "circle-stroke-width": 2.3
              }
            });
            mapBuf.addLayer({
              id: "buf-center-inner",
              type: "circle",
              source: "pg-buf-center-src",
              paint: {
                "circle-radius": 4.2,
                "circle-color": "#bf3718",
                "circle-stroke-color": "#fffdf9",
                "circle-stroke-width": 1.4
              }
            });
          } else {
            mapBuf.getSource("pg-buf-center-src").setData(centerFc);
          }
          restackLayers(mapBuf);
        } catch (e) {
        }
      }
      const statsGrid = document.getElementById("pg-buf-stats");
      if (statsGrid) {
        statsGrid.innerHTML = "";
        const hCnt = data.heritageHits.length;
        const rCnt = data.reformHits.length;
        const cooccurrence = hCnt > 0 && rCnt > 0 ? "\u53CC\u7C7B\u5171\u73B0" : hCnt + rCnt > 0 ? "\u5355\u7C7B\u5206\u5E03" : "\u5708\u5185\u65E0\u8981\u7D20";
        [
          ["ST_Buffer \u6D4B\u5730\u9762\u79EF", formatArea(data.bufferAreaSqm), `\u534A\u5F84 ${radiusKm} km`],
          ["\u5708\u5185\u5386\u53F2\u6587\u5316\u9057\u4EA7", `${hCnt} \u5904`, "ST_DWithin \u547D\u4E2D"],
          ["\u5708\u5185\u6539\u9769\u5F00\u653E\u4E8B\u4EF6", `${rCnt} \u8D77`, "ST_DWithin \u547D\u4E2D"],
          ["\u5708\u5185\u8981\u7D20\u5171\u73B0", cooccurrence, `\u5171 ${hCnt + rCnt} \u4E2A\u65F6\u7A7A\u8282\u70B9`]
        ].forEach(([l, v, s], idx) => {
          statsGrid.appendChild(el("div", { class: "stat-box" + (idx === 3 ? " stat-box-highlight" : "") }, [
            el("div", { class: "sb-label", text: l }),
            el("div", { class: "sb-value", text: v }),
            el("div", { class: "sb-sub", text: s })
          ]));
        });
      }
      const sqlPre = document.getElementById("pg-sql-console");
      if (sqlPre) sqlPre.textContent = data.sql || "";
      const engBadge = document.getElementById("pg-buf-engine");
      if (engBadge) engBadge.textContent = data.engine || "PostGIS";
      const hitList = document.getElementById("pg-hit-list");
      if (hitList) {
        hitList.innerHTML = "";
        const combined = [
          ...data.heritageHits.map((h) => {
            const rec = findHeritageRecord(h.id, h);
            return {
              nodeKey: "her-" + h.id,
              name: rec.name || h.name,
              kicker: `\u6587\u5316\u9057\u4EA7 \xB7 ${categoryLabel(rec.category || h.category)}`,
              city: rec.city || h.city || "",
              period: rec.period || h.period || "",
              image: rec.image || "",
              category: rec.category || h.category || "building",
              description: rec.description || "",
              sourceUrl: rec.sourceUrl || "",
              sub: `[\u6587\u5316\u9057\u4EA7\xB7${categoryLabel(rec.category || h.category)}] ${rec.city || h.city || ""}`,
              dist: h.dist_km,
              color: categoryColor(rec.category || h.category),
              icon: markerIconDataURL("mk-" + (rec.category || h.category)),
              coords: h.coordinates
            };
          }),
          ...data.reformHits.map((r) => {
            const rec = findReformRecord(r.id, r);
            const yr = rec.year || r.year;
            const tp = rec.type || r.type;
            return {
              nodeKey: "ref-" + r.id,
              name: `${yr ? yr + " \xB7 " : ""}${rec.title || r.title}`,
              kicker: `\u6539\u9769\u4E8B\u4EF6 \xB7 ${tp}`,
              city: rec.city || r.city || "",
              period: yr ? `${yr} \u5E74` : "",
              image: rec.image || "",
              category: "trade",
              description: [rec.description, rec.significance].filter(Boolean).join(" "),
              sourceUrl: rec.sourceUrl || "",
              sub: `[\u6539\u9769\u4E8B\u4EF6\xB7${tp}] ${rec.city || r.city || ""}`,
              dist: r.dist_km,
              color: REFORM_COLORS[tp] || "#c63a18",
              icon: markerIconDataURL("rk-" + tp),
              coords: r.coordinates
            };
          })
        ].sort((a, b) => a.dist - b.dist);
        if (!combined.length) {
          hitList.appendChild(el("div", { style: "color:var(--muted);font-size:13px;padding:8px;", text: "\u5F53\u524D\u7F13\u51B2\u534A\u5F84\u5185\u6682\u65E0\u8981\u7D20\uFF0C\u8BF7\u8C03\u5927\u534A\u5F84\u6216\u5207\u6362\u4E2D\u5FC3\u57CE\u5E02\u3002" }));
        } else {
          combined.forEach((it) => {
            const thumbUrl = assetUrl(it.image) || placeholderDataURI(it.name, it.category, 112, 76);
            const thumbImg = el("img", {
              class: "pi-thumb",
              src: thumbUrl,
              alt: ""
            });
            thumbImg.addEventListener("error", () => {
              const fb = placeholderDataURI(it.name, it.category, 112, 76);
              if (thumbImg.src !== fb) thumbImg.src = fb;
            }, { once: true });
            const row = el("button", { class: "place-item", type: "button", "data-node-key": it.nodeKey }, [
              it.icon ? el("img", { class: "pi-icon", src: it.icon, alt: "" }) : el("span", { class: "pi-dot", style: `background:${it.color}` }),
              el("div", { style: "flex:1;min-width:0;" }, [
                el("div", { class: "pi-name", text: it.name }),
                el("div", { class: "pi-meta", text: it.sub })
              ]),
              thumbImg,
              el("span", { class: "tag", style: "font-family:var(--font-mono);flex:none;", text: `${it.dist} km` })
            ]);
            row.addEventListener("click", () => {
              if (!mapBuf || !it.coords) return;
              inspectBufferNode({
                nodeKey: it.nodeKey,
                title: it.name,
                kicker: it.kicker,
                city: it.city,
                period: it.period,
                image: it.image,
                category: it.category,
                description: it.description,
                sourceUrl: it.sourceUrl,
                coords: it.coords,
                color: it.color,
                distOverride: Number(it.dist),
                statusOverride: "ST_DWithin \u547D\u4E2D",
                pan: true
              });
            });
            hitList.appendChild(row);
          });
        }
      }
      const chartDom = document.getElementById("pg-buf-chart");
      if (chartDom) {
        const cats = ["\u6587\u5316\u9057\u4EA7", "\u7ECF\u6D4E\u7279\u533A", "\u6CBF\u6D77\u5F00\u653E", "\u521B\u65B0/\u81EA\u8D38/\u56ED\u533A"];
        const herCnt = data.heritageHits.length;
        const sezCnt = data.reformHits.filter((r) => r.type === "\u7ECF\u6D4E\u7279\u533A").length;
        const coastCnt = data.reformHits.filter((r) => r.type === "\u6CBF\u6D77\u5F00\u653E").length;
        const otherRef = data.reformHits.length - sezCnt - coastCnt;
        bufChart = createChart(chartDom, barOption(cats, [herCnt, sezCnt, coastCnt, otherRef], { name: "\u547D\u4E2D\u6570\u91CF", unit: "\u4E2A" }));
      }
    }
  }
  function initOgcAndInsertPanel() {
    const btnInsert = document.getElementById("btn-postgis-insert");
    const msgEl = document.getElementById("add-result-msg");
    if (window.__LOCAL_FILE_BUILD__) {
      const note = document.getElementById("local-mode-note");
      if (note) {
        note.hidden = false;
        note.textContent = "\u5F53\u524D\u4E3A\u672C\u5730\u6587\u4EF6\u7248\uFF1APostGIS \u5728\u7EBF\u5165\u5E93\u4E0E GeoServer WFS \u9700\u5728\u672C\u5730\u8FD0\u884C node server/server.cjs \u540E\u4F7F\u7528\uFF1B\u5176\u4F59\u7A7A\u95F4\u5206\u6790\u7531 Turf.js \u6D4B\u5730\u5F15\u64CE\u5B8C\u6210\u3002";
      }
      if (btnInsert) {
        btnInsert.disabled = true;
        btnInsert.textContent = "\u9700\u672C\u5730\u5168\u6808\u8FD0\u884C";
      }
      document.querySelectorAll("[data-ogc]").forEach((b) => {
        b.disabled = true;
      });
      const preview2 = document.getElementById("ogc-preview");
      if (preview2) preview2.textContent = "\u672C\u5730\u6587\u4EF6\u7248\u672A\u8FDE\u63A5 GeoServer\u3002OGC \u670D\u52A1\u7684\u542F\u52A8\u65B9\u5F0F\u89C1\u9879\u76EE README \u4E0E server \u76EE\u5F55\u3002";
      return;
    }
    if (btnInsert) {
      btnInsert.addEventListener("click", async () => {
        const payload = {
          name: (document.getElementById("add-name") || {}).value,
          category: (document.getElementById("add-cat") || {}).value,
          city: (document.getElementById("add-city") || {}).value,
          period: (document.getElementById("add-period") || {}).value,
          lng: Number((document.getElementById("add-lng") || {}).value),
          lat: Number((document.getElementById("add-lat") || {}).value),
          description: (document.getElementById("add-desc") || {}).value
        };
        const originalLabel = btnInsert.textContent;
        btnInsert.disabled = true;
        btnInsert.setAttribute("aria-busy", "true");
        btnInsert.textContent = "\u5199\u5165\u4E2D\u2026";
        if (msgEl) msgEl.textContent = "\u6B63\u5728\u5199\u5165\u7A7A\u95F4\u6570\u636E\u5E93\u2026";
        try {
          const res = await fetch("/api/heritage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const d = await res.json();
          if (d && d.ok) {
            if (msgEl) msgEl.textContent = `\u5DF2\u5165\u5E93 (${d.engine}): ${payload.name} [${payload.lng}, ${payload.lat}]`;
            if (d.feature) {
              _herFeaturesAll.push(d.feature);
              if (_rebindBufferMarkers) _rebindBufferMarkers();
              else if (mapBuf) addHeritagePoints(mapBuf, _herFeaturesAll);
              if (mapBuf) mapBuf.easeTo({ center: [payload.lng, payload.lat], zoom: 7.5, duration: 900 });
            }
            const sqlPre = document.getElementById("pg-sql-console");
            if (sqlPre && d.sql) sqlPre.textContent = d.sql;
            toast(`\u6210\u529F\u5C06\u300C${payload.name}\u300D\u5199\u5165 PostGIS \u7A7A\u95F4\u6570\u636E\u5E93\uFF01`, "info", 3e3);
          } else {
            if (msgEl) msgEl.textContent = "\u5165\u5E93\u5931\u8D25\uFF1A" + (d.error || "\u672A\u77E5\u9519\u8BEF");
          }
        } catch (e) {
          if (msgEl) msgEl.textContent = "\u8BF7\u901A\u8FC7 node server/server.cjs \u542F\u52A8\u7A7A\u95F4\u540E\u7AEF\u4EE5\u4F7F\u7528 PostGIS \u5165\u5E93";
        } finally {
          btnInsert.disabled = false;
          btnInsert.removeAttribute("aria-busy");
          btnInsert.textContent = originalLabel;
          try {
            btnInsert.focus({ preventScroll: true });
          } catch (e) {
          }
        }
      });
    }
    const ogcBtns = [...document.querySelectorAll("[data-ogc]")];
    const preview = document.getElementById("ogc-preview");
    ogcBtns.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = btn.getAttribute("data-ogc");
        ogcBtns.forEach((b) => {
          b.disabled = true;
        });
        btn.setAttribute("aria-busy", "true");
        if (preview) preview.textContent = `\u6B63\u5728\u8BF7\u6C42 OGC \u670D\u52A1: ${url} \u2026`;
        try {
          const res = await fetch(url);
          const text = await res.text();
          if (preview) {
            try {
              const parsed = JSON.parse(text);
              preview.textContent = JSON.stringify(parsed, null, 2).slice(0, 2600) + "\n\u2026 (OGC WFS FeatureCollection \u54CD\u5E94\u6210\u529F)";
            } catch (e) {
              preview.textContent = text.slice(0, 2600);
            }
          }
        } catch (e) {
          if (preview) preview.textContent = `\u8BF7\u6C42\u5F02\u5E38: ${e.message}`;
        } finally {
          ogcBtns.forEach((b) => {
            b.disabled = false;
          });
          btn.removeAttribute("aria-busy");
          try {
            btn.focus({ preventScroll: true });
          } catch (e) {
          }
        }
      });
    });
  }
  function field(label, control) {
    return el("div", { class: "field" }, [el("label", { text: label }), control]);
  }
  function selectEl(pairs, value) {
    const s = el("select");
    pairs.forEach(([v, t]) => {
      const o = el("option", { value: v, text: t });
      if (String(v) === String(value)) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }
  function replaceOptions(fieldEl, pairs, value) {
    const s = fieldEl.querySelector("select");
    s.innerHTML = "";
    pairs.forEach(([v, t]) => {
      const o = el("option", { value: v, text: t });
      if (String(v) === String(value)) o.selected = true;
      s.appendChild(o);
    });
  }
  var map3D = null;
  var BU3D = {
    started: false,
    city: "shenzhen",
    year: 2014,
    mode: "cumulative",
    playing: false,
    timer: null,
    data: {},
    overview: {},
    meta: null,
    current: null,
    summaryCache: {},
    lodZoom: 14.7,
    // 自适应降级：细节层下交互帧时持续过低（中位 ≥150ms）时，临时上调 LOD 阈值回到概览层；
    // 调整只在交互中生效，城市切换 / 复位视角后清零重试。autoLod=false 可整体关闭（perf 脚本用它固定行为）。
    autoLod: true,
    autoRaise: 0,
    autoCool: 0,
    // 生长动画：token 用于在换城/换年时终止在跑的动画；spawn 缓存 [城市][源][年代]→按"建成区中心
    // 向外"排序的楼栋索引；rise 记录当前动画状态（startsWith t0/era/frames）。
    spawn: {},
    rise: { token: 0, active: false, t0: 0, srcId: "", chunks: [], ramp: 260, stride: 60 }
  };
  var B3D_FPS = { last: 0, times: [] };
  BU3D.samples = B3D_FPS;
  var BU3D_YEARS = [1990, 2e3, 2014, 2024];
  var BU3D_ERA = {
    1990: { label: "1990 \u524D\u5DF2\u5EFA\u6210", color: "#0f6e7c" },
    2e3: { label: "1990\u20132000 \u65B0\u589E", color: "#d0471f" },
    2014: { label: "2000\u20132014 \u65B0\u589E", color: "#9a6a10" },
    2024: { label: "2014 \u540E\u65B0\u589E", color: "#6b4fa1" }
  };
  var BU3D_LOD_DELTA = 1.4;
  function initBuiltup3D() {
    const section = document.getElementById("lab-builtup-3d");
    if (!section || BU3D.started) return;
    if (typeof maplibregl === "undefined") {
      show3DError("MapLibre \u672A\u52A0\u8F7D\uFF0C\u65E0\u6CD5\u663E\u793A 3D \u5EFA\u7B51");
      return;
    }
    const start = () => {
      if (!BU3D.started) {
        BU3D.started = true;
        startBuiltup3DMap();
      }
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      }, { rootMargin: "360px 0px" });
      io.observe(section);
    } else {
      start();
    }
  }
  function bu3dView() {
    const sel = document.querySelector("#a-controls select");
    const city = sel && sel.value || BU3D.city;
    return { city };
  }
  function startBuiltup3DMap() {
    const container = document.getElementById("map-3d");
    BU3D.city = bu3dView().city;
    const dpr = window.devicePixelRatio || 1;
    map3D = new maplibregl.Map({
      container,
      style: buildOnlineStyle(),
      center: [114.07, 22.58],
      zoom: 11.4,
      pitch: 56,
      bearing: -18,
      minZoom: TIANDITU_MIN_ZOOM,
      maxZoom: TIANDITU_MAX_ZOOM,
      maxPitch: 72,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      pixelRatio: Math.min(dpr, 1.5),
      antialias: dpr <= 1.25,
      renderWorldCopies: false
    });
    map3D.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    map3D.addControl(new maplibregl.ScaleControl({ maxWidth: 96, unit: "metric" }), "bottom-right");
    map3D.on("error", () => {
    });
    map3D.on("move", () => {
      if (map3D.__lodRaf) return;
      map3D.__lodRaf = requestAnimationFrame(() => {
        map3D.__lodRaf = null;
        updateLodChip();
      });
    });
    map3D.on("render", () => {
      const now = performance.now();
      if (B3D_FPS.last) {
        const dt = now - B3D_FPS.last;
        if (dt > 0 && dt < 5e3) {
          B3D_FPS.times.push(dt);
          if (B3D_FPS.times.length > 48) B3D_FPS.times.shift();
        }
      }
      B3D_FPS.last = now;
      evaluateAutoLod();
    });
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => {
        try {
          map3D && map3D.resize();
        } catch (e) {
        }
      });
      ro.observe(container);
    } else {
      window.addEventListener("resize", () => {
        try {
          map3D && map3D.resize();
        } catch (e) {
        }
      });
    }
    map3D.on("load", async () => {
      try {
        await setupBasemap(map3D);
        try {
          map3D.setMinZoom(8.5);
        } catch (e) {
        }
        apply3DSky();
        bind3DControls();
        BU3D.meta = await fetchJSON(dataUrl("buildings/buildings-meta.json"));
        await applyCity(BU3D.city);
        const loading = document.getElementById("map-3d-loading");
        if (loading) loading.classList.add("hide");
        window.__bu3D = {
          map: map3D,
          state: BU3D,
          get data() {
            return BU3D.data;
          },
          get overview() {
            return BU3D.overview;
          },
          setYear: set3DYear,
          setCity: applyCity,
          play: startPlay,
          stop: stopPlay,
          toggleMode: toggle3DMode
        };
      } catch (e) {
        show3DError("3D \u5EFA\u7B51\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
      }
    });
  }
  function apply3DSky() {
    if (!map3D || typeof map3D.setSky !== "function") return;
    try {
      map3D.setSky({
        "sky-color": "#ffd9b8",
        "horizon-color": "#fff6f4",
        "fog-color": "#fff6f4",
        "fog-ground-blend": 0.55,
        "horizon-fog-blend": 0.6,
        "sky-horizon-blend": 0.65,
        "atmosphere-blend": 0.16
      });
    } catch (e) {
    }
  }
  function bu3dPaint() {
    return {
      "fill-extrusion-color": [
        "match",
        ["get", "era"],
        1990,
        BU3D_ERA[1990].color,
        2e3,
        BU3D_ERA[2e3].color,
        2014,
        BU3D_ERA[2014].color,
        2024,
        BU3D_ERA[2024].color,
        "#8a8f87"
      ],
      // 生长动画：feature-state 'gh' 存在时用它（0→h 过渡值），否则回落到 1:1 真实高度 h。
      // 只走归一化路口，不建数据（buildings h 恒为准；动画用 setFeatureState 增量写 'gh'）。
      "fill-extrusion-height": [
        "coalesce",
        ["feature-state", "gh"],
        ["get", "h"]
      ],
      "fill-extrusion-base": 0,
      // 不透明渲染（透明度 1 才能开深度写入）：先压后画的重叠楼体由深度测试直接剔除，
      // 免掉半透明混合与逐片排序，是逐栋大场景帧时最直接的收益之一；
      // 0.95 → 1.0 在视觉上不可辨（颜色本身即为实色）。
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true
    };
  }
  function bu3dCamera(meta) {
    const [s, w, n, e] = meta.window;
    const lat = (s + n) / 2;
    const rad = lat * Math.PI / 180;
    const canvasW = Math.max(320, (map3D.getContainer().clientWidth || 1200) - 160);
    const kmWide = (e - w) * 111.32 * Math.cos(rad);
    const mPerPx = kmWide * 1e3 / (canvasW * 0.78);
    const zoom = Math.max(10.8, Math.min(13.4, Math.log2(156543.03392 * Math.cos(rad) / mPerPx)));
    return { center: [(w + e) / 2, lat], zoom, pitch: 56, bearing: -18 };
  }
  function bu3dFilter() {
    return BU3D.mode === "incremental" ? ["==", ["get", "era"], BU3D.year] : ["<=", ["get", "era"], BU3D.year];
  }
  function set3DLodRanges() {
    if (!map3D || map3D._removed) return;
    try {
      if (map3D.getLayer("bu3d-city")) map3D.setLayerZoomRange("bu3d-city", BU3D.lodZoom, 24);
      if (map3D.getLayer("bu3d-city-ov")) map3D.setLayerZoomRange("bu3d-city-ov", 0, BU3D.lodZoom);
    } catch (e) {
    }
  }
  var RISE_CAP = 2600;
  var RISE_EASE = (t) => t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
  function cancelEraRise(resetAll) {
    BU3D.rise.token += 1;
    BU3D.rise.active = false;
    if (resetAll && map3D && !map3D._removed) {
      try {
        if (map3D.getSource("bu3d-src")) map3D.removeFeatureState({ source: "bu3d-src" });
        if (map3D.getSource("bu3d-ov-src")) map3D.removeFeatureState({ source: "bu3d-ov-src" });
      } catch (e) {
      }
    }
  }
  function getSpawnOrder(city, srcKey, era) {
    const fcSrc = srcKey === "detail" ? BU3D.data[city] || {} : BU3D.overview[city] || {};
    const store = BU3D.spawn[city] = BU3D.spawn[city] || {};
    const src = store[srcKey] = store[srcKey] || {};
    if (src[era]) return src[era];
    const meta = BU3D.current;
    let clat = 30, clng = 108;
    if (meta && meta.window) {
      clat = (meta.window[0] + meta.window[2]) / 2;
      clng = (meta.window[1] + meta.window[3]) / 2;
    }
    const arr = [];
    (fcSrc.features || []).forEach((f, i) => {
      const p = f.properties || {};
      if (Number(p.era) !== era) return;
      let d = 0;
      try {
        const ring = f.geometry && f.geometry.coordinates[0];
        if (ring && ring[0]) {
          const la = ring[0][1], lo = ring[0][0];
          const dy = (la - clat) * 111.32;
          const dx = (lo - clng) * 111.32 * Math.cos(la * Math.PI / 180);
          d = Math.sqrt(dx * dx + dy * dy);
        }
      } catch (e) {
        d = 0;
      }
      arr.push({ i, d, h: Math.max(0, Number(p.h) || 0) });
    });
    arr.sort((a, b) => a.d - b.d);
    return src[era] = arr;
  }
  function startEraRise(prevYear, prevMode) {
    if (!map3D || map3D._removed || !BU3D.current) return;
    const year = BU3D.year;
    const mode = prevMode || BU3D.mode;
    const incremental = BU3D.mode === "incremental";
    const wants = (era) => incremental ? era === year : era <= year;
    const was = (era) => mode === "incremental" ? era === prevYear : era <= prevYear;
    const newEras = BU3D_YEARS.filter((era) => wants(era) && !was(era));
    if (!newEras.length || year < prevYear) {
      cancelEraRise(true);
      return;
    }
    const inDetail = map3D.getZoom() >= BU3D.lodZoom;
    const srcKey = inDetail ? "detail" : "overview";
    const srcId = inDetail ? "bu3d-src" : "bu3d-ov-src";
    if (!map3D.getSource(srcId)) {
      cancelEraRise(false);
      return;
    }
    const token = ++BU3D.rise.token;
    const stride = BU3D.playing ? 55 : 85;
    const ramp = BU3D.playing ? 240 : 420;
    const subset = [];
    for (const era of newEras) {
      for (const rec of getSpawnOrder(BU3D.city, srcKey, era)) {
        if (subset.length >= RISE_CAP) break;
        subset.push(rec);
      }
      if (subset.length >= RISE_CAP) break;
    }
    if (!subset.length) {
      cancelEraRise(false);
      return;
    }
    const chunkSize = 240;
    const chunks = [];
    for (let i = 0; i < subset.length; i += chunkSize) chunks.push(subset.slice(i, i + chunkSize));
    BU3D.rise.active = true;
    BU3D.rise.srcId = srcId;
    BU3D.rise.t0 = performance.now();
    BU3D.rise.chunks = chunks;
    BU3D.rise.stride = stride;
    BU3D.rise.ramp = ramp;
    const t0 = BU3D.rise.t0;
    const tick = () => {
      if (token !== BU3D.rise.token) {
        try {
          if (map3D && !map3D._removed && map3D.getSource(srcId)) map3D.removeFeatureState({ source: srcId });
        } catch (e) {
        }
        return;
      }
      const now = performance.now();
      const totalEnd = t0 + (chunks.length - 1) * stride + ramp;
      if (now >= totalEnd) {
        BU3D.rise.active = false;
        try {
          map3D.removeFeatureState({ source: srcId });
        } catch (e) {
        }
        return;
      }
      if (document.hidden) {
        requestAnimationFrame(tick);
        return;
      }
      let writes = 0;
      for (let c = 0; c < chunks.length; c++) {
        const startAt = t0 + c * stride;
        if (now < startAt) break;
        const p = RISE_EASE(Math.min(1, (now - startAt) / ramp));
        if (p >= 1) continue;
        for (const rec of chunks[c]) {
          try {
            map3D.setFeatureState({ source: srcId, id: rec.i }, { gh: rec.h * p });
            writes += 1;
          } catch (e) {
            break;
          }
        }
        if (writes > 700) break;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function evaluateAutoLod() {
    if (!BU3D.autoLod || !map3D || map3D._removed || !BU3D.current) return;
    if (document.hidden) return;
    const t = B3D_FPS.times;
    if (t.length < 24) return;
    const a = t.slice().sort((x, y) => x - y);
    const med = a[a.length >> 1];
    const now = Date.now();
    const detailVisible = map3D.getZoom() >= BU3D.lodZoom - 0.01;
    if (detailVisible && med >= 150 && now > BU3D.autoCool && BU3D.autoRaise < 1) {
      BU3D.autoRaise = Math.min(1, BU3D.autoRaise + 0.7);
      BU3D.autoCool = now + 12e3;
      BU3D.lodZoom = Math.min(16, Math.max(map3D.getZoom() + BU3D_LOD_DELTA + BU3D.autoRaise, BU3D.lodZoom));
      set3DLodRanges();
      updateLodChip(true);
      B3D_FPS.times.length = 0;
    }
  }
  function toggle3DMode() {
    const prevMode = BU3D.mode;
    BU3D.mode = BU3D.mode === "cumulative" ? "incremental" : "cumulative";
    const prevYear = BU3D.year;
    ["bu3d-city", "bu3d-city-ov"].forEach((id) => {
      if (map3D && map3D.getLayer(id)) map3D.setFilter(id, bu3dFilter());
    });
    if (prevMode === "incremental") {
      startEraRise(prevYear, prevMode);
    } else {
      cancelEraRise(true);
    }
    apply3DControlsState();
    render3DStats();
  }
  var applyCityToken = 0;
  async function applyCity(city) {
    if (!map3D || !BU3D.meta) return;
    const meta = (BU3D.meta.cities || []).find((m) => m.city === city);
    if (!meta) {
      show3DError(`${city} \u6682\u65E0 3D \u5EFA\u7B51\u6570\u636E`);
      return;
    }
    const token = ++applyCityToken;
    BU3D.city = city;
    BU3D.current = meta;
    build3DCitySelect();
    if (!BU3D.data[city]) {
      const [detail, overview] = await Promise.all([
        fetchJSON(dataUrl(`buildings/${city}.geojson`)),
        fetchJSON(dataUrl(`buildings/${city}-overview.geojson`))
      ]);
      (detail.features || []).forEach((f, i) => {
        f.id = i;
      });
      (overview.features || []).forEach((f, i) => {
        f.id = i;
      });
      BU3D.data[city] = detail;
      BU3D.overview[city] = overview;
      BU3D.spawn[city] = {};
    }
    if (applyCityToken !== token || !map3D || map3D._removed) return;
    const fc = BU3D.data[city];
    const ov = BU3D.overview[city];
    const cam = bu3dCamera(meta);
    BU3D.autoRaise = 0;
    BU3D.lodZoom = Math.min(16, cam.zoom + BU3D_LOD_DELTA);
    if (!map3D.getSource("bu3d-src")) {
      map3D.addSource("bu3d-src", { type: "geojson", data: fc, maxzoom: 14, buffer: 24, tolerance: 0.375 });
      map3D.addLayer({ id: "bu3d-city", type: "fill-extrusion", source: "bu3d-src", minzoom: BU3D.lodZoom, paint: bu3dPaint(), filter: bu3dFilter() });
    } else {
      map3D.getSource("bu3d-src").setData(fc);
      map3D.setLayerZoomRange("bu3d-city", BU3D.lodZoom, 24);
    }
    if (!map3D.getSource("bu3d-ov-src")) {
      map3D.addSource("bu3d-ov-src", { type: "geojson", data: ov, maxzoom: 13, buffer: 16, tolerance: 0.375 });
      map3D.addLayer({ id: "bu3d-city-ov", type: "fill-extrusion", source: "bu3d-ov-src", maxzoom: BU3D.lodZoom, paint: bu3dPaint(), filter: bu3dFilter() });
    } else {
      map3D.getSource("bu3d-ov-src").setData(ov);
      map3D.setLayerZoomRange("bu3d-city-ov", 0, BU3D.lodZoom);
    }
    cancelEraRise(true);
    try {
      map3D.easeTo(Object.assign(cam, {
        duration: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700
      }));
      map3D.once("moveend", () => repairBasemapTiles(map3D));
    } catch (err) {
      repairBasemapTiles(map3D);
    }
    render3DLegend();
    render3DNote();
    render3DStats();
    apply3DControlsState();
    updateLodChip(true);
  }
  function set3DYear(year) {
    const prev = BU3D.year;
    BU3D.year = Number(year);
    if (prev === BU3D.year) return;
    ["bu3d-city", "bu3d-city-ov"].forEach((id) => {
      if (map3D && map3D.getLayer(id)) map3D.setFilter(id, bu3dFilter());
    });
    startEraRise(prev);
    apply3DControlsState();
    render3DStats();
  }
  function startPlay() {
    stopPlay();
    BU3D.playing = true;
    let i = BU3D_YEARS.indexOf(BU3D.year);
    if (i < 0 || i >= BU3D_YEARS.length - 1) i = -1;
    apply3DControlsState();
    const tick = () => {
      if (!BU3D.playing) return;
      i += 1;
      if (i >= BU3D_YEARS.length) {
        stopPlay();
        return;
      }
      set3DYear(BU3D_YEARS[i]);
      if (i >= BU3D_YEARS.length - 1) BU3D.timer = setTimeout(stopPlay, 1600);
      else BU3D.timer = setTimeout(tick, 1400);
    };
    BU3D.timer = setTimeout(tick, 320);
  }
  function stopPlay() {
    if (BU3D.timer) clearTimeout(BU3D.timer);
    BU3D.timer = null;
    BU3D.playing = false;
    apply3DControlsState();
  }
  function apply3DControlsState() {
    document.querySelectorAll("[data-3d-year]").forEach((btn) => {
      const on = Number(btn.getAttribute("data-3d-year")) === BU3D.year;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const play = document.getElementById("btn-3d-play");
    if (play) {
      play.classList.toggle("active", BU3D.playing);
      play.textContent = BU3D.playing ? "\u25A0 \u505C\u6B62" : "\u25B6 \u64AD\u653E\u6F14\u5316";
      play.setAttribute("aria-pressed", BU3D.playing ? "true" : "false");
    }
    const sel = document.getElementById("lab-3d-city-select");
    if (sel && sel.value !== BU3D.city) sel.value = BU3D.city;
    const inc = document.getElementById("btn-3d-incremental");
    if (inc) {
      const on = BU3D.mode === "incremental";
      inc.classList.toggle("active", on);
      inc.setAttribute("aria-pressed", on ? "true" : "false");
      inc.textContent = on ? "\u53EA\u770B\u65B0\u589E" : "\u7D2F\u8BA1\u663E\u793A";
    }
  }
  function summarizeCity(fc, meta) {
    const ck = `${BU3D.city}|${BU3D.mode}|${BU3D.year}`;
    if (BU3D.summaryCache[ck]) return BU3D.summaryCache[ck];
    const feats = fc.features || [];
    const inView = (era) => BU3D.mode === "incremental" ? era === BU3D.year : era <= BU3D.year;
    const visible = [];
    const eraCount = { 1990: 0, 2e3: 0, 2014: 0, 2024: 0 };
    const hs = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let tallest = null;
    for (const f of feats) {
      const p = f.properties || {};
      const era = Number(p.era);
      if (eraCount[era] != null) eraCount[era] += 1;
      if (!tallest || Number(p.h) > Number(tallest.h)) tallest = p;
      if (inView(era)) {
        visible.push(Number(p.h));
        if (hs[p.hs] != null) hs[p.hs] += 1;
      }
    }
    visible.sort((a, b) => a - b);
    const pct = (q) => visible.length ? visible[Math.min(visible.length - 1, Math.floor(visible.length * q))] : 0;
    const out = {
      total: feats.length,
      visible: visible.length,
      eraCount,
      hs,
      median: pct(0.5),
      p90: pct(0.9),
      tallest: tallest || { h: 0, era: 0 },
      meta
    };
    BU3D.summaryCache = { [ck]: out };
    return out;
  }
  function render3DLegend() {
    const host = document.getElementById("lab-3d-legend");
    if (!host) return;
    const fc = BU3D.data[BU3D.city];
    if (!fc) {
      host.innerHTML = "";
      return;
    }
    const s = summarizeCity(fc, BU3D.current);
    host.innerHTML = "";
    host.appendChild(el("span", { class: "lab-3d-legend-title", text: "\u9996\u6B21\u8FDB\u5165\u5EFA\u6210\u533A" }));
    BU3D_YEARS.forEach((y) => {
      const row = el("span", { class: "lab-3d-legend-row" + (y <= BU3D.year ? "" : " is-off") }, [
        el("i", { class: "era-" + y }),
        el("span", { text: BU3D_ERA[y].label }),
        el("em", { class: "lab-3d-legend-count", text: formatNumber(s.eraCount[y]) })
      ]);
      host.appendChild(row);
    });
  }
  var lodChipText = "";
  function updateLodChip(force) {
    const host = document.getElementById("lab-3d-lod");
    if (!host || !map3D) return;
    const z = map3D.getZoom();
    const detail = z >= BU3D.lodZoom;
    const m = BU3D.current;
    const dn = (BU3D.data[BU3D.city] || { features: [] }).features.length;
    const on = (BU3D.overview[BU3D.city] || { features: [] }).features.length;
    const ratio = dn ? Math.round(100 * on / dn) : 0;
    const cell = m && m.overview_cell_deg || 13e-4;
    const lat = m ? (m.window[0] + m.window[2]) / 2 : 30;
    const cw = Math.round(cell * 111320 * Math.cos(lat * Math.PI / 180));
    const ch = Math.round(cell * 110570);
    const degrade = BU3D.autoRaise > 0 ? ` \xB7 \u5E27\u7387\u4F4E\uFF0C\u5DF2\u4E34\u65F6\u4E0A\u8C03\u7EC6\u8282\u9608\u503C ${BU3D.autoRaise.toFixed(1)} \u7EA7` : "";
    const text = detail ? `\u9010\u680B\u7EC6\u8282\u5C42 \xB7 ${formatNumber(dn)} \u680B\u5168\u91CF\u8F6E\u5ED3\uFF08\u653E\u5927\u4E2D\uFF0C\u8F6F\u4EF6\u6E32\u67D3\u6216\u4F4E\u7AEF\u663E\u5361\u65CB\u8F6C\u53EF\u80FD\u53D8\u6162\uFF09` : `\u8FDC\u666F\u6982\u89C8\u5C42 \xB7 \u6BCF ${cw}\xD7${ch}m \u7F51\u683C\u4FDD\u7559\u6700\u9AD8\u4E00\u680B\uFF0C${formatNumber(on)} / ${formatNumber(dn)} \u680B\uFF08${ratio}%\uFF09 \xB7 \u653E\u5927\u5230 ${BU3D.lodZoom.toFixed(1)} \u7EA7\u5207\u6362\u9010\u680B\u8F6E\u5ED3${degrade}`;
    if (!force && text === lodChipText) {
      host.classList.toggle("is-detail", detail);
      return;
    }
    lodChipText = text;
    host.textContent = text;
    host.classList.toggle("is-detail", detail);
  }
  function render3DNote() {
    const host = document.getElementById("lab-3d-note");
    if (!host || !BU3D.current) return;
    const m = BU3D.current;
    const kmx = ((m.window[3] - m.window[1]) * 111.32 * 0.92).toFixed(1);
    const kmy = ((m.window[2] - m.window[0]) * 110.57).toFixed(1);
    host.textContent = `\u8F6E\u5ED3\uFF1AOpenStreetMap \u5EFA\u7B51\u591A\u8FB9\u5F62\uFF08\xA9 OpenStreetMap contributors\uFF0CODbL\uFF09\uFF0C\u53CD\u6620\u5F53\u524D\u5730\u56FE\u72B6\u6001\uFF1B\u8BE5\u57CE\u5E02 OSM \u6536\u5F55\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF0C\u8F6E\u5ED3\u7A00\u758F\u5904\u4E0D\u4EE3\u8868\u5B9E\u5730\u6CA1\u6709\u5EFA\u7B51\u3002\u5E74\u4EE3\uFF1A\u6309\u5EFA\u7B51\u5E95\u9762\u8D28\u5FC3\u9996\u6B21\u843D\u5165 AUE \u5EFA\u6210\u533A\uFF081990 / 2000 / 2014\uFF09\u7684\u65F6\u76F8\u63A8\u65AD\uFF0C\u4E09\u671F\u8303\u56F4\u5916\u8BB0\u4E3A\u300C2014 \u540E\u65B0\u589E\u300D\uFF0C\u662F\u5E74\u4EE3\u5206\u5C42\u800C\u975E\u7AE3\u5DE5\u5E74\u4EFD\u3002\u9AD8\u5EA6\uFF1AOSM height \u6807\u7B7E \u2192 building:levels \xD7 3.2m \u2192 \u540C\u5E74\u4EE3\u540C\u7C7B\u578B\u4E2D\u4F4D\u6570 \u2192 \u540C\u5E74\u4EE3\u4E2D\u4F4D\u6570 \u2192 8m \u515C\u5E95\uFF0C\u6309 1:1 \u7C73\u6E32\u67D3\u3002\u7A97\u53E3\uFF1A\u7531\u5EFA\u6210\u533A\u51E0\u4F55\u641C\u7D22\u786E\u5B9A\u7684${m.name_cn}\u6838\u5FC3\u533A\uFF08\u7EA6 ${kmx} \xD7 ${kmy} km\uFF09\uFF0C\u975E\u5168\u5E02\u57DF\u3002`;
  }
  function render3DStats() {
    const host = document.getElementById("lab-3d-stats");
    if (!host) return;
    const fc = BU3D.data[BU3D.city];
    if (!fc) {
      host.textContent = "";
      return;
    }
    const s = summarizeCity(fc, BU3D.current);
    const n = s.total || 1;
    const items = [
      ["\u65F6\u76F8", BU3D.year === 2024 ? "\u73B0\u72B6\uFF082014 \u540E\uFF09" : String(BU3D.year)],
      [BU3D.mode === "incremental" ? "\u53EF\u89C1\u5EFA\u7B51\uFF08\u672C\u5E74\u4EE3\u65B0\u589E\uFF09" : "\u53EF\u89C1\u5EFA\u7B51\uFF08\u7D2F\u8BA1\uFF09", `${formatNumber(s.visible)} / ${formatNumber(s.total)}`],
      ["\u4E2D\u4F4D\u9AD8\u5EA6", `${Number(s.median).toFixed(1)} m`],
      ["P90 \u9AD8\u5EA6", `${Number(s.p90).toFixed(1)} m`],
      ["\u6700\u9AD8\u5EFA\u7B51\uFF08\u5168\u65F6\u6BB5\uFF09", `${Number(s.tallest.h).toFixed(1)} m`],
      ["\u9AD8\u5EA6\u6765\u6E90 \u5B9E\u6D4B/\u6807\u7B7E", `${(100 * s.hs[0] / n).toFixed(1)}%`],
      ["\u9AD8\u5EA6\u6765\u6E90 \u5C42\u6570\u63A8\u7B97", `${(100 * s.hs[1] / n).toFixed(1)}%`],
      ["\u9AD8\u5EA6\u6765\u6E90 \u540C\u7C7B\u4E2D\u4F4D\u6570", `${(100 * (s.hs[2] + s.hs[3]) / n).toFixed(1)}%`],
      ["\u9AD8\u5EA6\u6765\u6E90 \u515C\u5E95", `${(100 * s.hs[4] / n).toFixed(1)}%`]
    ];
    if (s.meta && s.meta.thinned_out > 0) {
      items.push(["\u6536\u5F55\u62BD\u7A00", `\u4FDD\u7559 ${formatNumber(s.total)}\uFF0C\u820D\u5F03 ${formatNumber(s.meta.thinned_out)}\uFF08\u6309\u5E95\u9762\u79EF\u4F18\u5148\uFF09`]);
    }
    const topEra = Object.entries(s.eraCount).sort((a, b) => b[1] - a[1])[0];
    if (topEra && s.total > 0 && topEra[1] / s.total >= 0.8) {
      items.push([
        "\u5E74\u4EE3\u6784\u6210\u63D0\u793A",
        `${BU3D_ERA[topEra[0]].label} \u5360 ${(100 * topEra[1] / s.total).toFixed(0)}%\uFF0C\u8BE5\u57CE\u6269\u5F20\u591A\u5728\u7A97\u53E3\u5916\u56F4\uFF0C\u53EF\u5207\u300C\u53EA\u770B\u65B0\u589E\u300D\u770B\u5404\u5E74\u4EE3\u589E\u91CF`
      ]);
    }
    host.innerHTML = "";
    items.forEach(([label, value]) => {
      host.appendChild(el("div", { class: "lab-3d-stat" }, [
        el("span", { class: "lab-3d-stat-label", text: label }),
        el("strong", { class: "lab-3d-stat-value tabular-nums", text: value })
      ]));
    });
    render3DLegend();
  }
  function build3DCitySelect() {
    const sel = document.getElementById("lab-3d-city-select");
    if (!sel || sel.options.length) return;
    const names = {};
    (BU3D.meta && BU3D.meta.cities || []).forEach((m) => {
      names[m.city] = m.name_cn;
    });
    const keys = Object.keys(URBAN.cities).filter((c) => names[c]);
    sel.innerHTML = "";
    keys.forEach((c) => sel.appendChild(el("option", { value: c, text: names[c] })));
    sel.value = BU3D.city;
    sel.addEventListener("change", () => applyCity(sel.value).catch(() => {
    }));
  }
  function bind3DControls() {
    document.querySelectorAll("[data-3d-year]").forEach((btn) => {
      btn.addEventListener("click", () => {
        stopPlay();
        set3DYear(Number(btn.getAttribute("data-3d-year")));
      });
    });
    const play = document.getElementById("btn-3d-play");
    if (play) play.addEventListener("click", () => {
      if (BU3D.playing) stopPlay();
      else startPlay();
    });
    const inc = document.getElementById("btn-3d-incremental");
    if (inc) inc.addEventListener("click", toggle3DMode);
    const reset = document.getElementById("btn-3d-reset");
    if (reset) {
      reset.addEventListener("click", () => {
        const m = BU3D.current;
        if (!m) return;
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        try {
          const cam = bu3dCamera(m);
          map3D.easeTo(Object.assign(cam, { duration: reduce ? 0 : 700 }));
          BU3D.autoRaise = 0;
          BU3D.lodZoom = Math.min(16, cam.zoom + BU3D_LOD_DELTA);
          set3DLodRanges();
          updateLodChip(true);
          cancelEraRise(true);
        } catch (e2) {
        }
      });
    }
    apply3DControlsState();
  }
  function show3DError(msg) {
    const loading = document.getElementById("map-3d-loading");
    if (loading) {
      loading.classList.remove("hide");
      loading.textContent = msg;
    }
    toast(msg, "error", 4e3);
  }
  function showBasemapFallbackBanner(msg, ms) {
    try {
      let bar = document.getElementById("wb-basemap-banner");
      if (!bar) {
        bar = el("div", { id: "wb-basemap-banner", class: "basemap-banner", role: "status" });
        document.body.appendChild(bar);
      }
      bar.textContent = msg;
      bar.classList.add("show");
      clearTimeout(bar._t);
      bar._t = setTimeout(() => bar.classList.remove("show"), ms || 8e3);
    } catch (err) {
    }
  }
  document.addEventListener("wb-basemap-fallback", (e) => {
    try {
      const on = !!(e && e.detail && e.detail.fallback);
      if (on) {
        const name = e.detail && e.detail.name || "\u5907\u7528\u5E95\u56FE";
        const attr = e.detail && e.detail.attr || "";
        showBasemapFallbackBanner(`\u5929\u5730\u56FE\u4ECA\u65E5\u74E6\u7247\u914D\u989D\u53D7\u9650\uFF0C\u5DF2\u4E34\u65F6\u5207\u6362\u5230${name}\uFF08${attr}\uFF09\uFF0C\u6062\u590D\u540E\u81EA\u52A8\u5207\u56DE`, 1e4);
      } else {
        showBasemapFallbackBanner("\u5929\u5730\u56FE\u5E95\u56FE\u5DF2\u6062\u590D\uFF08\xA9 \u5929\u5730\u56FE \xB7 GS(2023)336\u53F7\uFF09", 8e3);
      }
    } catch (err) {
    }
  });

  // scripts/local-entries/analysis.js
  initShell();
  initAnalysisPage();
})();
