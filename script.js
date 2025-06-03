// =================================================================================
// ゴミ出しカレンダー アプリケーション スクリプト (月1自動チェック機能付き)
// =================================================================================

// ---------------------------------------------------------------------------------
// 1. 基本的なゴミ収集スケジュール定義
// ---------------------------------------------------------------------------------
const garbageSchedule = {
    burnable: [2, 5], // 火曜(2), 金曜(5)
    bottlesPlastic: [3], // 水曜(3) - 第1,3,5週
    cansMetal: [3], // 水曜(3) - 第2,4週
    petBottles: [4] // 木曜(4) - 第2,4週
};

// ★★★ ここから新しいクラスを追加 ★★★
// ---------------------------------------------------------------------------------
// Googleカレンダー連携管理クラス
// ---------------------------------------------------------------------------------
class GoogleCalendarManager {
    createUrl(date, garbageList) {
        if (!date || garbageList.length === 0) {
            return null;
        }

        const baseUrl = 'https://www.google.com/calendar/render?action=TEMPLATE';

        // イベントタイトルを作成
        const title = '🗑️ ゴミ出しの日: ' + garbageList.map(g => g.name).join('、');

        // 終日イベントとして設定
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const nextDay = String(date.getDate() + 1).padStart(2, '0'); // 終日イベントのため翌日を指定
        // ToDo: 月末の場合の考慮を簡略化するため、Googleカレンダー側でよしなに解釈してくれる形式にする
        const startDate = `${year}${month}${day}`;
        
        let nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextYear = nextDate.getFullYear();
        const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
        const nextDayStr = String(nextDate.getDate()).padStart(2, '0');
        const endDate = `${nextYear}${nextMonth}${nextDayStr}`;

        const dates = `${startDate}/${endDate}`;

        // 詳細情報を作成
        const details = `収集日です。\n収集時間: 18:00〜21:00\n忘れずにゴミを出しましょう。\n\n※この予定は「有田市ゴミ出しカレンダー」アプリから作成されました。`;

        // パラメータをエンコード
        const params = new URLSearchParams({
            text: title,
            dates: dates,
            details: details,
            location: '指定の収集場所',
            sf: 'true',
            output: 'xml'
        });

        return `${baseUrl}&${params.toString()}`;
    }

    renderButton(containerId, date, garbageList) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = ''; // 一旦コンテナを空にする

        if (garbageList.length > 0) {
            const url = this.createUrl(date, garbageList);
            if (url) {
                const button = document.createElement('a');
                button.href = url;
                button.textContent = '📅 Googleカレンダーに追加';
                button.className = 'calendar-button';
                button.target = '_blank'; // 新しいタブで開く
                button.rel = 'noopener noreferrer';
                container.appendChild(button);
            }
        }
    }
}
// ★★★ 追加ここまで ★★★


// ---------------------------------------------------------------------------------
// 2. 完璧版自動取得システム (CORSプロキシ並列化・HTML解析強化版)
// ---------------------------------------------------------------------------------
class PerfectScheduleFetcher {
    constructor() {
        this.aridaCityUrl = 'https://www.city.arida.lg.jp/kurashi/gomikankyo/gomibunbetsu/1000951/1000954.html';
        
        this.proxyUrls = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/get?url='
        ];

        this.garbageImageMapping = {
            'gomi01.png': { type: 'burnable', name: '可燃ごみ' },
            'gomi02.png': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
            'gomi03.png': { type: 'cans-metal', name: '缶・金属類・その他' },
            'gomi04.png': { type: 'pet-bottles', name: 'ペットボトル' }
        };
    }

    async fetchHtmlContent() {
        console.log('📡 HTMLコンテンツ取得中 (並列実行)...');

        const fetchPromises = this.proxyUrls.map(proxyUrl => {
            const requestUrl = proxyUrl.includes('allorigins')
                ? proxyUrl + encodeURIComponent(this.aridaCityUrl)
                : proxyUrl + this.aridaCityUrl;

            return fetch(requestUrl).then(async (response) => {
                if (!response.ok) {
                    throw new Error(`プロキシエラー: ${response.status} at ${proxyUrl}`);
                }
                if (proxyUrl.includes('allorigins')) {
                    const data = await response.json();
                    if (data.contents) {
                        return data.contents;
                    }
                    throw new Error('alloriginsがコンテンツを返しませんでした');
                }
                return response.text();
            });
        });

        try {
            const htmlContent = await Promise.any(fetchPromises);
            console.log('✅ HTML取得成功 (一番速いプロキシを使用)');
            return htmlContent;
        } catch (error) {
            console.error('❌ 全てのプロキシで取得に失敗しました', error);
            throw new Error('全てのプロキシで取得に失敗');
        }
    }

    extractScheduleFromHtml(htmlContent) {
        console.log('🔍 HTML解析中...');
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
        if (!currentYear) {
            currentYear = new Date().getFullYear();
            console.warn(`HTMLから年を特定できませんでした。現在の年(${currentYear})を使用します。`);
        }
        console.log(`📅 解析対象の年: ${currentYear}`);

        const scheduleData = {
            year: currentYear,
            specialDates: new Map(),
            source: 'html_extraction',
            confidence: 0.95
        };

        const tables = doc.querySelectorAll('table.gomi');
        if (tables.length === 0) {
            console.error('❌ 解析対象のテーブルが見つかりませんでした。');
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
                    const images = cell.querySelectorAll('img');
                    images.forEach(img => {
                        const src = img.getAttribute('src');
                        const imageName = src.split('/').pop();
                        const garbageInfo = this.garbageImageMapping[imageName];
                        if (garbageInfo) {
                            garbageTypes.push(garbageInfo);
                        }
                    });

                    const normalGarbage = this.getNormalGarbageForDate(new Date(dateString));
                    if (!this.arraysEqual(garbageTypes, normalGarbage)) {
                        scheduleData.specialDates.set(dateString, garbageTypes);
                    }
                });
            });
        });

        console.log(`📊 ${scheduleData.specialDates.size}件の特別日程を発見`);
        return scheduleData;
    }
    
    getNormalGarbageForDate(date) {
        const dayOfWeek = date.getDay();
        const weekOfMonth = getWeekOfMonth(date);
        const garbage = [];

        if (garbageSchedule.burnable.includes(dayOfWeek)) {
            garbage.push({ type: 'burnable', name: '可燃ごみ' });
        }
        if (dayOfWeek === 3 && [1, 3, 5].includes(weekOfMonth)) {
            garbage.push({ type: 'bottles-plastic', name: 'びん類・プラスチック類' });
        }
        if (dayOfWeek === 3 && [2, 4].includes(weekOfMonth)) {
            garbage.push({ type: 'cans-metal', name: '缶・金属類・その他' });
        }
        if (dayOfWeek === 4 && [2, 4].includes(weekOfMonth)) {
            garbage.push({ type: 'pet-bottles', name: 'ペットボトル' });
        }
        return garbage;
    }

    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        const aTypes = a.map(g => g.type).sort();
        const bTypes = b.map(g => g.type).sort();
        return aTypes.every((val, index) => val === bTypes[index]);
    }

    getDefaultSchedule() {
        return {
            year: new Date().getFullYear(),
            specialDates: new Map(),
            source: 'default_error',
            confidence: 0.1
        };
    }
    
    updateSpecialSchedule(scheduleData) {
        if (scheduleData && scheduleData.specialDates) {
            scheduleData.specialDates.forEach((types, date) => {
                const note = `自動取得 (${scheduleData.source}, 信頼度: ${Math.round(scheduleData.confidence * 100)}%)`;
                specialScheduleManager.setSpecialDate(date, types, note);
            });
            
            console.log(`✅ ${scheduleData.specialDates.size}件の特別日程を更新`);
            updateSpecialScheduleDisplay();
        }
    }
}


// ---------------------------------------------------------------------------------
// 3. 特別日程管理クラス (Gistフォールバック機能付き)
// ---------------------------------------------------------------------------------
class SpecialScheduleManager {
    constructor() {
        this.specialDates = new Map();
        this.fetcher = new PerfectScheduleFetcher();
        
        // Gist URLを正しく設定
        this.gistFallbackUrl = 'https://gist.githubusercontent.com/realkinglion/4859d37c601e6f3b3a07cc049356234b/raw/a3834ed438c03cfd9b7d83d021f7bd142ca7429a/schedule.json';
        
        this.loadSpecialDates();
    }

    async fetchLatestSchedule() {
        try {
            const htmlContent = await this.fetcher.fetchHtmlContent();
            const scheduleData = this.fetcher.extractScheduleFromHtml(htmlContent);
            this.fetcher.updateSpecialSchedule(scheduleData);
            console.log('✅ プロキシ経由での取得に成功');
            // ★★★★★ 成功時に最終取得日時を記録 ★★★★★
            localStorage.setItem('lastSuccessfulFetch', Date.now().toString());
            return scheduleData;
        } catch (error) {
            console.warn('⚠️ プロキシ経由での取得に失敗。Gistからのフォールバックを試みます。', error);
            if (!this.gistFallbackUrl || this.gistFallbackUrl.includes('YOUR_GIST_ID')) {
                console.error('❌ GistのURLが設定されていません。フォールバックできません。');
                throw new Error('Gist URL is not configured.');
            }
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
                console.log('✅ Gistからのフォールバック取得に成功');
                // ★★★★★ 成功時に最終取得日時を記録 ★★★★★
                localStorage.setItem('lastSuccessfulFetch', Date.now().toString());
                return scheduleData;

            } catch (fallbackError) {
                console.error('❌ Gistからのフォールバックも失敗しました。', fallbackError);
                throw fallbackError;
            }
        }
    }

    loadSpecialDates() {
        try {
            const stored = localStorage.getItem('specialGarbageDates');
            if (stored) {
                const data = JSON.parse(stored);
                Object.entries(data).forEach(([date, dateData]) => {
                    this.specialDates.set(date, dateData);
                });
                console.log('特別日程を読み込みました:', this.specialDates.size, '件');
            }
        } catch (e) { console.log('特別日程の読み込みに失敗:', e); }
        this.setDefaultHolidaySchedule();
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
                this.setSpecialDate(change.date, change.types, change.note);
            }
        });
    }

    setSpecialDate(dateString, garbageTypes, note = '') {
        const dateData = {
            types: garbageTypes,
            note: note,
            userSet: note.includes('手動'),
            timestamp: Date.now()
        };
        this.specialDates.set(dateString, dateData);
        this.saveSpecialDates();
    }

    removeSpecialDate(dateString) {
        this.specialDates.delete(dateString);
        this.saveSpecialDates();
    }

    saveSpecialDates() {
        try {
            const data = {};
            this.specialDates.forEach((value, key) => { data[key] = value; });
            localStorage.setItem('specialGarbageDates', JSON.stringify(data));
        } catch (e) { console.log('特別日程の保存に失敗:', e); }
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
        return Array.from(this.specialDates.entries()).map(([date, data]) => ({
            date,
            types: data.types,
            note: data.note || '',
            userSet: data.userSet || false,
            timestamp: data.timestamp || 0
        }));
    }
}


// ---------------------------------------------------------------------------------
// 4. UI更新 & スケジュール判定ロジック
// ---------------------------------------------------------------------------------
function getWeekOfMonth(date) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekday = firstDay.getDay();
    const offsetDate = date.getDate() + firstWeekday - 1;
    return Math.floor(offsetDate / 7) + 1;
}

function getTodayGarbage(date) {
    const specialSchedule = specialScheduleManager.getSpecialSchedule(date);
    if (specialSchedule !== null) {
        return specialSchedule;
    }

    const dayOfWeek = date.getDay();
    const weekOfMonth = getWeekOfMonth(date);
    const garbage = [];

    if (garbageSchedule.burnable.includes(dayOfWeek)) {
        garbage.push({ type: 'burnable', name: '可燃ごみ' });
    }
    if (dayOfWeek === 3 && [1, 3, 5].includes(weekOfMonth)) {
        garbage.push({ type: 'bottles-plastic', name: 'びん類・プラスチック類' });
    }
    if (dayOfWeek === 3 && [2, 4].includes(weekOfMonth)) {
        garbage.push({ type: 'cans-metal', name: '缶・金属類・その他' });
    }
    if (dayOfWeek === 4 && [2, 4].includes(weekOfMonth)) {
        garbage.push({ type: 'pet-bottles', name: 'ペットボトル' });
    }
    return garbage;
}

function displayGarbage(garbage, elementId, isToday = true) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (garbage.length === 0) {
        const message = isToday ? '今日はゴミ出しの日ではありません' : '明日はゴミ出し日に該当しません';
        element.innerHTML = `<span class="no-garbage">${message}</span>`;
    } else {
        element.innerHTML = garbage.map(g => 
            `<span class="garbage-type ${g.type}">${g.name}</span>`
        ).join('');
    }
}

// ★★★ ここから関数を修正 ★★★
function updateCalendar() {
    const today = new Date();
    today.setHours(0,0,0,0); // 時間をリセットして日付のみで比較
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('ja-JP', options); // 表示は現在時刻のまま

    // 今日のゴミ
    const todayGarbage = getTodayGarbage(today);
    displayGarbage(todayGarbage, 'todayGarbage', true);
    googleCalendarManager.renderButton('todayCalendarButtonContainer', today, todayGarbage);
    
    const todayDetails = specialScheduleManager.getSpecialScheduleDetails(today);
    if (todayDetails && todayDetails.note) {
        const todayElement = document.getElementById('todayGarbage');
        todayElement.innerHTML += `<div class="special-note">📅 ${todayDetails.note}</div>`;
    }

    // 明日のゴミ
    const tomorrowGarbage = getTodayGarbage(tomorrow);
    displayGarbage(tomorrowGarbage, 'tomorrowGarbage', false);
    googleCalendarManager.renderButton('tomorrowCalendarButtonContainer', tomorrow, tomorrowGarbage);
    
    const tomorrowDetails = specialScheduleManager.getSpecialScheduleDetails(tomorrow);
    if (tomorrowDetails && tomorrowDetails.note) {
        const tomorrowElement = document.getElementById('tomorrowGarbage');
        tomorrowElement.innerHTML += `<div class="special-note">📅 ${tomorrowDetails.note}</div>`;
    }

    updateSpecialScheduleDisplay();
}
// ★★★ 修正ここまで ★★★

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

function createNotificationOptions(title, body, tag, includeActions = true) {
    const options = {
        body: body,
        icon: './icon-192x192.png',
        badge: './icon-64x64.png',
        tag: tag,
        requireInteraction: true,
        silent: false,
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        renotify: true,
        data: { timestamp: Date.now(), origin: 'garbage-calendar' }
    };
    if (includeActions) {
        options.actions = [
            { action: 'view', title: '詳細を見る', icon: './icon-64x64.png' },
            { action: 'dismiss', title: '了解', icon: './icon-64x64.png' }
        ];
    }
    return options;
}

// ---------------------------------------------------------------------------------
// 5. PWA機能 & 通知機能
// ---------------------------------------------------------------------------------
class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.init();
    }

    async init() {
        if ('serviceWorker' in navigator) {
            try {
                // GitHub Pages対応: 明示的にスコープを指定
                const registration = await navigator.serviceWorker.register('./service-worker.js', {
                    scope: './'
                });
                console.log('Service Worker registered:', registration);
                console.log('Service Worker scope:', registration.scope);
                
                // 登録後、すぐにアクティブになるのを待つ
                await navigator.serviceWorker.ready;
                console.log('Service Worker is ready');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                console.error('詳細:', error.message);
                
                // エラーの詳細を表示
                const pwaStatus = document.getElementById('pwaStatus');
                if (pwaStatus) {
                    pwaStatus.textContent = 'Service Worker登録エラー: ' + error.message;
                    pwaStatus.style.color = 'red';
                }
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
            console.log('PWA インストール可能');
        });
        
        installButton.addEventListener('click', async () => {
            if (!this.deferredPrompt) {
                console.log('インストールプロンプトが利用できません');
                return;
            }
            
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                pwaStatus.textContent = 'アプリがインストールされました！';
                console.log('PWA インストール完了');
            } else {
                console.log('PWA インストールがキャンセルされました');
            }
            
            this.deferredPrompt = null;
            installButton.disabled = true;
        });
        
        window.addEventListener('appinstalled', () => {
            pwaStatus.textContent = 'アプリが正常にインストールされました！';
            installButton.style.display = 'none';
            console.log('PWA インストール完了イベント');
        });
        
        // 1秒後に状態を確認
        setTimeout(() => {
            if (!this.deferredPrompt) {
                if (window.matchMedia('(display-mode: standalone)').matches) {
                    pwaStatus.textContent = 'アプリとして実行中です';
                    installButton.style.display = 'none';
                    console.log('PWA スタンドアロンモードで実行中');
                } else {
                    // Service Workerの状態も確認
                    if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.getRegistration().then(registration => {
                            if (registration) {
                                pwaStatus.textContent = 'Service Worker登録済み（インストール待機中）';
                            } else {
                                pwaStatus.textContent = 'Service Worker登録待ち';
                            }
                        });
                    } else {
                        pwaStatus.textContent = 'このブラウザではインストールできません';
                    }
                }
            }
        }, 1000);
    }
}

class NotificationManager {
    constructor() {
        this.isEnabled = false;
        this.notificationTime = '07:00';
        this.serviceWorkerRegistration = null;
        this.init();
    }

    async init() {
        const toggleBtn = document.getElementById('notificationToggle');
        const timeInput = document.getElementById('notificationTime');

        try {
            this.isEnabled = localStorage.getItem('notificationEnabled') === 'true';
            this.notificationTime = localStorage.getItem('notificationTime') || '07:00';
        } catch (e) { console.log('LocalStorage not available'); }

        if ('serviceWorker' in navigator) {
            this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
        }

        timeInput.value = this.notificationTime;
        this.updateUI();

        toggleBtn.addEventListener('click', () => this.toggleNotification());
        timeInput.addEventListener('change', (e) => this.updateTime(e.target.value));

        this.setupServiceWorkerCommunication();
        
        this.scheduleDailyCheck();
    }

    async setupServiceWorkerCommunication() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('Message from Service Worker:', event.data);
            if (event.data && event.data.type === 'NOTIFICATION_STATUS') {
                 const status = document.getElementById('notificationStatus');
                 if (status) {
                     status.innerHTML += `<br><small>SW: ${event.data.message}</small>`;
                 }
            }
        });
    }

    sendMessageToServiceWorker(message) {
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            this.serviceWorkerRegistration.active.postMessage(message);
        } else {
            console.error('Service Worker is not active, cannot send message.');
        }
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
                this.saveSettings();
                await this.showTestNotification();
            } else {
                alert('通知が許可されませんでした。ブラウザの設定を確認してください。');
                this.isEnabled = false;
            }
        } else {
            this.isEnabled = false;
            this.saveSettings();
        }
        this.updateUI();
        this.scheduleDailyCheck();
    }

    updateTime(time) {
        this.notificationTime = time;
        this.saveSettings();
        this.updateUI();
        this.scheduleDailyCheck();
    }

    saveSettings() {
        try {
            localStorage.setItem('notificationEnabled', this.isEnabled);
            localStorage.setItem('notificationTime', this.notificationTime);
        } catch (e) { console.log('Failed to save settings'); }
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

    async showTestNotification() {
        this.sendMessageToServiceWorker({ type: 'TEST_NOTIFICATION' });
    }
    
    scheduleDailyCheck() {
        console.log('Sending schedule information to Service Worker.');
        this.sendMessageToServiceWorker({
            type: 'SCHEDULE_DAILY_CHECK',
            enabled: this.isEnabled,
            time: this.notificationTime
        });
        
        this.updateSpecialDatesInServiceWorker();
    }

    updateSpecialDatesInServiceWorker() {
        if (typeof specialScheduleManager !== 'undefined' && specialScheduleManager) {
            const specialDatesObject = {};
            specialScheduleManager.specialDates.forEach((value, key) => {
                specialDatesObject[key] = value;
            });
            this.sendMessageToServiceWorker({
                type: 'UPDATE_SPECIAL_DATES',
                specialDates: specialDatesObject
            });
        }
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
                statusDiv.innerHTML = `🎉 取得成功！ ${result.specialDates.size}件の特別日程を更新しました。(取得元: ${result.source})`;
            } else {
                statusDiv.innerHTML = '✅ 新しい特別日程は見つかりませんでした。現在の日程は最新です。';
            }
            updateSpecialScheduleDisplay();
            notificationManager.updateSpecialDatesInServiceWorker();
        } catch (error) {
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
            this.addSpecialDate();
            dialog.remove();
        };
    }

    addSpecialDate() {
        const dateInput = document.getElementById('specialDate');
        const checkboxes = document.querySelectorAll('.checkbox-group input:checked');
        if (!dateInput.value) { alert('日付を選択してください'); return; }

        let types = [];
        const isNone = Array.from(checkboxes).some(cb => cb.value === 'none');
        
        if (!isNone) {
            checkboxes.forEach(cb => {
                const typeMap = {
                    'burnable': { type: 'burnable', name: '可燃ごみ' },
                    'bottles-plastic': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
                    'cans-metal': { type: 'cans-metal', name: '缶・金属類・その他' },
                    'pet-bottles': { type: 'pet-bottles', name: 'ペットボトル' }
                };
                if(typeMap[cb.value]) types.push(typeMap[cb.value]);
            });
        }
        
        this.manager.setSpecialDate(dateInput.value, types, '手動設定');
        updateSpecialScheduleDisplay();
        notificationManager.updateSpecialDatesInServiceWorker();
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
                <div class="dialog-buttons">
                    <button id="closeBtn">閉じる</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);
        dialog.querySelector('#closeBtn').onclick = () => dialog.remove();
        dialog.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = (e) => {
                const dateToDelete = e.target.dataset.date;
                if (confirm(`${dateToDelete}の特別日程を削除しますか？`)) {
                    this.manager.removeSpecialDate(dateToDelete);
                    notificationManager.updateSpecialDatesInServiceWorker();
                    dialog.remove();
                    this.showScheduleList();
                    updateSpecialScheduleDisplay();
                }
            };
        });
    }
}


// ---------------------------------------------------------------------------------
// 7. アプリケーションの初期化
// ---------------------------------------------------------------------------------
let specialScheduleManager;
let specialScheduleUI;
let notificationManager;
let googleCalendarManager; // ★★★ 変数を追加 ★★★

document.addEventListener('DOMContentLoaded', () => {
    specialScheduleManager = new SpecialScheduleManager();
    specialScheduleUI = new SpecialScheduleUI(specialScheduleManager);
    googleCalendarManager = new GoogleCalendarManager(); // ★★★ インスタンスを生成 ★★★
    
    const pwaManager = new PWAManager();
    notificationManager = new NotificationManager();
    
    updateCalendar();
    setInterval(updateCalendar, 60000);
    
    // 月1回の自動チェック機能
    try {
        const lastFetchTimestamp = localStorage.getItem('lastSuccessfulFetch');
        const oneMonthInMs = 30 * 24 * 60 * 60 * 1000;
        
        if (!lastFetchTimestamp || (Date.now() - parseInt(lastFetchTimestamp)) > oneMonthInMs) {
            console.log('最終取得から1ヶ月以上経過したため、自動更新を開始します。');
            setTimeout(() => {
                specialScheduleUI.performPerfectFetch();
            }, 2000);
        } else {
            console.log('最終取得から1ヶ月以内です。自動更新はスキップします。');
        }
    } catch(e) {
        console.error("自動チェック処理でエラーが発生しました:", e);
    }
});