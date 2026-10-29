# 章の書き方

章は `chapters/NN-名前.html` の1ファイル。`chapters/01-denshi.html` を手本にして、同じ骨組みで書く。
共通 CSS（`assets/base.css`）と共通エンジン（`assets/engine.js`）は変更しない。章に足りない部品は章のスクリプトの中に書く。

## 1. ファイルの骨組み

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="icon" href="data:,">
<title>章の題 — YouTubeが見えるまで</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+JP:wght@400;500;600&family=Zen+Kaku+Gothic+New:wght@700&display=swap">
<link rel="stylesheet" href="../assets/base.css">
<script src="../assets/engine.js"></script>   <!-- head の中、defer なし -->
<style>/* この章だけのスタイル（なければ空でよい） */</style>
</head>
<body>
<div class="app">
<main class="scenes">
  <section class="scene sc-cover on" id="s0" data-tab="表紙">…</section>
  <section class="scene sc-anim" id="s1" data-tab="短い名"> … </section>
  …（s2〜s6 も sc-anim）
  <section class="scene sc-wrap" id="s7" data-tab="まとめ">…</section>
</main>
</div>
<script>
(() => {
  const U = YT.util, S = YT.svg, A = YT.anim;
  const s1 = { steps: [...], setup(ctx) {...}, onStep(ctx, i) {...}, frame(ctx, t, dt) {...} };
  …
  YT.chapter({ meta: {...}, scenes: { s1, s2, s3, s4, s5, s6 } });
})();
</script>
</body>
</html>
```

- 場面は `section.scene`、id は `s0` から順に。`data-tab` が上部バーのタブ名（2〜8文字）。
- 上部バー（タブ・凡例・動きの操作・‹›）はエンジンが `meta` と `data-tab` から組み立てる。HTML には書かない。
- 表紙の `<p class="legend" data-auto>`・`<p class="keys fit-only" data-auto>`（1画面版の操作の説明）と、`<nav class="chnav" data-auto>` はエンジンが `meta.legend` / `meta.prev` / `meta.next` から埋める。まとめの `chnav` の前には、次の章の導入（`meta.next.lead`）と用語索引へのリンクも出る。

## 2. 場面の型

| 型 | 使う所 | 1画面版の配置 | 必ず置くもの |
|---|---|---|---|
| `sc-cover` | 表紙 (s0) | 左に題・リード・凡例・キー操作、右に構成（目次）、下に章の移動と注記 | `.a-main`（eyebrow, h1, standfirst, legend[data-auto], keys.fit-only）, `nav.toc.a-toc`, `footer.cover-foot.a-foot`（chnav[data-auto] と注記） |
| `sc-anim` | 動く場面 (s1〜s6) | 左 37% に説明の列、右 63% に図 | `header.sh.a-sh`, `.col.a-left`（`p.prose.a-lead` → `.narr-slot.a-panel` → `.prose.a-after`）, `figure.anim-fig.a-fig`（`.fig-scroll[data-scroll-x] > svg[viewBox="0 0 960 560"]` と `figcaption`） |
| `sc-wrap` | まとめ (s7) | 左に要点、右に用語表、下に章の移動 | `ol.keypoints`（場面ごとに1文、場面へのリンク付き）, `table.gloss`（用語・定義・単位・代表値）, `.a-after > nav.chnav[data-auto]` |

- 本文の字数の目安（1画面に収めるため）: リード 70〜110 字、段階の本文 90〜160 字、補足（a-after）1 段落 90〜140 字、図の説明 1〜2 文。
- 段階（steps）は 4〜6 個。説明欄は最長の本文が入る高さ（`min-height: 210px`）を確保してあるので、本文が 160 字を超えると収まらない。
- 文字の強調は `{e|電子}` のような色付きの語（意味は凡例と同じ）か `**太字**`。位置で指さない（「右の図」ではなく「図2」「板 B」）。

## 3. エンジンの API

```js
YT.chapter({
  meta: {
    eyebrow: '第I部 電気 ／ 第1章',          // 上部バーの小さい字
    title: '電子と電流',                     // 上部バーの題
    home: '../index.html',
    prev: { href: '01-denshi.html', title: '電子と電流' },   // 第1章では省略
    next: { href: '03-transistor.html', title: 'トランジスタ', lead: '前の章の n 型・p 型・pn 接合を使って、「電圧で動くスイッチ」を作る。' }, // 最後の章（第29章）では省略。lead は次の章の表紙のリードの 1 文目（まとめの下に「次の章の導入」として出る。通しで進むときは表紙を飛ばすため）
    legend: [{ c: 'e', label: '電子・電流' }, { c: 'h', label: '＋の電荷' }, …],   // 2〜5 個
    actions: [{ href, label, sub, go, primary }]   // （目次だけ）上部バーに凡例の代わりに並べるボタン。go は data-go（場面番号）
  },
  stepDur: 10,          // 「自動で進む」の1段階の秒数（省略可。省略すると本文の字数から 8 秒 ＋ 0.1 秒×字数、12〜30 秒）
  stillDur: 15,         // 「自動で進む」で段階の無い場面（表紙・まとめ）に留まる秒数の既定（省略可。場面ごとには def.dur）
  scenes: {
    s1: {
      steps: [ { title: '見出し', text: '本文（簡易マークアップ可）', where: '（省略可）小さな前置き', dur: 12, enter(ctx, prevIdx) {} }, … ],
      setup(ctx) {},            // 場面を初めて開いたとき1回。ctx.svg に部品を作る
      onStep(ctx, i, prevIdx) {}, // 段階が変わった直後（setup の直後にも i=0 で呼ばれる）
      frame(ctx, t, dt) {},     // 表示中、毎フレーム。t は場面を開いてからの秒、dt は前フレームからの秒
      resize(ctx) {},           // 幅が変わったとき（省略可）
      leave(ctx) {}             // 別の場面に移るとき（省略可）
    }
  }
});
```

`ctx` のフィールド: `id`, `index`, `root`（section）, `svg`（場面の最初の `.anim-fig svg`）, `steps`, `step`（いまの段階 0 始まり）, `t`, `ts`（いまの段階に入ってからの秒）, `state`（自由に使う入れ物）, `$(sel)`, `$$(sel)`, `goStep(n)`, `next()`, `prev()`, `settle()`。

守ること:

- **`onStep` は差分ではなく「その段階の見た目」を全部決める。** 前へ戻る・飛ぶ操作があるので、`i` だけから状態が決まるように書く（`S.fade(g, i >= 2)` のように）。
- **`frame` は `dt = 0` でも正しく描く。** 動きを止めているとき、段階や場面が変わるたびに `frame(ctx, t, 0)` が1回呼ばれる。見た目は `ctx.step` と `t`/`ts` から決め、`dt` は積算（粒の移動）にだけ使う。
- `setup` の中では、まだ非表示の要素の `getBBox` を当てにしない（場面は表示された直後に setup が走るので、`ctx.svg` の中なら測れる）。`S.label` は幅を getBBox で測るので、`.hide`（opacity 0）の中では測れるが `display: none` の中では測れない。確実にしたいときは `{ w: 幅 }` を渡す。
- 例外が出ると、エンジンがその場面に赤い注記を出し `console.error('[YT] scene sN でエラー:', …)` に記録する。検証ツールがこれを拾う。

通しで進む（エンジンが受け持つ。章の側で書くことは無い）: 1画面版では、上部バー右上の ›（`#pg-next`）と → が「次の段階、段階の終わりなら次の場面、最後の場面（まとめ）なら `meta.next` の章の場面1（`#s1`。章の表紙は飛ばす）」へ進む。目次では › で第1章の場面1へ。‹（`#pg-prev`）と ← はその逆で、前の場面は最後の段階から、場面1 の最初の段階では表紙を飛ばして前の章のまとめ（`#last`）へ（第1章なら目次の表紙へ）。↓↑ は場面ごとで、章の端では前後の章へ。`meta.next` が無い章（第29章）の最後で › は押せない。› の題（ツールチップ）に、章をまたぐときの行き先を出す。場面が変わるたびに URL の末尾を今の場面（`#s3` など）に書き換える。移動をこの 1 か所に集めるため、1画面版では説明欄の「前へ」「次へ」と、章の表紙・まとめの「次の章」は出さない（説明欄の「次へ」は検証ツールが押して全段階を測るので、要素は残して隠す）。上部バーの幅が足りないときは、色の凡例が先に縮んで 2 段に折り返す（タブは縮めない）。「自動で進む」は段階を `dur`（無ければ章の `stepDur`、それも無ければ本文の字数から 12〜30 秒）、段階の無い場面を `def.dur`（既定 `stillDur` 15 秒）ごとに進め、章もまたぐ。今いる章・場面・段階は localStorage の `ytm-last` に残り、目次の表紙の「続きから」になる。URL の末尾は `#s3`（場面3 の最初の段階）か `#s3.2`（場面3 の段階2。1 始まり）で、‹ › やキーで移るたびに書き換わる。他の章の段階を指すリンクも `14-router.html#s4.3` と書ける。
まとめの場面では、`chnav` の前にエンジンが「次の章の導入」（`meta.next.lead`。次の章の表紙のリードの 1 文目）を出す。表紙のリードの 1 文目を変えたら、前の章の `meta.next.lead` も合わせる（`tools/build-glossary.mjs` は用語表だけで、lead は更新しない）。

簡易マークアップ（steps[].text で使える）: `[[3|電流と抵抗]]` 場面3へのリンク、`[[3:2|…]]` 場面3の段階3へ、`[[13-ethernet.html#s4|第13章 場面4]]` 他の章の場面へのリンク（`#s4.2` で段階2 まで指せる。文字はそのまま出る。2026-10-28 に足した）、`` `code` ``、`**太字**`、`{e|電子}` `{h|…}` `{p|…}` `{r|…}` `{d|…}` `{x|…}` 色付きの語。
HTML に直接書く本文（リード・補足・まとめ）ではこの記法は効かない。場面へのリンクは `<a class="xref" href="#s3" data-go="3">3「電流と抵抗」</a>`、色付きの語は `<span class="tag e">電子</span>` と書く。

## 4. 部品（YT.svg / YT.anim / YT.util）

```js
const U = YT.util, S = YT.svg, A = YT.anim;
S.el('circle', { cx: 10, cy: 10, r: 4, cls: 'f-e' }, parent)   // cls が class
S.g(attrs, parent)  S.rect(x, y, w, h, attrs, parent)  S.circle(cx, cy, r, attrs, parent)
S.line(x1, y1, x2, y2, attrs, parent)  S.path(d, attrs, parent)  S.poly([[x,y],…], attrs, parent)  S.polygon(pts, attrs, parent)
S.text(x, y, '文字', { cls: 't-c t-sm t-dim' }, parent)   S.lines(x, y, ['1行目', '2行目'], attrs, parent, 行の高さ)
S.label(parent, x, y, '札の文字', { cls: 't-sm t-b', box: 'f-sf s-rule w1' })   // 枠付きの札（中央座標）
S.arrow(parent, x1, y1, x2, y2, 'e', { cls: 's-e w3' })      // 矢印。色は fg/mid/dim/e/h/p/r/d/x
const mk = S.markers(ctx.svg); S.path(d, { 'marker-end': mk('h') })  // 矢印の先端を自分で付けるとき
S.along(pathEl, f)  → {x, y}      S.place(node, pathEl, f, rotate)   // 道の上の位置に置く
S.len(pathEl)   S.clear(node)   S.show(node, on)   S.fade(node, on)   // fade は .fade/.hide クラスで 0.35 秒かけて消す

A.flow(pathEl, { count: 8, speed: 60, r: 3.5, cls: 'f-e', jitter: 0, fade: false })  // 道に沿って粒を流す。毎フレーム .update(dt)。.set('speed', v) .show(on)
A.wave(pathEl, { x0, x1, y, amp, lambda, speed, env })   // 正弦波。毎フレーム .update(dt)

U.clamp  U.lerp  U.mod  U.remap(v, a, b, c, d)  U.prog(t, t0, dur)  U.ease.inOut/out/in/back
U.pulse(t, period)  U.cycle(t, period)  U.seq(t, [1, 2, 0.5], loop) → { i, f, done }  U.fmt(n, 桁)  U.rich(str)

// 箱の中を前の章の回路で開く「板」（§5）。第6章 場面1・3（A・ALU・制御装置・PC+1）、第5章 場面4（SRAM セル）が例
const Z = YT.zoom.make(ctx.svg, [消す図の部品, …]);   // setup の最後で（板は図の最前面に乗る）。消す対象に .fade を付けた要素を入れない（0.35 秒遅れる。付けていない親で包む）
Z.add('alu', (g) => { YT.zoom.title(g, '題', '説明', '04-ronri.html#s6', '第4章 場面6「4ビット加算器」'); …; return { frame(u, settled) {} }; });  // u は開き切ってからの秒、settled は動きを止めている人向けの決まった姿
YT.zoom.run(Z, YT.zoom.one(ctx, 'alu', { x, y, w, h }, 1.2));   // frame の最後で毎フレーム。段階に入って 1.2 秒後に箱 {x,y,w,h} から 0.7 秒で開く。null で閉じる
// 自分で開閉を決めるときの z: { name, src, f: 0..1（開き具合）, u, settled } ／ { src, f: 0, t }（閉じたまま箱に合図の枠）。YT.zoom.PANEL = { x: 30, y: 56, w: 900, h: 478 }、YT.zoom.bit(parent, x, y, w, h, fs) → { set(0 | 1 | '?') } は値の箱
```

色は必ずクラスで付ける（CSS 変数は属性では使えない）:
塗り `f-e f-h f-p f-r f-d f-x f-fg f-mid f-dim f-rule f-soft f-sf f-in f-bg f-none` と薄い塗り `f-e-soft` …、
線 `s-e s-h … s-fg s-mid s-dim s-rule s-soft s-sf s-none`、太さ `w1 w15 w2 w3 w4 w6 w10`、`dash dash2 round`、
文字 `t-dim t-mid t-sf t-e t-h t-p t-r t-d t-x t-mono t-b t-xs(10) t-sm(11) t-md(12.5) t-lg(15) t-xl(19) t-xxl(26) t-c(中央) t-end(右寄せ)`（`t-r` は電波の色。右寄せではない）、
効果 `fade hide glow`。SVG の文字の既定は 12.5px。10px より小さくしない。

色の意味は全章で固定: e 電子・電流・電気信号／h 正孔・＋電荷・高い電位／p 光（と熱）／r 電波／d データ・パケット・ビット列／x 強調・変化・注意。映像の断片・動画のデータも d（p は光だけ）。
章の凡例（meta.legend）にはその章で使う色だけを、この意味の範囲で書く。

## 5. 図の作り方

- viewBox は `0 0 960 560` に固定。左 37% の列と並ぶので、文字は 11〜15px、部品は大きめに。
- 段階で出し入れする部品は `S.g({ cls: 'fade hide' })` で作っておき、`onStep` で `S.fade(g, 条件)`。
- 動きは「意味のある動き」だけ。粒の流れ・波・点滅・移動は、その段階で説明している現象に対応させる。装飾の動きは入れない。
- 図の中の文章は短い札だけ。説明は本文（steps）に書く。本文で図の動きを描写し直さない（図を見れば分かることは書かず、図では分からない理由・数値・名前を書く）。
- 1つの図の中で、段階が進んでも部品の位置は変えない（読み手が覚え直すため）。見せたい所に色（x）を付け、残りを薄くする。
- 実際の値（速さ・個数・電圧・周波数・バイト数）は確かなものだけ書く。模式図で誇張した所は、本文か注記に「誇張」と書く。
- ホバーは補助。縦読み版（スマートフォン）ではホバーもツールチップも効かない前提で、必要な情報は図か本文に出す。
- **箱の中を前の章の回路で開く（ズーム）**: 読者は前の章を覚えていない前提で、「この箱の中は第4章のあの回路」を同じ図の上で見せたいとき、図を差し替えずに「板」を箱の位置から図いっぱいに広げる（エンジンの `YT.zoom`。§4。06 章 場面1・3 と 05 章 場面4 が例。板は 30,56〜930,534、箱から 0.7 秒で開く）。守ること: 開いている間は元の図を消す（`make` の第 2 引数。板の下の文字が `--overlap` の重なりに数えられないように。`.fade` を付けた要素は 0.35 秒遅れるので、付けていない親で包んで渡す）。板の中の配線の色は第4・5章と同じ（1 は h の太線、0 は灰色。凡例に h を足す）。トランジスタのチャネルは第3章と同じ e の太線。動きを止めている人には、段階に入った時点で開き切って計算の終わった姿を出す（`one` が `settled` を立てる。自分で開閉を決める段階では `YT.motion.playing` を見る）。板の右上に元の章の場面へのリンク（`title` が作る）。段階が変わると閉じる。板の中の粒は `Math.random` で散らさない（段階の行き来で見た目が変わる。05 章の `hash` のように決まった位置に）。元の図の 1 周と板の中の 1 周を交互に見せるなら、元の図の `U.seq` の時刻を板の区間から作る（05 章 場面4 の `tz`）。

## 6. 高さの予算（1画面版）

舞台は最小で 1600×860。上部バー 48px、余白 38px、見出し約 60px を引くと本体は約 714px。

- 左の列: リード（2〜3 行）＋ 説明欄（min-height 210 ＋ 操作 50）＋ 補足（2〜3 行）で約 520px。補足を 2 段落にすると超えることがある。
- 右の図: 幅いっぱいで高さ 560、図の説明 1〜2 行。1920 幅では max-height 580px で止まる。
- 表紙: 構成（目次）は 7 項目まで。リードは 4 文まで。
- まとめ: 要点 6 個（各 1〜2 行）、用語表 8〜10 行。

## 7. 検証

```bash
node tools/verify.mjs chapters/NN-名前.html                       # エラーとはみ出し
node tools/verify.mjs --shots /tmp/…/shots --all-steps chapters/NN-名前.html   # 全場面・全段階の写真
node tools/shot.mjs chapters/NN-名前.html --scene 4 --step 2 --at 0,1.5,3 --out /tmp/…/at   # 段階に入って何秒後かを指定して撮る（--dark も可）
```

- 「JS のエラー: なし」「はみ出しなし」「横スクロール なし」「リンク切れ: なし」になるまで直す。まだ作っていない章へのリンクは切れとして数えず、件数だけ出る。
- 他の章へのリンクは同じフォルダの相対パスで書く（`href="14-router.html#s4"`）。`../` を付けると切れる。
- 検証ツールは各段階で時刻を 20 秒まで進めて frame を呼ぶ（「時刻送り: 例外なし」）。図の要素に CSS のどこにも無いクラスが付いていれば「未定義のクラス」で失敗する。`--nav` を付けると、段階を飛んで移ったときの見た目を順に進めたときと比べる（onStep を差分で書いた誤りが「注意」で出る。乱数で変わる表示も出るので、乱数は時刻を種にした疑似乱数にすると消える）。
- 写真は `--shots DIR --all-steps` で全段階を撮る。縦読み版は場面ごとに `NN-名前-phone-sK.png`（画面の高さを場面に合わせて撮るので、図の一部が抜けて写ることはない。図は横にスクロールする設計なので右が切れて写る）。
- 写真は、表紙・各場面の段階1・いちばん部品の多い段階を見る。文字の重なり、はみ出し、消し忘れの部品、色の意味違いを確かめる。
- `--overlap` を付けると、各段階で時刻を 15 秒まで進めながら、止まっている文字どうしの重なり（動く札の最初の位置・止まる位置で箱の題を隠す、動かない文字どうしが重なる）、止まっている動く札の四角（塗りのある rect）が下の文字を隠すもの、図の外へ出た文字を「注意」として出す。通り過ぎる途中の重なりと、動かない板が下の文字を覆う図の作りは拾わない。止めたとき（`YT.motion.playing` を見て決まった姿を描く章がある）と、動いているが速さ 0 のときの 2 回調べる（時刻送りも同じ）。
- `--shots` の写真は段階に入った直後の見た目だけ。動く札の止まる位置や、途中で書き換わる文字・色は `tools/shot.mjs` で時刻を指定して撮って確かめる（動きを止め、ts を 0.05 秒刻みで進めて frame を呼んでから撮る）。
- 他の章へのリンクは `node tools/xrefcheck.mjs chapters/NN-名前.html` で、行き先の章・場面・段階が在るかと、札の「第N章 場面K」が行き先と合うかを確かめる（verify.mjs は最後に表示していた段階のリンクしか見ない）。
- 本文の字数は `node tools/lencheck.mjs chapters/NN-名前.html` で数える（段階 160・リード 110・補足 140 の目安を超える所を出す。テンプレート文字列の式は式のまま数えるので、その章は式を定数に出す）。
- 表紙のリードの 1 文目を変えたら `node tools/sync-lead.mjs` で前の章の `meta.next.lead` を作り直す。
- 検証が終わったら `docs/plan.md` の進捗表を更新する。
- まとめの用語表を直したら `node tools/build-glossary.mjs` を走らせ、用語索引（`glossary.html` が読む `assets/glossary-data.js`）を作り直す。

## 8. 文章の書き方

- 読者は、定着した用語で受け取り、知らない語は自分で調べる人。噛み砕きのための比喩や言い換えは、それ自体が主題のとき（誤解を正すときなど）だけ使う。
- 結論を先に書く。一文一義。主語と述語を省かない。
- 本文・図・用語表に同じ情報を二重に出さない。要点は各場面の結論、用語表は定義・単位・代表値、と役割を分ける。
- 太字と色付きの語は、外すと意味が変わる所にだけ。
- 言い切りの強さを根拠に合わせる。「約」「多くの場合」「〜年時点」で較正する。推測は推測と書く。

## 9. よくある誤り（第10〜14章の確認で見つかったもの）

検証ツールが通っても、次の誤りは写真と本文を読まないと見つからない。書き終えたら1つずつ確かめる。

- **重なり**: 札が線・矢印・箱の枠・ほかの札に重なる。札が箱や図の外へはみ出す。動く札が止まる位置で箱の題を隠す。止まる位置は箱の隙間に置き、札には不透明な下地を付ける。
- **戻ると残る**: 段階 3 で出した部品・色・文字が、段階 1 に戻っても残る。onStep で全部の部品の表示・色・文字を段階 i から決め直す。frame で付けた不透明度が `hide` クラスに勝つこともある。
- **数秒後の例外**: 段階に入って数秒後にだけ通る分岐で例外が出る（`const` への再代入など）。時刻送りで見つかる。
- **動いている間だけ見えない**: frame の中で毎回 `.hide` を付けてから外す（または `S.fade` を毎フレーム呼ぶ）と、0.35 秒の遷移が毎フレームやり直しになり、不透明度が 0 のままになる（13 章 場面4〜6 で、フレームの札が再生中ずっと見えなかった。止めたときだけ見えた）。見せるかどうかは、状態が変わったときに 1 回だけ決める。検証ツールはクラスを見るので拾えない。動かした写真で確かめる。
- **色の意味違い**: 区別のためだけに e・h・p・r を使う（TCP を r、IP を h、送り手と受け手を別の色、など）。意味の無い区別は無彩色（fg・mid・dim・in・sf）か、d の濃淡で付ける。
- **描かれていない**: 始点と終点が同じ円弧、未定義のクラス、白地に白い文字。写真で必ず目で確かめる。
- **言い切りすぎ・古い情報**: 実装や年で変わる事実（ブラウザの挙動、規格の採用、国内の制度）は、確かめて「〜年時点」と書く。確かめられないことは書かないか弱める。概数は根拠を持つ。
- **本文と図の数値の食い違い**: 本文の「10 回」と図の 9 個、「200 ms」と「166 ms」など。同じ値は1か所で決めて両方に使う。
- **字数**: 段階の本文 160 字を超える。リードが 110 字を超える。HTML に直接書いた本文でバッククォートや `{e|…}` を使う（効かずに記号が出る）。
- **位置の言葉**: 注記の「上:」「右の」が図の配置と合わない。場面・図・段階の番号で指す。
- **同じ語の別の意味**: 断片（動画／IP のフラグメント／チャンク）、TTL（ホップ数／秒数）、フレーム（画／Ethernet）、ポート（口／番号）などは、章の初出で「〜とは別」と 1 句添える。一覧は `glossary.html` の「同じ語」。
- **章の境目**: 通しで進むときは表紙を飛ぶので、場面1 のリードは前の章を受ける 1 文から始める（表紙のリードの 1 文目は、前の章のまとめの下に「次の章の導入」として出る）。
- **止めたときの姿**: `YT.motion.playing` を見て、止めているときは決まった姿を描く場面では、その姿に段階の要点（表の値、選んだ結果など）が出ているか確かめる。動きを減らす設定の人は最初からこの姿を見る。`tools/shot.mjs --paused` で撮る。

