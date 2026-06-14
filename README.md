# Lizaofm — Vault Downloader

Una extensión de navegador (Chrome / Edge / Brave) para **respaldar y descargar el contenido de tu propia bóveda de OnlyFans**: fotos, vídeos y audios.

> ## 🤖 Hecho 100% con Inteligencia Artificial — Claude Opus 4.8
> Esta extensión **se diseñó y programó por completo con IA** (Claude Opus 4.8), sin escribir el código a mano. Más abajo te contamos **cómo fue el planteamiento** paso a paso, en lenguaje sencillo, por si quieres crear algo parecido con IA aunque no sepas programar.

---

## ¿Qué hace?

OnlyFans **no tiene botón de descarga** y, aunque pagues por tu contenido, no puedes guardarlo fácilmente. Esta extensión te deja **hacer una copia de seguridad de tu propia bóveda** (las fotos, vídeos y audios que tú subiste) en tu ordenador, en tu carpeta de **Descargas**.

- ✅ Funciona con **fotos, vídeos y audios**.
- ✅ **Todo es local**: no se envía nada a ningún servidor, nadie ve tu contenido.
- ✅ Te muestra una **galería** para elegir qué descargar.

> ⚠️ Úsala solo con **tu propia cuenta y tu propio contenido**.

---

## 📲 Cómo instalarla

No está en la tienda de Chrome, así que se instala en "modo desarrollador" (es más fácil de lo que suena, son 4 pasos):

1. En esta página de GitHub, pulsa el botón verde **`Code`** y luego **`Download ZIP`**. Descomprime el archivo descargado.
2. Abre tu navegador y entra en `chrome://extensions` (o `edge://extensions` si usas Edge).
3. Arriba a la derecha, activa el **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta **`Vault Downloader`** que descomprimiste.

¡Ya está! Verás el icono de la extensión en la barra del navegador.

---

## ▶️ Cómo usarla

1. Haz click en el **icono** de la extensión → se abre la **galería** con las instrucciones.
2. **Abre OnlyFans en una pestaña nueva** (con el botón "Abrir OnlyFans ↗" de la galería) e inicia sesión.
3. Entra en tu **Bóveda** y **baja hasta el final** de la página: las fotos y audios se van guardando solos a medida que pasas (verás subir el contador).
4. Para los **vídeos**, con la bóveda abierta pulsa **"▶ Capturar vídeos (auto)"** en la galería: irá abriendo cada vídeo un instante para poder guardarlo.
5. **Marca** lo que quieras y pulsa **Descargar**. Los archivos van a tu carpeta `Descargas`.

> 💡 **Consejo:** hazlo todo en una sola sesión. Los enlaces de OnlyFans caducan; si una descarga falla, recarga la bóveda y vuelve a descargar (lo ya bajado no se repite).

---

## 🤖 Cómo se construyó con IA (el planteamiento)

Aquí está lo interesante: **esta extensión la creó una IA (Claude Opus 4.8) de principio a fin.** No hubo un programador escribiendo el código. Esto te puede servir de ejemplo si quieres hacer algo con IA aunque no tengas ni idea de programar.

La clave **no fue** pedirle *"hazme un descargador de OnlyFans"* y ya. La clave fue **explicarle bien el problema real y luego ir resolviendo los obstáculos uno a uno**, como una conversación. Estos fueron los cuatro problemas que aparecieron y cómo se le pidió que los resolviera:

### 1. "Los enlaces caducan"
OnlyFans protege los archivos con enlaces que **caducan y están atados a tu conexión**, así que no puedes copiarlos y descargarlos más tarde. → La idea que se le dio a la IA: *"no intentes saltarte la protección; aprovecha que el navegador, dentro de mi sesión, ya pide esos archivos con el permiso correcto"*. La extensión simplemente **escucha** lo que tu propio navegador pide y lo guarda.

### 2. "Me sale el mismo archivo repetido muchas veces"
OnlyFans guarda cada foto/vídeo en **varios tamaños** (mini, mediano, grande…), así que aparecía la misma pieza duplicada un montón. → Se le pidió a la IA que *"encontrara el patrón en el nombre de los archivos para reconocer cuándo dos son la misma pieza en distinto tamaño"*. Así junta las versiones y te muestra **una sola tarjeta por pieza**, eligiendo siempre la de **mejor calidad** para descargar.

### 3. "Las miniaturas de los vídeos se mezclan con las fotos"
Al navegar, el navegador solo carga las **vistas previas** (las imágenes pequeñas), no los vídeos completos, y esas previas se colaban como si fueran fotos. → La solución que se le planteó: *"lee directamente la información que la web ya recibe (su propio catálogo interno) en vez de adivinar"*. Con eso distingue qué es una preview de vídeo y **no la cuenta como foto**.

### 4. "Los vídeos no se descargan solos"
El vídeo completo solo se pide cuando **abres** el vídeo, no al pasar por encima. Abrir cientos a mano era inviable. → Se le pidió a la IA que *"lo resolviera de dos formas que se complementen"*: leer el vídeo del catálogo interno cuando esté disponible, y si no, **un 'auto-abridor'** que abre cada vídeo un instante y lo cierra, para que el navegador lo pida y se pueda guardar.

### La lección
Lo que hizo posible este proyecto con IA fue:
1. **Explicarle la situación real** (no "hazme X", sino "tengo este problema, con estas reglas").
2. **Partirlo en problemas pequeños** y resolverlos de uno en uno.
3. **Apoyarse en lo que la web ya hace** en lugar de pelear contra ella.

Si quieres ver el detalle técnico de cómo está hecho por dentro (con fragmentos de código), está justo aquí abajo. 👇

---

## ⚙️ Detalles técnicos (para programadores)

Extensión **Manifest V3**. No envía datos a ningún servidor; toda la lógica corre en el navegador. Permisos: `downloads`, `storage`, `webRequest` y acceso a `onlyfans.com`.

### Arquitectura

1. **`background.js`** (service worker) — con `chrome.webRequest.onBeforeRequest` observa las peticiones del navegador al CDN (`*.onlyfans.com/files/…`), las clasifica por extensión en foto/vídeo/audio y guarda las URLs (ya firmadas para tu IP/sesión). Gestiona también la cola de descargas con `chrome.downloads`.
2. **`interceptor.js`** (MAIN world) — "engancha" `fetch` y `XMLHttpRequest` para leer las respuestas JSON de la API (`/api2/…`) y extraer el `.mp4` de los vídeos (vía `videoSources`) y su preview. Solo observa; no modifica peticiones.
3. **`content.js`** (ISOLATED world, sin interfaz) — puente entre el interceptor y el background, y ejecuta el auto-abridor de vídeos.
4. **`gallery.html` / `gallery.js` / `gallery.css`** — la galería de selección con filtros, miniaturas y el control de captura.

### Captura de URLs firmadas (Problema 1)

Las URLs del CDN llevan firma atada a IP y caducidad. En lugar de reconstruirlas, se observan las que el navegador ya hace:

```js
chrome.webRequest.onBeforeRequest.addListener(
  d => capture(d.url),
  { urls: ["*://*.onlyfans.com/*"], types: ["image", "media", "xmlhttprequest", "other"] }
);
```

### Deduplicado por hash de nombre (Problema 2)

Se normaliza el nombre del archivo quitando prefijo de tamaño, sufijo de calidad, de fotograma y la extensión, dejando un identificador estable entre versiones. La galería agrupa por ese hash y descarga la versión más grande.

```js
function fileHash(file) {
  let s = file.replace(/\.[a-z0-9]+$/i, "");   // sin extensión
  s = s.replace(/^\d{2,5}x\d{2,5}_/, "");        // sin 300x300_
  s = s.replace(/_(\d{3,4})p$/i, "");            // sin _720p
  s = s.replace(/_frame_\d+$/i, "");             // sin _frame_0
  return s || file;
}
```

### Lectura de la API: previews y vídeos (Problemas 3 y 4)

El interceptor lee el JSON de la API, empareja cada vídeo con su preview (para no contarla como foto) y elige la mejor calidad del `.mp4`:

```js
const order = ["1080", "720", "source", "480", "360", "240"];
for (const q of order) if (typeof vs[q] === "string") return vs[q]; // mejor calidad
```

Y el auto-abridor (`content.js`) fuerza la petición del `.mp4` abriendo cada vídeo un instante cuando hace falta.

### Separación de "mundos" (MV3)

Leer la API exige el **MAIN world** (para sustituir el `fetch`/`XHR` de la página), pero hablar con la extensión exige el **ISOLATED world**. El puente: `interceptor.js` manda datos con `window.postMessage` y `content.js` los reenvía con `chrome.runtime.sendMessage`.

### Estructura de archivos

```
Vault Downloader/
├── manifest.json       Configuración de la extensión (MV3)
├── background.js       Captura por webRequest + agrupación + cola de descargas
├── interceptor.js      Lee la API: .mp4 de vídeo + preview (MAIN world)
├── content.js          Puente + auto-abridor (sin interfaz)
├── gallery.html/js/css Galería de selección (filtros + audios + capturar)
├── icons/              Iconos 16/48/128
└── README.md
```

---

## Notas y límites

- **Abre OnlyFans de nuevo tras (re)cargar la extensión.** Una pestaña que ya estaba abierta sigue con el código viejo; recárgala con F5 o ábrela desde el botón de la galería.
- **Hazlo en una sola sesión:** las firmas del CDN caducan y dependen de tu IP. Si una descarga falla, recarga la bóveda para refrescar los enlaces.
- El **auto-abridor de vídeos** depende del diseño actual de OnlyFans; si cambian su web, puede dejar de funcionar.
- Requiere un navegador Chromium reciente (Chrome/Edge 111+).

## Aviso

Herramienta para **respaldo personal de tu propio contenido**. Usarla para descargar contenido de terceros sin autorización puede infringir los Términos de Servicio de OnlyFans y la ley de propiedad intelectual. El autor no se hace responsable del mal uso.
