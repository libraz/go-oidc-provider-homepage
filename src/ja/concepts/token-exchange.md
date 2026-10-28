---
title: Token Exchange（RFC 8693）
description: あるトークンを別のトークンに交換する仕組み — 委譲となりすまし、`act` chain をやさしく解説。
pageClass: pg-concepts-token-exchange
---

# Token Exchange（RFC 8693）

現代のマイクロサービス構成では、**ユーザの代理として他のサービスを呼ぶ** 場面がほぼ必ずあります。frontend がトークンを取り、service A がそれを受け取り、service A が service B を呼ぶ。service A はユーザのトークンをそのまま使うべきか、新しく取り直すべきか、両方を組み合わせるべきか? RFC 8693 はこのトークン交換の通信路上の形式を定義します。

仕様は 2 つの意図を区別します。

- **Impersonation(なりすまし)** — service A はユーザだけを名乗るトークンを得て、**ユーザ本人として** 使う。service B からは `sub=alice` に見え、下流の監査ログには Alice 単独の操作として記録される。
- **Delegation(委譲)** — service A は `sub` が Alice のままで、**`act` claim** に `{sub: service-a}` が入ったトークンを得る。Alice の権限が service A 経由で行使されていることが記録される。service B からは `sub=alice, act={sub: service-a}` に見えて、chain に依存するポリシー判定（「service A は Alice の振込を実行してよいが、リクエスト元が Alice 自身からの場合に限る」）が可能になる。

近年の脅威モデルでは委譲のほうが望ましいとされています。監査の連鎖が途切れず、失効を中継 service 単位で当てられ、最小権限の境界が subject 全体に広がらず actor 単位で絞り込めるためです。**本ライブラリは、交換を実行した主体を必ず記録します。** `act` の付かないトークンができるのは自己交換だけです。自己交換とは、呼び出し元の client が `subject_token` の発行先 client と同じ場合です（自分のトークンを別の audience 向けに絞る場合など）。

::: details このページで触れる仕様
- [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693) — OAuth 2.0 Token Exchange
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators（`audience` / `resource` で使用）
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation(`cnf`)claim — 発行トークンを呼び出し actor の DPoP / mTLS 鍵に再バインド
:::

::: details 用語の補足
- **subject_token** — 新トークンの `sub` を決めるトークン。通常は上流から転送されてきたユーザのアクセストークン。アクセストークン（JWT / opaque）、JWT、ID トークンを受け付け、種別は `subject_token_type` で示す。
- **actor_token** — actor を示す任意の 2 つ目のトークン。付いていれば、新トークンの `act.sub` はこの検証済みトークンの `sub` になる。`subject_token` と同じ subject に解決されるものは使えない。
- **`act` claim**(RFC 8693 §4.1) — `sub` の代わりに行動している主体を記録する入れ子オブジェクト。入れ子にでき（`act.act.act…`）、複数ホップの呼び出しなら中継 service をすべて記録できる。本ライブラリでは最大 5 段まで。
- **`cnf` の結び付け** — リクエストが検証済みの DPoP proof または mTLS 証明書を持っていれば、発行トークンの `cnf`(RFC 7800 confirmation)はそこから設定される。`subject_token` 自身が送信者制約付きなら、同じ鍵を提示したリクエストだけが受理される。
:::

## 転送、交換、actor 付きの交換を並べて見る

<figure class="fig">
  <div class="fig-head">audience を変えられるのは交換だけで、転送は失敗する</div>
  <svg class="fig-svg" role="img" aria-labelledby="tx-modes-title" viewBox="0 0 960 984" xmlns="http://www.w3.org/2000/svg">
    <title id="tx-modes-title">中継サービスがユーザの代理で下流サービスを呼ぶ 3 通りの方法。元のトークンをそのまま転送すると audience が合わず失敗します。actor_token なしの交換では、ユーザを名乗りつつ呼び出し元の client を act claim に記録したトークンが得られます。actor_token ありの交換では、act claim に actor_token の subject が記録されます。</title>
    <!-- case bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="182" rx="8"/>
    <text class="fg-lbl fg-danger fg-halo" x="56" y="132">転送</text>
    <rect class="fg-group" x="32" y="310" width="896" height="310" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="338">actor_token なしの交換</text>
    <rect class="fg-group" x="32" y="644" width="896" height="310" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="672">actor_token ありの交換</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="960"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="960"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="960"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">中継</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">認可サーバ</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">リソース</text>
    <!-- forwarding -->
    <path class="fg-edge fg-edge--danger" d="M192,206 H824" marker-end="url(#fg-ad)"/>
    <text class="fg-m fg-halo" x="508" y="172" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <text class="fg-mxs fg-halo" x="508" y="194" text-anchor="middle">sub=alice · aud=service-a</text>
    <path class="fg-edge fg-edge--danger" d="M824,262 H192" marker-end="url(#fg-ad)"/>
    <text class="fg-edge-lbl fg-danger fg-halo" x="508" y="252" text-anchor="middle">401 · aud が service-a で service-b ではない</text>
    <!-- exchange -->
    <path class="fg-edge" d="M192,412 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="378" text-anchor="middle">grant_type=…:token-exchange</text>
    <text class="fg-mxs" x="352" y="400" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M512,484 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="450" text-anchor="middle">sub=alice · aud=service-b</text>
    <text class="fg-mxs" x="352" y="472" text-anchor="middle">act={ sub: service-a }</text>
    <path class="fg-edge" d="M192,548 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="538" text-anchor="middle">Bearer sub=alice · act={ sub: service-a }</text>
    <rect class="fg-pill fg-pill--ok" x="536" y="564" width="272" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="672" y="585" text-anchor="middle">act.sub は呼び出し元の client_id</text>
    <!-- exchange with actor_token -->
    <path class="fg-edge" d="M192,746 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="712" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <text class="fg-mxs" x="352" y="734" text-anchor="middle">actor_token=&lt;service-a&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M512,818 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="784" text-anchor="middle">sub=alice · aud=service-b</text>
    <text class="fg-mxs" x="352" y="806" text-anchor="middle">act={ sub: service-a }</text>
    <path class="fg-edge" d="M192,882 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="872" text-anchor="middle">Bearer sub=alice · act={ sub: service-a }</text>
    <rect class="fg-pill fg-pill--ok" x="536" y="898" width="272" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="672" y="919" text-anchor="middle">act.sub は actor_token の sub</text>
  </svg>
  <figcaption class="fig-note">転送は audience が合わず失敗します。どちらの交換でも「service A を経由した alice」を表すトークンが得られ、違いは actor の名前の出どころだけです。認証された呼び出し元の client か、検証済みの <code>actor_token</code> かです。</figcaption>
</figure>

service B は監査ログで呼び出しの起点を把握でき、センシティブな操作では特定の service からの `act` を要求できます。

## OP が強制すること

仕様がデプロイ側のポリシーに委ねている項目のうち、本ライブラリの RFC 8693 ハンドラはいくつかについて独自の方針を採っています。

- **`act` chain は OP 側で構築する**。呼び出し側が手で渡すのではない。何が入るかは下の表のとおり。呼び出し側に `act` を捏造させず、ポリシーの `ExtraClaims` でも上書きできない。
- **audience は正規化して許可リストで制限する**。RFC 8707 の `audience` / `resource` パラメータは policy の評価前に正規化します。両方を省略した場合は `subject_token` の audience を既定値として使います。得られた audience はすべて、呼び出し client に登録された `Resources` に含まれていなければなりません。`Resources` が空の client にはどの audience も発行できません（`invalid_target`）。
- **scope は縮める方向にしか動かない**。`scope` を省略すると `subject_token` の scope になります。呼び出し client に登録されていない scope は落とされ、`subject_token` の scope を超える要求は `invalid_scope` で拒否されます。結果が空の場合も `invalid_scope` です。
- **TTL は上限で頭打ちにする**。ポリシーの `GrantedTTL`（未指定なら OP のアクセストークン上限）と、`subject_token` の残り寿命のうち小さいほうまで切り詰められる。長寿命トークンをさらに長いトークンへ伸ばすロンダリングはできない。`subject_token` の期限判定には OP の時計ずれ許容（leeway）が適用される。
- **返るのはアクセストークンだけ**。`requested_token_type` は省略するかアクセストークンの URN のみ。リフレッシュトークンは、ポリシーが `IssueRefreshToken: op.PtrBool(true)` でオプトインしたときだけ発行される。ID トークンは、`subject_token` が ID トークンだった場合（またはポリシーが強制した場合）に限る。
- **`cnf` はリクエストの proof に従う**。service A が交換リクエストに DPoP proof を提示すれば、発行トークンの `cnf.jkt` は service A の鍵になる。`subject_token` がすでに結び付けられている場合は同じ鍵の提示が必要なので、盗まれた結び付き済みトークンは交換できない。

これらは組み込み側が提供する [`TokenExchangePolicy`](https://github.com/libraz/go-oidc-provider/blob/main/op/tokenexchange.go) が呼ばれる **前** に強制されます。ポリシー側はさらに絞り込むこと（特定 audience を拒否、特定の actor 組み合わせを拒否など）はできますが、広げることはできません。要求を超える scope や audience を許可する decision は拒否されます。

| リクエスト | 発行トークンの `act` |
|---|---|
| `actor_token` あり | `{ sub: <actor_token の sub>, act: <subject_token にあった以前の chain> }` |
| `actor_token` なし、呼び出し client が `subject_token` の発行先 client と異なる | `{ sub: <呼び出し client の client_id>, act: <以前の chain> }` |
| `actor_token` なし、同じ client（自己交換） | 以前の chain をそのまま引き継ぐ（無ければ `act` なし） |

5 段を超える chain は、ポリシーの実行前に `invalid_grant` で拒否されます。交換で発行されたトークンは `subject_token` の発行元 grant に属するため、その grant を失効させると（`RevokeSubject`、grant management、`/end_session` の後始末）交換トークンも失効します。交換で得たリフレッシュトークンも、subject が削除または停止された時点でローテーションできなくなります。`client_credentials` のトークンのように grant を持たない `subject_token` には、この系譜はありません。pairwise client に発行された ID トークンは交換できません。

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

[`examples/33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation) は frontend → service-a → service-b の chain を実演します。frontend が認可コードフローでユーザトークンを取得し、service-a が `actor_token` なしでそれを `act={sub: service-a}`・`aud=service-b` のトークンに交換し、service-b のリソースサーバ側 verifier が `act.sub` をたどって、`act` を持つトークンのみを受理します。`service-a` には `GrantTypes` に token-exchange の URN、`Resources` に両方の audience が登録されています。交換にはこの登録が必要です。

```sh
(cd examples/33-token-exchange-delegation && GOWORK=off go run -tags example .)
```

example はロール別ファイルに分割されています（`op.go` で OP の組み立て + `TokenExchangePolicy`、`service_a.go` で中継、`service_b.go` で resource server、`probe.go` で self-verification）。

## 続きはこちら

- [ユースケース: token-exchange の組み込み](/ja/use-cases/token-exchange) — `op.RegisterTokenExchange`、`TokenExchangePolicy` の契約、audience の構成、`op.PtrBool(true)` による refresh 発行のオプトイン。
- [Custom Grant の組み込み](/ja/use-cases/custom-grant) — token exchange は OP がルーティングする「カスタム grant_type」の同梱例。独自 URN を書く組み込み側は `op.WithCustomGrant` 経由で同じ形をたどる。
