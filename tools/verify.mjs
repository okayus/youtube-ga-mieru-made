#!/usr/bin/env node
/* ============================================================
   章ページの自動検証 (tools/verify.mjs)

   ヘッドレスの Chrome を DevTools Protocol で動かし、ページを開いて
     ・JS のエラー（読み込み時の構文エラー、各場面・各段階で起きた例外、console.error）
     ・読み込みに失敗した資源（CSS / JS のパス違いなど）
     ・1画面版で各場面（全段階）が舞台に収まっているか（縦・横のはみ出し、余り）
     ・縦読み版（390×844）で横スクロールが出ないか、場面から横にはみ出す要素がないか
     ・リンクが切れていないか（同じサイトの .html と #id。まだ作っていない章へのリンクは件数だけ出す）
     ・時刻送り: 各場面の各段階で、時刻を 0〜20 秒まで進めて frame を呼び、途中で例外が出ないか
     ・図の要素に、どの CSS にも無いクラス（f-/s-/t-/w… の綴り違いなど）が付いていないか（付いていると色や線が描かれない）
       （段階に入って数秒後にだけ起きる例外は、段階を順に押すだけでは見つからないため）
   を測る。one-screen-artifact スキルの measure.js と同じ基準。

   使い方:
     node tools/verify.mjs chapters/01-denshi.html [chapters/02-...html ...]
       --sizes all      4つの幅で測る（既定は 1920x880 と 1280x688 の2つ）
       --shots DIR      1920x880 の各場面と縦読み版の写真を DIR に置く
       --no-phone       縦読み版の検査を省く
       --no-steps       段階を進めずに測る
       --all-steps      --shots のとき、段階のある場面は全段階の写真を撮る
       --dark           ダークモード（prefers-color-scheme: dark）で測る・撮る
       --nav            段階を飛んで移ったときの見た目を、順に進めたときと比べる（onStep が差分で書かれていないか）
                        違いは「注意」として出し、失敗にはしない（乱数で動く部品があると違いが出ることがある）
       --overlap        各段階で時刻を 15 秒まで進めながら 0.25 秒ごとに、止まっている文字どうしの重なりと、図の外へ出た文字を調べる
                        （動く札が最初の位置や止まる位置で箱の題を隠す誤りは、段階に入った直後の写真だけでは見落とす）。注意だけで、失敗にはしない
   終了コード: エラーかはみ出しがあれば 1
   ============================================================ */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = { sizes: 'two', shots: null, phone: true, steps: true, allSteps: false, dark: false, nav: false, overlap: false, pages: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--sizes') opt.sizes = args[++i];
  else if (a === '--shots') opt.shots = path.resolve(args[++i]);
  else if (a === '--no-phone') opt.phone = false;
  else if (a === '--no-steps') opt.steps = false;
  else if (a === '--all-steps') opt.allSteps = true;
  else if (a === '--dark') opt.dark = true;
  else if (a === '--nav') opt.nav = true;
  else if (a === '--overlap') opt.overlap = true;
  else opt.pages.push(a);
}
if (!opt.pages.length) { console.error('usage: node tools/verify.mjs [--sizes all] [--shots DIR] <page.html>...'); process.exit(2); }
const DESKTOP = opt.sizes === 'all' ? [[1920, 880], [1536, 730], [1366, 657], [1280, 688]] : [[1920, 880], [1280, 688]];
const PHONE = [390, 844];

/* ---------- 静的配信（プロジェクトのルート） ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let p = path.normalize(path.join(ROOT, u));
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

/* ---------- Chrome の起動 ---------- */
function launchChrome() {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-chrome-'));
    const bin = process.env.CHROME || 'google-chrome';
    const ps = spawn(bin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions', '--mute-audio',
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

/* ---------- DevTools Protocol の小さなクライアント ---------- */
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
        } else if (msg.method) {
          this.handlers.forEach((h) => h(msg));
        }
      });
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

/* ---------- ページの中で動かす計測（one-screen-artifact の measure.js と同じ基準） ---------- */
const HOOK = `(() => {
  window.__errs = [];
  window.__pos = '読み込み';
  const push = (kind, msg) => { if (window.__errs.length < 40) window.__errs.push({ kind, pos: window.__pos, msg: String(msg).slice(0, 300) }); };
  const ce = console.error.bind(console);
  console.error = (...a) => { push('console.error', a.map((x) => (x && x.stack) ? x.stack.split('\\n').slice(0, 2).join(' ') : (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ')); ce(...a); };
  window.addEventListener('error', (e) => push('error', (e.message || '') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  window.addEventListener('unhandledrejection', (e) => push('unhandledrejection', e.reason && e.reason.message || e.reason));
})();`;

const MEASURE_DESKTOP = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const scenes = [...document.querySelectorAll('section.scene')];
  const res = { fit: root.classList.contains('fit'), s: cs.getPropertyValue('--s').trim(), W: cs.getPropertyValue('--W').trim(), H: cs.getPropertyValue('--H').trim(), scenes: [] };
  if (!scenes.length) { res.plain = true; res.over = root.scrollHeight - root.clientHeight; res.overX = root.scrollWidth - root.clientWidth; return res; }
  if (!res.fit) return res;
  const show = async (i) => {
    const tab = document.querySelector('.tabs [data-go="' + i + '"]');
    if (tab) tab.click(); else if (window.oneScreen) window.oneScreen.show(i);
    await wait(80);
  };
  const gauge = (s) => {
    const avail = s.clientHeight;
    const over = s.scrollHeight - s.clientHeight;
    const overX = s.scrollWidth - s.clientWidth;
    s.style.bottom = 'auto';
    const natural = s.offsetHeight;
    s.style.bottom = '';
    return { over, overX, slack: Math.round(avail - natural) };
  };
  for (let i = 0; i < scenes.length; i++) {
    window.__pos = scenes[i].id;
    await show(i);
    const s = scenes[i];
    let worst = { ...gauge(s), at: '' };
    const next = s.querySelector('[data-measure="next"]');
    const info = { steps: 0, hasDef: !!(window.oneScreen && window.oneScreen.ctx && window.oneScreen.ctx(i) && (window.oneScreen.ctx(i).def.frame || window.oneScreen.ctx(i).def.setup || window.oneScreen.ctx(i).steps)) };
    if (next && STEPS) {
      const variants = [...s.querySelectorAll('[data-measure="variant"]')];
      const runs = variants.length ? variants : [null];
      for (const v of runs) {
        if (v) { v.click(); await wait(40); }
        for (let k = 0; k < 80; k++) {
          window.__pos = s.id + ' 段階' + (k + 1);
          const g = gauge(s);
          if (g.slack < worst.slack || g.over > worst.over || g.overX > worst.overX) worst = { ...g, at: (v ? v.textContent.trim().slice(0, 14) + ' ' : '') + '段階' + (k + 1) };
          info.steps = k + 1;
          if (next.disabled) break;
          next.click();
          await wait(45);
        }
        const reset = s.querySelector('.st-reset'); if (reset) reset.click();
      }
      if (runs[0]) runs[0].click();
    }
    res.scenes.push({ i, id: s.id || 'scene' + i, tab: s.dataset.tab || '', ...worst, ...info });
  }
  await show(0);
  return res;
})()`;

const MEASURE_PHONE = `(() => {
  const de = document.documentElement;
  const skip = (el) => el.closest('thead, .mbar, .sr, [data-scroll-x], .fig-scroll, .tbl-wrap > *, .topbar');
  const scenes = [...document.querySelectorAll('section.scene')];
  const boxes = scenes.length ? scenes : [document.body];
  const out = [];
  for (const s of boxes) {
    const r = s.getBoundingClientRect();
    for (const el of s.querySelectorAll('*')) {
      if (skip(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > r.right + 0.5 || b.left < r.left - 0.5)) {
        const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
        out.push((s.id || 'body') + ' ' + el.tagName.toLowerCase() + (cls ? '.' + cls.trim().split(/\\s+/).slice(0, 3).join('.') : '') + ' ' + Math.round(b.left) + '..' + Math.round(b.right));
        if (out.length >= 12) break;
      }
    }
    if (out.length >= 12) break;
  }
  return { fit: de.classList.contains('fit'), hscroll: de.scrollWidth - de.clientWidth, over: out, scenes: scenes.length };
})()`;

/* 時刻送り: 各場面の各段階で ts を 0.05 秒刻みで 20 秒まで進めて frame を直接呼ぶ。
   章によっては YT.motion.playing を見て、止めているときは決まった姿を描く。両方の分岐を通すため、
   止めたときと、動いているが速さ 0（エンジンの時計は進まず、時刻はここで進める）のときの 2 回回す */
const SWEEP = `(async () => {
  const os = window.oneScreen;
  if (!os) return [];
  if (os.motion && os.motion.playing) { const b = document.querySelector('#mo-play'); if (b) b.click(); else os.motion.playing = false; }
  const DT = 0.05, K = 400, out = [];
  for (const play of [false, true]) {
  if (os.motion) { os.motion.playing = play; os.motion.speed = play ? 0 : 1; }
  for (let i = 0; i < os.count; i++) {
    const ctx = os.ctx(i);
    if (!ctx || !ctx.def || !ctx.def.frame) continue;
    os.show(i);
    await new Promise((r) => setTimeout(r, 20));
    const N = ctx.steps ? ctx.steps.length : 1;
    for (let s = 0; s < N; s++) {
      window.__pos = ctx.id + (ctx.steps ? ' 段階' + (s + 1) : '') + ' 時刻送り' + (play ? '（動かして）' : '（止めて）');
      if (ctx.steps) ctx.goStep(s);
      const t0 = ctx.t;
      let k = 1;
      try {
        for (; k <= K; k++) { ctx.ts = k * DT; ctx.t = t0 + k * DT; ctx.def.frame(ctx, ctx.t, DT); }
        ctx.def.frame(ctx, ctx.t, 0);
      } catch (e) {
        out.push(ctx.id + (ctx.steps ? ' 段階' + (s + 1) : '') + ' ' + (k * DT).toFixed(2) + '秒' + (play ? '（動かして）' : '（止めて）') + ': ' + ((e && e.message) || e));
      }
    }
    if (ctx.steps) ctx.goStep(0);
  }
  }
  if (os.motion) { os.motion.playing = false; os.motion.speed = 1; }
  return out;
})()`;

/* 段階の行き来: 順に進めたときの見た目と、別の段階から飛んできたときの見た目を比べる。
   見た目は、表示の有無（hide クラス・display・opacity の指定）と文字だけで要約する（位置は乱数や積算で変わるので比べない） */
const NAV = `(async () => {
  const os = window.oneScreen;
  if (!os) return [];
  if (os.motion && os.motion.playing) { const b = document.querySelector('#mo-play'); if (b) b.click(); else os.motion.playing = false; }
  const out = [];
  const hidden = (e, root) => { for (let a = e; a && a !== root; a = a.parentNode) { if (a.classList && a.classList.contains('hide')) return true; const st = a.style; if (st && (st.display === 'none' || st.visibility === 'hidden' || (st.opacity !== '' && Number(st.opacity) < 0.02))) return true; } return false; };
  // 見えている要素だけを順に並べて比べる（隠れた要素は見た目に出ないので数えない）。文字は中身も比べる
  const sum = (ctx) => { const root = ctx.svg; if (!root) return []; return [...root.querySelectorAll('*')].filter((e) => !e.closest('defs') && !hidden(e, root)).map((e) => e.tagName + (e.tagName === 'text' ? '「' + e.textContent.slice(0, 40) + '」' : '') + (e.id ? '#' + e.id : '')); };
  const draw = (ctx, s) => { ctx.goStep(s); ctx.ts = 0; ctx.def.frame && ctx.def.frame(ctx, ctx.t, 0); };
  for (let i = 0; i < os.count; i++) {
    const ctx = os.ctx(i);
    if (!ctx || !ctx.steps || ctx.steps.length < 2) continue;
    os.show(i);
    await new Promise((r) => setTimeout(r, 20));
    const N = ctx.steps.length, seq = [];
    try {
      for (let s = 0; s < N; s++) { draw(ctx, s); seq.push(sum(ctx)); }
      for (let s = 0; s < N; s++) {
        for (const from of [...new Set([N - 1, 0, s + 1, s - 2].filter((f) => f >= 0 && f < N && f !== s && f !== s - 1))]) {
          draw(ctx, from); ctx.ts = 3; ctx.def.frame && ctx.def.frame(ctx, ctx.t + 3, 0.05);
          draw(ctx, s);
          const now = sum(ctx), a = seq[s];
          let q = 0; while (q < a.length && q < now.length && a[q] === now[q]) q++;
          if (q === a.length && q === now.length) continue;
          const what = a.length !== now.length ? '見えている要素 ' + a.length + ' 個 → ' + now.length + ' 個' : '見えている要素が違う';
          out.push(ctx.id + ' 段階' + (s + 1) + '（段階' + (from + 1) + 'から）: ' + what + '。最初の違い: ' + (a[q] || '（無い）') + ' → ' + (now[q] || '（無い）'));
        }
      }
    } catch (e) { out.push(ctx.id + ': 比べる途中で例外 ' + ((e && e.message) || e)); }
    ctx.goStep(0);
  }
  return out;
})()`;

/* 文字の重なり（--overlap）: 各場面の各段階で ts を 0.05 秒刻みに 15 秒まで進めて frame を呼び、0.25 秒ごとに
   見えている文字の枠を測る。拾うのは、止まっている（前の測定から動いていない、または段階の始め）文字どうしの重なりのうち
     ・どちらかが段階のどこかで動く文字（動く札が、最初の位置か止まる位置でほかの文字を隠す）
     ・どちらも動かない文字で、下の文字が上に描いた物に全部は隠されていないもの（文字に文字が重なって読めない）
   と、止まっている「動く四角」（塗りのある rect。札の下地など）が、それより下に描いた文字の 25% 以上を覆うもの、
   図（svg）の外へ 2px より出た文字。通り過ぎる途中の重なりは拾わない。
   止まって見える時刻を拾うのは、動きを止めた人と動きを減らす設定の人には、段階の始めの見た目がそのまま残るため。
   止めたとき（章によっては決まった姿を描く）と、動いているが速さ 0 のとき（時刻はここで進める）の 2 回調べる */
const OVERLAP = `(async () => {
  const os = window.oneScreen;
  if (!os) return [];
  if (os.motion && os.motion.playing) { const b = document.querySelector('#mo-play'); if (b) b.click(); else os.motion.playing = false; }
  const off = (a) => { const st = a.style; if (st && (st.display === 'none' || st.visibility === 'hidden' || (st.opacity !== '' && Number(st.opacity) < 0.02))) return true; if (!a.getAttribute) return false; const o = a.getAttribute('opacity'); return a.getAttribute('display') === 'none' || a.getAttribute('visibility') === 'hidden' || (o !== null && Number(o) < 0.02); };
  const hidden = (e, root) => { for (let a = e; a && a !== root; a = a.parentNode) { if ((a.classList && a.classList.contains('hide')) || off(a)) return true; } return false; };
  const name = (e) => '「' + e.textContent.trim().slice(0, 22) + '」';
  const same = (r, q) => q && Math.abs(r.left - q.left) < 0.5 && Math.abs(r.top - q.top) < 0.5 && Math.abs(r.width - q.width) < 0.5;
  // 下の文字 L が、上に描いた物に全部隠されているか（枠の中の 5 点で一番上の要素を見る）
  const covered = (L) => { const r = L.getBoundingClientRect(); return [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]].every(([fx, fy]) => { const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); return el && el !== L && !L.contains(el); }); };
  const out = [], seen = new Set();
  const DT = 0.05, K = 300, EVERY = 5;
  for (const play of [true, false]) {
  if (os.motion) { os.motion.playing = play; os.motion.speed = play ? 0 : 1; }
  for (let i = 0; i < os.count && out.length < 80; i++) {
    const ctx = os.ctx(i);
    if (!ctx || !ctx.svg) continue;
    os.show(i);
    await new Promise((r) => setTimeout(r, 30));
    const N = ctx.steps ? ctx.steps.length : 1;
    try {
      for (let s = 0; s < N; s++) {
        if (ctx.steps) ctx.goStep(s);
        const t0 = ctx.t, KK = ctx.def && ctx.def.frame ? K : 0;
        const first = new Map(), moved = new Set(), prev = new Map(), found = [];
        const firstR = new Map(), movedR = new Set(), prevR = new Map();
        for (let k = 0; k <= KK; k++) {
          if (k > 0) { ctx.ts = k * DT; ctx.t = t0 + k * DT; ctx.def.frame(ctx, ctx.t, DT); }
          if (k % EVERY) continue;
          // 図の外かどうかは viewBox の枠で見る（svg 要素の枠は viewBox より広いことがあり、外へ出た文字を見落とす）
          let fr = ctx.svg.getBoundingClientRect();
          const vb = ctx.svg.viewBox && ctx.svg.viewBox.baseVal, m = ctx.svg.getScreenCTM();
          if (vb && vb.width && m) { const p0 = new DOMPoint(vb.x, vb.y).matrixTransform(m), p1 = new DOMPoint(vb.x + vb.width, vb.y + vb.height).matrixTransform(m); fr = { left: Math.min(p0.x, p1.x), top: Math.min(p0.y, p1.y), right: Math.max(p0.x, p1.x), bottom: Math.max(p0.y, p1.y) }; }
          const bx = [...ctx.svg.querySelectorAll('text')].filter((e) => e.textContent.trim() && !hidden(e, ctx.svg)).map((e) => ({ e, r: e.getBoundingClientRect() })).filter((b) => b.r.width > 0.5 && b.r.height > 0.5);
          bx.forEach((b) => { const f = first.get(b.e); if (!f) first.set(b.e, b.r); else if (!same(b.r, f)) moved.add(b.e); });
          const still = (b) => k === 0 || same(b.r, prev.get(b.e));
          for (let a = 0; a < bx.length; a++) {
            const A = bx[a].r;
            const ox = Math.max(fr.left - A.left, A.right - fr.right), oy = Math.max(fr.top - A.top, A.bottom - fr.bottom);
            if ((ox > 2 || oy > 2) && still(bx[a])) found.push({ k, out: Math.round(Math.max(ox, oy)), a: bx[a].e });
            for (let b = a + 1; b < bx.length; b++) {
              const B = bx[b].r;
              const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
              if (w <= 1 || h <= 1 || w * h < 0.15 * Math.min(A.width * A.height, B.width * B.height)) continue;
              if (!still(bx[a]) || !still(bx[b])) continue;
              // 文書の順で後の要素が上に描かれる
              const lowA = !!(bx[a].e.compareDocumentPosition(bx[b].e) & Node.DOCUMENT_POSITION_FOLLOWING);
              found.push({ k, a: bx[a].e, b: bx[b].e, cov: covered(lowA ? bx[a].e : bx[b].e) });
            }
          }
          // 塗りのある四角（札の下地など）。動く四角が止まっている所で、下に描いた文字を隠していないか
          const rs = [...ctx.svg.querySelectorAll('rect')].filter((e) => / f-(?!none)/.test(' ' + (e.getAttribute('class') || '')) && !hidden(e, ctx.svg)).map((e) => ({ e, r: e.getBoundingClientRect() })).filter((b) => b.r.width > 2 && b.r.height > 2);
          rs.forEach((b) => { const f = firstR.get(b.e); if (!f) firstR.set(b.e, b.r); else if (!same(b.r, f)) movedR.add(b.e); });
          for (const R of rs) {
            if (!(k === 0 || same(R.r, prevR.get(R.e)))) continue;
            for (const T of bx) {
              if (!still(T) || R.e.parentNode.contains(T.e)) continue;
              const A = T.r, B = R.r;
              const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
              if (w <= 1 || h <= 1 || w * h < 0.25 * A.width * A.height) continue;
              if (!(T.e.compareDocumentPosition(R.e) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;   // 四角が文字より下なら隠さない
              found.push({ k, a: T.e, rect: R.e });
            }
          }
          rs.forEach((b) => prevR.set(b.e, b.r));
          bx.forEach((b) => prev.set(b.e, b.r));
        }
        const where = (k) => ctx.id + (ctx.steps ? ' 段階' + (s + 1) : '') + (play ? ' ' + (k * DT).toFixed(2) + '秒' : '（止めたとき）');
        for (const f of found) {
          const key = ctx.id + s + '|' + f.a.textContent + '|' + (f.b ? f.b.textContent : 'out');   // 動かして見つけたものは、止めたときにもう一度は出さない
          if (seen.has(key)) continue;
          if (f.out) { seen.add(key); out.push(where(f.k) + ': ' + name(f.a) + 'が図の外へ ' + f.out + 'px'); continue; }
          if (f.rect) {
            if (!movedR.has(f.rect)) continue;   // 動かない板が覆うのは図の作り
            const lt = f.rect.parentNode.querySelector('text');
            const rkey = ctx.id + s + '|' + f.a.textContent + '|rect|' + (lt ? lt.textContent : '');
            if (seen.has(rkey)) continue;
            seen.add(rkey);
            out.push(where(f.k) + ': ' + name(f.a) + 'が' + (lt && lt.textContent.trim() ? name(lt) + 'の' : '動く') + '札の四角に隠れる' + (f.k === 0 ? '（最初の位置）' : '（止まる位置）'));
            continue;
          }
          const mv = moved.has(f.a) || moved.has(f.b);
          if (!mv && f.cov) continue;   // 動かない板が下の文字を覆っている（図の作り）
          seen.add(key);
          out.push(where(f.k) + ': ' + name(f.a) + 'と' + name(f.b) + (mv ? (f.k === 0 ? '（動く札の最初の位置）' : '（動く札の止まる位置）') : '（動かない文字どうし）'));
        }
      }
    } catch (e) { out.push(ctx.id + ': 調べる途中で例外 ' + ((e && e.message) || e)); }
    if (ctx.steps) ctx.goStep(0);
  }
  }
  if (os.motion) { os.motion.playing = false; os.motion.speed = 1; }
  return out;
})()`;

/* 未定義のクラス: 図の要素に付いた f-/s-/t-/w… の語のうち、読み込んだ CSS のどこにも無いもの */
const CLASSES = `(() => {
  const known = new Set();
  const walk = (rs) => { for (const r of rs) { if (r.selectorText) (r.selectorText.match(/\\.[A-Za-z][\\w-]*/g) || []).forEach((c) => known.add(c.slice(1))); if (r.cssRules) walk(r.cssRules); } };
  for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; } walk(rs); }
  const vocab = /^(f|s|t)-[\\w-]+$|^w\\d+$|^dash\\d?$|^round$|^glow$|^code-sm$/;
  const miss = {};
  document.querySelectorAll('svg *').forEach((e) => { const c = e.getAttribute('class'); if (!c) return; c.split(/\\s+/).forEach((t) => { if (t && vocab.test(t) && !known.has(t)) miss[t] = (miss[t] || 0) + 1; }); });
  return miss;
})()`;

/* ---------- 1ページを測る ---------- */
async function checkPage(cdp, sid, base, page, report) {
  const url = base + page.replace(/\\/g, '/');
  const netErrors = [];
  const methods = new Map();   // HEAD の 404（目次ページの存在確認）は数えない
  const onEvent = (msg) => {
    if (msg.sessionId !== sid) return;
    if (msg.method === 'Network.requestWillBeSent') methods.set(msg.params.requestId, msg.params.request.method);
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400 && !/favicon/.test(msg.params.response.url) && methods.get(msg.params.requestId) !== 'HEAD') netErrors.push(msg.params.response.status + ' ' + msg.params.response.url.replace(base, ''));
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) netErrors.push('失敗 ' + (msg.params.errorText || '') + ' ' + (msg.params.type || ''));
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      const text = (d.exception && d.exception.description) || d.text || '';
      netErrors.push('例外(読み込み時) ' + text.split('\n')[0].slice(0, 200) + (d.url ? ' @' + d.url.split('/').pop() + ':' + d.lineNumber : ''));
    }
  };
  cdp.on(onEvent);
  const ev = (expr, awaitP = false) => cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true }, sid).then((r) => {
    if (r.exceptionDetails) throw new Error('計測スクリプトのエラー: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  });
  const load = async (w, h, mobile) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }, sid);
    const loaded = new Promise((resolve) => {
      const h2 = (msg) => { if (msg.sessionId === sid && msg.method === 'Page.loadEventFired') { resolve(); } };
      cdp.on(h2);
      setTimeout(resolve, 8000);
    });
    await cdp.send('Page.navigate', { url }, sid);
    await loaded;
    await ev('document.fonts.ready.then(() => true)', true).catch(() => {});
    await new Promise((r) => setTimeout(r, 350));
  };

  const lines = [];
  let bad = false;
  const allErrs = [];
  for (const [w, h] of DESKTOP) {
    await load(w, h, false);
    const r = await ev(MEASURE_DESKTOP.replace('STEPS', opt.steps ? 'true' : 'false'), true);
    const errs = await ev('window.__errs');
    errs.forEach((e) => allErrs.push(w + 'x' + h + ' ' + e.pos + ': [' + e.kind + '] ' + e.msg));
    if (r.plain) {
      const over = r.over > 0 || r.overX > 0;
      if (over) bad = true;
      lines.push(`  ${w}x${h}  場面なしのページ: ` + (over ? `はみ出し 縦${r.over}px 横${r.overX}px` : 'はみ出しなし'));
      continue;
    }
    if (!r.fit) { lines.push(`  ${w}x${h}  1画面版になっていない（html に .fit が付いていない）`); bad = true; continue; }
    const overs = r.scenes.filter((x) => x.over > 0 || x.overX > 0);
    if (overs.length) bad = true;
    const tight = r.scenes.reduce((a, x) => (x.slack < a.slack ? x : a), r.scenes[0]);
    lines.push(`  ${w}x${h}  拡大率 ${Number(r.s).toFixed(3)}  舞台 ${Math.round(parseFloat(r.W))}x${Math.round(parseFloat(r.H))}  ` +
      (overs.length ? 'はみ出し: ' + overs.map((x) => `${x.id} 縦${x.over}px${x.overX > 0 ? ' 横' + x.overX + 'px' : ''}${x.at ? '（' + x.at + '）' : ''}`).join('、') : 'はみ出しなし') +
      `  ／ 最も余裕のない場面: ${tight.id}（余り ${tight.slack}px${tight.at ? '、' + tight.at : ''}）`);
    if (w === DESKTOP[0][0]) {
      lines.push('  場面: ' + r.scenes.map((x) => `${x.id}${x.tab ? '「' + x.tab + '」' : ''}${x.steps ? ' 段階' + x.steps : ''}${x.hasDef ? '' : '（動き無し）'}`).join('  '));
    }
  }
  // リンク: 同じサイトの .html が在るか、#id の行き先が在るか。まだ作っていない章（chapters/NN-*.html）へのリンクは切れとして数えず、件数だけ出す
  const hrefs = await ev('[...new Set([...document.querySelectorAll("a[href]")].map((a) => new URL(a.getAttribute("href"), document.baseURI).href))]');   // SVG の <a> は href が文字列でない
  const broken = [], todo = [];
  for (const h of hrefs) {
    if (!h.startsWith(base)) continue;
    const u = new URL(h);
    let file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const rel = path.relative(ROOT, file);
    if (!fs.existsSync(file)) { (/^chapters\/\d\d-[a-z0-9-]+\.html$/.test(rel) ? todo : broken).push(rel + u.hash); continue; }
    if (u.hash.length > 1) {
      const id = decodeURIComponent(u.hash.slice(1));
      const found = file === path.join(ROOT, page)
        ? await ev('!!document.getElementById(' + JSON.stringify(id) + ')')
        : fs.readFileSync(file, 'utf8').includes('id="' + id + '"');
      if (!found) broken.push(rel + u.hash + '（行き先の id が無い）');
    }
  }
  if (broken.length) { bad = true; lines.push('  リンク切れ ' + broken.length + '件: ' + broken.join(' ／ ')); }
  else lines.push('  リンク切れ: なし' + (todo.length ? '（まだ無い章へのリンク ' + todo.length + '件: ' + todo.sort().map((x) => x.replace(/^chapters\//, '')).join(' ') + '）' : ''));
  // 時刻送り（例外は JS のエラーとして数える）と、段階の行き来（--nav のとき。注意だけ）
  if (opt.steps) {
    const sw = await ev(SWEEP, true);
    sw.forEach((e) => allErrs.push('sweep 時刻送り ' + e));
    lines.push('  時刻送り（各段階 20 秒）: ' + (sw.length ? '例外 ' + sw.length + '件' : '例外なし'));
    // 時刻送りで全場面・全段階を通した後なので、段階の途中で作られる要素も数えられる
    const miss = Object.entries(await ev(CLASSES));
    if (miss.length) bad = true;
    lines.push('  未定義のクラス: ' + (miss.length ? miss.map(([k, n]) => k + '（' + n + '）').join(' ') + ' — base.css にも章の style にも無い' : 'なし'));
    (await ev('window.__errs')).forEach((e) => allErrs.push('sweep ' + e.pos + ': [' + e.kind + '] ' + e.msg));   // onStep などがエンジン経由で出した console.error
    if (opt.nav) {
      // 基準（初めて順に進めたときの見た目）を取るため、読み込み直してから比べる
      await load(DESKTOP[0][0], DESKTOP[0][1], false);
      const nv = await ev(NAV, true);
      lines.push('  段階の行き来: ' + (nv.length ? '注意 ' + nv.length + '件（順に進めたときと見た目が違う）' : '違いなし'));
      nv.slice(0, 12).forEach((e) => lines.push('    - ' + e));
      (await ev('window.__errs')).forEach((e) => allErrs.push('nav ' + e.pos + ': [' + e.kind + '] ' + e.msg));
    }
    if (opt.overlap) {
      await load(DESKTOP[0][0], DESKTOP[0][1], false);
      const ov = await ev(OVERLAP, true);
      lines.push('  文字の重なり（各段階 15 秒）: ' + (ov.length ? '注意 ' + ov.length + '件（写真か tools/shot.mjs で確かめる）' : 'なし'));
      ov.slice(0, 40).forEach((e) => lines.push('    - ' + e));
      (await ev('window.__errs')).forEach((e) => allErrs.push('overlap ' + e.pos + ': [' + e.kind + '] ' + e.msg));
    }
  }
  // 写真（1920x880 の各場面）
  if (opt.shots) {
    fs.mkdirSync(opt.shots, { recursive: true });
    await load(DESKTOP[0][0], DESKTOP[0][1], false);
    const count = await ev('document.querySelectorAll("section.scene").length');
    const stem = path.basename(page, '.html');
    for (let i = 0; i < Math.max(1, count); i++) {
      if (count) { await ev(`(() => { const t = document.querySelector('.tabs [data-go="${i}"]'); if (t) t.click(); else if (window.oneScreen) window.oneScreen.show(${i}); return 1; })()`); await new Promise((r) => setTimeout(r, 700)); }
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
      fs.writeFileSync(path.join(opt.shots, `${stem}-desktop${opt.dark ? '-dark' : ''}-s${i}.png`), Buffer.from(shot.data, 'base64'));
      if (opt.allSteps) {
        for (let k = 2; k <= 40; k++) {
          const more = await ev(`(() => { const s = document.querySelectorAll('section.scene')[${i}]; const b = s && s.querySelector('[data-measure="next"]'); if (!b || b.disabled) return false; b.click(); return true; })()`);
          if (!more) break;
          await new Promise((r) => setTimeout(r, 700));
          const sh = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
          fs.writeFileSync(path.join(opt.shots, `${stem}-desktop${opt.dark ? '-dark' : ''}-s${i}-step${k}.png`), Buffer.from(sh.data, 'base64'));
        }
      }
    }
  }
  // 縦読み版
  if (opt.phone) {
    await load(PHONE[0], PHONE[1], true);
    // 縦読み版は画面に入った場面から図を組み立てるので、全場面を一度スクロールして通す
    await ev(`(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); for (const s of document.querySelectorAll('section.scene')) { s.scrollIntoView({ block: 'start' }); await w(120); } window.scrollTo(0, 0); await w(200); return 1; })()`, true);
    const ph = await ev(MEASURE_PHONE);
    const errs = await ev('window.__errs');
    errs.forEach((e) => allErrs.push('phone ' + e.pos + ': [' + e.kind + '] ' + e.msg));
    if (ph.fit || ph.hscroll > 0 || ph.over.length) bad = true;
    lines.push(`  ${PHONE[0]}x${PHONE[1]}  ${ph.fit ? '1画面版のまま（縦読み版に切り替わっていない）' : '縦読み版'}  横スクロール ${ph.hscroll > 0 ? ph.hscroll + 'px 出る' : 'なし'}  場面からはみ出す要素 ${ph.over.length ? ph.over.length + '個: ' + ph.over.join(' ／ ') : 'なし'}`);
    if (opt.shots) {
      // 場面ごとに1枚（全体を1枚にすると長い章では 6000px で切れる）。場面の無いページは全体を1枚
      // 下端に貼り付く操作バー（.mbar、sticky）は、画面の外の場面を撮ると場面の上端に写り込むので、撮る間だけ元の位置に置く
      await ev(`(() => { const st = document.createElement('style'); st.id = '__shot'; st.textContent = '.mbar { position: static !important; }'; document.head.appendChild(st); return 1; })()`);
      const rects = await ev(`[...document.querySelectorAll('section.scene')].map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.ceil(r.height)]; })`);
      if (!rects.length) rects.push([0, await ev('document.documentElement.scrollHeight')]);
      // 画面の外まで1枚で撮る（captureBeyondViewport）と、画面外の図の文字や図形が描かれずに抜けることがある。
      // 縦読み版は幅だけで決まり高さに依存しないので、場面ごとに画面の高さを場面に合わせ、先頭まで送ってから画面内として撮る
      for (let i = 0; i < rects.length; i++) {
        const [y, h] = rects[i];
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: PHONE[0], height: Math.max(PHONE[1], Math.min(h, 6000)), deviceScaleFactor: 2, mobile: true }, sid);
        await ev(`(async () => { window.scrollTo(0, ${y}); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise((r) => setTimeout(r, 300)); return 1; })()`, true);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y, width: PHONE[0], height: Math.min(h, 6000), scale: 1 } }, sid);
        fs.writeFileSync(path.join(opt.shots, `${path.basename(page, '.html')}-phone${opt.dark ? '-dark' : ''}${rects.length > 1 ? '-s' + i : ''}.png`), Buffer.from(shot.data, 'base64'));
      }
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: PHONE[0], height: PHONE[1], deviceScaleFactor: 2, mobile: true }, sid);
    }
  }
  const uniq = [...new Set(allErrs.map((e) => e.replace(/^\S+ /, '')))];
  if (netErrors.length) { bad = true; lines.push('  読み込みの問題: ' + [...new Set(netErrors)].join(' ／ ')); }
  if (uniq.length) { bad = true; lines.push('  JS のエラー ' + uniq.length + '件:'); uniq.slice(0, 12).forEach((e) => lines.push('    - ' + e)); }
  else if (!netErrors.length) lines.push('  JS のエラー: なし');
  report.push((bad ? '✗ ' : '✓ ') + page);
  report.push(...lines);
  return !bad;
}

/* ---------- main ---------- */
const server = await serve();
const base = `http://127.0.0.1:${server.port}/`;
let chrome;
let ok = true;
try {
  chrome = await launchChrome();
  const cdp = new CDP(chrome.ws);
  await cdp.connect();
  for (const page of opt.pages) {
    const rel = path.relative(ROOT, path.resolve(page));
    if (rel.startsWith('..')) { console.log('✗ ' + page + '  プロジェクトの外のファイルは測れない'); ok = false; continue; }
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: sid } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sid);
    await cdp.send('Runtime.enable', {}, sid);
    await cdp.send('Network.enable', {}, sid);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK }, sid);
    if (opt.dark) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sid);
    const report = [];
    try {
      const good = await checkPage(cdp, sid, base, rel, report);
      if (!good) ok = false;
    } catch (e) {
      ok = false;
      report.push('✗ ' + rel + '  計測が失敗: ' + e.message);
    }
    console.log(report.join('\n'));
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
  cdp.close();
} finally {
  if (chrome) chrome.kill();
  server.close();
}
process.exit(ok ? 0 : 1);
