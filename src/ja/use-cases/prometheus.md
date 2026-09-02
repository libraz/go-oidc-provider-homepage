---
title: Prometheus メトリクス
description: issuer を固定ラベルに持つ業務メトリクスを組み込み側の registry に登録 — OP は /metrics をマウントしません。
---

# 使い方 — Prometheus メトリクス

OIDC 業務系メトリクス（トークン発行、refresh rotation、監査イベント数）を既存 Prometheus スタックに乗せたい。ただしライブラリが `/metrics` を勝手にマウントするのは避けたい — それは利用者側のルータの仕事です。

> **ソース:** [`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics)

## 契約

```go
import (
  "github.com/prometheus/client_golang/prometheus"
  "github.com/prometheus/client_golang/prometheus/promhttp"
  "github.com/libraz/go-oidc-provider/op"
)

reg := prometheus.NewRegistry()

provider, err := op.New(
  /* 必須オプション */
  op.WithPrometheus(reg), // <-- ライブラリはここに collector を登録する
)

// 同じ registry を使ってルータに /metrics をマウントする:
mux := http.NewServeMux()
mux.Handle("/", provider)
mux.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
```

::: warning ライブラリは業務系メトリクスのみ、HTTP ライフサイクルは観測しない
ライブラリは **OIDC 業務系** のカウンタ（トークン発行、refresh rotation、監査イベント数、認証結果など）のみを発行します。次のものは **発行しません**。

- HTTP リクエスト所要時間ヒストグラム
- HTTP リクエスト / レスポンスのサイズ
- ステータスコード分布
- panic recovery カウンタ

これらは組み込み側の責務です — OIDC ドメインではなく HTTP サーバドメインの関心事だからです。SRE 規約に合わせて `promhttp.InstrumentHandler*` ミドルウェア（トレーシングが必要なら `otelhttp.NewMiddleware`）でルータをラップしてください。
:::

## ライブラリが export するもの

公開する counter は意図的に絞ってあり、安定しています。すべてのメトリクスに `op.WithIssuer` 由来の固定 `issuer` label が付きます。そのため複数 issuer は 1 つの registry を共有しても別 series になりますが、同じ issuer の provider を同じ registry に登録すると descriptor が衝突します。登録は all-or-nothing で、collector の登録途中に失敗した場合は、その呼び出しで先に登録した collector も解除されてから `op.New` がエラーを返します。

実名は `oidc_*` 接頭辞で、最新一覧は example 側を参照してください。カテゴリは次のとおりです。

| カテゴリ | counter / label |
|---|---|
| Token endpoint | `oidc_token_issued_total{issuer,grant_type,client_id}`、`oidc_tokens_refreshed_total{issuer,client_id}`、refresh / authorization-code replay 検知、method / reason 別の client-auth 失敗 |
| 認証 | `oidc_login_attempts_total{issuer,factor,result}`。primary login と MFA の試行を `factor` で区別 |
| 拡張フロー | DCR、Device Authorization、Device Code、CIBA、Token Exchange のイベントカウンタ。label は audit event の sub-name |
| Logout / revocation | back-channel 配送結果、grant 由来の eligible RP target が 0 件になった session を伴う logout 通知（`bcl.no_sessions_for_subject`）、token / refresh-chain / grant revocation の副作用失敗 |
| 運用シグナル | introspection 認証エラー、DPoP loose-method-case bridge の受理、retired JWKS `kid` の提示 |

metrics bridge は audit emitter から供給されます。1 回の audit event が slog stream と対応 counter の両方を更新するため、組み込み側が metrics 用に別 emit する必要はありません。

Dynamic client の `client_id` は生の label として出しません。label に出るのは静的にシード済みの client ID だけです。DCR 由来または未知の client は空の `client_id` バケットに畳み、cardinality を上限付きに保ちます。

`oidc_token_issued_total` の `grant_type` は任意のリクエスト label をコピーせず、refresh chain に永続化された origin から決まります。値は `authorization_code`、`device_code`、`ciba`、`custom_grant` のいずれかで、origin が無い・閉じた集合外なら `unknown` です。refresh rotation は独自の `oidc_tokens_refreshed_total` で数えます。

## なぜ「外付け」で、束ね込まないのか

理由は 2 つあります。

1. **registry の所有権** — 組み込み側はカーディナリティと collector 一覧の監査を 1 か所にまとめるため、プロセス全体で単一の `prometheus.Registry` を維持することが多いものです。ライブラリが自前 registry を作るとそれを分断してしまいます。
2. **パス / 認証の所有権** — `/metrics` は認証ゲートの背後、あるいは別 listener 専用に置かれることが多く、組み込み側の選択を予測できません。パスのマウントは組み込み側に委ねます。

同じ分離方針はトレーシングにも適用されます。`op.WithLogger` / `op.WithAuditLogger` は `*slog.Logger` を受け取りますが、HTTP サーバセマンティクスの OpenTelemetry スパンは組み込み側の `otelhttp.NewMiddleware` 側に委ねます。OP は業務系・リクエスト / レスポンスのライフサイクルを含め、組み込みの tracing span を発行しません。追加の業務段階を測る場合は組み込み側で計装してください。
