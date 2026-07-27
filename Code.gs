/*************************************************************
 * YESYMODA · Backend (Google Apps Script) — v2 (Ventas/POS)
 * -----------------------------------------------------------
 * Convierte una Hoja de Google en la base de datos + API de la
 * tienda: catálogo, inventario, FOTOS en Drive, y ahora VENTAS
 * (punto de venta), PEDIDOS online y reportes.
 *
 * SI YA TENÍAS LA VERSIÓN ANTERIOR FUNCIONANDO:
 *   1. Pega este código encima del anterior (reemplázalo).
 *   2. Ejecuta UNA vez la función  migrar()  (crea las pestañas
 *      de ventas y las columnas nuevas SIN borrar tus datos).
 *      Autoriza los permisos que pida (Drive).
 *   3. Implementar ▸ Gestionar implementaciones ▸ (editar ✏️) ▸
 *      Versión: Nueva versión ▸ Implementar.  (misma URL)
 *
 * INSTALACIÓN NUEVA (desde cero): ejecuta  setup()  en vez de migrar().
 *************************************************************/

/* ⚠️  CAMBIA ESTA CONTRASEÑA (la que usa la dueña en el panel y la caja) */
const ADMIN_TOKEN = "yesymoda123";

/* Zona horaria para fechas de ventas/reportes */
const TZ = "America/Managua";

/* Pestañas de la hoja */
const SH = {
  CFG:"Config", CAT:"Categorias", PROD:"Productos", VAR:"Variantes",
  VEN:"Ventas", VITEM:"VentaItems", PED:"Pedidos", MOV:"Movimientos"
};

/* ======================= API: LECTURA (pública) ======================= */
function doGet(e){
  const action = (e && e.parameter && e.parameter.action) || "getCatalog";
  if(action === "getCatalog") return json(getCatalog());
  if(action === "ping")       return json({ ok:true, ts:new Date().toISOString() });
  return json({ ok:false, error:"acción no válida" });
}

/* ======================= API: ESCRITURA / DATOS PRIVADOS ======================= */
function doPost(e){
  const lock = LockService.getScriptLock();
  lock.tryLock(25000);
  try{
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // --- Acción PÚBLICA (sin contraseña): el catálogo registra un pedido ---
    if(body.action === "crearPedido") return json(crearPedido(body));

    // --- El resto requiere la contraseña ---
    if(body.token !== ADMIN_TOKEN) return json({ ok:false, error:"auth" });

    switch(body.action){
      case "saveProduct":      return json(saveProduct(body.product));
      case "deleteProduct":    return json(deleteProduct(body.id));
      case "bulkAddProducts":  return json(bulkAddProducts(body.products||[]));
      case "saveCategory":     return json(saveCategory(body.category));
      case "deleteCategory":   return json(deleteCategory(body.id));
      case "saveConfig":       return json(saveConfig(body.config||{}));
      case "uploadImage":      return json(uploadImage(body));
      // --- Ventas / POS ---
      case "registrarVenta":   return json(registrarVenta(body));
      case "anularVenta":      return json(anularVenta(body));
      case "getVentas":        return json(getVentas(body));
      case "getVentaItems":    return json(getVentaItems(body));
      case "reporteDia":       return json(reporteDia(body));
      // --- Pedidos online ---
      case "getPedidos":       return json(getPedidos(body));
      case "confirmarPedido":  return json(confirmarPedido(body));
      case "descartarPedido":  return json(descartarPedido(body));
      default: return json({ ok:false, error:"acción no válida" });
    }
  }catch(err){
    return json({ ok:false, error:String(err) });
  }finally{
    lock.releaseLock();
  }
}

/* ======================= CATÁLOGO ======================= */
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
      precio:num(p.precio), costo:num(p.costo), codigo:p.codigo||"", imagen:p.imagen||"",
      destacado:bool(p.destacado), activo:bool(p.activo), variantes: byProd[id] || []
    };
  });
  return { config:config, categories:categories, products:products };
}

/* ======================= PRODUCTOS ======================= */
function saveProduct(prod){
  if(!prod) return { ok:false, error:"sin producto" };
  ensureSchema();
  const sh = sheet(SH.PROD);
  let id = prod.id && String(prod.id).trim();
  if(!id) id = "p" + Date.now();
  const codigo = (prod.codigo && String(prod.codigo).trim()) ? String(prod.codigo).trim() : genCodigo(id);
  const row = [ id, prod.categoria, prod.nombre, prod.descripcion||"", num(prod.precio), prod.imagen||"", !!prod.destacado, prod.activo!==false, num(prod.costo), codigo ];
  upsertById(sh, id, row);
  const keep = readObjects(SH.VAR).filter(function(v){ return String(v.producto_id) !== id; });
  const nuevos = (prod.variantes||[]).map(function(v){ return { producto_id:id, talla:v.talla, color:v.color||"", stock:num(v.stock), sku:v.sku||"" }; });
  writeVariantes(keep.concat(nuevos));
  return { ok:true, id:id, codigo:codigo };
}

function bulkAddProducts(list){
  ensureSchema();
  const sh = sheet(SH.PROD);
  let allVars = readObjects(SH.VAR);
  list.forEach(function(prod, i){
    const id = "p" + Date.now() + "_" + i;
    const codigo = genCodigo(id);
    sh.appendRow([ id, prod.categoria, prod.nombre, prod.descripcion||"", num(prod.precio), prod.imagen||"", !!prod.destacado, prod.activo!==false, num(prod.costo), codigo ]);
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

/* ======================= VENTAS (POS) ======================= */
/* Descuenta stock, registra la venta y deja rastro en Movimientos.
   Se usa tanto para ventas de mostrador como para confirmar pedidos. */
function venderItems(o){
  ensureSchema();
  const vars = readObjects(SH.VAR);
  const idx = {};
  vars.forEach(function(v,i){ idx[ keyVar(v.producto_id, v.talla, v.color) ] = i; });

  const items = o.items || [];
  if(!items.length) return { ok:false, error:"sin items" };

  // 1) validar stock
  for(let k=0;k<items.length;k++){
    const it = items[k];
    const vi = idx[ keyVar(it.producto_id, it.talla, it.color) ];
    const have = (vi!=null) ? num(vars[vi].stock) : 0;
    if(num(it.cantidad) > have){
      return { ok:false, error:"stock", producto:it.nombre||it.producto_id, talla:it.talla, color:it.color, disponible:have, pedido:num(it.cantidad) };
    }
  }

  // 2) descontar stock + calcular
  let subtotal = 0;
  items.forEach(function(it){
    const vi = idx[ keyVar(it.producto_id, it.talla, it.color) ];
    if(vi!=null) vars[vi].stock = num(vars[vi].stock) - num(it.cantidad);
    it._sub = num(it.precio) * num(it.cantidad);
    subtotal += it._sub;
  });
  writeVariantes(vars);

  const descuento = num(o.descuento);
  const total = Math.max(0, subtotal - descuento);
  const id = "v" + Date.now();
  const folio = folioNext(SH.VEN, "V");
  const dia = today(), fecha = nowLocal();
  const nItems = items.reduce(function(s,it){ return s + num(it.cantidad); }, 0);

  sheet(SH.VEN).appendRow([ id, folio, fecha, dia, o.canal||"tienda", o.pago||"efectivo", subtotal, descuento, total, nItems, "pagada", o.pedidoFolio||"", o.nota||"" ]);

  const vit = sheet(SH.VITEM), mov = sheet(SH.MOV);
  items.forEach(function(it){
    vit.appendRow([ id, it.producto_id, it.codigo||"", it.nombre||"", it.talla||"", it.color||"", num(it.cantidad), num(it.precio), num(it.costo), it._sub ]);
    mov.appendRow([ fecha, dia, it.producto_id, it.codigo||"", it.talla||"", it.color||"", "venta", -num(it.cantidad), folio, o.canal||"tienda" ]);
  });
  return { ok:true, id:id, folio:folio, subtotal:subtotal, descuento:descuento, total:total };
}

function registrarVenta(body){
  return venderItems({ items:body.items, descuento:body.descuento, pago:"efectivo", canal:"tienda", nota:body.nota });
}

function anularVenta(body){
  ensureSchema();
  const id = String(body.id);
  const sh = sheet(SH.VEN);
  const data = sh.getDataRange().getValues();
  const H = data[0].map(function(h){ return String(h).trim(); });
  const cId = H.indexOf("id"), cEstado = H.indexOf("estado"), cFolio = H.indexOf("folio");
  let vrow = -1, folio = "";
  for(let r=1;r<data.length;r++){
    if(String(data[r][cId]) === id){
      vrow = r; folio = data[r][cFolio];
      if(String(data[r][cEstado]) === "anulada") return { ok:true, already:true };
      break;
    }
  }
  if(vrow < 0) return { ok:false, error:"venta no existe" };

  // restaurar stock desde los items
  const its = readObjects(SH.VITEM).filter(function(x){ return String(x.venta_id) === id; });
  const vars = readObjects(SH.VAR);
  const idx = {}; vars.forEach(function(v,i){ idx[ keyVar(v.producto_id, v.talla, v.color) ] = i; });
  const mov = sheet(SH.MOV), fecha = nowLocal(), dia = today();
  its.forEach(function(it){
    const vi = idx[ keyVar(it.producto_id, it.talla, it.color) ];
    if(vi!=null) vars[vi].stock = num(vars[vi].stock) + num(it.cantidad);
    mov.appendRow([ fecha, dia, it.producto_id, it.codigo||"", it.talla||"", it.color||"", "anulacion", num(it.cantidad), folio, "" ]);
  });
  writeVariantes(vars);
  sh.getRange(vrow+1, cEstado+1).setValue("anulada");
  return { ok:true, folio:folio };
}

function getVentas(body){
  ensureSchema();
  const v = readObjects(SH.VEN);
  v.reverse();
  return { ok:true, ventas: v.slice(0, (body && body.limit) || 150) };
}
function getVentaItems(body){
  ensureSchema();
  const id = String(body.id);
  return { ok:true, items: readObjects(SH.VITEM).filter(function(x){ return String(x.venta_id) === id; }) };
}

function reporteDia(body){
  ensureSchema();
  const dia = (body && body.dia) || today();
  const ventas = readObjects(SH.VEN).filter(function(x){ return String(x.dia) === dia && String(x.estado) === "pagada"; });
  let total = 0; const ids = {};
  ventas.forEach(function(x){ total += num(x.total); ids[String(x.id)] = true; });
  const canal = {};
  ventas.forEach(function(x){ const c = x.canal||"tienda"; canal[c] = (canal[c]||0) + num(x.total); });
  const top = {};
  readObjects(SH.VITEM).forEach(function(it){ if(ids[String(it.venta_id)]){ const k = it.nombre||it.codigo; top[k] = (top[k]||0) + num(it.cantidad); } });
  const topArr = Object.keys(top).map(function(k){ return { nombre:k, cant:top[k] }; }).sort(function(a,b){ return b.cant - a.cant; }).slice(0, 8);
  return { ok:true, dia:dia, total:total, count:ventas.length, ticket: ventas.length ? total/ventas.length : 0, canal:canal, top:topArr };
}

/* ======================= PEDIDOS ONLINE ======================= */
/* Público: el catálogo crea un pedido "pendiente" (NO toca stock). */
function crearPedido(body){
  ensureSchema();
  const p = body.pedido || {};
  const items = p.items || [];
  if(!items.length) return { ok:false, error:"sin items" };
  if(items.length > 80) return { ok:false, error:"demasiados items" };
  const id = "ped" + Date.now();
  const folio = folioNext(SH.PED, "P");
  sheet(SH.PED).appendRow([ id, folio, nowLocal(), today(), String(p.cliente||"").slice(0,80), String(p.whatsapp||"").slice(0,30), JSON.stringify(items).slice(0,45000), num(p.total), "pendiente", "" ]);
  return { ok:true, id:id, folio:folio };
}

function getPedidos(body){
  ensureSchema();
  const p = readObjects(SH.PED);
  p.reverse();
  return { ok:true, pedidos: p.slice(0, (body && body.limit) || 150) };
}

/* La dueña confirma: el pedido se vuelve venta y RECIÉN ahí baja el stock. */
function confirmarPedido(body){
  ensureSchema();
  const id = String(body.id);
  const peds = readObjects(SH.PED);
  let ped = null;
  for(let i=0;i<peds.length;i++){ if(String(peds[i].id) === id){ ped = peds[i]; break; } }
  if(!ped) return { ok:false, error:"pedido no existe" };
  if(String(ped.estado) !== "pendiente") return { ok:false, error:"ya procesado" };
  let items = [];
  try{ items = JSON.parse(ped.items_json || "[]"); }catch(e){}
  const res = venderItems({ items:items, descuento:0, pago:"efectivo", canal:"online", pedidoFolio:ped.folio });
  if(!res.ok) return res; // p.ej. sin stock
  updatePedidoEstado(id, "confirmado", res.folio);
  return { ok:true, folio:res.folio, total:res.total };
}

function descartarPedido(body){
  ensureSchema();
  updatePedidoEstado(String(body.id), "descartado", "");
  return { ok:true };
}

function updatePedidoEstado(id, estado, ventaFolio){
  const sh = sheet(SH.PED);
  const col = sh.getRange(1, 1, Math.max(sh.getLastRow(),1), 1).getValues();
  for(let r=1;r<col.length;r++){
    if(String(col[r][0]) === String(id)){
      sh.getRange(r+1, 9).setValue(estado);       // col 9 = estado
      sh.getRange(r+1, 10).setValue(ventaFolio||"");// col 10 = venta_folio
      return;
    }
  }
}

/* ======================= FOTOS (Google Drive) ======================= */
function uploadImage(body){
  try{
    var dataUrl = String(body.dataUrl || "");
    var m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if(!m) return { ok:false, error:"imagen no válida" };
    var mime  = m[1];
    var bytes = Utilities.base64Decode(m[2]);
    var ext   = mime.indexOf("png") >= 0 ? ".png" : ".jpg";
    var name  = (slug(body.name || "") || "foto") + "_" + Date.now() + ext;
    var blob  = Utilities.newBlob(bytes, mime, name);
    var file  = getFotosFolder().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok:true, id:file.getId(), url:"https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000" };
  }catch(err){ return { ok:false, error:String(err) }; }
}
function getFotosFolder(){
  var name = "YesyModa Fotos";
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function autorizar(){ var f = getFotosFolder(); Logger.log("✅ Autorizado. Carpeta de fotos: " + f.getName()); }

/* ======================= HELPERS DE HOJA ======================= */
function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet(name){ let s = ss().getSheetByName(name); if(!s) s = ss().insertSheet(name); return s; }

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
function upsertById(sh, id, row){
  const col = sh.getRange(1, 1, Math.max(sh.getLastRow(),1), 1).getValues();
  for(let r=1; r<col.length; r++){
    if(String(col[r][0]) === String(id)){ sh.getRange(r+1, 1, 1, row.length).setValues([row]); return; }
  }
  sh.appendRow(row);
}
function removeById(sh, id){
  const col = sh.getRange(1, 1, Math.max(sh.getLastRow(),1), 1).getValues();
  for(let r=col.length-1; r>=1; r--){ if(String(col[r][0]) === String(id)){ sh.deleteRow(r+1); } }
}
function writeVariantes(arr){
  const sh = sheet(SH.VAR);
  sh.clearContents();
  const head = ["producto_id","talla","color","stock","sku"];
  const rows = [head].concat(arr.map(function(v){ return [v.producto_id, v.talla, v.color||"", num(v.stock), v.sku||""]; }));
  sh.getRange(1, 1, rows.length, head.length).setValues(rows);
}
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

/* ======================= ESQUEMA (migración automática) ======================= */
function ensureSchema(){
  ensureColumns(SH.PROD, ["costo","codigo"]);
  ensureSheetWithHeader(SH.VEN,   ["id","folio","fecha","dia","canal","pago","subtotal","descuento","total","items","estado","pedido_folio","nota"]);
  ensureSheetWithHeader(SH.VITEM, ["venta_id","producto_id","codigo","nombre","talla","color","cantidad","precio","costo","subtotal"]);
  ensureSheetWithHeader(SH.PED,   ["id","folio","fecha","dia","cliente","whatsapp","items_json","total","estado","venta_folio"]);
  ensureSheetWithHeader(SH.MOV,   ["fecha","dia","producto_id","codigo","talla","color","tipo","cantidad","ref","nota"]);
}
function ensureColumns(name, cols){
  const sh = ss().getSheetByName(name); if(!sh) return;
  let lastCol = Math.max(sh.getLastColumn(), 1);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h).trim(); });
  cols.forEach(function(c){ if(header.indexOf(c) < 0){ lastCol++; sh.getRange(1, lastCol).setValue(c); header.push(c); } });
}
function ensureSheetWithHeader(name, header){
  let sh = ss().getSheetByName(name);
  if(!sh){ sh = ss().insertSheet(name); sh.getRange(1,1,1,header.length).setValues([header]).setFontWeight("bold"); return; }
  if(sh.getLastRow() === 0){ sh.getRange(1,1,1,header.length).setValues([header]).setFontWeight("bold"); }
}

/* ======================= UTILIDADES ======================= */
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function num(v){ const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function bool(v){ return v===true || v===1 || ["true","verdadero","si","sí","1","x","✓"].indexOf(String(v).toLowerCase().trim()) >= 0; }
function slug(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function keyVar(pid, talla, color){ return String(pid)+"|"+String(talla)+"|"+String(color||""); }
function genCodigo(id){ return "YM" + String(id).replace(/\D/g,"").slice(-4); }
function today(){ return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }
function nowLocal(){ return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm"); }
function folioNext(name, prefix){
  const sh = sheet(name);
  const n = Math.max(sh.getLastRow() - 1, 0) + 1; // filas de datos + 1
  return prefix + "-" + ("0000" + n).slice(-4);
}

/* ======================= MIGRACIÓN / INSTALACIÓN ======================= */
/* Para quien YA tenía datos: crea columnas y pestañas nuevas SIN borrar nada. */
function migrar(){
  ensureSchema();
  // rellena "codigo" en productos que no tengan
  const sh = sheet(SH.PROD);
  const data = sh.getDataRange().getValues();
  const H = data[0].map(function(h){ return String(h).trim(); });
  const cId = H.indexOf("id"), cCod = H.indexOf("codigo");
  for(let r=1;r<data.length;r++){
    if(!data[r][cId]) continue;
    if(!data[r][cCod]) sh.getRange(r+1, cCod+1).setValue(genCodigo(data[r][cId]));
  }
  Logger.log("✅ Migración lista: pestañas de ventas y columnas (costo, codigo) creadas. Ahora publica una Nueva versión de la implementación.");
}

/* Instalación NUEVA desde cero (crea todo con datos de ejemplo). */
function setup(){
  const s = ss();
  const cfg = sheet(SH.CFG); cfg.clear();
  cfg.getRange(1,1,1,2).setValues([["clave","valor"]]).setFontWeight("bold");
  [["nombre","YesyModa"],["whatsapp","50557528808"],["moneda","C$"],["mensaje","¡Hola YesyModa! 💕 Quiero hacer este pedido:"]]
    .forEach(function(r){ cfg.appendRow(r); });

  const cat = sheet(SH.CAT); cat.clear();
  cat.getRange(1,1,1,5).setValues([["id","nombre","icono","orden","visible"]]).setFontWeight("bold");
  [["blusas","Blusas","👚",1,true],["vestidos","Vestidos","👗",2,true],["pantalones","Pantalones","👖",3,true],["faldas","Faldas","🩱",4,true],["accesorios","Accesorios","👜",5,true]]
    .forEach(function(r){ cat.appendRow(r); });

  const prod = sheet(SH.PROD); prod.clear();
  prod.getRange(1,1,1,10).setValues([["id","categoria","nombre","descripcion","precio","imagen","destacado","activo","costo","codigo"]]).setFontWeight("bold");
  const P = [
    ["p1","blusas","Blusa Manga Larga","Tela suave y fresca.",450,"",true,true,280,"YM1"],
    ["p2","blusas","Blusa Casual Básica","Cómoda y versátil.",380,"",false,true,230,"YM2"],
    ["p3","vestidos","Vestido Floral","Estampado floral, vuelo ligero.",690,"",true,true,410,"YM3"],
    ["p4","vestidos","Vestido Elegante de Noche","Corte entallado.",980,"",false,true,600,"YM4"],
    ["p5","pantalones","Pantalón Jean Clásico","Mezclilla resistente.",720,"",false,true,450,"YM5"],
    ["p6","faldas","Falda Midi Plisada","Movimiento elegante.",520,"",true,true,300,"YM6"],
    ["p7","accesorios","Bolso de Mano","Diseño sobrio y elegante.",480,"",false,true,260,"YM7"]
  ];
  P.forEach(function(r){ prod.appendRow(r); });

  const V = [
    ["p1","S","Rosa",4],["p1","M","Rosa",6],["p1","L","Rosa",3],["p1","S","Blanco",5],["p1","M","Blanco",5],["p1","L","Blanco",2],["p1","M","Negro",4],["p1","L","Negro",3],
    ["p2","S","Beige",6],["p2","M","Beige",4],["p2","S","Celeste",3],["p2","M","Celeste",5],
    ["p3","S","Rosa",3],["p3","M","Rosa",4],["p3","L","Rosa",2],["p3","S","Verde",2],["p3","M","Verde",3],
    ["p4","S","Negro",2],["p4","M","Negro",3],["p4","L","Negro",1],["p4","M","Vino",2],
    ["p5","28","Azul",5],["p5","30","Azul",6],["p5","32","Azul",4],["p5","34","Azul",2],
    ["p6","S","Rosa",3],["p6","M","Rosa",4],["p6","S","Marino",2],["p6","M","Marino",3],
    ["p7","Única","Negro",5],["p7","Única","Café",4],["p7","Única","Rosa",3]
  ].map(function(r){ return { producto_id:r[0], talla:r[1], color:r[2], stock:r[3], sku:slug(r[2]).slice(0,3).toUpperCase()+"-"+r[1] }; });
  writeVariantes(V);

  ensureSchema(); // crea Ventas, VentaItems, Pedidos, Movimientos

  ["Hoja 1","Hoja1","Sheet1"].forEach(function(n){ const d = s.getSheetByName(n); if(d && s.getSheets().length>1) s.deleteSheet(d); });
  Logger.log("✅ Listo. Ahora Implementar ▸ Nueva implementación ▸ Aplicación web (acceso: Cualquier persona).");
}
