/**
 * PWA 构建后处理脚本。
 *
 * Expo `output: "static"` 不生成 manifest 和 Service Worker，
 * 此脚本在 `expo export` 之后运行，向 dist/ 注入：
 *  1. manifest.json — PWA 安装元数据
 *  2. sw.js — 离线缓存 App Shell
 *  3. icons/ — 从 assets 复制图标
 *  4. 修改 index.html — 插入 manifest link + SW 注册 + apple-touch-icon
 *
 * Usage:
 *   node scripts/pwa-postbuild.mjs
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');

if (!existsSync(resolve(DIST, 'index.html'))) {
  console.error('❌ dist/index.html 不存在，请先运行 npx expo export --platform web');
  process.exit(1);
}

// --- 1. 复制图标 ---
const iconsDir = resolve(DIST, 'icons');
mkdirSync(iconsDir, { recursive: true });
copyFileSync(resolve(ROOT, 'assets/images/icon.png'), resolve(iconsDir, 'icon-1024.png'));
copyFileSync(resolve(ROOT, 'assets/images/favicon.png'), resolve(iconsDir, 'favicon.png'));
console.log('✅ icons/ 已生成');

// --- 2. manifest.json ---
const manifest = {
  name: '御算词擎',
  short_name: '御算词擎',
  description: '御算词擎 — 英语词汇学习工具，间隔重复记忆，进度云端同步',
  start_url: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0D0D0D',
  theme_color: '#0D0D0D',
  icons: [
    {
      src: '/icons/icon-1024.png',
      sizes: '1024x1024',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-1024.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
writeFileSync(resolve(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('✅ manifest.json 已生成');

// --- 3. sw.js (Service Worker) ---
const sw = `// 御算词擎 Service Worker — App Shell 离线缓存
const CACHE_NAME = 'wordhoard-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-1024.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 请求：始终走网络
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }

  // 静态资源（带 hash）：cache-first
  if (url.pathname.match(/\\.(js|css|png|jpg|woff2?|ttf)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 页面导航：network-first，离线时回退缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          }
          return res;
        })
        .catch(() => caches.match('/').then((c) => c || caches.match('/index.html')))
    );
  }
});
`;
writeFileSync(resolve(DIST, 'sw.js'), sw);
console.log('✅ sw.js 已生成');

// --- 4. 注入 index.html ---
const htmlPath = resolve(DIST, 'index.html');
let html = readFileSync(htmlPath, 'utf-8');

const headInjections = `
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icons/icon-1024.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="御算词擎" />
  <meta name="mobile-web-app-capable" content="yes" />`;

const swRegistration = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}
</script>`;

// 插入 <head> 末尾（在 </head> 前）
if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `${headInjections}\n</head>`);
}
// 插入 SW 注册（在 </body> 前）
if (!html.includes('serviceWorker')) {
  html = html.replace('</body>', `${swRegistration}\n</body>`);
}

writeFileSync(htmlPath, html);
console.log('✅ index.html 已注入 manifest + SW 注册');
console.log('🎉 PWA 处理完成！');
