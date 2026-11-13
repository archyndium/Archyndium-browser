// ==========================================
// ★ 起動処理（全モジュール読み込み後に実行される）
// ==========================================

// ▼ 初期化関数の修正：起動時にワークスペースをロードさせる
document.addEventListener('DOMContentLoaded', async () => {
  initDropZone(document.getElementById('tabs-container')); 
  initDropZone(document.getElementById('bookmarks-list')); 
  initDropZone(document.getElementById('btn-trash'));
  initDropZone(document.getElementById('workspace-grid')); // 追加
  
  loadWorkspaces(); // 追加
  loadBookmarks();
  
  applySavedTheme(); // ▼ 追加：前回選んだテーマ

  // ▼ 変更：前回のタブ・グループを復元。無ければ従来通り Google のタブ + Development グループ
  const session = await restoreSession();
  if (!session.hasTab) {
    // 別ウィンドウで開く URL・シークレット指定があればそれを使う（タブを別ウィンドウへ移動した時など）
    const initTab = await createNewTabElement(windowQuery.get('url') || getHomeUrl(), { isPrivate: windowQuery.get('private') === '1' });
    document.getElementById('tabs-container').prepend(initTab);
    // UIのレイアウト計算が完全に終了するまで 0.15秒 待ってからタブを配置する（座標ズレを解消）
    setTimeout(() => initTab.click(), 150);
  }
  if (!session.usedSession) {
    document.getElementById('tabs-container').appendChild(createGroupElement('Development', 0));
  }
  initSessionAutosave();

  initTabSleep(); // ▼ 追加：タブスリープ監視を開始
});

// ミニプレイヤーへの同期ループを開始（元コードでは履歴ロード直後に呼んでいたもの）
sendWaveformLoop();

// ▼ 追加：複数ウィンドウ対応。履歴・ブックマークなどは全ウィンドウで共有しているので、
//   別のウィンドウで変更されたら（storage イベント）読み直して表示を揃える
window.addEventListener('storage', (e) => {
  switch (e.key) {
    case 'archyndium_history': loadHistory(); break;
    case 'archyndium_bookmarks': loadBookmarks(); refreshBookmarkStar(); break;
    case 'archyndium_workspaces': loadWorkspaces(); break;
    case 'archyndium_downloads': if (typeof loadDownloads === 'function') loadDownloads(); break;
    case 'archyndium_notes': if (typeof loadNotes === 'function') loadNotes(); break;
    case 'archyndium_theme': applySavedTheme(); break;
    case 'archyndium_search_engine': updateOmnibarPlaceholder(); break;
  }
});
