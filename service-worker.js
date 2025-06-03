// =================================================================================
// Service Worker for Garbage Calendar (v5 - Robust Scheduling)
// =================================================================================
const CACHE_NAME = 'garbage-calendar-v6'; // Cache version updated
const REPO_NAME = '/arida-garbage-calendar/'; // Your GitHub repository name

const urlsToCache = [
  REPO_NAME,
  `${REPO_NAME}index.html`,
  `${REPO_NAME}styles.css`,
  `${REPO_NAME}script.js`,
  `${REPO_NAME}manifest.json`,
  `${REPO_NAME}icon-64x64.png`,
  `${REPO_NAME}icon-192x192.png`,
  `${REPO_NAME}icon-512x512.png`
];

// --- Global State ---
let specialDates = new Map();
let notificationTimer = null; // To hold the setTimeout ID

// =================================================================================
// Service Worker Lifecycle Events
// =================================================================================

self.addEventListener('install', (event) => {
  console.log('SW: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
          console.log('SW: Caching app shell');
          return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('SW: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('SW: Activated');
        // When activated, immediately try to schedule the next notification
        // based on stored settings.
        scheduleNextNotification();
        return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});

// =================================================================================
// Communication and Notification Handling
// =================================================================================

self.addEventListener('message', (event) => {
  console.log('SW: Message received:', event.data);
  const data = event.data;

  if (data.type === 'SCHEDULE_DAILY_CHECK') {
    // Store settings and reschedule notifications
    Promise.all([
        saveSetting('notificationEnabled', data.enabled),
        saveSetting('notificationTime', data.time)
    ]).then(() => {
        scheduleNextNotification();
    });
  }
  
  if (data.type === 'UPDATE_SPECIAL_DATES') {
    updateSpecialDates(data.specialDates);
  }
  
  if (data.type === 'TEST_NOTIFICATION') {
    showTestNotification();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(REPO_NAME);
    })
  );
});

// =================================================================================
// Notification Scheduling Logic
// =================================================================================

/**
 * Clears any existing timer and schedules the next notification.
 */
async function scheduleNextNotification() {
    // 1. Clear any previously scheduled notification to avoid duplicates.
    if (notificationTimer) {
        clearTimeout(notificationTimer);
        notificationTimer = null;
        console.log('SW: Cleared existing notification timer.');
    }

    // 2. Get the user's settings.
    const isEnabled = await getSetting('notificationEnabled', false);
    const notificationTime = await getSetting('notificationTime', '07:00');

    // 3. If notifications are disabled, do nothing further.
    if (!isEnabled) {
        console.log('SW: Notifications are disabled. No new timer set.');
        return;
    }

    // 4. Calculate the next notification time.
    const [hours, minutes] = notificationTime.split(':').map(Number);
    const now = new Date();
    
    let nextNotificationDate = new Date();
    nextNotificationDate.setHours(hours, minutes, 0, 0);

    // If the time has already passed for today, schedule it for tomorrow.
    if (now > nextNotificationDate) {
        nextNotificationDate.setDate(nextNotificationDate.getDate() + 1);
    }
    
    // 5. Calculate the delay until the next notification.
    const delay = nextNotificationDate.getTime() - now.getTime();

    if (delay < 0) {
        console.error('SW: Calculated delay is negative. Scheduling logic error.');
        return;
    }

    console.log(`SW: Next notification scheduled for: ${nextNotificationDate.toLocaleString('ja-JP')}`);
    console.log(`SW: Waiting for ${Math.round(delay / 1000 / 60)} minutes.`);

    // 6. Set the timer.
    notificationTimer = setTimeout(() => {
        performDailyCheck();
    }, delay);
}


/**
 * Performs the daily check, shows a notification if needed, and schedules the next one.
 */
async function performDailyCheck() {
  console.log('SW: Performing daily garbage check...');
  
  // Ensure special dates are loaded
  await loadSpecialDates();
  
  const todayGarbage = getTodayGarbageWithSpecialSchedule(new Date());
  
  if (todayGarbage.length > 0) {
    const garbageNames = todayGarbage.map(g => g.name).join('、');
    const title = '🗑️ ゴミ出しリマインダー';
    const body = `【重要】今日は「${garbageNames}」の日です！\n忘れずに出しましょう！`;
    const options = createNotificationOptions(body, 'daily-reminder');
    await self.registration.showNotification(title, options);
    console.log('SW: Notification sent for:', garbageNames);
  } else {
    // Only notify on special schedule "no garbage" days, not on regular off-days.
    const isSpecial = getSpecialSchedule(new Date()) !== null;
    if (isSpecial) {
        const title = '🗑️ ゴミ出し情報';
        const body = '本日は年末年始・祝日等のため、ゴミの収集はありません。';
        const options = createNotificationOptions(body, 'no-garbage-special');
        await self.registration.showNotification(title, options);
        console.log('SW: Notification sent for: No collection (special day)');
    } else {
        console.log('SW: No garbage collection today.');
    }
  }

  // ★★★ CRITICAL: Reschedule for the next day after the check is done. ★★★
  scheduleNextNotification();
}

async function showTestNotification() {
  const title = '🗑️ テスト通知';
  const body = '✅ 通知は正常に設定されています！この通知が見えれば、指定した時間にリマインダーが届きます。';
  const options = createNotificationOptions(body, 'test-notification');
  await self.registration.showNotification(title, options);
}

// =================================================================================
// Data Handling and Helper Functions
// =================================================================================

function updateSpecialDates(newSpecialDatesObject) {
  try {
    specialDates.clear();
    Object.entries(newSpecialDatesObject).forEach(([date, data]) => {
      specialDates.set(date, data.types || []);
    });
    saveSetting('specialDates', newSpecialDatesObject); // Save to storage
    console.log('SW: Special dates updated and saved.', specialDates.size, 'items.');
  } catch (error) {
    console.error('SW: Failed to update special dates:', error);
  }
}

async function loadSpecialDates() {
    const storedDates = await getSetting('specialDates', {});
    updateSpecialDates(storedDates);
}

function getTodayGarbageWithSpecialSchedule(date) {
  const special = getSpecialSchedule(date);
  if (special !== null) {
    return special;
  }

  const dayOfWeek = date.getDay();
  const weekOfMonth = getWeekOfMonth(date);
  const garbage = [];

  if ([2, 5].includes(dayOfWeek)) garbage.push({ name: '可燃ごみ' });
  if (dayOfWeek === 3 && [1, 3, 5].includes(weekOfMonth)) garbage.push({ name: 'びん類・プラスチック類' });
  if (dayOfWeek === 3 && [2, 4].includes(weekOfMonth)) garbage.push({ name: '缶・金属類・その他' });
  if (dayOfWeek === 4 && [2, 4].includes(weekOfMonth)) garbage.push({ name: 'ペットボトル' });
  
  return garbage;
}

function getSpecialSchedule(date) {
  const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return specialDates.get(dateString) || null;
}

function getWeekOfMonth(date) {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  return Math.ceil((date.getDate() + firstDayOfMonth) / 7);
}

function createNotificationOptions(body, tag) {
    return {
        body: body,
        icon: `${REPO_NAME}icon-192x192.png`,
        badge: `${REPO_NAME}icon-64x64.png`,
        tag: tag,
        requireInteraction: true,
        renotify: true
    };
}

// IndexedDB helpers for storing settings robustly
async function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('settings-db', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('settings');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getSetting(key, defaultValue) {
    const db = await getDB();
    return new Promise(resolve => {
        const transaction = db.transaction('settings', 'readonly');
        const request = transaction.objectStore('settings').get(key);
        request.onsuccess = () => resolve(request.result !== undefined ? request.result : defaultValue);
        request.onerror = () => resolve(defaultValue);
    });
}

async function saveSetting(key, value) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.objectStore('settings').put(value, key);
    });
}