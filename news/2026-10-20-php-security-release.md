# PHP の重大なセキュリティリリース（2026-10-20）

- 出典: php.net の[告知](https://www.php.net/archive/2026.php#2026-10-21-5)（2026-10-21）と前日の[予告](https://www.php.net/archive/2026.php#2026-10-20-1)。技術的な詳細は GitHub の勧告 [GHSA-w8hw-w9fx-j79w][ghsa-18]・[GHSA-6wmf-4rv5-p3rp][ghsa-19]
- 調べた時点: 予告の時点（2026-10-21 17:30 JST）に書き、修正版が出た後の 2026-10-22 22:30 JST に書き直した。仕組みと直し方は、勧告と修正のコミットの差分から読んだ。
- 手元で確かめたこと: この PC の Docker で、修正前の 8.5.11 と修正後の 8.5.12 がメモリの上限でどう止まるかを比べた（場面「この PC」）。攻撃は再現していない。
- 報道での呼び名: php2shell（公式の名ではない）

## 要点

サーバーの上で HTTP の要求を処理する言語処理系、PHP 本体の欠陥の話である。2 件とも、メモリの不足（OOM）などの致命的エラーで処理を打ち切ったときに、作りかけのデータや、解放したメモリを指す大域の状態が残り、後片付けや次の要求がそれを正しい値として読む。攻撃者は既定の設定のまま、アプリより前に走る本文の解析で OOM を起こせ、Apache の mod_php ではリモートからのコード実行（RCE）が実証された。修正版は 2026-10-21 の 8.2.35・8.3.36・8.4.27・8.5.12 で、攻撃の試みは公開の 4 日前から観測されている。

## 確かなことと、確かでないこと <!-- tab: 確かさ -->

| 項目 | 内容 | 出どころ | 確かさ |
|---|---|---|---|
| 公開の日時と経緯 | 2026-10-21 14:00 UTC（23:00 JST）。当初は 10-22 の予定だったが、10-20 15:00 UTC 頃に CVE 番号と誤った点数（10.0）が漏れ、1 日早めた。技術的な詳細は漏れていない。漏れた直後に出さなかったのは、配布元が修正を梱包する時間を残すため | php.net、PHP Foundation | 公式 |
| CVE と点数 | CVE-2026-109618（OOM による状態の破壊）と CVE-2026-109619（古い大域の状態）。どちらも CVSS v4.0 で 9.2 | GitHub の勧告、CVE の記録 | 公式。予告の時点で報道が出していた番号は正しかった |
| 欠陥の場所 | 要求のメモリの管理と、エラーで処理を打ち切る仕組み。入口は `multipart/form-data` の解析と、アップロードの進み具合をセッションに書く処理（session upload progress） | 勧告、修正のコミット | 公式。予告の時点で報道が疑っていた 2 つの場所は、どちらも入口として当たっていた |
| 影響を受ける版 | 5.4.0 以降のほぼすべて。勧告と CVE の記録は、サポート中の 8.2〜8.5 の範囲だけを書く | 発見者の Calif、Wiz | 研究者の報告。PHP がサポートの終わった 7.4 にも修正を移したことと合う |
| 直った版 | 8.2.35・8.3.36・8.4.27・8.5.12。サポートの終わった 7.4・8.0・8.1 には、ソースからビルドする人向けの最小限の修正だけを出した。7.3 以前には出ていない | php.net | 公式 |
| 影響を受ける SAPI | Web の要求を処理するものすべて（PHP-FPM、Apache の mod_php、php-cgi、FrankenPHP、LiteSpeed）。最も危ないのは mod_php で、認証の無い要求 1 つで、アプリのコードが動く前に攻撃が始まる | php.net、勧告 | 公式 |
| 悪用 | AWS のハニーポット（MadPot）に 10-17 から試みが届き、公開の日には複数の攻撃者が来た。watchTowr・Cloudflare も攻撃を観測した。実際のシステムで成功したかは、AWS も分からないと書く | AWS、watchTowr、Cloudflare | 研究者の報告。CISA の KEV には 10-22 22:30 JST の時点で載っていない |
| 修正が不完全という指摘 | 公開の直後に SNS で「8.5.12 の修正は不完全」という投稿が出た。Canonical の問い合わせに、PHP は「無関係で、実在の問題ではない」と答えた | oss-security | 公式の回答の又聞き（Matrix での会話の報告）。PHP のリスト上の確認は無い |

## どの層の話か <!-- tab: 層 -->

攻撃の要求が届く順に、下の層から並べる。欠陥があったのは太字の層。

| 層 | このニュースで起きること | 章・場面 |
|---|---|---|
| 電波・光・IP・TCP・QUIC | 攻撃の要求も、ふつうの要求と同じように運ぶ。途中の機器は自分の層のヘッダまでしか読まない | [11章 場面3][11-3]、[11章 場面6][11-6] |
| TLS | 途中の機器から中身を隠すが、送り手が悪意ある中身を送ることは止めない。中身を調べられるのは、TLS をほどく CDN やサーバーから先である | [20章 場面1][20-1] の段階5、[20章 場面6][20-6] |
| HTTP | 入口は POST の本文。名前を入れ子にした欄や空のファイル欄を大量に並べ、解析だけで PHP のメモリを使い切らせる。本文の終わりを `Content-Length` ではなく chunked で示すと、PHP の大きさの確認を越えられた | [21章 場面1][21-1] の段階3、[21章 場面2][21-2] の段階1 |
| Web サーバー | Apache の mod_php は、Apache の子プロセスの中で PHP を動かす。PHP-FPM は、nginx などから FastCGI で要求を受ける別のプロセスである | [22章 場面3][22-3] の段階4（GFE が暗号をほどいて奥のサービスへ渡す所） |
| **PHP 本体** | C で書かれた言語処理系。メモリの上限を越えると `longjmp()` で要求の処理から抜けるが、作りかけの表や、解放したメモリを指す大域の状態が残り、後片付けと次の要求がそれを読んだ | 教材に無い。[22章 場面3][22-3] の「奥のサービス」にあたる |
| OS | 乗っ取られるのは PHP を実行するプロセス（mod_php を組み込んだ Apache の子、PHP-FPM のワーカー）。その利用者（`www-data` など）の権限で、ファイルを書き換えたり、システムコールでシェルを起動したりできる | [9章 場面1][9-1]、[9章 場面2][9-2]、[9章 場面3][9-3] |
| メモリと CPU | 後片付けは、作りかけの要素に残った前のバイトを値として読む。攻撃者はヒープの配置を整えてそれを偽の配列に見せ、配列を壊すときに呼ぶ関数の番地を `system()` に向ける。CPU は、PC が指す命令が正規の流れかどうかを区別せずに実行する | [9章 場面4][9-4]、[6章 場面1][6-1] の段階2、[6章 場面4][6-4] の段階3 |

## 作りかけの表を後片付けが読む（CVE-2026-109618） <!-- tab: 作りかけ -->

### 数に入った作りかけの要素

- PHP は、要求ごとのメモリが `memory_limit` を越えると致命的エラーを出し、`longjmp()` で要求の処理から抜ける。抜けた先では、要求の後片付け（request shutdown）が、そのとき見えるデータを解放する。
- 勧告によれば、要求のメモリには、初期化し終える前にほかの処理から見える所がある。そこでどれかの確保が失敗すると、作りかけのまま後片付けに渡る。失敗する確保は、作りかけのデータと無関係でもよい。
- 発見者の Calif と、独自に再現した Datadog が示したのは、ハッシュ表に要素を足す `_zend_hash_str_add_or_update_i()`（`Zend/zend_hash.c`）である。要素の数を先に増やし、その後でキーの文字列を確保する。キーの確保で上限を越えると、数に入った要素の中身は、前にそのメモリを使ったデータのバイトのまま残る。
- 後片付けは、数に入った要素をすべて PHP の値として読む。Datadog は 8.5.11 で、残ったバイトを偽の配列を指す値に見せ、その配列を壊すときに呼ぶ関数を C の `system()` にして、コマンドを実行させた。狙ったバイトは、前もって同じ大きさの区画に並べておく（ヒープグルーミング）。

### 既定の設定で OOM に届く

- 本文の解析は、アプリのスクリプトより前に走る。URL エンコードの POST（`a[x]=v`）も、ファイルの送信（`multipart/form-data`）も、`$_POST`・`$_FILES` を作るときに同じ関数を通る（[21章 場面2][21-2] の段階1）。
- 空のファイル欄（`filename=""`）は `max_file_uploads`（既定 20）に数えられないのに、`$_FILES` に 6 つの要素（name・full_path・type・tmp_name・error・size）を作る。名前を `f[a][b][c]…` と入れ子にすると、作る表と文字列が増える。Calif によれば、数百並べると、本文は `post_max_size`（既定 8 MiB）以下のまま `memory_limit`（既定 128 MiB）を越える。
- multipart の本文の大きさは、宣言の `Content-Length` とだけ比べていた。chunked の HTTP/1.1（[21章 場面1][21-1] の段階3）や、長さを書かない HTTP/2 には宣言が無く、確認を越えて本文を送り続けられた。部品ごとのヘッダの数にも上限が無かった。
- Apache の mod_php は、要求の初めの処理が失敗しても後片付けを必ず走らせるので、アプリのコードが 1 行も動く前に作りかけの表を読む。PHP-FPM はこの場合ワーカーを終わらせるので、読まない。勧告は、FPM でもアプリの処理の中で OOM に届けば起きうるが、実証は無いと書く。

## 要求をまたいで残る古い状態（CVE-2026-109619） <!-- tab: 古い状態 -->

### 作り手と使い手が同じワーカーに当たる

- PHP のワーカーは要求をまたいで生き続け、エラー・セッション・オブジェクト・拡張の大域の状態を持つ。その中には、1 つの要求のメモリを指すものがある。要求のメモリを解放する前に、それらを必ず戻さなければならない。
- 致命的エラー（OOM を含む）が戻す処理より前に処理を捨てると、大域は解放したメモリを指したまま残る。後片付けで消したエラーの状態を、後から出た警告が書き戻すこともある。
- 次の要求で、通常の初期化より前に走る処理がその値を読むと、解放した後のメモリを使う（use-after-free）。勧告は、古い状態を残す処理を「作り手」、読む処理を「使い手」と呼ぶ。2 つは別の要求で、同じワーカーに当たる必要がある。

### 確かめられた経路

- 8.5 の `fatal_error_backtraces`（既定で有効）: 致命的エラーの報告がバックトレースを要求のメモリに残し、後片付けはそれを必ず戻し忘れた。次の要求で、初期化より前に出る警告（`.htaccess` などで渡した無効な INI の設定）が古い値に触れる。mod_php での RCE の土台で、Wiz は Drupal で示した。
- session upload progress: アップロードを受けると、通常のセッションの初期化より前にセッションの状態を作る。既定で有効で、アプリが `session_start()` を呼ばなくても動く。mod_php と FPM の両方で RCE が確かめられた。
- Wiz は、解放したメモリを指したまま残ったセッション ID を、次の要求が応答の `Set-Cookie: PHPSESSID=…` に URL エンコードして書き出す例も示した（[21章 場面5][21-5] の段階5）。ヒープの中身が漏れるので、番地を知る手段になりうる。
- Wiz は、OPcache の共有のスロットを別のワーカーが別の型で使う欠陥（WordPress で RCE）も挙げる。Wiz の記事は 4 つの欠陥と 2 つの CVE の対応を勧告と違えて書いており、このノートは勧告の分け方に従う。

## 直し方 — 作りかけのまま抜けない <!-- tab: 直し方 -->

### 8.2〜8.5: 作り終えてから止める

- 修正は「Avoid state corruption via bailout」という 1 つのコミットで、サポート中の 4 つの系列に同じ題で入った。8.5 では 423 ファイル、+11,556 −1,017 行で、うち 295 本が試験（`.phpt`）である。
- 確保が `memory_limit`（soft）を越えても、その場で `longjmp()` しない。エラーを取っておき、VM に割り込みの印を立てて、確保は通す。次の VM の安全点（`zend_handle_delayed_oom()`）で、スクリプトの中なら終わらせる例外（`UnwindExit`）を投げ、そうでなければ打ち切る。作りかけのデータは、止まる前に作り終わる。
- 2 つ目の上限（hard）を足した。これを越える確保は、後片付けをせずに `_exit(137)` でプロセスを終える。既定は soft の 2 倍（soft が 1 GiB を超えるときは +1 GiB）で、新しい INI の `memory_hard_limit_percent` で変えられる。
- 要求の解析は、失敗してよい確保（`femalloc()` など）を使う形に書き直した。この確保は soft を越えると NULL を返し、呼んだ側が自分で畳む。multipart の本文は実際に読んだバイトも `post_max_size` と比べ、部品のヘッダは `Content-Disposition` と `Content-Type` だけを残す。

### 大域の状態を戻す

- 要求の終わりと次の要求の初めに、エラー・例外・バックトレース（8.5）・ユーザーのエラーハンドラ・オブジェクトの表・`$_POST` などの大域を戻す。7.4〜8.1 の最小限の修正にも同じ処理が入った。
- 8.2〜8.5 は、session upload progress を残したまま直した。初期化より前には、ユーザーのコードを呼ばない形（autoload も `__wakeup()` も呼ばない）でセッションを読み書きし、使うシリアライズの状態も要求の初めの早い所で戻す。
- OPcache は、クラスのキャッシュのスロットを、全ワーカーで共有する番号の上限（`ZCSG(map_ptr_last)`）を進めた後で公開する。途中で止まっても、別のワーカーが別の用途に使いうるスロットを残さない。7.4〜8.1 にも入った。

### 7.4・8.0・8.1: 後片付けをせずに止める

- 最小限の修正（8.1 は 23 ファイル、+311 −73 行）は、遅らせる仕組みを入れない。上限を越えたらエラーを stderr に書き、`_exit(1)` でプロセスを終える。`longjmp()` も後片付けもしない。
- session upload progress は、安全に直せないので丸ごと止めた（`if (!PS(rfc1867_enabled) || true)`）。本文の実際の大きさの確認は入っていない。
- ハッシュ表の「数を先に増やし、キーを後で確保する」順序は、8.5.12 でも同じである（修正の前後のソースで確かめた）。どちらの修正も順序は変えず、作りかけの間に `longjmp()` で抜ける道を無くした。Datadog は、同じ型の欠陥がこれからも見つかると見ている。

## 層ごとの守り <!-- tab: 守り -->

| 守り | 層 | 章・場面 | 出どころと注意 |
|---|---|---|---|
| 修正版に上げる | PHP 本体 | — | 公式。勧告は、完全な対策はこれだけと書く。7.4・8.0・8.1 は最小限の修正をソースからビルドする。7.3 以前には修正が出ない。Ubuntu と Debian は 10-21 に更新を配った（Ubuntu は ESM で 5.5 まで） |
| `session.upload_progress.enabled = 0`。8.5 では `fatal_error_backtraces = 0` も | PHP 本体の機能を止める | [21章 場面1][21-1] | 公式の暫定策（109619）。確かめられた経路だけを塞ぐ。php.ini・FPM の pool・サーバーの設定に書き、ワーカーを再起動する。`ini_set()` と `.user.ini` では遅い |
| `memory_limit = -1` を、アプリが戻せない形で設定する。`post_max_size` を小さく（アップロードが無ければ 8M、あれば 32M） | PHP 本体 | — | 公式の暫定策（109618）。狙って起こせる OOM は無くなるが、`mmap()` などの下の確保が失敗すると、同じ道に入る |
| 展開した後の本文の大きさ・欄の数・部品の数・ヘッダの数・名前の入れ子の深さを、Web サーバーやプロキシで制限する | HTTP（TLS をほどいた後） | [21章 場面1][21-1] の段階3、[22章 場面3][22-3] の段階4 | 公式の暫定策。`Content-Length` の無い要求も対象にする。Cloudflare は 10-21 03:02 UTC から全プランの WAF で止め、要求と応答を組で見る検知を初めて使った。WAF は修正の代わりにならない |
| cgroup の `memory.max` でワーカーのメモリを絞る | OS（プロセスの資源） | [9章 場面2][9-2] | 公式の暫定策（109618）。ワーカーごとの組にしないと、親と全ワーカーが一緒に殺される。`RLIMIT_AS`・`RLIMIT_DATA` は使わない（`mmap()` の失敗が同じ道に入る） |
| FPM の `pm.max_requests = 1` | OS（プロセス） | [9章 場面2][9-2] | 公式の暫定策（109619）。要求ごとにワーカーを作り直すので、古い状態が次の要求に残らない。遅くなる |
| インターネットに面したアプリを公衆網から切り離す | IP・ポート | [14章 場面5][14-5]（外から始まる通信を止める） | CERT-EU が、すぐ修正できない場合に検討するよう勧めた |
| PHP のプロセスがシェルを起動したら気づく | OS（システムコール） | [9章 場面3][9-3] | Huntress、Datadog。親が `apache2`・`php-fpm`、子が `sh`・`bash`・`curl` の組を見張る。Datadog は、作りの良い攻撃は HTTP 200 を返し、ワーカーも落ちないので、エラーとクラッシュのログには頼れないと書く |
| PHP を実行するプロセスの権限を絞る | OS（プロセスと利用者） | [9章 場面1][9-1]、[9章 場面2][9-2] | 一般論。乗っ取られた後の被害の範囲を狭める |
| `disable_functions`・`open_basedir` で PHP の関数を絞る | PHP 本体 | — | 一般論。効かない。PHP の関数を呼ぶ所で調べる仕組みで、メモリの誤りから C の関数（Datadog の例では `system()`）を直に呼ばれると素通りする |

## CVSS と前例 <!-- tab: CVSS・前例 -->

### CVSS 9.2 から読めること

- 2 件とも、ベクトルは `CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` で 9.2 である。
- 9.2 になる CVSS v4.0 の基本ベクトルは、全 104,976 通りのうち 699 通りある。点数だけではベクトルは決まらない（Python の `cvss` 3.6 で全通りを計算した）。
- ネットワーク越しに（AV:N）、認証なしで（PR:N）、利用者の操作なしに（UI:N）、そのシステムの機密性・完全性・可用性をすべて失い（VC/VI/VA:H）、ほかのシステムには及ばない（SC/SI/SA:N）とき、AC:L・AT:N なら 9.3 になる。9.2 になるのは AC:H と AT:P の少なくとも一方が付く 3 通りで、実際は両方が付いていた。
- AC:H は、ASLR などの防御を越える必要があることを示す。ASLR は [9章 場面4][9-4] の仮想アドレスの配置を起動ごとに変える仕組みで、攻撃者は番地を知る必要がある。AT:P は、攻撃に前提が要ることを示す。勧告は、成功の確かさがビルド・拡張・フロント・ヒープの配置で変わり、109619 では 2 つの要求が同じワーカーに当たる必要があると書く。
- 予告の前に漏れた「CVSS 10」は誤りだった。v4.0 では、ほかのシステムへの影響（SC/SI/SA）が無いと 9.3 が上限で、10.0 にならない。

### 過去の PHP 本体の RCE

| CVE | 公開 | 何が起きたか | 層 | 悪用 |
|---|---|---|---|---|
| CVE-2004-0594 | 2004-07 | `memory_limit` による打ち切りを `zend_hash_init()` の途中で起こし、初期化を終える前のハッシュ表のデストラクタの番地を書き換える | PHP 本体のメモリ管理とエラー処理 | — |
| CVE-2019-11043 | 2019-10 | 特定の nginx の設定で、細工した URL により PHP-FPM が確保した領域の外へ書き込む | PHP 本体（FastCGI の受け口）のメモリの誤り | 2022-03-25 に CISA KEV へ載った |
| CVE-2024-4577 | 2024-06 | Windows の文字の置き換え（Best-Fit）で、URL の文字が php-cgi のオプションとして解釈される | PHP 本体と OS の境目（コマンドラインの引数） | 2024-06-12 に CISA KEV へ載った |

- PHP 本体の RCE には、メモリの誤りの例も、入力が命令として解釈される例もある。今回はメモリの誤りで、22 年前の CVE-2004-0594 と同じく、打ち切りが初期化の途中に割り込む型だった。
- 発見者の Calif は、今回の型の始まりを 2004 年の Stefan Esser の研究に置く。同じ OOM は 2020 年の bug #78876 でも報告され、2024 年の監査（Quarkslab、OSTIF の主催）でも見つかったが、悪用を示せず直らなかった。

## この PC で確かめたこと <!-- tab: この PC -->

### 修正前の 8.5.11 と修正後の 8.5.12

| 試したこと | 8.5.11（修正前） | 8.5.12（修正後） |
|---|---|---|
| 既定の INI（php.ini なし） | `memory_limit` 128M、`post_max_size` 8M、`max_file_uploads` 20。`session.upload_progress.enabled` と `fatal_error_backtraces` は有効 | 同じ。新しい `memory_hard_limit_percent` は空で、hard は soft の 2 倍になる |
| `memory_limit=32M` で、配列に整数を足し続ける | 要素が 1,048,576 個になった所で、配列を 32 MiB に広げる確保を断り、その場で致命的エラーにした。OS から取ったメモリの最大は 26.0 MiB | 同じ確保を通して 1 つ足し（1,048,577 個）、次の安全点で同じ致命的エラーにした。最大は 34.0 MiB で、上限の 32 MiB を越えた |
| 同じことを `memory_hard_limit_percent=100`（hard = soft）で | この INI は無く、`memory_limit=32M` だけのときと同じ | `Hard memory limit of 33554432 bytes exhausted …` の 1 行だけを出し、終了コード 137。shutdown 関数もスタックトレースも出ない |
| 同じことを `memory_hard_limit_percent=150` で | — | hard が 48 MiB になり、`memory_limit=32M` だけのときと同じ致命的エラー |

### 読み取れること

- 8.5.12 は、soft を越えた確保をその場で失敗させず、区切りの所まで進めてから止める。作りかけの表が残らない代わりに、上限を少し越えて使う。
- hard を越えると、shutdown 関数も後片付けも走らない。壊れているかもしれない状態を誰にも読ませない代わりに、要求の終わりの処理（shutdown 関数でのログの書き出しなど）も失われる。
- soft で止まったとき（既定の hard と `=150`）は、どちらも終了コード 255 で、shutdown 関数が動いた。CLI では常にスクリプトの中なので、soft の超過は `UnwindExit` を通る。
- 試したのは CLI だけで、Web の要求の解析（本文の大きさの確認、session upload progress）は試していない。イメージは Docker の公式の `php:8.5.11-cli`（`sha256:8e5d746f8765…`）と `php:8.5.12-cli`（`sha256:595a7cbb1e05…`）で、ネットワークを切って動かした。

## 影響と、追って確かめること <!-- tab: 影響と今後 -->

### 影響の大きさ

- W3Techs（2026-10-21）では、サーバー側の言語が分かるサイトの 69.3% が PHP を使う。PHP のサイトの 34.8% は PHP 7 以前で、サポートが終わっている（8.0・8.1 も終わっているが、W3Techs の表に内訳は無い）。
- 配布元は事前に修正を受け取っており、Ubuntu と Debian は公開の日に更新を配った。Ubuntu は 26.10・26.04・24.04・22.04 を直し、ESM（Ubuntu Pro）で 20.04 の 7.4 から 14.04 の 5.5 までを直した。Debian は 12 の 8.2 と 13 の 8.4 を直した。PHP は、ボランティアが保守する rpms.remirepo.net にはこの日の更新が出ないと名指しした。
- 報告者には Calif・Wiz・OpenAI（Codex Security）が含まれる。Calif と Wiz は、AI のモデルを使って見つけたと書く。Wiz は、Heartbleed（2014）・Log4Shell（2021）に並ぶ転機になりうると書く。Calif は、簡単な指示で「すべてのバグ」を掘り出せるモデルは今のところ無いと書く。

### 追って確かめること

- CISA の KEV に載るか。実際のシステムへの侵入が確かめられるか。
- 7.3 以前と、ディストリビューションの外で配られる PHP（コンテナのイメージ、組み込み機器、ホスティングの管理画面など）がどれだけ直るか。
- 同じ型の欠陥（作りかけの間に抜ける道）が、ほかの所でも見つかるか。

## 出典 <!-- tab: 出典 -->

### 公式とデータ

- php.net: [告知（10-21）](https://www.php.net/archive/2026.php#2026-10-21-5)、[予告（10-20）](https://www.php.net/archive/2026.php#2026-10-20-1)、[サポート中の版](https://www.php.net/supported-versions.php)、[Session Upload Progress（マニュアル）](https://www.php.net/manual/en/session.upload-progress.php)
- GitHub の勧告: [GHSA-w8hw-w9fx-j79w][ghsa-18]（CVE-2026-109618）、[GHSA-6wmf-4rv5-p3rp][ghsa-19]（CVE-2026-109619）。CVE の記録: [CVE-2026-109618](https://cveawg.mitre.org/api/cve/CVE-2026-109618)、[CVE-2026-109619](https://cveawg.mitre.org/api/cve/CVE-2026-109619)
- 修正のコミット: [8.5 31c0ea7d7f](https://github.com/php/php-src/commit/31c0ea7d7ff1)、[8.4 506e87fa7d](https://github.com/php/php-src/commit/506e87fa7dcd)、[8.3 3c832b523e](https://github.com/php/php-src/commit/3c832b523ee1)、[8.2 01a40e89fb](https://github.com/php/php-src/commit/01a40e89fbfc)、[8.1 1d7dec178a](https://github.com/php/php-src/commit/1d7dec178a09)（最小限）。7.4・8.0 の最小限の修正は [PHP-7.4](https://github.com/php/php-src/tree/PHP-7.4-CVE-2026-109618-109619)・[PHP-8.0](https://github.com/php/php-src/tree/PHP-8.0-CVE-2026-109618-109619) のブランチ
- 配布元: [Ubuntu](https://ubuntu.com/security/CVE-2026-109618)、[Debian](https://security-tracker.debian.org/tracker/CVE-2026-109618)。oss-security の [109618](https://www.openwall.com/lists/oss-security/2026/10/21/6)・[109619](https://www.openwall.com/lists/oss-security/2026/10/21/7) の投稿と、修正が不完全という指摘への[返信](https://www.openwall.com/lists/oss-security/2026/10/21/23)
- NVD: [CVE-2004-0594](https://nvd.nist.gov/vuln/detail/CVE-2004-0594)、[CVE-2019-11043](https://nvd.nist.gov/vuln/detail/CVE-2019-11043)、[CVE-2024-4577](https://nvd.nist.gov/vuln/detail/CVE-2024-4577)。[CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)、[W3Techs: PHP](https://w3techs.com/technologies/details/pl-php)

### 研究者と報道

- 発見者と PHP: [Calif](https://calif.io/php2shell/)（仕組み、経緯）、[PHP Foundation](https://thephp.foundation/blog/2026/10/21/todays-php-security-release-and-how-were-strengthening-php-security/)（経緯、漏れ）、[Wiz](https://www.wiz.io/blog/php2shell-php-rce)（4 つの欠陥）
- 再現と悪用: [Datadog](https://securitylabs.datadoghq.com/articles/php2shell-critical-vulnerabilities-in-php/)（独自の再現、検知）、[AWS](https://aws.amazon.com/blogs/security/amazon-threat-intelligence-identifies-php2shell-exploitation-prior-to-public-disclosure-in-madpot/)（公開前の試み）、[Cloudflare](https://blog.cloudflare.com/php-vulnerabilities-waf-protection/)（WAF）、[watchTowr の FAQ](https://watchtowr.com/intelligence/php-cve-2026-109618-faq/)
- 予告の時点: [BleepingComputer（2026-10-20）](https://www.bleepingcomputer.com/news/security/php-warns-admins-of-two-critical-flaws-emergency-patches-coming-tomorrow/)、[CERT-EU 2026-018](https://cert.europa.eu/publications/security-advisories/2026-018/)、[Huntress](https://www.huntress.com/blog/php2shell-leaked-critical-php-vulnerabilities)、[Sansec](https://sansec.io/research/php2shell)、[Phoenix Security](https://phoenix.security/php-core-rce-cve-2026-109618-109619-critical-remote-code-execution/)、[lilting.ch](https://lilting.ch/en/articles/php2shell-session-upload-progress-uaf)

[ghsa-18]: https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w
[ghsa-19]: https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp
[6-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/06-cpu.html#s1
[6-4]: https://okayus.github.io/youtube-ga-mieru-made/chapters/06-cpu.html#s4
[9-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s1
[9-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s2
[9-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s3
[9-4]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s4
[11-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/11-sou.html#s3
[11-6]: https://okayus.github.io/youtube-ga-mieru-made/chapters/11-sou.html#s6
[14-5]: https://okayus.github.io/youtube-ga-mieru-made/chapters/14-router.html#s5
[20-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/20-tls.html#s1
[20-6]: https://okayus.github.io/youtube-ga-mieru-made/chapters/20-tls.html#s6
[21-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/21-http.html#s1
[21-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/21-http.html#s2
[21-5]: https://okayus.github.io/youtube-ga-mieru-made/chapters/21-http.html#s5
[22-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/22-server.html#s3
