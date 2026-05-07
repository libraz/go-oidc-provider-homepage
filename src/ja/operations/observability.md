---
title: observability
description: OP に対する logging / tracing / Prometheus の組み込み。
outline: 2
---

# observability

本番で必要な可視化は 3 系統あります:

| 系統 | 載るもの | OP 側の差し込み口 | 組み込み側の責務 |
|---|---|---|---|
| 運用ログ | リクエストエラー、設定の問題、起動時の状態 | `WithLogger(*slog.Logger)` | 構造化ログの送り先 |
| 監査イベント | 各プロトコル動作([カタログ](/ja/reference/audit-events)) | `WithAuditLogger(*slog.Logger)` | SOC パイプライン |
| metrics | OIDC の業務カウンタ | `WithPrometheus(*prometheus.Registry)` | `/metrics` ルート |
| tracing | リクエストスパン | 内蔵なし | `http.Handler` を `otelhttp.NewMiddleware` でラップ |

ライブラリはこれらを意図的に分離しています。任意のサブセットだけを組み込むことができます。

## 構造化ログ

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

op.New(
    /* ... */
    op.WithLogger(logger),
)
```

運用ログがカバーする範囲:

- 起動時の設定警告。
- エンドポイント内部のエラー(典型的には `IsServerError(err)` が一致するもの — [エラーカタログ](/ja/reference/errors) を参照)。
- ストアバックエンドの障害。

`WithLogger` を渡さない場合、ライブラリはログを破棄します(`slog.Default()` へのフォールバックはしません)。渡した handler は redaction ミドルウェアで自動的にラップされ、OAuth/OIDC のシークレットらしい属性(`access_token`、`refresh_token`、`code`、`code_verifier`、`client_secret`、`state`、`nonce`、`dpop`、`authorization`、`cookie`、`set-cookie` …)は handler に到達する前にマスクされます。

## 監査ログ

監査イベントは保管期間・索引・アクセス制御が運用ログとは違うので、独立した出力先(sink)にします:

```go
auditFile, _ := os.OpenFile("/var/log/op/audit.jsonl",
    os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
auditLogger := slog.New(slog.NewJSONHandler(auditFile, nil))

op.New(
    /* ... */
    op.WithAuditLogger(auditLogger),
)
```

各イベントは、`msg = "<event.name>"` と共通属性(`request_id`、`subject`、`client_id`、`extras`)を持つ JSON 1 行として記録されます。全イベント名は [監査イベントカタログ](/ja/reference/audit-events) を参照してください。

::: tip 1 本のストリームを複数の出力先へ
1 つの `*slog.Logger` を fan-out 用のハンドラに通せば、ファイル + Loki + Splunk に同時に流せます。OP 側は `logger.LogAttrs(...)` を呼ぶだけです。
:::

## Prometheus metrics

```go
reg := prometheus.NewRegistry()

op.New(
    /* ... */
    op.WithPrometheus(reg),
)

// /metrics は好きなルートにマウント。通常は公開 OP のリスナでは
// なく、認可境界の裏に置く。
mux := http.NewServeMux()
mux.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
go http.ListenAndServe("127.0.0.1:9090", mux)
```

ライブラリは `/metrics` をマウントしません。ルートと境界は組み込み側が選択します。カウンタは監査カタログと同じ範囲に絞られています(厳選した部分集合。[`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics) を参照)。

### OP が出**さない** metrics

これらは OP ではなく HTTP ミドルウェアの領域です:

- HTTP リクエスト時間ヒストグラム — OP のハンドラの周りに `promhttp.InstrumentHandlerDuration` をかぶせてください。
- HTTP ステータスコードカウンタ — 同上。
- in-flight リクエストゲージ — 同上。

組み込みパターン:

```go
inFlight := prometheus.NewGauge(prometheus.GaugeOpts{
    Name: "op_http_requests_in_flight",
})
duration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
    Name: "op_http_request_duration_seconds",
}, []string{"code", "method"})
reg.MustRegister(inFlight, duration)

instrumented := promhttp.InstrumentHandlerInFlight(inFlight,
    promhttp.InstrumentHandlerDuration(duration, opHandler))

http.Handle("/", instrumented)
```

この分離があるおかげで、HTTP 層を差し替え(chi、gin、fiber など) ても、OP 側の metrics には手を入れる必要がありません。

## tracing

OP は `http.Handler` を返します。OpenTelemetry の HTTP ミドルウェアで 1 度だけラップしてください:

```go
import "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

http.Handle("/", otelhttp.NewHandler(opHandler, "oidc-op"))
```

リクエストのライフサイクルがスパンでカバーされます。エンドポイント内部の child span は現状は発火していません。「`/token` の中で PKCE 検証にどれだけかかったか」のような段階別の trace は、HTTP 層から見える粒度に留まります。

::: info 将来の tracing
段階別スパンは計画していますが、pre-v1.0 の段階では公開表面を意図的に小さく保っています。同等のカバレッジを高カーディナリティと引き換えに欲しい場合は、監査イベントカタログ(イベント単位の発火)を使えます。
:::

## リクエスト ID

OP は `X-Request-ID` および `Traceparent` ヘッダを、各監査イベントと各運用ログ行に伝播します。どちらも無ければ、リクエストごとに UUID を生成します。

レスポンスにも同じ ID を返したい(RP のログと相関を取りたい)場合は、組み込み側で次のようにラップします:

```go
http.Handle("/", requestIDMiddleware(opHandler))

func requestIDMiddleware(h http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        rid := r.Header.Get("X-Request-ID")
        if rid == "" {
            rid = newUUID()
            r.Header.Set("X-Request-ID", rid)
        }
        w.Header().Set("X-Request-ID", rid)
        h.ServeHTTP(w, r)
    })
}
```

## 推奨ダッシュボード

最低限の本番ダッシュボードは以下を出します:

| パネル | ソース | アラート閾値 |
|---|---|---|
| `grant_type` 別のトークン発行レート | Prometheus カウンタ | ベースライン比 50 % 以上の持続的な低下 |
| `/token` の 5xx 率 | HTTP ミドルウェアのヒストグラム | 5 分窓で 0.5 % 超 |
| `refresh.replay_detected` の発生率 | 監査ログ → Loki / ES | 0 超(非ゼロ自体が要調査) |
| `bcl.no_sessions_for_subject` の発生率 | 監査ログ | `posture=durable` 環境でのスパイク |
| アクティブセッション数 | ストアの query または自前 metric | 30 % 超の低下 |
| JWKS リクエスト率 | HTTP ミドルウェア | RP キャッシュの健全性指標 |

最初の 3 つが本番異常の S/N が高い指標です。4 つ目はストア drift。残り 2 つは RP 側の regression を捕まえます。

## レート制限と濫用シグナル

本ライブラリは `/authorize`・`/par`・`/token`・`/userinfo` その他の公開エンドポイントに対して、組み込みのレート制限を **同梱していません**。`WithRateLimit` のようなオプションも存在しません。レート制限は運用側の役割です — リバースプロキシ（NGINX、Envoy、Traefik）、エッジサービス（Cloudflare、Fastly）、あるいは `op.Handler()` の前段ミドルウェアが、IP 単位・クライアント単位のリクエスト枠を持つべき場所です。ライブラリ側にあるかのように書くのは誤った期待を生むだけです。

ライブラリが代わりに発行しているのは、実際の制限がどこに置かれていても濫用パイプラインが消費して攻撃者をスコアリングできる、構造化された監査イベント群です:

| 監査イベント | 定数 | 何を示すか |
|---|---|---|
| `pkce.violation` | `op.AuditPKCEViolation` | コード交換が PKCE 検証に失敗。単一 IP / クライアントから繰り返すなら、盗んだ認可コードを試している攻撃者の強いシグナル。 |
| `redirect_uri.mismatch` | `op.AuditRedirectURIMismatch` | 提示された `redirect_uri` が登録 URI と一致しない。繰り返しは既知の `client_id` に対する偵察。 |
| `client_authn.failure` | `op.AuditClientAuthnFailure` | `/token`・`/par`・`/introspect`・`/revoke` でのクライアント認証失敗。バーストは credential のブルートフォース。 |
| `device_code.verification.user_code_brute_force` | `op.AuditDeviceCodeUserCodeBruteForce` | デバイスコード確認画面で user_code が総当たりされている。`devicecodekit` がデバイスコード単位のロックアウトを内蔵しています — 確認ヘルパは [Device Code](/ja/use-cases/device-code) を参照。 |
| `ciba.poll_abuse.lockout` | `op.AuditCIBAPollAbuseLockout` | CIBA のポーリングカウンタが `auth_req_id` 単位の閾値を超えた。ライブラリはワイヤ応答を `access_denied` で拒否し、SOC ツールが相関できるようイベントを発行します。 |
| `rate_limit.exceeded` | `op.AuditRateLimitExceeded` | 組み込み側のレート制限ミドルウェアから発火させるための予約イベント。ライブラリは定数だけ定義してカタログの一貫性を保ちますが、内部経路から発火させはしません。 |
| `rate_limit.bypassed` | `op.AuditRateLimitBypassed` | 同じ趣旨 — 組み込み側ミドルウェアが明示的な bypass（許可リスト済み IP、内部プローブ等）を記録するためのもの。 |

最後の 2 つは、ライブラリが運用側ミドルウェアと共有する語彙であって、内部イベントではありません。リバースプロキシやミドルウェアが枠を執行してリクエストを通した（あるいは拒否した）ときに、同じ監査ロガーへこれらを発行すれば、解析パイプラインが 1 本の一貫したストリームを観測できます。

::: tip 推奨パターン
1. **リバースプロキシまたはエッジサービスでグローバルなレートを執行する** — 例えば `/token` は IP 当たり 100 req/s、`/par` はもっと低めに。これが攻撃者にリクエストを「コスト」として支払わせる実機構です。
2. **監査パイプラインがバーストにアラートを出す** — 単一 IP・ASN・`client_id` から `pkce.violation`・`redirect_uri.mismatch`・`client_authn.failure` が立て続けに来たとき。これらが「誰かが OP を突いている」の S/N が高いイベントです。
3. **クライアント単位の許可リストで攻撃面を上流で削る。** `WithCORSOrigins` も `redirect_uris` レジストリも許可リストとして働きます — 小さく保つほど、設定ミスや侵害されたクライアントが晒す攻撃面は減ります。
:::

### ライブラリが内部でロックアウトしている挙動

汎用の IP 単位レート制限では塞げない 3 つの濫用経路だけは、ライブラリ側にロックアウトが組み込まれています — 攻撃者は IP を安価に切り替えられ、保護対象がエントロピーの低いコードや subject 単位の credential（任意の URL ではない）だからです:

- **ログインのブルートフォース（要素跨ぎ）。** `op.WithAuthnLockoutStore` を組み込むと、組み込みの第 2 要素 `Step`（TOTP、メール OTP、パスワード）が同じ subject 単位カウンタを参照するので、攻撃者が要素を切り替えて推測予算を 2 倍にすることはできません。ログインフローは失敗ステップごとに `op.AuditLoginFailed`（最終的に成功した時点で `op.AuditLoginSuccess`）を発火しますが、失敗ストリームを無制限に流さないのはこのロックアウト層の役目です。
- **Device Code user_code のブルートフォース。** `op.devicecodekit` パッケージが `device_code` ごとの strike カウンタを持ちます。一定回数のミスマッチで verification helper が短絡し、strike ごとに `op.AuditDeviceCodeUserCodeBruteForce` を発火します。ユーザに短いコードを手で打たせる UX を壊さずに防御するには、これしか方法がありません。
- **CIBA poll abuse。** トークンエンドポイントは単一 `auth_req_id` が許容ケイデンスを超えてポーリングされた回数を数えます。閾値を超えると、リクエストストアの `Deny` を `reason="poll_abuse"` で呼び、ワイヤ応答は `access_denied` になり、`op.AuditCIBAPollAbuseLockout` が発火します。グローバルなレート制限で行儀の良い RP まで巻き添えにすることなく、病的な RP だけを止められます。

これらのゲートはいずれも **専用の** 監査イベントを発火します — `rate_limit.exceeded` / `rate_limit.bypassed` ではありません。この分担は意図的です:

| 区分 | 執行する側 | 観測されるイベント |
|---|---|---|
| 汎用 HTTP レート制限（IP 単位、エンドポイント単位、`client_id` 単位） | 組み込み側ミドルウェア（リバースプロキシ、ゲートウェイ、Go ハンドラチェーン） | `op.AuditRateLimitExceeded` / `op.AuditRateLimitBypassed` — 組み込み側が OP の監査ロガーに発火させる |
| 用途特化のブルートフォース防御（ログイン、user_code、ポーリングケイデンス） | ライブラリ内部 | `op.AuditLoginFailed`、`op.AuditDeviceCodeUserCodeBruteForce`、`op.AuditCIBAPollAbuseLockout` |

それ以外 — PKCE 失敗のバースト、`redirect_uri` ミスマッチの繰り返し、`client_authn` 失敗の継続 — は監査イベントとしては観測できますが、ライブラリ側で執行はしていません。これは意図的な分担です。OP は構造化シグナルを発行する側、運用側はそれに対する応答（ブロック、スロットル、ページング）を決める側、という切り分けです。

## ログ保持

| 系統 | 典型保持期間 |
|---|---|
| 運用 | 7 〜 30 日 |
| audit | **コンプライアンス要件次第**。典型的には 1 〜 7 年 |
| metrics | 高解像度で 30 〜 90 日、その後はロールアップ |

監査ログはロングテールでコストの掛かる系統です。保管はそれ用に分離して見積もってください。1 イベント自体は小さいですが、高負荷な OP では量が多くなります。
