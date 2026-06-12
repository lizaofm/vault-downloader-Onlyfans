/*
 * Lizaofm — content script (ISOLATED world). SIN interfaz visible.
 *  - Puente: reenvía al background las piezas que extrae el lector de API
 *    (interceptor.js, MAIN world).
 *  - Auto-abridor: a la orden de la galería, abre cada elemento de la bóveda un
 *    instante para forzar la carga del archivo (el .mp4 de los vídeos solo se
 *    pide al abrirlos) y así quede capturado. Reporta el progreso al background.
 */
(function () {
  "use strict";

  var autoRunning = false;
  var openedHashes = new Set();
  var DELAY = 1300; // ms por elemento

  /* -------- Puente: piezas de la API -> background -------- */
  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== "lizaofm" || d.kind !== "media" || !Array.isArray(d.items)) return;
    chrome.runtime.sendMessage({ type: "lizaofm-add", items: d.items });
  });

  /* -------- Órdenes desde la galería (vía background) -------- */
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === "lizaofm-run-auto") startAuto();
    else if (msg.type === "lizaofm-stop-auto") autoRunning = false;
  });

  function reportAuto(done, total) {
    chrome.runtime.sendMessage({ type: "lizaofm-auto-progress", running: autoRunning, done: done, total: total });
  }

  /* ------------------------- Auto-abridor ------------------------- */
  function startAuto() {
    if (autoRunning) return;
    var tiles = findTiles().filter(function (t) { return !openedHashes.has(t.hash); });
    if (!tiles.length) { autoRunning = false; reportAuto(0, 0); return; }
    autoRunning = true;
    reportAuto(0, tiles.length);
    step(tiles, 0);
  }

  function step(queue, i) {
    if (!autoRunning) { reportAuto(i, queue.length); return; }
    if (i >= queue.length) { autoRunning = false; reportAuto(queue.length, queue.length); return; }

    var t = queue[i];
    openedHashes.add(t.hash);
    var pathBefore = location.pathname;

    try { t.el.scrollIntoView({ block: "center", inline: "center" }); } catch (e) {}
    clickEl(t.el);

    setTimeout(function () {
      triggerPlay(); // por si el vídeo necesita "play" para pedir el archivo
      setTimeout(function () {
        if (location.pathname !== pathBefore) { try { history.back(); } catch (e) {} }
        else { pressEscape(); }
        reportAuto(i + 1, queue.length);
        setTimeout(function () { step(queue, i + 1); }, 400);
      }, Math.max(300, DELAY - 350));
    }, 350);
  }

  // Localiza los "tiles" de la bóveda a partir de las imágenes del CDN.
  function findTiles() {
    var imgs = document.querySelectorAll("img");
    var seen = {}, tiles = [];
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.currentSrc || img.getAttribute("src") || "";
      var m = src.match(/\/files\/[^/]+\/[^/]+\/([a-z0-9]{16,})\//i);
      if (!m) continue;
      var hash = m[1];
      if (seen[hash]) continue;
      seen[hash] = true;
      tiles.push({ el: img, hash: hash });
    }
    return tiles;
  }

  function clickEl(el) {
    try {
      ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function (type) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
    } catch (e) { try { el.click(); } catch (_) {} }
  }

  function triggerPlay() {
    var vids = document.querySelectorAll("video");
    for (var i = 0; i < vids.length; i++) {
      try { vids[i].muted = true; var p = vids[i].play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
    var pb = document.querySelector('[aria-label*="play" i], button[class*="play" i], [class*="playButton" i], [class*="play-button" i]');
    if (pb) clickEl(pb);
  }

  function pressEscape() {
    ["keydown", "keyup"].forEach(function (type) {
      document.dispatchEvent(new KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true }));
    });
    var c = document.querySelector('[aria-label*="close" i], [aria-label*="cerrar" i], button.close, .close-button, [class*="close" i] button');
    if (c) clickEl(c);
  }
})();
