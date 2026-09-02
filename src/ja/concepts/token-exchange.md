---
title: Token Exchange（RFC 8693）
description: あるトークンを別のトークンに交換する仕組み — 委譲となりすまし、`act` chain をやさしく解説。
pageClass: pg-concepts-token-exchange
---

# Token Exchange（RFC 8693）

現代のマイクロサービス構成では、**ユーザの代理として他のサービスを呼ぶ** 場面がほぼ必ずあります。frontend がトークンを取り、service A がそれを受け取り、service A が service B を呼ぶ。service A はユーザのトークンをそのまま使うべきか、新しく取り直すべきか、両方を組み合わせるべきか? RFC 8693 はこのトークン交換の通信路上の形式を定義します。

設計上、2 つの意図を本質的に区別します:

- **Impersonation(なりすまし)** — service A はユーザのトークンをそのまま service B に提示する。**ユーザ本人として** ふるまう。service B からは `sub=alice` に見え、下流の監査ログには Alice 単独の操作として記録される。
- **Delegation(委譲)** — service A は OP に対し新しいトークンの発行を依頼する。`sub` はやはり Alice だが、**`act` claim** に `{sub: service-a}` が入り、Alice の権限が service A 経由で行使されていることを記録する。service B からは `sub=alice, act={sub: service-a}` に見えて、chain に依存するポリシー判定（「service A は Alice の振込を実行してよいが、リクエスト元が Alice 自身からの場合に限る」）が可能になる。

近年の脅威モデルでは委譲（delegation）のほうが望ましいとされています。監査の連鎖が途切れず、失効を中継 service 単位で当てられ、最小権限の境界が subject 全体に広がるのではなく actor 単位で絞り込めるためです。

::: details このページで触れる仕様
- [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693) — OAuth 2.0 Token Exchange
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators（`audience` / `resource` で使用）
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation(`cnf`)claim — 発行トークンを呼び出し actor の DPoP / mTLS 鍵に再バインド
:::

::: details 用語の補足
- **subject_token** — 新トークンの `sub` を構成する identity の保持者となるトークン。通常は上流から転送されてきたユーザのアクセストークン。
- **actor_token** — 交換を実行する呼び出し元（service）を識別するトークン。存在すると新トークンには `act` claim が付与され、actor の `sub` / `client_id` がそこに包まれる。
- **`act` claim**(RFC 8693 §4.1) — `sub` の代わりに行動している主体を記録する入れ子オブジェクト。連鎖でき（`act.act.act…`）、4 ホップの呼び出しなら 4 つの中継 service をすべて記録できる。
- **`cnf` の再バインド** — 発行トークンの `cnf`(RFC 7800 confirmation)は、subject ではなく **呼び出し actor** の DPoP / mTLS proof に設定される。トークンは交換を実行する service に対して送信者制約が掛かる（sender-bound）。
:::

## なりすまし（Impersonation）と委譲（Delegation）を並べて見る

<figure class="fig">
  <div class="fig-head">転送・なりすまし・委譲</div>
  <svg class="fig-svg" role="img" aria-labelledby="tx-modes-title" viewBox="0 0 960 606" xmlns="http://www.w3.org/2000/svg">
    <title id="tx-modes-title">中継サービスがユーザの代理で下流サービスを呼ぶ 3 通りの方法。元のトークンをそのまま転送すると audience が合わず失敗します。なりすましの交換ではユーザだけを名乗るトークンが得られます。委譲の交換ではユーザを名乗りつつ、中継サービスを act claim に記録したトークンが得られます。</title>
    <!-- 帯 -->
    <rect class="fg-group" x="30" y="70" width="916" height="126" rx="8"/>
    <rect class="fg-group" x="30" y="206" width="916" height="180" rx="8"/>
    <rect class="fg-group" x="30" y="396" width="916" height="196" rx="8"/>
    <text class="fg-lbl fg-danger" x="42" y="88">単純な転送 — 交換なし</text>
    <text class="fg-lbl" x="42" y="224">なりすまし（impersonation）の交換</text>
    <text class="fg-lbl fg-accent" x="42" y="414">委譲（delegation）の交換</text>
    <!-- ライフライン -->
    <line class="fg-life" x1="110" y1="62" x2="110" y2="592"/>
    <line class="fg-life" x1="370" y1="62" x2="370" y2="592"/>
    <line class="fg-life fg-life--accent" x1="620" y1="62" x2="620" y2="592"/>
    <line class="fg-life" x1="860" y1="62" x2="860" y2="592"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="35" y="16" width="150" height="42" rx="6"/>
    <text class="fg-t" x="110" y="35" text-anchor="middle">Frontend</text>
    <text class="fg-xs" x="110" y="49" text-anchor="middle">ブラウザ</text>
    <rect class="fg-box" x="295" y="16" width="150" height="42" rx="6"/>
    <text class="fg-t" x="370" y="35" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="370" y="49" text-anchor="middle">中継</text>
    <rect class="fg-box fg-box--accent" x="540" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="620" y="35" text-anchor="middle">OP</text>
    <text class="fg-xs" x="620" y="49" text-anchor="middle">認可サーバー</text>
    <rect class="fg-box" x="785" y="16" width="150" height="42" rx="6"/>
    <text class="fg-t" x="860" y="35" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="860" y="49" text-anchor="middle">リソース</text>
    <!-- 転送 -->
    <path class="fg-edge" d="M110,112 H370" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="240" y="106" text-anchor="middle">Bearer sub=alice · aud=service-a</text>
    <path class="fg-edge fg-edge--danger" d="M370,152 H860" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs fg-halo" x="615" y="146" text-anchor="middle">同じトークンをそのまま転送する</text>
    <path class="fg-edge fg-edge--danger" d="M860,172 h-28 v16 h28" marker-end="url(#fg-ad)"/>
    <text class="fg-xs fg-danger" x="820" y="184" text-anchor="end">aud が service-a で自分宛てではない → 401</text>
    <!-- なりすまし -->
    <path class="fg-edge" d="M110,250 H370" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="240" y="244" text-anchor="middle">Bearer sub=alice</text>
    <path class="fg-edge" d="M370,290 H620" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="495" y="270" text-anchor="middle">grant_type=…:token-exchange</text>
    <text class="fg-mxs" x="495" y="283" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M620,320 H370" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="495" y="314" text-anchor="middle">sub=alice · aud=service-b</text>
    <path class="fg-edge" d="M370,356 H860" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="615" y="350" text-anchor="middle">Bearer sub=alice</text>
    <text class="fg-xs fg-warn" x="860" y="378" text-anchor="end">B から見れば alice が単独で行ったことになる</text>
    <!-- 委譲 -->
    <path class="fg-edge" d="M110,440 H370" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="240" y="434" text-anchor="middle">Bearer sub=alice</text>
    <path class="fg-edge" d="M370,482 H620" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="495" y="462" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <text class="fg-mxs" x="495" y="475" text-anchor="middle">actor_token=&lt;service-a&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M620,514 H370" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="495" y="508" text-anchor="middle">sub=alice · act={ sub: service-a }</text>
    <path class="fg-edge" d="M370,552 H860" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="615" y="546" text-anchor="middle">Bearer sub=alice · act={ sub: service-a }</text>
    <text class="fg-xs fg-ok" x="860" y="576" text-anchor="end">B は「service-a 経由の alice」を見て、自分のポリシーで判断する</text>
  </svg>
  <figcaption class="fig-note">2 番目と 3 番目の構造上の違いは <code>actor_token</code> だけです。パラメータ 1 つの差で、監査ログが「alice が行った」と記録するか「alice が service A を経由して行った」と記録するかが変わります。</figcaption>
</figure>

差は監査ログ（service B が呼び出しの起点を知れる）と認可ポリシー（センシティブな操作で actor を要求できる）に現れます。

## OP が強制すること

仕様がデプロイ側のポリシーに委ねている項目のうち、本ライブラリの RFC 8693 ハンドラはいくつかについて独自の方針を採っています:

- **`act` chain は OP 側で構築する**。呼び出し側が手で渡すのではない。`actor_token` が `subject_token` と異なる場合、OP は actor の検証済み credential から `act` を構成する。呼び出し側に `act` を捏造させない。
- **audience は正規化して許可リストで制限する**。RFC 8707 の `audience` / `resource` パラメータは policy の評価前に正規化します。両方を省略した場合は subject token の audience を既定値として使います。得られた audience はすべて client が認可されていなければなりません。
- **scope は積集合（intersection）**。和集合（union）ではない。発行トークンの scope は（要求 scope、`subject_token` の scope、呼び出し client の許可リスト）の積集合。RFC 8693 §3.1 は scope の縮小は許すが、OP は scope の膨張（inflation）を禁止する。
- **TTL は上限で頭打ちにする**。（handler 希望、`subject_token` の残り寿命、OP のグローバル上限）の最小値まで切り詰められる。長寿命トークンをさらに長いトークンへ伸ばすロンダリングはできない。
- **`cnf` は呼び出し actor に再バインドする**。service A が交換リクエストに DPoP proof を提示すれば、発行トークンの `cnf.jkt` は service A の DPoP 鍵に一致する — ユーザのものでも `subject_token` のものでもない。service B は新トークンの `cnf` に対して DPoP proof を検証する。

これらは組み込み側が提供する [`TokenExchangePolicy`](https://github.com/libraz/go-oidc-provider/blob/main/op/tokenexchange.go) が呼ばれる **前** に強制されます。ポリシー側はさらに絞り込むこと（特定 audience を拒否、特定の actor 組み合わせを拒否など）はできますが、広げることはできません — OP が計算したデフォルトが下限です。

### resource と audience の正規化

OP は、token exchange とその他の resource indicator を扱う箇所で、URI 形式の `resource` / `audience` を同じ比較形へ正規化します。URI 形式の値は scheme と host を持つ絶対 URI でなければなりません。OP は scheme と host を小文字化し、既定 port（`http` の `80`、`https` の `443`）を取り除き、path 末尾の slash を取り除きます。path の大文字・小文字は保持し、query と既定でない port は入力どおり保持します。fragment と userinfo は拒否するため、`https://trusted@example.com/api` や `https://api.example.com/api#v1` は許可リストの値と一致しません。

たとえば `https://API.Example.com:443/v1/?tenant=acme` は `https://api.example.com/v1?tenant=acme` として比較されます。リクエストが `audience` と `resource` の両方を省略した場合は、subject token の audience を同じ規則で正規化して引き継ぎます。URI 形式ではない logical audience label（URN を含みます）は byte 完全一致で比較し、OP は小文字化などの書き換えを行いません。

## 実際に必要になるとき

Token exchange が **不要** な場合:

- 両 service を同じチームが所有し暗黙に信頼している。ユーザのトークンをそのまま multi-`aud` で使う。
- 下流 service が上流 actor を知る必要がない。ユーザのトークンを適切な `aud` で受け渡す。

Token exchange が **必要** な場合:

- 下流 service が **chain に誰がいるか** に応じてポリシーを適用する — 「振込 service はモバイルアプリを信頼するが SMS bot は信頼しない、Alice として呼ばれていても」。
- chain にサードパーティ service が含まれていて、cross-org actor の記録が audit 義務として必要。
- Sender-binding（DPoP / mTLS）を、ユーザではなく **呼び出し service** に追従させたい。

## 動かしてみる

[`examples/33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation) は frontend → service-a → service-b の chain を実演します。frontend がユーザトークンを取得、service-a がそれを委譲付きトークン（`act={sub: service-a}` を伴う）に交換、service-b の RS 側 verifier が `act.sub` をたどって委譲付きトークンのみを受理します。

```sh
(cd examples/33-token-exchange-delegation && GOWORK=off go run -tags example .)
```

example はロール別ファイルに分割されています（`op.go` で OP の組み立て + `TokenExchangePolicy`、`service_a.go` で中継、`service_b.go` で resource server、`probe.go` で self-verification）。

## 続きはこちら

- [使い方: token-exchange の組み込み](/ja/use-cases/token-exchange) — `op.RegisterTokenExchange`、`TokenExchangePolicy` の契約、audience の構成、`op.PtrBool(true)` による refresh 発行のオプトイン。
- [Custom Grant の組み込み](/ja/use-cases/custom-grant) — token exchange は OP がルーティングする「カスタム grant_type」の同梱例。独自 URN を書く組み込み側は `op.WithCustomGrant` 経由で同じ形をたどる。
