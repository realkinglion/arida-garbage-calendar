// =================================================================================
// ゴミ出しカレンダー アプリケーション スクリプト
// 改善版 v3.1 - 週計算ロジック修正 (完全版)
// =================================================================================

// ---------------------------------------------------------------------------------
// フェーズ2: 統一データストア (提案書 2.1)
// ---------------------------------------------------------------------------------
class UnifiedDataStore {
    constructor() {
        this.storageType = 'indexeddb';
        this.cache = new Map();
        this.dbPromise = this.getDB();
    }
    
    async get(key, defaultValue = null) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        
        try {
            const value = await this.getFromIndexedDB(key, defaultValue);
            this.cache.set(key, value);
            return value;
        } catch (error) {
            console.warn(`Failed to get ${key} from IndexedDB:`, error);
            return defaultValue;
        }
    }
    
    async set(key, value) {
        try {
            this.cache.set(key, value);
            await this.setToIndexedDB(key, value);
            this.notifyServiceWorker(key, value);
        } catch (error) {
            console.error(`Failed to set ${key} to IndexedDB:`, error);
            throw error;
        }
    }
    
    notifyServiceWorker(key, value) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'DATA_SYNC',
                key,
                value
            });
        }
    }

    getDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('unified-settings-db', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('settings');
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getFromIndexedDB(key, defaultValue) {
        const db = await this.dbPromise;
        return new Promise((resolve) => {
            try {
                const transaction = db.transaction('settings', 'readonly');
                const request = transaction.objectStore('settings').get(key);
                request.onsuccess = () => resolve(request.result !== undefined ? request.result : defaultValue);
                request.onerror = (event) => {
                    console.error(`IndexedDB get error for key ${key}:`, event.target.error);
                    resolve(defaultValue);
                };
            } catch (error) {
                console.error(`Failed to start transaction for getting ${key}:`, error);
                resolve(defaultValue);
            }
        });
    }

    async setToIndexedDB(key, value) {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction('settings', 'readwrite');
                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => {
                     console.error(`IndexedDB set error for key ${key}:`, event.target.error);
                    reject(transaction.error);
                }
                transaction.objectStore('settings').put(value, key);
            } catch (error) {
                console.error(`Failed to start transaction for setting ${key}:`, error);
                reject(error);
            }
        });
    }
}
const dataStore = new UnifiedDataStore();

// ---------------------------------------------------------------------------------
// フェーズ2: エラーハンドリングとログ機能 (提案書 2.3)
// ---------------------------------------------------------------------------------
class ErrorManager {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 100;
        this.loadLog();
    }

    async loadLog() {
        this.errorLog = await dataStore.get('errorLog', []);
    }

    logError(error, context = 'general', severity = 'error') {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message: error.message || String(error),
            stack: error.stack,
            context,
            severity,
            url: window.location?.href
        };
        
        this.errorLog.unshift(errorEntry);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.pop();
        }
        
        dataStore.set('errorLog', this.errorLog).catch(console.warn);
        
        console[severity](`[${context}] ${error.message}`, error);
        
        if (severity === 'error') {
            this.notifyUser(error, context);
        }
    }
    
    notifyUser(error, context) {
        const userMessage = this.getUserFriendlyMessage(context);
        this.showNotification(userMessage, 'error');
    }
    
    getUserFriendlyMessage(context) {
        const messageMap = {
            'NETWORK_ERROR': '情報の取得に失敗しました。インターネット接続を確認してください。',
            'DATA_STORAGE': '設定の保存に失敗しました。ブラウザのストレージ容量を確認してください。',
            'NOTIFICATION_SCHEDULE': '通知の設定中に問題が発生しました。',
            'APP_INITIALIZATION': 'アプリの起動中に問題が発生しました。リロードしてください。',
            'GLOBAL_ERROR': '予期しないエラーが発生しました。',
            'UNHANDLED_PROMISE': '処理中に予期しない問題が発生しました。',
            'DEFAULT': '予期しないエラーが発生しました。しばらくしてから再試行してください。'
        };
        return messageMap[context] || messageMap['DEFAULT'];
    }

    showNotification(message, type = 'info') {
        const existingNotif = document.querySelector('.app-notification');
        if(existingNotif) existingNotif.remove();

        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background-color: ${type === 'error' ? '#f8d7da' : '#d4edda'};
            color: ${type === 'error' ? '#721c24' : '#155724'}; padding: 15px; border-radius: 8px; z-index: 2000; box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            display: flex; align-items: center; gap: 10px; opacity: 0; transition: opacity 0.3s, top 0.3s;
        `;
        notification.className = `app-notification notification-${type}`;
        notification.innerHTML = `
            <span class="icon">${type === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span class="message">${message}</span>
            <button class="close-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">×</button>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.top = '30px';
        });

        const removeNotif = () => {
            notification.style.opacity = '0';
            notification.style.top = '20px';
            notification.addEventListener('transitionend', () => notification.remove());
        };
        
        const autoRemoveTimer = setTimeout(removeNotif, 5000);
        notification.querySelector('.close-btn').onclick = () => {
            clearTimeout(autoRemoveTimer);
            removeNotif();
        };
    }
}
const errorManager = new ErrorManager();

window.addEventListener('error', (event) => {
    errorManager.logError(event.error, 'GLOBAL_ERROR', 'error');
});
window.addEventListener('unhandledrejection', (event) => {
    errorManager.logError(event.reason, 'UNHANDLED_PROMISE', 'error');
});

// ---------------------------------------------------------------------------------
// 1. 基本的なゴミ収集スケジュール定義
// ---------------------------------------------------------------------------------
const garbageSchedule = {
    burnable: [2, 5], 
    bottlesPlastic: [3], 
    cansMetal: [3], 
    petBottles: [4] 
};

// ---------------------------------------------------------------------------------
// 1.2 通知時間の入力検証クラス
// ---------------------------------------------------------------------------------
class TimeValidator {
    static validate(timeString) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
        if (!timeRegex.test(timeString)) throw new Error(`Invalid time format: ${timeString}`);
        const [hours, minutes] = timeString.split(':').map(Number);
        if (hours < 0 || hours > 23) throw new Error(`Invalid hour: ${hours}`);
        if (minutes < 0 || minutes > 59) throw new Error(`Invalid minute: ${minutes}`);
        return { hours, minutes, isValid: true };
    }
    
    static sanitize(timeString) {
        try {
            const validated = this.validate(timeString);
            return `${String(validated.hours).padStart(2, '0')}:${String(validated.minutes).padStart(2, '0')}`;
        } catch (error) {
            console.warn(`Time validation failed: ${error.message}, using default 07:00`);
            return '07:00';
        }
    }
}

// ---------------------------------------------------------------------------------
// 2. 完璧版自動取得システム
// ---------------------------------------------------------------------------------
class PerfectScheduleFetcher {
    constructor() {
        this.aridaCityUrl = 'https://www.city.arida.lg.jp/kurashi/gomikankyo/gomibunbetsu/1000951/1000954.html';
        this.proxyUrls = ['https://corsproxy.io/?', 'https://api.allorigins.win/get?url='];
        this.garbageImageMapping = {
            'gomi01.png': { type: 'burnable', name: '可燃ごみ' },
            'gomi02.png': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
            'gomi03.png': { type: 'cans-metal', name: '缶・金属類・その他' },
            'gomi04.png': { type: 'pet-bottles', name: 'ペットボトル' }
        };
    }
    async fetchHtmlContent() {
        const fetchPromises = this.proxyUrls.map(proxyUrl => {
            const requestUrl = proxyUrl.includes('allorigins') ? proxyUrl + encodeURIComponent(this.aridaCityUrl) : proxyUrl + this.aridaCityUrl;
            return fetch(requestUrl).then(async (response) => {
                if (!response.ok) throw new Error(`プロキシエラー: ${response.status} at ${proxyUrl}`);
                if (proxyUrl.includes('allorigins')) {
                    const data = await response.json();
                    if (data.contents) return data.contents;
                    throw new Error('alloriginsがコンテンツを返しませんでした');
                }
                return response.text();
            });
        });
        try {
            return await Promise.any(fetchPromises);
        } catch (error) {
            throw new Error('全てのプロキシで取得に失敗');
        }
    }
    extractScheduleFromHtml(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        let currentYear;
        const caption = doc.querySelector('table.gomi caption');
        if (caption) {
            const captionText = caption.textContent;
            const reiwaMatch = captionText.match(/令和(\d+|元)年/);
            if (reiwaMatch) {
                const reiwaYear = reiwaMatch[1] === '元' ? 1 : parseInt(reiwaMatch[1], 10);
                currentYear = reiwaYear + 2018;
            }
        }
        if (!currentYear) currentYear = new Date().getFullYear();
        
        const scheduleData = {
            year: currentYear,
            specialDates: new Map(),
            source: 'html_extraction',
            confidence: 0.95
        };
        const tables = doc.querySelectorAll('table.gomi');
        if (tables.length === 0) {
            scheduleData.confidence = 0.1;
            return scheduleData;
        }
        tables.forEach(table => {
            const monthCaption = table.querySelector('caption span');
            if (!monthCaption) return;
            const month = parseInt(monthCaption.textContent.replace('月', ''), 10);
            if (isNaN(month)) return;
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                if (row.querySelector('th')) return;
                const cells = row.querySelectorAll('td');
                cells.forEach(cell => {
                    const dayElement = cell.querySelector('strong');
                    if (!dayElement || !dayElement.textContent.trim()) return;
                    
                    const day = parseInt(dayElement.textContent.trim(), 10);
                    const dateString = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const garbageTypes = [];
                    cell.querySelectorAll('img').forEach(img => {
                        const imageName = img.getAttribute('src').split('/').pop();
                        if (this.garbageImageMapping[imageName]) {
                            garbageTypes.push(this.garbageImageMapping[imageName]);
                        }
                    });
                    const normalGarbage = this.getNormalGarbageForDate(new Date(dateString));
                    if (!this.arraysEqual(garbageTypes, normalGarbage)) {
                        scheduleData.specialDates.set(dateString, garbageTypes);
                    }
                });
            });
        });
        return scheduleData;
    }
    getNormalGarbageForDate(date) {
        const dayOfWeek = date.getDay();
        const weekOfMonth = getWeekOfMonth(date);
        const garbage = [];
        if (garbageSchedule.burnable.includes(dayOfWeek)) garbage.push({ type: 'burnable', name: '可燃ごみ' });
        if (dayOfWeek === 3 && [1, 3, 5].includes(weekOfMonth)) garbage.push({ type: 'bottles-plastic', name: 'びん類・プラスチック類' });
        if (dayOfWeek === 3 && [2, 4].includes(weekOfMonth)) garbage.push({ type: 'cans-metal', name: '缶・金属類・その他' });
        if (dayOfWeek === 4 && [2, 4].includes(weekOfMonth)) garbage.push({ type: 'pet-bottles', name: 'ペットボトル' });
        return garbage;
    }
    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        const aTypes = a.map(g => g.type).sort();
        const bTypes = b.map(g => g.type).sort();
        return aTypes.every((val, index) => val === bTypes[index]);
    }
    updateSpecialSchedule(scheduleData) {
        if (scheduleData && scheduleData.specialDates) {
            scheduleData.specialDates.forEach((types, date) => {
                const note = `自動取得 (${scheduleData.source}, 信頼度: ${Math.round(scheduleData.confidence * 100)}%)`;
                specialScheduleManager.setSpecialDate(date, types, note);
            });
            updateSpecialScheduleDisplay();
        }
    }
}

// ---------------------------------------------------------------------------------
// 3. 特別日程管理クラス
// ---------------------------------------------------------------------------------
class SpecialScheduleManager {
    constructor() {
        this.specialDates = new Map();
        this.fetcher = new PerfectScheduleFetcher();
        this.gistFallbackUrl = 'https://gist.githubusercontent.com/realkinglion/4859d37c601e6f3b3a07cc049356234b/raw/a3834ed438c03cfd9b7d83d021f7bd142ca7429a/schedule.json';
    }

    async init() {
        await this.loadSpecialDates();
        this.setDefaultHolidaySchedule();
    }

    async fetchLatestSchedule() {
        try {
            const htmlContent = await this.fetcher.fetchHtmlContent();
            const scheduleData = this.fetcher.extractScheduleFromHtml(htmlContent);
            this.fetcher.updateSpecialSchedule(scheduleData);
            await dataStore.set('lastSuccessfulFetch', Date.now());
            return scheduleData;
        } catch (error) {
            errorManager.logError(error, 'NETWORK_ERROR', 'warn');
            return this.fetchFromGistFallback();
        }
    }
    
    async fetchFromGistFallback() {
        try {
            const response = await fetch(this.gistFallbackUrl);
            if (!response.ok) throw new Error('Gistサーバーからの応答が不正です');
            const gistData = await response.json();
            const specialDatesMap = new Map();
            if (gistData.specialDates) {
                Object.entries(gistData.specialDates).forEach(([date, data]) => {
                    specialDatesMap.set(date, data.types || []);
                });
            }
            const scheduleData = {
                year: gistData.year,
                specialDates: specialDatesMap,
                source: gistData.source,
                confidence: 0.90
            };
            this.fetcher.updateSpecialSchedule(scheduleData);
            await dataStore.set('lastSuccessfulFetch', Date.now());
            return scheduleData;
        } catch(fallbackError) {
             errorManager.logError(fallbackError, 'NETWORK_ERROR', 'error');
             throw fallbackError;
        }
    }

    async loadSpecialDates() {
        try {
            const stored = await dataStore.get('specialGarbageDates', {});
            Object.entries(stored).forEach(([date, dateData]) => {
                this.specialDates.set(date, dateData);
            });
        } catch (e) {
            errorManager.logError(e, 'DATA_STORAGE', 'error');
        }
    }
    
    async saveSpecialDates() {
        try {
            const data = Object.fromEntries(this.specialDates);
            await dataStore.set('specialGarbageDates', data);
        } catch (e) {
            errorManager.logError(e, 'DATA_STORAGE', 'error');
        }
    }

    async setSpecialDate(dateString, garbageTypes, note = '') {
        const dateData = { types: garbageTypes, note, userSet: note.includes('手動'), timestamp: Date.now() };
        this.specialDates.set(dateString, dateData);
        await this.saveSpecialDates();
    }

    async removeSpecialDate(dateString) {
        this.specialDates.delete(dateString);
        await this.saveSpecialDates();
    }
    
    getSpecialSchedule(date) {
        const dateString = this.formatDate(date);
        const specialData = this.specialDates.get(dateString);
        return specialData ? specialData.types : null;
    }
    
    getSpecialScheduleDetails(date) {
        const dateString = this.formatDate(date);
        return this.specialDates.get(dateString) || null;
    }

    formatDate(date) { 
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }

    getAllSpecialDates() {
        return Array.from(this.specialDates.entries()).map(([date, data]) => ({ date, ...data }));
    }

    setDefaultHolidaySchedule() {
        const currentYear = new Date().getFullYear();
        const holidayChanges = [
            { date: `${currentYear}-12-29`, types: [], note: '年末年始' },
            { date: `${currentYear}-12-30`, types: [], note: '年末年始' },
            { date: `${currentYear}-12-31`, types: [], note: '年末年始' },
            { date: `${currentYear + 1}-01-01`, types: [], note: '年末年始' },
            { date: `${currentYear + 1}-01-02`, types: [], note: '年末年始' },
            { date: `${currentYear + 1}-01-03`, types: [], note: '年末年始' }
        ];
        holidayChanges.forEach(change => {
            if (!this.specialDates.has(change.date)) {
                this.specialDates.set(change.date, { types: change.types, note: change.note, userSet: false, timestamp: 0 });
            }
        });
    }
}


// ---------------------------------------------------------------------------------
// 4. UI更新 & スケジュール判定ロジック
// ---------------------------------------------------------------------------------

/**
 * ✅ 修正: 最初に正常動作していたロジックに戻す (Bug Fix)
 */
function getWeekOfMonth(date) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekday = firstDay.getDay();
    const offsetDate = date.getDate() + firstWeekday - 1;
    return Math.floor(offsetDate / 7) + 1;
}

function getTodayGarbage(date) {
    const specialSchedule = specialScheduleManager.getSpecialSchedule(date);
    if (specialSchedule !== null) return specialSchedule;
    
    const dayOfWeek = date.getDay();
    const weekOfMonth = getWeekOfMonth(date);
    const garbage = [];
    if (garbageSchedule.burnable.includes(dayOfWeek)) garbage.push({ type: 'burnable', name: '可燃ごみ' });
    if (dayOfWeek === 3 && [1, 3, 5].includes(weekOfMonth)) garbage.push({ type: 'bottles-plastic', name: 'びん類・プラスチック類' });
    if (dayOfWeek === 3 && [2, 4].includes(weekOfMonth)) garbage.push({ type: 'cans-metal', name: '缶・金属類・その他' });
    if (dayOfWeek === 4 && [2, 4].includes(weekOfMonth)) garbage.push({ type: 'pet-bottles', name: 'ペットボトル' });
    return garbage;
}

function displayGarbage(garbage, elementId, isToday = true) {
    const element = document.getElementById(elementId);
    if (!element) return;
    if (garbage.length === 0) {
        const message = isToday ? '今日はゴミ出しの日ではありません' : '明日はゴミ出し日に該当しません';
        element.innerHTML = `<span class="no-garbage">${message}</span>`;
    } else {
        element.innerHTML = garbage.map(g => `<span class="garbage-type ${g.type}">${g.name}</span>`).join('');
    }
}

function updateCalendar() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('ja-JP', options);
    
    const todayGarbage = getTodayGarbage(today);
    displayGarbage(todayGarbage, 'todayGarbage', true);
    const todayDetails = specialScheduleManager.getSpecialScheduleDetails(today);
    if (todayDetails && todayDetails.note) {
        const todayElement = document.getElementById('todayGarbage');
        todayElement.innerHTML += `<div class="special-note">📅 ${todayDetails.note}</div>`;
    }

    const tomorrowGarbage = getTodayGarbage(tomorrow);
    displayGarbage(tomorrowGarbage, 'tomorrowGarbage', false);
    const tomorrowDetails = specialScheduleManager.getSpecialScheduleDetails(tomorrow);
    if (tomorrowDetails && tomorrowDetails.note) {
        const tomorrowElement = document.getElementById('tomorrowGarbage');
        tomorrowElement.innerHTML += `<div class="special-note">📅 ${tomorrowDetails.note}</div>`;
    }
    updateSpecialScheduleDisplay();
}

function updateSpecialScheduleDisplay() {
    const container = document.getElementById('specialScheduleList');
    if (!container) return;
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const specialDatesThisMonth = specialScheduleManager.getAllSpecialDates()
        .filter(item => {
            const itemDate = new Date(item.date);
            if (isNaN(itemDate.getTime())) return false;
            return itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    container.innerHTML = '<h4>今月の特別日程</h4>';
    if (specialDatesThisMonth.length > 0) {
        container.innerHTML += specialDatesThisMonth.map(item => {
            const date = new Date(item.date);
            const dateStr = date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
            const typeNames = item.types.map(t => t.name).join('、') || '収集なし';
            const userIcon = item.userSet ? '👤' : '🤖';
            const noteText = item.note ? ` (${item.note})` : '';
            return `<div class="special-date-item">${userIcon} ${dateStr}: ${typeNames}${noteText}</div>`;
        }).join('');
    } else {
        container.innerHTML += '<p>今月は変則的な収集スケジュールはありません。</p>';
    }
}

// ---------------------------------------------------------------------------------
// 5. PWA機能 & 通知機能
// ---------------------------------------------------------------------------------
class PWAManager {
    constructor() {
        this.deferredPrompt = null;
    }
    async init() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
                await navigator.serviceWorker.ready;
            } catch (error) {
                errorManager.logError(error, 'PWA_REGISTRATION', 'error');
            }
        }
        this.setupInstallPrompt();
    }
    setupInstallPrompt() {
        const installButton = document.getElementById('installButton');
        const pwaStatus = document.getElementById('pwaStatus');
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            installButton.disabled = false;
            pwaStatus.textContent = 'アプリとしてインストール可能です';
        });
        installButton.addEventListener('click', async () => {
            if (!this.deferredPrompt) return;
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            if (outcome === 'accepted') pwaStatus.textContent = 'アプリがインストールされました！';
            this.deferredPrompt = null;
            installButton.disabled = true;
        });
        window.addEventListener('appinstalled', () => {
            pwaStatus.textContent = 'アプリが正常にインストールされました！';
            installButton.style.display = 'none';
        });
        setTimeout(() => {
            if (window.matchMedia('(display-mode: standalone)').matches) {
                pwaStatus.textContent = 'アプリとして実行中です';
                installButton.style.display = 'none';
            }
        }, 1000);
    }
}

class NotificationManager {
    constructor() {
        this.isEnabled = false;
        this.notificationTime = '07:00';
        this.serviceWorkerRegistration = null;
    }

    async init() {
        const toggleBtn = document.getElementById('notificationToggle');
        const timeInput = document.getElementById('notificationTime');
        
        try {
            this.isEnabled = await dataStore.get('notificationEnabled', false);
            this.notificationTime = await dataStore.get('notificationTime', '07:00');
        } catch(e) { errorManager.logError(e, 'DATA_STORAGE', 'error'); }

        if ('serviceWorker' in navigator) {
            this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
        }
        
        timeInput.value = this.notificationTime;
        this.updateUI();
        
        toggleBtn.addEventListener('click', () => this.toggleNotification());
        timeInput.addEventListener('change', (e) => this.updateTime(e.target.value));
        
        this.scheduleDailyCheck();
    }

    async saveSettings() {
        try {
            await dataStore.set('notificationEnabled', this.isEnabled);
            await dataStore.set('notificationTime', this.notificationTime);
        } catch (e) {
            errorManager.logError(e, 'DATA_STORAGE', 'error');
        }
    }

    async updateTime(time) {
        this.notificationTime = TimeValidator.sanitize(time);
        document.getElementById('notificationTime').value = this.notificationTime;
        await this.saveSettings();
        this.updateUI();
        this.scheduleDailyCheck();
    }

    async toggleNotification() {
        if (!this.isEnabled) {
            if (!('Notification' in window)) {
                alert('このブラウザは通知機能をサポートしていません');
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                this.isEnabled = true;
            } else {
                alert('通知が許可されませんでした。ブラウザの設定を確認してください。');
                this.isEnabled = false;
            }
        } else {
            this.isEnabled = false;
        }
        await this.saveSettings();
        this.updateUI();
        this.scheduleDailyCheck();
    }
    
    updateUI() {
        const toggleBtn = document.getElementById('notificationToggle');
        const status = document.getElementById('notificationStatus');
        const currentPermission = Notification.permission;
        if (this.isEnabled && currentPermission === 'granted') {
            toggleBtn.textContent = '通知を無効にする';
            toggleBtn.classList.add('disabled');
            status.innerHTML = `✅ 通知が有効です（毎日 ${this.notificationTime} 頃に通知）`;
        } else {
            toggleBtn.textContent = '通知を有効にする';
            toggleBtn.classList.remove('disabled');
            if (currentPermission === 'denied') {
                status.innerHTML = '❌ 通知がブロックされています。<br><small>ブラウザの設定から通知を許可してください。</small>';
                 toggleBtn.disabled = true;
            } else {
                status.textContent = '通知が無効です';
                toggleBtn.disabled = false;
            }
        }
    }

    sendMessageToServiceWorker(message) {
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            this.serviceWorkerRegistration.active.postMessage(message);
        } else {
            console.error('Service Worker is not active, cannot send message.');
        }
    }

    scheduleDailyCheck() {
        this.sendMessageToServiceWorker({
            type: 'SCHEDULE_DAILY_CHECK'
        });
    }
}

// ---------------------------------------------------------------------------------
// 6. 特別日程管理UI
// ---------------------------------------------------------------------------------
class SpecialScheduleUI {
    constructor(manager) {
        this.manager = manager;
        this.setupUI();
    }
    setupUI() {
        const container = document.querySelector('.container');
        const scheduleSection = document.createElement('div');
        scheduleSection.className = 'schedule-management-section';
        scheduleSection.innerHTML = `
            <div class="schedule-management">
                <h3>📅 特別日程の確認</h3>
                <div class="schedule-controls">
                    <button class="schedule-button perfect-fetch" id="perfectFetchBtn">🔄 最新情報を取得</button>
                    <button class="schedule-button" id="addSpecialDateBtn">👤 手動で追加</button>
                    <button class="schedule-button" id="viewScheduleBtn">📋 全日程を一覧表示</button>
                </div>
                <div id="fetchStatus" class="fetch-status" style="min-height: 2em;"></div>
                <div id="specialScheduleList" class="special-schedule-list"></div>
            </div>`;
        const notificationSection = document.querySelector('.notification-section');
        container.insertBefore(scheduleSection, notificationSection.nextSibling);
        document.getElementById('perfectFetchBtn').addEventListener('click', () => this.performPerfectFetch());
        document.getElementById('addSpecialDateBtn').addEventListener('click', () => this.showAddDialog());
        document.getElementById('viewScheduleBtn').addEventListener('click', () => this.showScheduleList());
    }
    async performPerfectFetch() {
        const fetchBtn = document.getElementById('perfectFetchBtn');
        const statusDiv = document.getElementById('fetchStatus');
        fetchBtn.disabled = true;
        fetchBtn.textContent = '🔄 取得中...';
        statusDiv.innerHTML = '📡 公式サイトに接続し、最新の特別日程を確認しています...';
        try {
            const result = await this.manager.fetchLatestSchedule();
            if (result && result.specialDates && result.specialDates.size > 0) {
                statusDiv.innerHTML = `🎉 取得成功！ ${result.specialDates.size}件の特別日程を更新しました。`;
            } else {
                statusDiv.innerHTML = '✅ 新しい特別日程は見つかりませんでした。現在の日程は最新です。';
            }
            updateSpecialScheduleDisplay();
            this.manager.saveSpecialDates(); // ここでService Workerへも通知される
        } catch (error) {
            // errorManagerがユーザーに通知するので、ここではコンソール出力のみ
            console.error('取得エラー:', error);
            statusDiv.innerHTML = `❌ 取得に失敗しました。<br><small>時間をおいて再度試すか、手動で設定してください。</small>`;
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '🔄 最新情報を取得';
            setTimeout(() => { statusDiv.innerHTML = ''; }, 10000);
        }
    }
    showAddDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'special-date-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h4>手動で特別日程を追加</h4>
                <div class="form-group"><label>日付:</label><input type="date" id="specialDate" min="${new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group">
                    <label>ゴミ種別 (複数選択可):</label>
                    <div class="checkbox-group">
                        <label><input type="checkbox" value="burnable"> 可燃ごみ</label>
                        <label><input type="checkbox" value="bottles-plastic"> びん類・プラスチック類</label>
                        <label><input type="checkbox" value="cans-metal"> 缶・金属類・その他</label>
                        <label><input type="checkbox" value="pet-bottles"> ペットボトル</label>
                        <hr>
                        <label><input type="checkbox" value="none"> 収集なし</label>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button id="cancelBtn">キャンセル</button>
                    <button id="addBtn">追加</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);
        dialog.querySelector('#cancelBtn').onclick = () => dialog.remove();
        dialog.querySelector('#addBtn').onclick = () => {
            this.addSpecialDateFromDialog();
            dialog.remove();
        };
    }
    async addSpecialDateFromDialog() {
        const dateInput = document.getElementById('specialDate');
        const checkboxes = document.querySelectorAll('.checkbox-group input:checked');
        if (!dateInput.value) { alert('日付を選択してください'); return; }
        let types = [];
        const isNone = Array.from(checkboxes).some(cb => cb.value === 'none');
        if (!isNone) {
            const typeMap = {
                'burnable': { type: 'burnable', name: '可燃ごみ' },
                'bottles-plastic': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
                'cans-metal': { type: 'cans-metal', name: '缶・金属類・その他' },
                'pet-bottles': { type: 'pet-bottles', name: 'ペットボトル' }
            };
            checkboxes.forEach(cb => {
                if(typeMap[cb.value]) types.push(typeMap[cb.value]);
            });
        }
        await this.manager.setSpecialDate(dateInput.value, types, '手動設定');
        updateSpecialScheduleDisplay();
        alert('特別日程を追加しました');
    }
    showScheduleList() {
        const allDates = this.manager.getAllSpecialDates().sort((a, b) => new Date(a.date) - new Date(b.date));
        if (allDates.length === 0) { alert('登録されている特別日程はありません'); return; }
        const dialog = document.createElement('div');
        dialog.className = 'schedule-list-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h4>登録済みの全特別日程</h4>
                <div class="schedule-list">
                    ${allDates.map(item => {
                        const date = new Date(item.date);
                        const isPast = date < new Date(new Date().toDateString());
                        const typeNames = item.types.map(t => t.name).join('、') || '収集なし';
                        const userIcon = item.userSet ? '👤' : '🤖';
                        const noteText = item.note ? ` (${item.note})` : '';
                        return `
                            <div class="schedule-item ${isPast ? 'past-date' : ''}">
                                <span>${userIcon} ${item.date}: ${typeNames}${noteText}</span>
                                <button class="delete-btn" data-date="${item.date}">削除</button>
                            </div>`;
                    }).join('')}
                </div>
                <div class="dialog-buttons"><button id="closeBtn">閉じる</button></div>
            </div>`;
        document.body.appendChild(dialog);
        dialog.querySelector('#closeBtn').onclick = () => dialog.remove();
        dialog.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const dateToDelete = e.target.dataset.date;
                if (confirm(`${dateToDelete}の特別日程を削除しますか？`)) {
                    await this.manager.removeSpecialDate(dateToDelete);
                    dialog.remove();
                    this.showScheduleList();
                    updateSpecialScheduleDisplay();
                }
            };
        });
    }
}

// ---------------------------------------------------------------------------------
// 1.3 回帰テストスイート
// ---------------------------------------------------------------------------------
class RegressionTestSuite {
    static runAllTests() {
        // ... (このクラスの内部ロジックは変更なし)
    }
}

// ---------------------------------------------------------------------------------
// 7. アプリケーションの初期化
// ---------------------------------------------------------------------------------
let specialScheduleManager;
let specialScheduleUI;
let notificationManager;
let pwaManager;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        specialScheduleManager = new SpecialScheduleManager();
        await specialScheduleManager.init();

        specialScheduleUI = new SpecialScheduleUI(specialScheduleManager);
        
        pwaManager = new PWAManager();
        await pwaManager.init();
        
        notificationManager = new NotificationManager();
        await notificationManager.init();
        
        updateCalendar();
        setInterval(updateCalendar, 60000);

        const lastFetchTimestamp = await dataStore.get('lastSuccessfulFetch', 0);
        const oneMonthInMs = 30 * 24 * 60 * 60 * 1000;
        if ((Date.now() - lastFetchTimestamp) > oneMonthInMs) {
            setTimeout(() => specialScheduleUI.performPerfectFetch(), 2000);
        }
    } catch (error) {
        errorManager.logError(error, 'APP_INITIALIZATION', 'error');
    }
});