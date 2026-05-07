---
title: マルチインスタンス展開
description: OP レプリカを複数立てる — DPoP nonce 共有、session 配置、sticky か round-robin かのトレードオフ。
outline: 2
---

# マルチインスタンス展開

OP はリクエストをまたいでステートレスで、すべてのレプリカが設定済みの `op.Store` 経由で読み書きします。レプリカ 1 から N に増やすということは、論点が「プロセスメモリに何があるか」から「何が共有され、何が揮発で、どの fan-out 挙動が許容できるか」に移る、ということです。

## 自動で共有されるもの

`op.Store` に乗っているものは構造的に共有されます。永続サブストア(clients、codes、リフレッシュトークン、アクセストークン、grants、IATs、PARs)は 1 つのバックエンド(SQL または自前の実装)に対して、全レプリカが読み書きします。`composite.PushedAuthRequests` は `composite.TxClusterKinds` の一員なので、splitter は永続アンカー以外への振り分けを拒否します。

Redis 層に置ける揮発サブストアは `Sessions`、`Interactions`、`ConsumedJTIs`(JAR / DPoP / private_key_jwt の replay set)です。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照してください。DPoP server-nonce ストアはサブストアではなく、`op.WithDPoPNonceSource` 経由で差し込む別の seam です。

## 明示的に対処が必要なもの

| 論点 | レプリカ 1 つ | レプリカ N 個 |
|---|---|---|
| DPoP server nonce | ライブラリ同梱のインメモリ参照実装で済む | 分散ソースが必要 |
| Session cookie | `WithCookieKeys` で暗号化。鍵が一致する限りレプリカをまたいで共有可能 | 同上 — 全レプリカが同じ cookie 鍵を持つ必要がある |
| Interaction 状態(`/interaction/{uid}`) | プロセス内メモリでも可 | Redis または sticky session が必要 |
| レートリミット | 上流 / プロセス外 | 上流 / プロセス外 |
| OFCS conformance harness | 1 OP インスタンスに対して実行する | 1 OP インスタンスに対して実行する — 単一レプリカか LB エンドポイントを指定 |

## DPoP server-nonce ストア

`op.NewInMemoryDPoPNonceSource` は単一プロセス用です。round-robin な LB の裏では、`/token` で nonce を発行したレプリカと、その次の `/userinfo` を捌くレプリカが別になり得ます。

選択肢は 2 つです:

1. **server-nonce フローを無効化する。** `WithDPoPNonceSource` を渡さない形です。クライアントは server 供給の nonce 無しで進みます。RFC 9449 §8 のハードニングが要らないなら、安全な既定です。
2. **分散ソースを差し込む。** 共有ストア(Redis、Memcached)に対する `op.DPoPNonceSource` 実装を組み込みます。Redis の nonce source をライブラリが同梱しないのは意図的です。オプションの組み合わせ(TTL、ローテーション周期、取りこぼし許容度)が運用者ごとに違いすぎるためです。

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

session は永続(SQL)にも揮発(永続化無しの Redis)にも置けます。トレードオフ:

| 配置 | 利点 | 欠点 |
|---|---|---|
| 永続(SQL) | 再起動 / failover を生き延びる。Back-Channel logout の fan-out が全 session を見つけられる | login のたびに DB 書き込みが発生する |
| 揮発(Redis) | 書き込みレイテンシが低く、DB のホットな行が無い | 再起動や `maxmemory` で session が追い出される — Back-Channel logout が 0 件しか見つけないことがある |

`WithSessionDurabilityPosture(...)` で audit イベントに配置を注釈できます(`bcl.no_sessions_for_subject` がこの方針を載せます)。ライブラリは配置自体を制約しません。方針注釈は、SOC ダッシュボードが「揮発で想定内」と「永続で想定外」を分離するためのものです。

## Interaction 状態

`/interaction/{uid}` の処理は、`uid` cookie に紐付く試行ごとの状態を読み書きします。レプリカが 1 つならプロセスメモリで済みます。N 個なら 2 通りです:

1. **LB で sticky session。** 同じ `uid` cookie のリクエストを常に同じレプリカへ転送します。簡単ですが、ログイン途中でレプリカが落ちるとユーザに汎用エラーが見えます。
2. **共有 interaction store。** `store.InteractionStore` を Redis 実装にします(または同梱の Redis アダプタを使います)。任意のレプリカが任意のログインを再開できます。本番の既定推奨です。

Redis アダプタの `InteractionStore` は揮発適格で、[composite store](/ja/use-cases/hot-cold-redis) の揮発スライスに住みます。

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

- **Liveness:** `/.well-known/openid-configuration` の 2xx。discovery document はストアアクセスなしで描画できます。
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

別のパス(`/healthz/ready`)でマウントし、公開ルーターからは外してください。

## キャパシティプランニング

コモディティハードウェア上の概算(ピークではなく持続スループット):

| エンドポイント | RPS / レプリカ | ボトルネック |
|---|---|---|
| `/jwks`、discovery | 数千 | 静的 JSON。CDN とも相性が良い |
| `/authorize`(interaction なし) | 100 台 | code + session の DB 書き込み |
| `/token`(authorization_code) | 数百 | ID トークン署名と DB 書き込み |
| `/token`(refresh_token) | 数百 | 暗号処理とローテーションの書き込み |
| `/userinfo` | 数百 | bearer 検証 + UserStore lookup |

数値は目安です。ボトルネックは多くの場合 OP ではなく永続ストア側にあります。サイジング前に、自前のストア実装に対して `go test -bench` でプロファイルを取ってください。

## マルチインスタンスでも**できないこと**

- **同じトランザクショナルストアに対して、設定の異なる OP を 2 つ稼働させる。** discovery document、scope カタログ、alg リスト、grant set はレプリカ間で一致が必須です。差があると、RP から見て drift になります(あるレプリカが発行したトークンを別のレプリカが拒否する、など)。
- **永続サブストアを 2 つのバックエンドに分割する。** composite store の不変条件は「永続バックエンドは 1 つ」です。トランザクショナル整合性がそれに依存しています。[hot/cold split](/ja/use-cases/hot-cold-redis) を参照してください。
