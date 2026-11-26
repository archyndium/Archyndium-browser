// ==========================================
// ★ 翻訳エンジンを動かす別プロセス（Electron の utilityProcess）
// ==========================================
// main/translator.js が utilityProcess.fork() で起動する。中で Bergamot（WASM）を
// worker_threads で動かし、親（main）との間でメッセージを中継するだけ。
// 本体の画面やページとは別のプロセスなので、翻訳中も画面が固まらず、落ちても本体に影響しない。
const { Worker } = require('node:worker_threads');
const path = require('node:path');

const engineDir = process.argv[2];   // 展開済み（asar の外）の src/vendor/bergamot
let worker = null;
let serial = 0;
const pending = new Map();

function call(name, ...args) {
  return new Promise((accept, reject) => {
    const id = ++serial;
    pending.set(id, { accept, reject });
    worker.postMessage({ id, name, args });
  });
}

async function start() {
  worker = new Worker(path.join(engineDir, 'translator-worker.js'));
  worker.on('message', ({ id, result, error }) => {
    const p = pending.get(id); if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error.message || 'translation error')); else p.accept(result);
  });
  worker.on('error', (e) => process.parentPort.postMessage({ type: 'fatal', message: String(e && e.message || e) }));
  await call('initialize', { cacheSize: 1 << 14 });
}
const ready = start();

process.parentPort.on('message', async ({ data }) => {
  const { id, name, args } = data || {};
  try {
    await ready;
    const result = await call(name, ...(args || []));
    process.parentPort.postMessage({ id, result });
  } catch (e) {
    process.parentPort.postMessage({ id, error: String(e && e.message || e) });
  }
});
