// ゴミ収集スケジュール
const garbageSchedule = {
    burnable: [2, 5], // 火曜(2), 金曜(5)
    bottlesPlastic: [3], // 水曜(3) - 第1,3,5週
    cansMetal: [3], // 水曜(3) - 第2,4週
    petBottles: [4] // 木曜(4) - 第2,4週
};

// 特別日程管理クラス
class SpecialScheduleManager {
    constructor() {
        this.specialDates = new Map(); // 日付文字列 -> ゴミ種別配列
        this.loadSpecialDates();
        this.lastUpdateCheck = null;
    }

    // 特別日程の読み込み
    loadSpecialDates() {
        try {
            const stored = localStorage.getItem('specialGarbageDates');
            if (stored) {
                const data = JSON.parse(stored);
                this.specialDates = new Map(Object.entries(data));
                console.log('特別日程を読み込みました:', this.specialDates.size, '件');
            }
        } catch (e) {
            console.log('特別日程の読み込みに失敗:', e);
        }

        // デフォルトの年末年始スケジュール（例）
        this.setDefaultHolidaySchedule();
    }

    // デフォルトの年末年始スケジュールを設定
    setDefaultHolidaySchedule() {
        const currentYear = new Date().getFullYear();
        
        // 年末年始の一般的な変更パターン（実際の日程に合わせて調整）
        const holidayChanges = [
            // 12月29日〜1月3日は収集なし（例）
            { date: `${currentYear}-12-29`, types: [] },
            { date: `${currentYear}-12-30`, types: [] },
            { date: `${currentYear}-12-31`, types: [] },
            { date: `${currentYear + 1}-01-01`, types: [] },
            { date: `${currentYear + 1}-01-02`, types: [] },
            { date: `${currentYear + 1}-01-03`, types: [] },
            
            // ゴールデンウィーク期間の変更（例）
            { date: `${currentYear + 1}-05-03`, types: [] }, // 憲法記念日
            { date: `${currentYear + 1}-05-04`, types: [] }, // みどりの日
            { date: `${currentYear + 1}-05-05`, types: [] }, // こどもの日
        ];

        holidayChanges.forEach(change => {
            this.setSpecialDate(change.date, change.types);
        });
    }

    // 特別日程を設定
    setSpecialDate(dateString, garbageTypes) {
        this.specialDates.set(dateString, garbageTypes);
        this.saveSpecialDates();
    }

    // 特別日程を削除
    removeSpecialDate(dateString) {
        this.specialDates.delete(dateString);
        this.saveSpecialDates();
    }

    // 特別日程の保存
    saveSpecialDates() {
        try {
            const data = Object.fromEntries(this.specialDates);
            localStorage.setItem('specialGarbageDates', JSON.stringify(data));
        } catch (e) {
            console.log('特別日程の保存に失敗:', e);
        }
    }

    // 指定日の特別日程を取得
    getSpecialSchedule(date) {
        const dateString = this.formatDate(date);
        return this.specialDates.get(dateString) || null;
    }

    // 日付フォーマット
    formatDate(date) {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }

    // 有田市のページから最新情報を取得（CORSプロキシ使用）
    async fetchLatestSchedule() {
        try {
            console.log('最新のゴミ出しスケジュールを確認中...');
            
            // CORSプロキシを使用して有田市のページを取得
            const proxyUrl = 'https://api.allorigins.win/get?url=';
            const targetUrl = 'https://www.city.arida.lg.jp/kurashi/gomikankyo/gomibunbetsu/1000951/1000954.html';
            
            const response = await fetch(proxyUrl + encodeURIComponent(targetUrl));
            const data = await response.json();
            
            if (data.contents) {
                this.parseScheduleFromHtml(data.contents);
                this.lastUpdateCheck = new Date();
            }
        } catch (error) {
            console.log('スケジュール取得エラー:', error);
            // エラーの場合は手動設定を促す
            this.showUpdateError();
        }
    }

    // HTMLからスケジュール情報を解析
    parseScheduleFromHtml(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // カレンダーテーブルを探す
            const tables = doc.querySelectorAll('table');
            
            tables.forEach(table => {
                this.parseCalendarTable(table);
            });
            
            console.log('HTMLからスケジュール情報を解析完了');
        } catch (error) {
            console.log('HTML解析エラー:', error);
        }
    }

    // カレンダーテーブルを解析
    parseCalendarTable(table) {
        const rows = table.querySelectorAll('tr');
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();
        
        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td');
            
            cells.forEach((cell, cellIndex) => {
                const text = cell.textContent.trim();
                const dateMatch = text.match(/(\d+)/);
                
                if (dateMatch) {
                    const day = parseInt(dateMatch[1]);
                    const dateString = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                    
                    // セル内のゴミ種別を判定
                    const garbageTypes = this.parseGarbageTypesFromCell(cell);
                    
                    if (garbageTypes.length > 0) {
                        this.setSpecialDate(dateString, garbageTypes);
                    }
                }
            });
        });
    }

    // セルからゴミ種別を解析
    parseGarbageTypesFromCell(cell) {
        const types = [];
        const text = cell.textContent;
        const className = cell.className;
        
        // クラス名やテキストからゴミ種別を判定
        if (text.includes('可燃') || className.includes('burnable')) {
            types.push({ type: 'burnable', name: '可燃ごみ' });
        }
        if (text.includes('びん') || text.includes('プラスチック') || className.includes('bottles')) {
            types.push({ type: 'bottles-plastic', name: 'びん類・プラスチック類' });
        }
        if (text.includes('缶') || text.includes('金属') || className.includes('cans')) {
            types.push({ type: 'cans-metal', name: '缶・金属類・その他' });
        }
        if (text.includes('ペット') || className.includes('pet')) {
            types.push({ type: 'pet-bottles', name: 'ペットボトル' });
        }
        
        return types;
    }

    // 更新エラー表示
    showUpdateError() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'update-error';
        errorDiv.innerHTML = `
            <h4>⚠️ 最新情報の取得に失敗しました</h4>
            <p>年末年始の特別日程は手動で設定してください。</p>
            <button onclick="this.parentElement.style.display='none'">閉じる</button>
        `;
        
        document.querySelector('.container').insertBefore(errorDiv, document.querySelector('.today-section'));
    }

    // 特別日程の一覧取得
    getAllSpecialDates() {
        return Array.from(this.specialDates.entries()).map(([date, types]) => ({
            date,
            types
        }));
    }
}

// 週数計算
function getWeekOfMonth(date) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekday = firstDay.getDay();
    const offsetDate = date.getDate() + firstWeekday - 1;
    return Math.floor(offsetDate / 7) + 1;
}

// 改良版ゴミ判定（特別日程対応）
function getTodayGarbage(date) {
    // まず特別日程をチェック
    const specialSchedule = specialScheduleManager.getSpecialSchedule(date);
    if (specialSchedule !== null) {
        console.log('特別日程が適用されました:', specialSchedule);
        return specialSchedule;
    }

    // 通常のルールベース判定
    const dayOfWeek = date.getDay();
    const weekOfMonth = getWeekOfMonth(date);
    const garbage = [];

    // 可燃ごみ (火曜・金曜)
    if (garbageSchedule.burnable.includes(dayOfWeek)) {
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

function displayGarbage(garbage, elementId, isToday = true) {
    const element = document.getElementById(elementId);
    
    if (garbage.length === 0) {
        const message = isToday ? '今日はゴミ出しの日ではありません' : '明日はゴミ出し日に該当しません';
        element.innerHTML = `<span class="no-garbage">${message}</span>`;
    } else {
        element.innerHTML = garbage.map(g => 
            `<span class="garbage-type ${g.type}">${g.name}</span>`
        ).join('');
    }
}

function updateCalendar() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 日付表示
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        weekday: 'long' 
    };
    document.getElementById('todayDate').textContent = 
        today.toLocaleDateString('ja-JP', options);

    // 今日のゴミ
    const todayGarbage = getTodayGarbage(today);
    displayGarbage(todayGarbage, 'todayGarbage', true);

    // 明日のゴミ
    const tomorrowGarbage = getTodayGarbage(tomorrow);
    displayGarbage(tomorrowGarbage, 'tomorrowGarbage', false);

    // 特別日程表示の更新
    updateSpecialScheduleDisplay();
}

// 特別日程表示の更新
function updateSpecialScheduleDisplay() {
    const container = document.getElementById('specialScheduleList');
    if (!container) return;

    const specialDates = specialScheduleManager.getAllSpecialDates()
        .filter(item => new Date(item.date) >= new Date())
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5); // 直近5件

    if (specialDates.length > 0) {
        container.innerHTML = '<h4>📅 直近の特別日程</h4>' + 
            specialDates.map(item => {
                const date = new Date(item.date);
                const dateStr = date.toLocaleDateString('ja-JP');
                const typeNames = item.types.map(t => t.name).join('、') || '収集なし';
                return `<div class="special-date-item">${dateStr}: ${typeNames}</div>`;
            }).join('');
    } else {
        container.innerHTML = '<h4>📅 特別日程</h4><p>現在、特別日程はありません</p>';
    }
}

// 通知オプション作成関数
function createNotificationOptions(title, body, tag, includeActions = true) {
    const options = {
        body: body,
        icon: './icon-192x192.png',
        badge: './icon-64x64.png',
        tag: tag,
        requireInteraction: true,
        silent: false,
        vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40, 450, 110, 200, 110, 170, 40, 500],
        timestamp: Date.now(),
        renotify: true,
        data: {
            timestamp: Date.now(),
            origin: 'garbage-calendar'
        }
    };

    if (includeActions) {
        options.actions = [
            { 
                action: 'view', 
                title: '詳細を見る',
                icon: './icon-64x64.png'
            },
            { 
                action: 'dismiss', 
                title: '了解',
                icon: './icon-64x64.png'
            }
        ];
    }

    return options;
}

// PWA機能
class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.init();
    }

    async init() {
        // Service Worker登録
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./service-worker.js');
                console.log('Service Worker registered:', registration);
                this.setupBackgroundSync(registration);
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }

        // PWAインストール機能
        this.setupInstallPrompt();
    }

    setupInstallPrompt() {
        const installButton = document.getElementById('installButton');
        const pwaStatus = document.getElementById('pwaStatus');

        // インストールプロンプトの待機
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            installButton.disabled = false;
            pwaStatus.textContent = 'アプリとしてインストール可能です';
        });

        // インストールボタンのクリック
        installButton.addEventListener('click', async () => {
            if (!this.deferredPrompt) return;

            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                pwaStatus.textContent = 'アプリがインストールされました！';
            } else {
                pwaStatus.textContent = 'インストールがキャンセルされました';
            }
            
            this.deferredPrompt = null;
            installButton.disabled = true;
        });

        // インストール完了の検出
        window.addEventListener('appinstalled', () => {
            pwaStatus.textContent = 'アプリが正常にインストールされました！';
            installButton.style.display = 'none';
        });

        // 初期状態の設定
        setTimeout(() => {
            if (!this.deferredPrompt) {
                if (window.matchMedia('(display-mode: standalone)').matches) {
                    pwaStatus.textContent = 'アプリとして実行中です';
                    installButton.style.display = 'none';
                } else {
                    pwaStatus.textContent = 'このブラウザではインストールできません';
                }
            }
        }, 1000);
    }

    async setupBackgroundSync(registration) {
        // バックグラウンド同期の設定
        if ('sync' in window.ServiceWorkerRegistration.prototype) {
            try {
                await registration.sync.register('garbage-reminder');
                console.log('Background sync registered');
            } catch (error) {
                console.log('Background sync registration failed:', error);
            }
        }

        // 定期的バックグラウンド同期
        if ('periodicSync' in window.ServiceWorkerRegistration.prototype) {
            try {
                await registration.periodicSync.register('daily-garbage-check', {
                    minInterval: 24 * 60 * 60 * 1000 // 24時間
                });
                console.log('Periodic background sync registered');
            } catch (error) {
                console.log('Periodic background sync failed:', error);
            }
        }
    }
}

// Android PWA対応通知機能
class NotificationManager {
    constructor() {
        this.isEnabled = false;
        this.notificationTime = '07:00';
        this.lastNotificationDate = null;
        this.serviceWorkerRegistration = null;
        this.heartbeatInterval = null;
        this.init();
    }

    async init() {
        const toggleBtn = document.getElementById('notificationToggle');
        const timeInput = document.getElementById('notificationTime');

        // LocalStorageから設定を読み込み（可能な場合）
        try {
            this.isEnabled = localStorage.getItem('notificationEnabled') === 'true';
            this.notificationTime = localStorage.getItem('notificationTime') || '07:00';
            this.lastNotificationDate = localStorage.getItem('lastNotificationDate');
        } catch (e) {
            console.log('LocalStorage not available, using memory storage');
        }

        // Service Worker登録の待機
        if ('serviceWorker' in navigator) {
            try {
                this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
                console.log('Service Worker ready for notifications');
            } catch (error) {
                console.log('Service Worker not ready:', error);
            }
        }

        // 初期状態の設定
        timeInput.value = this.notificationTime;
        await this.updateUI();

        // イベントリスナー
        toggleBtn.addEventListener('click', () => this.toggleNotification());
        timeInput.addEventListener('change', (e) => this.updateTime(e.target.value));

        // Android対応: アプリがアクティブな間の定期チェック
        this.startHeartbeat();
        
        // Service Workerとの通信チャネル確立
        await this.setupServiceWorkerCommunication();

        // 初期診断実行
        this.runDiagnostics();
    }

    async runDiagnostics() {
        console.log('=== 通知診断開始 ===');
        console.log('User Agent:', navigator.userAgent);
        console.log('Notification API available:', 'Notification' in window);
        console.log('Service Worker available:', 'serviceWorker' in navigator);
        console.log('Current notification permission:', Notification.permission);
        console.log('PWA standalone mode:', window.matchMedia('(display-mode: standalone)').matches);
        
        if (this.serviceWorkerRegistration) {
            console.log('Service Worker registration:', this.serviceWorkerRegistration);
        }
        
        console.log('=== 診断終了 ===');
    }

    // Android対応: 定期的な生存確認
    startHeartbeat() {
        // 既存のheartbeatがあれば停止
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // 1分ごとにService Workerにメッセージ送信
        this.heartbeatInterval = setInterval(() => {
            this.sendMessageToServiceWorker({
                type: 'HEARTBEAT',
                timestamp: Date.now()
            });
            
            // 通知時間チェックも実行
            this.checkNotificationTime();
        }, 60000);
        
        console.log('Heartbeat started');
    }

    // Service Workerとの通信設定
    async setupServiceWorkerCommunication() {
        if ('serviceWorker' in navigator) {
            try {
                this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
                
                // Service Workerからのメッセージ受信
                navigator.serviceWorker.addEventListener('message', (event) => {
                    console.log('Message from Service Worker:', event.data);
                });
                
                console.log('Service Worker communication established');
            } catch (error) {
                console.error('Service Worker communication failed:', error);
            }
        }
    }

    // Service Workerにメッセージ送信
    sendMessageToServiceWorker(message) {
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            this.serviceWorkerRegistration.active.postMessage(message);
        }
    }

    async toggleNotification() {
        console.log('通知トグル開始, 現在の状態:', this.isEnabled);
        
        if (!this.isEnabled) {
            // 通知許可を求める
            if (!('Notification' in window)) {
                alert('このブラウザは通知機能をサポートしていません');
                return;
            }

            console.log('通知許可要求中...');
            let permission;
            
            try {
                // Android PWAでは異なる方法で許可を求める場合がある
                if (this.serviceWorkerRegistration) {
                    permission = await this.requestNotificationPermissionForPWA();
                } else {
                    permission = await Notification.requestPermission();
                }
                
                console.log('通知許可結果:', permission);
                
                if (permission === 'granted') {
                    this.isEnabled = true;
                    this.saveSettings();
                    console.log('通知が許可されました');
                    await this.showTestNotification();
                } else {
                    console.log('通知が拒否されました:', permission);
                    alert('通知が許可されませんでした。\n\n🔧 Android設定で確認してください：\n\n1️⃣ Android設定 > アプリ > ゴミ出し > 通知 > 許可\n2️⃣ Android設定 > アプリ > ゴミ出し > 通知 > 音とバイブレーション > ON\n3️⃣ Android設定 > 音 > デフォルトの通知音 > 設定確認');
                    return;
                }
            } catch (error) {
                console.error('通知許可エラー:', error);
                alert('通知許可でエラーが発生しました: ' + error.message);
                return;
            }
        } else {
            this.isEnabled = false;
            this.saveSettings();
            console.log('通知が無効になりました');
        }

        await this.updateUI();
    }

    async requestNotificationPermissionForPWA() {
        // Android PWA用の通知許可要求
        try {
            // まず標準的な方法を試す
            const permission = await Notification.requestPermission();
            console.log('標準的な許可要求結果:', permission);
            
            if (permission === 'granted') {
                return permission;
            }
            
            // Service Worker経由で再試行
            if (this.serviceWorkerRegistration) {
                console.log('Service Worker経由で通知許可を確認中...');
                // Service Workerが利用可能かチェック
                const swPermission = await this.serviceWorkerRegistration.pushManager.permissionState({
                    userVisibleOnly: true
                });
                console.log('Service Worker push permission:', swPermission);
                
                if (swPermission === 'granted') {
                    return 'granted';
                }
            }
            
            return permission;
        } catch (error) {
            console.error('PWA通知許可エラー:', error);
            throw error;
        }
    }

    updateTime(time) {
        this.notificationTime = time;
        this.saveSettings();
        this.updateUI();
    }

    saveSettings() {
        try {
            localStorage.setItem('notificationEnabled', this.isEnabled.toString());
            localStorage.setItem('notificationTime', this.notificationTime);
            if (this.lastNotificationDate) {
                localStorage.setItem('lastNotificationDate', this.lastNotificationDate);
            }
        } catch (e) {
            console.log('設定保存に失敗しました（メモリのみ）:', e);
        }
    }

    async updateUI() {
        const toggleBtn = document.getElementById('notificationToggle');
        const status = document.getElementById('notificationStatus');

        // 現在の通知許可状態を確認
        const currentPermission = Notification.permission;
        console.log('UI更新時の通知許可:', currentPermission);

        if (this.isEnabled && currentPermission === 'granted') {
            toggleBtn.textContent = '通知を無効にする';
            toggleBtn.classList.add('disabled');
            status.innerHTML = `✅ 通知が有効です（毎日 ${this.notificationTime} に通知）<br><small>🔊 音とバイブレーション付きで通知します<br>📅 年末年始の特別日程にも対応します<br>📱 Android設定でも通知が許可されていることを確認してください</small>`;
        } else {
            toggleBtn.textContent = '通知を有効にする';
            toggleBtn.classList.remove('disabled');
            
            if (currentPermission === 'denied') {
                status.innerHTML = '❌ 通知が拒否されています<br><small>📱 Android設定 > アプリ > ゴミ出し > 通知設定で許可してください</small>';
            } else {
                status.textContent = '通知が無効です';
            }
        }
    }

    async showTestNotification() {
        console.log('テスト通知送信中...');
        
        const testGarbage = getTodayGarbage(new Date());
        let title = '🗑️ テスト通知（特別日程対応版）';
        let body;
        
        if (testGarbage.length > 0) {
            const garbageNames = testGarbage.map(g => g.name).join('、');
            body = `📢 Android PWA通知が正常に動作しています！\n\n🗑️ 今日は${garbageNames}の日です\n📍 収集時間: 午後6時〜午後9時\n📅 年末年始やイレギュラー日程にも対応\n📱 音とバイブレーションのテスト中\n\nこの通知が見えて音が鳴れば設定完了です！`;
        } else {
            body = `📢 Android PWA通知が正常に動作しています！\n\n✅ 音とバイブレーションのテスト\n✅ 詳細情報の表示テスト\n📅 年末年始の特別日程対応\n📱 この通知が見えて音が鳴れば設定完了です！\n\n🗑️ 今日はゴミ出しの日ではありません`;
        }
        
        // Service Workerに通知指示を送信
        this.sendMessageToServiceWorker({
            type: 'TEST_NOTIFICATION'
        });
        
        // 直接通知も送信（フォールバック）
        try {
            if (this.serviceWorkerRegistration) {
                const options = createNotificationOptions(title, body, 'test-notification');
                await this.serviceWorkerRegistration.showNotification(title, options);
                console.log('テスト通知送信完了');
            }
        } catch (error) {
            console.error('通知送信エラー:', error);
            alert('通知送信でエラーが発生しました。\n\n📱 Android設定を確認してください：\n\n1️⃣ 設定 > アプリ > ゴミ出し > 通知 > 許可\n2️⃣ 設定 > アプリ > ゴミ出し > バッテリー > 最適化しない\n3️⃣ 設定 > 音 > 通知音 > 音量確認');
        }
    }

    checkNotificationTime() {
        if (!this.isEnabled || Notification.permission !== 'granted') return;

        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + 
                         now.getMinutes().toString().padStart(2, '0');
        const currentDate = now.toDateString();

        console.log('時間チェック:', currentTime, '設定時間:', this.notificationTime);

        if (currentTime === this.notificationTime && 
            this.lastNotificationDate !== currentDate) {
            
            console.log('通知時間になりました！');
            this.sendDailyNotification();
            this.lastNotificationDate = currentDate;
            this.saveSettings();
        }
    }

    async sendDailyNotification() {
        console.log('日次通知送信中...');
        
        // Service Workerに通知指示
        this.sendMessageToServiceWorker({
            type: 'CHECK_GARBAGE_NOW'
        });
        
        // 直接通知も送信（確実性向上）
        const today = new Date();
        const todayGarbage = getTodayGarbage(today);
        
        let title = '🗑️ 今日のゴミ出し情報';
        let body;

        if (todayGarbage.length > 0) {
            const garbageNames = todayGarbage.map(g => g.name).join('、');
            
            // 特別日程かどうかをチェック
            const isSpecial = specialScheduleManager.getSpecialSchedule(today) !== null;
            const specialNote = isSpecial ? '\n📅 ※特別日程が適用されています' : '';
            
            body = `【重要】今日は${garbageNames}の日です！${specialNote}\n\n📍 収集時間: 午後6時〜午後9時\n📍 場所: 指定の収集場所\n📍 袋: 指定袋を使用してください\n\n⏰ 忘れずに出しましょう！`;
        } else {
            const isSpecial = specialScheduleManager.getSpecialSchedule(today) !== null;
            const specialNote = isSpecial ? '\n📅 ※年末年始・祝日等の特別日程です' : '';
            
            body = `今日はゴミ出しの日ではありません。${specialNote}\n\n📅 次回のゴミ出し予定を確認してください。`;
        }

        try {
            if (this.serviceWorkerRegistration) {
                const options = createNotificationOptions(title, body, 'daily-reminder');
                await this.serviceWorkerRegistration.showNotification(title, options);
            }
            console.log('日次通知送信完了');
        } catch (error) {
            console.error('日次通知送信エラー:', error);
        }
    }

    // アプリ終了時の処理
    onAppClose() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Service Workerに通知スケジュール指示
        if (this.isEnabled) {
            this.sendMessageToServiceWorker({
                type: 'SCHEDULE_NOTIFICATION',
                time: this.notificationTime,
                message: 'ゴミ出し確認'
            });
        }
    }
}

// 特別日程管理UIクラス
class SpecialScheduleUI {
    constructor(manager) {
        this.manager = manager;
        this.setupUI();
    }

    setupUI() {
        // 特別日程管理ボタンの追加
        const container = document.querySelector('.container');
        const scheduleSection = document.createElement('div');
        scheduleSection.className = 'schedule-management-section';
        scheduleSection.innerHTML = `
            <div class="schedule-management">
                <h3>📅 特別日程管理</h3>
                <div class="schedule-controls">
                    <button class="schedule-button" id="updateScheduleBtn">最新情報を取得</button>
                    <button class="schedule-button" id="addSpecialDateBtn">特別日程を追加</button>
                    <button class="schedule-button" id="viewScheduleBtn">特別日程一覧</button>
                </div>
                <div id="specialScheduleList" class="special-schedule-list"></div>
                <div id="scheduleUpdateStatus" class="schedule-status"></div>
            </div>
        `;
        
        // 通知設定の後に挿入
        const notificationSection = document.querySelector('.notification-section');
        container.insertBefore(scheduleSection, notificationSection.nextSibling);

        // イベントリスナーの設定
        document.getElementById('updateScheduleBtn').addEventListener('click', () => this.updateSchedule());
        document.getElementById('addSpecialDateBtn').addEventListener('click', () => this.showAddDialog());
        document.getElementById('viewScheduleBtn').addEventListener('click', () => this.showScheduleList());
    }

    async updateSchedule() {
        const statusDiv = document.getElementById('scheduleUpdateStatus');
        statusDiv.innerHTML = '🔄 最新情報を取得中...';
        
        try {
            await this.manager.fetchLatestSchedule();
            statusDiv.innerHTML = '✅ 最新情報を取得しました';
            updateSpecialScheduleDisplay();
        } catch (error) {
            statusDiv.innerHTML = '❌ 最新情報の取得に失敗しました';
        }
        
        setTimeout(() => {
            statusDiv.innerHTML = '';
        }, 3000);
    }

    showAddDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'special-date-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h4>特別日程を追加</h4>
                <div class="form-group">
                    <label>日付:</label>
                    <input type="date" id="specialDate" min="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>ゴミ種別:</label>
                    <div class="checkbox-group">
                        <label><input type="checkbox" value="burnable"> 可燃ごみ</label>
                        <label><input type="checkbox" value="bottles-plastic"> びん類・プラスチック類</label>
                        <label><input type="checkbox" value="cans-metal"> 缶・金属類・その他</label>
                        <label><input type="checkbox" value="pet-bottles"> ペットボトル</label>
                        <label><input type="checkbox" value="none"> 収集なし</label>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button onclick="this.closest('.special-date-dialog').remove()">キャンセル</button>
                    <button onclick="specialScheduleUI.addSpecialDate()">追加</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
    }

    addSpecialDate() {
        const dateInput = document.getElementById('specialDate');
        const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
        
        if (!dateInput.value) {
            alert('日付を選択してください');
            return;
        }

        const types = [];
        checkboxes.forEach(cb => {
            if (cb.value !== 'none') {
                const typeMap = {
                    'burnable': { type: 'burnable', name: '可燃ごみ' },
                    'bottles-plastic': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
                    'cans-metal': { type: 'cans-metal', name: '缶・金属類・その他' },
                    'pet-bottles': { type: 'pet-bottles', name: 'ペットボトル' }
                };
                types.push(typeMap[cb.value]);
            }
        });

        this.manager.setSpecialDate(dateInput.value, types);
        document.querySelector('.special-date-dialog').remove();
        updateSpecialScheduleDisplay();
        
        alert('特別日程を追加しました');
    }

    showScheduleList() {
        const specialDates = this.manager.getAllSpecialDates()
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (specialDates.length === 0) {
            alert('特別日程は設定されていません');
            return;
        }

        const dialog = document.createElement('div');
        dialog.className = 'schedule-list-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h4>特別日程一覧</h4>
                <div class="schedule-list">
                    ${specialDates.map(item => {
                        const date = new Date(item.date);
                        const dateStr = date.toLocaleDateString('ja-JP');
                        const typeNames = item.types.map(t => t.name).join('、') || '収集なし';
                        return `
                            <div class="schedule-item">
                                <span>${dateStr}: ${typeNames}</span>
                                <button onclick="specialScheduleUI.removeSpecialDate('${item.date}')">削除</button>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="dialog-buttons">
                    <button onclick="this.closest('.schedule-list-dialog').remove()">閉じる</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
    }

    removeSpecialDate(dateString) {
        if (confirm('この特別日程を削除しますか？')) {
            this.manager.removeSpecialDate(dateString);
            document.querySelector('.schedule-list-dialog').remove();
            updateSpecialScheduleDisplay();
            this.showScheduleList();
        }
    }
}

// グローバル変数
let specialScheduleManager;
let specialScheduleUI;

// 初期化
updateCalendar();
setInterval(updateCalendar, 60000);

// 特別日程管理の初期化
specialScheduleManager = new SpecialScheduleManager();
specialScheduleUI = new SpecialScheduleUI(specialScheduleManager);

const pwaManager = new PWAManager();
const notificationManager = new NotificationManager();

// グローバルに設定（デバッグ用）
window.notificationManager = notificationManager;
window.specialScheduleManager = specialScheduleManager;
window.specialScheduleUI = specialScheduleUI;

// ページ離脱時の処理
window.addEventListener('beforeunload', () => {
    if (window.notificationManager) {
        window.notificationManager.onAppClose();
    }
});

// 定期的なスケジュール更新（1日1回）
setInterval(() => {
    if (Math.random() < 0.1) { // 10%の確率で実行（負荷軽減）
        specialScheduleManager.fetchLatestSchedule();
    }
}, 24 * 60 * 60 * 1000);