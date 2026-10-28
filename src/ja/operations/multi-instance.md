---
title: マルチインスタンス展開
description: 共有セッション、device-code 試行リミッタ、DPoP nonce、detached logout の順序付き終了を含む複数 OP レプリカ運用。
outline: 2
pageClass: pg-operations-multi-instance
---

# マルチインスタンス展開

OP はリクエストをまたいでステートレスで、すべてのレプリカが設定済みの `store.Store` 経由で読み書きします。レプリカを 1 から N に増やすと、論点は「プロセスメモリに何があるか」から「全レプリカが見えなければならないものは何か、失ってよいものは何か、ログアウトをどう全 RP へ届けるか」に移ります。

<figure class="fig">
  <div class="fig-head">N 台のレプリカ、1 つの永続ストア、1 つの揮発層</div>
  <svg class="fig-svg" role="img" aria-labelledby="multi-instance-title" viewBox="0 0 960 552" xmlns="http://www.w3.org/2000/svg">
    <title id="multi-instance-title">レプリカ構成を示した図。ロードバランサが 1 クライアントのリクエストを複数の OP レプリカへ振り分け、各レプリカは 1 つの永続ストアと 1 つの揮発 Redis 層を共有します。nonce を発行するレプリカと検証するレプリカが異なりうるため、この状態はプロセスの外に置く必要があります。</title>
    <!-- client -->
    <rect class="fg-box" x="304" y="24" width="352" height="72" rx="8"/>
    <text class="fg-t" x="320" y="52">RP / クライアント</text>
    <text class="fg-mxs" x="320" y="76">POST /token · GET /userinfo</text>
    <path class="fg-edge" d="M480,96 V136" marker-end="url(#fg-a)"/>
    <!-- load balancer -->
    <rect class="fg-box" x="304" y="136" width="352" height="72" rx="8"/>
    <text class="fg-t" x="320" y="164">ロードバランサ</text>
    <text class="fg-s" x="320" y="188">round-robin。セッション固定なし</text>
    <path class="fg-leader" d="M480,208 V232 M168,232 H792"/>
    <path class="fg-edge fg-edge--thin" d="M168,232 V256" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M480,232 V256" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M792,232 V256" marker-end="url(#fg-a)"/>
    <!-- OP #1 -->
    <rect class="fg-box fg-box--accent" x="32" y="256" width="272" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="284">OP #1</text>
    <text class="fg-s" x="48" y="308">DPoP nonce を発行する</text>
    <!-- OP #2 -->
    <rect class="fg-box fg-box--accent" x="344" y="256" width="272" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="284">OP #2</text>
    <text class="fg-s" x="360" y="308">自前の状態を持たない</text>
    <!-- OP #3 -->
    <rect class="fg-box fg-box--accent" x="656" y="256" width="272" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="672" y="284">OP #3</text>
    <text class="fg-s" x="672" y="308">同じ nonce を検証する</text>
    <path class="fg-leader" d="M168,328 V352 M480,328 V352 M792,328 V352 M168,352 H792"/>
    <path class="fg-edge fg-edge--thin" d="M248,352 V376" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M712,352 V376" marker-end="url(#fg-a)"/>
    <!-- durable store -->
    <rect class="fg-box" x="32" y="376" width="432" height="96" rx="8"/>
    <text class="fg-t" x="48" y="404">永続ストア（共有）</text>
    <text class="fg-mxs" x="48" y="428">clients · 認可コード · トークン · grants</text>
    <text class="fg-mxs" x="48" y="452">発行時刻の記録 · PAR リクエスト</text>
    <!-- volatile tier -->
    <rect class="fg-box" x="496" y="376" width="432" height="96" rx="8"/>
    <text class="fg-t" x="512" y="404">揮発層（Redis）</text>
    <text class="fg-mxs" x="512" y="428">Sessions · Interactions · ConsumedJTIs</text>
    <text class="fg-mxs" x="512" y="452">DPoP nonce（自前の source）</text>
    <!-- eviction caveat -->
    <rect class="fg-pill fg-pill--warn" x="496" y="496" width="384" height="32" rx="8"/>
    <text class="fg-s" x="688" y="517" text-anchor="middle">ConsumedJTIs 以外は追い出されてよい</text>
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

ただし本番の複数レプリカでは、レプリカ間の可視性が必要なデータを共有ストレージへ配置してください。インメモリストア（`inmem`）はプロセス単位なので、レプリカが複数なら `Sessions` と `Interactions` は SQL、DynamoDB、Redis のいずれかの共有バックエンドに置きます。

Redis アダプタが実装するサブストアは `Sessions`、`Interactions`、`ConsumedJTIs`(JAR / DPoP / private_key_jwt の replay set)です。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照してください。`Sessions` と `Interactions` は追い出されても構いません。`ConsumedJTIs` は別で、有効なマーカーが追い出されると、塞いでいた replay の窓が再び開きます。`noeviction` の Redis か永続バックエンドで動かしてください。DPoP server-nonce ストアはサブストアではなく、`op.WithDPoPNonceSource` 経由で差し込む別の seam です。

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
| Session レコード | どのストアでも可 | 共有ストア（SQL、DynamoDB、Redis）が必要。`inmem` はプロセス単位 |
| Interaction 状態（`/interaction/{uid}`） | `inmem` を含むどのストアでも可 | 共有ストア（SQL、Redis）または sticky ルーティングが必要 |
| レートリミット | 上流 / プロセス外 | 上流 / プロセス外 |
| OFCS conformance harness | 1 OP インスタンスに対して実行する | 1 OP インスタンスに対して実行する — 単一レプリカか LB エンドポイントを指定 |

## DPoP server-nonce ストア

`op.NewInMemoryDPoPNonceSource` は単一プロセス用です。round-robin な LB の裏では、`/token` で nonce を発行したレプリカと、その次の `/userinfo` を捌くレプリカが別になり得ます。

選択肢は 2 つです:

1. **server-nonce フローを無効化する。** `WithDPoPNonceSource` を渡さない形です。クライアントは server 供給の nonce 無しで進みます。RFC 9449 §8 のハードニングが要らないなら、これで足ります。ただし FAPI 2.0 Message Signing と FAPI-CIBA のプロファイルは source を必須とし、DPoP を有効にしたまま渡さないと `op.New` が起動を拒否します。
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

source を渡すと、`/token`、`/par`、`/userinfo` は `nonce` claim が無い、または受理できない DPoP proof を拒否し、新しい値を `DPoP-Nonce` ヘッダに載せた `use_dpop_nonce` を返します。インメモリ版でこのやり取りを確認できる [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) を参照してください。本番版は同じ interface を実装します。

## Session 配置

session は永続（SQL）にも揮発（永続化無しの Redis）にも置けます。トレードオフ:

| 配置 | 利点 | 欠点 |
|---|---|---|
| 永続（SQL） | 再起動 / failover 後も browser logout trigger が subject と session snapshot を解決できる。RP の対象は session 一覧ではなく grant から導出する | login のたびに DB 書き込みが発生する |
| 揮発（Redis） | 書き込みレイテンシが低く、DB のホットな行が無い | 再起動や `maxmemory` の追い出しで snapshot 前に browser logout trigger を失うことがある。snapshot 後の RP 対象も `SessionStore` の行ではなく grant から導出する |

`WithSessionDurabilityPosture(...)` で配置を宣言します（既定は揮発）。この値は `bcl.no_sessions_for_subject` に記録され、このイベントは session を伴うログアウトで grant 由来の RP 対象が 0 件だったことを表します。ライブラリは配置自体を制約しません。永続配置は、再起動や failover をまたいで browser logout trigger と fan-out 前の snapshot を保護します。揮発な配置では、fan-out が始まる前に追い出しで trigger を失うことがあります。snapshot 後の対象解決は `SessionStore` の行を辿らず grant から行うため、方針注釈は trigger loss と対象 0 件を SOC ダッシュボードで解釈するための文脈になります。

## Interaction 状態

進行中のログイン（`/interaction/{uid}`）の状態は `store.InteractionStore` に置かれ、ブラウザは封緘された `__Host-oidc_interaction` cookie で `uid` を運びます。インメモリストアでは、この状態はプロセス単位になります。レプリカが N 個なら 2 通りです。

1. **LB で sticky ルーティング。** 同じ `uid`（パスに含まれます）のリクエストを常に同じレプリカへ転送します。簡単ですが、ログイン途中でレプリカが落ちるとユーザに汎用エラーが見えます。
2. **共有 interaction store。** SQL アダプタを使うか、Redis アダプタを [composite store](/ja/use-cases/hot-cold-redis) の揮発スライスに置きます。任意のレプリカが任意のログインを再開できます。本番の既定推奨です。

## graceful shutdown と detached logout

RP-Initiated Logout は、ブラウザへの応答後も Back-Channel Logout 配送を実行していることがあります。HTTP サーバを先に止め、その後 provider を drain します。

```go
srv.Shutdown(ctx)      // 受付を停止
provider.Shutdown(ctx) // detached fan-out を drain
```

`WithBackchannelFanOutBudget` は detached fan-out 全体（既定 30 秒）を制限し、`WithBackchannelLogoutTimeout` は各 RP リクエストを別々に制限します（既定 5 秒）。`Provider.Shutdown(ctx)` は実行中の fan-out が完了するまで待ちますが、provider がリクエストを受け付けるのを止めるわけではありません。HTTP サーバを先に止めるのはそのためです。drain 中も全レプリカで共有セッション／grant store を使って対象解決を一貫させてください。

## Cookie 鍵の一貫性

すべてのレプリカが同じ `WithCookieKeys` スライスを持つ必要があります。別の鍵を持つレプリカは、自分が封緘していない cookie を開けず、そのブラウザを未ログインとして扱います。スケールすると「ランダムにユーザがログアウトする」現象として現れます。

secret manager から鍵を取り、すべてのレプリカに同じ値を注入してください:

```go
key, err := loadFromSecretManager("/op/cookie/current")
if err != nil { log.Fatal(err) }
op.WithCookieKeys(key)
```

ローリングデプロイでは、N レプリカでの鍵ローテーションは 3 段階になります。ある鍵で封緘を始めるレプリカより先に、すべてのレプリカがその鍵で cookie を開けるようになっている必要があるためです。

1. 全レプリカに `WithCookieKeys(old, new)` をデプロイします。まだ `new` で封緘するレプリカはありませんが、全レプリカが `new` の cookie を開けます。
2. `WithCookieKeys(new, old)` をデプロイします。以後は `new` で封緘し、`old` の cookie もまだ開けます。
3. 最長のセッションが終わった後に、`WithCookieKeys(new)` をデプロイします。

サイクルと重なり期間の長さは [鍵ローテーション](/ja/operations/key-rotation) を参照してください。

## LB アフィニティ

| エンドポイント | アフィニティ必要? |
|---|---|
| `/.well-known/openid-configuration`、`/jwks` | 不要 — 純粋な read |
| `/auth`、`/par`、`/end_session` | interaction と session の状態が共有ストアにあれば不要、プロセスローカルなら必要 |
| `/token`、`/userinfo`、`/introspect`、`/revoke` | 不要 |
| `/device_authorization`、`/bc-authorize` | 不要 |
| `/register`、`/register/{client_id}` | 不要 |
| `/interaction/{uid}` | `/auth` のリダイレクトを受けたレプリカに sticky。ただし interaction store が共有なら不要 |

パスは既定値で、mount prefix（既定は `/oidc`）からの相対です。最も簡素な本番形は、全エンドポイントを round-robin にしつつ、interaction store を共有にする形です。次に簡素なのは、`uid` で sticky にしつつ、interaction の状態をプロセスローカルに置く形です。

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

何を測るべきか決める手がかりとして、エンドポイントごとの 1 リクエストあたりの主なコストを示します。

| エンドポイント | 主なコスト |
|---|---|
| `/jwks`、discovery | 静的 JSON でストアにアクセスしない。CDN とも相性が良い |
| `/auth`(interaction なし) | code と session のストア書き込み |
| `/token`(authorization_code) | ID トークンの署名に加え、ストア書き込みとユーザの lookup |
| `/token`(refresh_token) | 署名に加え、1 トランザクションでのローテーション書き込み |
| `/userinfo` | アクセストークンの検証とユーザの lookup |

ボトルネックは多くの場合 OP ではなく永続ストア側にあります。KMS をバックエンドにした署名器は、署名のたびに独自の待ち時間を足します（[JWKS エンドポイント](/ja/operations/jwks#hsm-kms-連携) を参照）。サイジングの前に、自前のストアに対して負荷試験をしてください。本ライブラリはスループットの数値を公開していません。

## マルチインスタンスでも**できないこと**

- **同じトランザクショナルストアに対して、設定の異なる OP を 2 つ稼働させる。** discovery 文書、scope カタログ、alg リスト、grant set はレプリカ間で一致が必須です。差があると、RP から見て drift になります（あるレプリカが発行したトークンを別のレプリカが拒否する、など）。
- **`composite.TxClusterKinds` を 2 つのバックエンドに分割する。** composite アダプタは、cluster の分割、比較不能な cluster バックエンド、`store.Transactional` を実装しないアンカーを拒否します。cluster 外の永続 `Kind` は、それぞれの整合性・可用性要件を満たす限り別のバックエンドへ配置できます。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照してください。
