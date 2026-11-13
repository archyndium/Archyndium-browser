// アプリのアイコン一式を build/icon.svg から作る（npm run icons）
//
// アイコンを差し替える時は build/icon.svg（1024×1024、背景は透明）を置き換えて npm run icons を実行するだけ。
// 次のファイルが作り直される：
//   build/icon.png               … 1024×1024（README・Linux 用・元画像）
//   build/icon.ico               … Windows 用（16〜256px の 10 サイズ。小さいサイズも SVG から直接描くのでぼやけない）
//   build/appx/*.png             … Microsoft Store（MSIX）用のタイル・ロゴ（等倍と 200%、タスクバー用の透明版）
//   build/store-listing-300.png  … Store の掲載ページ用
//
// Electron の画面（Chromium）で SVG を描いて保存するので、追加のツールは要らない。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const SVG = path.join(BUILD, 'icon.svg');

// [出力先, 幅, 高さ, 絵の大きさ（短い辺に対する割合）]
const PNGS = [
  ['icon.png', 1024, 1024, 1],
  ['store-listing-300.png', 300, 300, 1],
];
for (const [scale, suffix] of [[1, ''], [2, '.scale-200']]) {
  PNGS.push(
    [`appx/StoreLogo${suffix}.png`, 50 * scale, 50 * scale, 0.9],
    [`appx/Square44x44Logo${suffix}.png`, 44 * scale, 44 * scale, 0.9],
    [`appx/SmallTile${suffix}.png`, 71 * scale, 71 * scale, 0.62],
    [`appx/Square150x150Logo${suffix}.png`, 150 * scale, 150 * scale, 0.62],
    [`appx/Wide310x150Logo${suffix}.png`, 310 * scale, 150 * scale, 0.62],
    [`appx/LargeTile${suffix}.png`, 310 * scale, 310 * scale, 0.62],
  );
}
// タスクバー・スタートメニュー用（unplated は背景の板なしで表示される版）
for (const s of [16, 24, 32, 48, 256]) {
  PNGS.push([`appx/Square44x44Logo.targetsize-${s}.png`, s, s, 1]);
  PNGS.push([`appx/Square44x44Logo.targetsize-${s}_altform-unplated.png`, s, s, 1]);
}
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

// 画面の中で SVG を指定の大きさに描き、PNG（base64）か生の RGBA を返す関数
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent"><script>
  window.draw = async (svgText, w, h, ratio, raw) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const side = Math.round(Math.min(w, h) * ratio);
    ctx.drawImage(img, Math.round((w - side) / 2), Math.round((h - side) / 2), side, side);
    if (!raw) return c.toDataURL('image/png').split(',')[1];
    const d = ctx.getImageData(0, 0, w, h).data;
    let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return btoa(s);
  };
</script>`;

// .ico を組み立てる。48px 以下は昔ながらの BMP 形式（互換性のため）、それより大きいものは PNG 形式で入れる
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  const blobs = [];
  let offset = 6 + dir.length;
  entries.forEach(({ size, png, rgba }, i) => {
    let data;
    if (size <= 48) {
      const info = Buffer.alloc(40);
      info.writeUInt32LE(40, 0); info.writeInt32LE(size, 4); info.writeInt32LE(size * 2, 8);
      info.writeUInt16LE(1, 12); info.writeUInt16LE(32, 14); info.writeUInt32LE(size * size * 4, 20);
      const pixels = Buffer.alloc(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const src = (y * size + x) * 4, dst = ((size - 1 - y) * size + x) * 4; // 下から上の順・BGRA
          pixels[dst] = rgba[src + 2]; pixels[dst + 1] = rgba[src + 1]; pixels[dst + 2] = rgba[src]; pixels[dst + 3] = rgba[src + 3];
        }
      }
      const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size); // 透明度は alpha で持つのでマスクは全部 0
      data = Buffer.concat([info, pixels, mask]);
    } else data = png;
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e); dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(data.length, e + 8); dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
    blobs.push(data);
  });
  return Buffer.concat([header, dir, ...blobs]);
}

app.whenReady().then(async () => {
  try {
    if (!fs.existsSync(SVG)) throw new Error('build/icon.svg がありません');
    const svg = fs.readFileSync(SVG, 'utf8');
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
    const draw = (w, h, ratio, raw = false) => win.webContents.executeJavaScript(`draw(${JSON.stringify(svg)}, ${w}, ${h}, ${ratio}, ${raw})`);

    fs.mkdirSync(path.join(BUILD, 'appx'), { recursive: true });
    for (const f of fs.readdirSync(path.join(BUILD, 'appx'))) if (f.endsWith('.png')) fs.rmSync(path.join(BUILD, 'appx', f));
    for (const [file, w, h, ratio] of PNGS) fs.writeFileSync(path.join(BUILD, file), Buffer.from(await draw(w, h, ratio), 'base64'));

    const entries = [];
    for (const size of ICO_SIZES) {
      entries.push({ size, png: Buffer.from(await draw(size, size, 1), 'base64'), rgba: Buffer.from(await draw(size, size, 1, true), 'base64') });
    }
    fs.writeFileSync(path.join(BUILD, 'icon.ico'), buildIco(entries));
    console.log(`✓ アイコンを作りました：PNG ${PNGS.length} 枚、icon.ico（${ICO_SIZES.join(' / ')} px）`);
    app.exit(0);
  } catch (e) {
    console.error('✗', e.message);
    app.exit(1);
  }
});
