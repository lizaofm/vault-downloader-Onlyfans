/*
 * Lizaofm — service worker (background)
 * Captura las URLs de medios del CDN de OnlyFans con chrome.webRequest (fotos,
 * vídeos y audios) y recibe del lector de API los .mp4 de vídeo + su preview.
 * Guarda todo y descarga lo seleccionado con chrome.downloads en Descargas.
 */

var KEY = "lizaofm_items";

/* ============================ CAPTURA ============================ */

var captured = {};   // path -> { id, url, type, w, h, hash, fhash, poster }
var flushTimer = null;

chrome.storage.local.get(KEY, function (res) {
  captured = (res && res[KEY]) || {};
});

var CDN_RE = /:\/\/[^/]*onlyfans\.com\/files\//i;
var PHOTO_RE = /\.(jpg|jpeg|png|webp|gif)(?:$|\?|\/)/i;
var VIDEO_RE = /\.(mp4|m4v|mov|webm)(?:$|\?|\/)/i;
var AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|opus)(?:$|\?|\/)/i;

chrome.webRequest.onBeforeRequest.addListener(
  function (d) { try { capture(d.url); } catch (e) {} },
  { urls: ["*://*.onlyfans.com/*"], types: ["image", "media", "xmlhttprequest", "other"] }
);

// capture(url[, poster]) — poster llega emparejado desde la API (para vídeos).
function capture(url, poster) {
  if (!url || !CDN_RE.test(url)) return;
  var path = url.split("?")[0];
  var type = VIDEO_RE.test(path) ? "video" : AUDIO_RE.test(path) ? "audio" : PHOTO_RE.test(path) ? "photo" : null;
  if (!type) return;

  if (captured[path]) {
    captured[path].url = url;                 // refresca la firma
    if (poster) captured[path].poster = poster;
    scheduleFlush();
    return;
  }

  var file = path.substring(path.lastIndexOf("/") + 1);
  var parts = path.split("/");
  var hash = parts[parts.length - 2] || file;   // carpeta
  var fhash = fileHash(file);                    // hash del archivo (estable entre tamaños)

  var w = null, h = null;
  var m = file.match(/(\d{2,5})x(\d{2,5})/);
  if (m) { w = parseInt(m[1], 10); h = parseInt(m[2], 10); }
  else { var mp = file.match(/(?:^|[_-])(\d{3,4})p(?:[._]|$)/i); if (mp) h = parseInt(mp[1], 10); }

  captured[path] = { id: path, url: url, type: type, w: w, h: h, hash: hash, fhash: fhash, poster: poster || null };
  scheduleFlush();
}

// Quita prefijo de tamaño (300x300_), sufijo de calidad (_720p), de fotograma
// (_frame_0) y la extensión → identificador estable del archivo entre versiones.
function fileHash(file) {
  var s = file.replace(/\.[a-z0-9]+$/i, "");
  s = s.replace(/^\d{2,5}x\d{2,5}_/, "");
  s = s.replace(/_(\d{3,4})p$/i, "");
  s = s.replace(/_frame_\d+$/i, "");
  return s || file;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(function () {
    flushTimer = null;
    var obj = {}; obj[KEY] = captured;
    chrome.storage.local.set(obj);
  }, 400);
}

/* ============================ MENSAJES ============================ */

var STATE = { queue: [], active: 0, max: 4, done: 0, failed: 0, total: 0, seen: {} };
var autoState = { running: false, done: 0, total: 0 };

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;

  if (msg.type === "lizaofm-add") {
    var its = msg.items || [];
    for (var i = 0; i < its.length; i++) {
      var it = its[i];
      if (it && it.url) { try { capture(it.url, it.poster); } catch (e) {} }
    }
    scheduleFlush();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "lizaofm-download") {
    enqueue(msg.items || []);
    sendResponse({ ok: true, total: STATE.total });
    return true;
  }

  if (msg.type === "lizaofm-status") {
    sendResponse({
      done: STATE.done, failed: STATE.failed, total: STATE.total,
      queueLen: STATE.queue.length, active: STATE.active, auto: autoState
    });
    return true;
  }

  if (msg.type === "lizaofm-reset-progress") {
    STATE.done = 0; STATE.failed = 0; STATE.total = 0; STATE.queue = []; STATE.seen = {};
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "lizaofm-clear") {
    captured = {};
    var obj = {}; obj[KEY] = {};
    chrome.storage.local.set(obj);
    STATE.done = 0; STATE.failed = 0; STATE.total = 0; STATE.queue = []; STATE.seen = {};
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "lizaofm-open-gallery") {
    openGallery();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "lizaofm-run-auto") {
    chrome.tabs.query({ url: ["https://onlyfans.com/*"] }, function (tabs) {
      if (!tabs || !tabs.length) { sendResponse({ ok: false, reason: "no-tab" }); return; }
      chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true });
      chrome.tabs.sendMessage(tabs[0].id, { type: "lizaofm-run-auto" });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "lizaofm-stop-auto") {
    chrome.tabs.query({ url: ["https://onlyfans.com/*"] }, function (tabs) {
      if (tabs) tabs.forEach(function (t) { chrome.tabs.sendMessage(t.id, { type: "lizaofm-stop-auto" }); });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "lizaofm-auto-progress") {
    autoState = { running: !!msg.running, done: msg.done || 0, total: msg.total || 0 };
    sendResponse({ ok: true });
    return true;
  }
});

/* ---------- Abrir la galería ---------- */
var galleryTabId = null;
chrome.action.onClicked.addListener(function () { openGallery(); });

function openGallery() {
  var gurl = chrome.runtime.getURL("gallery.html");
  if (galleryTabId != null) {
    chrome.tabs.get(galleryTabId, function (tab) {
      if (chrome.runtime.lastError || !tab) { createGallery(gurl); return; }
      chrome.tabs.update(galleryTabId, { active: true });
      if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
    });
  } else { createGallery(gurl); }
}
function createGallery(gurl) {
  chrome.tabs.create({ url: gurl }, function (tab) { if (tab) galleryTabId = tab.id; });
}

/* ============================ DESCARGAS ============================ */

function enqueue(list) {
  var added = 0;
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (!it || !it.url || STATE.seen[it.url]) continue;
    STATE.seen[it.url] = true;
    STATE.queue.push(it);
    added++;
  }
  STATE.total += added;
  pump();
}

function pump() {
  while (STATE.active < STATE.max && STATE.queue.length) {
    var it = STATE.queue.shift();
    STATE.active++;
    downloadOne(it).then(function () { STATE.active--; pump(); });
  }
}

function downloadOne(it) {
  return new Promise(function (resolve) {
    try {
      chrome.downloads.download(
        { url: it.url, filename: makeName(it), conflictAction: "uniquify", saveAs: false },
        function (id) {
          if (chrome.runtime.lastError || id === undefined) {
            STATE.failed++;
            delete STATE.seen[it.url];
          } else { STATE.done++; }
          resolve();
        }
      );
    } catch (e) { STATE.failed++; resolve(); }
  });
}

function makeName(it) {
  var path = String(it.url).split("?")[0];
  var file = path.substring(path.lastIndexOf("/") + 1) || "media";
  file = file.replace(/[^a-z0-9._-]/gi, "_");
  return file;
}
