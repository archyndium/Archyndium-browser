// 自動アップデート用の latest.yml を作る（GitHub Actions のリリース時に実行）
//   node scripts/update-info.js dist/ARCHYNDIUM-Browser-Setup-0.1.0.exe
//
// アプリ（electron-updater）は、GitHub Releases の latest.yml に書かれたファイル名・大きさ・SHA-512 を見て
// 新しい版をダウンロードし、中身が正しいかを確かめる。コード署名をするとインストーラーの中身が変わるので、
// 署名の「後」のファイルからこの情報を作り直す必要がある（electron-builder が作る latest.yml は署名前のもの）。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('使い方: node scripts/update-info.js <インストーラーの .exe>');
  process.exit(1);
}
const { version } = require('../package.json');
const name = path.basename(file);
const data = fs.readFileSync(file);
const sha512 = crypto.createHash('sha512').update(data).digest('base64');
const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${name}`,
  `    sha512: ${sha512}`,
  `    size: ${data.length}`,
  `path: ${name}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n');
const out = path.join(path.dirname(file), 'latest.yml');
fs.writeFileSync(out, yml);
console.log(`✓ ${out} を作りました（${name}、${(data.length / 1048576).toFixed(1)} MB）`);
