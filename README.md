# 🌸 YesyModa — Catálogo + Inventario

Tienda digital para **YesyModa**: un catálogo público donde las clientas arman su pedido y lo cierran por **WhatsApp**, y un **panel de administración** para que la dueña gestione productos, categorías, tallas/colores y stock. Base de datos gratis con **Google Sheets + Apps Script**, y sitio gratis en **GitHub Pages**.

> ✅ **Funciona desde ya en "modo demostración"** (con productos de ejemplo) apenas abras `index.html`. Cuando conectes Google Sheets, pasa a funcionar "en vivo" con los datos reales de la tienda.

---

## 📁 Archivos del proyecto

| Archivo | Qué es |
|---|---|
| `index.html` | El **catálogo público** (lo que ven las clientas). |
| `pos.html` | La **Caja / Punto de venta** (privado): vender en el local, pedidos en línea, fiados y reporte. |
| `admin.html` | El **panel de la dueña** (privado): productos, categorías, tallas/colores y stock. |
| `config.js` | **Lo único que editas** para conectar la tienda (URL de la API y WhatsApp). |
| `Code.gs` | El **backend**: se pega en Google Apps Script (no va a GitHub Pages, va en tu Hoja). |
| `manifest.json`, `manifest-caja.json`, `manifest-admin.json`, `sw.js` | Hacen que **se instale como app** en el celular (Catálogo, Caja y Panel). |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Íconos de la app instalada. |
| `.github/workflows/keepalive.yml` | Tarea opcional que mantiene "despierta" la base de datos. |

> 📲 **Importante:** sube **todos** estos archivos a GitHub (incluidos los `manifest*.json`, `sw.js` y los `*.png`). Si falta el `sw.js` o los íconos, la instalación como app no aparece.

---

## 🚀 Puesta en marcha (unos 15 minutos)

### Paso 1 · Crear la base de datos (Google Sheets + Apps Script)

1. Entra a **[sheets.new](https://sheets.new)** para crear una hoja de cálculo nueva y vacía. Ponle nombre, por ejemplo *YesyModa DB*.
2. En el menú, abre **Extensiones ▸ Apps Script**.
3. Borra el código que aparece y **pega todo el contenido de `Code.gs`**.
4. En la línea de arriba, cambia la contraseña:
   ```js
   const ADMIN_TOKEN = "yesymoda123";   // ← pon aquí una contraseña tuya
   ```
5. Arriba, elige la función **`setup`** y presiona **▶ Ejecutar**. La primera vez te pedirá **autorizar permisos** (acepta con tu cuenta de Google). Esto crea las pestañas *Config, Categorias, Productos, Variantes* con datos de ejemplo.
6. Presiona **Implementar ▸ Nueva implementación**. Elige tipo **Aplicación web** con:
   - **Ejecutar como:** Yo (tu cuenta)
   - **Quién tiene acceso:** **Cualquier persona**
7. Copia la **URL** que te da (termina en `/exec`). La necesitas en el paso 2.

### Paso 2 · Conectar el sitio

Abre **`config.js`** y pega la URL y el WhatsApp:

```js
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfy.../exec",  // ← la URL del paso 1
  WHATSAPP: "50557528808",
  STORE_NAME: "YesyModa",
  CURRENCY: "C$"
};
```

> 💡 Si dejas `API_URL` vacío, todo sigue funcionando en modo demostración (útil para probar).

### Paso 3 · Publicar en GitHub Pages

1. Sube los archivos a tu repositorio (arrástralos en **Add file ▸ Upload files**, o con `git push`).
2. En el repo, ve a **Settings ▸ Pages**.
3. En **Source**, elige **Deploy from a branch**, rama **main**, carpeta **/ (root)** y guarda.
4. En 1–2 minutos tu tienda estará en:
   ```
   https://TU-USUARIO.github.io/TU-REPO/
   ```
   - Catálogo público → esa dirección (`index.html`).
   - Panel de la dueña → esa dirección + `/admin.html`.

¡Listo! Comparte el link del catálogo por WhatsApp, Instagram o el estado. 💕

---

## 🛠️ Cómo se usa

**La dueña (panel `admin.html`):**
- Entra con la contraseña que pusiste en `Code.gs`.
- **＋ Nuevo**: agrega una prenda, elige tallas y colores (chips) y llena el stock en la grilla.
- **Importar Excel**: sube un `.xlsx`/`.csv` (usa el botón *Descargar plantilla*). Detecta las columnas solo.
- **Categorías**: crea, ordena y oculta secciones.
- **Ajustes**: nombre, WhatsApp, moneda y el mensaje del pedido.

**La dueña (Caja `pos.html`):**
- **Vender**: toca las prendas, arma el ticket y **Cobrar** → elige **Efectivo** o **Fiar** (a crédito). El inventario baja solo.
- **Pedidos**: los pedidos que llegan del catálogo en línea aparecen aquí; al **Confirmar** eliges también **Efectivo o Fiado**, y recién ahí se descuenta el stock.
- **Fiados**: lista de clientas que deben, con abonos y recordatorio por WhatsApp.
- **Reporte / Cierre de caja**: con **selector de fecha** (Hoy, Ayer o cualquier día) para *arquear*. Muestra el **efectivo esperado en caja** (ventas en efectivo + abonos), lo fiado y la ganancia estimada.

**La clienta (catálogo `index.html`):**
- Explora, filtra por categoría, elige talla/color, arma el carrito y toca **Pedir por WhatsApp**. Se abre el chat con el pedido escrito hacia el número de la tienda. Sin registrarse.

---

## 📱💻 Una sola versión, que se adapta sola

**No hay una versión para celular y otra para laptop: es la misma, y se acomoda al aparato.** Eso evita tener que arreglar cada cosa dos veces y que los datos se desincronicen.

- **En el celular** la Caja muestra una **barra de navegación abajo** (Vender · Pedidos · Ventas · Fiados · Reporte), como cualquier app del teléfono; las ventanas (cobrar, fiar, recibo) **suben desde abajo**; y las acciones secundarias se guardan en el menú **⋯**.
- **En la laptop** aparecen las **pestañas arriba**, la grilla se ensancha y todos los botones se ven en el encabezado.

Es el mismo enlace y la misma información en los dos aparatos: si vende en el celular, lo ve en la laptop al instante.

---

## 📲 Instalar como app (en el celular)

El sistema se **ve y se siente como una app nativa** y se puede instalar en la pantalla de inicio, sin tiendas de apps ni costos:

- **Android (Chrome):** al abrir la Caja o el Panel aparece el botón **⬇️** arriba (o el menú ⋮ → *Instalar app*). Un toque y queda el ícono de YesyModa en el teléfono.
- **iPhone (Safari):** toca **Compartir** ↑ y luego **Agregar a inicio**.
- Una vez instalada, abre a pantalla completa (sin barra del navegador) y **arranca al instante** aunque el internet ande lento.

> Se puede instalar por separado el **Catálogo** (para compartir), la **Caja** y el **Panel**. Para la dueña, con instalar la **Caja** basta: desde ahí llega también al Panel.

---

## 📷 Fotos de los productos

En el campo *URL de la foto* pega un **enlace público** de la imagen (por ejemplo desde Google Drive con permiso "cualquiera con el enlace", Imgur, o Cloudinary). Si lo dejas vacío, se muestra una imagen elegante generada automáticamente con el nombre de la prenda. Así la tienda nunca se ve "rota".

---

## 😴 Mantener la base de datos "despierta" (opcional)

El plan gratis de Google no cobra nada, pero si la tienda pasa **muchos días sin visitas** conviene "tocarla" de vez en cuando. El archivo `.github/workflows/keepalive.yml` hace un ping automático:

1. En tu repo, ve a **Settings ▸ Secrets and variables ▸ Actions ▸ New repository secret**.
2. Crea un secreto llamado **`API_PING_URL`** con el valor de tu `API_URL` + `?action=ping`.

Con visitas normales al catálogo no hace falta, pero no estorba.

---

## 🔒 Nota de seguridad

La contraseña protege las escrituras (agregar/editar/borrar). Es adecuada para una tienda pequeña. Como el panel es una página pública, **no guardes ahí información sensible** y **cambia la contraseña** por una tuya.

**Tus costos son privados:** el catálogo público nunca recibe el costo de las prendas (solo el precio de venta). El costo viaja únicamente al Panel y a la Caja, con la contraseña. Y la **ganancia se calcula en el servidor** tomando el costo de tu Hoja, así que ninguna venta —ni siquiera un pedido en línea— puede reportar una ganancia falsa. Si a futuro la tienda crece, se puede migrar a una base con autenticación más robusta (por ejemplo Supabase) sin rehacer el catálogo.

---

## 🔄 Cuando actualices el sistema (importante)

Si cambias el **`Code.gs`** (el backend), no basta con guardarlo:
1. Pega el `Code.gs` nuevo en Apps Script.
2. **Implementar ▸ Administrar implementaciones ▸** (lápiz ✏️) **▸ Versión: Nueva versión ▸ Implementar.**
   Así la URL `/exec` empieza a usar el código nuevo (la URL **no cambia**).
3. Sube los archivos web nuevos a GitHub. En el celular, cierra y vuelve a abrir la app (o recárgala) para tomar la última versión.

---

## 🧭 Próximos pasos sugeridos

- Cargar los productos reales (por Excel es lo más rápido).
- Poner el logo y afinar los colores de la marca.
- Más adelante (opcional): pago en línea, estadísticas de lo más pedido, o IA para descripciones y fotos.

Hecho con cariño para **YesyModa** 🌸
