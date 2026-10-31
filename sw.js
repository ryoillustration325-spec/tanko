// 淡光：オフラインで動かすための保存係。アプリ本体は毎回新しい版を確かめ、AIなどの大きなファイルは一度取れば端末から読む
const VER = 'tanko-v142';
const AI = 'tanko-ai-1';   // AI・エンジン（大きなファイル）は版が変わっても消さない＝一度準備すれば再ダウンロード不要
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const isBig = p => /\/(m_[a-z0-9]+_\d+\.js|ort[^/]*\.(js|mjs|wasm)|raw\/[a-z]+\.(js|wasm)|movie\/mediabunny[^/]*\.mjs)$/.test(p);   // RAWの現像エンジンも大きなファイルとして保存
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER && k !== AI).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (isPage){
    // 画面はネット優先（更新を反映）。ただし2.5秒で返ってこなければ保存してある版で開く（通信制限・電波が弱い時も起動できる）
    //   取りに行った最新版は裏で保存を続ける＝次に開いた時に新しい版になる
    const net = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(r => { if (r.ok){ const c = r.clone(); caches.open(VER).then(x => x.put(req, c)); } return r; });
    e.waitUntil(net.catch(() => null));
    const saved = () => caches.match(req).then(r => r || caches.match('./index.html'));
    e.respondWith(new Promise(res => {
      let done = false; const fin = r => { if (!done && r){ done = true; res(r); } };
      const t = setTimeout(() => saved().then(r => r ? fin(r) : null), 2500);
      net.then(r => { clearTimeout(t); fin(r); }).catch(() => { clearTimeout(t); saved().then(r => fin(r || Response.error())); });
    }));
    return;
  }
  // それ以外（AI・エンジン・フォントなど）は保存してある物を優先
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('cdnjs.cloudflare.com'))){ const c = r.clone(); caches.open((url.origin === location.origin && isBig(url.pathname)) || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com') ? AI : VER).then(x => x.put(req, c)); }
    return r;
  })));
});
