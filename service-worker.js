// =================================================================================
// Service Worker for Garbage Calendar (v7.1 - Bug Fix - Complete)
// =================================================================================
const CACHE_NAME = 'garbage-calendar-v13';
const REPO_NAME = '/arida-garbage-calendar/';
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

// ---------------------------------------------------------------------------------
// フェーズ2: 統一データストア (提案書 2.1)
// ---------------------------------------------------------------------------------
class UnifiedDataStore {
    constructor() {
        this.cache = new Map();
        this.dbPromise = this.getDB();
    }
    
    async get(key, defaultValue = null) {
        if (this.cache.has(key)) return this.cache.get(key);
        try {
            const value = await this.getFromIndexedDB(key, defaultValue);
            this.cache.set(key, value);
            return value;
        } catch (error) { return defaultValue; }
    }
    
    async set(key, value) {
        this.cache.set(key, value);
        await this.setToIndexedDB(key, value);
    }

    getDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('unified-settings-db', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('settings');
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getFromIndexedDB(key, defaultValue) {
        const db = await this.dbPromise;
        return new Promise((resolve) => {
            const transaction = db.transaction('settings', 'readonly');
            const request = transaction.objectStore('settings').get(key);
            request.onsuccess = () => resolve(request.result !== undefined ? request.result : defaultValue);
            request.onerror = () => resolve(defaultValue);
        });
    }

    async setToIndexedDB(key, value) {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('settings', 'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(transaction.error);
            transaction.objectStore('settings').put(value, key);
        });
    }
}
const dataStore = new UnifiedDataStore();

// ---------------------------------------------------------------------------------
// フェーズ2: Service Worker状態管理の改善 (提案書 2.2)
// ---------------------------------------------------------------------------------
class NotificationScheduler {
    constructor() {
        this.timerId = null;
        this.isScheduling = false;
        this.scheduleId = 0;
    }

    async schedule() {
        if (this.isScheduling) return;
        
        this.isScheduling = true;
        const currentScheduleId = ++this.scheduleId;

        try {
            this.clearPreviousTimer();
            
            const isEnabled = await dataStore.get('notificationEnabled', false);
            if (!isEnabled) {
                await dataStore.set('schedulerState', null);
                return;
            }

            const time = await dataStore.get('notificationTime', '07:00');
            const nextTime = this.calculateNextNotificationTime(time);
            const delay = nextTime.getTime() - Date.now();
            
            if (delay <= 0) throw new Error('Invalid delay calculated');

            await dataStore.set('schedulerState', {
                nextTime: nextTime.toISOString(),
                scheduleId: currentScheduleId
            });

            this.timerId = setTimeout(() => this.handleNotificationTime(currentScheduleId), delay);
        } catch (error) {
            console.error('SW: Failed to schedule notification:', error);
            this.timerId = setTimeout(() => this.schedule(), 24 * 60 * 60 * 1000);
        } finally {
            this.isScheduling = false;
        }
    }

    clearPreviousTimer() {
        if (this.timerId) clearTimeout(this.timerId);
        this.timerId = null;
    }

    calculateNextNotificationTime(timeString) {
        try {
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            if (!timeRegex.test(timeString)) throw new Error('Invalid time format');
            const [hours, minutes] = timeString.split(':').map(Number);
            let nextTime = new Date();
            nextTime.setHours(hours, minutes, 0, 0);
            if (new Date() >= nextTime) {
                nextTime.setDate(nextTime.getDate() + 1);
            }
            return nextTime;
        } catch {
            let nextTime = new Date();
            nextTime.setHours(7, 0, 0, 0);
            if (new Date() >= nextTime) nextTime.setDate(nextTime.getDate() + 1);
            return nextTime;
        }
    }
    
    async handleNotificationTime(scheduleId) {
        const state = await dataStore.get('schedulerState');
        if (!state || scheduleId !== state.scheduleId) return;

        try {
            await this.performDailyCheck();
        } finally {
            setTimeout(() => this.schedule(), 1000);
        }
    }
    
    async performDailyCheck() {
        const specialDatesData = await dataStore.get('specialDates', {});
        const specialDates = new Map(Object.entries(specialDatesData || {}));
        const todayGarbage = getTodayGarbageWithSpecialSchedule(new Date(), specialDates);
        
        if (todayGarbage.length > 0) {
            const garbageNames = todayGarbage.map(g => g.name).join('、');
            const title = '🗑️ ゴミ出しリマインダー';
            const body = `【重要】今日は「${garbageNames}」の日です！\n忘れずに出しましょう！`;
            await self.registration.showNotification(title, createNotificationOptions(body, 'daily-reminder'));
        } else {
            const special = getSpecialSchedule(new Date(), specialDates);
            if (special !== null) {
                const title = '🗑️ ゴミ出し情報';
                const body = '本日は年末年始・祝日等のため、ゴミの収集はありません。';
                await self.registration.showNotification(title, createNotificationOptions(body, 'no-garbage-special'));
            }
        }
    }

    async restoreFromCrash() {
        try {
            const state = await dataStore.get('schedulerState');
            if (state && state.nextTime) {
                const nextTime = new Date(state.nextTime);
                if (nextTime > new Date()) {
                    this.scheduleId = state.scheduleId || 0;
                    const delay = nextTime.getTime() - Date.now();
                    this.timerId = setTimeout(() => this.handleNotificationTime(this.scheduleId), delay);
                    return true;
                }
            }
        } catch (error) {
            console.warn('SW: Failed to restore scheduler state:', error);
        }
        return false;
    }
}
const scheduler = new NotificationScheduler();

// ---------------------------------------------------------------------------------
// Service Worker Lifecycle Events
// ---------------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        )).then(async () => {
            await self.clients.claim();
            const restored = await scheduler.restoreFromCrash();
            if (!restored) {
                scheduler.schedule();
            }
        })
    );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});

// ---------------------------------------------------------------------------------
// Communication and Notification Handling
// ---------------------------------------------------------------------------------
self.addEventListener('message', async (event) => {
  const data = event.data;
  switch(data.type) {
    case 'SCHEDULE_DAILY_CHECK':
        // 設定はDATA_SYNCで送られてくるので、ここではスケジュールをトリガーするだけ
        await scheduler.schedule();
        break;
    case 'DATA_SYNC':
        dataStore.cache.set(data.key, data.value);
        if (data.key === 'notificationEnabled' || data.key === 'notificationTime') {
            await scheduler.schedule();
        }
        break;
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

// ---------------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------------

/**
 * ✅ 修正: 最初に正常動作していたロジックに戻し、script.jsと完全に一致させる (Bug Fix)
 */
function getWeekOfMonth(date) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekday = firstDay.getDay();
    const offsetDate = date.getDate() + firstWeekday - 1;
    return Math.floor(offsetDate / 7) + 1;
}

function getSpecialSchedule(date, specialDates) {
  const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const specialData = specialDates.get(dateString);
  return specialData ? (specialData.types || []) : null;
}

function getTodayGarbageWithSpecialSchedule(date, specialDates) {
  const special = getSpecialSchedule(date, specialDates);
  if (special !== null) return special;

  const dayOfWeek = date.getDay();
  const weekOfMonth = getWeekOfMonth(date);
  const garbage = [];

  const garbageSchedule = {
    burnable: [2, 5], 
    bottlesPlastic: [3],
    cansMetal: [3], 
    petBottles: [4]
  };

  if (garbageSchedule.burnable.includes(dayOfWeek)) garbage.push({ name: '可燃ごみ' });
  if (dayOfWeek === 3 && [1, 3, 5].includes(weekOfMonth)) garbage.push({ name: 'びん類・プラスチック類' });
  if (dayOfWeek === 3 && [2, 4].includes(weekOfMonth)) garbage.push({ name: '缶・金属類・その他' });
  if (dayOfWeek === 4 && [2, 4].includes(weekOfMonth)) garbage.push({ name: 'ペットボトル' });
  return garbage;
}

function createNotificationOptions(body, tag) {
    return {
        body,
        icon: `${REPO_NAME}icon-192x192.png`,
        badge: `${REPO_NAME}icon-64x64.png`,
        tag,
        requireInteraction: true,
        renotify: true
    };
}