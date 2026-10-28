# YouTubeが見えるまで

「インターネットで YouTube の動画が見られるまで」に起きていることを、電線の中の電子の動きから画面の画素まで、
途中を飛ばさずにアニメーションで追う学習教材。ブラウザだけで動く（ビルド不要、依存ライブラリなし）。

## 開き方

公開版は https://okayus.github.io/youtube-ga-mieru-made/ （GitHub Pages）。手元では次のように配信する。

```bash
tools/serve.sh            # http://127.0.0.1:8766/ で配信
# ブラウザで http://127.0.0.1:8766/index.html を開く
tools/serve.sh stop
```

`index.html` をファイルとして直接開いても動く（Web フォントだけはオフラインだと代替書体になる）。

## 構成

```
index.html            目次。全体の地図と27章の一覧
glossary.html         用語索引。全章の用語表を 1 か所に（部ごとの一覧・検索・同じ語の別の意味）
chapters/NN-*.html    章ごとのページ（表紙＋動く場面6つ＋まとめ）
assets/base.css       共通スタイル（1画面版／縦読み版、SVG 用の色クラス）
assets/engine.js      共通エンジン（場面の切り替え、段階、動きの時計、SVG の部品）
assets/glossary-data.js  用語索引のデータ（tools/build-glossary.mjs が全章の用語表から作る）
docs/plan.md          全27章の計画と進捗
docs/authoring.md     章の書き方（エンジンの API、場面の型、高さの予算、検証）
tools/verify.mjs      ヘッドレス Chrome で JS エラー・はみ出し・リンク切れを測る
tools/shot.mjs        場面・段階・時刻を指定して写真を撮る（動く札の止まる位置の確認）
tools/build-glossary.mjs  用語索引のデータを作り直す（章の用語表を直したら走らせる）
news/                 ニュースから層へ。tech ニュースを章・場面に結びつけたノート（*.md が元、*.html と index.html は作ったもの）
tools/build-news.mjs  news/*.md からページと一覧を作る（ノートを足したり直したりしたら走らせる）
tools/lencheck.mjs    本文の字数の目安（段階 160・リード 110・補足 140）を超える所を出す
tools/xrefcheck.mjs   他の章へのリンク（[[NN-名前.html#sK.J|…]] と href）の行き先の章・場面・段階が在るかを確かめる
tools/sync-lead.mjs   各章の meta.next.lead（次の章の導入）を表紙のリードから作り直す
tools/serve.sh        ローカル配信
```

## 見方

- デスクトップ（幅1216px以上）では1画面版。上部バー右上の <kbd>›</kbd>（または <kbd>→</kbd>）だけを押していけば、目次から第1章の場面1へ、
  そこから 1 段階ずつ、章のまとめの次は次の章の場面1へと、第27章の最後まで全ページを通して見られる（<kbd>‹</kbd>・<kbd>←</kbd> で戻る）。
  <kbd>↑</kbd><kbd>↓</kbd> と上部のタブは場面ごとに移る。<kbd>スペース</kbd> で動きを止める／動かす。
  「自動で進む」を入れると、段階は本文の長さに応じて約 12〜30 秒、表紙とまとめは約 15 秒ごとに、章もまたいで最後まで進む。目次の上部バーの「最初から通して見る」「続きから」から始められる。
  URL の末尾は今の場面と段階（<code>#s3</code>、<code>#s3.2</code>）に書き換わるので、再読み込みや共有で同じ所に戻れる。各章のまとめの下には次の章の導入が出る。
- 用語は <code>glossary.html</code>（用語索引）で探せる。各章のまとめと目次から開ける。
- スマートフォンでは縦に読む。段階の操作は画面の下端に出る。
- 動きを減らす設定（prefers-reduced-motion）のときは止まった状態で始まり、「動かす」で動く。

## 検証

```bash
node tools/verify.mjs --nav --overlap chapters/01-denshi.html     # 1章を測る（段階の行き来と文字の重なりも）
node tools/verify.mjs --sizes all --shots /tmp/shots --all-steps chapters/*.html
node tools/shot.mjs chapters/14-router.html --scene 4 --step 2 --at 0,3 --out /tmp/at   # 時刻を指定して撮る
```
