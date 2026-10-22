# 調査メモ: PHP 2026 年 10 月のセキュリティリリース（2026-10-22）

次のセッションへの引き継ぎ。**作業は途中**。目的は、既存のノート
`news/2026-10-20-php-security-release.md`（予告の時点で書いたもの）に、
**実際に出た修正版（2026-10-21）の内容**＝どんな脆弱性だったか・どう直したかの解説を追記すること。
ユーザーの依頼文: 「PHP のセキュリティパッチの内容を確認し、実際どのような脆弱性だったか、どうやって修正したのかの解説を … に追記して」。出典は <https://www.php.net/archive/2026.php#2026-10-21-5>。

この調査は一次情報（php.net の告知・GitHub の勧告・php-src の修正コミットの差分）に当たって裏を取ってある。
二次情報（ベンダーの解説記事）は仕組みと悪用状況の補足に使った。
スクラッチパッドに置いた取得物はこのセッション限りで消えるので、**下の URL と SHA から取り直すこと**。

> 文章の書き方は `docs/authoring.md` §8。ノートの構成は `news/README.md`。
> `.html` は手で直さず、`.md` を直して `node tools/build-news.mjs`→`node tools/verify.mjs` の順。

---

## 1. 一次情報の所在（取り直し用）

### php.net
- 告知（勧告本体）: <https://www.php.net/archive/2026.php#2026-10-21-5>（"Security advisory: Critical remote code execution vulnerabilities, update now"）
- 各版のリリース: 同ページの `#2026-10-21-1`〜`-4`（8.2.35 / 8.3.36 / 8.4.27 / 8.5.12）
- 予告（既存ノートの出典）: `#2026-10-20-1`
- EOL 向けソースバックポートのブランチ:
  - `https://github.com/php/php-src/tree/PHP-7.4-CVE-2026-109618-109619`
  - `…/PHP-8.0-CVE-2026-109618-109619`
  - `…/PHP-8.1-CVE-2026-109618-109619`

### GitHub Security Advisory（`gh api repos/php/php-src/security-advisories/<GHSA>` で JSON が取れる）
- `GHSA-w8hw-w9fx-j79w` = **CVE-2026-109618** "RCE via OOM corruption"
- `GHSA-6wmf-4rv5-p3rp` = **CVE-2026-109619** "RCE via stale global state"
- 両方とも published 2026-10-21、CVSS v4.0 **9.2**、CWE-416/755/824/1325/1419。

### 修正コミット（php-src）
1 本の大きなコミット＋NEWS で、全サポート枝に同じ題で入っている。題は
**"Avoid state corruption via bailout"**（Arnaud Le Blanc 作、Ilija Tovilo コミット、2026-10-18）。本文:
> - Replace bailout on OOM with UnwindExit
> - Properly reset various globals that may be accessed during startup
> Fix GHSA-w8hw-w9fx-j79w (CVE-2026-109618) / Fix GHSA-6wmf-4rv5-p3rp (CVE-2026-109619)

| 枝 | 修正コミット | 規模 |
|---|---|---|
| 8.5 | `31c0ea7d7ff1`（+NEWS `3d37ab3b8ee6`） | +11,556 −1,017、約 300 ファイル（うち 295 が新規 `.phpt`） |
| 8.4 | `506e87fa7dcd` | ほぼ同じ |
| 8.3 | `3c832b523ee1` | ほぼ同じ |
| 8.2 | `01a40e89fbfc` | ほぼ同じ |
| 7.4（EOL・最小） | `712e60f9edfd` | 17 ファイル +240 −59 |
| 8.0（EOL・最小） | `82f8f31b16a0` | — |
| 8.1（EOL・最小） | `1d7dec178a09` | 23 ファイル +311 −73 |

取り方の例:
```
gh api repos/php/php-src/compare/php-8.5.12RC1...php-8.5.12   # 8.5 の保安コミットだけ入った差分
curl -sSL https://github.com/php/php-src/commit/31c0ea7d7ff1....diff   # 8.5 の修正の patch
curl -sSL https://github.com/php/php-src/commit/1d7dec178a09.diff      # 8.1 の最小版
git clone --depth 5 -b php-8.5.12 https://github.com/php/php-src.git    # 修正後のソース
```
修正**前**は `php-8.5.12` の 1 つ前の統合コミット `dd830558`（`git show dd830558:<path>` で修正前が見える）。

### CVE / KEV / 配布元
- CVE 記録（もう公開。既存ノートの「RESERVED」は更新が必要）:
  `https://cveawg.mitre.org/api/cve/CVE-2026-109618`、`…-109619`。assigner は php、参照は GHSA のみ。
  - 109618 の説明: "PHP uses longjmp() for out-of-memory (OOM) errors to exit the current context and abort handling of the request. Some contexts may not properly account for this scenario and leave request memory in an uninitialized state before performing an allocation. The subsequent request cleanup procedure may read/branch on it."
  - 109619 の説明: "PHP has various global state that temporarily points into request memory. … global state may then refer to request memory even after it has been freed. Subsequent requests may read or branch on this stale state."
- **CISA KEV には未掲載**（KEV catalog 2026.10.21 を取得して確認。PHP 関連の既載は CVE-2024-4577・2019-11043・2012-1823 など古いものだけ）。
- Ubuntu（CVE tracker、priority **Critical**、2026-10-21）: php8.5 は `8.5.9-0ubuntu2.1`（26.10）/`8.5.4-0ubuntu1.5`（26.04）、php8.3 `8.3.6-0ubuntu0.24.04.13`（24.04 noble）、php8.1 `8.1.2-1ubuntu2.28`（22.04 jammy）で fixed。7.x は ESM（Ubuntu Pro）。**Node のノートのときと違い Ubuntu はもう配っている**。
- Debian: bookworm php8.2 `8.2.35-1~deb12u1`（DLA-4848-1）、trixie php8.4 `8.4.27-1~deb13u1`（DSA-6574-1）。security-tracker の Notes に `https://www.php2shell.com/` を載せている。

### 二次情報（仕組み・悪用の裏取りに使ったもの）
- PHP Foundation の解説（経緯・体制・リークの顛末）: <https://thephp.foundation/blog/2026/10/21/todays-php-security-release-and-how-were-strengthening-php-security/>
- Calif（発見者本人の技術解説。`_zend_hash_str_add_or_update_i` の順序、session upload progress、unserializer を具体的に）: <https://calif.io/php2shell/>
- Wiz Research（4 つのバグと AI の寄与）: <https://www.wiz.io/blog/php2shell-php-rce>
- Datadog Security Labs（独自に再現、修正の効き方を説明）: <https://securitylabs.datadoghq.com/articles/php2shell-critical-vulnerabilities-in-php/>
- Rapid7 ETR / Tenable FAQ（版・SAPI・悪用状況の整理）
- Cloudflare（WAF、full transaction detection、観測した攻撃）: <https://blog.cloudflare.com/php-vulnerabilities-waf-protection/>
- AWS Amazon Threat Intelligence（MadPot で公開前から観測）: <https://aws.amazon.com/blogs/security/amazon-threat-intelligence-identifies-php2shell-exploitation-prior-to-public-disclosure-in-madpot/>
- watchTowr FAQ（既存ノートで既出）: <https://watchtowr.com/intelligence/php-cve-2026-109618-faq/>
- まとめサイト: <https://www.php2shell.com/>（Wiz 運営。研究各社・CDN へのリンク集）

---

## 2. 確定した事実（既存ノートの「確かさ」の表を更新できる）

| 項目 | 確定した内容 | 出どころ |
|---|---|---|
| 公開 | 2026-10-21 14:00 UTC に予定どおり公開（予告を 1 日前倒し。元は 10-22 だったが 10-20 ~15:00 UTC に CVE 番号が HN/SNS へ漏れたため）。前倒しは「配布元がまだ梱包中で、即時公開だと更新経路のない利用者が出る」ための妥協 | php.net、PHP Foundation |
| 件数・点数 | 2 件、どちらも CVSS v4.0 **9.2**（予告どおり） | GHSA |
| CVE 番号 | CVE-2026-109618 / 109619。**既存ノートで「未確認」としていたが確定**。既存ノートの番号は正しかった | GHSA・CVE API |
| CVSS ベクトル | 両方 `CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` | GHSA |
| 種類 | 109618 = OOM 時の `longjmp`（bailout）で、初期化途中のリクエスト用メモリを後片付けが有効とみなす。CWE は UAF・例外処理不備・未初期化ポインタ参照など。109619 = リクエストをまたいで残る大域状態の use-after-free | GHSA・CVE |
| 影響を受ける版 | **PHP 5.4.0 以降のほぼ全て**（既存ノートの「PHP 5 以降のすべて（未確認）」が確定）。最も古い経路は 5.4.0（Calif）、Wiz も「10 年分ほぼ全部、5.4 まで遡る」 | php.net・Calif・Wiz |
| 直った版 | 8.2.35 / 8.3.36 / 8.4.27 / 8.5.12。8.1 以前は公式リリース無し。7.4・8.0・8.1 は**最小ソースバックポート**のみ（ビルドする人向け）。5.4〜7.3 は修正なし | php.net |
| 影響する SAPI | Web を処理する全部: PHP-FPM, Apache mod_php, php-cgi, FrankenPHP, LiteSpeed。**最も危険は mod_php**（アプリのコードが動く前に未認証 RCE を実証済み、既定設定で） | php.net |
| 悪用 | **実際に起きている（既存ノートの「見つかっていない」は更新が必要）**。AWS MadPot が公開前の 2026-10-17 に試行を観測、10-21 02:00〜08:00 UTC に複数の攻撃者。Cloudflare・watchTowr も観測。「now being broadly exploited」 | AWS・Cloudflare・watchTowr |

---

## 3. 二つの脆弱性の仕組み（解説の核・概念レベル）

両方とも**同じ型**: 致命的エラー（特に OOM）が処理の途中で割り込み、
後からその中途半端な状態を有効なものとして扱う。既存ノートが「PHP 本体＝ C で書かれた言語処理系」と
置いた層の、**メモリ管理（ZendMM, `Zend/zend_alloc.c`）とエラー処理（`longjmp`/bailout）とリクエストの生死**という、
どの要求も必ず通る部分の欠陥。PHP Foundation 自身「memory management and error handling。ほぼ全ての要求が触る中枢だから深刻で、かつ互換性・性能・拡張を壊さずに直すのが難しかった」。

### CVE-2026-109618 — OOM による状態の破壊
- PHP は OOM を `longjmp()`（`zend_bailout`）で大域脱出してリクエストを畳む。
  ある種の場面では、リクエスト用メモリが**まだ初期化しきっていないのに、もう有効（カウント済み／公開済み）として見える**。
  その瞬間に確保が失敗すると、早期脱出の帳尻が合わず、無効な状態が残る。
  後片付け（request shutdown）がそれを読む／分岐する。
- 具体例（Calif・Datadog が実証した 1 インスタンス）: `Zend/zend_hash.c` の `_zend_hash_str_add_or_update_i()` は
  ```
  idx = ht->nNumUsed++;           // 件数を先に増やす
  ht->nNumOfElements++;
  p = ht->arData + idx;
  p->key = zend_string_init(...); // ここで memory_limit 超過 → bailout しうる
  ```
  鍵の確保が失敗すると、**バケットは「件数」に数えられているのに中身は未初期化**。
  `zend_array_destroy()` は数えられたバケットを全部回って中身を zval とみなすので、
  攻撃者がヒープグルーミングで仕込んだ残骸バイトを「生きた値」として解釈させ、
  配列のデストラクタ呼び出し先を `system()` の番地に向ける → コマンド実行。
  これは**6章（CPU は次に実行する番地が正規かを区別しない）＋9章場面4（仮想メモリ）**そのもの。
- **重要**: この「カウント先・確保後」の順序は **8.5.12 でもそのまま**。修正は周りのエラー処理を変えた（後述）。
- 入口（どちらも `php_request_startup()` 中、対象スクリプトより前に走る）:
  - URL エンコード POST `root[x]=v`: `php_std_post_handler()`→`php_register_variable_ex()`→`zend_symtable_str_update_ind()`→`_zend_hash_str_add_or_update_i()`
  - RFC1867 アップロード: `rfc1867_post_handler()`→`register_http_post_files_variable_ex()`→…→同じ関数
- SAPI 差: **mod_php は起動が失敗しても request shutdown を必ず走らせる**ので壊れた表を消費＝アプリのコード 0 行で RCE。**PHP-FPM は起動失敗で子を exit** するので（この CVE では）消費しない。
- OOM を既定設定で起こす 2 つの作り方（既存ノートの session.upload_progress の話を補強できる）:
  1. **使える Content-Length の無い multipart**。PHP は自動 POST 解析の前に `post_max_size` を宣言 Content-Length とだけ比べ、実際に読むバイトには同じ上限をかけない。chunked HTTP/1.1 や長さ無し HTTP/2 で宣言長を無意味にできる。入力展開フィルタ（圧縮長 vs 展開長）でも同じズレ。
  2. **`filename=""` の空アップロード**は `max_file_uploads` に数えられないのに `$_FILES` の 6 要素（name, full_path, type, tmp_name, error, size）を全部作る。名前を入れ子（`files[a][b][c]…`）にすると 6 要素分それぞれに native HashTable/Bucket/文字列を作る。短い空アップロードを数百並べると、HTTP 本文は既定 8 MiB の `post_max_size` 以下のまま、既定 128 MiB のヒープを食い潰せる。

### CVE-2026-109619 — リクエストをまたぐ大域状態
- PHP にはワーカーが保持する大域状態（エラー・セッション・オブジェクト・拡張の状態）で、**1 つのリクエストの所有するメモリを指す**ものがある。そのメモリを解放する前に必ずリセットしないといけない。
- 致命的エラー（OOM 含む）が、対応するリセットの前に処理を捨てる。あるいは shutdown でいったん消したエラー状態を、非致命の診断が後から書き戻す。→ リクエストのヒープが解放されたのに、ワーカーの大域がまだそこを指す。
- **次のリクエストの「通常の初期化より前」に走る処理がその古い値を消費** → リクエストをまたぐ use-after-free。producer と consumer の両方が同じワーカーに当たる必要。
- 通常初期化より前に走る consumer（確定 2 つ）:
  1. **初期化前の INI 診断**: 無効／非推奨の INI を executor 初期化より前に適用したときの warning/notice/deprecation。mod_php の `.htaccess`・`php_value`・`php_admin_*`、FPM では nginx/`mod_proxy_fcgi` が送る `PHP_VALUE`/`PHP_ADMIN_VALUE`。`error_reporting`・`@`・`display_errors` では防げない。
  2. **初期化前の session upload progress**: 通常のセッション初期化より前にセッション処理へ届く。
- 確定したケース:
  - **8.5 の `fatal_error_backtraces`（既定 on）**: 致命的エラー報告がリクエスト所有のバックトレース状態（`EG(last_fatal_error_backtrace)`）を残し、shutdown でのリセットが常に漏れる。次のリクエストの診断が古い値に触れる。mod_php で RCE 確定（Wiz が Drupal で実証）。
  - **session upload progress の生死**: アップロードがモジュール初期化前にセッション／デコーダ状態を作る。OOM/致命で対応リセットが飛ぶ。後のアップロード進捗処理がその大域に触れる。**mod_php と FPM の両方で RCE 確定**。FPM では起動成功後にアプリが適当な操作で状態を残すことが前提。session upload progress は既定有効で、アプリが `session_start()` を呼ばなくても走る。
- Wiz が挙げた 4 つのバグ（2 CVE に束ねられる）: ① upload-progress unserializer の UAF（→ RCE）② プロセスメモリの遠隔読み出し（`PS(id)` が解放済みを指したまま → PHPSESSID 応答クッキーに URL エンコードされて漏れる。アプリ非依存）③ fatal-error backtrace の UAF（→ Drupal で RCE）④ OPcache の型混同（`zend_accel_script_persist` が process-local の `CG(map_ptr_last)` を進め、共有フロンティアの公開はその後。間で確保が失敗すると、別ワーカーがそのスロットを再利用して型混同 → WordPress で RCE）。

> **要確認（CVE 番号の対応のズレ）**: Wiz の表は「upload-progress unserializer UAF＋メモリ漏れ」を **109618**、「fatal-error backtrace UAF＋OPcache 型混同」を **109619** に割り当てていて、php.net/GHSA の枠（109618＝OOM corruption、109619＝stale global state）と食い違って見える。**権威は php.net/GHSA の方**。ノートでは GHSA の枠（109618＝OOM で畳む途中の破壊、109619＝またぐ大域状態）で書き、Wiz の対応が違うことは脚注程度にとどめるのが無難。

---

## 4. どう直したか（解説の本体）

### 8.5（フル修正、`31c0ea7d`）— 2 本柱
**柱 1: OOM の bailout をやめ、遅延 OOM にした**（コミット題の "Replace bailout on OOM with UnwindExit"）
- `EG(delayed_oom)`（新しい `zend_oom_info` 構造体: state = NONE/PENDING/HANDLING/HANDLED、lineno、message、filename）を追加。
- ソフト上限を超えそうなとき、`zend_mm_delayed_error()` がエラー文面を永続メモリに溜めて state=PENDING にし、**VM 割り込みフラグを立てて、確保は（"fallible" のとき）NULL を返す**（その場で `longjmp` しない）。進行中の処理はデータを初期化し終える。次の VM の安全点で `zend_handle_delayed_oom()` が走り、ユーザーフレームがあれば **UnwindExit（`zend_throw_unwind_exit`）** を投げ、無ければ bailout する。だから shutdown が無効な状態を見ることはもう無い。
- **ハード上限**（ソフト上限の上）を新設。超えたら `zend_mm_hard_limit_error()` が即 **`_exit(137)`**（無効な状態の上で後片付けをしない）。既定のハード上限 = ソフト上限 +1 GiB（上限 ≥1 GiB のとき）または 200%。新 INI `memory_hard_limit_percent`（既定 -1）。`ZEND_MM_MAX_ALLOCS_EXIT_STATUS=121`（テスト用に任意の n 回目の確保で OOM を起こす `ZEND_MM_MAX_ALLOCS` 環境変数の exit コード）。
- **fallible allocation** API 一式（`femalloc`/`fecalloc`/`ferealloc`、`zend_fnew_array`、`array_finit_*`、`zend_hash_*_finit`、`HASH_FALLIBLE` フラグ、`HASH_NOMEM` 番兵）。要求解析経路（`main/rfc1867.c`・`main/php_variables.c`）の呼び出し側が NULL／`ZEND_HAS_OOM()` を見て綺麗に畳むよう全面的に書き換え。
- `array_init_singleton()` / `zend_new_array_singleton()`: 要求変数の登録で使うサイズ 1 の配列。拡張の失敗が中途半端な表を残さない。

**柱 2: 起動中に触れうるリクエスト所有の大域を、次の要求の通常初期化より前にリセット**（"Properly reset various globals…"）
- `zend_shutdown_executor_values()`: `user_error_handler`・`user_exception_handler`・`last_fatal_error_backtrace`・`record_errors`・`num_errors`・`errors`・`error_handling`・`exception` を初期化、`objects_store` を空に。
- `php_request_shutdown()`: 先頭と `shutdown_memory_manager()` 後に `EG(delayed_oom).state=NONE`、`http_globals` を `ZVAL_UNDEF`（起動前に触れうる）、`clear_last_error()`、`PG(modules_activated)=0`。
- **新 `php_basic_early_rinit()`** を `php_request_startup()` の `sapi_activate` より前で呼ぶ: `BG(serialize_lock)`・`BG(serialize)`・`BG(unserialize)`・URL スキャナをリセット。session upload progress が RINIT より前に（アン）シリアライズするため。
- セッション拡張（`ext/session/session.c`）:
  - 新 `PS(in_rfc1867_update)` フラグ。upload-progress ハンドラは RINIT 前でユーザーコードを走らせられないので、**「不完全クラスのみ」モード**で（アン）シリアライズ（autoload なし・`__wakeup`/`__unserialize` なし・そのまま書き戻す）。
  - `php_session_rfc1867_callback()`: `PG(modules_activated)` なら即 return（`request_parse_body()` でセッションを壊すため）。START で早めに `php_rinit_session_globals()`、END で不完全モードで作った `_SESSION` 大域を消す。`php_session_rfc1867_update()/cleanup()` は `php_session_initialize()` の戻りを見て畳む。
- OPcache（`ext/opcache/zend_persist.c`）: CE キャッシュのスロットを persist 窓の間だけ溜め、`ZCSG(map_ptr_last)` を公開した後にまとめて commit。bailout/exit が間に挟まっても、他プロセスが再利用しうるスロットを残さない。
- 拡張全般（date, exif, gd, iconv, json, mbstring, pcre, simplexml, standard の string/array/var, uri, xml, zlib ほか）に**同じ型の別インスタンスを潰す OOM 硬化**を大量投入＋新規 `.phpt` 295 本（ほぼ `oom_*`）。

### EOL 向け最小バックポート（7.4/8.0/8.1、`1d7dec178a09` ほか）— 別方針
フルの soft-OOM／fallible 改修はしない。代わりに:
- 新 `zend_mm_safe_error_ex()`: 旧 `zend_mm_safe_error()`（`zend_error_noreturn` を `zend_try` 内で呼んでから `zend_bailout`）を置き換え、**stderr に `Fatal error: … in … on line …` を出して即 `_exit(1)`**。つまり OOM＝即プロセス終了、無効状態の上での後片付けも bailout も無し。
- `zend_mm_panic`・`zend_out_of_memory` の `exit(1)`→`_exit(1)`（atexit/stdio flush が無効状態に触れないように）。
- 同じ大域リセット（executor values、request shutdown の http_globals/modules_activated/clear_last_error、SAPI の auth_user 等の NULL 化）、`array_init_singleton`。
- rfc1867 のヘッダ処理: Content-Disposition/Content-Type だけ残して重複を無視（ヘッダ由来のメモリ膨張を抑える）。
- セッション: `if (!PS(rfc1867_enabled) || true)` ＝ **upload-progress コールバックを丸ごと無効化**（安全に直せないので）。
- まとめ: EOL 枝は「優雅な回復」を捨てて即 exit にし、session upload progress を切る。

---

## 5. 悪用の実際・経緯

### 実際の悪用（既存ノートの「見つかっていない」は更新必須）
- **AWS Amazon Threat Intelligence（MadPot ハニーポット）**: 最古の試行が**公開 4 日前の 2026-10-17**、商用匿名化網の IP から。公開日 10-21 は 02:00 UTC 頃から複数の PoC、02:00〜08:00 UTC に複数の攻撃者。「今は広く悪用されている」。調査は少なくとも 10/17 から始めよ、と。IOC に IP `103.216.220.92`（10/17）ほか。
- **Cloudflare**: 公開の約 9 時間前から WAF を配備、10-21 03:02 UTC から無料・有料とも既定で保護。攻撃トラフィックと、規則を避けようとするペイロードの変異を観測。新機能 **full transaction detection**（要求＋応答を同一トランザクションで見る）を初投入。→ 既存ノートの「WAF/リバースプロキシで止める」を補強できる。これは **20章（TLS をほどく境界）・22章場面3（GFE が暗号をほどいて奥へ）** の話で、あくまで応急。
- watchTowr（Attacker Eye）: 10-21 から実地の悪用を観測。
- Chainguard が 07:41 UTC（6 時間早く）禁輸を破って修正入りイメージを公開 → 攻撃者がバイナリ差分で修正を研究できた。
- CISA KEV には**未掲載**（2026-10-22 時点）。

### 発見と経緯
- 発見・責任開示: **Calif**（Ryan Austin @lcfr_hax、Michal Zalewski @lcamtuf）、**OpenAI Codex Security**（Amy Burnett）、**Wiz Research**（Sagi Tzadik ほか）。
- 遠い発端: Stefan Esser の 2004 年の memory-limit RCE 研究 → bug #78876（2020、jr@coredu）→ 2024 の OSTIF/Quarkslab 監査（Sovereign Tech Agency 出資）で同じ OOM を再発見するも悪用を実証できず未修正。
- 2026 のタイムライン: 07-30 Calif が監査開始（OpenAI の Patch the Planet）→ 08-01 発見 → 08-11 Calif と OpenAI が独立に同じ根本原因を報告 → 08-14 PoC → 08-24 Wiz が追加経路、09-18 OpenAI が追加 → 10-20 ~15:00 UTC リーク（番号だけ、点数は誤って 10.0、技術詳細は漏れず）→ 10-21 14:00 UTC 公開。
- 修正担当: arnaud-lb, iluuu1994, bukka, ndossche ＋ Nicolas Grekas。
- AI の寄与が話題: Wiz は Gemini 4 Argon・GPT-5.6 Sol・Wiz Atlas、Calif は LLM エージェント＋「publish/destroy → fallible work → commit/restore」という型を一般化する SKILL.md。PHP チームは OpenAI Daybreak Red・Anthropic Claude Mythos を検証に使用。NYT も報道。
  - → ニュースのノートの味付けに使える。「AI で古い脆弱性の実用的な悪用が現実的になった転換点」という各社の主張（Wiz は Heartbleed/Log4Shell に並べる）。ただし Calif は「モデルが勝手に全部見つけたのではない。標的の脆弱性史を知っていて正しく問うたから」と釘を刺している。両論併記で。

---

## 6. 緩和策（どれも完全でない。パッチだけが唯一の修正）

- **109618**: `memory_limit=-1` を管理者権限で（`php_admin_value`/Apache/FPM pool。`ini_set`/`.user.ini` では遅い）。`post_max_size` を小さく（アップロード無しなら 8M、要るなら 32M）。フロントで復号後サイズ・フィールド数・multipart 部品数・ヘッダ数・入れ子深さを制限（使える Content-Length の無い要求もカバー）。コンテナ／cgroup の `memory.max`（影響ワーカーだけ殺す）。**`RLIMIT_AS`/`RLIMIT_DATA` は使うな**（`mmap` 失敗を起こして脆弱な `longjmp` 経路に入れてしまう）。
- **109619**: `session.upload_progress.enabled=0`（管理者権限、要求解析より前、ワーカー再起動）。8.5 は `fatal_error_backtraces=0`。初期化前に診断を出す per-request INI を消す。攻撃者が届く致命的エラー・タイムアウトを直す。FPM は `pm.max_requests=1`（性能代償）。
- → 既存ノートの「層ごとの守り」の表はこの線で既に書けている。公式の一覧が出たので、暫定策の効き方（「1 件にしか効かない」等）を公式の表現で較正できる。

---

## 7. 既存ノート（`news/2026-10-20-php-security-release.md`）の更新すべき点

1. **題と枠組み**: 「予告」から「公開後」へ。要点に「2026-10-21 に 8.2.35/8.3.36/8.4.27/8.5.12 が出た」。
2. **確かさの表**: CVE 番号＝確定、種類＝確定（109618 OOM corruption / 109619 stale global state）、影響する版＝5.4.0 以降で確定、CVSS ベクトル＝確定（`AV:N/AC:H/AT:P/…`）、悪用＝「実地で起きている（10-17 から）」。既存の「未確認」「研究者の報告」の行を公式・確定に格上げ。
3. **仕組みの節を新設**（本メモ §3）: 109618 のカウント先・確保後＋`zend_array_destroy` の消費、109619 の session upload progress／fatal backtrace の UAF。既存ノートの `session.upload_progress` の記述は的中していたと確認できた（ただし 109619 側。109618 は OOM 経路）。
4. **直し方の節を新設**（本メモ §4）: bailout → 遅延 OOM（UnwindExit）＋ハード上限 `_exit`、大域リセット、fallible allocation、EOL は即 `_exit`＋upload progress 無効化、の対比。
5. **CVSS 9.2 の節**: 既存ノートの「9.2 は AC:H か AT:P が付く 3 通り」という分析は、実ベクトルが **AC:H かつ AT:P の両方** だったことと突き合わせる。ASLR 回避（AC:H）＋競合に勝つ／条件が要る（AT:P）＝攻撃者はメモリ漏れ（PHPSESSID 漏れ）で番地を得てから、という各社の説明と整合。GHSA がこのベクトルを 9.2 と明記しているので点数は確定。**「3 通り」の数え方に両方同時のケースが入るか**だけ、次セッションで `cvss` ライブラリで再計算して文言を直すこと（点数は 9.2 で確定、言い回しの整合だけの問題）。
6. **層の対応表**: 既存の表はよくできている。確定を反映:
   - **PHP 本体**（教材に無い層、22章場面3 の「奥のサービス」）＝ Zend のメモリ管理＋エラー処理＋リクエストの生死。「ほぼ全ての要求が触る中枢」。
   - **メモリと CPU（6章・9章場面4）**: ヒープグルーミングで残骸を生きた zval／デストラクタ先に見せ、PC を `system()` へ → 強い結びつき。
   - **OS（9章場面1/2/3）**: www-data 権限、mod_php と FPM のプロセスモデルの差（起動失敗時に後片付けするか exit するか）、cgroup/seccomp/SELinux は OS 層の封じ込め（Chrome のサンドボックスと同じ枠組み＝既存ノートの筋）。
   - **HTTP（21章）**: multipart、Content-Length と実本文のズレ、chunked/HTTP2 長さ無し、Content-Encoding 展開。`post_max_size` バイパスは HTTP 層の細部。
   - **TLS/CDN（20章・22章場面3）**: Cloudflare の full transaction detection（要求＋応答）。暗号をほどいて見る境界。応急であってパッチの代わりにならない。
7. **出典**: php.net 告知、GHSA 2 本、修正コミット（8.5 `31c0ea7d`・EOL `1d7dec178a09`）、CVE API、Calif、Wiz、Datadog、PHP Foundation、AWS、Cloudflare、Ubuntu/Debian tracker。
8. **リンクしている章**: 既存は 6・9・11・14・20・21・22。今回の確定を踏まえると **6・9・20・21・22** が主。11（経路）・14（外から始まる通信を止める）は緩和の文脈で残してよい。`node tools/build-news.mjs` が帯の印を付け直す。

---

## 8. 未確認・次セッションの要確認

- **CVSS「3 通り」の文言**（§7-5）。`python3` はあるが `cvss` が入っているか未確認。`pip install cvss` or 既存ノートで使った手法で `AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` を再計算し、既存ノートの「9.3 に AC:H か AT:P を足す 3 通りで 9.2」に両方同時が含まれるか確認して文言を直す。
- **Wiz の CVE 対応のズレ**（§3 末尾）。GHSA の枠で書く。
- **この PC での検証**: `php` は未インストール（`which php`→無し）。ビルドには `bison`・`re2c`・`autoconf` が足りない（`gcc 15.2`・`make`・`pkg-config` はある）。既存ノート（Node/eMudhra）は「この PC で確かめた」節を持つが、PHP は**ソースからビルドしないと手元で動かせない**。やるなら `apt install` が要る（ユーザー判断）。無理にビルド／再現しなくても、一次情報（コミット差分・GHSA）で解説は十分書ける。**ノートは脆弱性の仕組みと修正の解説が目的で、動く攻撃の再現が目的ではない**ので、再現は必須ではない。
- 既存ノートの脚注系（121→120 個の話など）は今回の PHP とは無関係。触らない。

## 9. 進め方メモ
- 変更するのは `news/2026-10-20-php-security-release.md` だけ。`.html`・`index.html`・`README.md` の表は `node tools/build-news.mjs` が生成。
- 追記後: `node tools/build-news.mjs` → `node tools/verify.mjs news/index.html news/2026-10-20-php-security-release.html`（はみ出し・横スクロール・リンク切れ・JS エラー・未定義クラスを確認）。1 画面版は場面ごとに 1 画面に収める（one-screen-artifact 方針）。表紙の要点が溢れやすいので短く。
- タブ名は `## 見出し <!-- tab: 短い名前 -->`。場面が増えるので、既存の「確かさ／層／PHP 本体／守り／CVSS・前例／影響と今後／出典」を、公開後の確定で組み替える（「仕組み」「直し方」を足し、「予告」色を抜く）。
- コミットメッセージの作法: 末尾に `Co-Authored-By: Claude <noreply@anthropic.com>` と `Claude-Session: …`（システムの指示どおり）。

---

## 10. セッション 2（2026-10-22 夜）での追加確認

このセッションでやったこと: スクラッチパッドの取得物は消えていたので §1 の URL・SHA から一次情報を取り直し、§2〜§7 と突き合わせた（**すべて一致**。下は差分と新規分だけ）。加えて (a) CVSS の「3 通り」を `cvss` ライブラリで再計算して決着、(b) **この PC の Docker で修正前後の版を動かし、二段の上限を挙動として確認**（§8 の「ビルドしないと手元で動かせない」は Docker で解決）、(c) 配布元の正確な版と USN/DLA/DSA 番号、(d) KEV 不掲載を確認。**動く攻撃の再現はしていない**（ノートの目的どおり仕組みと修正の確認のみ）。

### 10.1 一次情報の再確認（§2〜§4 は正しかった）
- GHSA 2 本: published 2026-10-21T13:34Z。CVSS v4.0 `CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` = 9.2。CWE-416/755/824/1325/1419。credits: reporter = lcfr-hax(Calif)・sagitzadik-wiz(Wiz)・tomash-areion・amyb-oai(OpenAI)、remediation = arnaud-lb・iluuu1994・bukka・ndossche。
- CVE API: 2 件とも **PUBLISHED**（§1 の「RESERVED」は解消。既存ノートの「RESERVED」行は要更新）。affected = 8.2.*<8.2.35 / 8.3.*<8.3.36 / 8.4.*<8.4.27 / 8.5.*<8.5.12、defaultStatus unaffected。CISA ADP(SSVC): Exploitation=none, Automatable=no, Technical Impact=total。109619 の CVE 記録は Wiz ブログを参照に挙げる。
- php.net #2026-10-21-5 全文取得。SAPI（mod_php 最危険・FPM はアプリ経路・FrankenPHP/LSAPI）と暫定策は §6 のとおり。
- 修正コミット: 8.5 `31c0ea7d7ff1`（Arnaud Le Blanc 著 / Ilija Tovilo commit, 2026-10-18、+11554 −1012、423 ファイル、新規 .phpt 275 本）、NEWS `3d37ab3b8ee6`。8.4 `506e87fa7dcd` / 8.3 `3c832b523ee1` / 8.2 `01a40e89fbfc` 同題。EOL 最小: 7.4 `712e60f9edfd`（17 ファイル +240 −59）/ 8.0 `82f8f31b16a0` / 8.1 `1d7dec178a09`（23 ファイル +311 −73）。修正前は統合コミット `dd830558`。
- **差分を実際に読んで §4 の仕組みを裏取り**（新規に確認した要点）:
  - `Zend/zend_alloc.h`: `zend_oom_state`（NONE/PENDING/HANDLING/HANDLED）と `zend_oom_info`、`ZEND_HAS_OOM()`、fallible API（`femalloc/fecalloc/ferealloc/safe_femalloc`…）、`ZEND_MM_MAX_ALLOCS_EXIT_STATUS 121`。
  - `Zend/zend_globals.h`: `EG(delayed_oom)` を executor globals に追加。
  - `Zend/zend_alloc.c`: `zend_mm_check_limit()` が soft 超過で `zend_mm_delayed_error()`（文面を永続メモリに溜め state=PENDING、`EG(vm_interrupt)=true`、fallible なら NULL を返す）、hard 超過で `zend_mm_hard_limit_error()` → **`_exit(137)`**。`zend_handle_delayed_oom()` は VM 安全点で、ユーザーフレームがあれば `zend_throw_unwind_exit()`、無ければ `zend_bailout()`。新 INI `memory_hard_limit_percent`（既定 -1 = 上限 ≥1G なら +1GiB、未満なら 200%）。
  - `Zend/zend_execute_API.c`: `zend_shutdown_executor_values()` が user_error_handler・user_exception_handler・last_fatal_error_backtrace・record_errors・num_errors・errors・error_handling・exception・objects_store を初期化。
  - `main/main.c`: `php_request_startup` が `sapi_activate` の前に `php_basic_early_rinit()`。`php_request_shutdown` が delayed_oom を NONE、http_globals を ZVAL_UNDEF、`clear_last_error()`、`PG(modules_activated)=0`。
  - `ext/standard/basic_functions.c`: `php_basic_early_rinit()` が BG(serialize_lock)/serialize/unserialize と URL スキャナをリセット。
  - `ext/session/session.c`: `PS(in_rfc1867_update)` 新設、upload-progress 中は「不完全クラスのみ」で (アン)シリアライズ（autoload・__wakeup なし）。`php_session_rfc1867_callback` は `PG(modules_activated)` なら即 return、START で早期に `php_rinit_session_globals()`、END で `_SESSION` 大域を削除。
  - `ext/opcache/zend_persist.c`: CE キャッシュのスロットを persist 窓の間だけ溜め、`ZCSG(map_ptr_last)` 公開後に commit（`zend_accel_pending_ce_cache_begin/commit/discard`）。
  - `main/rfc1867.c`・`main/php_variables.c`: 全面 fallible 化、`array_init_singleton`、`ZEND_HAS_OOM()` 監視。`fill_buffer` が **実際に読んだバイト**を `post_max_size` と比べ、超えたら「Actual POST length does not match Content-Length」で警告。
  - EOL（8.1 `1d7dec178a09`）: soft-OOM/fallible は入れず、新 `zend_mm_safe_error_ex()` が stderr に `Fatal error: … in … on line …` を出して **`_exit(1)`**。`zend_mm_panic`/`zend_out_of_memory` の `exit(1)`→`_exit(1)`。同じ大域リセット＋`array_init_singleton`。rfc1867 は Content-Disposition/Content-Type だけ残す。セッションは `if (!PS(rfc1867_enabled) || true)` で upload-progress を丸ごと無効化。**8.5 と違い post_max_size の実測チェックは無い。**
  - **「カウント先・確保後」の順序は 8.5.12 でも不変**を一次確認（`php-8.5.12` と `dd830558` の `Zend/zend_hash.c` を取得。`_zend_hash_str_add_or_update_i` は両方とも `nNumUsed++; nNumOfElements++; p=arData+idx; p->key=zend_string_init(...)`）。修正は周りのエラー処理だけ。Datadog も「8.5.12 でも順序はそのまま。同じ型のバグが他にも出ると予想」と明記。

### 10.2 CVSS の「3 通り」は決着（§8 の宿題）
`cvss` 3.6（venv に `pip install cvss`）で基本ベクトルを再計算:
- `AC:L/AT:N` = **9.3**（基準）
- `AC:L/AT:P` = 9.2
- `AC:H/AT:N` = 9.2
- `AC:H/AT:P` = 9.2 ← **実ベクトル**

→ 9.2 になるのは「AC:H と AT:P の少なくとも一方が既定でない」3 通り（4 通り中 L/N を除く）。既存ノートの「AC:H か AT:P が付く 3 通り」は（包含的 or なので）**正しい**。実際のベクトルはその両方が付いた場合（AC:H かつ AT:P）。ノートは「3 通りのうち、実際は両方が付いた」と書けば整う。各社の説明（ASLR 回避=AC:H、競合に勝つ/前提が要る=AT:P、メモリ漏れ[PHPSESSID]で番地を得てから）とも整合。

### 10.3 この PC（Docker）で確かめたこと ← 新規。ノートの「この PC」場面に使える
`php` は未インストールだが **docker 29.9.0 が使える**。公式イメージ `php:8.5.11-cli`（修正前）と `php:8.5.12-cli`（修正後）を取得。`--network none --memory 1g` で隔離実行。digest は 8.5.11 = `sha256:8e5d746f8765…`、8.5.12 = `sha256:595a7cbb1e05…`。確認したのは「上限に当たったときの PHP の止まり方」が修正で変わったこと:

| 試したこと | 8.5.11（修正前） | 8.5.12（修正後） |
|---|---|---|
| 既定 INI | memory_limit=128M, post_max_size=8M, max_file_uploads=20, session.upload_progress.enabled=1, fatal_error_backtraces=1。`memory_hard_limit_percent` は 8.5.11 に無く（false）、8.5.12 で新設（既定 ''） | 同左＋新 INI |
| `memory_limit=32M` で配列を足し続ける | peak 26 MiB で `Allowed memory size exhausted` の致命的エラー（上限より前で止まる） | peak **34 MiB** まで伸びてから同じ致命的エラー（soft 上限を遅延させ、進行中の確保を終わらせる＝遅延 OOM） |
| 同上＋`memory_hard_limit_percent=100`（hard=soft） | （この INI 自体が無い） | `Hard memory limit of 33554432 bytes exhausted`、**exit 137**、shutdown 関数もスタックトレースも無し（hard の `_exit(137)` 経路） |
| 同上＋`memory_hard_limit_percent=150` | — | 通常の致命的エラー（exit 255）に戻る |

→ §4「柱 1: bailout をやめ遅延 OOM＋ハード上限 `_exit`」を挙動として確認。CLI には常にユーザーフレームがあるので soft 超過は UnwindExit 経由の普通の致命的エラーになり、exit 255・shutdown 関数も走る（§4 のとおり）。差が見えるのは (i) 上限を少し越えられるようになった点、(ii) hard 上限での exit 137。str_repeat / array_fill は修正で fallible 確保に変わった（差分で確認: `zend_string_safe_falloc`・`array_finit_size_packed`）。スクリプトはスクラッチパッドの `exp/`（grow.php・oom.php・big.php）。消えているので要るなら作り直す。

### 10.4 配布元と KEV（§5 の裏取り・正確な文字列）
- **CISA KEV 不掲載**（catalog 2026.10.21、1754 件。2026-10-22 12:36 UTC 時点で 109618/109619 は無し。既載の PHP 本体は 2012-1823・2019-11043・2024-4577）。
- **Ubuntu**（priority Critical、USN-8948-1 / USN-8948-2、2026-10-21）: 8.5 stonking(26.10) `8.5.9-0ubuntu2.1`・resolute(26.04) `8.5.4-0ubuntu1.5`、8.3 noble(24.04) `8.3.6-0ubuntu0.24.04.13`、8.1 jammy(22.04) `8.1.2-1ubuntu2.28`、7.4 focal(20.04) `7.4.3-4ubuntu2.29+esm5`、7.2 bionic / 7.0 xenial / 5.5 trusty は Ubuntu Pro(ESM)。**5.5 まで直している**。
- **Debian**: bookworm php8.2 `8.2.35-1~deb12u1`（DLA-4848-1）、trixie php8.4 `8.4.27-1~deb13u1`（DSA-6574-1）、sid 8.4.27-1。
- Node のノートのときと違い、**公開初日に主要ディストリが配っている**（事前に patch を受領）。rpms.remirepo.net は当日更新なし（php.net が名指しで注意）。

### 10.5 「修正が不完全では」という騒ぎ（oss-security）
- oss-security 2026-10-21/22 で Fediverse(@elise) が「8.5.12 の修正は不完全かも／別の脆弱性では」と投稿。Canonical が PHP に問い合わせ、**「無関係で、実在の問題ではない(unrelated and not a real issue)」** との回答を得たと報告（#security:ubuntu.com Matrix 経由）。ノートに書くなら「公開直後にそういう指摘が出たが PHP は無関係と否定」程度の脚注で十分。深追い不要。
- Greenbone が「表題の "8.2–8.5" は旧版が非影響と誤読されうる。7.4 へのバックポートがある以上 7.4 以降も影響」と指摘。→ 既存ノートの「5.4.0 以降」と整合。

### 10.6 Wiz の CVE 対応のズレ（§3 末尾の確定）
Wiz の表: 109618 = upload-progress unserializer UAF ＋ プロセスメモリ遠隔読み出し、109619 = fatal-error backtrace UAF ＋ OPcache 型混同。**php.net / GHSA / CVE / Datadog の枠（109618 = OOM で畳む途中の破壊、109619 = またぐ大域状態）とは割り当てが違う**。権威は php.net / GHSA。CVE-109619 の記録が Wiz ブログを参照に挙げているので、Wiz の表記に引きずられないよう注意。ノートは GHSA の枠で書き、Wiz のズレは脚注。

### 10.7 次のセッションへ（残りはノートを書くだけ）
調査は完了。一次情報・差分・CVSS 再計算・この PC の Docker 確認まで揃った。次は §7 の方針で `news/2026-10-20-php-security-release.md` を書き直す:
- 題と枠組みを「予告」→「公開後」に。確かさの表を確定へ格上げ（CVE 番号・種類・5.4.0 以降・CVSS ベクトル・悪用=実地）。
- 「仕組み」場面（§3）と「直し方」場面（§4: 8.5 の遅延 OOM＋ハード上限 vs EOL の即 `_exit`）を新設。
- 「この PC」場面に §10.3 の表（Node のノートと同じ体裁）。**動く攻撃は載せない。**
- CVSS は §10.2 の言い回しに。層の対応表（§7-6）は 6・9・20・21・22 を主に。
- 書いたら `node tools/build-news.mjs` → `node tools/verify.mjs news/index.html news/2026-10-20-php-security-release.html`。1 画面に収める。
- スクラッチパッドの取得物（$S/dl 以下、$S/exp）はこのセッション限りで消える。取り直しは §1 の URL・SHA から。Docker イメージ php:8.5.11-cli / 8.5.12-cli は残っているかもしれないが、無ければ `docker pull` で取り直す。

---

## 11. セッション 3（2026-10-22 夜、コンテキスト引き継ぎ用）

このセッションでやったこと: §1 の URL・SHA から一次情報を取り直して §2〜§4 と突き合わせ（**すべて一致**）、加えて **(a) GHSA 勧告 2 本の全文をはじめて読んだ**（セッション 1・2 は要約だけだった。告知が「技術的な詳細は勧告にある」と書いている中身）、**(b) 8.5 と EOL 8.1 のパッチ差分を関数単位で読み直して §4 を一次確認**、**(c) 主要な二次情報（Calif・PHP Foundation・Datadog・Wiz・Cloudflare・AWS・oss-security）を正確な引用つきで取得**。**動く攻撃の再現はしていない**（ノートの目的は仕組みと修正の解説）。スクラッチパッドの取得物（`$S/dl`）はこのセッション限りで消える。取り直しは §1 と下の 11.5 の URL から。Docker イメージ `php:8.5.11-cli`（`8e5d746f8765`）・`php:8.5.12-cli`（`595a7cbb1e05`）はこの時点で手元に残っている。

**結論: 調査はさらに裏が取れて完結している。残りは §7・§10.7・11.8 の方針で `news/2026-10-20-php-security-release.md` を書き直すだけ。** 新しいセッションは本ログ §1〜§11 を読めば、取り直しなしで書ける。

### 11.1 一次情報の再確認（環境と確定値）

- 時点: 2026-10-22 12:52 UTC（21:52 JST）。`gh`（okayus で認証済み）・`jq`・`python3`・`docker 29.9.0` あり。
- **GHSA 2 本**（`gh api repos/php/php-src/security-advisories/<GHSA>`）:
  - `GHSA-w8hw-w9fx-j79w` = CVE-2026-109618「RCE via OOM corruption」、published `2026-10-21T13:34:25Z`。
  - `GHSA-6wmf-4rv5-p3rp` = CVE-2026-109619「RCE via stale global state」、published `2026-10-21T13:34:13Z`。
  - どちらも severity critical、CVSS v4.0 **9.2**、ベクトル `CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N`、CWE-416/755/824/1325/1419。affected `<8.2.35 / <8.3.36 / <8.4.27 / <8.5.12`、patched はそれぞれの版。
  - credits: reporter = `lcfr-hax`(Calif)・`sagitzadik-wiz`(Wiz)・`tomash-areion`・`amyb-oai`(OpenAI)、remediation = `arnaud-lb`・`iluuu1994`・`bukka`・`ndossche`。
- **CVE 記録**（`cveawg.mitre.org/api/cve/…`）: 2 件とも **PUBLISHED**（セッション 1 の「RESERVED」は解消。既存ノートの「RESERVED」行は要更新）。109618 は published `13:48:34Z`/updated `16:07:52Z`、109619 は published `13:54:43Z`/updated `2026-10-22T08:09:24Z`。CISA ADP(SSVC): Exploitation=`none`, Automatable=`no`, Technical Impact=`total`（両件）。
- **CISA KEV**: catalogVersion `2026.10.21`、dateReleased `2026-10-21T14:04:39Z`、count 1754。**109618/109619 は未掲載**（2026-10-22 時点）。既載の PHP 本体は CVE-2024-4577・2019-11043・2012-1823 のみ。
- **修正コミット**（`gh api repos/php/php-src/commits/<sha>`、全枝とも題「Avoid state corruption via bailout」、著 Arnaud Le Blanc／commit Ilija Tovilo、2026-10-18）:
  - 8.5 `31c0ea7d7ff1`（15:46Z）／8.4 `506e87fa7dcd`（15:43Z）／8.3 `3c832b523ee1`（15:36Z）／8.2 `01a40e89fbfc`（15:26Z）
  - EOL 最小: 7.4 `712e60f9edfd`（18:09Z、17 ファイル +240 −59）／8.0 `82f8f31b16a0`（18:11Z、17 ファイル +229 −59）／8.1 `1d7dec178a09`（18:12Z、23 ファイル +311 −73）
  - **規模の訂正**: `gh api` の `files` は 300 件で打ち切るので「300 ファイル」は見かけ。`.diff` を実測すると 8.5 は **423 ファイル・.phpt 295 本（うち新規 275 本）・+11554 −1012**（§10.1 の「+11556 −1017／275 新規」は微差。`.diff` 実測はこちら）。修正前の統合コミットは `dd830558`。

### 11.2 GHSA 本文の確定（ノートの「仕組み」場面の権威。今回はじめて全文を読んだ）

勧告本文は php.net 告知が指す技術的詳細の出どころ。セッション 1・2 の §3 はこれの要約で、**全文と食い違いはない**。要点を勧告の言い回しで:

**CVE-2026-109618（OOM corruption）**
- 核: PHP は OOM を `longjmp()` で大域脱出する。ある場面では**リクエスト用メモリが完全に初期化される前に「到達可能（有効）」として見える**。その時点でどれか確保が失敗すると（失敗した確保は壊れたメモリと無関係でよい）、早期脱出の帳尻が合わず無効な状態が残り、**request shutdown がそれを読む／分岐する**。「複数の OOM 戦略が一貫してこの状態を起こせる」。
- OOM 戦略（既定設定の範囲で OOM に届く作り、勧告が列挙）: ① 使える宣言 Content-Length の無い multipart は最初の `post_max_size` 検査を抜けて本文を供給し続けられる。② multipart の 1 部品はヘッダ数に制限が無く、PHP 内の表現が wire より大幅に多くメモリを使うので `post_max_size` 内で `memory_limit` を使い切れる。③ 空のファイル欄は `max_file_uploads` に数えられないのに通常のファイルメタデータ配列を作り、名前の入れ子がその生成を増やす。アプリ固有の大きな確保でも届く。
- SAPI 別の感受性（勧告の言い切り）: **Apache mod_php は起動が失敗しても request shutdown を無条件に走らせる**→ アプリのコードが 1 行も動く前に無効状態を処理する。**FPM は起動失敗で子を exit** するので消費を防ぐ（ソース分析上は FPM も susceptible だが、この SAPI で完全な FPM の実証は無い）。FrankenPHP は mod_php と同様に無条件 shutdown で likely susceptible、LSAPI は FPM 型で app 固有なら likely だが未検証。
- 緩和（勧告）: **パッチは OOM の `longjmp()` を除き、次の VM 安全点での「遅延・優雅な soft OOM」と、第二の高いしきい値に達したときの `_exit()` による即時 hard OOM に置き換える**。「shutdown はもう無効状態を見ない。PHP の通常のメモリ制限能力は保たれる」。設定での緩和（`memory_limit=-1` 管理者権限、`post_max_size` 控えめ、フロントでの復号後サイズ等の制限、cgroup `memory.max`）は**どれも完全でなく、`RLIMIT_AS`/`RLIMIT_DATA` は使うな**（`mmap` 失敗で脆弱な `longjmp` 経路に入る）。
- 影響: **確認された影響は web worker の権限での未認証 RCE**。既定の入力・メモリ制限、複数ワーカーの通常の prefork 構成の mod_php に対し HTTP 越しに完全な RCE を実証。ワーカー増・無関係トラフィックは試行回数を増やすが条件は消えない。移植性・信頼性はビルド・拡張・フロント・アロケータ配置に依る。

**CVE-2026-109619（stale global state）**
- 核: ワーカーが保持する大域状態（エラー・セッション・オブジェクト・拡張）が 1 リクエストの所有メモリを指す。そのメモリ解放前に必ずリセットすべきなのに、致命的エラー（OOM 含む）が対応リセットの前に処理を捨てる／shutdown で消したエラー状態を非致命の診断が後から書き戻す → リクエストヒープが解放されたのにワーカーの大域がまだそこを指す use-after-free。
- **producer と consumer の両方が同じワーカーに要る**（5 条件）。producer = リクエスト所有の状態を後から読める場所に残す操作、consumer = 次リクエストの通常初期化**より前**にその古い値を読む／解放する／分岐する操作。
- 通常初期化より前に走る **consumer（確定 2 つ）**:
  1. **初期化前の INI 診断**: 無効／非推奨の INI 適用時の warning/notice/deprecation（表示・ログの要否を決める前に大域に触れる。`error_reporting`・`@`・`display_errors`・`log_errors` では防げない）。mod_php は `.htaccess`・`php_value`/`php_flag`/`php_admin_*` が `php_request_startup()` より前。FPM は nginx/`mod_proxy_fcgi` が送る `PHP_VALUE`/`PHP_ADMIN_VALUE` が診断を出すときに条件つき（FPM pool 値や `.user.ini` は通常初期化後なので同じ early consumer にならない）。
  2. **初期化前の session upload progress**: 通常のセッション初期化より前にセッション／デコーダ状態に届く。INI 診断経路と独立。
- **具体ケース**: ① **PHP 8.5 の `fatal_error_backtraces`（既定 on）** = 致命的エラー報告がリクエスト所有のバックトレース状態を残し、shutdown でのリセットが**常に漏れる**。「最も強い実証で、確認された mod_php の悪用の土台」。② **session upload progress の生死** = アップロードが通常のモジュール初期化前にセッション／デコーダ状態を公開し、OOM/致命でリセットが飛ぶ。「app 非依存の実証トリガは入力処理中の OOM」。**mod_php と FPM の両方で確認**（FPM は起動成功後に app の操作で状態を公開→致命→次リクエストの upload progress が early consumer）。session upload progress は既定有効で `session_start()` 不要。③ その他のエラー・例外・オブジェクト・拡張の状態 = 条件つき。完全なパッチはこの広い状態もリセットする。
- 緩和（勧告）: **完全な緩和は状態リセットのパッチに上げることだけ。一般的な設定での完全緩和は無い**（app・拡張・サーバ経路が予測可能なログ無しに古い状態を公開／消費しうる）。8.5 は `fatal_error_backtraces=0`、session 経路は `session.upload_progress.enabled=0`（どちらも管理者権限・全ワーカー再起動）。到達しうる致命的エラー・実行タイムアウトを潰す、初期化前に診断を出す per-request INI を消す、`pm.max_requests=1`（性能代償）。監査は `log_errors=On`／`error_reporting=E_ALL` で、対象スクリプトより前に繰り返す warning・片付け中の診断・致命/parse/uncaught・`Maximum execution time exceeded` を探す（ログに無くても安全の証明にならない）。

### 11.3 パッチ差分の一次確認（8.5 `31c0ea7d` と EOL 8.1 `1d7dec178a09` を関数単位で読んだ）

§4・§10.1 の記述を今回いちばん細かく裏取りした。新しく確かめた具体（`ファイル: 関数 → 挙動`）:

- `Zend/zend_alloc.c`: soft 超過で `zend_mm_delayed_verror()` が文面を**永続メモリ**に溜め `EG(delayed_oom).state = ZEND_OOM_STATE_PENDING`、`zend_atomic_bool_store_ex(&EG(vm_interrupt), true)`。hard 超過は `"Hard memory limit of %zu bytes exhausted (tried to allocate %zu bytes) in %s on line %d"` を出して **`_exit(137)`**（戻らない）。`zend_mm_check_limit()` は fallible なら soft 超過で `FAILURE` を返す。
- `Zend/zend_alloc.c: zend_handle_delayed_oom()`: state≠PENDING なら即 return。PENDING→HANDLING にし、**ユーザーフレームがあれば `zend_throw_unwind_exit()`、無ければ**エラー報告の後に **`zend_bailout()`**。→ CLI など常にユーザーフレームのある場面は soft 超過が UnwindExit 経由の普通の致命的エラー（exit 255・shutdown 関数も走る）になる。
- `Zend/zend_alloc.c: zend_mm_update_hard_limit()`: `memory_hard_limit_percent == -1`（既定）なら、上限 >1 GiB は **固定 +1 GiB**、1 GiB 以下は **200%**。新 INI `memory_hard_limit_percent` は `main/main.c` で `PHP_INI_ENTRY("memory_hard_limit_percent", NULL, PHP_INI_ALL, OnChangeMemoryHardLimitPercent)`＝**既定値 NULL（=-1 挙動）**、100 以上か -1 でなければ warning。
- `main/main.c: php_request_startup()`: `zend_activate()` の直後・`sapi_activate()` の**前**に新 `php_basic_early_rinit()` を呼ぶ。`php_request_shutdown()` は delayed_oom を NONE、http_globals を ZVAL_UNDEF、`clear_last_error()`、`PG(modules_activated)=0`。
- `ext/standard/basic_functions.c: php_basic_early_rinit()`: `BG(serialize_lock)=0`、`BG(serialize)`/`BG(unserialize)` をゼロ埋め、`php_url_scanner_early_rinit()`。コメント「session upload progress が `php_hash_environment()` から RINIT 前に (アン)シリアライズし URL 書き換えに session id を登録するため」。
- `main/SAPI.c`: `if (ZEND_HAS_OOM()) { zend_handle_delayed_oom(); }` を追加（安全点での回収）。
- `main/rfc1867.c`: `fill_buffer()` が **実際に読んだバイト** `SG(read_post_bytes)` を `post_max_size` と比べ、超えたら読むのをやめる（`return 0`）。`fileupload_done` で `"Actual POST length does not match Content-Length, and exceeds %ld bytes"` を warning。`register_http_post_files_variable*` は `bool`（fallible）に変更。`php_mime_should_save_hdr()` が **Content-Disposition / Content-Type だけ残す**（ヘッダ由来の膨張を抑える）。
- `ext/session/session.c`: 新 `PS(in_rfc1867_update)`。upload-progress 中は `php_session_unserialize_init()`/`serialize_init()` が「**不完全クラスのみ**」モード（autoload・`__wakeup` なし）。`php_session_rfc1867_callback()` は **`PG(modules_activated)` なら即 return**（`request_parse_body()` がセッションを壊すため）。コメント「RINIT 前なのでユーザーコードを走らせない」。
- **EOL 8.1 `1d7dec178a09`（別方針）**: soft-OOM/fallible は入れない。新 `zend_mm_safe_error_ex()`（`ZEND_NORETURN`）が stderr に `"\nFatal error: %s in %s on line %d\n"` を出して **`_exit(1)`**。`zend_mm_panic`/`zend_out_of_memory` の `exit(1)`→`_exit(1)`、旧 `zend_bailout(); exit(1)` を除去。同じ大域リセット＋`array_init_singleton`。rfc1867 はヘッダを Content-Disposition/Content-Type だけに。session は **`if (!PS(rfc1867_enabled) || true)`** で upload-progress コールバックを丸ごと無効化。**8.5 と違い `post_max_size` の実測チェックは無い**。23 ファイル・新規 .phpt 0（触れた .phpt 3 本は `ext/zend_test` の調整）。

### 11.4 ハッシュ挿入順序は 8.5.12 でも不変（§3・§10.1 の再々確認）

`Zend/zend_hash.c` を `php-8.5.12` と `dd830558`（修正前）で取得。`_zend_hash_str_add_or_update_i()` はどちらも `idx = ht->nNumUsed++; ht->nNumOfElements++; p = ht->arData + idx; p->key = key = zend_string_init(...)`（8.5.12 の L1122–1140、dd830558 の L961–979）＝**「件数を先に増やしてから鍵を確保」の順序は同一**。修正は周りのエラー処理のみ（この差分の zend_hash.c は 259 行追加で fallible 初期化の整備が中心）。Datadog の明言「**The hash-table insertion still updates its counters before it allocates the key, even in PHP 8.5.12.**」「この型のバグは今後も出ると見る／全面リファクタは修正に間に合わないと判断されたのだろう」。

### 11.5 二次情報（正確な引用つき。取り直し用 URL も）

- **Calif**（発見者、`https://calif.io/php2shell/`）: 「The earliest affected path we found dates to **PHP 5.4.0**」。経緯 = 2004 Stefan Esser（最初の memory-limit RCE、非公開）→ 2020 bug #78876（jr@coredu）→ 2024 OSTIF/Quarkslab が同じ OOM を再発見も悪用を実証できず未修正 → 2026: Patch the Planet、7/30 開始、8/1 複数の RCE 経路を発見、8/5 ハッシュを tweet、8/11 第 1 報（同日 OpenAI も独立報告）、8/14 PoC、8/15 PHP 確認、8/21 第 2 報、10/21 公開。順序バグ「PHP increments both `nNumUsed` and `nNumOfElements` before fully initializing the new bucket」「teardown later consumes stale allocation bytes as a live bucket」。unserializer バグは destructor リストのオーバーフロー（負の `used_slots` で配列の手前に書く）→「We therefore control where PHP places a pointer and its associated type information」。OOM 戦略 1（`post_max_size` は宣言 Content-Length とだけ比較。chunked HTTP/1.1・長さ無し HTTP/2・入力展開フィルタでズレ）、戦略 2（`filename=""` は 6 つの `$_FILES` 要素 name/full_path/type/tmp_name/error/size を作り、`files[a][b][c]…` の入れ子で数百並べると本文は既定 **8 MiB** `post_max_size` 以下のまま既定 **128 MiB** ヒープを超える）。AI 釘刺し「No special harness, or access to models that weren't generally available... were used in the initial bug discovery」「No model is simply capable of unearthing 'all bugs' with simple prompts. At least for now.」。mod_php は起動失敗後も cleanup が走る／FPM は worker ごと捨てる。版の食い違い: mod_php RCE は「PHP >= 7.3」、session 経路は「PHP >= 5.4.0」（本文で整合はとっていない）。
- **PHP Foundation**（`https://thephp.foundation/blog/2026/10/21/…`、2026-10-21）: 公開を **10/22 14:00 UTC → 10/21 14:00 UTC** に前倒し（「Distributors were still packaging the fix, so releasing immediately would have left many users without an easy way to update」）。漏れ = 10/20 ~15:00 UTC に 2 つの CVE 番号が誤った公開時刻・**誤った CVSS 10.0**（実際 9.2）付きで出回る（「No technical details leaked」）。予告 19:30 UTC。~20:00 UTC に Calif が PoC 動画を誤公開（限定的な追加情報）。~23:00 UTC に重要インフラ向けの緩和助言が漏れた可能性。両件は「memory management and error handling」で、ほぼ全要求が触る中枢ゆえ「互換性・性能・拡張を壊さずに直すのが難しかった」。2024 Quarkslab（OSTIF 主催・Sovereign Tech Agency 出資）の監査中に契約コア開発者が OOM の兆候を発見。8/11 Ryan A（Calif）が無条件 RCE を同じ根本原因で報告（同日 OpenAI も）。8/24 Wiz 追加経路、9/18 OpenAI 追加。Trail of Bits も近時監査。**Chainguard が 10/21 07:41 UTC（公開 6 時間超前）に禁輸を破って修正入りイメージを公開**。「did not identify any functional exploits at the time of release」。AI = Anthropic **Claude Mythos**（Alpha-Omega と）、OpenAI **Daybreak Red**（報告・exploit の検証）、**OpenAI Codex Security**。「a person makes every call and works on every patch」。今後はプロセス変更（多数決・妥協推奨）と資金調達。
- **Datadog**（`https://securitylabs.datadoghq.com/articles/php2shell-critical-vulnerabilities-in-php/`、2026-10-21）: **109618 を独自再現**（PHP 8.5.11、commit `678778973bb4`、Debian 12 ARM64、Apache prefork mod_php、`memory_limit=16M`・`post_max_size=64M`）。cleanup は「visits every counted bucket and interprets its contents as PHP values」（`zend_array_destroy` の名は出さず）。ヒープグルーミングで **276 バイトの値を 320 バイトのサイズクラス**に置き、未完成バケットの残骸を「fake array を指す PHP 値」に見せ、デストラクタのコールバックを `system()` の番地にして `system(command)` を走らせる、と機構を説明。順序は 11.4 の引用。検知 = プロセス木 `apache2 (www-data)` → `sh -c <…>` → `bash` の外向き接続、ログ `"PHP Fatal error: Allowed memory size of 16777216 bytes exhausted (tried to allocate 3500032 bytes) in Unknown on line 0"`（`Unknown on line 0` は初期化中の失敗）、`AH00052: child pid ... exit signal Segmentation fault (11)`、約 3.5 MB の単一フォーム欄名＋NUL を含むバイナリ。**ただし洗練された exploit は HTTP 200 を返しワーカーも生き続ける**ので、エラーやクラッシュに頼るな。ルール `potential_web_shell_v2` / `potential_web_shell_parent_v2`。
- **Wiz**（`https://www.wiz.io/blog/php2shell-php-rce`、2026-10-21）: 4 バグを 2 CVE に束ねる。**Wiz の CVE 割り当ては GHSA と食い違う**（Wiz は upload-progress unserializer UAF ＋プロセスメモリ漏れを 109618、fatal-error backtrace UAF ＋ OPcache 型混同を 109619 に置く。php.net/GHSA は 109618=OOM corruption、109619=stale global state）。**権威は GHSA。ノートは GHSA の枠で書き、Wiz のズレは脚注**。メモリ漏れ: OOM 中断後「PHP then destroys the request heap and may leave `PS(id)` pointing to the freed allocation」、次の multipart 要求が「trusts the stale pointer and length as a live `zend_string`」→「URL-encodes the reclaimed heap contents into a `PHPSESSID` response cookie」（`session_start()` 不要）。fatal-error backtrace UAF → 「unauthenticated remote code execution against Drupal」。OPcache: `zend_accel_script_persist()` で「PHP advances the process-local `CG(map_ptr_last)` frontier」→ クロスワーカー型混同 → 「unauthenticated RCE chain against WordPress」。「Every PHP version released in the last decade is affected... going back to version 5.4」。AI = Wiz Atlas・Gemini 4 Argon・GPT-5.6 Sol。Heartbleed(2014)・Log4Shell(2021) に並べ「could mark a similar turning point for the AI era」。

### 11.6 悪用の実際・配布・KEV（ノートの「確かさ」「守り」の較正。ここが予告ノートからの最大の更新）

- **悪用**: 各社で「確認の度合い」が割れる。
  - **AWS Amazon Threat Intelligence（MadPot）**（`https://aws.amazon.com/blogs/security/amazon-threat-intelligence-identifies-php2shell-exploitation-prior-to-public-disclosure-in-madpot/`、2026-10-21、CJ Moses）: 最古の試行が**公開 4 日前の 10/17**（IP `103.216.220.92`、商用匿名化網）。禁輸解除 1400 UTC、最古の PoC は ~0200 UTC、0200〜0800 UTC に複数の匿名基盤から追加試行（「multiple actors」）。「**PHP2Shell is now being broadly exploited in the wild**」。ただし「**it's unclear if any of these attempts would have succeeded in real-world systems**」「Technical analysis is ongoing」で、**ハニーポットへの試行**が中心。「investigate from at least starting on October 17th」。検知は「Look for POST requests with the `PHP_SESSION_UPLOAD_PROGRESS` string」。どちらの CVE / どの経路を狙ったかは明言せず。
  - watchTowr は当初「悪用なし」→ 後に両 CVE の「active exploitation attempts」を観測。Hadrian は「attacks at scale, mostly through PHP's session upload progress path」（件数なし）。Patchstack は「multiple active exploitation incidents」を確認（技術詳細は未公開）。Aikido・Cloudflare も観測を報告。**2026-10-22 付で新たな確認済み侵入を足す情報源は見つからなかった**。
  - → 既存ノートの「悪用=見つかっていない」は**「公開前（10/17）から試行が観測され、各社が実地の悪用を報告。ただし実システムでの成功は未確認（AWS の "unclear if... succeeded"）、KEV 未掲載」**に更新する。研究者報告と honeypot 試行を、成功の確認と書き分ける。
- **Cloudflare**（`https://blog.cloudflare.com/php-vulnerabilities-waf-protection/`、2026-10-21）: WAF を「since early October 2026」準備、公開 ~9 時間前から。**10/21 03:02 UTC** から保護。無料=Managed Free Ruleset に「Generic Rules - Anomalous Execution」7 本、有料=Cloudflare Managed Ruleset に同名 7 本、全プランに「Default block for High confidence Signatures」。攻撃トラフィックと、規則回避のペイロード変異を観測（件数なし）。**full transaction detection** =「a new Cloudflare WAF capability that combines signals from the request and response within the same HTTP transaction」で、この保護が初適用。**WAF はパッチの代わりにならない**と明言（multipart 等の具体は書かず「specially crafted HTTP requests」「request data alone can be insufficient なので応答信号も使う」）。→ ノートの 20 章（TLS をほどく境界）・22 章場面 3 の応急策として。
- **配布（Node のノートと対照。主要ディストリが公開初日に配っている）**:
  - **Ubuntu**（CVE-2026-109618.json、priority critical、published `2026-10-21T14:00`、**USN-8948-1 / USN-8948-2**）: php8.5 stonking(26.10) `8.5.9-0ubuntu2.1`・resolute(26.04) `8.5.4-0ubuntu1.5`、php8.3 noble(24.04) `8.3.6-0ubuntu0.24.04.13`、php8.1 jammy(22.04) `8.1.2-1ubuntu2.28`、php7.4 focal(20.04) `7.4.3-4ubuntu2.29+esm5`、php7.2 bionic `…+esm14`、php7.0 xenial `…+esm22`、**php5 trusty `5.5.9+dfsg-1ubuntu4.29+esm18`**（5.5 まで ESM で修正）。
  - **Debian**: bookworm php8.2 `8.2.35-1~deb12u1`（DLA-4848-1）、trixie php8.4 `8.4.27-1~deb13u1`（DSA-6574-1）、sid `8.4.27-1`。security-tracker の Notes は `php2shell.com` を載せる。
  - AlmaLinux も修正パッケージ公開の blog あり。`rpms.remirepo.net` は当日更新なし（php.net が名指しで注意）。

### 11.7 「修正が不完全では」という騒ぎ＝実在せず（§10.5 の決着）

oss-security（2026-10-21〜22、`https://www.openwall.com/lists/oss-security/2026/10/`）: 10/21 に Jakub Zelenka(bukka) が両 CVE を投稿。Aaron Rainbolt が Fediverse の @elise の「8.5.12 の修正は不完全かも／**別の**脆弱性では」を中継（`fedi.katze.sh/@elise/…`）。その後 Rainbolt（10/21 12:29 CDT）が「#security:ubuntu.com Matrix 経由で Canonical が php.org に問い合わせ、**"unrelated and not a real issue"** との回答を得た」と報告。→ **実在の問題ではない**。ノートに書くなら脚注で「公開直後にそういう指摘が出たが PHP は無関係と否定」程度で十分、深追い不要。なお Greenbone（Christian Fischer、10/22 08:45 CEST）は「告知の表題 "PHP 8.2–8.5" は旧版が非影響と誤読されうる。7.4 へのバックポートがある以上 7.4 以降も影響」と指摘（Calif の「5.4.0 以降」と整合）。

### 11.8 ノートへ（残りは書くだけ。方針は §7・§9・§10.7 のまま、要点だけ再掲）

変更するのは `news/2026-10-20-php-security-release.md` だけ。`.html`・`index.html`・`README.md` は `node tools/build-news.mjs` が生成し、`node tools/verify.mjs news/index.html news/2026-10-20-php-security-release.html` で確かめる。1 画面版は場面ごとに 1 画面（表紙の要点は短く）。

1. **題と枠組み**: 「予告」→「公開後」。要点に「2026-10-21 に 8.2.35/8.3.36/8.4.27/8.5.12 が出た」。
2. **確かさの表を確定へ格上げ**: CVE 番号＝確定、種類＝確定（109618 OOM corruption／109619 stale global state）、影響する版＝5.4.0 以降（EOL は 7.4/8.0/8.1 の最小バックポートのみ、5.4〜7.3 は修正なし、ディストリは ESM で 5.5 まで）、CVSS ベクトル＝確定（11.1）、**悪用＝公開前 10/17 から試行・各社が実地悪用を報告・ただし成功は未確認・KEV 未掲載**。「RESERVED」行は消す。
3. **「仕組み」場面を新設**（11.2・11.4・11.5）: GHSA の枠で 109618（OOM で畳む途中の破壊＋「件数先・確保後」のバケットを teardown が生きた値とみなす）と 109619（session upload progress／fatal backtrace の UAF、producer/consumer）。既存ノートの `session.upload_progress` の記述は 109619 側で的中。Wiz の CVE 対応ズレは脚注。
4. **「直し方」場面を新設**（11.3）: 8.5 = 遅延 OOM（soft→VM 安全点→ユーザーフレームあれば UnwindExit／無ければ bailout）＋ hard 上限 `_exit(137)`＋大域リセット＋fallible 確保＋`post_max_size` 実測チェック。EOL = 即 `_exit(1)`＋upload-progress 無効化。
5. **CVSS** は §10.2 の言い回し（9.2 になる 3 通りのうち、実ベクトルは **AC:H かつ AT:P の両方**。ASLR 回避＝AC:H、競合に勝つ／前提が要る＝AT:P、メモリ漏れ[PHPSESSID]で番地を得てから、と各社の説明に整合）。
6. **層の対応表** は主に **6・9・20・21・22**（11＝経路・14＝外から始まる通信を止める、は緩和の文脈で残してよい）。PHP 本体＝教材に無い層＝22 章場面 3 の「奥のサービス」、Zend のメモリ管理＋エラー処理＋リクエストの生死。メモリと CPU（6・9 場面 4）＝残骸を生きた zval／デストラクタ先に見せ PC を `system()` へ。OS（9 場面 1/2/3）＝www-data 権限、mod_php と FPM のプロセスモデルの差、cgroup/seccomp は OS 層の封じ込め。
7. **「この PC」場面**: §10.3 の Docker の表（修正前後の止まり方の違い＝遅延 OOM と hard `_exit(137)`）。Node のノートと同じ体裁。**動く攻撃は載せない**。
8. **出典**: php.net 告知、GHSA 2 本、修正コミット（8.5 `31c0ea7d`・EOL 8.1 `1d7dec178a09`）、CVE API、Calif、PHP Foundation、Datadog、Wiz、Cloudflare、AWS、Ubuntu/Debian tracker、oss-security。
9. **リンクしている章**: 6・9・20・21・22 を主に（11・14 は緩和）。`build-news.mjs` が帯の印を付け直す。

---

## 12. セッション 4（2026-10-22 22:30 JST）: ノートを書いた

§7・§10.7・§11.8 の方針で `news/2026-10-20-php-security-release.md` を書き直し、`node tools/build-news.mjs` で作り直した。場面は 確かさ・層・作りかけ（109618）・古い状態（109619）・直し方・守り・CVSS と前例・この PC・影響と今後・出典 の 10。予告の時点の「PHP 本体の層について」の場面は、仕組みの 2 場面と、守りの表の `disable_functions` の行に吸収した。

書く前に取り直して確かめたこと（§11 と食い違いは無い。新しく分かったことだけ）:

- KEV（catalog 2026.10.21、1754 件）に 109618・109619 はまだ無い（2026-10-22 13:30 UTC）。php.net の告知は 10-21 の 5 件のまま。
- 8.5.12 の `Zend/zend_alloc.c: zend_mm_check_limit()`: soft を越えると、失敗してよい確保（`_femalloc` などが呼ぶ間だけ `heap->fallible` を立てる）なら FAILURE（NULL が返る）、そうでなければ SUCCESS（確保は通る）。hard の確認は fallible でないときだけ。`zend_mm_update_hard_limit()` は -1 のとき「上限 > 1 GiB なら +1 GiB、それ以外は 200%」。
- 8.2.35 にも同じ修正が入っている（実際に読んだバイトでの `post_max_size` の確認、`memory_hard_limit_percent`、`_exit(137)`、`in_rfc1867_update`、`php_mime_should_save_hdr`）。ノートの見出し「8.2〜8.5」の根拠。
- EOL 8.1（`1d7dec178a09`）の差分には、OPcache のスロットの公開を遅らせる修正（`zend_accel_pending_ce_cache_*`）も入っている（§4 に無かった）。`Zend/zend_hash.c` は誤りの呼び出しを `zend_mm_safe_error_ex()` に替えただけで、挿入の順序は変えていない。
- 8.5 の修正の規模は GitHub の stats で +11,556 −1,017（§11.1 の +11554 −1012 は数え方の差）、423 ファイル、.phpt 295（新規 275）。
- 配布: Ubuntu USN-8948-1（10-21 13:56 UTC、trusty・xenial・bionic・focal）・USN-8948-2（10-21 15:33 UTC、jammy・noble・resolute・stonking）。Debian DSA-6574-1（10-21 13:45 UTC）・DLA-4848-1（10-21 14:11 UTC）。どちらも公開の日。
- oss-security 21/23（Rainbolt）の「unrelated and not a real issue」は、Canonical が Matrix で聞いた又聞き。PHP のセキュリティチームによるリスト上の再確認は無い（22/2 は Greenbone の版の範囲の指摘）。
- 前例に CVE-2004-0594 を足した。NVD の説明は「memory_limit の打ち切りを `zend_hash_init()` の途中で起こし、初期化を終える前のハッシュ表のデストラクタの番地を書き換える」で、今回と同じ型。KEV には無い。

Docker（`php:8.5.11-cli`・`php:8.5.12-cli`、`--network none --memory 1g`）で §10.3 を測り直し、同じ結果を得た。`memory_limit=32M` で配列に整数を足し続けると、8.5.11 は 1,048,576 個で 32 MiB への拡張を断って致命的エラー（`memory_get_peak_usage(true)` 26.0 MiB、exit 255）。8.5.12 は拡張を通して 1,048,577 個にしてから致命的エラー（34.0 MiB、exit 255）。`memory_hard_limit_percent=100` で exit 137（出力は 1 行だけで、shutdown 関数は動かない）、`=150` で exit 255。zsh では `${PIPESTATUS[0]}` が取れないので、終了コードはパイプを通さずに `$?` で取った。

ノートの外部リンク 37 本を curl で確かめた（Huntress だけ 403。ボット除けで、予告の時点から載っている）。`node tools/verify.mjs news/index.html news/2026-10-20-php-security-release.html` は、はみ出し・リンク切れ・JS のエラーなし。1280x688 で表紙の余りは 28px（最初の稿は −3px だったので、表紙の箇条とリードを詰めた）。
