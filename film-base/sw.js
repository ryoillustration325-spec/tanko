// film base：オフラインでも開けるように（新しい版があれば次に開いた時に入れ替わる）
var C = 'filmbase-v54';
self.addEventListener('install', function(e){ self.skipWaiting(); e.waitUntil(caches.open(C).then(function(c){ return c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png']); })); });
self.addEventListener('activate', function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== C; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
// 新しい版を取りに行くが、電波が弱い時は2.5秒で手元の版を出す（待たされて起動しないように見えるのを防ぐ）。取れた新しい版は次に開いた時に使う
self.addEventListener('fetch', function(e){ if (e.request.method !== 'GET') return; var req = e.request;
  e.respondWith(new Promise(function(ok){ var done = false;
    var t = setTimeout(function(){ caches.match(req).then(function(c){ if (c && !done){ done = true; ok(c); } }); }, 2500);
    fetch(req, { cache:'no-cache' }).then(function(r){ var cp = r.clone(); caches.open(C).then(function(c){ c.put(req, cp); }); if (!done){ done = true; clearTimeout(t); ok(r); } })
      .catch(function(){ caches.match(req).then(function(c){ if (!done){ done = true; clearTimeout(t); ok(c || Response.error()); } }); }); })); });
