// 離線快取：安裝時只預載網頁與程式（核心檔案），素材用到時才存進快取
// 網頁與程式先連網、失敗再用快取；素材先讀快取。CACHE 版本由 deploy.sh 每次部署自動改，舊快取（含素材）整批換新
const CACHE = 'staging-wendao-20261112153502';
const CORE = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'js/asset-list.js', 'js/data.js', 'js/audio.js', 'js/state.js', 'js/fx.js', 'js/aura.js', 'js/story.js', 'js/halo.js', 'js/battle.js', 'js/ui.js', 'js/dao.js', 'js/cloud.js', 'js/main.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('staging-wendao-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/gstatic\.com\/firebasejs|googleapis\.com\/(identitytoolkit|securetoken)|firebaseio|firebasedatabase|firebaseapp\.com|apis\.google\.com|accounts\.google/.test(req.url)) return;   // 登入與資料庫直連
  // 字型等外部資源：有快取就用，同時更新
  if (url.origin !== location.origin) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => { const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit); return hit || net; })));
    return;
  }
  // 影片交給瀏覽器自己處理：影片用分段（Range）下載，service worker 回整檔會讓 iOS Safari 播不出來
  if (url.pathname.endsWith('.mp4')) return;
  // 素材：先讀快取，沒有才下載並存起來（下載失敗不影響其他素材）
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
    return;
  }
  // 網頁與程式：向伺服器確認是否有新版（no-cache 會帶 ETag 重新驗證，不會拿到瀏覽器裡的舊檔），失敗才用快取
  e.respondWith(fetch(req.url, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
});
