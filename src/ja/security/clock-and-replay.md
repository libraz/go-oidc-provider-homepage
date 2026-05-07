---
title: 時刻ずれとリプレイ猶予
description: OIDC が扱うあらゆる署名済みアーティファクトには発行時刻 (`iat`) と有効期限 (`exp`) が付き、サーバの時刻が狂えば古い署名物を、重複検出テーブルがなければリプレイを受理してしまう。本ページは go-oidc-provider が用いる時刻関連の窓を 1 か所にまとめる。
---

# 時刻ずれとリプレイ猶予

OIDC が発行するあらゆる署名済みアーティファクト — 認可コード、リフレッシュトークン、DPoP proof、JAR オブジェクト、PAR レコード、ID トークン、アクセストークン、`client_assertion` — はすべて発行時刻 (`iat`) と有効期限 (`exp`) を持ちます。OP の時計が狂えば、発行側のクライアントから見て期限切れのはずの署名物を受理してしまいます。リプレイ検出テーブルを持たなければ、同じ署名物を 2 度受理してしまいます。OP がこの両方を防ぐ仕組みは要するに帳簿管理であり、窓を決めて、観測した識別子をその窓が閉じるまで保持し、窓の外のものを拒否する、という形に集約されます。

本ページは、ライブラリが適用するすべての窓と、それを制御する定数あるいはオプション、そして該当機能を解説しているページを 1 つの表にまとめます。OP を組み込む際にセキュリティ観点でレビューするなら、まずこの表が出発点になります。

## 時計の発生源

OP が判定するすべての TTL は、`op/clock.go` で定義されている wall-clock インターフェース `op.Clock.Now()` に対して計算されます。

```go
type Clock interface {
    Now() time.Time
}
```

実運用ではこのフィールドを設定せずに渡せばライブラリ側で `time.Now()` をバックエンドとした実装を組み込みます。テストや決定論的なリプレイ検証のハーネスでは fake `Clock` を渡すことで、token TTL、監査タイムスタンプ、レートリミット窓のすべてを制御下で進行させます。コードベース内には新鮮性判定に直接 `time.Now()` を読む箇所は存在せず、すべての新鮮性ゲートはこのインターフェースを通ります。「今何時か?」が何百か所ではなく 1 か所のモック可能な差し込み口に集約されているということです。

組み込み側への含意として、**NTP / chronyd は必須**です。OP は自分の wall clock を信用して `iat` と `exp` を現在時刻と比較しています。時計が分単位でずれているマシンは、発行側のクライアントが古いと判断している proof を黙って受理したり、逆にクライアントが署名したばかりの proof を拒否したりします。OP は時刻同期が確立されているホストでのみ動かしてください。

## 猶予と TTL の一覧

| 対象 | 防御方法 | 既定の窓 / TTL | 関連ページ |
|---|---|---|---|
| 認可コード | one-time consumption + TTL | `DefaultAuthCodeTTL = 60 s` | [/ja/concepts/authorization-code-pkce](/ja/concepts/authorization-code-pkce) |
| リフレッシュトークン (ローテーション猶予) | 直前のトークンを猶予期間内は受理 | `refresh.GraceTTLDefault = 60 s`(`op.WithRefreshGracePeriod` で変更可) | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |
| DPoP proof — `iat` 窓 | サーバ時刻に対する対称な許容幅 | `dpop.DefaultIatWindow = 60 s` | [/ja/concepts/dpop](/ja/concepts/dpop) |
| DPoP proof — `jti` キャッシュ | リプレイ重複検出 | iat 窓と同じ (`replayLeew`) | [/ja/concepts/dpop](/ja/concepts/dpop) |
| JAR (RFC 9101) request object — `jti` キャッシュ | リプレイ重複検出 | OP 側キャッシュ。request object 自身の `exp` で追い出し | [/ja/security/design-judgments#dj-6](/ja/security/design-judgments#dj-6) |
| JAR — 未来側ずれ許容 | `nbf` / `iat` の許容幅 | `jar.DefaultMaxFutureSkew = 60 s` | [/ja/security/design-judgments#dj-6](/ja/security/design-judgments#dj-6) |
| PAR (RFC 9126) `request_uri` 寿命 | 一回限り、短寿命 | `parendpoint.DefaultTTL = 60 s` | [/ja/concepts/fapi](/ja/concepts/fapi) |
| Back-Channel Logout token | OP は 1 度だけ署名、RP 側で重複検出 | OP は `jti` キャッシュを持たない (RP 側の責務) | [/ja/use-cases/back-channel-logout](/ja/use-cases/back-channel-logout) |
| ID トークン | `iat` + `exp` | `exp - iat = リクエスト時の AccessTokenTTL` | [/ja/concepts/tokens](/ja/concepts/tokens) |
| アクセストークン (JWT または opaque) | `iat` + `exp` | `DefaultAccessTokenTTL = 5 分`、上限 `AccessTokenTTLMax = 24 h`(FAPI プロファイルは 10 分まで) | [/ja/concepts/tokens](/ja/concepts/tokens) |
| リフレッシュトークン (絶対寿命) | 発行時の `exp` | `timex.RefreshTokenTTLDefault = 30 日` | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |
| `client_assertion` (private_key_jwt) | `iat` + `exp` + `jti` 重複検出、±60 秒の clock leeway | jti は `expiresAt = assertion.exp` でマーク。clock leeway 既定 60 秒 | [/ja/concepts/client-types](/ja/concepts/client-types) |

「既定の窓 / TTL」列の定数はすべて `~/Projects/go-oidc-provider/internal/...` を grep して引き当てた一次情報です。ライブラリ側で既定値が変わったときに最初に追従すべきページがここです。

## ここでの「リプレイ」とは

仕様文では replay は 1 語ですが、コード上の防御は 3 種類に分かれます。

**トークンリプレイ** — 同じ bearer 形のクレデンシャルを 2 回提示する形。認可コードは初回使用時に *消費* されます (`AuthorizationCodeStore` の該当行が使用済みに切り替わる)。リフレッシュトークンは引き換えのたびに *ローテーション* し、猶予期間が閉じた後に直前のトークンを提示するとリユース検出によって失効カスケードが走ります。DPoP proof は `jti` で *重複検出* されます。検証器は受理した proof の `jti` を後続処理の前に `ConsumedJTIStore` にマークするため、同じ `jti` を持つ 2 個目の proof は 2 個目の nonce が新鮮であっても `ErrProofReplayed` を返します。

**リクエストリプレイ** — 同じ /authorize リクエストを同じパラメータで再送信する形。PAR は構造的にこれを不可能にしており、一回限りの `request_uri` を発行します。/authorize がその URN を消費した時点で `PushedAuthRequestStore` から消えます。JAR (`request=` でインライン渡しする request object) は同じ `ConsumedJTIStore` サブストアに対して `jti` 重複検出を行い、`jar:<clientID>:<jti>` 形式のキーで保持して request object 自身の `exp` で追い出します。

**ログアウトリプレイ** — 同じ `logout_token` を RP に対して 2 度 POST する形。Back-Channel Logout 1.0 §2.6 は重複検出の責務を *RP* 側に置きます。OP は 1 度だけ署名・配送し、各 RP は自分が観測した logout-token の `jti` を必要に応じて記録します。OP 側に logout-token のリプレイキャッシュを持たないのは、関心境界が RP にあるからです。

この 3 つを併せて読むとモデルが見えます。アーティファクトの *使われ方* が防御方法を規定する。コードは消費する、リフレッシュトークンはローテーションする、DPoP / JAR / `client_assertion` は明示的な `jti` を持って共有重複検出テーブルに乗る、ログアウトトークンは重複検出を受信側に委譲する、というかたちです。

## 運用上の前提

`ConsumedJTIStore` (`op/store/jti.go` で宣言) は `jti` ベースの防御がすべて経由する契約です。DPoP、JAR、`client_assertion` のいずれも同じサブストアの `Mark(ctx, key, expiresAt)` を呼びます。キーの名前空間 (`jar:<clientID>:<jti>` と、DPoP / assertion 用の素の `jti`) によって衝突が避けられています。

複数インスタンス構成では、このサブストアを全インスタンスで共有するか、または特定の `jti` の存続期間中はその `jti` がスティッキールーティングされる必要があります。複数レプリカそれぞれに in-memory 実装を持たせるとこの防御は無効化されます。レプリカ A とレプリカ B が同じ proof を 1 度ずつ、合計 2 度受理してしまいます。Redis / Memcached のような高速な共有キャッシュが標準的な選択肢で、これに伴う volatile / durable 分離の指針は [/ja/operations/multi-instance](/ja/operations/multi-instance) で扱っています。

`ConsumedJTIStore` はトランザクションクラスタの外側に明示的に置かれています (`op/store/tx.go` 参照)。操作は冪等 (「最初に書いた者が勝つ。後続は consumed として観測する」) で、キャッシュが完全に飛んでも攻撃者がリプレイを許される窓は各アーティファクトの残寿命に等しい範囲に限られます。DPoP は `iat` 窓、JAR / `client_assertion` は `exp` で抑え込まれます。表中の窓がいずれもおおむね 60 秒以下に収まっているのはこのためです。

もう 1 つの運用上の前提は wall clock 自体です。すべてのレプリカは同じ OP コード・同じ既定値で動いており、レプリカ間の時計が該当窓を超えてずれると、同じアーティファクトが新鮮かどうかについてレプリカ同士の判断が割れます。フリート全体への NTP 規律はセキュリティ姿勢の一部であり、付け足しではありません。

## エッジケース

**サマータイムや閏秒は無関係**です。OP が保持するタイムスタンプはすべて Unix epoch 秒です。DST 移行や閏秒調整が epoch を動かすことはありません。表中の定数はすべて純粋な `time.Duration` 値であり、60 秒の猶予は 10 月最終日曜日の深夜をまたいでも 60 秒のままです。

**長寿命トークンと短い窓の組み合わせ**。リフレッシュトークンの既定は 30 日、ローテーション猶予は 60 秒です。この組み合わせは意図的なもので、長い寿命によって妥当なネットワーク断絶下でもバックグラウンド同期クライアントを支えつつ、短い猶予によって、漏洩した直前のトークンが正規クライアントのローテーション後にどれだけ使えるかを抑え込みます。本ライブラリはネットワークの瞬断下でも可用性 (リプレイを黙って受理する) よりも正しさ (リユース検出による失効カスケード) を優先しており、60 秒という窓は典型的なモバイル端末の retry を覆える最小幅でありながら、直前のトークンが長く使える状態を残さない値として選ばれています。トレードオフの判断は [/ja/security/design-judgments](/ja/security/design-judgments) にあります。

**DPoP nonce と DPoP `iat`**。`iat` claim は *クライアント* が署名するため、クライアント側が短期に侵害されると 60 秒分の窓に対して有効な proof を事前生成されます。DPoP nonce (RFC 9449 §8) はサーバ制御の新鮮性シグナルを追加してこの隙間を埋めるもので、クライアントは送り返さなければなりません。両者は独立に検証され、`iat` 窓を通過しても nonce 検証に失敗した proof は拒否され、新鮮な nonce を持っていても `iat` が古い proof も拒否されます。詳細なフローは [/ja/concepts/dpop](/ja/concepts/dpop) と [/ja/use-cases/dpop-nonce](/ja/use-cases/dpop-nonce) を参照してください。

**stale-nonce と jti 消費の順序**。DPoP 検証器は `jti` のマークを nonce ゲートを通過した *後* に行い、前ではありません。nonce 検証に失敗した proof は `ConsumedJTIStore` を進めないため、新鮮な nonce で retry したクライアントは同じ `jti` を 1 度だけ再提示できます。nonce ゲートを通過した proof がさらに新しい nonce で再提示された場合は、`jti` が既にマークされているため `ErrProofReplayed` が返ります。順序は `internal/dpop/verify.go` のインラインコメントに記載されています。

## 次に読む

- [/ja/concepts/dpop](/ja/concepts/dpop) — DPoP の `iat` / `jti` / nonce を詳細に
- [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) — ローテーション、猶予期間、リユース検出カスケード
- [/ja/security/design-judgments](/ja/security/design-judgments) — それぞれの窓がなぜこの値か、何を引き換えにしたか
- [/ja/operations/multi-instance](/ja/operations/multi-instance) — `ConsumedJTIStore` のレプリカ間共有
