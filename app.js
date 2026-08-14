// 状態管理
let lines = [];

// DOM要素
const btnAddLine = document.getElementById('btn-add-line');
const btnRefresh = document.getElementById('btn-refresh');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const fileImport = document.getElementById('file-import');

// モーダル関連 (回線追加・編集)
const modalLine = document.getElementById('modal-line');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const formLine = document.getElementById('form-line');

// コンテナ・統計
const linesGrid = document.getElementById('lines-grid');
const emptyState = document.getElementById('empty-state');
const statTotalLines = document.getElementById('stat-total-lines');
const statWarningLines = document.getElementById('stat-warning-lines');
const toastContainer = document.getElementById('toast-container');

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadData();
});

// イベントリスナー設定
function setupEventListeners() {
    // 回線関連
    btnAddLine.addEventListener('click', () => openModal());
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);
    formLine.addEventListener('submit', handleFormSubmit);
    
    // 更新
    btnRefresh.addEventListener('click', () => {
        window.location.reload();
    });
    
    // モーダルの外側をクリックしたら閉じる
    window.addEventListener('click', (e) => {
        if (e.target === modalLine) {
            closeModal();
        }
    });

    // エクスポート・インポート
    btnExport.addEventListener('click', exportData);
    btnImport.addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', importData);
}

// データの読み込み
function loadData() {
    // サーバー連携を廃止し、localStorageのみで完結
    const data = localStorage.getItem('povo_manager_lines');
    if (data) {
        try {
            // オブジェクト形式と配列形式の両方に対応
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                lines = parsed;
            } else if (parsed && parsed.lines) {
                lines = parsed.lines;
            }
        } catch (e) {
            lines = [];
        }
    } else {
        lines = [];
    }
    render();
}

// データの保存
function saveData() {
    localStorage.setItem('povo_manager_lines', JSON.stringify(lines));
}

// カレンダー登録ファイル(.ics)の生成・ダウンロード
window.addToCalendar = function(lineId) {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    
    const { expiryDateStr } = calculateRemainingDays(line.lastToppingDate);
    const limitDate = new Date(expiryDateStr);
    
    // 30日前、7日前の日付を計算
    const date30DaysBefore = new Date(limitDate);
    date30DaysBefore.setDate(date30DaysBefore.getDate() - 30);
    
    const date7DaysBefore = new Date(limitDate);
    date7DaysBefore.setDate(date7DaysBefore.getDate() - 7);
    
    // iCalendar形式の作成用ヘルパー
    const formatICSDate = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    };
    
    // イベント終了日（翌日）
    const getNextDayStr = (dateObj) => {
        const next = new Date(dateObj);
        next.setDate(next.getDate() + 1);
        return formatICSDate(next);
    };

    const limitStr = formatICSDate(limitDate);
    const limitNextStr = getNextDayStr(limitDate);
    
    const day30Str = formatICSDate(date30DaysBefore);
    const day30NextStr = getNextDayStr(date30DaysBefore);
    
    const day7Str = formatICSDate(date7DaysBefore);
    const day7NextStr = getNextDayStr(date7DaysBefore);

    // .icsファイルの中身を生成
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//POVO Manager//JP',
        'CALSCALE:GREGORIAN',
        
        // 30日前イベント
        'BEGIN:VEVENT',
        `SUMMARY:【POVO期限30日前】${line.name}`,
        `DTSTART;VALUE=DATE:${day30Str}`,
        `DTEND;VALUE=DATE:${day30NextStr}`,
        `DESCRIPTION:POVOの有料トッピング購入期限まであと30日です。そろそろトッピングの購入を検討してください。`,
        'END:VEVENT',
        
        // 7日前イベント
        'BEGIN:VEVENT',
        `SUMMARY:【⚠️POVO期限7日前】${line.name}`,
        `DTSTART;VALUE=DATE:${day7Str}`,
        `DTEND;VALUE=DATE:${day7NextStr}`,
        `DESCRIPTION:POVOの有料トッピング購入期限まであと7日です。利用停止を防ぐためトッピングを購入してください。`,
        'END:VEVENT',
        
        // デッドライン当日イベント
        'BEGIN:VEVENT',
        `SUMMARY:【🚨POVO期限当日】${line.name}`,
        `DTSTART;VALUE=DATE:${limitStr}`,
        `DTEND;VALUE=DATE:${limitNextStr}`,
        `DESCRIPTION:POVOの有料トッピング購入期限当日です！至急トッピングを購入して利用停止を防いでください。`,
        'END:VEVENT',
        
        'END:VCALENDAR'
    ].join('\r\n');

    // Blobを作成してダウンロード
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `povo_calendar_${line.name}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('カレンダー登録ファイルを出力しました。開いてカレンダーに保存してください。');
};



// ヘルパー: 指定日数前の日付文字列(YYYY-MM-DD)を取得
function getPastDateString(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

// ヘルパー: 指定日数後の日付文字列(YYYY-MM-DD)を取得
function getFutureDateString(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// トースト通知を表示
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="material-icons-round">info</span>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 残り日数の計算ロジック
// POVOの180日ルール: 最終購入日から180日後までにトッピングが必要
function calculateRemainingDays(lastToppingDateStr) {
    const lastDate = new Date(lastToppingDateStr);
    const expiryDate = new Date(lastDate);
    expiryDate.setDate(expiryDate.getDate() + 180);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return {
        days: diffDays,
        expiryDateStr: expiryDate.toISOString().split('T')[0]
    };
}

// 日付フォーマット
function formatDate(dateStr) {
    if (!dateStr) return '未登録';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[0]}年${parts[1]}月${parts[2]}日`;
    }
    return dateStr;
}

// 電話番号フォーマット
function formatPhoneNumber(num) {
    if (!num) return '番号未登録';
    const cleaned = num.replace(/\D/g, '');
    if (cleaned.length === 11) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    return num;
}

// 描画処理
function render() {
    linesGrid.innerHTML = '';
    
    if (lines.length === 0) {
        emptyState.style.display = 'flex';
        linesGrid.style.display = 'none';
        statTotalLines.textContent = '0';
        statWarningLines.textContent = '0';
        return;
    }
    
    emptyState.style.display = 'none';
    linesGrid.style.display = 'grid';
    
    let warningCount = 0;
    
    lines.forEach(line => {
        // 常に一番大事な「180日ルール」をベースにする
        const { days: ruleDays, expiryDateStr: ruleExpiryDate } = calculateRemainingDays(line.lastToppingDate);
        
        // ステータスクラスの判定 (180日期限を基準にする)
        let statusClass = 'safe';
        if (ruleDays <= 7) {
            statusClass = 'danger';
        } else if (ruleDays <= 30) {
            statusClass = 'warning';
        }
        
        if (statusClass === 'danger' || statusClass === 'warning') {
            warningCount++;
        }

        // トッピング自体の期限情報を補助的に計算
        let toppingDaysInfo = '';
        if (line.toppingExpiry) {
            const expiryDate = new Date(line.toppingExpiry);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffTime = expiryDate.getTime() - today.getTime();
            const toppingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (toppingDays < 0) {
                toppingDaysInfo = `<span class="status-badge expired">トッピング期限切れ (0円運用中)</span>`;
            } else {
                toppingDaysInfo = `<span class="status-badge active">適用中トッピング: あと ${toppingDays}日</span>`;
            }
        } else {
            toppingDaysInfo = `<span class="status-badge none">適用中トッピングなし</span>`;
        }

        const card = document.createElement('div');
        card.className = 'line-card';
        card.innerHTML = `
            <div class="card-header">
                <div class="line-info">
                    <h3 class="line-name">${escapeHTML(line.name)}</h3>
                    <span class="phone-number">${escapeHTML(formatPhoneNumber(line.phoneNumber))}</span>
                </div>
                <div class="card-actions">
                    <button class="btn-icon" onclick="addToCalendar('${line.id}')" title="カレンダーに追加">
                        <span class="material-icons-round">calendar_today</span>
                    </button>
                    <button class="btn-icon" onclick="editLine('${line.id}')" title="編集">
                        <span class="material-icons-round">edit</span>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteLine('${line.id}')" title="削除">
                        <span class="material-icons-round">delete</span>
                    </button>
                </div>
            </div>
            
            <div class="card-body">
                <!-- 180日利用停止までの期限を主役に -->
                <div class="countdown-box ${statusClass}">
                    <div class="countdown-title">利用停止（180日未購入）まで</div>
                    <div class="countdown-days">
                        ${ruleDays >= 0 ? ruleDays : 0}<span>日${ruleDays < 0 ? '経過 (利用停止対象)' : '後'}</span>
                    </div>
                </div>
                
                <div class="status-row">
                    ${toppingDaysInfo}
                </div>
                
                <div class="date-details">
                    <div class="date-row">
                        <span>最終トッピング購入日:</span>
                        <span class="date-value">${formatDate(line.lastToppingDate)}</span>
                    </div>
                    <div class="date-row">
                        <span>次回トッピングデッドライン:</span>
                        <span class="date-value highlighted">${formatDate(ruleExpiryDate)}</span>
                    </div>
                    <div class="date-row">
                        <span>適用中トッピング期限:</span>
                        <span class="date-value">${line.toppingExpiry ? formatDate(line.toppingExpiry) : 'なし'}</span>
                    </div>
                </div>
                
                ${line.note ? `<div class="card-note">${escapeHTML(line.note)}</div>` : ''}
            </div>
        `;
        linesGrid.appendChild(card);
    });
    
    statTotalLines.textContent = lines.length;
    statWarningLines.textContent = warningCount;
}

// XSS対策用エスケープ
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// モーダルを開く
function openModal(lineId = null) {
    formLine.reset();
    document.getElementById('edit-line-id').value = '';
    
    if (lineId) {
        const line = lines.find(l => l.id === lineId);
        if (line) {
            document.getElementById('modal-title').textContent = '回線情報の編集';
            document.getElementById('edit-line-id').value = line.id;
            document.getElementById('input-line-name').value = line.name;
            document.getElementById('input-phone-number').value = line.phoneNumber || '';
            document.getElementById('input-last-topping-date').value = line.lastToppingDate;
            document.getElementById('input-topping-expiry').value = line.toppingExpiry || '';
            document.getElementById('input-note').value = line.note || '';
        }
    } else {
        document.getElementById('modal-title').textContent = '回線情報の追加';
        // デフォルトで今日の日付を最終トッピング日に入れておく
        document.getElementById('input-last-topping-date').value = new Date().toISOString().split('T')[0];
    }
    
    modalLine.classList.add('show');
}

// モーダルを閉じる
function closeModal() {
    modalLine.classList.remove('show');
}

// フォームの送信（追加・編集の反映）
function handleFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-line-id').value;
    const name = document.getElementById('input-line-name').value;
    const phoneNumber = document.getElementById('input-phone-number').value;
    const lastToppingDate = document.getElementById('input-last-topping-date').value;
    const toppingExpiry = document.getElementById('input-topping-expiry').value;
    const note = document.getElementById('input-note').value;
    
    if (id) {
        // 編集
        const index = lines.findIndex(l => l.id === id);
        if (index !== -1) {
            lines[index] = { ...lines[index], name, phoneNumber, lastToppingDate, toppingExpiry, note };
            showToast('回線情報を更新しました。');
        }
    } else {
        // 新規追加
        const newLine = {
            id: 'line_' + Date.now(),
            name,
            phoneNumber,
            lastToppingDate,
            toppingExpiry,
            note
        };
        lines.push(newLine);
        showToast('回線情報を追加しました。');
    }
    
    saveData();
    closeModal();
    render();
}

// 削除処理（グローバル関数にするためにwindowオブジェクトにアタッチ）
window.deleteLine = function(lineId) {
    if (confirm('この回線情報を削除してもよろしいですか？')) {
        lines = lines.filter(l => l.id !== lineId);
        saveData();
        render();
        showToast('回線情報を削除しました。');
    }
};

// 編集ボタン用（グローバル関数）
window.editLine = function(lineId) {
    openModal(lineId);
};

// エクスポート
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lines, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    downloadAnchor.setAttribute("download", `povo_manager_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('バックアップをエクスポートしました。');
}

// インポート
function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const importedLines = JSON.parse(evt.target.result);
            if (Array.isArray(importedLines)) {
                lines = importedLines;
                saveData();
                render();
                showToast('データを正常にインポートしました。');
            } else {
                showToast('無効なファイル形式です。');
            }
        } catch (err) {
            showToast('インポートに失敗しました。');
        }
    };
    reader.readAsText(file);
    // ファイル選択クリア
    fileImport.value = '';
}
