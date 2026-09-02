---
title: 時刻ずれとリプレイ猶予
description: go-oidc-provider の時計、リプレイ、再認証、passkey challenge、remote JWKS の freshness ルールと、組み込み時に確認すべき既定値・上限をまとめます。
pageClass: pg-security-clock-and-replay
---

# 時刻ずれとリプレイ猶予

OIDC のアーティファクトは、すべてが同じ freshness / replay 形状を持つわけではありません。認可コードや PAR レコードはサーバ側で消費され、JWT や proof は時刻 claim を持ちます。OP の時計がずれると古いアーティファクトを受理でき、replay state がなければ同じものを 2 度受理できます。そのため OP は、明示的な TTL、時計の許容幅、一回限りの state、compare-and-set の重複検出ストアを組み合わせます。

本ページは、誤解しやすいセキュリティ上の既定値、対応する定数またはオプション、該当機能を解説しているページをまとめます。`iat` / `exp` だけでは表せない再認証、passkey、JWKS の上限も記載します。

## 時計の発生源

OP が判定するすべての TTL は、`op/clock.go` で定義されている wall-clock インターフェース `op.Clock.Now()` を基準に計算されます。

```go
type Clock interface {
    Now() time.Time
}
```

実運用ではこのフィールドを設定せずに渡せば、ライブラリ側が system clock 実装を組み込みます。テストや決定論的なリプレイ検証のハーネスでは fake `Clock` を渡すことで、トークン TTL、監査タイムスタンプ、レートリミットの時間幅を制御できます。コアの freshness 判定はこの seam を使いますが、seam を import できない adapter は自身の fallback と override を文書化します。組み込み側で protocol 判定のための ad-hoc な `time.Now()` を増やさず、時計の境界を 1 か所に保ってください。

組み込み側への含意として、**NTP / chronyd は必須**です。OP は自分の wall clock を信用して `iat` と `exp` を現在時刻と比較します。時計が分単位でずれているマシンでは、クライアント側では古いと判断される proof を OP が受理したり、逆にクライアントが署名したばかりの proof を拒否したりします。OP は時刻同期が確立されているホストでのみ動かしてください。

## 猶予と TTL の一覧

| 対象 | 防御方法 | 既定の窓 / TTL | 関連ページ |
|---|---|---|---|
| 認可コード | one-time consumption + TTL | `DefaultAuthCodeTTL = 60 s` | [/ja/concepts/authorization-code-pkce](/ja/concepts/authorization-code-pkce) |
| リフレッシュトークン（ローテーション猶予） | 直前のトークンを猶予期間内は受理 | `refresh.GraceTTLDefault = 60 s`(`op.WithRefreshGracePeriod` で変更可) | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |
| DPoP proof — `iat` 窓 | サーバ時刻に対する対称な許容幅 | 60 秒 | [/ja/concepts/dpop](/ja/concepts/dpop) |
| DPoP proof — `jti` キャッシュ | リプレイ重複検出 | 約 120 秒 | [/ja/concepts/dpop](/ja/concepts/dpop) |
| JAR (RFC 9101) request object — `jti` キャッシュ | リプレイ重複検出 | サーバ側で bounded: `max(exp, now + max-age)` を `now + max(max-age, maxLifetime)` で上限化し、最後に clock skew を加算 | [/ja/security/design-judgments#dj-6](/ja/security/design-judgments#dj-6) |
| JAR — 未来側ずれ許容 | `nbf` / `iat` の許容幅 | `jar.DefaultMaxFutureSkew = 60 s` | [/ja/security/design-judgments#dj-6](/ja/security/design-judgments#dj-6) |
| PAR (RFC 9126) `request_uri` 寿命 | 一回限り、短寿命 | `parendpoint.DefaultTTL = 60 s` | [/ja/concepts/fapi](/ja/concepts/fapi) |
| Back-Channel Logout token | OP は 1 度だけ署名、RP 側で重複検出 | OP は `jti` キャッシュを持たない（RP 側の責務） | [/ja/use-cases/back-channel-logout](/ja/use-cases/back-channel-logout) |
| ID トークン | `iat` + `exp` | `exp - iat = defaultIDTokenTTL = 10 分`(固定値。リクエストのアクセストークン TTL とは独立) | [/ja/concepts/tokens](/ja/concepts/tokens) |
| アクセストークン（JWT または opaque） | `iat` + `exp` | `DefaultAccessTokenTTL = 5 分`、上限 `AccessTokenTTLMax = 24 h`(FAPI プロファイルは 10 分まで) | [/ja/concepts/tokens](/ja/concepts/tokens) |
| リフレッシュトークン（絶対寿命） | 発行時の `exp` | `timex.RefreshTokenTTLDefault = 30 日` | [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) |
| `client_assertion` (private_key_jwt) | `iat` + `exp` + `jti` 重複検出、±60 秒の clock leeway | `jti` は `expiresAt = assertion.exp + leeway`(60 秒)で記録。`now + maxAssertionLifetime + leeway` を上限にキャップ | [/ja/concepts/client-types](/ja/concepts/client-types) |

「既定の窓 / TTL」列は、現行 core のソースとテストで確認した値です。JAR では request object 自身の `exp` だけで保持期間を決めません。verifier の最大寿命の上限（設定時）と `max-age` の下限で marker を bounded にし、最後に clock skew を加えます。`With*` オプションや有効な profile により狭くなったり置き換わったりする TTL を、固定契約として過度に一般化しないようにしています。core を更新したら、リンク先のソースとテストを再確認してください。

表中の代表的な猶予を対数時間軸で実スケールに並べると、リプレイと時計の窓は 1 分前後に集まり、トークンの寿命は数分、リフレッシュトークンの絶対寿命は 30 日に達することが分かります。

<figure class="fig">
  <div class="fig-head">時刻とリプレイの猶予を、同じ尺度で並べる</div>
  <svg class="fig-svg" role="img" aria-labelledby="clock-windows-title" viewBox="0 0 960 404" xmlns="http://www.w3.org/2000/svg">
    <title id="clock-windows-title">本ライブラリが適用する時刻・リプレイの猶予を、60 秒のリプレイ帯から 30 日のリフレッシュトークン絶対寿命まで対数軸で比較した図。塗りつぶしの円は clock / TTL の新鮮性検査、白抜きの四角はストア上のリプレイ重複検出です。</title>
    <text class="fg-lbl" x="36" y="24">発行時点からの猶予の長さ · 対数軸</text>
    <circle class="fg-dot--accent" cx="560" cy="20" r="4.5"/>
    <text class="fg-xs" x="572" y="24">clock / TTL の新鮮性</text>
    <rect class="fg-dot--hollow" x="712" y="15.5" width="9" height="9" rx="1"/>
    <text class="fg-xs" x="729" y="24">ストア上のリプレイ重複検出</text>
    <!-- 桁ごとのグリッド -->
    <line class="fg-rule fg-rule--dashed" x1="340" y1="60" x2="340" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="461" y1="60" x2="461" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="555" y1="60" x2="555" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="721" y1="60" x2="721" y2="360"/>
    <line class="fg-rule fg-rule--dashed" x1="900" y1="60" x2="900" y2="360"/>
    <!-- 各行 -->
    <line class="fg-rule" x1="340" y1="76" x2="900" y2="76"/>
    <text class="fg-s" x="300" y="80" text-anchor="end">認可コード</text>
    <rect class="fg-dot--hollow" x="335.5" y="71.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="356" y="80">60 s</text>
    <line class="fg-rule" x1="340" y1="106" x2="900" y2="106"/>
    <text class="fg-s" x="300" y="110" text-anchor="end">PAR の request_uri</text>
    <rect class="fg-dot--hollow" x="335.5" y="101.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="356" y="110">60 s</text>
    <line class="fg-rule" x1="340" y1="136" x2="900" y2="136"/>
    <text class="fg-s" x="300" y="140" text-anchor="end">リフレッシュトークン — 猶予</text>
    <circle class="fg-dot--accent" cx="340" cy="136" r="4.5"/>
    <text class="fg-mxs" x="356" y="140">60 s</text>
    <line class="fg-rule" x1="340" y1="166" x2="900" y2="166"/>
    <text class="fg-s" x="300" y="170" text-anchor="end">DPoP proof — iat</text>
    <circle class="fg-dot--accent" cx="340" cy="166" r="4.5"/>
    <text class="fg-mxs" x="356" y="170">±60 s</text>
    <line class="fg-rule" x1="340" y1="196" x2="900" y2="196"/>
    <text class="fg-s" x="300" y="200" text-anchor="end">JAR — 未来側のずれ</text>
    <circle class="fg-dot--accent" cx="340" cy="196" r="4.5"/>
    <text class="fg-mxs" x="356" y="200">60 s</text>
    <line class="fg-rule" x1="340" y1="226" x2="900" y2="226"/>
    <text class="fg-s" x="300" y="230" text-anchor="end">client_assertion</text>
    <rect class="fg-dot--hollow" x="335.5" y="221.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="356" y="230">±60 s</text>
    <line class="fg-rule" x1="340" y1="256" x2="900" y2="256"/>
    <text class="fg-s" x="300" y="260" text-anchor="end">DPoP proof — jti キャッシュ</text>
    <rect class="fg-dot--hollow" x="371.5" y="251.5" width="9" height="9" rx="1"/>
    <text class="fg-mxs" x="392" y="260">約 120 s</text>
    <line class="fg-rule" x1="340" y1="286" x2="900" y2="286"/>
    <text class="fg-s" x="300" y="290" text-anchor="end">アクセストークン</text>
    <circle class="fg-dot--accent" cx="424" cy="286" r="4.5"/>
    <text class="fg-mxs" x="440" y="290">5 分 · FAPI は 10 分</text>
    <line class="fg-rule" x1="340" y1="316" x2="900" y2="316"/>
    <text class="fg-s" x="300" y="320" text-anchor="end">ID トークン</text>
    <circle class="fg-dot--accent" cx="461" cy="316" r="4.5"/>
    <text class="fg-mxs" x="477" y="320">10 分</text>
    <line class="fg-rule" x1="340" y1="346" x2="900" y2="346"/>
    <text class="fg-s" x="300" y="350" text-anchor="end">リフレッシュトークン — 絶対寿命</text>
    <circle class="fg-dot--accent" cx="900" cy="346" r="4.5"/>
    <text class="fg-mxs" x="888" y="350" text-anchor="end">30 日</text>
    <!-- 軸 -->
    <line class="fg-rule fg-rule--strong" x1="320" y1="366" x2="912" y2="366"/>
    <text class="fg-mxs" x="340" y="384" text-anchor="middle">1 分</text>
    <text class="fg-mxs" x="461" y="384" text-anchor="middle">10 分</text>
    <text class="fg-mxs" x="555" y="384" text-anchor="middle">1 時間</text>
    <text class="fg-mxs" x="721" y="384" text-anchor="middle">1 日</text>
    <text class="fg-mxs" x="900" y="384" text-anchor="middle">30 日</text>
  </svg>
  <figcaption class="fig-note">10 行のうち 6 行が左端の目盛に集まっています。これは意図した配置です。攻撃者が再送しうるものはすべて秒単位で測り、日単位で測るのは、失われるとユーザが気付くものだけです。</figcaption>
</figure>

## 再認証の freshness

`prompt=login` と、期限を超えた `max_age` は表示上のヒントではなく freshness 要求です。`/authorize` の入口で `prompt=login` は常に再認証フラグを立て、`max_age` は request の 0 以上の整数秒を session に記録された `auth_time` と比較します。`max_age=0` は必ず新しい factor を要求します。比較は信頼できない値を `time.Duration` に変換せず整数秒のまま行うため、非常に大きな値でも overflow によって freshness 判定が反転することはありません。既存の browser session や consent grant だけでは、freshness 違反を満たせません。interaction state はこの決定を authenticator orchestrator へ運び、factor のない終端結果を `ErrReauthNotPerformed` で拒否します。factor が完了すると、新しい `auth_time` が session と grant に記録されます。

## JWT の `jti` と時計の許容幅

ライブラリ内の JWT access-token verifier は、個別の leeway を設定しない場合、`tokens.DefaultLeeway = 30 秒` を `exp` と `iat` の両方に対称に適用します。OP の access-token revocation strategy が `None` 以外なら、registry / denylist が token identifier なしに失効を判定できないため `RequireJTI` も有効になります。`RevocationStrategyNone` では必須ではありません。これは DPoP / JAR / client assertion の replay retention とは別で、JWT のすべての利用に共通する 30 秒の `jti` cache があるわけではありません。

## passkey challenge の退役

passkey の registration / login は毎回新しい WebAuthn challenge を発行し、既定では絶対寿命 5 分の `Session` を返します。assertion が失敗すると authenticator orchestrator は factor の処理中 scratch を消し、署名済み `StateRef` の counter を進めてから失敗した state を保存します。これにより古い `StateRef` と challenge は一緒に退役し、拒否された assertion を interaction state の 10 分の寿命いっぱい replay できなくなります。成功した assertion は通常の credential 更新と clone-warning の規則に従います。

## remote JWKS の上限

登録済み `jwks_uri` から取得する RP JWKS には、次の 5 つの上限があります。

| 上限 | 値 |
|---|---|
| fetch 全体のタイムアウト | 5 秒 |
| 成功 cache の最大 TTL | 5 分 |
| 応答 body | 64 KiB |
| 宣言できる key 数 | 64 |
| プロセス全体で同時に読み込める異なる URL 数 | 64 |

不明な `kid` による強制 refresh は URL ごとに 20 秒に 1 回へ制限されます。cache の URL 数は成功 / 失敗を合わせて 256 件、失敗結果の negative cache は 5 秒です。これらは core の安全上の上限であり、上流 JWKS の可用性を保証するものではありません。key rotation はこの上限内で完了する運用にしてください。

## ここでの「リプレイ」とは

仕様文では replay は 1 語ですが、コード上の防御は 3 種類に分かれます。

**トークンリプレイ** — 同じ bearer 形式のクレデンシャルを 2 回提示する形です。認可コードは初回使用時に *消費* されます（`AuthorizationCodeStore` の該当行が使用済みに切り替わります）。リフレッシュトークンは引き換えのたびに *ローテーション* し、猶予期間が閉じた後に直前のトークンを提示すると、リユース検出によって失効カスケードが走ります。DPoP proof は `jti` で *重複検出* されます。まず nonce gate を通し、受理した proof を `ConsumedJTIStore` に commit するため、最初の proof が gate を通過した後に同じ `jti` を持つ proof を送ると `ErrProofReplayed` になります。

**リクエストリプレイ** — 同じ `/authorize` リクエストを同じパラメータで再送信する形です。PAR は一回限りの `request_uri` を発行するため、構造的にこのリプレイを防ぎます。`/authorize` がその URN を消費した時点で、レコードは `PushedAuthRequestStore` から消えます。JAR（`request=` でインライン渡しする request object）は同じ `ConsumedJTIStore` サブストアに対して `jti` 重複検出を行います。`jar:<clientID>:<jti>` 形式のキーは、request object の `exp` を verifier の `max-age` の下限と maximum-lifetime の上限にかけ、clock skew を加えた server-bounded な expiry 計算に従って保持されます。

**ログアウトリプレイ** — 同じ `logout_token` を RP に対して 2 度 POST する形です。Back-Channel Logout 1.0 §2.6 は重複検出の責務を *RP* 側に置きます。OP は 1 度だけ署名して配送し、各 RP は自分が観測した logout-token の `jti` を必要に応じて記録します。OP 側に logout-token のリプレイキャッシュを持たないのは、重複検出すべき境界が RP 側にあるからです。

この 3 つを併せて読むと、アーティファクトの *使われ方* が防御方法を決めていることが分かります。認可コードは消費する、リフレッシュトークンはローテーションする、DPoP / JAR / `client_assertion` は明示的な `jti` を共有の重複検出テーブルに記録する、ログアウトトークンは重複検出を受信側に委譲する、という形です。

## 運用上の前提

`ConsumedJTIStore` (`op/store/jti.go` で宣言) は `jti` ベースの防御がすべて経由する契約です。DPoP、JAR、`client_assertion` のいずれも同じサブストアの `Mark(ctx, key, expiresAt)` を呼びます。キーの名前空間（`jar:<clientID>:<jti>` と、DPoP / assertion 用の素の `jti`）によって衝突が避けられています。

複数インスタンス構成では、このサブストアを全インスタンスで共有するか、または特定の `jti` の存続期間中はその `jti` を同じインスタンスへルーティングする必要があります。複数レプリカそれぞれに in-memory 実装を持たせると、この防御は無効化されます。レプリカ A とレプリカ B が同じ proof を 1 度ずつ、合計 2 度受理してしまうためです。Redis / Memcached のような高速な共有キャッシュが標準的な選択肢で、これに伴う揮発 / 永続ストアの分離指針は [/ja/operations/multi-instance](/ja/operations/multi-instance) で扱っています。

`ConsumedJTIStore` はトランザクション対象の永続ストアの外側に明示的に置かれています（`op/store/tx.go` 参照）。操作は冪等です。最初に書いた側が勝ち、後続の書き込みは consumed として観測されます。cache が完全に消えた場合に replay が再び成立する時間は、各アーティファクト固有の受理境界までです。DPoP marker は許容された `iat` 範囲を、JAR marker は `exp` / `max-age` / maximum-lifetime の server-bounded な計算（と skew）を、client assertion はそれぞれの bounded な expiry 計算を基準に保持されます。token の寿命や browser interaction state は別の予算であり、意図的にこれより長くなります。

もう 1 つの運用上の前提は wall clock 自体です。すべてのレプリカは同じ OP コード・同じ既定値で動いていても、レプリカ間の時計が該当する猶予を超えてずれると、同じアーティファクトが新鮮かどうかについて判断が割れます。フリート全体の NTP 規律はセキュリティ姿勢の一部であり、付け足しではありません。

## エッジケース

**サマータイムや閏秒は無関係**です。OP が比較する protocol timestamp は Unix epoch 秒です。DST 移行や閏秒調整が epoch を動かすことはありません。表中の定数は `time.Duration` 値なので、60 秒の猶予は local time の移行をまたいでも 60 秒のままです。

**長寿命トークンと短い窓の組み合わせ**。リフレッシュトークンの既定は 30 日、ローテーション猶予は 60 秒です。この組み合わせは意図的なものです。長い寿命によって、妥当なネットワーク断絶下でもバックグラウンド同期クライアントを支えます。一方で短い猶予によって、漏洩した直前のトークンが正規クライアントのローテーション後に使える時間を抑え込みます。本ライブラリはネットワークの瞬断下でも、リプレイを黙って受理して可用性を優先するのではなく、リユース検出による失効カスケードを優先します。60 秒という窓は、典型的なモバイル端末の retry を覆える最小幅でありながら、直前のトークンが長く使える状態を残さない値として選ばれています。トレードオフの判断は [/ja/security/design-judgments](/ja/security/design-judgments) にあります。

**DPoP nonce と DPoP `iat`**。`iat` claim は *クライアント* が署名するため、クライアント側が短期に侵害されると、60 秒分の窓に対して有効な proof を事前生成される可能性があります。DPoP nonce（RFC 9449 §8）は、サーバ制御の新鮮性シグナルを追加してこの隙間を埋めるものです。クライアントは OP が返した nonce を次の要求で送り返さなければなりません。両者は独立に検証され、`iat` 窓を通過しても nonce 検証に失敗した proof は拒否されます。新鮮な nonce を持っていても、`iat` が古い proof も拒否されます。詳細なフローは [/ja/concepts/dpop](/ja/concepts/dpop) と [/ja/use-cases/dpop-nonce](/ja/use-cases/dpop-nonce) を参照してください。

**stale-nonce と `jti` 消費の順序**。DPoP 検証器は nonce ゲートを通過した *後* に `jti` を記録します。nonce 検証に失敗した proof は `ConsumedJTIStore` を進めないため、新鮮な nonce で retry したクライアントは同じ `jti` を 1 度だけ再提示できます。nonce ゲートを通過した proof がさらに新しい nonce で再提示された場合は、`jti` が既に記録されているため `ErrProofReplayed` が返ります。順序は `internal/dpop/verify.go` のインラインコメントに記載されています。

## 次に読む

- [/ja/concepts/dpop](/ja/concepts/dpop) — DPoP の `iat` / `jti` / nonce を詳細に
- [/ja/concepts/refresh-tokens](/ja/concepts/refresh-tokens) — ローテーション、猶予期間、リユース検出カスケード
- [/ja/security/design-judgments](/ja/security/design-judgments) — それぞれの窓がなぜこの値か、何を引き換えにしたか
- [/ja/operations/multi-instance](/ja/operations/multi-instance) — `ConsumedJTIStore` のレプリカ間共有
