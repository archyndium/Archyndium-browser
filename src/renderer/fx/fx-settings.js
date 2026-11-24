// ==========================================
// ★ 設定画面：演出（FX.register された内容から自動で作る）
// ==========================================

function fxParamHtml(effectId, p, value) {
    const id = `fx-${effectId}-${p.key}`;
    if (p.type === 'range') {
        const shown = p.format ? p.format(value) : `${value}${p.unit || ''}`;
        return `<label class="fx-param" for="${id}"><span class="fx-param-label">${escapeHtml(p.label)}</span><output>${escapeHtml(shown)}</output>
            <input type="range" id="${id}" data-fx="${effectId}" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="${value}"></label>`;
    }
    if (p.type === 'select') {
        return `<div class="fx-param"><span class="fx-param-label">${escapeHtml(p.label)}</span>
            <div class="fx-seg">${p.options.map(([v, label]) => `<span class="fx-seg-btn${String(v) === String(value) ? ' on' : ''}" data-fx="${effectId}" data-key="${p.key}" data-value="${escapeHtml(String(v))}">${escapeHtml(label)}</span>`).join('')}</div></div>`;
    }
    if (p.type === 'toggle') {
        return `<div class="fx-param fx-param-toggle" data-fx="${effectId}" data-key="${p.key}" data-toggle="1">
            <span class="fx-param-label">${escapeHtml(p.label)}${p.sub ? `<small>${escapeHtml(p.sub)}</small>` : ''}</span>
            <span class="sp-switch${value ? ' on' : ''}" role="switch" aria-checked="${!!value}"></span></div>`;
    }
    if (p.type === 'action') {
        return `<span class="fx-action" data-fx="${effectId}" data-action="${p.key}">${escapeHtml(p.label)}</span>`;
    }
    return '';
}

function renderFxSettings() {
    const box = document.getElementById('fx-options');
    if (!box) return;
    const g = FX.globals();
    const os = FX.osReduced();
    let html = settingRow({ icon: '✦', label: '演出を使う', sub: 'オフにするとすべての演出を止めます', checked: g.master, attrs: 'data-fx-global="master"' })
        + settingRow({ icon: '◐', label: 'OS の「視差効果を減らす」に従う', sub: os ? 'いま OS の設定がオンのため、演出は止まっています' : 'OS の設定がオンの時は自動で止めます', checked: g.followOS, attrs: 'data-fx-global="followOS"' });

    const groups = new Map();
    FX.list().forEach(d => { const k = d.group || 'その他'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
    groups.forEach((list, name) => {
        html += `<div class="fx-group-title">${escapeHtml(name)}</div>`;
        list.forEach(d => {
            const s = FX.settingsOf(d.id);
            const unavailable = d.available && !d.available();
            const params = (d.settings || []).filter(p => !p.when || p.when(s));
            html += `<div class="fx-card${s.enabled ? ' on' : ''}${!g.master ? ' muted' : ''}">
                <div class="fx-card-head" data-fx-enable="${d.id}">
                    <div class="fx-card-text"><b>${escapeHtml(d.name)}</b><span>${escapeHtml(d.description || '')}</span>
                    ${unavailable && d.unavailableNote ? `<em>${escapeHtml(d.unavailableNote)}</em>` : ''}</div>
                    <span class="sp-switch${s.enabled ? ' on' : ''}" role="switch" aria-checked="${s.enabled}"></span>
                </div>
                ${s.enabled && params.length ? `<div class="fx-params">${params.map(p => fxParamHtml(d.id, p, s[p.key])).join('')}
                    <span class="fx-reset" data-fx-reset="${d.id}">初期値に戻す</span></div>` : ''}
            </div>`;
        });
    });
    box.innerHTML = html;
}

(function initFxSettings() {
    const panel = document.getElementById('panel-settings');
    panel.addEventListener('click', (e) => {
        const t = e.target;
        const gl = t.closest('[data-fx-global]');
        if (gl) { const k = gl.dataset.fxGlobal; FX.setGlobal(k, !FX.globals()[k]); renderFxSettings(); return; }
        const en = t.closest('[data-fx-enable]');
        if (en) { const id = en.dataset.fxEnable; FX.set(id, 'enabled', !FX.settingsOf(id).enabled); renderFxSettings(); return; }
        const seg = t.closest('.fx-seg-btn');
        if (seg) {
            const d = FX.list().find(x => x.id === seg.dataset.fx), p = d?.settings.find(x => x.key === seg.dataset.key);
            const raw = seg.dataset.value, v = typeof p?.default === 'number' ? Number(raw) : raw;
            FX.set(seg.dataset.fx, seg.dataset.key, v); renderFxSettings(); return;
        }
        const tg = t.closest('[data-toggle][data-fx]');
        if (tg) { FX.set(tg.dataset.fx, tg.dataset.key, !FX.settingsOf(tg.dataset.fx)[tg.dataset.key]); renderFxSettings(); return; }
        const act = t.closest('[data-action][data-fx]');
        if (act) { FX.action(act.dataset.fx, act.dataset.action); return; }
        const rs = t.closest('[data-fx-reset]');
        if (rs) { FX.reset(rs.dataset.fxReset); renderFxSettings(); }
    });
    // スライダーは動かしている間も反映（再描画はせず、数値の表示だけ更新）
    panel.addEventListener('input', (e) => {
        const r = e.target.closest('input[type=range][data-fx]'); if (!r) return;
        const d = FX.list().find(x => x.id === r.dataset.fx), p = d?.settings.find(x => x.key === r.dataset.key);
        const v = Number(r.value);
        FX.set(r.dataset.fx, r.dataset.key, v);
        const out = r.closest('.fx-param')?.querySelector('output');
        if (out && p) out.textContent = p.format ? p.format(v) : `${v}${p.unit || ''}`;
    });
    document.querySelector('.tool-icon[data-panel="panel-settings"]').addEventListener('click', renderFxSettings);
})();
