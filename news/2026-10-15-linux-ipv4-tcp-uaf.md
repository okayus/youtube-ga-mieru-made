# Linux の IPv4 TCP の解放後の使用 CVE-2026-98432（2026-10-15）

- 出典: [CVE の記録](https://www.cve.org/CVERecord?id=CVE-2026-98432)（Linux カーネルの CNA、2026-10-15）、[修正のコミット e3f33b0a1d89](https://git.kernel.org/linus/e3f33b0a1d89d738e2b913dab519226eaf76e15b)、[Ubuntu の CVE のページ](https://ubuntu.com/security/CVE-2026-98432)
- 調べた時点: 2026-10-30 23:30 JST。Ubuntu の修正版は `-proposed` までで、RHEL の修正版は出ていない。
- 手元で確かめたこと: 暫定策のルールが IP オプション付きの SYN を落とすことと、`net.mptcp.enabled` が netns を越えないこと（場面「この PC」）。

## 要点

IPv4 ヘッダのオプション（第18章）の写しを、TCP のハンドシェイク（第19章）の途中でカーネルが解放後に読む、ネットワークスタック（第9章）の欠陥の話である。アプリが `accept()` する前の処理なので、認証は関係しない。2015 年の変更から入っていて、修正は `kfree()` を `kfree_rcu()` に替える 2 行である。Anthropic は MPTCP の待ち受けへの遠隔 root の PoC を報告したが、欠陥そのものは MPTCP に限らない。修正版は、Debian は配布済み、Ubuntu は `-proposed` まで、RHEL は未提供である。

## 確かなことと、確かでないこと <!-- tab: 確かさ -->

| 項目 | 内容 | 出どころ | 確かさ |
|---|---|---|---|
| 欠陥 | TCP の子ソケットの `inet_opt` を `kfree()` で解放した後に、別の CPU が `ip_options_build()` で読む。request socket の移行でも同じ形が起きる | CVE の記録、修正のコミット | 公式 |
| 範囲 | 4.4 から（コミット 079096f103fa、2015-10）。移行の道はコミット c905dee62232（2021-06）から。IPv6 は最初の欠陥の影響を受けない | 同上 | 公式 |
| 修正版 | 上流は 7.3（7.3-rc7）。stable は 5.10.272・5.15.223・6.1.190・6.6.159・6.12.113・6.18.56・7.2.10 | CVE の記録 | 公式 |
| 遠隔 root | Anthropic が、MPTCP の待ち受けへパケットを送るだけで root のコマンドを実行する PoC を報告した（10-27）。ポインタの漏えいに 48 分、実行までさらに 5 分。修正のコミットの報告者も同社の研究者 | Anthropic の記事、修正のコミット | 報告者の発表。コードは載っておらず、第三者の再現は見つからなかった |
| MPTCP の無い待ち受け | RCE に至る道があるかは不明。Go の告知は、欠陥は MPTCP に固有でなく、似た攻撃の可能性があると書く | Go の告知（10-29）、issue 82717 | 未確認 |
| 深刻度 | CNA は CVSS 3.1 で 9.8（AC:L）。Red Hat は 8.1（AC:H、草案）で Important、SUSE も AC:H で important。Ubuntu は 9.8 を表示し、CVSS 4.0 では 8.3（AT:P）、優先度は High | 各社の記録 | 公式どうしで食い違う |
| 公開された道具 | 競合の引き金と漏えいまで作ったと称するリポジトリが、10-29 以降に GitHub に複数出た。README の 1 つは、完全な root の攻撃は実装していないと書く | GitHub の検索 | 未確認。README だけを読み、コードは取得も実行もしていない |
| 悪用 | 報告は見つからなかった。CISA の KEV（10-29 の版）に無く、EPSS は 0.39%（10-29） | CISA、FIRST、検索 | 未確認 |

## どの層の話か <!-- tab: 層 -->

SYN が届いてから解放された領域を読むまでの順に並べ、最後に権限と MPTCP を置く。欠陥があったのは太字の層。

| 層 | このニュースで起きること | 章・場面 |
|---|---|---|
| IP ヘッダ | ヘッダ長を 5 より大きくすると、後ろにオプションを足せる。攻撃者は SYN に Record Route や Timestamp を付ける | [18章 場面1][18-1] の段階2・6 |
| 家のルーター | ポート開放が無ければ、外からの IPv4 の SYN は NAT の内側へ届かない。同じ LAN の機器からは届く | [14章 場面5][14-5] の段階1・4 |
| ネットワークスタック | 受信はカーネルが処理し、待ち受けのアプリは関わらない | [9章 場面6][9-6] の段階2・3 |
| **TCP のハンドシェイク** | SYN でカーネルが request socket を作り、IP オプションの写しを持つ。最後の ACK で子ソケットができ、写しをコピーせずに引き継ぐ | [19章 場面2][19-2] の段階1〜3 |
| TCP の再送 | 同じ SYN が再送されると、カーネルは SYN/ACK を作り直し、そのとき写しを読む | [19章 場面3][19-3] の段階5 |
| 複数のコア | 再送の処理と子ソケットの解放は、別のコアで同時に走る | [9章 場面5][9-5] の段階6 |
| **メモリの寿命** | 解放された領域が別の物に使い回されると、古いポインタで読む長さの欄も別の値になる | [26章 場面6][26-6] の段階3 |
| ハッシュ表 | 2015 年の変更で request socket を ehash 表に入れ、リスナーのロックなしで処理するようになった。この欠陥の入口である | [27章 場面3][27-3] の段階2 |
| カーネルの権限 | カーネルは ring 0 で動く。ここで制御を奪えば、root のコマンドも実行できる | [9章 場面1][9-1] の段階2 |
| MPTCP | 1 本の接続を複数の TCP のサブフローで運ぶ拡張で、教材に無い。近いのは QUIC の接続 ID。Go 1.24 以降の Linux の待ち受けは、既定で MPTCP を使う | [19章 場面6][19-6] の段階4 |

## 欠陥の仕組み <!-- tab: 仕組み -->

### 読む側と解放する側

1. SYN が届くと、`tcp_v4_save_options()` が IP オプションの写しを確保し、`ireq->ireq_opt` に置く。オプションが無ければ何も確保しない。
2. 最後の ACK で、`tcp_v4_syn_recv_sock()` がこのポインタを子ソケットの `inet_opt` へ移す。コピーはしない。
3. 別の CPU が、同じ request socket への再送 SYN を処理する。`tcp_check_req()`、`tcp_v4_send_synack()`、`ip_build_and_send_pkt()`、`ip_options_build()` の順に進み、写しを読む。持っているのは `rcu_read_lock()` だけで、`opt->optlen` を 2 回読む。
4. 子ソケットが解放されると、`inet_sock_destruct()` が `inet_opt` を `kfree()` する。3 の読み手を待たないので、読み手は解放された領域を読む。

SYN の処理はリスナーのロックを持たない。SYN/ACK のタイマーは request socket の参照を持ち、子を解放する前に止まるので、この欠陥の道ではない。

### 2 つ目の道と IPv6

- request socket の移行（`net.ipv4.tcp_migrate_req=1` か、`BPF_SK_REUSEPORT_SELECT_OR_MIGRATE` の BPF プログラム）では、複製と元が同じ `ireq_opt` を指す。元を持つ別の CPU が読んでいる間に複製が解放されると、同じことが起きる。`tcp_migrate_req` の既定は 0 である。
- IPv6 は `tcp_v6_syn_recv_sock()` がオプションを複製するので、最初の欠陥が無い。
- 移行の欠陥は `tcp_v6_reqsk_destructor()` にもある。`ipv6_opt` を設定するのは CALIPSO だけで、CVE の記録は別のパッチで直すと書く。

## 解放された領域を読むと <!-- tab: 影響 -->

### CVE の記録が書く影響

解放された領域が別の物に使い回されたときの影響を、CVSS の説明は次のように書く。CVE の記録に PoC は無い。

- 漏れる: 古い `optlen` の長さだけ `opt->__data` を SYN/ACK へ写すので、隣のヒープの内容が相手に届く。
- 壊す: 古い `optlen` と `srr`・`rr`・`ts` のオフセットで `ip_options_build()` の書き先がずれ、範囲外に書く。
- 止まる: `optlen` が大きいと `ip_build_and_send_pkt()` の `skb_push()` がヘッドルームを超え、`skb_under_panic()` になる。

### Anthropic の PoC

- 第 1 段: 余分なバイトを返させ、その中のカーネルのポインタから KASLR（カーネルの配置を起動ごとにずらす仕組み。教材に無い）を破る。
- 第 2 段: 同じ欠陥でバッファをあふれさせ、コールバックの番地を書き換える（[6章 場面1][6-1] の段階2 の PC を向ける先を変える）。行き先は、通常のプロトコルの機能で先にカーネルのメモリへ置いた内容で、既存のカーネルの関数を連ねて root のシェルのコマンドに至る。
- 競合に負けてもハンドシェイクが失敗するだけで落ちないので、成功するまで繰り返せる、と記事は書く。
- MPTCP が要る理由と、対象のカーネルの版は、記事に書かれていない。

## 直し方と配布 <!-- tab: 修正 -->

### 差分は 2 行

`rcu_dereference_protected()` を略して書く。

| 関数 | 前 | 後 |
|---|---|---|
| `inet_sock_destruct()` | `kfree(inet_opt)` | `kfree_rcu(inet_opt, rcu)` |
| `tcp_v4_reqsk_destructor()` | `kfree(ireq_opt)` | `kfree_rcu(ireq_opt, rcu)` |

- `kfree_rcu()` は、`rcu_read_lock()` の中の読み手が抜けるまで待ってから解放する。RCU は教材に無い。
- 読み手はもともと RCU を使っていて、`inet_opt` を置き換える `do_ip_setsockopt()` なども `kfree_rcu()` だった。揃っていなかったのは、この 2 か所の解放である。

### 配布の状況

| 配布元 | 10-30 23:30 JST の状態 |
|---|---|
| Debian | 修正済み。bookworm 6.1.190-1、trixie 6.12.113-1、forky 7.2.12-1、sid 7.2.13-1 |
| Ubuntu 26.04 | `linux` は 7.0.0-43.43 で `-proposed`（10-28）。`-updates` の 7.0.0-42.42 と `-security` の 7.0.0-38.38 に修正は無い |
| Ubuntu 24.04 | `linux` は 6.8.0-149.149、`-proposed`（10-26）。`linux-hwe-6.17`・`linux-hwe-7.0` は版の記載なし |
| Ubuntu 22.04 | `linux` は 5.15.0-203.213、`-proposed`（10-26）。`-security` の 5.15.0-202.212 に修正は無い |
| Ubuntu のほか | 20.04・18.04・16.04 は Vulnerable で版の記載なし。14.04 は影響なし。USN はまだ無い |
| RHEL | 8・9・10 は Affected で、修正のエラータは無い。6・7 は影響なし |

Ubuntu の 3 版は、changelog に修正の行があることを確かめた。26.04 の追跡のバグでは、検証が進行中で、`-updates` と `-security` への昇格は始まっていない。

## 層ごとの守り <!-- tab: 守り -->

| 守り | 層 | 章・場面 | 出どころと注意 |
|---|---|---|---|
| 修正版のカーネルに上げ、再起動する | カーネル | [9章 場面1][9-1] | 公式。Go の告知も最善と書く。再起動するまで古いカーネルのまま。コンテナはホストのカーネルで動くので、イメージの更新では直らない |
| IP オプション付きの TCP を落とす | IP | [18章 場面1][18-1] の段階6 | 未確認の暫定策。Go の担当者は issue で、十分かもしれないが確かめていないと書いた。Red Hat は基準を満たす緩和策は無いとする。オプションが無ければ読む物が確保されない（上流のソースで確かめた）。IGMP はオプションを使うので、TCP に限る |
| MPTCP の待ち受けを無くす | TCP | [19章 場面6][19-6] の段階4 | 実証された構成を外すだけ。Go の告知は、プログラムごとに切る方法は脆いと書く。Go は `GODEBUG=multipathtcp=0` で切れる |
| `net.mptcp.enabled=0` にする | TCP | [19章 場面6][19-6] の段階4 | 新しい MPTCP ソケットを作らせない。netns ごとの値で、ホストを 0 にしてもコンテナには及ばない（場面「この PC」）。既にあるソケットへの効果は文書に無い |
| 移行の機能を使わない | TCP | [19章 場面1][19-1] の段階2 | `net.ipv4.tcp_migrate_req` の既定は 0。BPF の `BPF_SK_REUSEPORT_SELECT_OR_MIGRATE` も同じ道を開く |
| 待ち受けへ届く範囲を絞る | ルーター | [14章 場面5][14-5] の段階1・4 | 一般論。ポート開放を閉じても、同じ LAN の機器からは届く。IPv6 で届く SYN は最初の欠陥の道に入らないが、`[::]` の待ち受けも IPv4 の SYN を受ける |

## この PC で確かめたこと <!-- tab: この PC -->

### 暫定策のルール

`--network none` の使い捨てコンテナで次のルールを入れ、loopback の待ち受けへ 1 回ずつつないだ。

```
table ip cve_2026_98432 {
  chain prerouting {
    type filter hook prerouting priority raw
    policy accept
    ip protocol tcp ip hdrlength != 5 counter drop
  }
}
```

| SYN | ルールなし | ルールあり |
|---|---|---|
| IP オプションなし | 接続できた | 接続できた |
| IP オプションあり（NOP だけ） | 接続できた | タイムアウト |

SYN が落ちることを確かめただけで、欠陥を防げることは確かめていない。競合は起こしていない。

### netns と MPTCP

- 親の netns を `net.mptcp.enabled=0` にすると、`socket(AF_INET, SOCK_STREAM, IPPROTO_MPTCP)` は `Protocol not available` で失敗した。`unshare -n` で作った子の netns の値は 1 で、ソケットを作れた。
- Docker 29.9.0（Go 1.26.9）のユーザー定義ネットワークのコンテナの netns には、`127.0.0.11` の MPTCP の待ち受けが 1 つあった。`127.0.0.11` は Docker の内蔵 DNS で、ループバックなので外からは届かない。コンテナの中に持ち主のプロセスが無いので、dockerd が開いたものと読める（推測）。
- この待ち受けは、ホストの `ss -M -l` には出ない。MPTCP の待ち受けは netns ごとに見る必要がある。

## 追って確かめること <!-- tab: 今後 -->

- Ubuntu の修正版が `-security` と `-updates` に載る日と USN。Livepatch が対応するか。
- RHEL の修正版の時期。IP オプションを落とす策を、ベンダーが認めるか。
- MPTCP の無い待ち受けで RCE に至る道があるか。Anthropic の PoC の第三者の再現と、MPTCP が要る理由。
- 公開された道具の実際の力、悪用の報告、KEV への掲載。
- IPv6 の移行の欠陥を直す別のパッチ。
- Go が既定を変えるか（[issue 82717](https://go.dev/issue/82717)）。

## 出典 <!-- tab: 出典 -->

### 公式の記録と修正

- CVE: [CVE の記録](https://www.cve.org/CVERecord?id=CVE-2026-98432)、[Linux の CVE の告知](https://git.kernel.org/pub/scm/linux/security/vulns.git/plain/cve/published/2026/CVE-2026-98432.mbox)、[NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-98432)
- コミット: [修正 e3f33b0a1d89](https://git.kernel.org/linus/e3f33b0a1d89d738e2b913dab519226eaf76e15b)、[原因 079096f103fa](https://git.kernel.org/linus/079096f103faca2dd87342cca6f23d4b34da8871)、[移行の原因 c905dee62232](https://git.kernel.org/linus/c905dee62232)
- 配布: [Ubuntu](https://ubuntu.com/security/CVE-2026-98432)、[7.0.0-43.43 の changelog](https://changelogs.ubuntu.com/changelogs/pool/main/l/linux/linux_7.0.0-43.43/changelog)、[追跡のバグ LP 2171676](https://bugs.launchpad.net/bugs/2171676)、[Debian](https://security-tracker.debian.org/tracker/CVE-2026-98432)、[Red Hat](https://access.redhat.com/security/cve/CVE-2026-98432)、[SUSE](https://www.suse.com/security/cve/CVE-2026-98432.html)
- 文書: [ip-sysctl](https://docs.kernel.org/networking/ip-sysctl.html)、[mptcp-sysctl](https://docs.kernel.org/networking/mptcp-sysctl.html)、[MPTCP](https://docs.kernel.org/networking/mptcp.html)
- 悪用の指標: [CISA の KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)、[FIRST の EPSS](https://api.first.org/data/v1/epss?cve=CVE-2026-98432)

### 研究者と開発者

- [Anthropic の記事（10-27）](https://www.anthropic.com/research/discovering-vulnerabilities-with-claude): PoC の 2 段と所要時間。
- [Go の告知（oss-security への転送、10-29）](https://www.openwall.com/lists/oss-security/2026/10/30/1): MPTCP の既定と切り方。
- [Go の issue 82717](https://go.dev/issue/82717): IP オプションを落とす案と、既定を変えるかの議論。

[6-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/06-cpu.html#s1
[9-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s1
[9-5]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s5
[9-6]: https://okayus.github.io/youtube-ga-mieru-made/chapters/09-os.html#s6
[14-5]: https://okayus.github.io/youtube-ga-mieru-made/chapters/14-router.html#s5
[18-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/18-ip.html#s1
[19-1]: https://okayus.github.io/youtube-ga-mieru-made/chapters/19-tcp.html#s1
[19-2]: https://okayus.github.io/youtube-ga-mieru-made/chapters/19-tcp.html#s2
[19-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/19-tcp.html#s3
[19-6]: https://okayus.github.io/youtube-ga-mieru-made/chapters/19-tcp.html#s6
[26-6]: https://okayus.github.io/youtube-ga-mieru-made/chapters/26-kata.html#s6
[27-3]: https://okayus.github.io/youtube-ga-mieru-made/chapters/27-algorithm.html#s3
