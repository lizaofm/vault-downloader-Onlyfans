/*
 * Lizaofm — interceptor de API (MAIN world)
 * Lee las respuestas de la API de OnlyFans y extrae cada pieza de medio con su
 * ID estable (el mismo para todas sus versiones de tamaño), su archivo completo
 * (foto full-res vía source / vídeo .mp4 vía videoSources) y su preview.
 * Al usar el ID como clave, el conteo es exacto y no hay duplicados por tamaños.
 * No modifica ninguna petición; solo observa las respuestas.
 */
(function () {
  "use strict";

  if (window.__lizaofmApiHooked) return;
  window.__lizaofmApiHooked = true;

  var DEBUG = true;
  var API_RE = /\/api2\//i;

  function dlog() {
    if (!DEBUG) return;
    try {
      console.log.apply(console,
        ["%c[Lizaofm]", "color:#00aff0;font-weight:bold"].concat([].slice.call(arguments)));
    } catch (e) {}
  }

  dlog("interceptor de API cargado (captura por id).");

  function handle(url, text) {
    if (!url || !API_RE.test(url) || !text) return;
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }

    var items = [];
    collect(data, items, 0);
    if (items.length) {
      dlog(url.split("?")[0], "→", items.length, "pieza(s)");
      window.postMessage({ source: "lizaofm", kind: "media", items: items }, "*");
    }
  }

  function collect(node, out, depth) {
    if (!node || depth > 9 || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) collect(node[i], out, depth + 1);
      return;
    }
    var m = pickItem(node);
    if (m) out.push(m);
    for (var k in node) {
      var c = node[k];
      if (c && typeof c === "object") collect(c, out, depth + 1);
    }
  }

  // De un objeto de medio devuelve { url:<archivo completo>, poster:<preview|null> }.
  // El background clasifica el tipo por la extensión de la URL.
  function pickItem(o) {
    // Vídeo: el .mp4 + su preview (que el navegador no descarga al solo navegar).
    var video = (o.videoSources && typeof o.videoSources === "object") ? bestVideo(o.videoSources) : null;
    if (video) return { url: video, poster: pickPoster(o) };

    // Foto o audio: el archivo completo desde source/files.
    var fileUrl = null;
    if (o.source && typeof o.source === "object" && typeof o.source.source === "string") fileUrl = o.source.source;
    if (!fileUrl && o.files && typeof o.files === "object") {
      var f = o.files;
      fileUrl = (f.full && f.full.url) || (f.source && f.source.url) || null;
    }
    if (fileUrl) return { url: fileUrl, poster: null };

    return null;
  }

  function pickPoster(o) {
    var t = null;
    if (typeof o.thumb === "string") t = o.thumb;
    else if (typeof o.preview === "string") t = o.preview;
    else if (typeof o.squarePreview === "string") t = o.squarePreview;
    if (!t && o.files && typeof o.files === "object") {
      var f = o.files;
      t = (f.preview && f.preview.url) ||
          (f.thumb && f.thumb.url) ||
          (f.squarePreview && f.squarePreview.url) || null;
    }
    return (typeof t === "string" && /^https?:\/\//i.test(t)) ? t : null;
  }

  function bestVideo(vs) {
    var order = ["1080", "720", "source", "480", "360", "240"];
    for (var i = 0; i < order.length; i++) {
      if (typeof vs[order[i]] === "string") return vs[order[i]];
    }
    for (var k in vs) {
      if (typeof vs[k] === "string" && /^https?:/i.test(vs[k])) return vs[k];
    }
    return null;
  }

  // ---- Hook fetch ----
  var origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function () {
      var args = arguments;
      var p = origFetch.apply(this, args);
      try {
        p.then(function (res) {
          try {
            var url = (res && res.url) ||
                      (typeof args[0] === "string" ? args[0] : (args[0] && args[0].url)) || "";
            if (API_RE.test(url) && res && typeof res.clone === "function") {
              res.clone().text().then(function (t) { handle(url, t); }).catch(function () {});
            }
          } catch (e) {}
        }).catch(function () {});
      } catch (e) {}
      return p;
    };
  }

  // ---- Hook XMLHttpRequest (axios usa XHR) ----
  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var origOpen = XHR.prototype.open;
    var origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      try { this.__lizaofmUrl = url; } catch (e) {}
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      var self = this;
      try {
        self.addEventListener("load", function () {
          try {
            var url = self.responseURL || self.__lizaofmUrl || "";
            if (!API_RE.test(url)) return;
            var text = null;
            try { text = self.responseText; } catch (e) {}
            if (!text && self.response != null) {
              text = (typeof self.response === "string") ? self.response : JSON.stringify(self.response);
            }
            if (text) handle(url, text);
          } catch (e) {}
        });
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }
})();
