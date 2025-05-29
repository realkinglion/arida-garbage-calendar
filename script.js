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

// 通知機能
class NotificationManager {
    constructor() {
        this.isEnabled = localStorage.getItem('notificationEnabled') === 'true';
        this.notificationTime = localStorage.getItem('notificationTime') || '07:00';
        this.lastNotificationDate = localStorage.getItem('lastNotificationDate');
        this.init();
    }

    init() {
        const toggleBtn = document.getElementById('notificationToggle');
        const timeInput = document.getElementById('notificationTime');

        // 初期状態の設定
        timeInput.value = this.notificationTime;
        this.updateUI();

        // イベントリスナー
        toggleBtn.addEventListener('click', () => this.toggleNotification());
        timeInput.addEventListener('change', (e) => this.updateTime(e.target.value));

        // 定期チェックを開始（1分ごと）
        setInterval(() => this.checkNotificationTime(), 60000);
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
                localStorage.setItem('notificationEnabled', 'true');
                this.showTestNotification();
            } else {
                alert('通知が許可されませんでした。ブラウザの設定を確認してください。');
                return;
            }
        } else {
            this.isEnabled = false;
            localStorage.setItem('notificationEnabled', 'false');
        }

        this.updateUI();
    }

    updateTime(time) {
        this.notificationTime = time;
        localStorage.setItem('notificationTime', time);
        this.updateUI();
    }

    updateUI() {
        const toggleBtn = document.getElementById('notificationToggle');
        const status = document.getElementById('notificationStatus');

        if (this.isEnabled) {
            toggleBtn.textContent = '通知を無効にする';
            toggleBtn.classList.add('disabled');
            status.textContent = `通知が有効です（毎日 ${this.notificationTime} に通知）`;
        } else {
            toggleBtn.textContent = '通知を有効にする';
            toggleBtn.classList.remove('disabled');
            status.textContent = '通知が無効です';
        }
    }

    showTestNotification() {
        const testGarbage = getTodayGarbage(new Date());
        let message = 'テスト通知です。';
        
        if (testGarbage.length > 0) {
            const garbageNames = testGarbage.map(g => g.name).join('、');
            message += `\n今日は${garbageNames}の日です！`;
        } else {
            message += '\n今日はゴミ出しの日ではありません。';
        }

        new Notification('🗑️ ゴミ出しリマインダー', {
            body: message,
            icon: 'icon-192x192.png',
            requireInteraction: true
        });
    }

    checkNotificationTime() {
        if (!this.isEnabled) return;

        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + 
                         now.getMinutes().toString().padStart(2, '0');
        const currentDate = now.toDateString();

        if (currentTime === this.notificationTime && 
            this.lastNotificationDate !== currentDate) {
            
            this.sendDailyNotification();
            this.lastNotificationDate = currentDate;
            localStorage.setItem('lastNotificationDate', currentDate);
        }
    }

    sendDailyNotification() {
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

        new Notification(title, {
            body: message,
            icon: 'icon-192x192.png',
            requireInteraction: true
        });
    }
}

// 初期化
updateCalendar();
setInterval(updateCalendar, 60000);

const pwaManager = new PWAManager();
const notificationManager = new NotificationManager();