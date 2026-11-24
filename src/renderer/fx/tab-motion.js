// ==========================================
// ★ 演出：タブの開閉の動き（CSS だけで作る演出の例）
// ==========================================
// kind: 'css' の演出は、有効な間 <body> に fx-<id> クラスが付くだけ。動きは styles.css の
// body.fx-tab-motion … に書く。小さな UI の動きを増やす時は、この形で 1 つずつ登録する。
FX.register({
    id: 'tab-motion',
    name: 'タブの開閉の動き',
    description: '上のタブバーで、タブを開く・閉じる時に小さく動きます',
    group: 'タブバー',
    kind: 'css',
    defaultEnabled: true,
    available: () => document.body.classList.contains('layout-top'),
    unavailableNote: 'タブを上に並べている時だけ使えます',
});
