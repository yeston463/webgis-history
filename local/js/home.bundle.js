(() => {
  // js/utils.js
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
  var qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
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
  function pageHref(p) {
    const prefix = location.pathname.includes("/pages/") ? "../" : "";
    return prefix + p;
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
  function assetUrl(p) {
    if (!p) return "";
    if (/^(https?:|data:|blob:)/i.test(p)) return p;
    const prefix = location.pathname.includes("/pages/") ? "../" : "";
    return prefix + p.replace(/^\.?\/+/, "");
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
  function initRevealOnScroll() {
    const items = qsa("[data-reveal]");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach((i) => i.classList.add("revealed"));
      return;
    }
    document.documentElement.classList.add("js");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("revealed");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    items.forEach((i) => io.observe(i));
  }

  // scripts/local-entries/home.js
  initShell();
  (async () => {
    try {
      const cities = await fetchJSON("data/cities.json");
      const wrap = document.getElementById("city-cards");
      cities.forEach((c) => {
        const img = el("img", { alt: c.name + "\u57CE\u5E02\u5B9E\u666F", width: 640, height: 480, loading: "lazy", decoding: "async" });
        const realCover = assetUrl(c.cover);
        if (realCover) loadImage(img, realCover, c.name, c.coverCategory || "building");
        else img.src = placeholderDataURI(c.name, c.coverCategory || "building", 640, 480);
        const card = el("a", {
          class: "city-card tap",
          href: `pages/cities.html?city=${c.key}`,
          "data-reveal": ""
        }, [
          el("figure", { class: "cc-figure" }, [img]),
          el("div", { class: "cc-body" }, [
            el("div", { class: "cc-name", text: c.name }),
            el("div", { class: "cc-en", text: c.en || "" }),
            el("div", { class: "cc-period", text: c.period || "" }),
            el("div", { class: "cc-desc", text: c.short || "" }),
            el("div", { class: "cc-go", text: "\u67E5\u770B\u57CE\u5E02\u6863\u6848" })
          ])
        ]);
        wrap.appendChild(card);
      });
    } catch (e) {
      console.error("\u57CE\u5E02\u5361\u7247\u52A0\u8F7D\u5931\u8D25", e);
    }
    initRevealOnScroll();
  })();
})();
