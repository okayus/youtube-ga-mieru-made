# youtube-ga-mieru-made

「インターネットで YouTube の動画が見られるまで」を電子から画素まで追う、アニメーション学習教材（純粋な HTML/CSS/JS、ビルドなし）。

- 引き継ぎ: `docs/handoff.md`（前のセッションで止まった所と次の作業。セッションの最初に読む）。担当への指示書の雛形は `docs/briefs.md`、作業記録は `docs/log/`。
- 全体計画と進捗: `docs/plan.md`（全25章・6部。章ごとの6場面の題材と進捗表）
- 章の書き方: `docs/authoring.md`（骨組み、場面の型、エンジン API、高さの予算、検証、文章の書き方）
- 手本の章: `chapters/01-denshi.html`
- 共通ファイル: `assets/base.css`（配色・レイアウト・SVG 用クラス）、`assets/engine.js`（場面・段階・動きの時計・SVG 部品）。章の都合で変えない。変えるときは全章に影響することを確認する。
- 検証: `node tools/verify.mjs [--shots DIR --all-steps] chapters/NN-*.html`（ヘッドレス Chrome で JS エラー・はみ出し・横スクロール・リンク切れ・時刻送りの例外・未定義のクラスを測る。`--nav` で段階の行き来も比べる。`--overlap` で止まっている文字どうしの重なりも調べる）。章を直したら必ず走らせる。
- 時刻を指定した写真: `node tools/shot.mjs chapters/NN-*.html --scene N --step K --at 0,1.5,3 --out DIR [--dark]`（動く札の止まる位置や、途中で書き換わる文字・色を確かめる）。
- 用語索引: `glossary.html` が `assets/glossary-data.js` を読む。章の用語表を直したら `node tools/build-glossary.mjs` で作り直す。
- 配信: `tools/serve.sh` で http://127.0.0.1:8766/ 。止めるのは `tools/serve.sh stop`（pkill は使わない）。
- 公開: GitHub Pages（https://okayus.github.io/youtube-ga-mieru-made/）。main の root をそのまま配る（`.nojekyll` で Jekyll を止めている）。main に push すると公開サイトも変わる。
- 表示方針は one-screen-artifact スキルに従う（デスクトップは場面ごとに1画面、スマートフォンは縦読み）。
