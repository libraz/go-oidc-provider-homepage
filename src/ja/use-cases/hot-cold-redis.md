---
title: Hot/Cold 分離（Redis 揮発）
description: 揮発サブストアを Redis に、永続サブストアを SQL にルートする — 標準的な本番構成。
---

# 使い方 — Hot/Cold 分離（Redis 揮発）

## 「Hot / Cold」とは

OP が抱える状態は、性質が大きく異なる 2 種類に分かれます:

- **Cold (永続)** — 失うわけにはいかない長寿命の行: 登録クライアント、ユーザレコード、リフレッシュトークンチェーン、永続セッション。
- **Hot (揮発)** — 高頻度で生成され短時間で陳腐化する行: PAR の `request_uri`（RFC 9126）、消費済み JTI 再利用防止セット（RFC 7519）、ログイン途中のインタラクション状態。失っても再ログインで済むものです。

両方を同じバックエンドに乗せるのは無駄です — 永続ストアに hot 由来の QPS は必要ありませんし、揮発ストアに cold が要求する耐久性は必要ありません。composite アダプタは両者を分離します。

下の表が正確にする一点があります: *揮発的な性質* のデータと *揮発側への配置* は別の軸です。短寿命の状態の多く(JTI 再利用防止セット、インタラクション状態)は揮発側にルートされますが、PAR の `request_uri` はそうではありません — 単体では失っても差し支えない一方、OP はこれをアトミックな認可コードの経路の中で消費するため、トランザクションクラスタに属し、永続側にルートされます。データの性質は保存先を示唆しますが、クラスタの不変条件がそれを上書きします。

::: details このページで触れる仕様
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests（PAR — `request_uri` は揮発状態）
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT、`jti` を含む（replay セット状態）
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security BCP, §4.14（リフレッシュトークンのローテーション）
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — セッション状態
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — ログアウト時の 一斉通知
:::

::: details 用語の補足
- **耐久性方針（durability posture）** — サブストアがプロセス再起動やレプリカフェイルオーバを跨いで *残らなければならない* かどうか。リフレッシュトークンチェーン、登録クライアント、永続セッションは永続側です。PAR の `request_uri`、JTI 再利用防止セット、進行中のインタラクション状態は失っても差し支えありません。分離は美学ではなく実用 — 永続ストアに揮発側の QPS は必要ありませんし、揮発ストアに永続側の保証は必要ないからです。
- **トランザクションクラスタ** — アトミックに commit が必要なサブストアの集合（例: `auth_code` 発行と対応するリフレッシュトークン chain）。バックエンドを跨いで分けると「片方は永続に書かれ、もう片方は揮発で消えた」中途半端な状態が生じうるため、composite コンストラクタはクラスタを分割する設定を拒否します。
- **`jti`** — JWT の一意識別子（RFC 7519）。OP は JWT を運ぶ各経路（request object、client assertion、DPoP proof）ごとに「消費済み JTI」セットを保持し、再利用を防ぎます。各仕様の再利用許容窓に合わせて短寿命なので、揮発ストレージが自然な置き場になります。
:::

`op/storeadapter/composite` が分岐点です。永続ストアと揮発ストアを受け取り、各サブストアを適切な側にルーティングします。トランザクションクラスタ（同時にコミットする必要があるサブストア群）を割らない構成のみが許容されます。

> **ソース:**
> - [`examples/08-composite-hot-cold`](https://github.com/libraz/go-oidc-provider/tree/main/examples/08-composite-hot-cold) — SQLite 永続 + in-memory 揮発。`go run -tags example .` 1 行で起動可能。
> - [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) — MySQL 永続 + Redis 揮発。`mysql:8.4` と `redis:7.4-alpine` に固定された docker-compose スタックとして同梱されており、アダプタの契約テストと example が同じエンジンマトリクスを共有します。

## アーキテクチャ

<svg role="img" aria-labelledby="hcr-arch-title" viewBox="0 14 728 220" width="728" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="max-width:100%;height:auto;">
  <title id="hcr-arch-title">composite ストアアダプタが永続サブストアを SQL/MySQL バックエンドに、揮発サブストアを Redis バックエンドにルーティングする図。</title>
  <marker id="hcr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M1 1 L9 5 L1 9" stroke-width="1.6"/>
  </marker>

  <!-- op.Provider (the OP — brand accent) -->
  <rect class="hcr-accent" x="8" y="100" width="132" height="50" rx="6"/>
  <text class="hcr-m hcr-accent-t" x="74" y="129" text-anchor="middle">op.Provider</text>

  <!-- composite splitter -->
  <rect x="176" y="100" width="144" height="50" rx="6"/>
  <text class="hcr-m" x="248" y="120" text-anchor="middle">storeadapter/</text>
  <text class="hcr-m" x="248" y="137" text-anchor="middle">composite</text>

  <!-- op -> composite -->
  <path d="M140 125 H172" marker-end="url(#hcr-arrow)"/>

  <!-- durable branch -->
  <path d="M320 118 C 370 118 384 52 448 52" marker-end="url(#hcr-arrow)"/>
  <text class="hcr-edge" x="386" y="42" text-anchor="middle">永続サブストア</text>
  <rect x="452" y="27" width="132" height="50" rx="6"/>
  <text class="hcr-m" x="518" y="47" text-anchor="middle">storeadapter/</text>
  <text class="hcr-m" x="518" y="64" text-anchor="middle">sql</text>
  <path d="M584 52 H615" marker-end="url(#hcr-arrow)"/>
  <g class="hcr-db">
    <path d="M620 39 V65 A50 7 0 0 0 720 65 V39"/>
    <ellipse cx="670" cy="39" rx="50" ry="7"/>
  </g>
  <text class="hcr-t" x="670" y="57" text-anchor="middle">MySQL</text>

  <!-- volatile branch -->
  <path d="M320 132 C 370 132 384 198 448 198" marker-end="url(#hcr-arrow)"/>
  <text class="hcr-edge" x="386" y="212" text-anchor="middle">揮発サブストア</text>
  <rect x="452" y="173" width="132" height="50" rx="6"/>
  <text class="hcr-m" x="518" y="193" text-anchor="middle">storeadapter/</text>
  <text class="hcr-m" x="518" y="210" text-anchor="middle">redis</text>
  <path d="M584 198 H615" marker-end="url(#hcr-arrow)"/>
  <g class="hcr-db">
    <path d="M620 185 V211 A50 7 0 0 0 720 211 V185"/>
    <ellipse cx="670" cy="185" rx="50" ry="7"/>
  </g>
  <text class="hcr-t" x="670" y="203" text-anchor="middle">Redis</text>
</svg>

composite ストアはトランザクションクラスタの不変条件を強制します。一緒にアトミックコミットが必要なサブストア（例: `AuthorizationCodeStore` と `RefreshTokenStore`）は **同じバックエンドに置く必要があります**。composite コンストラクタは、このクラスタを分割する設定を拒否します。

## コード

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op"
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

// composite.New は関数オプションを取ります。WithDefault がすべての Kind を
// 永続バックエンドに割り当て、With(kind, store) で個別のサブストアを
// 上書きします。composite.TxClusterKinds を別バックエンドに分割する構成は
// composite.New が拒否します。
combined, err := composite.New(
  composite.WithDefault(durable),
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
  composite.With(composite.ConsumedJTIs, volatile),
)
if err != nil { /* ... */ }

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(combined),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithStaticClients(op.PublicClient{
    ID:           "demo-rp",
    RedirectURIs: []string{"https://rp.example.com/callback"},
    Scopes:       []string{"openid", "profile"},
  }),
)
```

::: info composite を介した静的クライアントのシード
`op.WithStaticClients` は `*composite.Store` を直接受け取れるので、組み込み側は composite で包む前に durable バックエンドへ直接シードする必要はありません。

composite は意図的に `store.ClientRegistry` を型アサーションでは満たさず（read-only にルートされた `Clients` バックエンドが暗黙のうちに registry に流用されるのを防ぐため）、代わりにオプショナルな `ClientRegistry()` アクセサを公開し、`op.WithStaticClients` が組み立て時にこれをプローブします。ルート先の `Clients` バックエンドが read-only の場合、プローブは `(nil, false)` を返し、`op.New` は read-only ストアを直接渡したときと同じ `store.ClientRegistry required` エラーで構成を拒否します。
:::

## Redis のセキュリティ既定

::: warning 既定で保護のない Redis を許さない
`redis.New` は TLS（`rediss://`）と AUTH 無しでは **起動を拒否** します。リフレッシュトークン chain を平文で流す構成を出荷させないためです。例外口 `redis.WithDevModeAllowPlaintext(callback)` は `examples/` 実行とローカル開発のためだけにあります — 本番で使うのは「手で打ち込まないと出てこない」セキュリティ後退の選択肢です。
:::

## 既定の分離

| サブストア | 保存先 |
|---|---|
| `ClientStore` | 永続(SQL) |
| `UserStore` | 永続(SQL) |
| `AuthorizationCodeStore` | 永続(SQL — 短寿命だがトランザクションクラスタ内) |
| `RefreshTokenStore` | 永続(SQL) |
| `AccessTokenRegistry` | 永続(SQL — `RevocationStrategyJTIRegistry` を選んだときだけ書き込まれる) |
| `OpaqueAccessTokenStore` | 永続(SQL — opaque アクセストークン形式を有効にしたときだけ書き込まれる) |
| `GrantRevocationStore` | 永続(SQL — 既定の grant-tombstone 失効戦略を支えるストア) |
| `PushedAuthRequestStore` | 永続(SQL — `request_uri` は短寿命だがトランザクションクラスタ内) |
| `SessionStore` | `composite.With(composite.Sessions, ...)` でどちらの保存先にもルートできる。配置の宣言として `WithSessionDurabilityPosture`(既定 `SessionDurabilityVolatile`)を立てると、Back-Channel Logout 監査が想定内 / 想定外のギャップを分類できる |
| `InteractionStore` | 揮発(Redis) |
| `ConsumedJTIStore` | 揮発(Redis) |

::: info 短寿命でも永続側に残るサブストアがある理由
`PushedAuthRequestStore`、`OpaqueAccessTokenStore`、`GrantRevocationStore` はトランザクションクラスタ(`composite.TxClusterKinds`)の一部で、起点となる認可コード / grant / refresh の書き込みと同じ整合性ドメインでコミット / CAS 更新が行われます。PAR は直感に反する例です — 保持する `request_uri` は短寿命で入れ替わりが激しく、一見すると揮発状態に見えますが、OP はこれを認可コード発行の経路の中で消費するため、別バックエンドに分けるとその整合性ドメインが割れてしまいます。Redis アダプタは三つのアクセサすべてから `nil` を返すので、composite アダプタはこれらを非トランザクションのバックエンドに振り分けることができません。

これらのサブストアが必要な組み込み側は永続側に SQL を配置してください。PAR を有効にしたプロファイルで、ルートされた `PushedAuthRequests()` が nil の場合、`op.New` は起動を拒否します。既定の失効戦略(`RevocationStrategyGrantTombstone`)は `GrantRevocations()` が nil 以外であることを `op.New` で強制するため、永続側を空にしたい Redis 専用構成は `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` を明示する必要があります(非 FAPI 限定 — FAPI プロファイルは `None` を拒否します)。
:::

::: details SessionStore がどちらにもなる理由
揮発セッションストア（メモリ圧で追い出される、複製保証無し）は、多くの構成で許容範囲です — 最悪ケースでもユーザの再認証で済むためです。一方で、再起動を跨いでログイン状態を保ちたい組み込み側もいます。ルーティング自体は組み込み側の選択で、`composite.With(composite.Sessions, durableOrVolatileStore)` で行います。`op.WithSessionDurabilityPosture(SessionDurabilityVolatile | SessionDurabilityDurable)` はライブラリ側で強制しない *宣言* で、値を Back-Channel Logout の `bcl.no_sessions_for_subject` 監査イベントに伝播するだけです。これにより SOC ダッシュボードは「揮発配置における想定内のギャップ」と「永続配置における想定外のギャップ」を区別できます。
:::

## 観測性

揮発側のヒット率、キャッシュの追い出し、SQL プール統計は、それぞれのバックエンドが提供するメトリクス（`redis_*` exporter、SQL プールメトリクス）で出すのが最適です — OP はそこに重複しません。OP は `op.WithPrometheus` に渡した registry に *業務系* カウンタ（トークン発行、refresh rotation、監査イベント）を発行します。
