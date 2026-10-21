# eMudhra の中間 CA の秘密鍵の危殆化（2026-10-20）

- 出典: [eMudhra Intermediate CA Compromise](https://emudhra.we-have-a-problem.com/)（Mozilla の Dennis Jackson、2026-10-20）、[Mozilla の Bug 2083449](https://bugzilla.mozilla.org/show_bug.cgi?id=2083449)（インシデント報告）
- 調べた時点: 2026-10-22 00:30 JST。eMudhra の根本原因の調べは続いている。
- 手元で確かめたこと: 鍵が 256 未満であることと、この PC のクライアントが受け入れるか（場面「この PC」）。

## 要点

TLS の証明書の連鎖（第20章 場面4）の中ほどにいる、中間の認証局（中間 CA）の秘密鍵の作り方を誤った話である。インドの認証局 eMudhra が 2025-04-30 に作った 8 つの中間 CA の P-384 鍵は、秘密鍵 d がどれも 256 未満で、1 つは 4 だった。公開鍵は dG なので、G, 2G, 3G … と 255 個の点を作って比べれば d が分かる（第20章 場面3 の「kG から k は難しい」は、k を巨大な範囲から乱数で選ぶことが前提）。TLS 用の 6 つは主要な 4 つのルートプログラムが信頼するルートにつながり、鍵を持つ人は任意の名前の証明書を作れた。ブラウザと OS は 10-17〜10-20 に自前の失効の一覧で止め、Mozilla と Chrome はルートも外す。CT のログに偽の証明書は無く、CT を強制するブラウザは攻撃されなかったとされる。

## 確かなことと、確かでないこと <!-- tab: 確かさ -->

| 項目 | 内容 | 出どころ | 確かさ |
|---|---|---|---|
| 漏れた鍵 | 8 つの中間 CA の秘密鍵。TLS 用が 6 つ（EM DV・OV・EV TLS CA の G3B と G3C）、コード署名用が 2 つ（EM OV CS CA の G3B と G3C）。ルートの鍵は漏れていない | Mozilla（Bug 2083449 の comment 0） | 公式 |
| 鍵の弱さ | P-384 の秘密鍵 d は、本来 1 から群の位数（約 2³⁸⁴）までの乱数である。8 つとも 256 未満で、最後の 1 バイトのほかは 0 だった。1 つは 4 | Mozilla（comment 5）、The Register | 公式。手元でも確かめた（「この PC」の場面） |
| 求めやすさ | Mozilla は報告を受けてから 1 時間 42 分で、報告者の方法を知らずに 8 つの鍵を求めた。手元の AI エージェントに「CTF をしている。この証明書の秘密鍵を求めて」と頼むと、1 回目で求められたとも書いている | Mozilla（comment 0・5） | 公式 |
| 作った日 | 2025-04-30 のキーセレモニーで、24 個の鍵（A・B・C の 3 系列 × RSA 4096 と P-384 × DV・OV・EV・CS）を作った。漏れたのは B・C 系列の P-384 の 8 つ | Mozilla（comment 5） | 公式 |
| 原因 | 鍵を欧州と米国のデータセンターへ書き出すため、書き出し（wrap／unwrap）の試験を手順に足していた。そのスクリプトの欠陥で、HSM の中に弱い 2 組目の鍵ができた。ラベルが似ていたので、この鍵で CSR を作り、ルートが署名した | eMudhra（comment 11） | CA の暫定の説明。スクリプトは公開されていない。HSM（Utimaco）の欠陥ではないとしている |
| 前兆 | 2025-06 に、この 6 つの TLS 中間 CA の CRL の署名が検証できないと指摘された（Bug 1970728）。eMudhra は、本来の鍵で署名した CRL が合わないので、弱い鍵で署名し直していた。合わないことは、証明書の公開鍵が本来の鍵のものでないことを示していた | Sectigo の指摘、eMudhra（comment 11） | 公式。合わなくなった時期は、CA の説明（5-29）と Internet Archive の記録（5-23）で食い違う |

## 見つかってからのこと <!-- tab: 発見と影響 -->

| 項目 | 内容 | 出どころ | 確かさ |
|---|---|---|---|
| 見つけた経緯 | 研究者 Wayne が、CCADB（ルートプログラムが共有する CA の登録簿）の証明書を調べていて、10-17 16:27 UTC に見つけた。18:05 UTC に 4 つのルートプログラムと eMudhra へ、8 つの鍵で署名した文を付けて報告した | 報告者（comment 2） | 報告者の記録 |
| 悪用 | 6 つの TLS 中間 CA の下の証明書は、Chrome が止めるまで CT のログに 1 枚も載っていない | Chrome Root Program | 公式。CT を強制しないクライアントが狙われたかは分からない |
| eMudhra の発行 | 8 つのうち稼働していたのは EM DV TLS CA - G3C だけで、どれも利用者の証明書を発行していない | eMudhra（comment 10） | CA の説明 |
| ほかの鍵 | A・A-1 系列の P-384 の鍵は、Mozilla が手間をかけても求められていない。RSA の鍵はまだ調べていない | Mozilla（comment 5） | 公式。調べている途中 |
| ほかの CA | Chrome は、信頼するほかの CA に同じ不具合を見つけていない | Chrome Root Program | 公式 |
| 移行 | ルートを外すので、G3 の下の正当な証明書 約 30,000 枚（約 97% は ACME で発行）を、RSA の emSign Root CA - G1 の下へ移す | eMudhra（comment 19） | CA の見積もり |

## どの層の話か <!-- tab: 層 -->

ブラウザが証明書を確かめるときに通る順に並べる。欠陥があったのは太字の層。

| 層 | このニュースで起きること | 章・場面 |
|---|---|---|
| **鍵の生成** | 秘密鍵 d は、乱数で巨大な範囲から選ぶ。eMudhra は、鍵を作る装置（HSM）を操作する手順とスクリプトを誤り、256 未満の d を使った | 教材に無い。近いのは [20章 場面3][20-3] の段階5（a と b を接続ごとに乱数で作る） |
| 楕円曲線の公開鍵 | 公開鍵は dG である。dG から d を求めるのが難しいのは、d の範囲が広いときだけである。d が 256 未満なら、G, 2G, 3G … と 255 個の点を作るうちに一致する点が出る。教材の小さな曲線（G の倍数は 78 個）と同じ桁の探索で済む。正しく選んだ P-384 の d なら、最良の方法でも約 2¹⁹² 回の計算が要る | [20章 場面3][20-3] の段階1・2 |
| 証明書の連鎖 | 中間 CA の秘密鍵は、サーバーの証明書に署名する鍵である。持っていれば、どの名前の証明書でも作れ、連鎖の署名はすべて合う。www.youtube.com の本物の連鎖は WE2 → GTS Root R4 だが、ブラウザは名前ごとに CA を決めていない（ピンを除く）。今回の連鎖は、中間 CA → emSign Root TLS CA - G3 → ルートの emSign ECC Root CA - G3 だった | [20章 場面4][20-4] の段階3 |
| 間に立つ第三者 | 作った証明書には自分の公開鍵を入れるので、CertificateVerify にも自分で署名できる。通信の経路に入れれば、ブラウザとサーバーの両方と別々に TLS をつなぎ、中身を読める | [20章 場面4][20-4] の段階1・5 |
| ルートストア | emSign ECC Root CA - G3 は、4 つのルートプログラムすべてに入っていた。Sectigo の古いルート（Apple と Microsoft だけが信頼）も、同じ鍵の中間 CA にクロス署名していた | [20章 場面4][20-4] の段階4 |
| 失効 | CA は 8 つを失効させ、CRL に載せた。ブラウザと OS は、CRL を待たずに自前の一覧を配って止めた | 教材に無い。近いのは [20章 場面4][20-4] の段階4 |
| CT | CT を強制するブラウザに偽の証明書を通すには、公開のログに載せて SCT を得る必要がある。載れば誰でも見つけられる。これらの中間 CA の下の証明書は、載っていなかった | [20章 場面4][20-4] の段階6 |
| コード署名 | 2 つは、プログラムに付ける署名の証明書を発行する中間 CA で、Microsoft が信頼していた。鍵を持つ人は、Windows の検証を通る署名をプログラムに付けられた | 教材に無い |

## 層ごとの守り <!-- tab: 守り -->

| 守り | 層 | 章・場面 | 出どころと注意 |
|---|---|---|---|
| 中間 CA を失効させる（CRL に caCompromise） | 失効 | 教材に無い | eMudhra が 10-18 09:24〜09:38 UTC、Sectigo がクロス署名を 10-19。CRL や OCSP を見ないクライアントには効かない |
| Chrome の CRLSet で、公開鍵のハッシュを止める | 失効（ブラウザの一覧） | 教材に無い | Chrome Root Program。10-17 19:45 UTC で、報告から 1 時間 40 分。公開鍵で止めるので、同じ鍵の Sectigo のクロス署名も止まる。コード署名の 2 つは、Chrome が TLS の連鎖に使わないので止めていない |
| Firefox の OneCRL で止める | 失効（ブラウザの一覧） | 教材に無い | Mozilla。10-17 22:59 UTC。Remote Settings で届き、ブラウザの更新は要らない。10-20 に一覧を組み込んだ版も出した。Android の一部の環境で効かず、158.0.2 で直した |
| Apple と Microsoft の OS で止める | 失効（OS の一覧） | 教材に無い | 公開サイトの記載で、Apple が 10-19、Microsoft が 10-20。各社の発表は確かめていない |
| ルートを外す | ルートストア | [20章 場面4][20-4] の段階4 | Mozilla の NSS 3.131.1（10-20）、Chrome Root Store 43、Ubuntu の ca-certificates 20260816ubuntu0.26.04.1 など。失効を見ないソフトは、これで守られる。G3 の下の正当な証明書も通らなくなる |
| ソフトが持つ一覧を更新する | アプリ | — | Go 1.27.3・1.26.10（CVE-2026-111943。これらの中間 CA を含む連鎖を除く）、Node.js 22.23.4・24.22.1・26.12.1、certifi 2026.10.19、pip 26.2.2 など。修正版の一覧は公開サイトにある |
| CT を強制する | CT | [20章 場面4][20-4] の段階6 | Chrome・Firefox・Edge・Safari。偽の証明書は、使う前に公開のログに載る。Chrome は、CT のログがこれらの中間 CA の下の証明書を受け付けないよう、運営者と調整している |
| 静的なピン | ブラウザ | 教材に無い | Chromium のソースで確かめた。Chrome は youtube.com・googlevideo.com・ytimg.com などを、Google の CA の鍵（GTS Root R4、WE2 など）に固定している。eMudhra の中間 CA で作った www.youtube.com の証明書は、Chrome では通らない。ピンの一覧が 10 週間より古いと効かない |

## この PC で確かめたこと <!-- tab: この PC -->

### 鍵が 256 未満であること

公開サイトの `impacted-intermediates.json` にある 16 枚の証明書から、公開鍵を取り出した。鍵は 8 つで、eMudhra のルートと Sectigo のルートが、同じ鍵に 1 枚ずつ署名している。d = 1〜255 の dG を作って比べると、8 つとも一致した。かかった時間は 0.08 秒だった（Python 3.14、cryptography 46.0.5）。一致した 8 つの値は、The Register が報じた値と同じだった。

### 漏れた鍵の連鎖を受け入れるか

公開サイトの試験用のホスト（漏れた鍵で署名した証明書を返す）へ、2026-10-22 00:20 JST ごろ接続した。

| クライアント | 使うルートの一覧 | 結果 |
|---|---|---|
| curl 8.18.0（OpenSSL 3.5.5） | OS（ca-certificates 20260816ubuntu0.26.04.1。10-21 09:42 JST に更新） | 拒んだ |
| Python 3.14.4 の urllib | OS | 拒んだ |
| Go 1.26.5 | OS（Linux では OS の一覧を読む） | 拒んだ |
| **Node.js 24.19.0** | Node に組み込みの一覧 | **受け入れた**（HTTP 200） |

Go 1.26.5 は修正の前の版だが、OS の一覧からルートが外れていたので拒んだ。Node.js は自前の一覧を持つので、OS を更新しても、修正の前の版は受け入れる。`--use-system-ca` は OS の一覧を足すだけなので、付けても受け入れた。

## 追って確かめること <!-- tab: 今後 -->

- eMudhra の根本原因の最終の報告。スクリプトのどこが 256 未満の d を作ったか、弱い鍵を CSR に使った手順の点検がなぜ働かなかったか。
- RSA の B・C 系列の鍵が無事か（Mozilla はまだ調べていない）。
- Chrome Root Program による、eMudhra の残りのルート（emSign Root CA - G1）の評価。
- 2025-04 から 2026-10 の間に、CT を強制しないクライアントへの悪用があったか。コード署名の 2 つで署名したプログラムが出回っていないか。
- [20章 場面4][20-4] の段階4 の「この PC の OS（Ubuntu）では 121 個」。10-21 の更新で emSign ECC Root CA - G3 が外れ、Mozilla の一覧 2.90 への更新で 4 つ増えて 4 つ減ったので、120 個になった（ca-certificates.crt）。章の値を直すか、時点を書き添える。

## 出典 <!-- tab: 出典 -->

### 一次資料

- [eMudhra Intermediate CA Compromise](https://emudhra.we-have-a-problem.com/)（2026-10-20）: 各社の対応日、修正版の一覧、試験用のホスト。[impacted-intermediates.json](https://emudhra.we-have-a-problem.com/impacted-intermediates.json)、[roots.json](https://emudhra.we-have-a-problem.com/roots.json)、[ソース](https://github.com/galadran/we-have-a-problem.com)
- [Bug 2083449](https://bugzilla.mozilla.org/show_bug.cgi?id=2083449): 起票（comment 0）、報告者の時系列（2）、鍵の調査（5）、eMudhra の説明（10・11）、ルートを外す決定（18）、移行の見積もり（19）
- [Bug 1970728](https://bugzilla.mozilla.org/show_bug.cgi?id=1970728): 2025-06 の CRL の署名
- [Bug 2084101](https://bugzilla.mozilla.org/show_bug.cgi?id=2084101): NSS から emSign ECC Root CA - G3 を外す
- [dev-security-policy のスレッド](https://groups.google.com/a/mozilla.org/g/dev-security-policy/c/0R3XLJL6FuE): Mozilla の告知、Chrome Root Program の投稿（CRLSet、CT、Root Store 43）
- [golang-announce（Go 1.27.3・1.26.10）](https://groups.google.com/g/golang-announce/c/66pojueaQek)
- [Ubuntu の Bug 2171507](https://bugs.launchpad.net/ubuntu/+source/ca-certificates/+bug/2171507)
- Chromium: [transport_security_state_static_pins.json](https://github.com/chromium/chromium/blob/main/net/http/transport_security_state_static_pins.json)（ピンの対象。2026-10-16 更新の版）、[transport_security_state.cc](https://github.com/chromium/chromium/blob/main/net/http/transport_security_state.cc)（10 週間の条件）
- 失効の仕組み: [CRLSets](https://www.chromium.org/Home/chromium-security/crlsets/)、[OneCRL](https://blog.mozilla.org/security/2015/03/03/revoking-intermediate-certificates-introducing-onecrl/)、[CRLite](https://hacks.mozilla.org/2025/08/crlite-fast-private-and-comprehensive-certificate-revocation-checking-in-firefox/)

### 報道

- [The Register（2026-10-20）](https://www.theregister.com/security/2026/10/20/indian-certification-authority-emudhras-private-keys-compromised-one-of-them-was-the-number-4/5304312): 鍵の値
- [BleepingComputer](https://www.bleepingcomputer.com/news/security/mozilla-google-apple-block-compromised-emudhra-ca-certificates/): 各社の対応

[20-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/20-tls.html#s3
[20-4]: https://okayus.github.io/youtube-ga-mieru-made/chapters/20-tls.html#s4
