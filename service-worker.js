const CACHE_NAME = 'garbage-calendar-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json'
];

// Service Worker インストール
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Service Worker 有効化
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ネットワークリクエストの処理
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
  if (event.tag === 'garbage-reminder') {
    event.waitUntil(checkGarbageSchedule());
  }
});

// 定期的なバックグラウンド同期
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-garbage-check') {
    event.waitUntil(sendDailyNotification());
  }
});

// 通知クリック処理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});

// ゴミ出しスケジュールチェック
async function checkGarbageSchedule() {
  const today = new Date();
  const garbage = getTodayGarbage(today);
  
  if (garbage.length > 0) {
    const garbageNames = garbage.map(g => g.name).join('、');
    await self.registration.showNotification('🗑️ ゴミ出しリマインダー', {
      body: `今日は${garbageNames}の日です！\n収集時間: 18:00〜21:00`,
      icon: 'icon-192x192.png',
      badge: 'icon-64x64.png',
      requireInteraction: true,
      actions: [
        { action: 'view', title: '詳細を見る' }
      ],
      tag: 'garbage-reminder'
    });
  }
}

// 毎日の通知送信
async function sendDailyNotification() {
  const now = new Date();
  const hour = now.getHours();
  
  // 朝7時にチェック（設定可能にする場合は別途実装）
  if (hour === 7) {
    await checkGarbageSchedule();
  }
}

// ゴミ出しスケジュール判定
function getTodayGarbage(date) {
  const dayOfWeek = date.getDay();
  const weekOfMonth = getWeekOfMonth(date);
  const garbage = [];

  // 可燃ごみ (火曜・金曜)
  if ([2, 5].includes(dayOfWeek)) {
    garbage.push({ type: 'burnable', name: '可燃ごみ' });
  }

  // びん類・プラスチック類 (第1,3,5水曜)
  if (dayOfWeek === 3 && [1, 3, 5].includes(weekOfMonth)) {
    garbage.push({ type: 'bottles-plastic', name: 'びん類・プラスチック類' });
  }

  // 缶・金属類・その他 (第2,4水曜)
  if (dayOfWeek === 3 && [2, 4].includes(weekOfMonth)) {
    garbage.push({ type: 'cans-metal', name: '缶・金属類・その他' });
  }

  // ペットボトル (第2,4木曜)
  if (dayOfWeek === 4 && [2, 4].includes(weekOfMonth)) {
    garbage.push({ type: 'pet-bottles', name: 'ペットボトル' });
  }

  return garbage;
}

function getWeekOfMonth(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const offsetDate = date.getDate() + firstWeekday - 1;
  return Math.floor(offsetDate / 7) + 1;
}