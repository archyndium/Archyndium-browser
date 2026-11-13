// THIRD_PARTY_NOTICES.md を作る（npm run notices）
// アプリに同梱される依存パッケージ（dependencies とその依存）のライセンスを一覧にし、ライセンス文を載せる。
// Electron 本体（Chromium・Node.js など）のライセンスは、ビルドしたアプリに LICENSES.chromium.html として同梱される。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { cwd: root, encoding: 'utf8' }));
const seen = new Map();
(function walk(deps) {
  for (const [name, info] of Object.entries(deps || {})) {
    const key = `${name}@${info.version}`;
    if (!seen.has(key) && info.version) seen.set(key, { name, version: info.version });
    walk(info.dependencies);
  }
})(tree.dependencies);

const pkgs = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const sections = pkgs.map(({ name, version }) => {
  const dir = path.join(root, 'node_modules', name);
  let license = '不明', repo = '', text = '';
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    license = typeof pj.license === 'string' ? pj.license : pj.license?.type || license;
    repo = typeof pj.repository === 'string' ? pj.repository : pj.repository?.url || '';
    repo = repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://');
  } catch (e) {}
  const file = fs.existsSync(dir) && fs.readdirSync(dir).find(f => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  if (file) text = fs.readFileSync(path.join(dir, file), 'utf8').trim();
  return { name, version, license, repo, text };
});

const out = [
  '# Third-Party Notices / 第三者ソフトウェアのライセンス',
  '',
  'ARCHYNDIUM Browser は次のオープンソースソフトウェアを利用しています。',
  'このファイルは `npm run notices` で自動生成しています。',
  '',
  '## Electron（Chromium・Node.js を含む）',
  '',
  'MIT License — https://github.com/electron/electron',
  '',
  'Electron に含まれる Chromium などのライセンスは、アプリと一緒に配布される `LICENSES.chromium.html` を参照してください。',
  '',
  '## 実行時に取得するデータ',
  '',
  '- 広告・トラッカーのフィルターリスト：EasyList / EasyPrivacy（GPLv3 / CC BY-SA 3.0）、uBlock Origin filters（GPLv3）。アプリには同梱せず、起動時に配布元から取得します。',
  '- アイコンの一部は Feather Icons（MIT License）をもとにしています — https://github.com/feathericons/feather',
  '',
  '## 同梱しているパッケージ',
  '',
  '| パッケージ | バージョン | ライセンス |',
  '|---|---|---|',
  ...sections.map(s => `| ${s.repo ? `[${s.name}](${s.repo})` : s.name} | ${s.version} | ${s.license} |`),
  '',
  '## ライセンス全文',
  '',
  ...sections.filter(s => s.text).flatMap(s => [`### ${s.name} ${s.version}`, '', '```', s.text, '```', '']),
].join('\n');

fs.writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), out);
console.log(`THIRD_PARTY_NOTICES.md を作成しました（${sections.length} パッケージ）`);
const unknown = sections.filter(s => !s.text);
if (unknown.length) console.log('ライセンス文が見つからなかったもの:', unknown.map(s => `${s.name} (${s.license})`).join(', '));
