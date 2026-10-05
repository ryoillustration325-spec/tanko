// 淡光：オフラインで動かすための保存係。アプリ本体は毎回新しい版を確かめ、AIなどの大きなファイルは一度取れば端末から読む
const VER = 'tanko-v5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (isPage){
    // 画面はネット優先（更新を反映）、つながらない時は保存してある版
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VER).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  // それ以外（AI・エンジン・フォントなど）は保存してある物を優先
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('cdnjs.cloudflare.com'))){ const c = r.clone(); caches.open(VER).then(x => x.put(req, c)); }
    return r;
  })));
});
