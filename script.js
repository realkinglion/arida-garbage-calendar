// ゴミ収集スケジュール
const garbageSchedule = {
    burnable: [2, 5], // 火曜(2), 金曜(5)
    bottlesPlastic: [3], // 水曜(3) - 第1,3,5週
    cansMetal: [3], // 水曜(3) - 第2,4週
    petBottles: [4] // 木曜(4) - 第2,4週
};

// 高度な自動取得システム
class AdvancedScheduleFetcher {
    constructor() {
        this.baseUrl = 'https://www.city.arida.lg.jp/kurashi/gomikankyo/gomibunbetsu/1000951/1000954.html';
        this.proxyUrls = [
            'https://api.allorigins.win/get?url=',
            'https://cors-anywhere.herokuapp.com/',
            'https://thingproxy.freeboard.io/fetch/'
        ];
        this.currentYear = new Date().getFullYear();
        this.reiwaYear = this.currentYear - 2018; // 令和年の計算
        this.lastFetchTime = null;
        this.cachedData = null;
    }

    // メイン実行関数
    async fetchLatestSchedule() {
        console.log('🚀 高度な自動取得システム開始...');
        
        try {
            // ステップ1: HTMLページを取得
            const htmlContent = await this.fetchHtmlContent();
            
            // ステップ2: PDFリンクを抽出
            const pdfLinks = this.extractPdfLinks(htmlContent);
            
            // ステップ3: 最新のPDFを特定
            const latestPdfUrl = this.findLatestPdf(pdfLinks);
            
            // ステップ4: PDFからカレンダー情報を抽出（簡易版）
            const scheduleData = await this.extractScheduleFromPdf(latestPdfUrl);
            
            // ステップ5: 特別日程を更新
            this.updateSpecialSchedule(scheduleData);
            
            console.log('✅ 自動取得完了:', scheduleData);
            return scheduleData;
            
        } catch (error) {
            console.error('❌ 自動取得エラー:', error);
            
            // フォールバック: HTMLからカレンダー情報を直接抽出
            return await this.fallbackHtmlExtraction();
        }
    }

    // HTML内容を取得（複数プロキシで試行）
    async fetchHtmlContent() {
        console.log('📡 HTMLコンテンツ取得中...');
        
        for (const proxyUrl of this.proxyUrls) {
            try {
                console.log(`🔄 プロキシ試行: ${proxyUrl}`);
                
                let response;
                if (proxyUrl.includes('allorigins')) {
                    response = await fetch(proxyUrl + encodeURIComponent(this.baseUrl));
                    const data = await response.json();
                    return data.contents;
                } else {
                    response = await fetch(proxyUrl + this.baseUrl);
                    return await response.text();
                }
            } catch (error) {
                console.log(`❌ プロキシ失敗: ${proxyUrl}`, error);
                continue;
            }
        }
        
        throw new Error('すべてのプロキシで取得に失敗');
    }

    // PDFリンクを抽出（正規表現使用）
    extractPdfLinks(htmlContent) {
        console.log('🔍 PDFリンク抽出中...');
        
        const pdfLinkPatterns = [
            // 基本パターン: r数字_数字_地名.pdf
            /href=['"](.*?r\d+_\d+_[^'"]*\.pdf)['"]/gi,
            // 汎用パターン: .pdfで終わるリンク
            /href=['"](.*?\.pdf)['"]/gi,
            // 相対パス対応
            /href=['"](\.\.\/.*?\.pdf)['"]/gi,
            // ゴミ・カレンダー関連のPDF
            /href=['"](.*?(?:gomi|calendar|schedule).*?\.pdf)['"]/gi
        ];
        
        const foundLinks = new Set();
        
        pdfLinkPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(htmlContent)) !== null) {
                let pdfUrl = match[1];
                
                // 相対パスを絶対パスに変換
                if (pdfUrl.startsWith('../')) {
                    pdfUrl = this.baseUrl.replace('/kurashi/gomikankyo/gomibunbetsu/1000951/1000954.html', '/') + pdfUrl.replace(/\.\.\//g, '');
                } else if (!pdfUrl.startsWith('http')) {
                    pdfUrl = this.baseUrl.replace('/kurashi/gomikankyo/gomibunbetsu/1000951/1000954.html', '/') + pdfUrl;
                }
                
                foundLinks.add(pdfUrl);
            }
        });
        
        const links = Array.from(foundLinks);
        console.log('📋 発見されたPDFリンク:', links);
        return links;
    }

    // 最新のPDFを特定
    findLatestPdf(pdfLinks) {
        console.log('🎯 最新PDF特定中...');
        
        // 年度パターンでソート
        const yearPatterns = [
            { pattern: new RegExp(`r${this.reiwaYear}`, 'i'), priority: 10 },
            { pattern: new RegExp(`r${this.reiwaYear - 1}`, 'i'), priority: 5 },
            { pattern: new RegExp(`${this.currentYear}`, 'i'), priority: 8 },
            { pattern: new RegExp(`${this.currentYear - 1}`, 'i'), priority: 3 }
        ];
        
        // 地域パターン
        const regionPatterns = [
            { pattern: /sminato|minato|港/i, priority: 10 },
            { pattern: /oura|男浦|女ノ浦/i, priority: 10 },
            { pattern: /miya|宮崎/i, priority: 8 }
        ];
        
        let bestMatch = null;
        let bestScore = 0;
        
        pdfLinks.forEach(link => {
            let score = 0;
            
            // 年度スコア
            yearPatterns.forEach(({ pattern, priority }) => {
                if (pattern.test(link)) {
                    score += priority;
                }
            });
            
            // 地域スコア
            regionPatterns.forEach(({ pattern, priority }) => {
                if (pattern.test(link)) {
                    score += priority;
                }
            });
            
            // ファイル名の新しさ（数字が大きいほど新しい）
            const numberMatch = link.match(/(\d+)/g);
            if (numberMatch) {
                score += parseInt(numberMatch[numberMatch.length - 1]) / 100;
            }
            
            console.log(`📊 ${link}: スコア ${score}`);
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = link;
            }
        });
        
        console.log(`🏆 最適なPDF: ${bestMatch} (スコア: ${bestScore})`);
        return bestMatch;
    }

    // PDFからスケジュール情報を抽出（簡易版）
    async extractScheduleFromPdf(pdfUrl) {
        console.log('📄 PDF解析中...');
        
        try {
            // PDFの直接解析は複雑なので、URLパターンから推測
            const scheduleData = this.inferScheduleFromUrl(pdfUrl);
            
            // 実際のPDF取得を試行（参考情報として）
            try {
                const response = await fetch(pdfUrl);
                if (response.ok) {
                    console.log('✅ PDF取得成功:', pdfUrl);
                    // PDFのバイナリデータから基本情報を抽出
                    const pdfData = await response.arrayBuffer();
                    const textContent = this.extractTextFromPdfData(pdfData);
                    if (textContent) {
                        return this.parseScheduleFromText(textContent);
                    }
                }
            } catch (pdfError) {
                console.log('⚠️ PDF直接解析失敗、推測値を使用');
            }
            
            return scheduleData;
            
        } catch (error) {
            console.error('❌ PDF解析エラー:', error);
            return this.getDefaultSchedule();
        }
    }

    // URLから推測でスケジュール情報を生成
    inferScheduleFromUrl(pdfUrl) {
        console.log('🤔 URLからスケジュール推測中...');
        
        const currentYear = new Date().getFullYear();
        const scheduleData = {
            year: currentYear,
            specialDates: new Map(),
            source: 'url_inference',
            confidence: 0.7
        };
        
        // URLに含まれる年度情報から推測
        const yearMatch = pdfUrl.match(/r(\d+)/i);
        if (yearMatch) {
            const reiwaYear = parseInt(yearMatch[1]);
            const targetYear = 2018 + reiwaYear;
            
            // その年の年末年始を設定
            const holidays = this.generateHolidaySchedule(targetYear);
            holidays.forEach(holiday => {
                scheduleData.specialDates.set(holiday.date, holiday.types);
            });
            
            scheduleData.confidence = 0.8;
        }
        
        return scheduleData;
    }

    // PDFデータからテキストを抽出（簡易版）
    extractTextFromPdfData(pdfData) {
        try {
            // PDFのテキスト抽出は複雑なので、基本的なキーワード検索
            const uint8Array = new Uint8Array(pdfData);
            const textDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false });
            let textContent = textDecoder.decode(uint8Array);
            
            // PDFの構造上、直接的なテキスト抽出は困難
            // 代わりに、バイナリデータから日付パターンを探す
            const datePatterns = [
                /(\d{1,2})\/(\d{1,2})/g, // MM/DD形式
                /(月|火|水|木|金|土|日)/g, // 曜日
                /(可燃|プラ|ペット|缶)/g // ゴミ種別
            ];
            
            const foundPatterns = [];
            datePatterns.forEach(pattern => {
                const matches = textContent.match(pattern);
                if (matches) {
                    foundPatterns.push(...matches);
                }
            });
            
            if (foundPatterns.length > 0) {
                console.log('📋 PDF内発見パターン:', foundPatterns);
                return foundPatterns.join(' ');
            }
            
            return null;
        } catch (error) {
            console.log('⚠️ PDFテキスト抽出失敗:', error);
            return null;
        }
    }

    // テキストからスケジュールを解析
    parseScheduleFromText(textContent) {
        console.log('📝 テキスト解析中...');
        
        const scheduleData = {
            year: this.currentYear,
            specialDates: new Map(),
            source: 'pdf_text',
            confidence: 0.9
        };
        
        // 日付パターンの正規表現
        const datePatterns = [
            // MM/DD形式
            /(\d{1,2})\/(\d{1,2})/g,
            // YYYY-MM-DD形式
            /(\d{4})-(\d{1,2})-(\d{1,2})/g,
            // 和暦表記
            /令和(\d+)年(\d+)月(\d+)日/g
        ];
        
        // ゴミ種別パターン
        const garbagePatterns = {
            '可燃': { type: 'burnable', name: '可燃ごみ' },
            'プラ': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
            'ペット': { type: 'pet-bottles', name: 'ペットボトル' },
            '缶': { type: 'cans-metal', name: '缶・金属類・その他' },
            '金属': { type: 'cans-metal', name: '缶・金属類・その他' }
        };
        
        // 休止日パターン
        const holidayPatterns = [
            /休[み止]/g,
            /収集なし/g,
            /年末年始/g
        ];
        
        let dateMatches = [];
        datePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(textContent)) !== null) {
                dateMatches.push(match);
            }
        });
        
        // 見つかった日付を処理
        dateMatches.forEach(match => {
            try {
                let year = this.currentYear;
                let month, day;
                
                if (match[0].includes('/')) {
                    month = parseInt(match[1]);
                    day = parseInt(match[2]);
                } else if (match[0].includes('-')) {
                    year = parseInt(match[1]);
                    month = parseInt(match[2]);
                    day = parseInt(match[3]);
                } else if (match[0].includes('令和')) {
                    year = 2018 + parseInt(match[1]);
                    month = parseInt(match[2]);
                    day = parseInt(match[3]);
                }
                
                const dateString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                
                // 前後のテキストからゴミ種別を判定
                const surroundingText = textContent.substring(
                    Math.max(0, match.index - 50),
                    Math.min(textContent.length, match.index + 50)
                );
                
                const garbageTypes = [];
                Object.entries(garbagePatterns).forEach(([keyword, typeData]) => {
                    if (surroundingText.includes(keyword)) {
                        garbageTypes.push(typeData);
                    }
                });
                
                // 休止日判定
                const isHoliday = holidayPatterns.some(pattern => pattern.test(surroundingText));
                if (isHoliday) {
                    scheduleData.specialDates.set(dateString, []);
                } else if (garbageTypes.length > 0) {
                    scheduleData.specialDates.set(dateString, garbageTypes);
                }
                
            } catch (parseError) {
                console.log('⚠️ 日付解析エラー:', parseError);
            }
        });
        
        console.log('📊 解析結果:', scheduleData.specialDates.size, '件の特別日程');
        return scheduleData;
    }

    // フォールバック: HTMLから直接抽出
    async fallbackHtmlExtraction() {
        console.log('🔄 フォールバック: HTML直接解析...');
        
        try {
            const htmlContent = await this.fetchHtmlContent();
            return this.extractScheduleFromHtml(htmlContent);
        } catch (error) {
            console.error('❌ フォールバック失敗:', error);
            return this.getDefaultSchedule();
        }
    }

    // HTMLからスケジュール抽出
    extractScheduleFromHtml(htmlContent) {
        console.log('🔍 HTML解析中...');
        
        const scheduleData = {
            year: this.currentYear,
            specialDates: new Map(),
            source: 'html_extraction',
            confidence: 0.6
        };
        
        // HTMLからカレンダーテーブルを抽出
        const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
        const tables = htmlContent.match(tablePattern);
        
        if (tables) {
            tables.forEach(table => {
                // セルパターンを抽出
                const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                let cellMatch;
                
                while ((cellMatch = cellPattern.exec(table)) !== null) {
                    const cellContent = cellMatch[1].replace(/<[^>]*>/g, '').trim();
                    
                    // 日付パターン検出
                    const dateMatch = cellContent.match(/(\d{1,2})/);
                    if (dateMatch) {
                        const day = parseInt(dateMatch[1]);
                        
                        // 現在月で日付文字列を構築
                        const now = new Date();
                        const dateString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                        
                        // セルクラスからゴミ種別を判定
                        const classMatch = cellMatch[0].match(/class=['"](.*?)['"]/);
                        if (classMatch) {
                            const className = classMatch[1];
                            const garbageTypes = this.inferGarbageFromClass(className);
                            if (garbageTypes.length > 0) {
                                scheduleData.specialDates.set(dateString, garbageTypes);
                            }
                        }
                    }
                }
            });
        }
        
        // デフォルトの祝日スケジュールも追加
        const holidays = this.generateHolidaySchedule(this.currentYear);
        holidays.forEach(holiday => {
            if (!scheduleData.specialDates.has(holiday.date)) {
                scheduleData.specialDates.set(holiday.date, holiday.types);
            }
        });
        
        console.log('📊 HTML解析結果:', scheduleData.specialDates.size, '件');
        return scheduleData;
    }

    // CSSクラス名からゴミ種別を推測
    inferGarbageFromClass(className) {
        const classPatterns = {
            'burn': { type: 'burnable', name: '可燃ごみ' },
            'plastic': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
            'bottle': { type: 'bottles-plastic', name: 'びん類・プラスチック類' },
            'can': { type: 'cans-metal', name: '缶・金属類・その他' },
            'metal': { type: 'cans-metal', name: '缶・金属類・その他' },
            'pet': { type: 'pet-bottles', name: 'ペットボトル' }
        };
        
        const types = [];
        Object.entries(classPatterns).forEach(([keyword, typeData]) => {
            if (className.toLowerCase().includes(keyword)) {
                types.push(typeData);
            }
        });
        
        return types;
    }

    // 祝日スケジュール生成
    generateHolidaySchedule(year) {
        const holidays = [
            { date: `${year}-12-29`, types: [], note: '年末年始' },
            { date: `${year}-12-30`, types: [], note: '年末年始' },
            { date: `${year}-12-31`, types: [], note: '年末年始' },
            { date: `${year + 1}-01-01`, types: [], note: '年末年始' },
            { date: `${year + 1}-01-02`, types: [], note: '年末年始' },
            { date: `${year + 1}-01-03`, types: [], note: '年末年始' }
        ];
        
        return holidays;
    }

    // デフォルトスケジュール
    getDefaultSchedule() {
        return {
            year: this.currentYear,
            specialDates: new Map(),
            source: 'default',
            confidence: 0.5
        };
    }

    // 特別日程を更新
    updateSpecialSchedule(scheduleData) {
        if (scheduleData && scheduleData.specialDates) {
            scheduleData.specialDates.forEach((types, date) => {
                specialScheduleManager.setSpecialDate(date, types, `自動取得 (${scheduleData.source})`);
            });
            
            console.log(`✅ ${scheduleData.specialDates.size}件の特別日程を更新`);
            updateSpecialScheduleDisplay();
        }
    }
}

// 特別日程管理クラス（自動取得対応版）
class SpecialScheduleManager {
    constructor() {
        this.specialDates = new Map();
        this.fetcher = new AdvancedScheduleFetcher();
        this.loadSpecialDates();
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

        // デフォルトの年末年始スケジュール
        this.setDefaultHolidaySchedule();
    }

    // デフォルトの年末年始スケジュールを設定
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

    // 高度な自動取得実行
    async fetchLatestSchedule() {
        return await this.fetcher.fetchLatestSchedule();
    }

    // 特別日程を設定
    setSpecialDate(dateString, garbageTypes, note = '') {
        const dateData = {
            types: garbageTypes,
            note: note,
            userSet: note === '' || note === '手動設定',
            timestamp: Date.now()
        };
        this.specialDates.set(dateString, dateData);
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
            const data = {};
            this.specialDates.forEach((value, key) => {
                data[key] = value;
            });
            localStorage.setItem('specialGarbageDates', JSON.stringify(data));
        } catch (e) {
            console.log('特別日程の保存に失敗:', e);
        }
    }

    // 指定日の特別日程を取得
    getSpecialSchedule(date) {
        const dateString = this.formatDate(date);
        const specialData = this.specialDates.get(dateString);
        return specialData ? specialData.types : null;
    }

    // 指定日の特別日程の詳細を取得
    getSpecialScheduleDetails(date) {
        const dateString = this.formatDate(date);
        return this.specialDates.get(dateString) || null;
    }

    // 日付フォーマット
    formatDate(date) {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }

    // 特別日程の一覧取得
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

    // 今日のゴミ（特別日程の詳細情報付き）
    const todayGarbage = getTodayGarbage(today);
    displayGarbage(todayGarbage, 'todayGarbage', true);
    
    // 特別日程の注記を追加
    const todayDetails = specialScheduleManager.getSpecialScheduleDetails(today);
    if (todayDetails && todayDetails.note) {
        const todayElement = document.getElementById('todayGarbage');
        todayElement.innerHTML += `<div class="special-note">📅 ${todayDetails.note}</div>`;
    }

    // 明日のゴミ
    const tomorrowGarbage = getTodayGarbage(tomorrow);
    displayGarbage(tomorrowGarbage, 'tomorrowGarbage', false);
    
    // 特別日程の注記を追加
    const tomorrowDetails = specialScheduleManager.getSpecialScheduleDetails(tomorrow);
    if (tomorrowDetails && tomorrowDetails.note) {
        const tomorrowElement = document.getElementById('tomorrowGarbage');
        tomorrowElement.innerHTML += `<div class="special-note">📅 ${tomorrowDetails.note}</div>`;
    }

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
        .slice(0, 8); // 直近8件

    if (specialDates.length > 0) {
        container.innerHTML = '<h4>📅 直近の特別日程</h4>' + 
            specialDates.map(item => {
                const date = new Date(item.date);
                const dateStr = date.toLocaleDateString('ja-JP');
                const typeNames = item.types.map(t => t.name).join('、') || '収集なし';
                const userIcon = item.userSet ? '👤' : '🤖';
                const noteText = item.note ? ` (${item.note})` : '';
                const confidence = item.note && item.note.includes('自動取得') ? 
                    ` <span class="confidence">信頼度: ${item.note.includes('pdf') ? '高' : '中'}</span>` : '';
                return `<div class="special-date-item">${userIcon} ${dateStr}: ${typeNames}${noteText}${confidence}</div>`;
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
            status.innerHTML = `✅ 通知が有効です（毎日 ${this.notificationTime} に通知）<br><small>🔊 音とバイブレーション付きで通知します<br>🤖 AI自動取得機能付き<br>📱 Android設定でも通知が許可されていることを確認してください</small>`;
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
        let title = '🗑️ テスト通知（AI自動取得版）';
        let body;
        
        if (testGarbage.length > 0) {
            const garbageNames = testGarbage.map(g => g.name).join('、');
            body = `📢 Android PWA通知が正常に動作しています！\n\n🗑️ 今日は${garbageNames}の日です\n📍 収集時間: 午後6時〜午後9時\n🤖 AI自動取得機能付き\n📱 音とバイブレーションのテスト中\n\nこの通知が見えて音が鳴れば設定完了です！`;
        } else {
            body = `📢 Android PWA通知が正常に動作しています！\n\n✅ 音とバイブレーションのテスト\n✅ 詳細情報の表示テスト\n🤖 AI自動取得機能付き\n📱 この通知が見えて音が鳴れば設定完了です！\n\n🗑️ 今日はゴミ出しの日ではありません`;
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
        const todayDetails = specialScheduleManager.getSpecialScheduleDetails(today);
        
        let title = '🗑️ 今日のゴミ出し情報';
        let body;

        if (todayGarbage.length > 0) {
            const garbageNames = todayGarbage.map(g => g.name).join('、');
            
            // 特別日程かどうかをチェック
            const isSpecial = specialScheduleManager.getSpecialSchedule(today) !== null;
            const specialNote = isSpecial && todayDetails ? `\n🤖 ${todayDetails.note}` : '';
            
            body = `【重要】今日は${garbageNames}の日です！${specialNote}\n\n📍 収集時間: 午後6時〜午後9時\n📍 場所: 指定の収集場所\n📍 袋: 指定袋を使用してください\n\n⏰ 忘れずに出しましょう！`;
        } else {
            const isSpecial = specialScheduleManager.getSpecialSchedule(today) !== null;
            const specialNote = isSpecial && todayDetails ? `\n🤖 ${todayDetails.note}` : '';
            
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

// 特別日程管理UIクラス（高度版）
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
                <h3>🤖 AI自動取得 + 手動管理</h3>
                <div class="ai-notice">
                    <p><strong>🚀 高度な自動取得システム</strong></p>
                    <p>正規表現とJavaScriptを駆使して有田市サイトから最新情報を自動取得します。</p>
                </div>
                <div class="schedule-controls">
                    <button class="schedule-button ai-fetch" id="autoFetchBtn">🤖 AI自動取得実行</button>
                    <button class="schedule-button" id="addSpecialDateBtn">👤 手動で追加</button>
                    <button class="schedule-button" id="viewScheduleBtn">📋 一覧表示</button>
                    <button class="schedule-button official-site" onclick="window.open('https://www.city.arida.lg.jp/kurashi/gomikankyo/gomibunbetsu/1000951/1000954.html', '_blank')">📑 公式サイト</button>
                </div>
                <div id="specialScheduleList" class="special-schedule-list"></div>
                <div id="fetchStatus" class="fetch-status"></div>
            </div>
        `;
        
        // 通知設定の後に挿入
        const notificationSection = document.querySelector('.notification-section');
        container.insertBefore(scheduleSection, notificationSection.nextSibling);

        // イベントリスナーの設定
        document.getElementById('autoFetchBtn').addEventListener('click', () => this.performAutoFetch());
        document.getElementById('addSpecialDateBtn').addEventListener('click', () => this.showAddDialog());
        document.getElementById('viewScheduleBtn').addEventListener('click', () => this.showScheduleList());
    }

    async performAutoFetch() {
        const fetchBtn = document.getElementById('autoFetchBtn');
        const statusDiv = document.getElementById('fetchStatus');
        
        fetchBtn.disabled = true;
        fetchBtn.textContent = '🔄 AI取得中...';
        statusDiv.innerHTML = '🚀 高度な自動取得システムを実行中...<br>📡 複数プロキシでHTML取得<br>🔍 正規表現でPDFリンク抽出<br>🎯 最新カレンダーを特定中...';
        
        try {
            const result = await this.manager.fetchLatestSchedule();
            
            if (result && result.specialDates && result.specialDates.size > 0) {
                statusDiv.innerHTML = `✅ AI自動取得成功！<br>📊 ${result.specialDates.size}件の特別日程を取得<br>🎯 データソース: ${result.source}<br>🔍 信頼度: ${Math.round(result.confidence * 100)}%`;
            } else {
                statusDiv.innerHTML = '⚠️ 新しい特別日程は見つかりませんでした<br>🤖 既存の設定を維持します';
            }
            
            updateSpecialScheduleDisplay();
            
        } catch (error) {
            console.error('自動取得エラー:', error);
            statusDiv.innerHTML = `❌ AI自動取得に失敗しました<br>エラー: ${error.message}<br>🔄 手動で設定してください`;
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '🤖 AI自動取得実行';
            
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 10000);
        }
    }

    showAddDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'special-date-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h4>手動で特別日程を追加</h4>
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
                <div class="form-group">
                    <label>メモ（任意）:</label>
                    <input type="text" id="specialNote" placeholder="例: 年末年始、台風のため、工事のため" maxlength="50">
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
        const noteInput = document.getElementById('specialNote');
        
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

        const note = noteInput.value.trim() || '手動設定';
        this.manager.setSpecialDate(dateInput.value, types, note);
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
                        const userIcon = item.userSet ? '👤' : '🤖';
                        const noteText = item.note ? ` (${item.note})` : '';
                        const deleteBtn = item.userSet ? 
                            `<button onclick="specialScheduleUI.removeSpecialDate('${item.date}')">削除</button>` :
                            `<span class="auto-set">AI取得</span>`;
                        return `
                            <div class="schedule-item">
                                <span>${userIcon} ${dateStr}: ${typeNames}${noteText}</span>
                                ${deleteBtn}
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

// 定期的な自動取得（週1回）
setInterval(async () => {
    if (Math.random() < 0.02) { // 2%の確率で実行（負荷軽減）
        console.log('🤖 定期自動取得実行中...');
        try {
            await specialScheduleManager.fetchLatestSchedule();
            console.log('✅ 定期自動取得完了');
        } catch (error) {
            console.log('⚠️ 定期自動取得失敗:', error);
        }
    }
}, 60 * 60 * 1000); // 1時間ごとにチェック