# PHP の重大なセキュリティリリース予告（2026-10-20）

- 出典: [Upcoming Critical PHP Security Release](https://www.php.net/archive/2026.php#2026-10-20-1)（php.net、2026-10-20）
- 調べた時点: 2026-10-21 17:30 JST（08:30 UTC）。修正版が出る 23:00 JST より前なので、出たら追記する。
- 報道での呼び名: php2shell（公式の名ではない）

## 要点

PHP 本体に CVSS v4.0 で 9.2 の欠陥が 2 件あり、修正版が 2026-10-21 23:00 JST（14:00 UTC）に出る予定である。層でいうと、HTTP の要求（第21章）を受け取ったサーバー（第22章）の中で、OS（第9章）の上のユーザー空間で動く言語処理系の欠陥である。watchTowr の言うとおりリモートからのコード実行（RCE）なら、攻撃者はネットワーク越しに PHP のプロセスを乗っ取り、そのプロセスの権限で動ける。欠陥の種類・場所・影響を受ける版は、まだ公式には出ていない。

## 確かなことと、確かでないこと

| 項目 | 内容 | 出どころ | 確かさ |
|---|---|---|---|
| 公開の日時 | 2026-10-21 14:00 UTC。詳細が漏れるか悪用が見つかれば早める | php.net | 公式 |
| 件数と点数 | 2 件。どちらも CVSS v4.0 で 9.2（Critical） | php.net | 公式 |
| 詳細・影響を受ける版・直った版 | 修正版と同時に出す | php.net | 公式。今は不明 |
| CVE 番号 | CVE-2026-109618、CVE-2026-109619 | watchTowr、CERT-EU | 未確認。CVE の API では 2 件とも RESERVED で、中身は無い。PHP は番号を出していない |
| 種類 | 2 件とも RCE。CVE-2026-109618 は再現した | watchTowr（BleepingComputer の取材） | 研究者の報告 |
| 影響を受ける版 | PHP 5 以降のすべて | watchTowr（BleepingComputer の取材）、CERT-EU（SNS の投稿を引用） | 未確認 |
| 欠陥の場所 | アップロードの進み具合をセッションに書く処理（`session.upload_progress`）と、`multipart/form-data` の解析での use-after-free | 個人の分析と、出回った PoC | 未確認。同じ研究者の投稿と分析で、2 件目の場所が食い違う |
| 悪用 | 見つかっていない | watchTowr、Huntress（10-20〜21 時点） | 研究者の報告 |
| 経緯 | 10-20 15:20 UTC に Hacker News へ予告の投稿（削除済み）。当初は 10-22（木）に公開する予定だった | Sansec、BleepingComputer | 報告。Huntress によれば、PHP の予告はこの後で、公開を 1 日早めた |

## どの層の話か

報道どおり攻撃が HTTP の要求で届くとして、届く順に下の層から並べる。欠陥があるのは太字の層。

| 層 | このニュースで起きること | 章・場面 |
|---|---|---|
| 電波・光・IP・TCP・QUIC | 攻撃の要求も、ふつうの要求と同じように運ぶ。途中の機器は自分の層のヘッダまでしか読まない | [11章 場面3][11-3]、[11章 場面6][11-6] |
| TLS | 途中の機器から中身を隠すが、送り手が悪意ある中身を送ることは止めない。サーバーは復号した要求をそのまま受け取る | [20章 場面1][20-1]、[20章 場面6][20-6] |
| HTTP | 入口は HTTP の要求。報道が疑う場所が正しければ、ファイルを送る POST の本文（`multipart/form-data`） | [21章 場面1][21-1]、[21章 場面2][21-2] |
| Web サーバー | nginx や Apache が要求を受け、PHP へ渡す | [22章 場面3][22-3]（GFE が暗号をほどいて奥のサービスへ渡す所） |
| **PHP 本体** | C で書かれた言語処理系。要求を解析し、アプリの PHP スクリプト（WordPress など）を実行する | 教材に無い。22章 場面3 の「奥のサービス」にあたる |
| OS | 乗っ取られるのは、ユーザー空間で PHP を実行しているプロセス（PHP-FPM のワーカーや、mod_php を組み込んだ Apache）。その利用者（`www-data` など）の権限で、ファイルを書き換えたり、システムコールでシェルを起動したりできる | [9章 場面1][9-1]、[9章 場面2][9-2]、[9章 場面3][9-3] |
| メモリと CPU | 欠陥が use-after-free のようなメモリの誤りなら、仮想メモリ上の関数の番地などを書き換え、PC（次に実行する番地）を攻撃者の選んだ命令へ向ける。6章の CPU は、PC が指す命令が正規の流れかどうかを区別せずに実行する | [9章 場面4][9-4]、[6章 場面1][6-1]、[6章 場面4][6-4] |

### PHP 本体の層について

PHP 本体は、アプリのスクリプトが 1 行も動く前に、要求の本文を解析して `$_POST` と `$_FILES` を作る。`multipart/form-data` の本文は `main/rfc1867.c` の `rfc1867_post_handler` が部品に分ける。session 拡張は起動時に、その途中で呼ばれる関数を `ext/session/session.c` の `php_session_rfc1867_callback` に差し替えており、要求に `PHP_SESSION_UPLOAD_PROGRESS` の欄とセッション ID があれば、進み具合をセッションに書く。欄もセッション ID（Cookie）も、送る側が要求に付けられる。ファイルの受け取り（`file_uploads`）、本文の読み込み（`enable_post_data_reading`）、進み具合の記録（`session.upload_progress.enabled`）は、どれも既定で有効である（php-src の PHP-8.5 ブランチで確認）。したがって、この経路に欠陥があれば、アプリが何であっても、PHP のファイルへ POST を 1 つ送るだけで届く。「既定の設定のまま、すべての PHP サイト」という報道は、この構造からは筋が通る（欠陥がこの経路にあるかは未確認）。

PHP の中の制限（`disable_functions`、`open_basedir`）は、PHP の関数を呼ぶ所で調べる仕組みなので、PHP 本体のメモリの誤りから機械語を実行された場合は効かない。効くのは OS の層の制限（プロセスの利用者の権限、コンテナ、seccomp）である。Chrome がレンダラを、乗っ取られる前提でファイルにもネットワークにも触れないサンドボックスに入れるのも、同じ考え方である（[9章 場面2][9-2]）。ただし PHP のワーカーは仕事のためにファイル・データベース・ネットワークに触れるので、レンダラほど狭くは閉じ込められない。

## 層ごとの守り

| 守り | 層 | 章・場面 | 出どころと注意 |
|---|---|---|---|
| 修正版に上げる | PHP 本体 | — | 公式。サポート中は 8.2〜8.5（8.2 は 2026-12-31 まで）。8.1 以前（7 系・5 系を含む）はサポートが終わっており、方針どおりなら公式の修正は出ない。Linux のディストリビューションは、版番号を変えずに修正を取り込むことがある |
| `session.upload_progress.enabled = Off` | PHP 本体の機能を止める | [21章 場面1][21-1] | 解説記事の暫定策。報道が疑う場所が正しいときだけ効き、2 件のうち 1 件にしか効かないという主張もある。`ini_set()` では変えられず、php.ini などに書く |
| アップロードを受けない URL への `multipart/form-data` の POST を、WAF やリバースプロキシで止める | HTTP（TLS をほどいた後） | [21章 場面2][21-2]、[22章 場面3][22-3] | 解説記事の暫定策。欠陥の場所が分かるまで、効くかは分からない |
| インターネットに面したアプリを公衆網から切り離す | IP・ポート | [14章 場面5][14-5]（外から始まる通信を止める） | CERT-EU が、すぐ修正できない場合に検討するよう勧めた |
| PHP のプロセスがシェルや `curl` を起動したら気づく | OS（システムコール） | [9章 場面3][9-3] | Huntress（Florian Roth の見解）。親が `php-fpm`・`apache2`、子が `sh`・`bash`・`curl`・`wget` の組を見張る |
| PHP を実行するプロセスの権限を絞る | OS（プロセスと利用者） | [9章 場面1][9-1]、[9章 場面2][9-2] | 一般論。乗っ取られた後の被害の範囲を狭める |

## CVSS 9.2 から読めること

- 9.2 になる CVSS v4.0 の基本ベクトルは、全 104,976 通りのうち 699 通りある。点数だけではベクトルは決まらない（Python の `cvss` 3.6 で全通りを計算した）。
- 「ネットワーク越しに（AV:N）、認証なしで（PR:N）、利用者の操作なしに（UI:N）、そのシステムの機密性・完全性・可用性をすべて失い（VC/VI/VA:H）、ほかのシステムには及ばない（SC/SI/SA:N）」は 9.3 になる。これが 9.2 になるのは、AC:H（ASLR などの防御を回避する必要がある）か AT:P（競合状態に勝つ、特定の設定があるなどの前提が要る）が付く 3 通りだけである。
- ASLR は、[9章 場面4][9-4] の仮想アドレスの配置を起動ごとに変える仕組みである。メモリの誤りから RCE に進むには、たいていこの配置を知る必要がある。
- リークの「CVSS 10」は版が書かれていない。v4.0 では、ほかのシステムへの影響（SC/SI/SA）が無いと 9.3 が上限で、10.0 にならない。v3.1 では S:C（スコープの変更）で 10.0 になる。

## 過去の PHP 本体の RCE

| CVE | 公開 | 何が起きたか | 層 | 悪用 |
|---|---|---|---|---|
| CVE-2019-11043 | 2019-10 | 特定の nginx の設定で、細工した URL により PHP-FPM が確保した領域の外へ書き込む | PHP 本体（FastCGI の受け口）のメモリの誤り | 2022-03-25 に CISA KEV へ載った |
| CVE-2024-4577 | 2024-06 | Windows の文字の置き換え（Best-Fit）で、URL の文字が php-cgi のオプションとして解釈される | PHP 本体と OS の境目（コマンドラインの引数） | 2024-06-12 に CISA KEV へ載った |

PHP 本体の RCE には、メモリの誤りの例も、入力が命令として解釈される例もある。今回がどちらかは公表されていない。

## 影響の大きさ

- W3Techs（2026-10-21）では、サーバー側の言語が分かるサイトの 69.3% が PHP を使う。PHP のサイトの 34.8% は PHP 7 以前で、サポートが終わっている（8.0・8.1 も終わっているが、W3Techs の表に内訳は無い）。
- 修正の前に存在が漏れた。Sansec は、修正版の公開から 15 分以内に大規模な攻撃が始まると予想している。

## 公開後に確かめること

- CVE 番号、種類、欠陥の場所（ファイル・関数）、影響を受ける版、直った版、CVSS のベクトル。
- 「どの層の話か」の PHP 本体・OS・メモリと CPU の行を、公式の説明と php-src の差分で確定させる。
- 「層ごとの守り」の暫定策が効くかどうか。

## 出典

公式とデータ

- [php.net の告知（2026-10-20）](https://www.php.net/archive/2026.php#2026-10-20-1)、[サポート中の版](https://www.php.net/supported-versions.php)、[Session Upload Progress（マニュアル）](https://www.php.net/manual/en/session.upload-progress.php)
- php-src の PHP-8.5 ブランチ: [main/rfc1867.c](https://github.com/php/php-src/blob/PHP-8.5/main/rfc1867.c)、[ext/session/session.c](https://github.com/php/php-src/blob/PHP-8.5/ext/session/session.c)、[main/main.c](https://github.com/php/php-src/blob/PHP-8.5/main/main.c)
- [CVE の API（CVE-2026-109618）](https://cveawg.mitre.org/api/cve-id/CVE-2026-109618)、[CVE の API（CVE-2026-109619）](https://cveawg.mitre.org/api/cve-id/CVE-2026-109619)
- NVD: [CVE-2019-11043](https://nvd.nist.gov/vuln/detail/CVE-2019-11043)、[CVE-2024-4577](https://nvd.nist.gov/vuln/detail/CVE-2024-4577)
- [W3Techs: PHP](https://w3techs.com/technologies/details/pl-php)

研究者と報道

- [BleepingComputer（2026-10-20）](https://www.bleepingcomputer.com/news/security/php-warns-admins-of-two-critical-flaws-emergency-patches-coming-tomorrow/): watchTowr の発言、リークの経緯
- [watchTowr の FAQ](https://watchtowr.com/intelligence/php-cve-2026-109618-faq/)
- [CERT-EU 2026-018](https://cert.europa.eu/publications/security-advisories/2026-018/)
- [Huntress](https://www.huntress.com/blog/php2shell-leaked-critical-php-vulnerabilities): 経緯、検知
- [Sansec](https://sansec.io/research/php2shell): 時系列、攻撃の予想
- [Phoenix Security](https://phoenix.security/php-core-rce-cve-2026-109618-109619-critical-remote-code-execution/): 欠陥の場所の主張、暫定策
- [lilting.ch](https://lilting.ch/en/articles/php2shell-session-upload-progress-uaf): `session.upload_progress` の主張の出どころの整理

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
[22-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/22-server.html#s3
