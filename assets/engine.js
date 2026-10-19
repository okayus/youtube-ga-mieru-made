/* ============================================================
   YouTubeが見えるまで — 共通エンジン (assets/engine.js)

   読み込み方: <head> の中で defer を付けずに読み込む。
     1画面版かどうかの判定（html に .fit を付ける）を本文より前に走らせるため。
   章ページは本文の末尾で YT.chapter({ meta, scenes }) を呼ぶ（docs/authoring.md）。

   提供するもの
     YT.util   clamp / lerp / mod / prog / remap / seq / ease / pulse / cycle / seg / fmt / esc / rich
     YT.svg    el / g / rect / circle / line / path / poly / polygon / text / lines / clear / len / along / place / label / arrow / markers / show / fade
     YT.anim   flow（道に沿って粒を流す）/ wave（正弦波を描く）
     YT.chapter(def)   章の登録。場面の切り替え、段階（ステッパー）、動きの時計をまとめて面倒を見る
     window.oneScreen  計測スクリプト用の入口（show / count / ctx）

   通しで進む（1画面版）: 上部バー右上の ›（#pg-next）と → は、次の段階、段階の終わりなら次の場面、最後の
     場面（まとめ）なら meta.next の章の場面1（#s1。章の表紙は飛ばす）へ進む。目次では › で第1章の場面1へ。
     ‹（#pg-prev）と ← はその逆（前の場面は最後の段階から。場面1 の最初の段階で ‹ を押すと、表紙を飛ばして
     前の章のまとめ（#last）へ。第1章なら目次へ）。↓↑ は場面ごとに移り、章の端では前後の章へ。
     「自動で進む」も同じ順に進む（段階は本文の長さに応じて 12〜30 秒）。今いる章・場面・段階は localStorage（ytm-last）に残し、
     目次の「続きから」に使う。URL の末尾は #s3（場面3）または #s3.2（場面3 の段階2）。
     まとめの下には次の章の導入（meta.next.lead）を出し、表紙の操作の説明（.keys[data-auto]）も埋める。
   ============================================================ */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------
     1画面版の判定。幅1216px以上かつ高さ654px以上（拡大率0.76以上）なら .fit。
     舞台は論理 1600〜1920 × 860 で、transform: scale で画面に合わせる。
     --------------------------------------------------------------- */
  var MIN_W = 1600, MAX_W = 1920, BASE_H = 860, MIN_S = 0.76;
  var mq = window.matchMedia('(min-width: ' + Math.ceil(MIN_W * MIN_S) + 'px) and (min-height: ' + Math.ceil(BASE_H * MIN_S) + 'px)');
  function fit() {
    var on = mq.matches;
    root.classList.toggle('fit', on);
    if (!on) return false;
    var vw = root.clientWidth, vh = root.clientHeight;
    if (!vw || !vh) return true;
    var s = Math.min(vh / BASE_H, vw / MIN_W);
    var w = Math.min(MAX_W, vw / s);
    root.style.setProperty('--s', s.toFixed(5));
    root.style.setProperty('--W', w.toFixed(2) + 'px');
    root.style.setProperty('--H', (vh / s).toFixed(2) + 'px');
    root.style.setProperty('--ox', ((vw - w * s) / 2).toFixed(2) + 'px');
    return true;
  }
  window.__fit = fit;
  fit();
  var isFit = function () { return root.classList.contains('fit'); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------
     ユーティリティ
     --------------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 説明文の簡易マークアップ → HTML
       [[3|題名]]      場面3へのリンク（3「題名」と表示）
       [[3:2|題名]]    場面3の段階3（0始まりで2）へのリンク
       `code`          等幅
       **強調**        太字
       {e|電子}        色付きの語（e h p r d x）  */
  function rich(s) {
    s = esc(s);
    s = s.replace(/\[\[(\d+)(?::(\d+))?\|([^\]]+)\]\]/g, function (_, n, st, name) {
      return '<a class="xref" href="#s' + n + '" data-go="' + n + '"' + (st ? ' data-step="' + st + '"' : '') + '>' + n + '「' + name + '」</a>';
    });
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\{(e|h|p|r|d|x)\|([^}]+)\}/g, '<span class="tag $1">$2</span>');
    return s;
  }
  var util = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    mod: function (v, m) { return ((v % m) + m) % m; },
    /* t0 から dur 秒かけて 0→1 になる進み具合（前は0、後は1のまま） */
    prog: function (t, t0, dur) { return util.clamp((t - t0) / dur, 0, 1); },
    ease: {
      inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
      out: function (t) { return 1 - (1 - t) * (1 - t); },
      in: function (t) { return t * t; },
      back: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
    },
    /* period 秒でなめらかに 0→1→0 を繰り返す */
    pulse: function (t, period) { return 0.5 - 0.5 * Math.cos(2 * Math.PI * t / (period || 1)); },
    /* period 秒で 0→1 を繰り返す（鋸波） */
    cycle: function (t, period) { return util.mod(t, period || 1) / (period || 1); },
    /* 0..1 の f を n 個の区間に分けたとき、いまの区間番号 */
    seg: function (f, n) { return Math.min(n - 1, Math.floor(util.clamp(f, 0, 0.999999) * n)); },
    fmt: function (n, d) { return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); },
    /* v を [a,b] から [c,d] へ比例で写す（はみ出しは切り詰める） */
    remap: function (v, a, b, c, d) { return c + (d - c) * util.clamp((v - a) / (b - a), 0, 1); },
    /* 時刻 t を、長さ durs[] の区間の列に当てはめる。{ i: いまの区間, f: 区間内の進み 0..1, done: 全部終わった }。
       loop が真なら最後まで行ったら最初に戻る */
    seq: function (t, durs, loop) {
      var total = 0, k;
      for (k = 0; k < durs.length; k++) total += durs[k];
      if (loop) t = util.mod(t, total);
      var acc = 0;
      for (k = 0; k < durs.length; k++) {
        if (t < acc + durs[k]) return { i: k, f: (t - acc) / durs[k], done: false, t: t - acc };
        acc += durs[k];
      }
      return { i: durs.length - 1, f: 1, done: true, t: durs[durs.length - 1] };
    },
    esc: esc,
    rich: rich
  };

  /* ---------------------------------------------------------------
     SVG の部品づくり。属性は {cls: 'f-e w2'} のように書く（class の代わりに cls も可）
     --------------------------------------------------------------- */
  var NS = 'http://www.w3.org/2000/svg';
  function attrs(e, a) {
    if (!a) return e;
    for (var k in a) {
      var v = a[k];
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'cls') e.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') { for (var p in v) e.style[p] = v[p]; }
      else e.setAttribute(k, v);
    }
    return e;
  }
  function el(tag, a, parent) {
    var e = document.createElementNS(NS, tag);
    attrs(e, a);
    if (parent) parent.appendChild(e);
    return e;
  }
  function merge(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var j in b) o[j] = b[j]; return o; }
  var mkCount = 0;
  var svg = {
    NS: NS,
    el: el,
    attrs: attrs,
    g: function (a, p) { return el('g', a, p); },
    rect: function (x, y, w, h, a, p) { return el('rect', merge({ x: x, y: y, width: w, height: h }, a), p); },
    circle: function (cx, cy, r, a, p) { return el('circle', merge({ cx: cx, cy: cy, r: r }, a), p); },
    line: function (x1, y1, x2, y2, a, p) { return el('line', merge({ x1: x1, y1: y1, x2: x2, y2: y2 }, a), p); },
    path: function (d, a, p) { return el('path', merge({ d: d }, a), p); },
    poly: function (pts, a, p) {
      return el('polyline', merge({ points: pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' ') }, a), p);
    },
    polygon: function (pts, a, p) {
      return el('polygon', merge({ points: pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' ') }, a), p);
    },
    text: function (x, y, s, a, p) { return el('text', merge({ x: x, y: y, text: s }, a), p); },
    /* 複数行の文字。lines は配列、lh は行の高さ */
    lines: function (x, y, lines, a, p, lh) {
      var t = el('text', merge({ x: x, y: y }, a), p);
      lines.forEach(function (s, i) { el('tspan', { x: x, dy: i ? (lh || 15) : 0, text: s }, t); });
      return t;
    },
    clear: function (node) { while (node.firstChild) node.removeChild(node.firstChild); },
    /* 道（path / line / polyline）の長さ。非表示のうちは 0 になることがあるので、使うたびに測り直す */
    len: function (pathEl) {
      if (pathEl.__len) return pathEl.__len;
      var L = 0;
      try { L = pathEl.getTotalLength(); } catch (e) { L = 0; }
      if (L) pathEl.__len = L;
      return L;
    },
    /* 道の上の、始点から f（0..1）の位置の点 */
    along: function (pathEl, f) {
      var L = svg.len(pathEl);
      if (!L) return { x: 0, y: 0 };
      return pathEl.getPointAtLength(util.clamp(f, 0, 1) * L);
    },
    /* 矢印の先端。svg ごとに作り、 markers(svg)('e') のように色を指定して marker-end に渡す */
    markers: function (svgEl) {
      if (svgEl.__mk) return svgEl.__mk;
      var prefix = 'mk' + (++mkCount);
      var defs = el('defs');
      svgEl.insertBefore(defs, svgEl.firstChild);
      ['fg', 'mid', 'dim', 'e', 'h', 'p', 'r', 'd', 'x'].forEach(function (c) {
        var m = el('marker', { id: prefix + '-' + c, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', cls: 'f-' + c }, m);
      });
      svgEl.__mk = function (c) { return 'url(#' + prefix + '-' + (c || 'fg') + ')'; };
      return svgEl.__mk;
    },
    show: function (node, on) { node.style.display = on ? '' : 'none'; return node; },
    fade: function (node, on) { node.classList.add('fade'); node.classList.toggle('hide', !on); return node; },
    /* 部品（g など）を道の上の f（0..1）の位置へ移す。rotate が真なら進行方向に向ける */
    place: function (node, pathEl, f, rotate) {
      var L = svg.len(pathEl);
      if (!L) return node;
      f = util.clamp(f, 0, 1);
      var p = pathEl.getPointAtLength(f * L);
      var tr = 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')';
      if (rotate) {
        var q = pathEl.getPointAtLength(Math.min(L, f * L + 1));
        var r = pathEl.getPointAtLength(Math.max(0, f * L - 1));
        tr += ' rotate(' + (Math.atan2(q.y - r.y, q.x - r.x) * 180 / Math.PI).toFixed(1) + ')';
      }
      node.setAttribute('transform', tr);
      return node;
    },
    /* 枠付きの札。中央 (x,y)。opts: { cls: 文字のクラス, box: 枠のクラス, pad, rx, w: 幅を決め打ち } */
    label: function (parent, x, y, text, opts) {
      opts = opts || {};
      var g = el('g', { transform: 'translate(' + x + ',' + y + ')', cls: opts.gcls }, parent);
      var t = el('text', { x: 0, y: 4, text: text, cls: 't-c ' + (opts.cls || 't-sm t-b') }, g);
      var w = opts.w;
      if (!w) {
        try { w = t.getBBox().width; } catch (e) { w = 0; }
        if (!w) w = String(text).length * ((opts.fs || 11) * 0.95);
        w += (opts.pad == null ? 16 : opts.pad);
      }
      var h = opts.h || 22;
      g.insertBefore(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: opts.rx == null ? 4 : opts.rx, cls: opts.box || 'f-sf s-rule w1' }), t);
      return g;
    },
    /* 矢印。color は markers と同じ名前（fg / e / h …）。attrs で太さなどを足す */
    arrow: function (parent, x1, y1, x2, y2, color, attrs) {
      var owner = parent.ownerSVGElement || parent;
      var mk = svg.markers(owner);
      return el('line', merge({ x1: x1, y1: y1, x2: x2, y2: y2, cls: 's-' + (color || 'fg') + ' w2', 'marker-end': mk(color || 'fg') }, attrs), parent);
    }
  };

  /* ---------------------------------------------------------------
     よく使う動き
     --------------------------------------------------------------- */
  /* 道に沿って粒を流す。update(dt) を毎フレーム呼ぶ。speed は px/秒（負なら逆向き）。
     set('speed', 120) で途中から速さを変えられる。 */
  function flow(pathEl, opts) {
    var o = merge({ count: 8, speed: 60, r: 3.5, cls: 'f-e', parent: null, reverse: false, jitter: 0, fade: false, phase: 0 }, opts || {});
    var parent = o.parent || pathEl.parentNode;
    var g = el('g', { cls: 'flow' }, parent);
    var dots = [], seeds = [];
    for (var i = 0; i < o.count; i++) {
      dots.push(el('circle', { r: o.r, cls: o.cls }, g));
      seeds.push(Math.sin(i * 12.9898 + 78.233));  // -1..1 の疑似乱数（毎回同じ並び）
    }
    var phase = o.phase, L = 0;
    var api = {
      g: g, dots: dots, o: o,
      update: function (dt) {
        if (!L) { L = svg.len(pathEl); if (!L) return; }
        phase = util.mod(phase + (dt || 0) * o.speed / L, 1);
        var n = dots.length;
        for (var k = 0; k < n; k++) {
          var f = util.mod(phase + k / n, 1);
          if (o.reverse) f = 1 - f;
          var p = pathEl.getPointAtLength(f * L);
          var d = dots[k];
          d.setAttribute('cx', (p.x + seeds[k] * o.jitter).toFixed(2));
          d.setAttribute('cy', (p.y + seeds[(k + 3) % n] * o.jitter).toFixed(2));
          if (o.fade) d.style.opacity = Math.sin(Math.PI * f).toFixed(3);
        }
      },
      set: function (k, v) { o[k] = v; if (k === 'r') dots.forEach(function (d) { d.setAttribute('r', v); }); if (k === 'cls') dots.forEach(function (d) { d.setAttribute('class', v); }); return api; },
      show: function (on) { g.style.display = on ? '' : 'none'; return api; },
      reset: function () { L = 0; phase = o.phase; return api; }
    };
    return api;
  }
  /* 正弦波を path に描く。x0..x1 の範囲、中心 y、振幅 amp、波長 lambda（px）、speed は位相の進む速さ（px/秒）。
     env(f) を渡すと、0..1 の位置ごとに振幅を掛ける（減衰や包絡線）。 */
  function wave(pathEl, opts) {
    var o = merge({ x0: 0, x1: 300, y: 0, amp: 20, lambda: 80, speed: 60, samples: 0, env: null, phase: 0 }, opts || {});
    var phase = o.phase;
    var api = {
      o: o,
      get phase() { return phase; },
      update: function (dt) { phase += (dt || 0) * o.speed; api.draw(); },
      draw: function () {
        var n = o.samples || Math.max(24, Math.round((o.x1 - o.x0) / 3));
        var d = '';
        for (var i = 0; i <= n; i++) {
          var x = o.x0 + (o.x1 - o.x0) * i / n;
          var a = o.env ? o.amp * o.env((x - o.x0) / (o.x1 - o.x0)) : o.amp;
          var y = o.y - a * Math.sin(2 * Math.PI * (x - phase) / o.lambda);
          d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
        }
        pathEl.setAttribute('d', d);
      },
      set: function (k, v) { o[k] = v; return api; }
    };
    api.draw();
    return api;
  }
  var anim = { flow: flow, wave: wave };

  /* ---------------------------------------------------------------
     動きの設定（止める・速さ・自動で進む）。この閲覧者の便宜として localStorage に残す
     --------------------------------------------------------------- */
  var motion = { playing: !reduced.matches, speed: 1, auto: false };
  try {
    var saved = JSON.parse(localStorage.getItem('ytm-motion') || 'null');
    if (saved) {
      if (typeof saved.playing === 'boolean' && !reduced.matches) motion.playing = saved.playing;
      if ([0.5, 1, 2].indexOf(Number(saved.speed)) >= 0) motion.speed = Number(saved.speed);
      if (typeof saved.auto === 'boolean') motion.auto = saved.auto;
    }
  } catch (e) { /* 使えなければ既定のまま */ }
  function saveMotion() { try { localStorage.setItem('ytm-motion', JSON.stringify(motion)); } catch (e) { /* 無視 */ } }

  /* ---------------------------------------------------------------
     章の登録と初期化
     --------------------------------------------------------------- */
  var DEF = null, inited = false, ctxs = [], scenes = [], active = null, curScene = 0, STEPPERS = {};
  var ui = {}, LINKS = { next: null, prev: null, isHome: false }, leaving = false;

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function chapter(def) { DEF = def || {}; onReady(init); }
  onReady(function () { if (!DEF) { DEF = {}; init(); } });

  function safe(ctx, fn) {
    try { fn(); }
    catch (err) {
      if (!ctx.__err) {
        ctx.__err = true;
        console.error('[YT] scene ' + ctx.id + ' でエラー:', err);
        var p = document.createElement('p');
        p.className = 'anim-err';
        p.textContent = '図の描画でエラー: ' + (err && err.message ? err.message : err);
        (ctx.root.querySelector('.anim-fig') || ctx.root).appendChild(p);
      }
    }
  }

  function init() {
    if (inited) return;
    inited = true;
    fit();
    scenes = $$('section.scene');
    if (!scenes.length) return;
    var meta = DEF.meta || {};
    LINKS = chapterLinks(meta);
    buildTopbar(meta);
    fillAuto(meta);
    ctxs = scenes.map(function (s, i) { return makeCtx(s, i, (DEF.scenes || {})[s.id]); });
    wireNav();
    wireKeys();
    wireHl();
    var m = /^#s(\d+)(?:\.(\d+))?$/.exec(location.hash || '');
    if (m) {
      curScene = Math.min(scenes.length - 1, Number(m[1]));
      if (m[2] && ctxs[curScene] && ctxs[curScene].steps) goStep(ctxs[curScene], Number(m[2]) - 1);
    } else if (location.hash === '#last') curScene = scenes.length - 1;
    showScene(curScene, false);
    if (!isFit()) watchMobile();
    requestAnimationFrame(loop);
    window.oneScreen = {
      show: function (n) { showScene(n, false); },
      get count() { return scenes.length; },
      ctx: function (n) { return ctxs[n]; },
      motion: motion
    };
  }

  /* ---------- 上部バー（1画面版だけに出る） ---------- */
  function buildTopbar(meta) {
    var app = $('.app');
    if (!app) return;
    var bar = $('.topbar', app);
    if (!bar) { bar = document.createElement('header'); bar.className = 'topbar'; app.insertBefore(bar, app.firstChild); }
    var home = meta.home || '../index.html';
    // meta.actions（[{ href, label, sub, go, primary, title }]）があれば、色の凡例の代わりにボタンを並べる（目次で使う）
    var acts = meta.actions && meta.actions.length ? meta.actions : null;
    bar.innerHTML =
      '<a class="brand" href="' + esc(home) + '" title="目次へ"><span class="brand-eyebrow"></span><span class="brand-title"></span></a>' +
      '<nav class="tabs" aria-label="場面"></nav>' +
      (acts ? '<nav class="topbar-acts" aria-label="始める"></nav>' : '<p class="topbar-key" aria-label="色の意味"></p>') +
      '<div class="motion" role="group" aria-label="動き">' +
        '<button type="button" class="mo-btn" id="mo-play" aria-pressed="true" title="動きを止める／動かす（スペースキー）"></button>' +
        '<select class="mo-sel" id="mo-speed" aria-label="動きの速さ"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select>' +
        '<label class="mo-auto" title="段階・場面・章を自動で進める（段階は本文の長さに応じて約 12〜30 秒、表紙とまとめは約 15 秒）"><input type="checkbox" id="mo-auto">自動で進む</label>' +
      '</div>' +
      // 移動はこの ‹ › に集める。› だけ押していけば、段階・場面・章の順に全ページを通せる
      '<div class="pager">' +
        '<button type="button" class="pg" id="pg-prev" title="前へ（←キー）" aria-label="前へ">‹</button>' +
        '<button type="button" class="pg primary" id="pg-next" title="次へ（→キー）" aria-label="次へ">›</button>' +
      '</div>';
    $('.brand-eyebrow', bar).textContent = meta.eyebrow || '';
    $('.brand-title', bar).textContent = meta.title || document.title;
    var tabs = $('.tabs', bar);
    scenes.forEach(function (s, i) {
      var a = document.createElement('a');
      a.className = 'tab';
      a.href = '#' + s.id;
      a.dataset.go = i;
      var label = s.dataset.tab || (i ? '場面' + i : '表紙');
      a.innerHTML = (i ? '<span class="n">' + i + '</span>' : '') + esc(label);
      tabs.appendChild(a);
    });
    if (acts) {
      var actNav = $('.topbar-acts', bar);
      acts.forEach(function (x) {
        var a = document.createElement('a');
        a.className = 'act' + (x.primary ? ' primary' : '');
        a.href = x.href;
        if (x.go !== undefined) a.dataset.go = x.go;
        if (x.title) a.title = x.title;
        a.innerHTML = (x.sub ? '<small>' + esc(x.sub) + '</small> ' : '') + esc(x.label);
        actNav.appendChild(a);
      });
    } else {
      $('.topbar-key', bar).innerHTML = legendHtml(meta.legend);
    }
    ui.play = $('#mo-play', bar);
    ui.speed = $('#mo-speed', bar);
    ui.auto = $('#mo-auto', bar);
    ui.prev = $('#pg-prev', bar);
    ui.next = $('#pg-next', bar);
    ui.play.addEventListener('click', function () { setPlaying(!motion.playing); });
    ui.speed.value = String(motion.speed);
    ui.speed.addEventListener('change', function () { motion.speed = Number(ui.speed.value) || 1; saveMotion(); });
    ui.auto.checked = motion.auto;
    ui.auto.addEventListener('change', function () { motion.auto = ui.auto.checked; saveMotion(); if (active) active.ts = 0; });
    syncPlay();
  }
  function legendHtml(legend) {
    return (legend || []).map(function (l) { return '<span><i class="sw ' + esc(l.c) + '"></i>' + esc(l.label) + '</span>'; }).join('');
  }
  function setPlaying(on) {
    motion.playing = on;
    saveMotion();
    syncPlay();
    if (active) settle(active);
  }
  function syncPlay() {
    if (ui.play) {
      ui.play.setAttribute('aria-pressed', motion.playing ? 'true' : 'false');
      ui.play.textContent = motion.playing ? '❚❚ 止める' : '▶ 動かす';
    }
    $$('.m-play').forEach(function (b) { b.textContent = motion.playing ? '❚❚' : '▶'; b.setAttribute('aria-pressed', motion.playing ? 'true' : 'false'); });
  }

  /* 表紙の操作の説明（1画面版だけに出る。章の HTML には <p class="keys fit-only" data-auto></p> と書く） */
  var KEYS_HTML = '右上の <kbd>›</kbd>（または<kbd>→</kbd>）だけを押していけば、段階・場面・章の順に全ページを通して見られる。章のまとめの次は、次の章の場面1。<kbd>‹</kbd>（<kbd>←</kbd>）で戻り、<kbd>↓</kbd><kbd>↑</kbd>で場面を移り、<kbd>スペース</kbd>で動きを止める。図の大きさや速さは見やすいように誇張してある。';
  /* data-auto の付いた凡例・操作の説明・章の前後リンクを meta から埋める */
  function fillAuto(meta) {
    $$('.legend[data-auto]').forEach(function (p) { p.innerHTML = legendHtml(meta.legend); });
    $$('.keys[data-auto]').forEach(function (p) { p.innerHTML = KEYS_HTML; });
    var glossHref = (meta.home || '../index.html').replace(/index\.html$/, '') + 'glossary.html';
    $$('.chnav[data-auto]').forEach(function (nav) {
      var h = '';
      if (meta.prev) h += '<a class="prev" href="' + esc(meta.prev.href) + '">‹ <small>前の章</small> ' + esc(meta.prev.title) + '</a>';
      h += '<a class="home" href="' + esc(meta.home || '../index.html') + '">目次</a>';
      if (nav.closest('.sc-wrap')) h += '<a class="gloss" href="' + esc(glossHref) + '">用語索引</a>';
      if (meta.next) h += '<a class="next" href="' + esc(meta.next.href) + '"><small>次の章</small> ' + esc(meta.next.title) + ' ›</a>';
      nav.innerHTML = h;
      // まとめの下に、次の章の導入（次の章の表紙のリードの 1 文目。meta.next.lead）を出す。通しで進むときは表紙を飛ばすので、
      // 章の境目で「前の章を受ける一文」が消えないようにする
      if (meta.next && meta.next.lead && nav.closest('.sc-wrap')) {
        var num = /(\d+)-[a-z]/.exec(meta.next.href || '');
        var p = document.createElement('p');
        p.className = 'next-lead';
        p.innerHTML = '<small>次の章</small> <b>' + (num ? '第' + Number(num[1]) + '章 ' : '') + esc(meta.next.title) + '</b><span class="lead-text">' + esc(meta.next.lead) + '</span><span class="go">右上の › で進む</span>';
        nav.parentNode.insertBefore(p, nav);
      }
    });
    $$('[data-chapter-title]').forEach(function (e) { e.textContent = meta.title || ''; });
  }

  /* ---------- 場面ごとの文脈（ctx） ---------- */
  function makeCtx(sec, i, def) {
    def = def || {};
    var ctx = {
      id: sec.id, index: i, root: sec, def: def,
      svg: sec.querySelector('svg[data-anim]') || sec.querySelector('.anim-fig svg') || sec.querySelector('figure svg') || sec.querySelector('svg'),
      steps: (def.steps && def.steps.length) ? def.steps : null,
      step: 0, t: 0, ts: 0, state: {}, ready: false, ui: null,
      $: function (s) { return sec.querySelector(s); },
      $$: function (s) { return $$(s, sec); },
      goStep: function (n) { goStep(ctx, n); },
      next: function () { goStep(ctx, ctx.step + 1); },
      prev: function () { goStep(ctx, ctx.step - 1); },
      /* 図を描き直す（止めているときにも1回だけ frame を呼ぶ） */
      settle: function () { settle(ctx); }
    };
    if (ctx.steps) {
      buildStepper(ctx);
      STEPPERS[i] = { step: function (d) { goStep(ctx, ctx.step + d); }, goStep: function (n) { goStep(ctx, n); } };
    }
    return ctx;
  }

  function buildStepper(ctx) {
    var sec = ctx.root;
    var slot = sec.querySelector('.narr-slot');
    var panel = document.createElement('div');
    panel.className = (slot ? slot.className.replace(/\bnarr-slot\b/, '') : 'a-panel') + ' panel';
    panel.innerHTML =
      '<div class="narr" aria-live="polite"><p class="where"></p><h3></h3><p class="txt"></p></div>' +
      '<div class="ctrls">' +
        '<button type="button" class="btn st-reset">最初から</button>' +
        '<button type="button" class="btn st-prev">← 前へ</button>' +
        '<span class="counter st-count"></span>' +
        '<button type="button" class="btn primary st-next" data-measure="next">次へ →</button>' +
        '<span class="hint">右上の › か →キーで進む</span>' +
      '</div>';
    if (slot) slot.replaceWith(panel);
    else {
      var left = sec.querySelector('.a-left') || sec;
      var lead = left.querySelector('.a-lead');
      if (lead && lead.nextSibling) left.insertBefore(panel, lead.nextSibling); else left.appendChild(panel);
    }
    var mbar = document.createElement('div');
    mbar.className = 'mbar a-mbar';
    mbar.setAttribute('role', 'group');
    mbar.setAttribute('aria-label', '一歩ずつ進める');
    mbar.innerHTML =
      '<button type="button" class="btn m-reset">最初から</button>' +
      '<button type="button" class="btn arrow m-prev" aria-label="前へ">←</button>' +
      '<p class="mnow"><span class="counter m-count"></span><span class="mtitle"></span></p>' +
      '<button type="button" class="btn m-play" aria-label="動きを止める／動かす" aria-pressed="true">❚❚</button>' +
      '<button type="button" class="btn primary arrow m-next" aria-label="次へ">→</button>';
    sec.appendChild(mbar);
    ctx.ui = {
      where: panel.querySelector('.where'), title: panel.querySelector('h3'), text: panel.querySelector('.txt'),
      count: panel.querySelector('.st-count'), prev: panel.querySelector('.st-prev'), next: panel.querySelector('.st-next'), reset: panel.querySelector('.st-reset'),
      mcount: mbar.querySelector('.m-count'), mtitle: mbar.querySelector('.mtitle'), mprev: mbar.querySelector('.m-prev'), mnext: mbar.querySelector('.m-next'), mreset: mbar.querySelector('.m-reset'), mplay: mbar.querySelector('.m-play')
    };
    ctx.ui.next.addEventListener('click', ctx.next);
    ctx.ui.prev.addEventListener('click', ctx.prev);
    ctx.ui.reset.addEventListener('click', function () { goStep(ctx, 0); });
    ctx.ui.mnext.addEventListener('click', ctx.next);
    ctx.ui.mprev.addEventListener('click', ctx.prev);
    ctx.ui.mreset.addEventListener('click', function () { goStep(ctx, 0); });
    ctx.ui.mplay.addEventListener('click', function () { setPlaying(!motion.playing); });
    renderStepText(ctx);
  }

  function renderStepText(ctx) {
    var st = ctx.steps[ctx.step], u = ctx.ui, n = ctx.steps.length;
    u.where.textContent = st.where || '';
    u.title.textContent = st.title || '';
    u.text.innerHTML = rich(st.text || '');
    var count = (ctx.step + 1) + ' / ' + n;
    u.count.textContent = count;
    u.mcount.textContent = count;
    u.mtitle.textContent = st.title || '';
    var first = ctx.step === 0, last = ctx.step === n - 1;
    u.prev.disabled = first; u.mprev.disabled = first;
    u.next.disabled = last; u.mnext.disabled = last;
    if (ctx.index === curScene) syncPager();
  }

  function goStep(ctx, n) {
    if (!ctx.steps) return;
    n = util.clamp(n, 0, ctx.steps.length - 1);
    var prevIdx = ctx.step;
    ctx.step = n;
    ctx.ts = 0;
    renderStepText(ctx);
    if (ctx.ready) enterStep(ctx, prevIdx);
    if (inited && ctx.index === curScene) { syncHash(); rememberPlace(); }
  }
  /* 1画面版では URL の末尾を今の場面と段階にする（#s3 ＝ 場面3 の最初の段階、#s3.2 ＝ 場面3 の段階2）。
     ‹ › やキーで移っても、再読み込み・共有で同じ所に戻れる。履歴は増やさない */
  function hashFor(n) {
    var c = ctxs[n];
    return '#' + scenes[n].id + (c && c.steps && c.step > 0 ? '.' + (c.step + 1) : '');
  }
  function syncHash() {
    if (!isFit() || !history.replaceState) return;
    var h = hashFor(curScene);
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function enterStep(ctx, prevIdx) {
    var st = ctx.steps[ctx.step];
    safe(ctx, function () {
      if (st.enter) st.enter(ctx, prevIdx);
      if (ctx.def.onStep) ctx.def.onStep(ctx, ctx.step, prevIdx);
    });
    settle(ctx);
  }
  function ensureSetup(ctx) {
    if (ctx.ready) return;
    ctx.ready = true;
    safe(ctx, function () { if (ctx.def.setup) ctx.def.setup(ctx); });
    if (ctx.steps) enterStep(ctx, -1);
  }
  function settle(ctx) {
    if (!ctx.ready || !ctx.def.frame) return;
    safe(ctx, function () { ctx.def.frame(ctx, ctx.t, 0); });
  }
  function activate(ctx) {
    if (active === ctx) return;
    if (active && active.def.leave) safe(active, function () { active.def.leave(active); });
    active = ctx;
    if (!ctx) return;
    ensureSetup(ctx);
    if (ctx.def.enterScene) safe(ctx, function () { ctx.def.enterScene(ctx); });
    ctx.ts = 0;
    settle(ctx);
  }

  /* 「自動で進む」で 1 段階に留まる秒数。段階の dur → 章の stepDur → 本文の字数から（8 秒 ＋ 0.1 秒×字数、12〜30 秒） */
  function stepWait(ctx) {
    var st = ctx.steps[ctx.step];
    if (st.dur) return st.dur;
    if (DEF.stepDur) return DEF.stepDur;
    var plain = String(st.text || '').replace(/\{[ehprdx]\|([^}]+)\}/g, '$1').replace(/\[\[\d+(?::\d+)?\|([^\]]+)\]\]/g, '$1').replace(/\*\*|`/g, '');
    var n = Array.from ? Array.from(plain).length : plain.length;
    return util.clamp(8 + 0.1 * n, 12, 30);
  }

  /* ---------- 動きの時計 ---------- */
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.1) dt = 0.1;
    dt *= motion.speed;
    var ctx = active;
    if (!ctx || !motion.playing || document.hidden || leaving) return;
    ctx.t += dt;
    ctx.ts += dt;
    if (ctx.def.frame) safe(ctx, function () { ctx.def.frame(ctx, ctx.t, dt); });
    if (!motion.auto) return;
    if (isFit()) {
      // 段階は stepDur（既定 10 秒）、段階の無い場面（表紙・まとめ）は def.dur か stillDur（既定 15 秒）ごとに進む
      var wait = ctx.steps ? stepWait(ctx) : (ctx.def.dur || DEF.stillDur || 15);
      if (ctx.ts >= wait) { ctx.ts = 0; goNext(); }
    } else if (ctx.steps && ctx.step < ctx.steps.length - 1) {
      if (ctx.ts >= stepWait(ctx)) ctx.next();
    }
  }

  /* ---------- 通しで進む（段階 → 場面 → 章） ---------- */
  function chapterLinks(meta) {
    var home = meta.home || '../index.html', isHome = false;
    try { isHome = new URL(home, location.href).pathname === location.pathname; } catch (e) { /* 無視 */ }
    return {
      isHome: isHome,
      // 次の章は場面1 から（章の表紙は飛ばす。meta.next.href に # があればそのまま）
      next: meta.next ? { href: /#/.test(meta.next.href) ? meta.next.href : meta.next.href + '#s1', title: meta.next.title || '' } : null,
      // 前の章はまとめ（最後の場面）から。前の章が無ければ目次の表紙へ（目次そのものなら前は無い）
      prev: meta.prev ? { href: meta.prev.href + '#last', title: meta.prev.title || '' } : (isHome ? null : { href: home, title: '目次', home: true })
    };
  }
  function leaveTo(href) {
    if (leaving) return;
    leaving = true;
    location.href = href;
  }
  /* d 場面だけ移る。章の端を越えるときは前後の章へ。toLastStep なら移った先の場面は最後の段階から */
  function goScene(d, toLastStep) {
    var n = curScene + d;
    if (n >= 0 && n < scenes.length) {
      var c = ctxs[n];
      if (toLastStep && c && c.steps) goStep(c, c.steps.length - 1);
      showScene(n, true);
      return true;
    }
    var to = d > 0 ? LINKS.next : LINKS.prev;
    if (to) { leaveTo(to.href); return true; }
    return false;
  }
  function goNext() {
    if (LINKS.isHome && LINKS.next) { leaveTo(LINKS.next.href); return true; }   // 目次では › で第1章の場面1へ
    var c = ctxs[curScene];
    if (c && c.steps && c.step < c.steps.length - 1) { goStep(c, c.step + 1); return true; }
    return goScene(1, false);
  }
  function goPrev() {
    var c = ctxs[curScene];
    if (c && c.steps && c.step > 0) { goStep(c, c.step - 1); return true; }
    // 場面1 の最初では、› で来たときと逆に、表紙を飛ばして前の章のまとめへ（前の章が無ければ目次へ）
    if (curScene <= 1 && LINKS.prev && !LINKS.isHome) { leaveTo(LINKS.prev.href); return true; }
    return goScene(-1, true);
  }
  /* 今いる章と場面を残す（目次の「続きから」に使う。目次そのものは残さない） */
  function rememberPlace() {
    if (LINKS.isHome) return;
    var meta = DEF.meta || {};
    var c = ctxs[curScene];
    try { localStorage.setItem('ytm-last', JSON.stringify({ path: location.pathname, scene: curScene, step: c && c.steps ? c.step : 0, title: meta.title || document.title, eyebrow: meta.eyebrow || '' })); } catch (e) { /* 無視 */ }
  }

  /* ---------- 場面の切り替え ---------- */
  function syncNav() {
    $$('.tabs [data-go]').forEach(function (t) {
      if (Number(t.dataset.go) === curScene) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    });
    syncPager();
  }
  /* 上部バーの ‹ ›: 押すとどこへ移るかを題（ツールチップ）に出す。最後の章の最後では › を押せない */
  function syncPager() {
    if (!ui.next) return;
    var c = ctxs[curScene], n = scenes.length;
    var atStart = LINKS.isHome ? curScene === 0 : (curScene <= 1 && !(c && c.steps && c.step > 0));
    var atEnd = LINKS.isHome ? !!LINKS.next : (curScene === n - 1 && !(c && c.steps && c.step < c.steps.length - 1));
    ui.prev.disabled = atStart && !LINKS.prev && (LINKS.isHome || curScene === 0);
    ui.prev.title = atStart && LINKS.prev ? (LINKS.prev.home ? '目次へ（←キー）' : '前の章へ：' + LINKS.prev.title + '（←キー）') : '前へ（←キー）';
    ui.next.disabled = atEnd && !LINKS.next;
    ui.next.title = atEnd ? (LINKS.next ? (LINKS.isHome ? '第1章から通して見る：' : '次の章へ：') + LINKS.next.title + '（→キー）' : 'おわり') : '次へ（→キー）';
  }
  function showScene(n, move) {
    n = Math.max(0, Math.min(scenes.length - 1, n));
    var changed = n !== curScene;
    curScene = n;
    scenes.forEach(function (s, i) {
      s.classList.toggle('on', i === n);
      s.classList.remove('enter');
    });
    if (isFit()) {
      if (changed && move && !reduced.matches) { void scenes[n].offsetWidth; scenes[n].classList.add('enter'); }
      scenes[n].scrollTop = 0;
      activate(ctxs[n]);
    } else if (move) {
      scenes[n].scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    }
    syncNav();
    // 1画面版では URL の末尾も今の場面と段階にする（‹ › や キーで移っても、再読み込みで同じ所に戻れる）
    if (changed || /^#(last|s\d+\.\d+)$/.test(location.hash)) syncHash();
    rememberPlace();
    if (changed && ctxs[n] && ctxs[n].def.resize) safe(ctxs[n], function () { ctxs[n].def.resize(ctxs[n]); });
  }

  function wireNav() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-go]');
      if (!a) return;
      e.preventDefault();
      var n = Number(a.dataset.go);
      if (a.dataset.step !== undefined && STEPPERS[n]) STEPPERS[n].goStep(Number(a.dataset.step));
      showScene(n, true);
      if (isFit()) syncHash(); else if (history.replaceState) history.replaceState(null, '', '#' + scenes[n].id);
    });
    if (ui.prev) ui.prev.addEventListener('click', function () { goPrev(); });
    if (ui.next) ui.next.addEventListener('click', function () { goNext(); });

    var wasFit = isFit(), raf = 0;
    function relayout() {
      raf = 0;
      fit();
      var f = isFit();
      if (f !== wasFit) {
        wasFit = f;
        if (f) { window.scrollTo(0, 0); showScene(curScene, false); }
        else { scenes.forEach(function (s) { s.classList.remove('enter'); }); scenes[curScene].scrollIntoView({ block: 'start' }); watchMobile(); }
      }
      if (active && active.def.resize) safe(active, function () { active.def.resize(active); });
    }
    window.addEventListener('resize', function () { if (!raf) raf = requestAnimationFrame(relayout); });
    window.addEventListener('hashchange', function () {
      var m = /^#s(\d+)(?:\.(\d+))?$/.exec(location.hash || '');
      if (m) {
        var n = Math.min(scenes.length - 1, Number(m[1]));
        if (m[2] && ctxs[n] && ctxs[n].steps) goStep(ctxs[n], Number(m[2]) - 1);
        showScene(n, true);
      } else if (location.hash === '#last') showScene(scenes.length - 1, true);
    });
  }

  /* 縦読み版: 画面に最も大きく映っている場面を動かす */
  var mobileWatch = null;
  function watchMobile() {
    if (mobileWatch || !('IntersectionObserver' in window)) { if (!mobileWatch) activate(ctxs[curScene]); return; }
    var ratios = new Map();
    mobileWatch = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        ratios.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
        // 画面に入った場面は、いちばん大きく映る前に図を組み立てておく（空の箱を見せない）
        if (en.isIntersecting) { var c = ctxs[scenes.indexOf(en.target)]; if (c && !c.ready) { ensureSetup(c); settle(c); } }
      });
      if (isFit()) return;
      var best = null, bestR = 0;
      scenes.forEach(function (s, i) { var r = ratios.get(s) || 0; if (r > bestR) { bestR = r; best = i; } });
      if (best != null) { curScene = best; activate(ctxs[best]); }
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    scenes.forEach(function (s) { mobileWatch.observe(s); });
  }

  /* ---------- キー操作 ---------- */
  function wireKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) {
        if (!(t.tagName === 'BUTTON' && /^Arrow|^Page/.test(e.key))) return;
      }
      var k = e.key;
      if (k === ' ' && !e.shiftKey) { setPlaying(!motion.playing); e.preventDefault(); return; }
      if (e.shiftKey) return;
      if (isFit()) {
        if (k === 'ArrowDown' || k === 'PageDown') goScene(1, false);
        else if (k === 'ArrowUp' || k === 'PageUp') goScene(-1, false);
        else if (k === 'ArrowRight') goNext();
        else if (k === 'ArrowLeft') goPrev();
        else if (k === 'Home') showScene(0, true);
        else if (k === 'End') showScene(scenes.length - 1, true);
        else return;
        e.preventDefault();
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        var sc = t && t.closest && t.closest('.scene');
        var n = sc ? scenes.indexOf(sc) : curScene;
        if (STEPPERS[n]) { STEPPERS[n].step(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
      }
    });
  }

  /* ---------- 段落と図の対応（data-hl） ---------- */
  function wireHl() {
    $$('[data-hl]').forEach(function (src) {
      var sel = src.dataset.hl;
      var set = function (on) {
        $$(sel).forEach(function (e) { e.classList.toggle('lit', on); });
        src.classList.toggle('lit-src', on);
      };
      src.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') set(true); });
      src.addEventListener('pointerleave', function () { set(false); });
    });
  }

  window.YT = { util: util, svg: svg, anim: anim, chapter: chapter, motion: motion, rich: rich, esc: esc };
})();
