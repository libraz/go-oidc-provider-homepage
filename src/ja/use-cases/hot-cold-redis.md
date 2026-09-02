---
title: Hot/Cold 分離（Redis 揮発）
description: 揮発サブストアを Redis に、永続サブストアを SQL にルートする — 標準的な本番構成。
pageClass: pg-use-cases-hot-cold-redis
---

# 使い方 — Hot/Cold 分離（Redis 揮発）

## 「Hot / Cold」とは

OP が抱える状態は、性質が大きく異なる 2 種類に分かれます:

- **Cold (永続)** — 失うわけにはいかない長寿命の行: 登録クライアント、ユーザレコード、リフレッシュトークンチェーン、永続セッション。
- **Hot (揮発)** — 高頻度で生成され短時間で陳腐化する行: PAR の `request_uri`（RFC 9126）、消費済み JTI 再利用防止セット（RFC 7519）、ログイン途中のインタラクション状態。失っても再ログインで済むものです。

両方を同じバックエンドに乗せるのは無駄です — 永続ストアに hot 由来の QPS は必要ありませんし、揮発ストアに cold が要求する耐久性は必要ありません。composite アダプタは両者を分離します。

下の表が正確にする一点があります: *揮発的な性質* のデータと *揮発側への配置* は別の軸です。短寿命の状態の多く（JTI 再利用防止セット、インタラクション状態）は揮発側にルートされますが、PAR の `request_uri` はそうではありません — 単体では失っても差し支えない一方、OP はこれをアトミックな認可コードの経路の中で消費するため、トランザクションクラスタに属し、永続側にルートされます。データの性質は保存先を示唆しますが、クラスタの不変条件がそれを上書きします。

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

<figure class="fig">
  <div class="fig-head">ストアインタフェースは 1 つ、その裏に 2 つのバックエンド</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-hotcold-title" viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-hotcold-title">composite アダプタが各サブストアの行き先を振り分けます。永続すべきものは SQL へ、書き換えが激しく揮発してよいものは Redis へ。OP から見えるストアはどちらの場合も 1 つです。</title>
    <text class="fg-lbl" x="596" y="30">永続サブストア</text>
    <text class="fg-lbl" x="596" y="228">揮発サブストア</text>
    <rect class="fg-box" x="36" y="90" width="210" height="64" rx="8"/>
    <text class="fg-t2" x="56" y="116">op.Provider</text>
    <text class="fg-xs" x="56" y="138">ストアは 1 つに見える</text>
    <path class="fg-edge" d="M250,122 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="300" y="90" width="220" height="64" rx="8"/>
    <text class="fg-m fg-accent" x="320" y="116">composite</text>
    <text class="fg-xs" x="320" y="138">サブストアごとに振り分ける</text>
    <path class="fg-leader" d="M524,122 H556 M556,64 V180"/>
    <path class="fg-edge fg-edge--thin" d="M556,64 H592" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M556,180 H592" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="596" y="40" width="154" height="48" rx="6"/>
    <text class="fg-mxs" x="612" y="60">storeadapter/</text>
    <text class="fg-mxs" x="612" y="76">sql</text>
    <path class="fg-edge fg-edge--thin" d="M754,64 H790" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="794" y="40" width="130" height="48" rx="6"/>
    <text class="fg-t2" x="812" y="60">MySQL</text>
    <text class="fg-xs" x="812" y="78">再起動しても残る</text>
    <rect class="fg-box" x="596" y="156" width="154" height="48" rx="6"/>
    <text class="fg-mxs" x="612" y="176">storeadapter/</text>
    <text class="fg-mxs" x="612" y="192">redis</text>
    <path class="fg-edge fg-edge--thin" d="M754,180 H790" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="794" y="156" width="130" height="48" rx="6"/>
    <text class="fg-t2" x="812" y="176">Redis</text>
    <text class="fg-xs" x="812" y="194">失われる前提で扱う</text>
  </svg>
  <figcaption class="fig-note">分け方の基準は、消えたときに何を失うかです。セッションや nonce キャッシュはユーザに再ログインしてもらえば作り直せますが、grant はそうはいきません。</figcaption>
</figure>

composite ストアはトランザクションクラスタの不変条件を強制します。一緒にアトミックコミットが必要なサブストア（例: `AuthorizationCodeStore` と `RefreshTokenStore`）は **同じバックエンドに置く必要があります**。composite コンストラクタは、このクラスタを分割する設定を拒否します。

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
| `ClientStore` | 永続（SQL） |
| `UserStore` | 永続（SQL） |
| `AuthorizationCodeStore` | 永続（SQL — 短寿命だがトランザクションクラスタ内） |
| `RefreshTokenStore` | 永続（SQL） |
| `AccessTokenRegistry` | 永続（SQL — `RevocationStrategyJTIRegistry` を選んだときだけ書き込まれる） |
| `OpaqueAccessTokenStore` | 永続（SQL — opaque アクセストークン形式を有効にしたときだけ書き込まれる） |
| `GrantRevocationStore` | 永続（SQL — 既定の grant-tombstone 失効戦略を支えるストア） |
| `PushedAuthRequestStore` | 永続（SQL — `request_uri` は短寿命だがトランザクションクラスタ内） |
| `SessionStore` | `composite.With(composite.Sessions, ...)` でどちらの保存先にもルートできる。`WithSessionDurabilityPosture`(既定 `SessionDurabilityVolatile`) では logout の起点と session snapshot の耐久性を宣言し、BCL の target 自体は grant 由来で解決する |
| `InteractionStore` | 揮発（Redis） |
| `ConsumedJTIStore` | 揮発（Redis） |

::: info 短寿命でも永続側に残るサブストアがある理由
`PushedAuthRequestStore`、`OpaqueAccessTokenStore`、`GrantRevocationStore` はトランザクションクラスタ（`composite.TxClusterKinds`）の一部で、起点となる認可コード / grant / refresh の書き込みと同じ整合性ドメインでコミット / CAS 更新が行われます。PAR は直感に反する例です — 保持する `request_uri` は短寿命で入れ替わりが激しく、一見すると揮発状態に見えますが、OP はこれを認可コード発行の経路の中で消費するため、別バックエンドに分けるとその整合性ドメインが割れてしまいます。Redis アダプタは三つのアクセサすべてから `nil` を返すので、composite アダプタはこれらを非トランザクションのバックエンドに振り分けることができません。

これらのサブストアが必要な組み込み側は永続側に SQL を配置してください。PAR を有効にしたプロファイルで、ルートされた `PushedAuthRequests()` が nil の場合、`op.New` は起動を拒否します。既定の失効戦略（`RevocationStrategyGrantTombstone`）は `GrantRevocations()` が nil 以外であることを `op.New` で強制するため、永続側を空にしたい Redis 専用構成は `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` を明示する必要があります（非 FAPI 限定 — FAPI プロファイルは `None` を拒否します）。
:::

::: details SessionStore がどちらにもなる理由
揮発セッションストア（メモリ圧で追い出される、複製保証無し）は、多くの構成で許容範囲です — 最悪ケースでもユーザの再認証で済みます。一方、ブラウザのログイン状態と logout の起点 / session snapshot を再起動後も保持したい組み込み側は、より強い耐久性を求めます。ルーティング自体は組み込み側の選択で、`composite.With(composite.Sessions, durableOrVolatileStore)` で行います。`op.WithSessionDurabilityPosture(SessionDurabilityVolatile | SessionDurabilityDurable)` はライブラリ側で強制しない *宣言* で、logout の起点 / session snapshot の耐久性を示すものであり、BCL の audience を示すものではありません。`/end_session` は通知前に session を snapshot し、eligible な RP target は `GrantStore.ListClientIDsBySubject` から独立して grant 由来で解決します。`bcl.no_sessions_for_subject` は session を伴う logout 通知で grant 由来の RP target が 0 件だったことを示します。snapshot 前に eviction が起きた場合は back-channel 通知も監査イベントも発生しません。SOC dashboard では、起点 / snapshot の耐久性に関する欠落と grant 由来 zero-target event を別の概念として扱ってください。
:::

## 観測性

揮発側のヒット率、キャッシュの追い出し、SQL プール統計は、それぞれのバックエンドが提供するメトリクス（`redis_*` exporter、SQL プールメトリクス）で出すのが最適です — OP はそこに重複しません。OP は `op.WithPrometheus` に渡した registry に *業務系* カウンタ（トークン発行、refresh rotation、監査イベント）を発行します。
