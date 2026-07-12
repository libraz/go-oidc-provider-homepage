---
title: 時刻ずれとリプレイ猶予
description: OIDC が扱う署名済みアーティファクトには発行時刻 (`iat`) と有効期限 (`exp`) が付きます。サーバの時刻がずれると期限切れの署名物を受理し、重複検出テーブルがなければリプレイを防げません。本ページは go-oidc-provider が用いる時刻関連の猶予を 1 か所にまとめます。
---

# 時刻ずれとリプレイ猶予

OIDC が扱う署名済みアーティファクト、つまり認可コード、リフレッシュトークン、DPoP proof、JAR オブジェクト、PAR レコード、ID トークン、アクセストークン、`client_assertion` は、発行時刻 (`iat`) と有効期限 (`exp`) を持ちます。OP の時計がずれると、クライアント側では期限切れと見なされる署名物を OP が受理してしまいます。リプレイ検出テーブルを持たなければ、同じ署名物を 2 度受理してしまいます。OP はこの両方を防ぐために、受理できる時間幅を決め、観測した識別子をその時間幅が閉じるまで保持し、範囲外のものを拒否します。

本ページは、ライブラリが適用する時刻関連の猶予、対応する定数またはオプション、該当機能を解説しているページを 1 つの表にまとめます。OP を組み込む際にセキュリティ観点でレビューするなら、まずこの表が出発点になります。

## 時計の発生源

OP が判定するすべての TTL は、`op/clock.go` で定義されている wall-clock インターフェース `op.Clock.Now()` を基準に計算されます。

```go
type Clock interface {
    Now() time.Time
}
```

実運用ではこのフィールドを設定せずに渡せば、ライブラリ側が `time.Now()` を使う実装を組み込みます。テストや決定論的なリプレイ検証のハーネスでは fake `Clock` を渡すことで、トークン TTL、監査タイムスタンプ、レートリミットの時間幅を制御できます。コードベース内には、新鮮性判定のために直接 `time.Now()` を読む箇所はありません。すべての新鮮性判定はこのインターフェースを通ります。「今何時か」という判断が、あちこちに散らばらず、モック可能な 1 か所に集約されています。

組み込み側への含意として、**NTP / chronyd は必須**です。OP は自分の wall clock を信用して `iat` と `exp` を現在時刻と比較します。時計が分単位でずれているマシンでは、クライアント側では古いと判断される proof を OP が受理したり、逆にクライアントが署名したばかりの proof を拒否したりします。OP は時刻同期が確立されているホストでのみ動かしてください。

## 猶予と TTL の一覧

| 対象 | 防御方法 | 既定の窓 / TTL | 関連ページ |
|---|---|---|---|
| 認可コード | one-time consumption + TTL | `DefaultAuthCodeTTL = 60 s` | [/ja/concepts/authorization-code-pkce](/ja/concepts/authorization-code-pkce) |
| リフレッシュトークン (ローテーション猶予) | 直前のトークンを猶予期間内は受理 | `refresh.GraceTTLDefault = 60 s`(`op.WithRefreshGracePeriod` で変更可) | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |
| DPoP proof — `iat` 窓 | サーバ時刻に対する対称な許容幅 | `dpop.DefaultIatWindow = 60 s` | [/ja/concepts/dpop](/ja/concepts/dpop) |
| DPoP proof — `jti` キャッシュ | リプレイ重複検出 | `iat + 2 * DefaultIatWindow`(`replayLeew`、約 120 秒) | [/ja/concepts/dpop](/ja/concepts/dpop) |
| JAR (RFC 9101) request object — `jti` キャッシュ | リプレイ重複検出 | OP 側キャッシュ。request object 自身の `exp` を境に削除 | [/ja/security/design-judgments#dj-6](/ja/security/design-judgments#dj-6) |
| JAR — 未来側ずれ許容 | `nbf` / `iat` の許容幅 | `jar.DefaultMaxFutureSkew = 60 s` | [/ja/security/design-judgments#dj-6](/ja/security/design-judgments#dj-6) |
| PAR (RFC 9126) `request_uri` 寿命 | 一回限り、短寿命 | `parendpoint.DefaultTTL = 60 s` | [/ja/concepts/fapi](/ja/concepts/fapi) |
| Back-Channel Logout token | OP は 1 度だけ署名、RP 側で重複検出 | OP は `jti` キャッシュを持たない (RP 側の責務) | [/ja/use-cases/back-channel-logout](/ja/use-cases/back-channel-logout) |
| ID トークン | `iat` + `exp` | `exp - iat = defaultIDTokenTTL = 10 分`(固定値。リクエストのアクセストークン TTL とは独立) | [/ja/concepts/tokens](/ja/concepts/tokens) |
| アクセストークン (JWT または opaque) | `iat` + `exp` | `DefaultAccessTokenTTL = 5 分`、上限 `AccessTokenTTLMax = 24 h`(FAPI プロファイルは 10 分まで) | [/ja/concepts/tokens](/ja/concepts/tokens) |
| リフレッシュトークン (絶対寿命) | 発行時の `exp` | `timex.RefreshTokenTTLDefault = 30 日` | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |
| `client_assertion` (private_key_jwt) | `iat` + `exp` + `jti` 重複検出、±60 秒の clock leeway | `jti` は `expiresAt = assertion.exp + leeway`(60 秒)で記録。`now + maxAssertionLifetime + leeway` を上限にキャップ | [/ja/concepts/client-types](/ja/concepts/client-types) |

「既定の窓 / TTL」列の定数は、隣接するライブラリ本体のソースを読んで確認した一次情報です。ライブラリ側で既定値が変わったときに最初に追従すべきページがここです。

同じ猶予を対数時間軸で実スケールに並べると、形が一目で分かります。リプレイと時計に関する猶予はいずれも 60 秒前後の狭い帯に収まり、トークンの寿命は数分に上がり、リフレッシュトークンの絶対寿命だけが 30 日という遠い位置にあります。その間には何もありません。

<svg id="crws" role="img" aria-labelledby="clock-replay-window-scale-title" viewBox="0 0 752 392" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:1.5rem auto;width:100%;max-width:720px;height:auto">
<title id="clock-replay-window-scale-title">go-oidc-provider が適用する時刻・リプレイ猶予を、60 秒のリプレイ帯から 30 日のリフレッシュトークン寿命まで対数軸で並べた比較図。</title>
<line class="d-grid" x1="278.9" y1="58" x2="278.9" y2="362"/>
<line class="d-grid" x1="374.9" y1="58" x2="374.9" y2="362"/>
<line class="d-grid" x1="449.6" y1="58" x2="449.6" y2="362"/>
<line class="d-grid" x1="582.1" y1="58" x2="582.1" y2="362"/>
<line class="d-grid" x1="724" y1="58" x2="724" y2="362"/>
<line class="d-axis" x1="250" y1="362" x2="724" y2="362"/>
<line class="d-lane" x1="250" y1="70" x2="724" y2="70"/>
<line class="d-lane" x1="250" y1="101" x2="724" y2="101"/>
<line class="d-lane" x1="250" y1="132" x2="724" y2="132"/>
<line class="d-lane" x1="250" y1="163" x2="724" y2="163"/>
<line class="d-lane" x1="250" y1="194" x2="724" y2="194"/>
<line class="d-lane" x1="250" y1="225" x2="724" y2="225"/>
<line class="d-lane" x1="250" y1="256" x2="724" y2="256"/>
<line class="d-lane" x1="250" y1="287" x2="724" y2="287"/>
<line class="d-lane" x1="250" y1="318" x2="724" y2="318"/>
<line class="d-lane" x1="250" y1="349" x2="724" y2="349"/>
<rect class="d-op-store" x="274.4" y="65.5" width="9" height="9" rx="1"/>
<rect class="d-op-store" x="274.4" y="96.5" width="9" height="9" rx="1"/>
<circle class="d-op-fill" cx="278.9" cy="132" r="4.5"/>
<circle class="d-op-fill" cx="278.9" cy="163" r="4.5"/>
<circle class="d-op-fill" cx="278.9" cy="194" r="4.5"/>
<rect class="d-op-store" x="274.4" y="220.5" width="9" height="9" rx="1"/>
<rect class="d-op-store" x="303.3" y="251.5" width="9" height="9" rx="1"/>
<circle class="d-op-fill" cx="346" cy="287" r="4.5"/>
<circle class="d-op-fill" cx="374.9" cy="318" r="4.5"/>
<circle class="d-op-fill" cx="724" cy="349" r="4.5"/>
<text class="d-cap" x="8" y="18">各猶予を対数軸で比較</text>
<text class="d-sub" x="8" y="34">発行時点からの猶予の長さ（対数時間軸）</text>
<circle class="d-op-fill" cx="470" cy="14" r="4.5"/>
<text class="d-leg" x="480" y="18">clock / TTL の新鮮性</text>
<rect class="d-op-store" x="465.5" y="29.5" width="9" height="9" rx="1"/>
<text class="d-leg" x="480" y="37">ストア上のリプレイ重複検出</text>
<text class="d-lbl" x="238" y="73.5" text-anchor="end">認可コード</text>
<text class="d-lbl" x="238" y="104.5" text-anchor="end">PAR <tspan class="d-mono">request_uri</tspan></text>
<text class="d-lbl" x="238" y="135.5" text-anchor="end">リフレッシュトークン — 猶予</text>
<text class="d-lbl" x="238" y="166.5" text-anchor="end">DPoP proof — <tspan class="d-mono">iat</tspan></text>
<text class="d-lbl" x="238" y="197.5" text-anchor="end">JAR — 未来側ずれ</text>
<text class="d-lbl" x="238" y="228.5" text-anchor="end"><tspan class="d-mono">client_assertion</tspan></text>
<text class="d-lbl" x="238" y="259.5" text-anchor="end">DPoP proof — <tspan class="d-mono">jti</tspan> キャッシュ</text>
<text class="d-lbl" x="238" y="290.5" text-anchor="end">アクセストークン</text>
<text class="d-lbl" x="238" y="321.5" text-anchor="end">ID トークン</text>
<text class="d-lbl" x="238" y="352.5" text-anchor="end">リフレッシュトークン — 絶対寿命</text>
<text class="d-val" x="289" y="73.5">60 s</text>
<text class="d-val" x="289" y="104.5">60 s</text>
<text class="d-val" x="289" y="135.5">60 s</text>
<text class="d-val" x="289" y="166.5">±60 s</text>
<text class="d-val" x="289" y="197.5">60 s</text>
<text class="d-val" x="289" y="228.5">±60 s</text>
<text class="d-val" x="318" y="259.5">約 120 秒</text>
<text class="d-val" x="356" y="290.5">5 分 · FAPI 10 分</text>
<text class="d-val" x="385" y="321.5">10 分</text>
<text class="d-val" x="715" y="352.5" text-anchor="end">30 日</text>
<text class="d-tick" x="278.9" y="375" text-anchor="middle">1 分</text>
<text class="d-tick" x="374.9" y="375" text-anchor="middle">10 分</text>
<text class="d-tick" x="449.6" y="375" text-anchor="middle">1 時間</text>
<text class="d-tick" x="582.1" y="375" text-anchor="middle">1 日</text>
<text class="d-tick" x="724" y="375" text-anchor="middle">30 日</text>
</svg>

## ここでの「リプレイ」とは

仕様文では replay は 1 語ですが、コード上の防御は 3 種類に分かれます。

**トークンリプレイ** — 同じ bearer 形式のクレデンシャルを 2 回提示する形です。認可コードは初回使用時に *消費* されます（`AuthorizationCodeStore` の該当行が使用済みに切り替わります）。リフレッシュトークンは引き換えのたびに *ローテーション* し、猶予期間が閉じた後に直前のトークンを提示すると、リユース検出によって失効カスケードが走ります。DPoP proof は `jti` で *重複検出* されます。検証器は受理した proof の `jti` を `ConsumedJTIStore` に記録するため、同じ `jti` を持つ 2 個目の proof は、2 回目の nonce が新鮮であっても `ErrProofReplayed` を返します。

**リクエストリプレイ** — 同じ `/authorize` リクエストを同じパラメータで再送信する形です。PAR は一回限りの `request_uri` を発行するため、構造的にこのリプレイを防ぎます。`/authorize` がその URN を消費した時点で、レコードは `PushedAuthRequestStore` から消えます。JAR（`request=` でインライン渡しする request object）は同じ `ConsumedJTIStore` サブストアに対して `jti` 重複検出を行い、`jar:<clientID>:<jti>` 形式のキーで保持して、request object 自身の `exp` を境に削除します。

**ログアウトリプレイ** — 同じ `logout_token` を RP に対して 2 度 POST する形です。Back-Channel Logout 1.0 §2.6 は重複検出の責務を *RP* 側に置きます。OP は 1 度だけ署名して配送し、各 RP は自分が観測した logout-token の `jti` を必要に応じて記録します。OP 側に logout-token のリプレイキャッシュを持たないのは、重複検出すべき境界が RP 側にあるからです。

この 3 つを併せて読むと、アーティファクトの *使われ方* が防御方法を決めていることが分かります。認可コードは消費する、リフレッシュトークンはローテーションする、DPoP / JAR / `client_assertion` は明示的な `jti` を共有の重複検出テーブルに記録する、ログアウトトークンは重複検出を受信側に委譲する、という形です。

## 運用上の前提

`ConsumedJTIStore` (`op/store/jti.go` で宣言) は `jti` ベースの防御がすべて経由する契約です。DPoP、JAR、`client_assertion` のいずれも同じサブストアの `Mark(ctx, key, expiresAt)` を呼びます。キーの名前空間 (`jar:<clientID>:<jti>` と、DPoP / assertion 用の素の `jti`) によって衝突が避けられています。

複数インスタンス構成では、このサブストアを全インスタンスで共有するか、または特定の `jti` の存続期間中はその `jti` を同じインスタンスへルーティングする必要があります。複数レプリカそれぞれに in-memory 実装を持たせると、この防御は無効化されます。レプリカ A とレプリカ B が同じ proof を 1 度ずつ、合計 2 度受理してしまうためです。Redis / Memcached のような高速な共有キャッシュが標準的な選択肢で、これに伴う揮発 / 永続ストアの分離指針は [/ja/operations/multi-instance](/ja/operations/multi-instance) で扱っています。

`ConsumedJTIStore` はトランザクション対象の永続ストアの外側に明示的に置かれています（`op/store/tx.go` 参照）。操作は冪等です。最初に書いた側が勝ち、後続の書き込みは consumed として観測されます。キャッシュが完全に消えても、攻撃者がリプレイできる時間幅は各アーティファクトの残り寿命に限られます。DPoP は `iat` 窓の 2 倍、JAR / `client_assertion` は `exp` で上限が決まります。表中の窓がいずれもおおむね 120 秒以下に収まっているのはこのためです。

もう 1 つの運用上の前提は wall clock 自体です。すべてのレプリカは同じ OP コード・同じ既定値で動いていても、レプリカ間の時計が該当する猶予を超えてずれると、同じアーティファクトが新鮮かどうかについて判断が割れます。フリート全体の NTP 規律はセキュリティ姿勢の一部であり、付け足しではありません。

## エッジケース

**サマータイムや閏秒は無関係**です。OP が保持するタイムスタンプはすべて Unix epoch 秒です。DST 移行や閏秒調整が epoch を動かすことはありません。表中の定数はすべて純粋な `time.Duration` 値であり、60 秒の猶予は 10 月最終日曜日の深夜をまたいでも 60 秒のままです。

**長寿命トークンと短い窓の組み合わせ**。リフレッシュトークンの既定は 30 日、ローテーション猶予は 60 秒です。この組み合わせは意図的なものです。長い寿命によって、妥当なネットワーク断絶下でもバックグラウンド同期クライアントを支えます。一方で短い猶予によって、漏洩した直前のトークンが正規クライアントのローテーション後に使える時間を抑え込みます。本ライブラリはネットワークの瞬断下でも、リプレイを黙って受理して可用性を優先するのではなく、リユース検出による失効カスケードを優先します。60 秒という窓は、典型的なモバイル端末の retry を覆える最小幅でありながら、直前のトークンが長く使える状態を残さない値として選ばれています。トレードオフの判断は [/ja/security/design-judgments](/ja/security/design-judgments) にあります。

**DPoP nonce と DPoP `iat`**。`iat` claim は *クライアント* が署名するため、クライアント側が短期に侵害されると、60 秒分の窓に対して有効な proof を事前生成される可能性があります。DPoP nonce（RFC 9449 §8）は、サーバ制御の新鮮性シグナルを追加してこの隙間を埋めるものです。クライアントは OP が返した nonce を次の要求で送り返さなければなりません。両者は独立に検証され、`iat` 窓を通過しても nonce 検証に失敗した proof は拒否されます。新鮮な nonce を持っていても、`iat` が古い proof も拒否されます。詳細なフローは [/ja/concepts/dpop](/ja/concepts/dpop) と [/ja/use-cases/dpop-nonce](/ja/use-cases/dpop-nonce) を参照してください。

**stale-nonce と `jti` 消費の順序**。DPoP 検証器は nonce ゲートを通過した *後* に `jti` を記録します。nonce 検証に失敗した proof は `ConsumedJTIStore` を進めないため、新鮮な nonce で retry したクライアントは同じ `jti` を 1 度だけ再提示できます。nonce ゲートを通過した proof がさらに新しい nonce で再提示された場合は、`jti` が既に記録されているため `ErrProofReplayed` が返ります。順序は `internal/dpop/verify.go` のインラインコメントに記載されています。

## 次に読む

- [/ja/concepts/dpop](/ja/concepts/dpop) — DPoP の `iat` / `jti` / nonce を詳細に
- [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) — ローテーション、猶予期間、リユース検出カスケード
- [/ja/security/design-judgments](/ja/security/design-judgments) — それぞれの窓がなぜこの値か、何を引き換えにしたか
- [/ja/operations/multi-instance](/ja/operations/multi-instance) — `ConsumedJTIStore` のレプリカ間共有
