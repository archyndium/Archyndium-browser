// ==========================================
// ★ 小さな JSON 永続化ヘルパー（userData フォルダに保存）
// ==========================================
// Shield のサイト例外や、サイトごとの権限など「main プロセスが判断に使う設定」を保存する。
// （タブやテーマなど画面側の設定は従来通り renderer の localStorage）
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function createStore(name, defaults) {
  const file = () => path.join(app.getPath('userData'), `${name}.json`);
  let data = null;
  let timer = null;

  function load() {
    if (data) return data;
    try { data = { ...defaults, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch (e) { data = { ...defaults }; }
    return data;
  }

  // 連続で書き換えられても書き込みは 1 回にまとめる
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { fs.writeFileSync(file(), JSON.stringify(data, null, 2)); } catch (e) { console.log(`store(${name}) save failed:`, e); }
    }, 200);
  }

  return {
    get: (key) => load()[key],
    set: (key, value) => { load()[key] = value; save(); },
    all: () => load(),
  };
}

module.exports = { createStore };
