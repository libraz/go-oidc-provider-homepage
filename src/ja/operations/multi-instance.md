---
title: マルチインスタンス展開
description: 共有セッション、device-code 試行リミッタ、DPoP nonce、detached logout の順序付き終了を含む複数 OP レプリカ運用。
outline: 2
pageClass: pg-operations-multi-instance
---

# マルチインスタンス展開

OP はリクエストをまたいでステートレスで、すべてのレプリカが設定済みの `store.Store` 経由で読み書きします。レプリカ 1 から N に増やすということは、論点が「プロセスメモリに何があるか」から「何が共有され、何が揮発で、どの fan-out 挙動が許容できるか」に移る、ということです。

<figure class="fig">
  <div class="fig-head">N 台のレプリカ、1 つの永続ストア、1 つの揮発層</div>
  <svg class="fig-svg" role="img" aria-labelledby="multi-instance-title" viewBox="0 0 960 424" xmlns="http://www.w3.org/2000/svg">
    <title id="multi-instance-title">レプリカ構成を示した図。ロードバランサが 1 クライアントのリクエストを複数の OP レプリカへ振り分け、各レプリカは 1 つの永続ストアと 1 つの揮発 Redis 層を共有します。nonce を発行するレプリカと検証するレプリカが異なりうるため、この状態はプロセスの外に置く必要があります。</title>
    <rect class="fg-box" x="380" y="24" width="200" height="46" rx="8"/>
    <text class="fg-t" x="480" y="43" text-anchor="middle">RP / クライアント</text>
    <text class="fg-mxs" x="480" y="60" text-anchor="middle">POST /token · GET /userinfo</text>
    <path class="fg-edge" d="M480,74 V104" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="380" y="108" width="200" height="46" rx="8"/>
    <text class="fg-t2" x="480" y="128" text-anchor="middle">ロードバランサ</text>
    <text class="fg-xs" x="480" y="145" text-anchor="middle">round-robin。セッション固定なし</text>
    <path class="fg-leader" d="M480,158 V172 M156,172 H804"/>
    <path class="fg-edge" d="M156,172 V196" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M480,172 V196" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M804,172 V196" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="66" y="200" width="180" height="64" rx="8"/>
    <text class="fg-t2 fg-accent" x="156" y="224" text-anchor="middle">OP #1</text>
    <text class="fg-xs" x="156" y="244" text-anchor="middle">DPoP nonce を発行する</text>
    <rect class="fg-box fg-box--accent" x="390" y="200" width="180" height="64" rx="8"/>
    <text class="fg-t2 fg-accent" x="480" y="224" text-anchor="middle">OP #2</text>
    <text class="fg-xs" x="480" y="244" text-anchor="middle">自前の状態を持たない</text>
    <rect class="fg-box fg-box--accent" x="714" y="200" width="180" height="64" rx="8"/>
    <text class="fg-t2 fg-accent" x="804" y="224" text-anchor="middle">OP #3</text>
    <text class="fg-xs" x="804" y="244" text-anchor="middle">同じ nonce を検証する</text>
    <path class="fg-leader" d="M156,268 V286 M480,268 V286 M804,268 V286 M156,286 H804"/>
    <path class="fg-edge" d="M290,286 V310" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M670,286 V310" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="66" y="314" width="448" height="94" rx="8"/>
    <text class="fg-t2" x="86" y="340">永続ストア — 共有</text>
    <text class="fg-mxs" x="86" y="364">clients · 認可コード · refresh / access token</text>
    <text class="fg-mxs" x="86" y="382">grants · 発行時刻の記録 · PAR リクエスト</text>
    <text class="fg-xs" x="86" y="400">全レプリカの背後にバックエンドは 1 つ</text>
    <rect class="fg-box" x="546" y="314" width="348" height="94" rx="8"/>
    <text class="fg-t2" x="566" y="340">揮発層 — Redis</text>
    <text class="fg-mxs" x="566" y="364">Sessions · Interactions</text>
    <text class="fg-mxs" x="566" y="382">ConsumedJTIs · DPoP nonce</text>
    <text class="fg-xs fg-warn" x="566" y="400">再起動時や maxmemory で追い出される</text>
  </svg>
  <figcaption class="fig-note">特別なレプリカは存在せず、どれも何も覚えていません。だからロードバランサは単純なままで済みます。その代わり、リクエストをまたぐ状態はすべて、下段の 2 つから見える場所に置く必要があります。</figcaption>
</figure>

## 自動で共有されるもの

全レプリカから同じ外部バックエンドへ振り分けたデータは、レプリカ間で共有されます。composite ストアでは、`composite.TxClusterKinds` の 7 要素（認可コード、リフレッシュトークン、grant、PAR、JWT アクセストークン登録、opaque アクセストークン、grant 失効 tombstone）を、1 つの比較可能な `store.Transactional` バックエンドに配置する必要があります。次のサブストアはこの cluster の外にあり、別々に振り分けられます。

- clients
- sessions
- users
- IATs / RATs
- device codes
- CIBA requests
- interactions
- consumed JTIs
- metadata

ただし本番の複数レプリカでは、レプリカ間の可視性が必要なデータを共有ストレージへ配置してください。

Redis 層に置ける揮発サブストアは `Sessions`、`Interactions`、`ConsumedJTIs`(JAR / DPoP / private_key_jwt の replay set)です。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照してください。DPoP server-nonce ストアはサブストアではなく、`op.WithDPoPNonceSource` 経由で差し込む別の seam です。

`op.WithAuthnLockoutStore` 経由で組み込む authn-factor 用のロックアウトカウンタも、`store.Store` のサブストアには含まれないため、明示的に渡します。同梱の SQL / DynamoDB adapter は、永続かつレプリカ間で共有される実装を `storage.AuthnLockouts()` として提供します。

```go
op.WithAuthnLockoutStore(storage.AuthnLockouts())
```

`inmem.Store.AuthnLockouts()` は process-local です。再起動でリセットされ、レプリカごとに別の試行回数枠を持ちます。別のバックエンドを使う場合に、cross-factor のブルートフォース対策を再起動後も維持し、全レプリカで一貫させるには、耐久性があり共有される `store.AuthnLockoutStore` を実装してください。

device-code の確認でも、レコード状態と試行状態を分けて考えます。レコードに紐付くフローでは `devicecodekit.VerifyUserCode` または `VerifyUserCodeByUserCode` が共有 device-code store を使います。まだ `device_code` が分からない最初の手入力画面では、opaque で安定した ceremony key（ブラウザセッションやアカウント単位の key など）を使って `devicecodekit.VerifyUserCodeByAttemptKey` を呼びます。`devicecodekit.Deps` に共有 `devicecodekit.AttemptLimiter` を渡してください。既定の `InMemoryAttemptLimiter` はプロセス単位なので、レプリカごとに別の予算になります。分散リミッタの `Allow` は compare-and-increment を atomic に実行し、key の reset は認証済み ceremony の所有者だけが行います。

## 明示的に対処が必要なもの

| 論点 | レプリカ 1 つ | レプリカ N 個 |
|---|---|---|
| DPoP server nonce | ライブラリ同梱のインメモリ参照実装で済む | 分散ソースが必要 |
| Session cookie | `WithCookieKeys` で暗号化。鍵が一致する限りレプリカをまたいで共有可能 | 同上 — 全レプリカが同じ cookie 鍵を持つ必要がある |
| Interaction 状態（`/interaction/{uid}`） | プロセス内メモリでも可 | Redis または sticky session が必要 |
| レートリミット | 上流 / プロセス外 | 上流 / プロセス外 |
| OFCS conformance harness | 1 OP インスタンスに対して実行する | 1 OP インスタンスに対して実行する — 単一レプリカか LB エンドポイントを指定 |

## DPoP server-nonce ストア

`op.NewInMemoryDPoPNonceSource` は単一プロセス用です。round-robin な LB の裏では、`/token` で nonce を発行したレプリカと、その次の `/userinfo` を捌くレプリカが別になり得ます。

選択肢は 2 つです:

1. **server-nonce フローを無効化する。** `WithDPoPNonceSource` を渡さない形です。クライアントは server 供給の nonce 無しで進みます。RFC 9449 §8 のハードニングが要らないなら、安全な既定です。
2. **分散ソースを差し込む。** 共有ストア（Redis、Memcached）に対する `op.DPoPNonceSource` 実装を組み込みます。Redis の nonce source をライブラリが同梱しないのは意図的です。オプションの組み合わせ（TTL、ローテーション周期、取りこぼし許容度）が運用者ごとに違いすぎるためです。

```go
// スケッチ — 分散実装を差し込み口の裏に置く形。
// op.DPoPNonceSource は 2 メソッドだけ。ローテーション周期と
// 猶予期間は実装側が判断します。
type redisNonces struct{ rdb *redis.Client }

func (r *redisNonces) IssueNonce() string         { /* ... */ }
func (r *redisNonces) Validate(nonce string) bool { /* ... */ }

op.WithDPoPNonceSource(&redisNonces{rdb: client})
```

インメモリ版は [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) を参照してください。本番版は同じ interface を満たします。

## Session 配置

session は永続（SQL）にも揮発（永続化無しの Redis）にも置けます。トレードオフ:

| 配置 | 利点 | 欠点 |
|---|---|---|
| 永続（SQL） | 再起動 / failover 後も browser logout trigger が subject と session snapshot を解決できる。RP の対象は session 一覧ではなく grant から導出する | login のたびに DB 書き込みが発生する |
| 揮発（Redis） | 書き込みレイテンシが低く、DB のホットな行が無い | 再起動や `maxmemory` の追い出しで snapshot 前に browser logout trigger を失うことがある。snapshot 後の RP 対象も `SessionStore` の行ではなく grant から導出する |

`WithSessionDurabilityPosture(...)` で audit イベントに配置を注釈できます（`bcl.no_sessions_for_subject` は session-bearing notice で grant 由来の RP 対象が 0 件だったことを記録します）。ライブラリは配置自体を制約しません。永続配置は、再起動や failover をまたいで browser logout trigger と fan-out 前の snapshot を保護します。揮発な配置では、fan-out が始まる前に追い出しで trigger を失うことがあります。snapshot 後の対象解決は `SessionStore` の行を辿らず grant から行うため、方針注釈は trigger loss と対象 0 件を SOC ダッシュボードで解釈するための文脈になります。

## Interaction 状態

`/interaction/{uid}` の処理は、`uid` cookie に紐付く試行ごとの状態を読み書きします。レプリカが 1 つならプロセスメモリで済みます。N 個なら 2 通りです:

1. **LB で sticky session。** 同じ `uid` cookie のリクエストを常に同じレプリカへ転送します。簡単ですが、ログイン途中でレプリカが落ちるとユーザに汎用エラーが見えます。
2. **共有 interaction store。** `store.InteractionStore` を Redis 実装にします（または同梱の Redis アダプタを使います）。任意のレプリカが任意のログインを再開できます。本番の既定推奨です。

Redis アダプタの `InteractionStore` は揮発適格で、[composite store](/ja/use-cases/hot-cold-redis) の揮発スライスに住みます。

## graceful shutdown と detached logout

RP-Initiated Logout は、ブラウザへの応答後も Back-Channel Logout 配送を実行していることがあります。HTTP サーバを先に止め、その後 provider を drain します。

```go
srv.Shutdown(ctx)      // 受付を停止
provider.Shutdown(ctx) // detached fan-out を drain
```

`WithBackchannelFanOutBudget` は detached fan-out 全体（デフォルト 30 秒）を制限し、`WithBackchannelLogoutTimeout` は各 RP リクエストを別々に制限します。`Provider.Shutdown(ctx)` は実行中の fan-out が完了するまで待つため、drain 中も全レプリカで共有セッション／grant store を使って対象解決を一貫させてください。

## Cookie 鍵の一貫性

すべてのレプリカが同じ `WithCookieKeys` スライスを持つ必要があります。違う鍵で復号しようとするレプリカは、自分が暗号化していない cookie に対して `invalid_session` を返します。スケール時の症状としては「ランダムにユーザがログアウトする」現象として現れます。

secret manager から鍵を取り、すべてのレプリカに同じ値を注入してください:

```go
key, err := loadFromSecretManager("/op/cookie/current")
if err != nil { log.Fatal(err) }
op.WithCookieKeys(key)
```

N レプリカでのローテーション: 全レプリカに `WithCookieKeys(new, old)` を同時にデプロイ → オーバーラップ期間後に `WithCookieKeys(new)` へ切り替え。[鍵ローテーション](/ja/operations/key-rotation) を参照してください。

## LB アフィニティ

| エンドポイント | アフィニティ必要? |
|---|---|
| `/.well-known/openid-configuration`、`/jwks` | 不要 — 純粋な read |
| `/authorize`、`/par`、`/end_session` | interaction state が共有 Redis なら不要、プロセスローカルなら必要 |
| `/token`、`/userinfo`、`/introspect`、`/revoke` | 不要 |
| `/register`、`/register/{client_id}` | 不要 |
| `/interaction/{uid}` | `/authorize` リダイレクトを受けたレプリカに sticky、ただし Redis-backed なら不要 |

最も簡素な本番形: 全エンドポイントを round-robin にしつつ、interaction store を Redis-backed にする形です。次に簡素な形: `uid` cookie で sticky にしつつ、interaction state をプロセスローカルに置く形です。

## ヘルスチェック

OP 自体はヘルスエンドポイントをマウントしません。よくある pattern は次のとおりです:

- **Liveness:** `/.well-known/openid-configuration` の 2xx。discovery 文書はストアアクセスなしで描画できます。
- **Readiness:** ストアの ping を含めます。ストア全体に対する health メソッドは公開していないので、組み込み層で実装してください:

```go
func ready(store *MyComposite) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
        defer cancel()
        if err := store.Ping(ctx); err != nil {
            http.Error(w, err.Error(), http.StatusServiceUnavailable)
            return
        }
        w.WriteHeader(http.StatusOK)
    }
}
```

別のパス（`/healthz/ready`）でマウントし、公開ルータからは外してください。

## キャパシティプランニング

コモディティハードウェア上の概算（ピークではなく持続スループット）:

| エンドポイント | RPS / レプリカ | ボトルネック |
|---|---|---|
| `/jwks`、discovery | 数千 | 静的 JSON。CDN とも相性が良い |
| `/authorize`(interaction なし) | 100 台 | code + session の DB 書き込み |
| `/token`(authorization_code) | 数百 | ID トークン署名と DB 書き込み |
| `/token`(refresh_token) | 数百 | 暗号処理とローテーションの書き込み |
| `/userinfo` | 数百 | bearer 検証 + UserStore lookup |

数値は目安です。ボトルネックは多くの場合 OP ではなく永続ストア側にあります。サイジング前に、自前のストア実装に対して `go test -bench` でプロファイルを取ってください。

## マルチインスタンスでも**できないこと**

- **同じトランザクショナルストアに対して、設定の異なる OP を 2 つ稼働させる。** discovery 文書、scope カタログ、alg リスト、grant set はレプリカ間で一致が必須です。差があると、RP から見て drift になります（あるレプリカが発行したトークンを別のレプリカが拒否する、など）。
- **`composite.TxClusterKinds` を 2 つのバックエンドに分割する。** composite アダプタは、cluster の分割、比較不能な cluster バックエンド、`store.Transactional` を実装しないアンカーを拒否します。cluster 外の永続 `Kind` は、それぞれの整合性・可用性要件を満たす限り別のバックエンドへ配置できます。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照してください。
