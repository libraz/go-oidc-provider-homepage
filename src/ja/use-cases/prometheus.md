---
title: Prometheus メトリクス
description: 厳選した業務メトリクスを組み込み側の registry に登録 — OP は /metrics をマウントしません。
---

# ユースケース — Prometheus メトリクス

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

公開する counter は意図的に絞ってあり、安定しています。実名は `oidc_*` 接頭辞で、最新一覧は example 側を参照してください。カテゴリは次のとおり。

| カテゴリ | counter / label |
|---|---|
| Token endpoint | `oidc_token_issued_total{grant_type,client_id}`、`oidc_tokens_refreshed_total{client_id}`、refresh / authorization-code replay 検知、method / reason 別の client-auth 失敗 |
| 認証 | result / authenticator 別の login attempt |
| 拡張フロー | DCR、Device Authorization、Device Code、CIBA、Token Exchange のイベントカウンタ。label は audit event の sub-name |
| Logout / revocation | back-channel 配送結果、session が無い fan-out gap、token / refresh-chain / grant revocation の副作用失敗 |
| 運用シグナル | introspection 認証エラー、DPoP loose-method-case bridge の受理、retired JWKS `kid` の提示 |

metrics bridge は audit emitter から供給されます。1 回の audit event が slog stream と対応 counter の両方を更新するため、組み込み側が metrics 用に別 emit する必要はありません。

Dynamic client の `client_id` は生の label として出しません。label に出るのは静的にシード済みの client ID だけです。DCR 由来または未知の client は空の `client_id` バケットに畳み、cardinality を上限付きに保ちます。

## なぜ「外付け」で、束ね込まないのか

理由は 2 つあります。

1. **registry の所有権** — 組み込み側はカーディナリティと collector 一覧の監査を 1 か所にまとめるため、プロセス全体で単一の `prometheus.Registry` を維持することが多いものです。ライブラリが自前 registry を作るとそれを分断してしまいます。
2. **パス / 認証の所有権** — `/metrics` は認証ゲートの背後、あるいは別 listener 専用に置かれることが多く、組み込み側の選択を予測できません。パスのマウントは組み込み側に委ねます。

同じ分離方針はトレーシングにも適用されます。`op.WithLogger` / `op.WithAuditLogger` は `*slog.Logger` を受け取りますが、HTTP サーバセマンティクスの OpenTelemetry スパンは組み込み側の `otelhttp.NewMiddleware` 側に委ねます。OP は組み込み側がトレーシングを設定したときでも **業務系スパン** のみを発行し、リクエスト / レスポンスのライフサイクルスパンは発行しません。
