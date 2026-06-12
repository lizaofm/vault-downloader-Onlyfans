/*
 * Lizaofm — galería de selección
 * Agrupa las versiones (tamaños) capturadas de cada archivo por su hash de
 * nombre (estable entre tamaños) para no duplicar, muestra una tarjeta por
 * pieza con filtro Fotos / Vídeos / Audios, selección individual y el control
 * del auto-abridor de vídeos.
 */
(function () {
  "use strict";

  var KEY = "lizaofm_items";
  var groups = [];
  var byId = {};
  var selected = new Set();
  var filter = "all";
  var lastAutoRunning = false;

  var grid = document.getElementById("grid");
  var emptyEl = document.getElementById("empty");
  var statusEl = document.getElementById("status");
  var dlBtn = document.getElementById("download");

  function bucket(t) {
    if (t === "audio") return "audio";
    if (t === "video" || t === "gif") return "video";
    return "photo";
  }

  function area(it) {
    if (it.w && it.h) return it.w * it.h;
    if (it.h) return it.h * 1000;
    return Number.MAX_SAFE_INTEGER; // sin tamaño = original = el más grande
  }
  function largest(list) { return list.reduce(function (a, b) { return area(b) > area(a) ? b : a; }); }
  function smallest(list) { return list.reduce(function (a, b) { return area(b) < area(a) ? b : a; }); }
  function firstPoster(list) { for (var i = 0; i < list.length; i++) if (list[i].poster) return list[i].poster; return null; }

  function load() {
    chrome.storage.local.get(KEY, function (res) {
      var map = (res && res[KEY]) || {};
      build(Object.keys(map).map(function (k) { return map[k]; }));
      selected.forEach(function (id) { if (!byId[id]) selected.delete(id); });
      render();
    });
  }

  function build(arr) {
    // Pósters de vídeo (emparejados desde la API) → no mostrarlos como fotos.
    var posterPaths = {};
    arr.forEach(function (it) { if (it.poster) posterPaths[it.poster.split("?")[0]] = 1; });

    var gmap = {};
    arr.forEach(function (it) {
      var b = bucket(it.type);
      if (b === "photo" && posterPaths[it.id]) return;
      var key = b + "|" + (it.fhash || it.hash || it.id);
      (gmap[key] = gmap[key] || []).push(it);
    });

    groups = [];
    byId = {};
    for (var key in gmap) {
      var list = gmap[key];
      var type = bucket(list[0].type);
      var best = largest(list);
      var thumb = type === "audio" ? null
                : type === "video" ? (firstPoster(list) || smallest(list).url)
                : smallest(list).url;
      add({ id: key, type: type, url: best.url, thumb: thumb, w: best.w, h: best.h });
    }
  }

  function add(g) { groups.push(g); byId[g.id] = g; }

  function visible() {
    if (filter === "all") return groups;
    return groups.filter(function (g) { return g.type === filter; });
  }

  function render() {
    var c = { all: groups.length, photo: 0, video: 0, audio: 0 };
    groups.forEach(function (g) { c[g.type]++; });
    document.getElementById("n-all").textContent = c.all;
    document.getElementById("n-photo").textContent = c.photo;
    document.getElementById("n-video").textContent = c.video;
    document.getElementById("n-audio").textContent = c.audio;

    grid.innerHTML = "";
    emptyEl.style.display = c.all ? "none" : "block";
    grid.style.display = c.all ? "grid" : "none";
    visible().forEach(function (g) { grid.appendChild(card(g)); });
    updateBtn();
  }

  function card(g) {
    var el = document.createElement("div");
    el.className = "card " + g.type + (selected.has(g.id) ? " sel" : "");
    el.dataset.id = g.id;

    if (g.type !== "audio" && g.thumb) {
      var img = document.createElement("img");
      img.loading = "lazy"; img.src = g.thumb; img.alt = "";
      img.addEventListener("error", function () {
        img.remove();
        el.insertBefore(ph(label(g.type)), el.firstChild);
      });
      el.appendChild(img);
    } else {
      el.appendChild(ph(g.type === "audio" ? "♪" : label(g.type)));
    }

    if (g.type === "video") { var p = document.createElement("div"); p.className = "play"; el.appendChild(p); }

    var chk = document.createElement("div");
    chk.className = "check";
    chk.textContent = selected.has(g.id) ? "✓" : "";
    el.appendChild(chk);

    var badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = (g.w && g.h) ? (g.w + "×" + g.h) : (g.h ? (g.h + "p") : label(g.type));
    el.appendChild(badge);

    el.addEventListener("click", function () { toggle(g.id, el, chk); });
    return el;
  }

  function label(type) { return type === "video" ? "VÍDEO" : type === "audio" ? "AUDIO" : "FOTO"; }

  function ph(text) {
    var d = document.createElement("div");
    d.className = "ph"; d.textContent = text;
    return d;
  }

  function toggle(id, el, chk) {
    if (selected.has(id)) { selected.delete(id); el.classList.remove("sel"); chk.textContent = ""; }
    else { selected.add(id); el.classList.add("sel"); chk.textContent = "✓"; }
    updateBtn();
  }

  function updateBtn() {
    var n = selected.size;
    dlBtn.textContent = "Descargar (" + n + ")";
    dlBtn.disabled = n === 0;
  }

  /* ---------- Acciones ---------- */
  document.getElementById("filters").addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (!tab) return;
    filter = tab.dataset.f;
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    tab.classList.add("active");
    render();
  });

  document.getElementById("selAll").addEventListener("click", function () {
    visible().forEach(function (g) { selected.add(g.id); });
    render();
  });

  document.getElementById("selNone").addEventListener("click", function () { selected.clear(); render(); });

  document.getElementById("clearAll").addEventListener("click", function () {
    if (!confirm("¿Borrar toda la lista capturada? (no borra archivos ya descargados)")) return;
    chrome.runtime.sendMessage({ type: "lizaofm-clear" }, function () { selected.clear(); load(); setStatus("Lista limpiada."); });
  });

  dlBtn.addEventListener("click", function () {
    var list = [];
    selected.forEach(function (id) { if (byId[id]) list.push(byId[id]); });
    if (!list.length) return;
    chrome.runtime.sendMessage({ type: "lizaofm-reset-progress" }, function () {
      chrome.runtime.sendMessage({ type: "lizaofm-download", items: list }, function () {
        setStatus("Enviados " + list.length + " a la cola de descargas…");
      });
    });
  });

  function setStatus(t) { statusEl.textContent = t; }

  /* ---------- Instrucciones + auto-abridor + abrir OnlyFans ---------- */
  var howto = document.getElementById("howto");
  var howtoToggle = document.getElementById("howto-toggle");
  var openOf = document.getElementById("open-of");
  var autoBtn = document.getElementById("auto-btn");
  var autoStatus = document.getElementById("auto-status");

  if (howto && localStorage.getItem("lizaofm_howto") === "collapsed") {
    howto.classList.add("collapsed");
    if (howtoToggle) howtoToggle.textContent = "Mostrar";
  }
  if (howtoToggle) howtoToggle.addEventListener("click", function () {
    var collapsed = howto.classList.toggle("collapsed");
    howtoToggle.textContent = collapsed ? "Mostrar" : "Ocultar";
    localStorage.setItem("lizaofm_howto", collapsed ? "collapsed" : "open");
  });
  if (openOf) openOf.addEventListener("click", function () {
    chrome.tabs.create({ url: "https://onlyfans.com/my/vault" });
  });
  if (autoBtn) autoBtn.addEventListener("click", function () {
    if (lastAutoRunning) { chrome.runtime.sendMessage({ type: "lizaofm-stop-auto" }); return; }
    chrome.runtime.sendMessage({ type: "lizaofm-run-auto" }, function (res) {
      if (chrome.runtime.lastError) return;
      if (res && res.ok === false && res.reason === "no-tab") setAutoStatus("⚠️ Abre tu bóveda en OnlyFans primero.");
      else setAutoStatus("Iniciando…");
    });
  });
  function setAutoStatus(t) { if (autoStatus) autoStatus.textContent = t; }

  /* ---------- Estado en vivo ---------- */
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[KEY]) load();
  });

  setInterval(function () {
    chrome.runtime.sendMessage({ type: "lizaofm-status" }, function (st) {
      if (chrome.runtime.lastError || !st) return;
      if (st.total > 0) {
        setStatus("Descargadas " + st.done + "/" + st.total +
          (st.failed ? (" · " + st.failed + " fallidas (recarga la bóveda para refrescar enlaces)") : "") +
          (st.queueLen ? (" · " + st.queueLen + " en cola") : ""));
      }
      var a = st.auto || { running: false, done: 0, total: 0 };
      lastAutoRunning = a.running;
      if (autoBtn) autoBtn.textContent = a.running ? "■ Detener captura" : "▶ Capturar vídeos (auto)";
      if (a.running) setAutoStatus("Abriendo " + a.done + "/" + a.total + "…");
      else if (a.total > 0 && a.done >= a.total) setAutoStatus("Captura terminada (" + a.total + ").");
    });
  }, 1000);

  load();
})();
