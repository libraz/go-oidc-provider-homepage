---
title: Hot/Cold 分離（Redis 揮発）
description: 揮発サブストアを Redis に、永続サブストアを SQL にルートする — 標準的な本番構成。
pageClass: pg-use-cases-hot-cold-redis
---

# ユースケース — Hot/Cold 分離（Redis 揮発）

## 「Hot / Cold」とは

OP が抱える状態は、性質が大きく異なる 2 種類に分かれます:

- **Cold (永続)** — 失うわけにはいかない行: 登録クライアント、ユーザレコード、grant、リフレッシュトークンチェーン、アクセストークンの失効記録。
- **Hot (揮発)** — 高頻度で生成され短時間で陳腐化し、失ってもユーザがやり直せば済む行: ログイン途中のインタラクション状態（失ったユーザはログインをやり直します）と、キャッシュ消失後の再認証を許容するなら、ブラウザのセッション。

両方を同じバックエンドに乗せるのは無駄です — 永続ストアに hot 由来の QPS は必要ありませんし、揮発ストアに cold が要求する耐久性は必要ありません。composite アダプタは両者を分離します。

短寿命でも、この区分に従わないデータが 2 つあります。どちらも下の表で具体的に示します。PAR の `request_uri`（RFC 9126）は短寿命ですが、OP はこれをアトミックな認可コードの経路の中で消費するため、トランザクションクラスタに属し、永続側に残ります。消費済み `jti` の再利用防止セット（RFC 7519）も短寿命ですが、有効なマーカーが追い出されると、守るはずの再利用検知の窓が再び開きます。そのため永続バックエンドか、追い出しをしない Redis インスタンスが必要です。データの寿命は保存先の目安にすぎず、クラスタの不変条件と、失ったときの損失が保存先を決めます。

::: details このページで触れる仕様
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests（PAR — `request_uri` は短寿命だがトランザクションクラスタ内で消費される）
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT、`jti` を含む（再利用防止セット）
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — セッション状態
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — ログアウト時の 一斉通知
:::

::: details 用語の補足
- **耐久性方針（durability posture）** — サブストアがプロセス再起動やレプリカフェイルオーバを跨いで *残らなければならない* かどうか。リフレッシュトークンチェーン、登録クライアント、grant、再利用防止セットは永続側です。進行中のインタラクション状態は失っても差し支えなく、セッションは組み込み側の判断です。
- **トランザクションクラスタ** — アトミックに commit が必要なサブストアの集合（例: `auth_code` 発行と対応するリフレッシュトークン chain）。バックエンドを跨いで分けると「片方は永続に書かれ、もう片方は揮発で消えた」中途半端な状態が生じうるため、composite コンストラクタはクラスタを分割する設定を拒否します。
- **`jti`** — JWT の一意識別子（RFC 7519）。OP は JWT を運ぶ各経路（request object、client assertion、DPoP proof）ごとに「消費済み JTI」セットを保持し、再利用を防ぎます。各マーカーは短い TTL で自然に失効しますが、それまでは残っていなければなりません。早く追い出されると、盗まれた proof を再利用できてしまうためです。永続バックエンドか、`maxmemory-policy noeviction` の Redis インスタンスを使ってください。
:::

`op/storeadapter/composite` が分岐点です。永続ストアと揮発ストアを受け取り、各サブストアを適切な側にルーティングします。トランザクションクラスタ（同時にコミットする必要があるサブストア群）を割らない構成のみが許容されます。

> **ソース:**
> - [`examples/08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold) — SQLite 永続 + in-memory 揮発。`go run -tags example .` 1 行で起動可能。
> - [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) — MySQL 永続 + Redis 揮発（セッションとインタラクション）。`mysql:8.4` と `redis:7.4-alpine` に固定された docker-compose スタックとして同梱されており、アダプタの契約テストと同じエンジンバージョンを使います。

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">ストアインタフェースは 1 つ、その裏に 2 つのバックエンド</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-hotcold-title" viewBox="0 0 960 272" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-hotcold-title">composite アダプタが各サブストアの行き先を振り分けます。永続すべきものは SQL へ、書き換えが激しく揮発してよいものは Redis へ。OP から見えるストアはどちらの場合も 1 つです。</title>
    <!-- provider -->
    <rect class="fg-box" x="32" y="100" width="200" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="128">op.Provider</text>
    <text class="fg-xs" x="48" y="152">ストアは 1 つ</text>
    <path class="fg-edge" d="M232,136 H280" marker-end="url(#fg-a)"/>
    <!-- composite -->
    <rect class="fg-box fg-box--accent" x="280" y="100" width="200" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="296" y="128">composite</text>
    <text class="fg-xs" x="296" y="152">行き先を振り分ける</text>
    <!-- routes -->
    <path class="fg-leader" d="M480,136 H520 M520,72 V200"/>
    <path class="fg-edge" d="M520,72 H720" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="620" y="62" text-anchor="middle">永続サブストア</text>
    <path class="fg-edge" d="M520,200 H720" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="620" y="190" text-anchor="middle">揮発サブストア</text>
    <!-- mysql -->
    <rect class="fg-box" x="720" y="24" width="208" height="96" rx="8"/>
    <text class="fg-t2" x="736" y="52">MySQL</text>
    <text class="fg-mxs" x="736" y="76">storeadapter/sql</text>
    <text class="fg-xs" x="736" y="100">再起動しても残る</text>
    <!-- redis -->
    <rect class="fg-box" x="720" y="152" width="208" height="96" rx="8"/>
    <text class="fg-t2" x="736" y="180">Redis</text>
    <text class="fg-mxs" x="736" y="204">storeadapter/redis</text>
    <text class="fg-xs" x="736" y="228">失われる前提で扱う</text>
  </svg>
  <figcaption class="fig-note">分け方の基準は、消えたときに何を失うかです。セッションや途中のログインはユーザに再ログインしてもらえば作り直せますが、grant はそうはいきません。</figcaption>
</figure>

composite ストアはトランザクションクラスタの不変条件を強制します。一緒にアトミックコミットが必要なサブストア（例: `AuthorizationCodeStore` と `RefreshTokenStore`）は **同じバックエンドに置く必要があります**。クラスタを分割する設定は、`composite.New` が `composite.ErrTxClusterSplit` で拒否します。

## コード

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/composite"
  oidcredis "github.com/libraz/go-oidc-provider/op/storeadapter/redis"
  oidcsql "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
)

durable, err := oidcsql.New(db, oidcsql.MySQL())
if err != nil { /* ... */ }

volatile, err := oidcredis.New(context.Background(),
  oidcredis.WithDSN("rediss://redis:6380/0"), // 既定で TLS 必須
  oidcredis.WithRedisAuth(redisUsername, redisPassword),
)
if err != nil { /* ... */ }

// WithDefault がすべての Kind を永続バックエンドに割り当て、
// With(kind, store) で個別のサブストアを上書きします。ConsumedJTIs は
// 既定のままにします。再利用防止マーカーは追い出されてはならないためです
// （「Redis サーバの要件」を参照）。composite.TxClusterKinds を別
// バックエンドに分割する構成は composite.New が拒否します。
combined, err := composite.New(
  composite.WithDefault(durable),
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
)
if err != nil { /* ... */ }

loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: durable.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(combined),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithGrants(grant.AuthorizationCode, grant.RefreshToken),
  op.WithStaticClients(op.PublicClient{
    ID:           "demo-rp",
    RedirectURIs: []string{"https://rp.example.com/callback"},
    Scopes:       []string{"openid", "profile"},
  }),
)
```

## 構築時の検証と期限切れ write

`composite.New` は route を構築する前に閉じた `Kind` の集合を検証します。`With` に未知の integer を渡すと `New` は `composite.ErrInvalidKind` を返し、その値を `WithDefault` に黙って流しません。有効なすべての `Kind` は override または default に解決できなければならず、解決できない場合は `composite.ErrKindNotRouted` を返します。`composite.TxClusterKinds` の全メンバーは同じ backend に解決し、その動的型は comparable でなければなりません。map、slice、function を含む value store は `composite.ErrBackendNotComparable` で拒否されるため、そのような store は pointer 経由で route してください。共有する transaction anchor は `store.Transactional` を実装する必要があり、そうでなければ `composite.ErrTxAnchorNotTx` を返します。

`store.SessionStore.Save` と `store.InteractionStore.Save` は、有効な record がない場合はすでに期限切れの record を保存しないこともできます。ただし有効な record がある場合、過去の時刻を持つ replacement も反映しなければなりません。Save 成功後の `Find` が以前の有効な record を返してはいけません。Redis adapter はすでに期限切れの input なら古い key を削除し、期限切れ row を残す adapter も read 時に除外します。期限切れの replacement を黙って no-op にすると、古い session や interaction が有効なまま残ります。

::: info composite を介した静的クライアントのシード
`op.WithStaticClients` は `*composite.Store` を直接受け取れるので、composite で包む前に永続バックエンドへ直接シードする必要はありません。

composite は意図的に `store.ClientRegistry` や `store.StaticClientReconciler` を型アサーションでは満たしません。read-only にルートされた `Clients` バックエンドが、暗黙のうちに書き込み可能なものに流用されるのを防ぐためです。代わりに、オプショナルな `ClientRegistry()` と `StaticClientReconciler()` のアクセサを公開し、`op.New` が組み立て時にこれらを確認します。ルート先の `Clients` バックエンドが突合に対応していない場合、`op.New` は `store.StaticClientReconciler` を挙げたエラーで `WithStaticClients` を拒否します。
:::

## Redis のセキュリティ既定

::: warning 既定で保護のない Redis を許さない
`oidcredis.New` は TLS（`rediss://`）と AUTH 無しでは **起動を拒否** します。セッションとインタラクションの状態を平文で流す構成を出荷させないためです。例外口 `oidcredis.WithDevModeAllowPlaintext(callback)` は `examples/` 実行とローカル開発のためだけにあります。本番で使うのは、手で打ち込まないと出てこないセキュリティ後退の選択肢です。
:::

## Redis サーバの要件

Redis アダプタには Redis 7.0 以降が必要です（セッションの chooser group インデックスが `EXPIRE ... NX` と `EXPIRE ... GT` を使うため）。認証に使う資格情報には、キー空間の読み書きだけでなく次の権限も要ります。足りないと、アダプタは構築も接続もできるのに、そのコマンドが必要な最初のリクエストで失敗します。

- `+@scripting` — 再利用防止マーカーとインタラクションの compare-and-swap は Lua スクリプトです。
- `+@string`、`+@keyspace`、`+@set`、`+@hash`、`+@transaction` — キーの読み書き、chooser group の set、メタデータの hash、セッション書き込みの `MULTI` / `EXEC`。
- `+@connection` — コンストラクタが早期に失敗を検出するために使う `PING`。

追い出しポリシーは、同じインスタンスに載せるサブストアによって変わります。

| インスタンスに載せるサブストア | 使える `maxmemory-policy` | 理由 |
|---|---|---|
| `Sessions`、`Interactions` のみ | `volatile-*` または `allkeys-*` | 行を失うコストは、ユーザの再ログインだけ |
| さらに `ConsumedJTIs` | `noeviction` | 有効な再利用防止マーカーが追い出されると、盗まれた DPoP や `private_key_jwt` の proof が期限まで再利用できる |
| さらに `Metadata` | `allkeys-*` は不可 | このキーは subject 発行モードを保持し、TTL を持たない。失うと public / pairwise の切り替え検査が無効になる |

`ConsumedJTIs` が `noeviction` を要求するので、最も単純な構成は example のとおり、これを永続側に置くことです。Redis の `Store` が実装するのはこの 4 つのサブストアだけで、ほかのアクセサは `nil` を返します。そのため単独では `op.WithStore` に渡せず、常に `composite` で永続バックエンドと組み合わせます。

## 既定の分離

| サブストア | 保存先 |
|---|---|
| `ClientStore` | 永続（SQL） |
| `UserStore` | 永続（SQL） |
| `AuthorizationCodeStore` | 永続（SQL — 短寿命だがトランザクションクラスタ内） |
| `RefreshTokenStore` | 永続（SQL） |
| `GrantStore` | 永続（SQL — トランザクションクラスタ内） |
| `AccessTokenRegistry` | 永続（SQL — `RevocationStrategyJTIRegistry` を選んだときだけ書き込まれる） |
| `OpaqueAccessTokenStore` | 永続（SQL — opaque アクセストークン形式を有効にしたときだけ書き込まれる） |
| `GrantRevocationStore` | 永続（SQL — 既定の grant-tombstone 失効戦略を支えるストア） |
| `PushedAuthRequestStore` | 永続（SQL — `request_uri` は短寿命だがトランザクションクラスタ内） |
| `ConsumedJTIStore` | 永続（SQL）。Redis に置けるのは `noeviction` のインスタンスだけ |
| `MetadataStore` | 既定は永続（SQL）。Redis に置く場合は TTL なしで保持される |
| `DeviceCodeStore`、`CIBARequestStore`、登録トークン系のストア | 永続（SQL — Redis アダプタは実装していない） |
| `InteractionStore` | 揮発（Redis） |
| `SessionStore` | `composite.With(composite.Sessions, ...)` でどちらの保存先にもルートできる。`WithSessionDurabilityPosture`(既定 `SessionDurabilityVolatile`) では logout の起点と session snapshot の耐久性を宣言し、BCL の target 自体は grant 由来で解決する |

::: info 短寿命でも永続側に残るサブストアがある理由
`PushedAuthRequestStore`、`OpaqueAccessTokenStore`、`GrantRevocationStore` はトランザクションクラスタ（`composite.TxClusterKinds`。ほかに認可コード、grant、リフレッシュトークン、アクセストークン registry を含む）の一部で、起点となる書き込みと同じ整合性ドメインでコミット / CAS 更新が行われます。PAR は直感に反する例です。保持する `request_uri` は短寿命で入れ替わりが激しく、一見すると揮発状態に見えますが、OP はこれを認可コード発行の経路の中で消費するため、別バックエンドに分けるとその整合性ドメインが割れてしまいます。Redis アダプタはこれらのアクセサすべてから `nil` を返すので、composite は Redis にルートできません。PAR を有効にしたプロファイルでルート先の `PushedAuthRequests()` が `nil` なら、`op.New` は起動を拒否します。既定の失効戦略（`RevocationStrategyGrantTombstone`）も `GrantRevocations()` が nil 以外であることを要求します。`op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` を明示すれば後者の要件は外せますが、FAPI プロファイルは `None` を拒否するため、非 FAPI に限られます。
:::

::: details SessionStore がどちらにもなる理由
揮発セッションストア（メモリ圧で追い出される、複製保証無し）は、多くの構成で許容範囲です — 最悪ケースでもユーザの再認証で済みます。一方、ブラウザのログイン状態と logout の起点 / session snapshot を再起動後も保持したい組み込み側は、より強い耐久性を求めます。ルーティング自体は組み込み側の選択で、`composite.With(composite.Sessions, durableOrVolatileStore)` で行います。`op.WithSessionDurabilityPosture(SessionDurabilityVolatile | SessionDurabilityDurable)` はライブラリ側で強制しない *宣言* で、logout の起点 / session snapshot の耐久性を示すものであり、BCL の audience を示すものではありません。`/end_session` は通知前に session を snapshot し、eligible な RP target は `GrantStore.ListClientIDsBySubject` から独立して grant 由来で解決します。`bcl.no_sessions_for_subject` は session を伴う logout 通知で grant 由来の RP target が 0 件だったことを示します。snapshot 前に eviction が起きた場合は back-channel 通知も監査イベントも発生しません。SOC dashboard では、起点 / snapshot の耐久性に関する欠落と grant 由来 zero-target event を別の概念として扱ってください。
:::

## 観測性

揮発側のヒット率、キャッシュの追い出し、SQL プール統計は、それぞれのバックエンドが提供するメトリクス（`redis_*` exporter、SQL プールメトリクス）で出すのが最適です — OP はそこに重複しません。OP は `op.WithPrometheus` に渡した registry に *業務系* カウンタ（トークン発行、refresh rotation、監査イベント）を発行します。
