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
| audit イベント | 各プロトコル動作([カタログ](/ja/reference/audit-events)) | `WithAuditLogger(*slog.Logger)` | SOC パイプライン |
| metrics | OIDC の業務カウンタ | `WithPrometheus(prometheus.Registerer)` | `/metrics` ルート |
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

`WithLogger` を渡さない場合は `slog.Default()` 経由でログを出します。

## audit ログ

audit イベントは保管期間・索引・アクセス制御が運用ログとは違うので、独立した sink にします:

```go
auditFile, _ := os.OpenFile("/var/log/op/audit.jsonl",
    os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
auditLogger := slog.New(slog.NewJSONHandler(auditFile, nil))

op.New(
    /* ... */
    op.WithAuditLogger(auditLogger),
)
```

各イベントは、`msg = "<event.name>"` と共通属性(`request_id`、`subject`、`client_id`、`extras`)を持つ JSON 1 行として記録されます。全イベント名は [audit イベントカタログ](/ja/reference/audit-events) を参照してください。

::: tip 1 つの stream を複数 sink へ
1 つの `*slog.Logger` を、ファンアウト用のハンドラを通して、ファイル + Loki + Splunk に同時に流せます。OP は `logger.LogAttrs(...)` を呼ぶだけです。
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

ライブラリは `/metrics` をマウントしません。ルートと境界はあなたが選択します。カウンタは audit カタログと同じ範囲に絞られています (厳選サブセット。[`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics) を参照)。

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
段階別スパンは計画していますが、pre-v1.0 の段階では公開表面を意図的に小さく保っています。同じカバレッジを高カーディナリティと引き換えに欲しい場合は、audit イベントカタログ(イベント単位の発火) を使えます。
:::

## リクエスト ID

OP は `X-Request-ID` および `Traceparent` ヘッダを、各 audit イベントと各運用ログ行に伝播します。どちらも無ければ、リクエストごとに UUID を生成します。

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
| `refresh.replay_detected` の発生率 | audit log → Loki / ES | 0 超(非ゼロ自体が要調査) |
| `bcl.no_sessions_for_subject` の発生率 | audit log | `posture=durable` 環境でのスパイク |
| アクティブセッション数 | ストアの query または自前 metric | 30 % 超の低下 |
| JWKS リクエスト率 | HTTP ミドルウェア | RP キャッシュの健全性指標 |

最初の 3 つが本番異常の S/N が高い指標です。4 つ目はストア drift。残り 2 つは RP 側の regression を捕まえます。

## ログ保持

| 系統 | 典型保持期間 |
|---|---|
| 運用 | 7 〜 30 日 |
| audit | **コンプライアンス要件次第**。典型的には 1 〜 7 年 |
| metrics | 高解像度で 30 〜 90 日、その後はロールアップ |

audit はロングテールでコストの掛かる系統です。保管はそれ用に分離して見積もってください。1 イベント自体は小さいですが、忙しい OP では量が多くなります。
