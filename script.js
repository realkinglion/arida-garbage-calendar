// ゴミ収集スケジュール
const garbageSchedule = {
    burnable: [2, 5], // 火曜(2), 金曜(5)
    bottlesPlastic: [3], // 水曜(3) - 第1,3,5週
    cansMetal: [3], // 水曜(3) - 第2,4週
    petBottles: [4] // 木曜(4) - 第2,4週
};

function getWeekOfMonth(date) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekday = firstDay.getDay();
    const offsetDate = date.getDate() + firstWeekday - 1;
    return Math.floor(offsetDate / 7) + 1;
}

function getTodayGarbage(date) {
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
                    alert('通知が許可されませんでした。\n\nAndroid設定で確認してください：\n1. アプリ設定 > 通知 > 許可\n2. Chrome設定 > サイト設定 > 通知');
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
            status.innerHTML = `通知が有効です（毎日 ${this.notificationTime} に通知）<br><small>Android設定でも通知が許可されていることを確認してください</small>`;
        } else {
            toggleBtn.textContent = '通知を有効にする';
            toggleBtn.classList.remove('disabled');
            
            if (currentPermission === 'denied') {
                status.innerHTML = '通知が拒否されています<br><small>Android設定 > アプリ > 通知設定で許可してください</small>';
            } else {
                status.textContent = '通知が無効です';
            }
        }
    }

    async showTestNotification() {
        console.log('テスト通知送信中...');
        
        // Service Workerに通知指示を送信
        this.sendMessageToServiceWorker({
            type: 'TEST_NOTIFICATION'
        });
        
        // 直接通知も送信（フォールバック）
        try {
            if (this.serviceWorkerRegistration) {
                await this.serviceWorkerRegistration.showNotification('🗑️ テスト通知', {
                    body: 'Android PWA通知テスト中...',
                    icon: './icon-192x192.png',
                    badge: './icon-64x64.png',
                    requireInteraction: true,
                    tag: 'test-notification',
                    vibrate: [200, 100, 200],
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('通知送信エラー:', error);
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
        let message;

        if (todayGarbage.length > 0) {
            const garbageNames = todayGarbage.map(g => g.name).join('、');
            message = `今日は${garbageNames}の日です！\n収集時間: 18:00〜21:00`;
        } else {
            message = '今日はゴミ出しの日ではありません。';
        }

        try {
            if (this.serviceWorkerRegistration) {
                await this.serviceWorkerRegistration.showNotification(title, {
                    body: message,
                    icon: './icon-192x192.png',
                    badge: './icon-64x64.png',
                    requireInteraction: true,
                    tag: 'daily-reminder',
                    vibrate: [200, 100, 200],
                    timestamp: Date.now()
                });
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

// 初期化
updateCalendar();
setInterval(updateCalendar, 60000);

const pwaManager = new PWAManager();
const notificationManager = new NotificationManager();

// グローバルに設定（デバッグ用）
window.notificationManager = notificationManager;

// ページ離脱時の処理
window.addEventListener('beforeunload', () => {
    if (window.notificationManager) {
        window.notificationManager.onAppClose();
    }
});