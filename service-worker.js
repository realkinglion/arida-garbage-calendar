const CACHE_NAME = 'garbage-calendar-v4';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json'
];

// 特別日程データ（Service Worker内）
let specialDates = new Map();

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
self.addEventListener('activate', async (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== 'notification-settings') {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      loadSpecialDates();
      // 定期チェックを開始
      startPeriodicCheck();
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
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // すでに開いているタブがあれば、そこにフォーカス
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      // なければ新しいウィンドウを開く
      return clients.openWindow('./');
    })
  );
});

// Push通知受信（将来の拡張用）
self.addEventListener('push', (event) => {
  console.log('Push event received');
  
  if (event.data) {
    const data = event.data.json();
    const options = createNotificationOptions(data.body, 'push-notification');
    
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
self.addEventListener('message', async (event) => {
  console.log('Message received:', event.data);
  
  if (event.data && event.data.type === 'SCHEDULE_DAILY_CHECK') {
    // 設定時間を保存
    await saveNotificationTime(event.data.time);
    
    // 定期チェックを開始
    startPeriodicCheck();
  }
  
  if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    showTestNotification();
  }
  
  if (event.data && event.data.type === 'CHECK_GARBAGE_NOW') {
    performDailyCheck();
  }
  
  if (event.data && event.data.type === 'UPDATE_SPECIAL_DATES') {
    updateSpecialDates(event.data.specialDates);
  }
});

// 通知時間を保存
async function saveNotificationTime(time) {
  const cache = await caches.open('notification-settings');
  const response = new Response(JSON.stringify({ time: time }));
  await cache.put('/notification-time', response);
}

// 保存された通知時間を取得
async function getNotificationTime() {
  try {
    const cache = await caches.open('notification-settings');
    const response = await cache.match('/notification-time');
    if (response) {
      const data = await response.json();
      return data.time;
    }
  } catch (e) {
    console.error('Failed to get notification time:', e);
  }
  return '07:00'; // デフォルト
}

// 定期的なチェック（1時間ごと）
function startPeriodicCheck() {
  // 既存のインターバルをクリア
  if (self.periodicCheckInterval) {
    clearInterval(self.periodicCheckInterval);
  }
  
  // 即座に一度チェック
  checkAndNotify();
  
  // 1時間ごとにチェック
  self.periodicCheckInterval = setInterval(() => {
    checkAndNotify();
  }, 60 * 60 * 1000); // 1時間
}

// 通知時間をチェックして必要なら通知
async function checkAndNotify() {
  const notificationTime = await getNotificationTime();
  const now = new Date();
  const [hours, minutes] = notificationTime.split(':').map(Number);
  
  // 現在時刻が通知時刻の範囲内（前後30分）かチェック
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // 通知時刻の30分前から30分後までの範囲
  const targetTime = hours * 60 + minutes;
  const currentTime = currentHour * 60 + currentMinute;
  const timeDiff = Math.abs(targetTime - currentTime);
  
  // 最後の通知時刻を確認
  const lastNotificationDate = await getLastNotificationDate();
  const today = now.toDateString();
  
  // 今日まだ通知していない かつ 時間が近い場合
  if (lastNotificationDate !== today && timeDiff <= 30) {
    await performDailyCheck();
    await saveLastNotificationDate(today);
  }
}

// 最後の通知日を保存
async function saveLastNotificationDate(date) {
  const cache = await caches.open('notification-settings');
  const response = new Response(date);
  await cache.put('/last-notification-date', response);
}

// 最後の通知日を取得
async function getLastNotificationDate() {
  try {
    const cache = await caches.open('notification-settings');
    const response = await cache.match('/last-notification-date');
    if (response) {
      return await response.text();
    }
  } catch (e) {
    console.error('Failed to get last notification date:', e);
  }
  return null;
}

// 特別日程データの読み込み
function loadSpecialDates() {
  try {
    // IndexedDBから特別日程を読み込む（実装簡略化のためコメントアウト）
    // 代わりにデフォルトの年末年始スケジュールを設定
    setDefaultHolidaySchedule();
  } catch (error) {
    console.log('特別日程の読み込みに失敗:', error);
  }
}

// デフォルトの年末年始スケジュールを設定
function setDefaultHolidaySchedule() {
  const currentYear = new Date().getFullYear();
  
  const holidayChanges = [
    // 年末年始の一般的な変更パターン
    { date: `${currentYear}-12-29`, types: [] },
    { date: `${currentYear}-12-30`, types: [] },
    { date: `${currentYear}-12-31`, types: [] },
    { date: `${currentYear + 1}-01-01`, types: [] },
    { date: `${currentYear + 1}-01-02`, types: [] },
    { date: `${currentYear + 1}-01-03`, types: [] },
    
    // ゴールデンウィーク期間の変更
    { date: `${currentYear + 1}-05-03`, types: [] },
    { date: `${currentYear + 1}-05-04`, types: [] },
    { date: `${currentYear + 1}-05-05`, types: [] },
  ];

  holidayChanges.forEach(change => {
    specialDates.set(change.date, change.types);
  });
  
  console.log('デフォルトの特別日程を設定しました:', specialDates.size, '件');
}

// 特別日程データの更新
function updateSpecialDates(newSpecialDates) {
  try {
    specialDates = new Map(Object.entries(newSpecialDates).map(([date, data]) => {
      return [date, data.types || []];
    }));
    console.log('特別日程を更新しました:', specialDates.size, '件');
  } catch (error) {
    console.log('特別日程の更新に失敗:', error);
  }
}

// 通知オプション作成（音・バイブ対応）
function createNotificationOptions(body, tag, actions = []) {
  return {
    body: body,
    icon: './icon-192x192.png',
    badge: './icon-64x64.png',
    tag: tag,
    requireInteraction: true,
    silent: false,
    // 緊急アラート風の派手なバイブレーションパターン！
    vibrate: [
      1000, 200,  // ブーーー（長い振動）
      1000, 200,  // ブーーー
      1000, 200,  // ブーーー
      500, 100, 500, 100, 500, 100,  // ブッブッブッ（短い振動3回）
      1000, 200,  // ブーーー
      1000, 200,  // ブーーー
      1000, 200   // ブーーー（フィニッシュ）
    ],
    timestamp: Date.now(),
    renotify: true,
    actions: actions.length > 0 ? actions : [
      { 
        action: 'view', 
        title: '詳細を見る',
        icon: './icon-64x64.png'
      },
      { 
        action: 'dismiss', 
        title: '閉じる',
        icon: './icon-64x64.png'
      }
    ],
    data: {
      timestamp: Date.now(),
      origin: 'garbage-calendar'
    }
  };
}

// バックグラウンド同期実行
async function performBackgroundSync() {
  console.log('Performing background sync...');
  try {
    await performDailyCheck();
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// 毎日のゴミ出しチェック（特別日程対応）
async function performDailyCheck() {
  console.log('Performing daily garbage check with special schedule support...');
  
  const now = new Date();
  const today = getTodayGarbageWithSpecialSchedule(now);
  
  if (today.length > 0) {
    const garbageNames = today.map(g => g.name).join('、');
    const title = '🗑️ ゴミ出しリマインダー';
    
    // 特別日程かどうかをチェック
    const isSpecial = getSpecialSchedule(now) !== null;
    const specialNote = isSpecial ? '\n📅 ※特別日程が適用されています' : '';
    
    const body = `【重要】今日は${garbageNames}の日です！${specialNote}\n\n📍 収集時間: 午後6時〜午後9時\n📍 場所: 指定の収集場所\n📍 袋: 指定袋を使用してください\n\n⏰ 忘れずに出しましょう！`;
    
    const options = createNotificationOptions(body, 'daily-reminder');
    
    await self.registration.showNotification(title, options);
    
    console.log('Daily notification sent:', garbageNames, isSpecial ? '(特別日程)' : '(通常日程)');
  } else {
    console.log('No garbage collection today');
    
    // ゴミ出しがない日の通知（特別日程の場合）
    const isSpecial = getSpecialSchedule(now) !== null;
    if (isSpecial) {
      const title = '🗑️ ゴミ出し情報';
      const body = '今日はゴミ出しの日ではありません。\n📅 ※年末年始・祝日等の特別日程です\n\n次回のゴミ出し予定を確認してください。';
      
      const options = createNotificationOptions(body, 'no-garbage-special', []);
      // 特別日程での収集なしは重要な情報なので通知
      await self.registration.showNotification(title, options);
      
      console.log('Special schedule notification sent: no collection');
    }
  }
}

// テスト通知表示
async function showTestNotification() {
  console.log('Showing test notification with special schedule support...');
  
  const title = '🗑️ テスト通知（特別日程対応版）';
  const body = '📢 Android PWA通知が正常に動作しています！\n\n✅ 音とバイブレーションのテスト\n✅ 派手なバイブレーションパターン！\n📅 年末年始の特別日程対応\n📱 この通知が見えて振動を感じれば設定完了です！\n\n🗑️ 特別日程機能が有効になっています';
  
  const options = createNotificationOptions(body, 'test-notification', [
    { action: 'test-ok', title: '動作確認OK', icon: './icon-64x64.png' },
    { action: 'test-settings', title: '設定確認', icon: './icon-64x64.png' }
  ]);
  
  await self.registration.showNotification(title, options);
}

// 特別日程を取得
function getSpecialSchedule(date) {
  const dateString = formatDate(date);
  return specialDates.get(dateString) || null;
}

// 日付フォーマット
function formatDate(date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

// 改良版ゴミ判定（特別日程対応）
function getTodayGarbageWithSpecialSchedule(date) {
  // まず特別日程をチェック
  const specialSchedule = getSpecialSchedule(date);
  if (specialSchedule !== null) {
    console.log('特別日程が適用されました:', specialSchedule);
    return specialSchedule;
  }

  // 通常のルールベース判定
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