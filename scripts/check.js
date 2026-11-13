// すべての JavaScript ファイルの構文を確認する（npm run check / GitHub Actions で実行）
// 画面側（renderer）は index.html で読み込む順に 1 つにつなげても確認する。
// classic script はトップレベルの変数を全ファイルで共有するため、同じ名前の重複などもここで見つかる。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'src');
let failed = 0;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

function check(name, code) {
  try {
    new vm.Script(code, { filename: name });
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${e.message}`);
  }
}

const files = walk(root);
files.forEach(f => check(path.relative(root, f), fs.readFileSync(f, 'utf8')));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
scripts.forEach(s => { if (!fs.existsSync(path.join(root, s))) { failed++; console.error(`✗ index.html が読み込む ${s} がありません`); } });
check('index.html の全スクリプト（連結）', scripts.map(s => fs.readFileSync(path.join(root, s), 'utf8')).join('\n;\n'));

if (failed) {
  console.error(`\n${failed} 件のエラーがあります`);
  process.exit(1);
}
console.log(`✓ ${files.length} ファイルと index.html の読み込み順を確認しました`);
