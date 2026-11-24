// film base：オフラインでも開けるように（新しい版があれば次に開いた時に入れ替わる）
var C = 'filmbase-v38';
self.addEventListener('install', function(e){ self.skipWaiting(); e.waitUntil(caches.open(C).then(function(c){ return c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png']); })); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== C; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener('fetch', function(e){ if (e.request.method !== 'GET') return; e.respondWith(fetch(e.request, { cache:'no-cache' }).then(function(r){ var cp = r.clone(); caches.open(C).then(function(c){ c.put(e.request, cp); }); return r; }).catch(function(){ return caches.match(e.request); })); });
