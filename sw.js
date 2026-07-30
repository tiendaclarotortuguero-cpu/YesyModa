/* YosyModa · Service Worker (instalable + carga rápida)
   - HTML y config.js: red primero (siempre la última versión), con respaldo offline.
   - Íconos/manifest/librerías propias: caché primero (arranque instantáneo).
   - La API de Google Apps Script y los CDN nunca se interceptan (siempre red). */
const C = 'yosymoda-v6';
const ASSETS = ['index.html','admin.html','pos.html','config.js','manifest.json','manifest-admin.json','icon-192.png','icon-512.png','apple-touch-icon.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(C).then(function(c){ return c.addAll(ASSETS).catch(function(){}); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ if(k!==C) return caches.delete(k); })); }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request; var u = new URL(req.url);
  if(req.method !== 'GET' || u.origin !== location.origin) return; // API y CDNs: red normal
  var netFirst = req.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/') || u.pathname.endsWith('config.js');
  if(netFirst){
    e.respondWith(
      fetch(req).then(function(resp){ var cp = resp.clone(); caches.open(C).then(function(c){ c.put(req, cp); }); return resp; })
      .catch(function(){ return caches.match(req).then(function(r){ return r || caches.match('index.html'); }); })
    );
  } else {
    e.respondWith(
      caches.match(req).then(function(r){ return r || fetch(req).then(function(resp){ var cp = resp.clone(); caches.open(C).then(function(c){ c.put(req, cp); }); return resp; }); })
    );
  }
});
