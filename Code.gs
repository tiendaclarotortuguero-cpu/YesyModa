/*************************************************************
 * YESYMODA · Backend (Google Apps Script)
 * -----------------------------------------------------------
 * Convierte una Hoja de Google en la base de datos + API de la
 * tienda. Sigue estos pasos (más detalle en el README):
 *
 *   1. Crea una Hoja de cálculo de Google nueva y vacía.
 *   2. Menú  Extensiones ▸ Apps Script.  Borra todo y pega ESTE archivo.
 *   3. Cambia la contraseña de abajo (ADMIN_TOKEN).
 *   4. Ejecuta una vez la función  setup()  (crea las pestañas y datos
 *      de ejemplo). Autoriza los permisos cuando lo pida.
 *   5. Implementar ▸ Nueva implementación ▸ Aplicación web:
 *         - Ejecutar como: Yo
 *         - Quién tiene acceso: Cualquier persona
 *      Copia la URL que termina en /exec.
 *   6. Pega esa URL en  config.js  (API_URL) de tu sitio.
 *************************************************************/

/* ⚠️  CAMBIA ESTA CONTRASEÑA (es la que usará la dueña en el panel) */
const ADMIN_TOKEN = "yesymoda123";

/* Nombres de las pestañas de la hoja */
const SH = { CFG:"Config", CAT:"Categorias", PROD:"Productos", VAR:"Variantes" };

/* ======================= API: LECTURA ======================= */
function doGet(e){
  const action = (e && e.parameter && e.parameter.action) || "getCatalog";
  if(action === "getCatalog") return json(getCatalog());
  if(action === "ping")       return json({ ok:true, ts:new Date().toISOString() });
  return json({ ok:false, error:"acción no válida" });
}

/* ======================= API: ESCRITURA ======================= */
function doPost(e){
  const lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try{
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if(body.token !== ADMIN_TOKEN) return json({ ok:false, error:"auth" });

    switch(body.action){
      case "saveProduct":      return json(saveProduct(body.product));
      case "deleteProduct":    return json(deleteProduct(body.id));
      case "bulkAddProducts":  return json(bulkAddProducts(body.products||[]));
      case "saveCategory":     return json(saveCategory(body.category));
      case "deleteCategory":   return json(deleteCategory(body.id));
      case "saveConfig":       return json(saveConfig(body.config||{}));
      default: return json({ ok:false, error:"acción no válida" });
    }
  }catch(err){
    return json({ ok:false, error:String(err) });
  }finally{
    lock.releaseLock();
  }
}

/* ======================= LÓGICA ======================= */
function getCatalog(){
  const config = readConfig();
  const categories = readObjects(SH.CAT).map(function(c){
    return { id:String(c.id), nombre:c.nombre, icono:c.icono, orden:num(c.orden), visible:bool(c.visible) };
  });
  const vars = readObjects(SH.VAR);
  const byProd = {};
  vars.forEach(function(v){
    const pid = String(v.producto_id);
    (byProd[pid] = byProd[pid] || []).push({ talla:String(v.talla), color:String(v.color||""), stock:num(v.stock), sku:v.sku||"" });
  });
  const products = readObjects(SH.PROD).map(function(p){
    const id = String(p.id);
    return {
      id: id, categoria:String(p.categoria), nombre:p.nombre, descripcion:p.descripcion||"",
      precio:num(p.precio), imagen:p.imagen||"", destacado:bool(p.destacado), activo:bool(p.activo),
      variantes: byProd[id] || []
    };
  });
  return { config:config, categories:categories, products:products };
}

function saveProduct(prod){
  if(!prod) return { ok:false, error:"sin producto" };
  const sh = sheet(SH.PROD);
  let id = prod.id && String(prod.id).trim();
  if(!id) id = "p" + Date.now();
  const row = [ id, prod.categoria, prod.nombre, prod.descripcion||"", num(prod.precio), prod.imagen||"", !!prod.destacado, prod.activo!==false ];
  upsertById(sh, id, row);
  // reemplazar variantes de este producto
  const keep = readObjects(SH.VAR).filter(function(v){ return String(v.producto_id) !== id; });
  const nuevos = (prod.variantes||[]).map(function(v){ return { producto_id:id, talla:v.talla, color:v.color||"", stock:num(v.stock), sku:v.sku||"" }; });
  writeVariantes(keep.concat(nuevos));
  return { ok:true, id:id };
}

function bulkAddProducts(list){
  const sh = sheet(SH.PROD);
  let allVars = readObjects(SH.VAR);
  list.forEach(function(prod, i){
    const id = "p" + Date.now() + "_" + i;
    sh.appendRow([ id, prod.categoria, prod.nombre, prod.descripcion||"", num(prod.precio), prod.imagen||"", !!prod.destacado, prod.activo!==false ]);
    (prod.variantes||[]).forEach(function(v){ allVars.push({ producto_id:id, talla:v.talla, color:v.color||"", stock:num(v.stock), sku:v.sku||"" }); });
  });
  writeVariantes(allVars);
  return { ok:true, count:list.length };
}

function deleteProduct(id){
  id = String(id);
  removeById(sheet(SH.PROD), id);
  writeVariantes(readObjects(SH.VAR).filter(function(v){ return String(v.producto_id) !== id; }));
  return { ok:true };
}

function saveCategory(cat){
  if(!cat) return { ok:false, error:"sin categoría" };
  const sh = sheet(SH.CAT);
  let id = cat.id && String(cat.id).trim();
  if(!id) id = slug(cat.nombre) || ("c" + Date.now());
  upsertById(sh, id, [ id, cat.nombre, cat.icono||"👗", num(cat.orden)||1, cat.visible!==false ]);
  return { ok:true, id:id };
}
function deleteCategory(id){ removeById(sheet(SH.CAT), String(id)); return { ok:true }; }

function saveConfig(cfg){
  const sh = sheet(SH.CFG);
  Object.keys(cfg).forEach(function(k){ setConfigValue(sh, k, cfg[k]); });
  return { ok:true };
}

/* ======================= HELPERS DE HOJA ======================= */
function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet(name){ let s = ss().getSheetByName(name); if(!s) s = ss().insertSheet(name); return s; }

/* Lee una pestaña con encabezados y devuelve un arreglo de objetos */
function readObjects(name){
  const sh = ss().getSheetByName(name); if(!sh) return [];
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];
  const head = values[0].map(function(h){ return String(h).trim(); });
  const out = [];
  for(let r=1; r<values.length; r++){
    if(values[r].join("") === "") continue;
    const o = {};
    head.forEach(function(h, i){ if(h) o[h] = values[r][i]; });
    out.push(o);
  }
  return out;
}

/* Inserta o actualiza una fila buscando el id en la 1a columna */
function upsertById(sh, id, row){
  const col = sh.getRange(1, 1, Math.max(sh.getLastRow(),1), 1).getValues();
  for(let r=1; r<col.length; r++){
    if(String(col[r][0]) === String(id)){ sh.getRange(r+1, 1, 1, row.length).setValues([row]); return; }
  }
  sh.appendRow(row);
}
function removeById(sh, id){
  const col = sh.getRange(1, 1, Math.max(sh.getLastRow(),1), 1).getValues();
  for(let r=col.length-1; r>=1; r--){
    if(String(col[r][0]) === String(id)){ sh.deleteRow(r+1); }
  }
}

/* Reescribe TODA la pestaña Variantes (encabezado + filas) */
function writeVariantes(arr){
  const sh = sheet(SH.VAR);
  sh.clearContents();
  const head = ["producto_id","talla","color","stock","sku"];
  const rows = [head].concat(arr.map(function(v){ return [v.producto_id, v.talla, v.color||"", num(v.stock), v.sku||""]; }));
  sh.getRange(1, 1, rows.length, head.length).setValues(rows);
}

/* Config como pares clave/valor */
function readConfig(){
  const sh = ss().getSheetByName(SH.CFG); const o = {};
  if(!sh) return o;
  sh.getDataRange().getValues().forEach(function(r, i){ if(i===0 || !r[0]) return; o[String(r[0]).trim()] = r[1]; });
  return o;
}
function setConfigValue(sh, key, val){
  const values = sh.getDataRange().getValues();
  for(let r=1; r<values.length; r++){ if(String(values[r][0]).trim() === key){ sh.getRange(r+1, 2).setValue(val); return; } }
  sh.appendRow([key, val]);
}

/* ======================= UTILIDADES ======================= */
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function num(v){ const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function bool(v){ return v===true || v===1 || ["true","verdadero","si","sí","1","x","✓"].indexOf(String(v).toLowerCase().trim()) >= 0; }
function slug(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }

/* ======================= INSTALACIÓN ======================= */
function setup(){
  const s = ss();
  // Config
  const cfg = sheet(SH.CFG); cfg.clear();
  cfg.getRange(1,1,1,2).setValues([["clave","valor"]]).setFontWeight("bold");
  [["nombre","YesyModa"],["whatsapp","50557528808"],["moneda","C$"],["mensaje","¡Hola YesyModa! 💕 Quiero hacer este pedido:"]]
    .forEach(function(r){ cfg.appendRow(r); });

  // Categorias
  const cat = sheet(SH.CAT); cat.clear();
  cat.getRange(1,1,1,5).setValues([["id","nombre","icono","orden","visible"]]).setFontWeight("bold");
  [["blusas","Blusas","👚",1,true],["vestidos","Vestidos","👗",2,true],["pantalones","Pantalones","👖",3,true],["faldas","Faldas","🩱",4,true],["accesorios","Accesorios","👜",5,true]]
    .forEach(function(r){ cat.appendRow(r); });

  // Productos
  const prod = sheet(SH.PROD); prod.clear();
  prod.getRange(1,1,1,8).setValues([["id","categoria","nombre","descripcion","precio","imagen","destacado","activo"]]).setFontWeight("bold");
  const P = [
    ["p1","blusas","Blusa Manga Larga","Tela suave y fresca, corte clásico.",450,"",true,true],
    ["p2","blusas","Blusa Casual Básica","Cómoda y versátil.",380,"",false,true],
    ["p3","vestidos","Vestido Floral","Estampado floral, vuelo ligero.",690,"",true,true],
    ["p4","vestidos","Vestido Elegante de Noche","Corte entallado para ocasiones especiales.",980,"",false,true],
    ["p5","pantalones","Pantalón Jean Clásico","Mezclilla resistente, tiro medio.",720,"",false,true],
    ["p6","faldas","Falda Midi Plisada","Movimiento elegante, media pierna.",520,"",true,true],
    ["p7","accesorios","Bolso de Mano","Diseño sobrio y elegante.",480,"",false,true]
  ];
  P.forEach(function(r){ prod.appendRow(r); });

  // Variantes
  const V = [
    ["p1","S","Rosa",4],["p1","M","Rosa",6],["p1","L","Rosa",3],["p1","S","Blanco",5],["p1","M","Blanco",5],["p1","L","Blanco",2],["p1","M","Negro",4],["p1","L","Negro",3],
    ["p2","S","Beige",6],["p2","M","Beige",4],["p2","S","Celeste",3],["p2","M","Celeste",5],
    ["p3","S","Rosa",3],["p3","M","Rosa",4],["p3","L","Rosa",2],["p3","S","Verde",2],["p3","M","Verde",3],
    ["p4","S","Negro",2],["p4","M","Negro",3],["p4","L","Negro",1],["p4","M","Vino",2],
    ["p5","28","Azul",5],["p5","30","Azul",6],["p5","32","Azul",4],["p5","34","Azul",2],
    ["p6","S","Rosa",3],["p6","M","Rosa",4],["p6","S","Marino",2],["p6","M","Marino",3],
    ["p7","Única","Negro",5],["p7","Única","Café",4],["p7","Única","Rosa",3]
  ].map(function(r){ return [r[0], r[1], r[2], r[3], slug(r[2]).slice(0,3).toUpperCase()+"-"+r[1]]; });
  writeVariantes(V.map(function(r){ return { producto_id:r[0], talla:r[1], color:r[2], stock:r[3], sku:r[4] }; }));

  // limpia la pestaña por defecto "Hoja 1" / "Sheet1" si quedó vacía
  ["Hoja 1","Hoja1","Sheet1"].forEach(function(n){ const d = s.getSheetByName(n); if(d && s.getSheets().length>1) s.deleteSheet(d); });

  SpreadsheetApp.getUi && Logger.log("✅ Listo. Ahora Implementar ▸ Nueva implementación ▸ Aplicación web.");
}
