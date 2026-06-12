# Lizaofm — Vault Downloader

Extensión de navegador (Chrome / Edge / Brave) para **respaldar y descargar el contenido de tu propia bóveda de OnlyFans** (fotos, vídeos y audios).

> **Hecho con IA — Claude Opus 4.8.** Todo el código de esta extensión se diseñó y escribió con Claude Opus 4.8. Más abajo, en [Cómo se construyó con IA](#-cómo-se-construyó-con-ia-claude-opus-48), está el planteamiento completo: qué se le pidió y cómo se resolvió cada problema (interceptar las URLs del CDN, las previews, los duplicados y los vídeos), por si te sirve de guía para construir algo parecido con IA.

OnlyFans no ofrece un botón de descarga, y las URLs de su CDN están **firmadas, atadas a tu IP y con caducidad**. Por eso la extensión trabaja dentro de tu sesión ya iniciada: captura las URLs de los archivos a medida que el navegador los pide y descarga desde el mismo navegador.

> ⚠️ Úsala solo con **tu propia cuenta y tu propio contenido**. No envía datos a ningún servidor: todo es local.

## Cómo funciona

1. **`background.js`** — con `chrome.webRequest` observa las peticiones del navegador al CDN de OnlyFans (`cdn*.onlyfans.com/files/…`) y guarda las URLs de **fotos, vídeos y audios** (ya firmadas para tu IP/sesión). Agrupa las distintas versiones de tamaño del mismo archivo por el **hash de su nombre** (estable entre tamaños), para no duplicar. También gestiona la cola de descargas.
2. **`interceptor.js`** (mundo de la página) — observa las respuestas de la API de OnlyFans y extrae el **`.mp4` completo de los vídeos** (vía `videoSources`) junto con su **imagen de preview**, porque el navegador no descarga el vídeo al solo navegar la cuadrícula. No modifica ninguna petición.
3. **`content.js`** (sin interfaz visible) — reenvía al background las URLs que extrae el lector de API y, a la orden de la galería, ejecuta el **auto-abridor** de vídeos (abre cada vídeo un instante para forzar la carga de su `.mp4`).
4. **`gallery.html` + `gallery.js`** — la **galería de selección**: una tarjeta por pieza (sin duplicados de tamaño), filtro **Todos / Fotos / Vídeos / Audios**, selección individual y el botón de captura de vídeos. Descarga lo seleccionado a tu carpeta **Descargas**.

Permisos: **`downloads`**, **`storage`** y **`webRequest`** (más acceso a `onlyfans.com`).

---

## 🤖 Cómo se construyó con IA (Claude Opus 4.8)

Esta sección explica el **planteamiento** que se siguió con Claude Opus 4.8, por si alguien quiere construir algo parecido con IA. La idea clave fue no resolver todo de golpe, sino **describir el problema real y luego ir atacando cada obstáculo por separado** según aparecía.

### El punto de partida

El encargo a la IA fue, en esencia:

> "OnlyFans no tiene botón de descarga y sus URLs caducan. Quiero una extensión que, dentro de mi sesión iniciada, capture las URLs de mi propia bóveda y me las descargue."

A partir de ahí surgieron cuatro problemas, y cada uno se resolvió con una técnica concreta.

### Problema 1 — Las URLs del CDN están firmadas y caducan

Las URLs de los archivos en `cdn*.onlyfans.com/files/…` llevan una **firma atada a tu IP y con caducidad**: no puedes copiarlas y descargarlas más tarde ni desde otro sitio.

**Cómo se le planteó a la IA:** "no intentes adivinar ni reconstruir las URLs; aprovecha que el navegador ya las pide con la firma correcta dentro de mi sesión".

**Solución:** en `background.js`, escuchar **todas** las peticiones del navegador con `chrome.webRequest.onBeforeRequest`, filtrar las que van al CDN (`/files/`) y clasificarlas por extensión en foto / vídeo / audio. Como esas URLs ya vienen firmadas para tu sesión, se pueden reenviar tal cual a `chrome.downloads` para descargarlas. No se modifica ninguna petición; solo se observan.

```js
chrome.webRequest.onBeforeRequest.addListener(
  d => capture(d.url),
  { urls: ["*://*.onlyfans.com/*"], types: ["image", "media", "xmlhttprequest", "other"] }
);
```

### Problema 2 — Los duplicados (mismo archivo en muchos tamaños)

OnlyFans sirve **varias versiones del mismo archivo**: `300x300_foto.jpg`, `1080x1080_foto.jpg`, `foto_720p.mp4`, `foto_frame_0.jpg`… Si capturas por URL, la misma pieza aparece muchas veces.

**Cómo se le planteó a la IA:** "necesito una tarjeta por pieza real, no una por cada tamaño; encuentra qué parte del nombre es estable entre versiones".

**Solución:** una función `fileHash()` que quita el **prefijo de tamaño** (`300x300_`), el **sufijo de calidad** (`_720p`), el de **fotograma** (`_frame_0`) y la extensión, dejando un identificador estable. La galería agrupa por ese hash y, dentro de cada grupo, elige la **versión más grande** para descargar y la más pequeña para la miniatura.

```js
function fileHash(file) {
  let s = file.replace(/\.[a-z0-9]+$/i, "");   // sin extensión
  s = s.replace(/^\d{2,5}x\d{2,5}_/, "");        // sin 300x300_
  s = s.replace(/_(\d{3,4})p$/i, "");            // sin _720p
  s = s.replace(/_frame_\d+$/i, "");             // sin _frame_0
  return s || file;
}
```

### Problema 3 — Las previews (y los vídeos que no se descargan al navegar)

Al **navegar la cuadrícula**, el navegador solo carga la **miniatura/preview** de cada vídeo, nunca el `.mp4` completo. Además, esas previews son imágenes del CDN, así que se colaban en la lista como si fueran "fotos".

**Cómo se le planteó a la IA:** "lee directamente lo que la web ya recibe de su propia API en vez de depender de lo que se descarga al hacer scroll; y no me muestres las previews de vídeo como fotos".

**Solución:** `interceptor.js` corre en el **mundo de la página** (MAIN world) y "engancha" (`hook`) las funciones `fetch` y `XMLHttpRequest` para **leer las respuestas JSON de la API** de OnlyFans (`/api2/…`). De cada objeto de medio saca el archivo completo y su preview, y los **empareja**. Con eso:

- La galería puede mostrar la miniatura de un vídeo aunque su `.mp4` aún no se haya capturado.
- Las URLs que son **preview de un vídeo** se marcan y se **excluyen** del grupo de fotos, así no se duplican como imágenes sueltas.

```js
// en la galería: una preview de vídeo nunca se cuenta como foto
if (b === "photo" && posterPaths[it.id]) return;
```

### Problema 4 — Los vídeos (el `.mp4` solo se pide al abrirlos)

Como el `.mp4` real no se solicita hasta que **abres** el vídeo, había que conseguirlo sin tener que abrir uno a uno cientos de vídeos a mano.

**Cómo se le planteó a la IA:** "consíguelo de dos formas que se complementen: léelo de la API si está ahí, y si no, simula que abro cada vídeo".

**Solución (doble):**

1. **Desde la API:** el interceptor lee el objeto `videoSources` de la respuesta y elige la **mejor calidad disponible** (1080 → 720 → source → 480 → 360 → 240). Muchas veces el `.mp4` ya está ahí sin necesidad de reproducir nada.
2. **Auto-abridor:** si hace falta forzar la petición, `content.js` recorre los "tiles" de la bóveda y **abre cada uno un instante** (clic → intenta darle a *play* → cierra con Escape/atrás), para que el navegador pida el `.mp4` y quede capturado. Va informando del progreso a la galería.

```js
const order = ["1080", "720", "source", "480", "360", "240"];
for (const q of order) if (typeof vs[q] === "string") return vs[q]; // mejor calidad
```

### Detalles extra que también se resolvieron con IA

- **Separación de "mundos" en Manifest V3:** para leer la API hay que estar en el **MAIN world** (para sustituir el `fetch`/`XHR` de la propia página), pero para hablar con la extensión hace falta el **ISOLATED world**. Se resolvió con un puente: el interceptor manda los datos con `window.postMessage` y `content.js` los reenvía al `background` con `chrome.runtime.sendMessage`.
- **Cola de descargas con reintento:** el `background` descarga con un máximo de 4 a la vez, evita repetir lo ya bajado y, si una descarga falla (firma caducada), la quita de la lista de "vistas" para que al **recargar la bóveda** y refrescar los enlaces se pueda reintentar.

### La lección del planteamiento

Lo que hizo viable el proyecto con IA no fue pedir "hazme un descargador", sino:

1. **Explicar la restricción real** (URLs firmadas, atadas a IP, sin botón de descarga).
2. **Descomponer en problemas concretos** (firma, duplicados, previews, vídeos) y resolver uno a uno.
3. **Apoyarse en lo que la web ya hace** (sus propias peticiones y su propia API) en lugar de pelear contra sus protecciones.

---

## Instalación (modo desarrollador)

1. Descarga este repositorio (botón verde **Code → Download ZIP**) y descomprímelo.
2. Abre `chrome://extensions` (o `edge://extensions`).
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta **`Vault Downloader`**.

## Uso

1. Haz click en el icono → se abre la **galería** con las instrucciones.
2. **Abre OnlyFans en una pestaña nueva** (botón "Abrir OnlyFans ↗" de la galería, o **F5** si ya la tenías abierta) e inicia sesión. ⚠️ Necesario: las hooks de captura deben cargarse **antes** de que la página haga sus peticiones (ver Notas).
3. Entra en tu **Bóveda** y **desplázate hasta el final**: las fotos y audios se capturan al pasar (el contador de la galería sube).
4. Para los **vídeos**, con la bóveda abierta pulsa **"▶ Capturar vídeos (auto)"** en la galería: abrirá cada vídeo un instante en la pestaña de OnlyFans para obtener su `.mp4`.
5. Filtra, **marca** lo que quieras y pulsa **Descargar**. Los archivos van a tu carpeta `Descargas`.

## Notas y límites

- **Abre OnlyFans de nuevo tras (re)cargar la extensión.** Una pestaña que ya estaba abierta sigue con el código viejo y no captura; recárgala con F5 o ábrela desde el botón de la galería.
- **Hazlo en una sola sesión:** las firmas del CDN caducan y dependen de tu IP. Si una descarga falla, recarga la bóveda para refrescar los enlaces y descarga de nuevo (lo ya descargado no se repite).
- El **auto-abridor de vídeos** depende del HTML actual de OnlyFans; si cambia su diseño, puede dejar de funcionar.
- Requiere un navegador Chromium reciente (Chrome/Edge 111+, por `world: "MAIN"`).

## Archivos

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

## Aviso

Herramienta para **respaldo personal de tu propio contenido**. El uso para descargar contenido de terceros sin autorización puede infringir los Términos de Servicio de OnlyFans y la ley de propiedad intelectual. El autor no se hace responsable del mal uso.
