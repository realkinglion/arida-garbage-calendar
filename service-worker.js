const CACHE_NAME = 'garbage-calendar-v2';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json'
];

// Service Worker インストール
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => {
        console.log('Cache created successfully');
        return self.skipWaiting();
      })
  );
});

// Service Worker 有効化
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
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

// 通知クリック処理
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked');
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('./')
  );
});

// Push通知受信（将来の拡張用）
self.addEventListener('push', (event) => {
  console.log('Push event received');
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: './icon-192x192.png',
      badge: './icon-64x64.png',
      requireInteraction: true,
      tag: 'garbage-reminder',
      vibrate: [200, 100, 200],
      actions: [
        { action: 'view', title: '確認' }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
  console.log('Background sync:', event.tag);
  if (event.tag === 'garbage-reminder') {
    event.waitUntil(performBackgroundSync());
  }
});

// 定期的なバックグラウンド同期（Android制限対応）
self.addEventListener('periodicsync', (event) => {
  console.log('Periodic sync:', event.tag);
  if (event.tag === 'daily-garbage-check') {
    event.waitUntil(performDailyCheck());
  }
});

// メッセージ受信（アプリからの指示）
self.addEventListener('message', (event) => {
  console.log('Message received:', event.data);
  
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    scheduleNotification(event.data.time, event.data.message);
  }
  
  if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    showTestNotification();
  }
  
  if (event.data && event.data.type === 'CHECK_GARBAGE_NOW') {
    performDailyCheck();
  }
});

// バックグラウンド同期実行
async function performBackgroundSync() {
  console.log('Performing background sync...');
  try {
    await performDailyCheck();
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// 毎日のゴミ出しチェック
async function performDailyCheck() {
  console.log('Performing daily garbage check...');
  
  const now = new Date();
  const today = getTodayGarbage(now);
  
  if (today.length > 0) {
    const garbageNames = today.map(g => g.name).join('、');
    
    await self.registration.showNotification('🗑️ ゴミ出しリマインダー', {
      body: `今日は${garbageNames}の日です！\n収集時間: 18:00〜21:00`,
      icon: './icon-192x192.png',
      badge: './icon-64x64.png',
      requireInteraction: true,
      tag: 'daily-reminder',
      vibrate: [200, 100, 200],
      actions: [
        { action: 'view', title: '詳細を見る' }
      ],
      timestamp: Date.now()
    });
    
    console.log('Daily notification sent:', garbageNames);
  } else {
    console.log('No garbage collection today');
  }
}

// テスト通知表示
async function showTestNotification() {
  console.log('Showing test notification...');
  
  await self.registration.showNotification('🗑️ テスト通知', {
    body: 'Android PWA通知が正常に動作しています！',
    icon: './icon-192x192.png',
    badge: './icon-64x64.png',
    requireInteraction: true,
    tag: 'test-notification',
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  });
}

// 通知のスケジューリング（Androidタイマー対応）
function scheduleNotification(targetTime, message) {
  console.log('Scheduling notification for:', targetTime);
  
  const now = new Date();
  const [hours, minutes] = targetTime.split(':').map(Number);
  const targetDate = new Date();
  targetDate.setHours(hours, minutes, 0, 0);
  
  // 今日の時間が過ぎていたら明日に設定
  if (targetDate <= now) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  
  const delay = targetDate.getTime() - now.getTime();
  
  // 最大遅延時間の制限（Android対応）
  const maxDelay = 24 * 60 * 60 * 1000; // 24時間
  
  if (delay > 0 && delay <= maxDelay) {
    setTimeout(() => {
      performDailyCheck();
    }, delay);
    
    console.log('Notification scheduled for:', targetDate, 'Delay:', delay);
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

// 定期的な生存確認（Android対応）
setInterval(() => {
  console.log('Service Worker heartbeat:', new Date().toISOString());
}, 5 * 60 * 1000); // 5分ごと