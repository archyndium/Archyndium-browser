// --- パネル・UI操作 ---
const commandCenter = document.getElementById('command-center');
const toolIcons = document.querySelectorAll('.tool-icon');
const panels = document.querySelectorAll('.panel-content');
toolIcons.forEach(icon => {
  icon.addEventListener('click', function() {
    this.style.transform = 'scale(0.85)'; setTimeout(() => this.style.transform = 'scale(1)', 150);
    const targetPanelId = this.getAttribute('data-panel');
    if (this.classList.contains('active')) { 
        commandCenter.classList.toggle('collapsed'); 
    } 
    else {
      toolIcons.forEach(i => i.classList.remove('active')); this.classList.add('active');
      panels.forEach(p => p.classList.remove('active')); document.getElementById(targetPanelId).classList.add('active');
      commandCenter.classList.remove('collapsed');
    }
  });
});

document.addEventListener('click', function(e) {
  if (e.target.closest('.edit-group-btn') || e.target.closest('.add-tab-btn') || e.target.closest('#bookmark-popup') || e.target.closest('#btn-bookmark') || e.target.closest('.lyrics-panel') || e.target.closest('#btn-lyrics') || e.target.closest('.bm-folder-list')) return;

  const card = e.target.closest('.tab-card');
  if (card) {
    if (card.classList.contains('theme-btn') || card.id === 'btn-mock-download') return;

    if (card.hasAttribute('data-tab-id')) {
      if (card.closest('#panel-tabs')) {
        document.querySelectorAll('#panel-tabs .tab-card').forEach(t => t.classList.remove('active'));
        card.classList.add('active');
      }
      switchTab(card.getAttribute('data-tab-id'));
    } 
    else if (card.hasAttribute('data-url')) {
      if(activeTabId) {
        // 修正：未定義の変数を使わず、カードの属性からURLを取得する
        if (webviews[activeTabId]) webviews[activeTabId].src = card.getAttribute('data-url');
        card.style.transform = 'scale(0.97)'; setTimeout(() => card.style.transform = 'scale(1)', 100);
      }
    }
  } 
  else if (e.target.closest('.pin-icon[data-url]')) {
    // 修正：ピン留めクリック時も直接webviewのURLを書き換える
    if(activeTabId && webviews[activeTabId]) {
        webviews[activeTabId].src = e.target.closest('.pin-icon').getAttribute('data-url');
    }
  }
});
