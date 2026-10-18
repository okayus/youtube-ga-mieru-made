#!/usr/bin/env node
/* ============================================================
   場面を決まった時刻で撮る (tools/shot.mjs)

   verify.mjs の写真は段階に入った直後の見た目だけなので、動く札の止まる位置や、
   途中で書き換わる文字・色は写らない。このツールは、指定した場面・段階で ts を 0 から
   指定の秒まで 0.05 秒刻みに進めて frame を呼んでから、1920x880 で撮る
   （verify.mjs の「時刻送り」と同じ進め方）。エンジンの時計は「動いているが速さ 0」にする
   （YT.motion.playing を見て、止めているときは決まった姿を描く章があるため）。

   使い方:
     node tools/shot.mjs chapters/14-router.html --scene 4 --step 2 --at 0,1.5,3 --out DIR [--dark]
       --scene N   場面の番号（表紙 s0 が 0）
       --step K    段階（1 始まり。省略すると 1）
       --at a,b,…  段階に入ってからの秒。1 つにつき 1 枚（省略すると 0）
       --out DIR   写真を置くフォルダ（必須。プロジェクトの外の一時置き場にする）
       --dark      ダークモード（prefers-color-scheme: dark）で撮る
       --paused    動きを止めたときの姿を撮る（動きを止めた人・動きを減らす設定の人が見る姿）
   写真の名前: NN-名前-sN-stepK-t秒[-paused][-dark].png
   ============================================================ */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = { scene: null, step: 1, at: [0], out: null, dark: false, paused: false, page: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--scene') opt.scene = Number(args[++i]);
  else if (a === '--step') opt.step = Number(args[++i]);
  else if (a === '--at') opt.at = args[++i].split(',').map(Number);
  else if (a === '--out') opt.out = path.resolve(args[++i]);
  else if (a === '--dark') opt.dark = true;
  else if (a === '--paused') opt.paused = true;
  else opt.page = a;
}
if (!opt.page || opt.scene === null || !opt.out || opt.at.some((v) => !(v >= 0))) {
  console.error('usage: node tools/shot.mjs <page.html> --scene N [--step K] [--at 0,1.5,3] --out DIR [--dark] [--paused]');
  process.exit(2);
}

/* ---------- 静的配信（プロジェクトのルート） ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => srv.close() }));
  });
}

/* ---------- Chrome の起動と DevTools Protocol（verify.mjs と同じ） ---------- */
function launchChrome() {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-chrome-'));
    const ps = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions', '--mute-audio',
      '--remote-debugging-port=0', '--user-data-dir=' + dir, '--window-size=1920,1080', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let buf = '', done = false;
    const timer = setTimeout(() => { if (!done) { done = true; ps.kill(); reject(new Error('Chrome が起動しない: ' + buf.slice(-400))); } }, 15000);
    ps.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m && !done) { done = true; clearTimeout(timer); resolve({ ws: m[1], kill: () => { ps.kill(); setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 500); } }); }
    });
    ps.on('exit', () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('Chrome が終了した: ' + buf.slice(-400))); } });
  });
}
class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = []; }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(e));
      this.ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
        } else if (msg.method) this.handlers.forEach((h) => h(msg));
      });
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId })); });
  }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

/* 時計を止めるか速さ 0 で動かし、場面と段階を開き、ts を at 秒まで進めて frame を呼ぶ。例外は文字列で返す */
const ADVANCE = (scene, step, at, paused) => `(async () => {
  const os = window.oneScreen;
  if (!os) return 'oneScreen が無い（1画面版になっていない）';
  if (os.motion) { os.motion.playing = ${!paused}; os.motion.speed = ${paused ? 1 : 0}; }
  if (${scene} >= os.count) return '場面 ${scene} は無い（' + os.count + ' 場面）';
  os.show(${scene});
  await new Promise((r) => setTimeout(r, 50));
  const ctx = os.ctx(${scene});
  if (ctx && ctx.steps) {   // frame の無い場面でも段階は移す
    if (${step} > ctx.steps.length) return '段階 ${step} は無い（' + ctx.steps.length + ' 段階）';
    ctx.goStep(0); ctx.goStep(${step - 1});
  }
  if (!ctx || !ctx.def || !ctx.def.frame) return 'ok（動きの無い場面）';
  const DT = 0.05, K = Math.round(${at} / DT), t0 = ctx.t;
  try {
    for (let k = 1; k <= K; k++) { ctx.ts = k * DT; ctx.t = t0 + k * DT; ctx.def.frame(ctx, ctx.t, DT); }
    ctx.def.frame(ctx, ctx.t, 0);
  } catch (e) { return '例外: ' + ((e && e.message) || e); }
  return 'ok';
})()`;

const server = await serve();
let chrome, code = 0;
try {
  chrome = await launchChrome();
  const cdp = new CDP(chrome.ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: sid } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sid);
  await cdp.send('Runtime.enable', {}, sid);
  if (opt.dark) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sid);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 880, deviceScaleFactor: 1, mobile: false }, sid);
  const ev = (expr) => cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid).then((r) => {
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  });
  const rel = path.relative(ROOT, path.resolve(opt.page)).replace(/\\/g, '/');
  const loaded = new Promise((resolve) => { cdp.on((m) => { if (m.sessionId === sid && m.method === 'Page.loadEventFired') resolve(); }); setTimeout(resolve, 8000); });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.port}/${rel}` }, sid);
  await loaded;
  await ev('document.fonts.ready.then(() => true)').catch(() => {});
  fs.mkdirSync(opt.out, { recursive: true });
  const stem = path.basename(rel, '.html');
  for (const at of opt.at) {
    const r = await ev(ADVANCE(opt.scene, opt.step, at, opt.paused));
    if (!r.startsWith('ok')) { console.log(`✗ s${opt.scene} 段階${opt.step} ${at} 秒: ${r}`); code = 1; continue; }
    await new Promise((res) => setTimeout(res, 450));   // fade（0.35 秒）が終わるまで待つ
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
    const file = path.join(opt.out, `${stem}-s${opt.scene}-step${opt.step}-t${at}${opt.paused ? '-paused' : ''}${opt.dark ? '-dark' : ''}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(file);
  }
  cdp.close();
} finally {
  if (chrome) chrome.kill();
  server.close();
}
process.exit(code);
