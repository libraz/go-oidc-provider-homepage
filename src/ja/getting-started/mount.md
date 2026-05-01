---
title: ルーターへのマウント
description: net/http、chi、gin 等への op.Provider のマウント方法。
---

# ルーターへのマウント

`op.New` は `*op.Provider` を返し、その `ServeHTTP` メソッドにより標準 `http.Handler` として振る舞います。ライブラリは listener を **所有せず**、どのルータを使っても **気にしません**。

## net/http

```go
mux := http.NewServeMux()
mux.Handle("/", provider)
http.ListenAndServe(":8080", mux)
```

## chi

```go
r := chi.NewRouter()
r.Mount("/", provider)
http.ListenAndServe(":8080", r)
```

## gin

```go
r := gin.New()
r.Any("/*path", gin.WrapH(provider))
http.ListenAndServe(":8080", r)
```

## prefix の下にマウント

```go
op.New(
  op.WithMountPrefix("/auth"),
  /* ... */
)
```

`/authorize` は `/auth/authorize`、`/token` は `/auth/token` … となります。**Discovery (`/.well-known/openid-configuration`) は常にルートにマウントされます** — OIDC Discovery 1.0 §4 の要請です。

## カスタムエンドポイントパス

```go
op.New(
  op.WithEndpoints(op.Endpoints{
    Authorize: "/oauth/authorize",
    Token:     "/oauth/token",
  }),
  /* ... */
)
```

空フィールドはデフォルトを維持。デフォルトは OIDC Core 1.0 慣習に従い `/auth`、`/token`、`/userinfo`、`/end_session`、`/jwks`、また各 feature が有効な場合に `/par`、`/introspect`、`/revoke`、`/register` を加えます。

## OP がマウント **しない** もの

OP がルータに置くものは意図的に絞られています:

| OP がマウントする | OP がマウントしない |
|---|---|
| `/.well-known/openid-configuration` | `/metrics`（あなたが `promhttp` でマウント） |
| `/jwks` | `/healthz`、`/readyz` |
| `/auth`、`/token`、`/userinfo` | request-duration histogram middleware |
| `/end_session` | OpenTelemetry の HTTP サーバスパンミドルウェア |
| オプション: `/par`、`/introspect`、`/revoke`、`/register` | `/debug/pprof` のマウント |
| オプション: `/interaction/*`、`/session/*`（SPA driver 使用時） | 汎用 per-IP rate limiter |

これは意図的です。OP は **業務** メトリクス / トレース / 監査イベントを `op.WithPrometheus`、`op.WithLogger`、`op.WithAuditLogger` 経由で、利用者が所有する registry / handler に流します。**HTTP ライフサイクルの観測は組み込み側の責務です** — `otelhttp` や `promhttp.InstrumentHandler` などで、自分の SRE 規約に合わせてルータをラップしてください。

::: tip TLS / Proxy
OP は TLS 終端 ingress の背後で動く想定です。`op.WithTrustedProxies(cidrs ...)` で `X-Forwarded-For` を提供する proxy の範囲を allow-list 化してください。proxy 側でクライアント TLS を終端してヘッダで証明書を転送する RFC 8705 mTLS クライアント認証を使う場合は、`op.WithMTLSProxy(headerName, cidrs)` をあわせて指定します。
:::

## 次へ

- [ユースケース](/ja/use-cases/) — SPA、client_credentials、hot/cold ストレージ、MFA などの具体実装。
- [セキュリティ方針](/ja/security/posture) — cookie / CSRF / SSRF のデフォルト、必要に応じた緩め方。
