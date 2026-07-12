---
title: ルーターへの組み込み
description: net/http、chi、gin 等で op.Provider を使う方法。
---

# ルーターへの組み込み

`op.New` は `*op.Provider` を返します。`*op.Provider` は `ServeHTTP` メソッドを持つため、標準の `http.Handler` として扱えます。ライブラリは listener を **所有せず**、どのルータを使うかにも **依存しません**。

## net/http、chi、gin で使う

::: code-group

```go [net/http]
mux := http.NewServeMux()
mux.Handle("/", provider)
http.ListenAndServe(":8080", mux)
```

```go [chi]
r := chi.NewRouter()
r.Mount("/", provider)
http.ListenAndServe(":8080", r)
```

```go [gin]
r := gin.New()
r.Any("/*path", gin.WrapH(provider))
http.ListenAndServe(":8080", r)
```

:::

## prefix の下で公開する

```go
op.New(
  op.WithMountPrefix("/auth"),
  /* ... */
)
```

`/authorize` は `/auth/authorize`、`/token` は `/auth/token` … となります。**Discovery (`/.well-known/openid-configuration`) は常にルートに公開されます** — OIDC Discovery 1.0 §4 の要請です。

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

空フィールドは既定を維持します。既定は OIDC Core 1.0 慣習に従い `/auth`、`/token`、`/userinfo`、`/end_session`、`/jwks` を置き、オプションで有効化されたプロトコル面として `/par`、`/introspect`、`/revoke`、`/register`、`/device_authorization`、`/bc-authorize`、`/grant_management` などを加えます。

## OP が公開 **しない** もの

OP がルータに公開するものは意図的に絞られています。

| OP が公開する | OP が公開しない |
|---|---|
| `/.well-known/openid-configuration` | `/metrics`（組み込み側が `promhttp` で公開） |
| `/jwks` | `/healthz`、`/readyz` |
| `/auth`、`/token`、`/userinfo` | リクエスト時間の histogram middleware |
| `/end_session` | OpenTelemetry の HTTP サーバ span middleware |
| オプション: `/par`、`/introspect`、`/revoke`、`/register`、`/device_authorization`、`/bc-authorize`、`/grant_management` | `/debug/pprof` の公開 |
| オプション: `/interaction/*`、`/session/*`（SPA driver 使用時） | 汎用の IP 別 rate limiter |

これは意図的です。OP は **業務** メトリクス / トレース / 監査イベントを `op.WithPrometheus`、`op.WithLogger`、`op.WithAuditLogger` 経由で、利用者が所有する registry / handler に流します。

**HTTP ライフサイクルの観測は組み込み側の責務です** — `otelhttp` や `promhttp.InstrumentHandler` などで、自分の SRE 規約に合わせてルータをラップしてください。

::: tip TLS / Proxy
OP は TLS 終端 ingress の背後で動く想定です。`op.WithTrustedProxies(cidrs ...)` で、`X-Forwarded-For` を提供する proxy の範囲を許可リスト化してください。

proxy 側でクライアント TLS を終端し、RFC 8705 の証明書結び付けアクセストークン用に証明書をヘッダ転送する場合は、`op.WithMTLSProxy(headerName, cidrs)` をあわせて指定します。
:::

## 次へ

- [使い方](/ja/use-cases/) — SPA、client_credentials、hot/cold ストレージ、MFA などの具体実装。
- [セキュリティ方針](/ja/security/posture) — cookie / CSRF / SSRF の既定、必要に応じた緩め方。
