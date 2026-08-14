// Service Worker for POVO Manager PWA
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // 起動時の初期化処理など
});

self.addEventListener('fetch', (e) => {
    // オフラインキャッシュ等の機能拡張が可能
});
