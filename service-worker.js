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
      loadSpecialDates();
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
  
  if (event.data && event.data.type === 'UPDATE_SPECIAL_DATES') {
    updateSpecialDates(event.data.specialDates);
  }
});

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
    specialDates = new Map(Object.entries(newSpecialDates));
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
    vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40, 450, 110, 200, 110, 170, 40, 500],
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
  const body = '📢 Android PWA通知が正常に動作しています！\n\n✅ 音とバイブレーションのテスト\n✅ 詳細情報の表示テスト\n📅 年末年始の特別日程対応\n📱 この通知が見えて音が鳴れば設定完了です！\n\n🗑️ 特別日程機能が有効になっています';
  
  const options = createNotificationOptions(body, 'test-notification', [
    { action: 'test-ok', title: '動作確認OK', icon: './icon-64x64.png' },
    { action: 'test-settings', title: '設定確認', icon: './icon-64x64.png' }
  ]);
  
  await self.registration.showNotification(title, options);
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