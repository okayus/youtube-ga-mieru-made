# Node.js の 2026 年 10 月のセキュリティリリース（2026-10-21）

- 出典: [Wednesday, October 21, 2026 Security Releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)（Node.js、10-14 に予告、10-21 に公開）と、[22.23.4](https://nodejs.org/en/blog/release/v22.23.4)・[24.22.1](https://nodejs.org/en/blog/release/v24.22.1)・[26.12.1](https://nodejs.org/en/blog/release/v26.12.1) のリリースノート
- 調べた時点: 2026-10-22 08:30 JST。CVE の記録はまだ RESERVED。各件の仕組みは、修正のコミットの差分と試験から読んだ。
- 手元で確かめたこと: この PC の 24.19.0 と、落とした 24.22.0・24.22.1 で同じ試験を走らせた（場面「この PC」）。

## 要点

Node.js が自前で受け持つ DNS（第17章）・TLS（第20章）・HTTP（第21章）の部品の欠陥の話である。ブラウザでは別のプロセスのネットワークサービスが受け持つ仕事を（第10章 場面1）、Node.js ではアプリと同じプロセスのライブラリが受け持つ。最も重いのは Brotli の展開での範囲外の書き込み（CVE-2026-111497、High）で、`fetch()` は応答の `Content-Encoding: br` を見て本文を自動で展開するので、悪意あるサーバーの応答 1 つで届く。ほかに TLS の名前の確認、DNS の名前の NUL、keep-alive の接続の使い回しなど 9 件。修正版は 22.23.4・24.22.1・26.12.1。

## 確かなことと、確かでないこと <!-- tab: 確かさ -->

| 項目 | 内容 | 出どころ | 確かさ |
|---|---|---|---|
| 日時 | 10-14 に予告し、10-21 に修正版を出した。リリースノートの時刻は 10:39 UTC、告知に各件の題を足したのは 12:08 UTC | nodejs.org とそのリポジトリの履歴 | 公式 |
| 件数 | Node 本体が 10 件（High 4・Medium 3・Low 3）。ほかに c-ares・OpenSSL・SQLite・undici の更新と、eMudhra の中間 CA の対策 | nodejs.org | 公式 |
| 各件の中身 | 説明があるのは Brotli の 1 件だけで、ほかは題と影響を受ける系列だけ。10 件とも CVE の記録は RESERVED | nodejs.org、CVE の API | 公式。仕組みは修正のコミットの差分と試験から読んだ |
| Brotli | Brotli 本体の欠陥で、Brotli も 10-21 に 1.2.1・1.1.1・1.0.10 を出した。直すコミットは 2026-02-27 から公開されていて、Chromium は 03-23 にそれを含む版へ上げていた | google/brotli、Chromium のリポジトリ | 公式。2 月のコミットの説明は「無効なストリームを早く見つけて報告する」、Chromium の取り込みの説明は「特定の並びの展開で止まらなくなる不具合の修正」で、どちらも範囲外の書き込みには触れていない |
| 前の修正との関係 | TLS の名前の確認の 3 件と、接続の使い回しの 1 件は、6 月の修正（CVE-2026-48618・48931）の穴か、その後の変更による退行 | nodejs/node のコミット | 公式のコミットで確かめた |
| 深刻度 | 全角数字の件（CVE-2026-105483）は、告知では High、修正のコミットの説明では「深刻度の低い、悪用しにくい退行」 | nodejs.org、コミット | 公式どうしで食い違う |
| 悪用 | 報告は見つからなかった | 検索 | 未確認 |
| 修正の出ない版 | サポートの終わった 20 系以前と 25 系。告知は「サポートの終わった版は常に影響を受ける」と書く | nodejs.org、Release の予定表 | 公式 |

## どの層の話か <!-- tab: 層 -->

`fetch('https://…')` 1 回が通る順に並べ、最後にプロセスの層を置く。欠陥があったのは太字の層。

| 層 | このニュースで起きること | 章・場面 |
|---|---|---|
| URL のホスト | `１２７.0.0.1`（全角）・`127.1`・`2130706433` は、URL の規格ではどれも 127.0.0.1 になる。IPv4 アドレスは 32 ビットの番号で、10 進数 4 つは書き方の 1 つ | [10章 場面1][10-1] の段階2、[18章 場面2][18-2] の段階1 |
| **DNS** | `dns.resolve*()` は c-ares で DNS サーバーへ直接問い合わせる。名前の途中の NUL（0x00）で名前が切れ、別の名前を問い合わせた | [17章 場面1][17-1] の段階2・3 |
| **TLS の名前の確認** | 非正規の書き方を、証明書の IP アドレスの欄と比べるか DNS の名前の欄と比べるかが版ごとに揺れ、つなぐ先と確かめる名前がずれた | [20章 場面4][20-4] の段階5 |
| TLS の証明書の連鎖 | eMudhra の漏れた 8 つの鍵を、Node に組み込んだ一覧で拒むようにした。emSign のルート 3 つも外した（欠陥は CA の側） | [20章 場面4][20-4] の段階3・4 |
| OS の受信キュー | 届いたバイトは、アプリが読むまでカーネルの受信キューに残る。Node の見張りは、イベントループが受信を調べたときにしか働かなかった | [9章 場面6][9-6] の段階3・4、[10章 場面5][10-5] の段階3 |
| **HTTP/1.1 の接続の使い回し** | 応答は接続の上の順番で要求と組になる。要求より先に届いていた応答を、その要求の応答として読んだ | [21章 場面3][21-3] の段階1 |
| **HTTP の本文の展開** | `fetch()` は `Content-Encoding: br` の本文を自動で展開する。Brotli の展開が、確保した領域の外に書き込む | [21章 場面1][21-1] の段階4、[23章 場面3][23-3] の段階3・5 |
| メモリと CPU | 範囲外の書き込みは、同じプロセスの仮想メモリの別のデータを壊す。関数の番地などを書き換えれば、PC を攻撃者の選んだ命令へ向けられる | [9章 場面4][9-4]、[6章 場面1][6-1] の段階2 |
| **乱数とプロセスの写し** | 起動のスナップショット（ヒープの写し）に使い残しの乱数が残り、そこから起動したプロセスがみな同じ値を出した | [9章 場面2][9-2] の段階1、[20章 場面3][20-3] の段階5 |
| **Node の Permission Model** | Node の API の入口で許可を調べる仕組みで、OS のサンドボックスではない。入口の調べ忘れと、許可の木の照合の誤りがあった | [9章 場面2][9-2] の段階3 |

## Brotli の展開（CVE-2026-111497） <!-- tab: Brotli -->

### 欠陥の場所

- Brotli は、前に出たバイト列の参照（LZ77）とハフマン符号を組み合わせた圧縮である。本文を区切ったブロックごとに「型」があり、型ごとに別の符号の表を使う。表を替える印が「ブロックの切り替え」で、H.264 の CAVLC が周りの状況で符号の表を替えるのと同じ考え方である（[23章 場面3][23-3] の段階5）。
- 修正は、ブロックの型が 1 つしかないのに切り替えの印が来たら、その場で誤り（`BLOCK_SWITCH`）として止める。直す前の展開は、この失敗を誤りとして扱わなかった。入力が足りている速い道では戻り値を捨て、足りない道では「入力が足りない」と読んでいた。
- 範囲外の書き込みに至る道筋と、攻撃の入力は公表されていない。修正に付いた試験の入力は、直す前の版でも別の誤り（`BLOCK_LENGTH_1`）で止まる（この PC で確かめた）。

### 届く道と、ブラウザとの違い

- `fetch()` は HTTPS の要求に `Accept-Encoding: br, gzip, deflate` を付け、応答の `Content-Encoding` に従って展開する。この PC では、br を頼んでいない要求（HTTP の既定の `gzip, deflate` や `identity`）でも、応答が br なら展開した。悪意あるサーバーは、頼まれなくても br で返せる。
- Chrome では、展開はネットワークサービスが済ませ、レンダラには展開後が届く（[10章 場面2][10-2] の段階1）。Node.js では、展開する関数がアプリのデータや鍵と同じアドレス空間で動く（[9章 場面4][9-4] の段階1）。
- この PC の OS の libbrotli1 は 1.2.0-3build1 で、2 月の修正を含まない。curl・libsoup・Qt・FreeType がこれを使う。10-22 08:30 JST の時点で、Ubuntu からの更新は出ていない。

## TLS の名前の確認（CVE-2026-106069・106072・105483） <!-- tab: 名前 -->

### 同じ文字列を 3 か所で読む

- `tls.connect({ host })` は、つなぐ先の番地を OS のリゾルバ（`dns.lookup()`、getaddrinfo）で決め、証明書の名前を `tls.checkServerIdentity()` で確かめる（[20章 場面4][20-4] の段階5）。確かめる側は 6 月の修正から、名前を URL の規格の `domainToASCII()` で正規化してから比べる。読み方がずれると、つなぐ先と確かめる名前がずれる。
- URL の規格では、`127.1`（省略）・`2130706433`（1 つの 10 進数）・`0x7f.0.0.1`（16 進数）・`0177.0.0.1`（8 進数）はどれも 127.0.0.1、`0127.0.0.1` は 87.0.0.1 になる。全角の数字と句点「。」は、ASCII の数字と点に置き換わる（[10章 場面1][10-1] の段階2、[18章 場面2][18-2] の段階1）。
- 公開の CA は名前の持ち主であることを確かめて発行するので、末尾の「1」が TLD に無い `DNS:127.0.0.1` の証明書は、社内の CA や自己署名でしか作れない（[17章 場面2][17-2] の段階3）。

### 版ごとの確かめ方

| 版 | 非正規の書き方の扱い | 起きること |
|---|---|---|
| 6 月の修正の前 | 正規化しない | 句点「。」などを点と読むリゾルバと、読まない確認とがずれ、ワイルドカードの深さの確認を越えられた（CVE-2026-48618） |
| 22.23.3・24.19.0 など | 正規化した形が IP なら、IP アドレスの欄と比べる | リゾルバが URL の規格と違う番地に読むと、別の番地の証明書で通る（CVE-2026-106069）。この PC の OS は、8 通りとも URL の規格と同じ番地に読んだ |
| 24.20.0〜24.22.0 など | 7 月に IPv6 の不具合（`domainToASCII('::1')` が空になる）を直すため、IP かどうかを元の形で判定した。IP でなければ、正規化した形を DNS の名前の欄と比べる | `DNS:127.0.0.1` の証明書が、127.0.0.1 への接続を通す（CVE-2026-105483・106072） |
| 22.23.4・24.22.1・26.12.1 | 元の形が IP でなく、正規化すると IP になる名前は、どの証明書でも拒む | 非正規の 7 通りを `Host is a non-canonical IP address` で拒んだ（この PC） |

どの版の欠陥も、つなぐ先を決める読み方と、名前を確かめる読み方の食い違いから来ている。修正版は、読み方が分かれうる書き方そのものを受け付けない。

## 使い回す接続と、先に届いていた応答（CVE-2026-105481） <!-- tab: 接続 -->

### 何が起きるか

- HTTP/1.1 の接続では、応答に要求の番号が無く、接続の上の順番で要求と組になる（[21章 場面3][21-3] の段階1）。HTTP/2 はストリームの番号で組にする（同じ場面の段階3）。
- `http.Agent` は `keepAlive` のとき、応答を読み終えた接続を空きの列に置き、次の要求に使い回す。既定の `http.globalAgent` と `https.globalAgent` も keepAlive が有効である。6 月の修正（CVE-2026-48931）は、空いた接続にデータが届いたら、その接続を壊す見張りを付けた。
- 見張りが動くのは、イベントループが受信を調べたとき（Linux では `epoll_wait()`）だけである（[10章 場面5][10-5] の段階3、[9章 場面6][9-6] の段階4）。データがカーネルの受信キューに入ってから、ループが次に調べるまでの間に、同じ処理の中で次の要求が接続を取ると、そのデータは見張りより先に応答として読まれた。

### 直し方と影響

- 修正版は、空いた接続を要求に渡す前に、受信キューにデータがあるかを OS に聞く。`recv()` に `MSG_PEEK` と `MSG_DONTWAIT` を付けて 1 バイト読むので、キューからは外さず、データが無くても待たない（[9章 場面3][9-3] の段階3）。データがあれば接続を壊し、別の接続を使う。
- この PC では、24.19.0 で偽の応答を受け取る所まで再現でき、24.22.1 では起きなかった。
- 影響が大きいのは、多くの利用者の要求を同じ相手への接続で運ぶ使い方（中継のプロキシなど）と考えられる。相手が要求を待たずに応答を書けると、取り違えは利用者をまたぐ。これは推測で、告知は影響の範囲を書いていない。

## ほかの 5 件 <!-- tab: ほか -->

### DNS の名前の NUL（CVE-2026-105482、High）

- DNS のメッセージでは、名前はラベルの長さを前に置いて並べ、長さ 0 で終える（[17章 場面1][17-1] の段階2）。C の文字列は 0x00 で終わる。c-ares は名前を C の文字列で受け取るので、`example.com\0.trusted.corp` を example.com として問い合わせた。
- 名前の末尾で許可を決めるアプリは、`.trusted.corp` の名前を引いたつもりで、example.com の番地を受け取る。`dns.lookup()` は前から NUL を拒んでいて、直ったのは c-ares を使う `dns.resolve*()` などである。

### 乱数の溜め（CVE-2026-106074、Medium）

- `crypto.randomUUID()` と `randomInt()` は、暗号用の乱数をまとめて作り、使い残しを溜めておく。起動のスナップショット（`--build-snapshot`）は作るときのヒープを写すので、そこから起動したプロセスはみな同じ値から使い始めた。スナップショットを含めた単一実行ファイル（SEA）も同じ。
- `fork()` で写したプロセスが同じ乱数の状態を持つのと同じ形の誤りである（[9章 場面2][9-2] の段階1）。SEA は Node 自身を中に含むので、修正版の Node で作り直すまで直らない。

### Permission Model（Low 2 件）と ZIP（Low）

- `--permission` は、Node の API の入口ごとに許可を調べる。公式の文書は「安全ベルト」と呼び、悪意あるコードは止められないと書く。OS の仕切り（[9章 場面2][9-2] の段階3 のサンドボックス）とは別物である。
- `fs.realpathSync()` は許可を調べず、許可の外のファイルがあるかを答えた（CVE-2026-106073）。26 系だけ、ワイルドカードの照合が許可しすぎ、`--allow-fs-read=/tmp/test*` が `/tmp/tes` まで許した（CVE-2026-106071）。7 月にも、同じ木の境目で許可しすぎる欠陥（CVE-2026-58043）が直っている。
- 26 系の `zlib.ZipFile` は、中のファイルの見出しが目次と食い違うと誤りにするが、その前に見出しを覚えていた。2 回目に読むと、ファイルの今の読み位置からのバイトを中身として返した（CVE-2026-106070）。教材に無い層。

## 同梱するライブラリと証明書 <!-- tab: 同梱 -->

nodejs.org の配布物（mise などが入れるもの）は、次のライブラリと証明書の一覧を中に含む。OS のパッケージを更新しても、Node の中の写しは変わらない（Linux のディストリビューションの nodejs のパッケージには、OS のライブラリを使うものもある）。

| 何 | 版 | 直したこと | 章・場面 |
|---|---|---|---|
| 証明書の一覧 | NSS 3.131.1 の一覧と、公開鍵の拒否の一覧 | eMudhra の漏れた 8 つの中間 CA の公開鍵の SHA-256 を一覧にし、連鎖に入っていたら `CERT_REVOKED` で拒む。emSign のルート 3 つ（ECC Root CA - G3・Root CA - C1・ECC Root CA - C3）も外した。修正のコミットは、Node にはブラウザの CRLSet・OneCRL に当たる仕組みが無いと書く | [20章 場面4][20-4] の段階3・4、[eMudhra のノート](2026-10-20-emudhra-ca-key-compromise.md) |
| c-ares | 1.34.9（10-19） | 11 件。問い合わせた先と違う DNS サーバーからの答えを受け取る欠陥（ID と質問だけで照合し、届いた接続を見ていなかった。UDP の答えは送り元のポートも見るようにした）、解放した後の領域を使う欠陥など | [17章 場面1][17-1] の段階4、[19章 場面1][19-1] の段階4 |
| undici | 6.29.1・7.30.1・8.12.2（10-15） | `fetch()`・`WebSocket`・`EventSource` の中身。`Content-Encoding` を 5 つより多く重ねた応答 1 つでプロセスが落ちる欠陥、`Agent` の `tls` に渡した `checkServerIdentity` が設定の写しで落ち、独自の確かめ（ピンなど）が働かない欠陥など 8 件（22 系の 6.29.1 はそのうち 5 件） | [21章 場面1][21-1] の段階4、[20章 場面4][20-4] の段階5 |
| OpenSSL | 3.5.9（09-29、22 系と 24 系） | 13 件。最も重いのは DTLS の再送で範囲外を読む欠陥（High）。ほかは QUIC・SM2・CMP などの欠陥。Node のどの機能に及ぶかは、告知に無い | [19章 場面6][19-6] |
| SQLite | 3.53.4（22 系だけ） | `node:sqlite` の中身。公開の脆弱性への対応として、3.53.0〜3.53.4 の更新をまとめて入れた | 教材に無い |

## 層ごとの守り <!-- tab: 守り -->

| 守り | 層 | 章・場面 | 出どころと注意 |
|---|---|---|---|
| 修正版（22.23.4・24.22.1・26.12.1）に上げる | すべて | — | 公式。20 系以前と 25 系には修正が出ない。nodejs.org の配布物は証明書の一覧や c-ares・Brotli を中に含むので、OS の更新では直らない |
| スナップショットと SEA を修正版で作り直す | 乱数とプロセスの写し | [9章 場面2][9-2] | 修正のコミットから。SEA は Node 自身を中に含む |
| IP アドレスは正規の書き方（10 進数 4 つ、先頭に 0 を付けない）で渡す | URL・TLS の名前の確認 | [18章 場面2][18-2]、[20章 場面4][20-4] | 一般論。修正版は非正規の書き方を拒むので、利用者が書いた URL をそのまま渡すと、つながらなくなる |
| 名前を確かめてから引くときは、NUL を含む名前を先に拒む | DNS | [17章 場面1][17-1] | 一般論。修正版は `dns.resolve*()` が拒む |
| 信頼できない相手との接続は使い回さない（`keepAlive: false`） | HTTP/1.1 の接続 | [21章 場面3][21-3] | 一般論。接続ごとに TCP と TLS の握手が要るので、遅くなる |
| 信頼できないコードを `--permission` に閉じ込めない | プロセス | [9章 場面2][9-2] | 公式の文書の立場。閉じ込めるなら OS の層（利用者の権限、コンテナ、seccomp）で |
| OS の libbrotli1 を更新する | 本文の展開（OS のライブラリ） | [21章 場面1][21-1] | Ubuntu の更新を待つ（10-22 08:30 JST で未提供）。curl の `--compressed` などが使う |
| 要求の `Accept-Encoding` から br を外す | HTTP の本文の展開 | [21章 場面1][21-1] | 効かない。`fetch()` は頼んでいない br も展開した（この PC） |

## この PC で確かめたこと <!-- tab: この PC -->

### 手元の 24.19.0 と修正版の 24.22.1

| 試したこと | 24.19.0（この PC） | 24.22.1 |
|---|---|---|
| 手元に立てた DNS サーバーへ `resolve4('example.com\0.trusted.corp')` | サーバーに `example.com` の問い合わせ（29 バイト）が届き、答えの番地を返した | 送る前に `ERR_INVALID_ARG_VALUE` で拒んだ |
| 空いた keep-alive の接続にサーバーが応答を書き、同じ処理の中で次の要求を出す | 接続を使い回し、偽の応答（`X-Poisoned: true`）を受け取った | 接続を壊し、新しい接続で本物の応答を受け取った |
| 乱数を使ったスナップショットから 3 回起動し、`randomUUID()` と `randomInt()` を出す | 3 回とも同じ値 | 3 回とも違う値 |
| `--permission`（`/etc` を許可しない）で `realpathSync()` | `/etc/passwd` は実在のパス、無いファイルは `ENOENT`（あるかが分かる） | どちらも `ERR_ACCESS_DENIED` |
| eMudhra の試験用のホスト 2 つへ接続（emSign のルート経由と、Sectigo のクロス署名経由） | emSign 経由は HTTP 200。Sectigo 経由は、ルートが一覧に無く `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | どちらも `CERT_REVOKED` |
| 修正に付いた Brotli の試験の入力を展開する（`fetch()` でも） | `BLOCK_LENGTH_1` の誤りで止まった | `BLOCK_SWITCH` の誤りで止まった |

### TLS の名前の確認と、この PC の道具

- 8 通りの書き方と 3 種類の証明書（IP の欄 127.0.0.1、DNS の欄 127.0.0.1、IP の欄 87.0.0.1）で `checkServerIdentity()` を呼んだ。24.19.0 は、正規化した番地の IP の欄だけを通した。24.22.0 は、`0127.0.0.1` を除く非正規の 6 通りで DNS の欄を通した。24.22.1 は、非正規の 7 通りをすべて拒んだ。
- OS のリゾルバ（glibc の getaddrinfo）は、8 通りとも URL の規格と同じ番地に読んだ（`0127.0.0.1` は 8 進数として 87.0.0.1）。
- 24.22.0 と 24.22.1 は nodejs.org から落とし、SHA-256 を SHASUMS256.txt と照らした。24.22.1 は、リリースノートに載った値とも一致した（署名は確かめていない）。
- この PC の mise は `node = "lts"` で 24.19.0 を指している。`lts` が今指すのは 24.22.1 で、予定表どおり 10-28 に 26 系が LTS になれば、その後は 26 系を指すはずである。mise 自身は 2026.5.15 で、eMudhra の公開サイトが修正版に挙げる 2026.10.17 より古い。

## 追って確かめることと出典 <!-- tab: 出典 -->

### 追って確かめること

- CVE の記録が公開されたら、各件の説明・CVSS のベクトル・影響を受ける版の範囲。特に、CVE-2026-106072 が 22 系でどう起きるか（22.23.3 のコードは 24.19.0 と同じ形で、この PC の試験では DNS の欄を通さなかった）。
- Brotli の範囲外の書き込みに至る道筋と、攻撃の入力が出るか。悪用の報告。
- Ubuntu の libbrotli1 の更新と、Brotli を中に含むほかのソフトの対応。
- HackerOne の報告（3688064・3582376・4059814 など）が公開されるか。

### 出典

- Node.js: [告知（10-21）](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)、[予告の版（10-14）](https://github.com/nodejs/nodejs.org/commit/98eab92e83)、[6 月の告知](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases)、[7 月の告知](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases)、[Release の予定表](https://github.com/nodejs/Release)、文書の [Permissions](https://nodejs.org/docs/latest-v24.x/api/permissions.html) と [DNS の実装の違い](https://nodejs.org/docs/latest-v24.x/api/dns.html#implementation-considerations)
- 24.22.1 の修正のコミット: [tls 935918e342](https://github.com/nodejs/node/commit/935918e342)、[tls de49c913f2](https://github.com/nodejs/node/commit/de49c913f2)、[dns 843a1627dc](https://github.com/nodejs/node/commit/843a1627dc)、[http 96c3ccb1fc](https://github.com/nodejs/node/commit/96c3ccb1fc)、[brotli 49dff6f57a](https://github.com/nodejs/node/commit/49dff6f57a)、[crypto 4d6990b33c](https://github.com/nodejs/node/commit/4d6990b33c)、[permission 8dc18a6218](https://github.com/nodejs/node/commit/8dc18a6218)、[tls 01acf0ee74](https://github.com/nodejs/node/commit/01acf0ee74)（eMudhra）、[crypto 2a73ee5a89](https://github.com/nodejs/node/commit/2a73ee5a89)（NSS 3.131.1）。26 系だけの [zlib 745ad77156](https://github.com/nodejs/node/commit/745ad77156) と [src c273a408c9](https://github.com/nodejs/node/commit/c273a408c9)
- 前の修正: [tls 1efb4ff51a](https://github.com/nodejs/node/commit/1efb4ff51a)（6 月、CVE-2026-48618）、[tls 1d87a24050](https://github.com/nodejs/node/commit/1d87a24050)（7 月、IPv6）、[http 179ddaedfb](https://github.com/nodejs/node/commit/179ddaedfb)（6 月、CVE-2026-48931）
- Brotli: [v1.2.1](https://github.com/google/brotli/releases/tag/v1.2.1)、[コミット 0ed4268](https://github.com/google/brotli/commit/0ed4268a4401abcb4472096340477cf4af7d1a2b)、[Chromium の README.chromium](https://github.com/chromium/chromium/blob/main/third_party/brotli/README.chromium)
- 同梱: [c-ares 1.34.9](https://github.com/c-ares/c-ares/releases/tag/v1.34.9)、[undici の勧告](https://github.com/nodejs/undici/security/advisories)、[OpenSSL 3.5.9](https://github.com/openssl/openssl/releases/tag/openssl-3.5.9)、[eMudhra の公開サイト](https://emudhra.we-have-a-problem.com/)

[6-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/06-cpu.html#s1
[9-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s2
[9-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s3
[9-4]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s4
[9-6]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s6
[10-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/10-browser.html#s1
[10-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/10-browser.html#s2
[10-5]: https://okayus.github.io/youtube-ga-mieru-made/chapters/10-browser.html#s5
[17-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/17-dns.html#s1
[17-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/17-dns.html#s2
[18-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/18-ip.html#s2
[19-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/19-tcp.html#s1
[19-6]: https://okayus.github.io/youtube-ga-mieru-made/chapters/19-tcp.html#s6
[20-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/20-tls.html#s3
[20-4]: https://okayus.github.io/youtube-ga-mieru-made/chapters/20-tls.html#s4
[21-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/21-http.html#s1
[21-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/21-http.html#s3
[23-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/23-codec.html#s3
