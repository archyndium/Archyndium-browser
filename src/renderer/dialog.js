// ==========================================
// ★ 共通ダイアログ（確認・入力フォーム）
// ==========================================
// showConfirm({ title, message, confirmLabel, danger, dontAskLabel }) → Promise<{ ok, dontAsk }>
// showForm({ title, fields: [{ key, label, value, placeholder }], confirmLabel }) → Promise<values | null>
// Esc / 背景クリックでキャンセル、Enter で決定。

const dialogOverlay = document.getElementById('app-dialog-overlay');
const dialogBox = document.getElementById('app-dialog');
let dialogResolve = null;

function openDialog(html, onSubmit) {
    dialogBox.innerHTML = html;
    dialogOverlay.classList.add('show');
    dialogBox.classList.add('show');
    return new Promise((resolve) => {
        dialogResolve = (value) => {
            dialogResolve = null;
            dialogOverlay.classList.remove('show');
            dialogBox.classList.remove('show');
            resolve(value);
        };
        dialogBox.onclick = (e) => {
            const btn = e.target.closest('[data-dialog]');
            if (!btn) return;
            if (btn.getAttribute('data-dialog') === 'cancel') dialogResolve(null);
            else dialogResolve(onSubmit());
        };
        const first = dialogBox.querySelector('input[type="text"]') || dialogBox.querySelector('[data-dialog="ok"]');
        setTimeout(() => { first?.focus(); first?.select?.(); }, 30);
    });
}

function showConfirm({ title, message = '', confirmLabel = 'OK', danger = false, dontAskLabel = '' }) {
    return openDialog(`
        <div class="dlg-title">${escapeHtml(title)}</div>
        ${message ? `<div class="dlg-message">${message}</div>` : ''}
        ${dontAskLabel ? `<label class="dlg-check"><input type="checkbox" id="dlg-dont-ask"> ${escapeHtml(dontAskLabel)}</label>` : ''}
        <div class="dlg-actions">
          <div class="dlg-btn" data-dialog="cancel">キャンセル</div>
          <div class="dlg-btn primary ${danger ? 'danger' : ''}" data-dialog="ok">${escapeHtml(confirmLabel)}</div>
        </div>`, () => ({ ok: true, dontAsk: !!document.getElementById('dlg-dont-ask')?.checked }))
        .then(v => v || { ok: false, dontAsk: false });
}

function showForm({ title, fields, confirmLabel = '保存' }) {
    return openDialog(`
        <div class="dlg-title">${escapeHtml(title)}</div>
        ${fields.map(f => `
          <label class="dlg-field"><span>${escapeHtml(f.label)}</span>
            <input type="text" data-field="${f.key}" value="${escapeHtml(f.value || '')}" placeholder="${escapeHtml(f.placeholder || '')}" spellcheck="false">
          </label>`).join('')}
        <div class="dlg-actions">
          <div class="dlg-btn" data-dialog="cancel">キャンセル</div>
          <div class="dlg-btn primary" data-dialog="ok">${escapeHtml(confirmLabel)}</div>
        </div>`, () => Object.fromEntries([...dialogBox.querySelectorAll('[data-field]')].map(i => [i.getAttribute('data-field'), i.value.trim()])));
}

dialogOverlay.addEventListener('click', () => dialogResolve?.(null));
document.addEventListener('keydown', (e) => {
    if (!dialogResolve) return;
    if (e.key === 'Escape') { e.preventDefault(); dialogResolve(null); }
    else if (e.key === 'Enter') { e.preventDefault(); dialogBox.querySelector('[data-dialog="ok"]')?.click(); }
}, true);
