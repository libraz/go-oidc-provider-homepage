---
title: ルータへのマウント
description: net/http、chi、gin 等で op.Provider を使う方法。
pageClass: pg-getting-started-mount
---

# ルータへのマウント

`op.New` は `*op.Provider` を返します。`*op.Provider` は `ServeHTTP` メソッドを持つため、標準の `http.Handler` として扱えます。ライブラリは listener を **所有せず**、どのルータを使うかにも **依存しません**。

OP は組み込み側のルータの 1 段下、自前のハンドラと並ぶ位置に入ります。ミドルウェアは OP も含めて外側から包み、OP が受け持つパス以外はすべて組み込み側のものです。

<svg role="img" aria-labelledby="mount-layers-title" viewBox="0 0 760 296" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="mount-layers-title">OP のハンドラは組み込み側のルータの内側、自前のハンドラと並ぶ位置に入る。listener とミドルウェアは両方を外側から包む。</title>
  <rect class="mt-layer" x="24" y="24" width="712" height="248" rx="10"/>
  <text class="mt-title" x="48" y="52">自前の listener</text>
  <text class="mt-hint" x="712" y="52" text-anchor="end">http.ListenAndServe</text>

  <rect class="mt-layer" x="56" y="64" width="648" height="184" rx="10"/>
  <text class="mt-title" x="80" y="92">自前のミドルウェア</text>
  <text class="mt-hint" x="680" y="92" text-anchor="end">otelhttp · promhttp · access log</text>

  <rect class="mt-layer" x="88" y="104" width="584" height="124" rx="10"/>
  <text class="mt-title" x="112" y="132">自前のルータ</text>
  <text class="mt-hint" x="648" y="132" text-anchor="end">net/http · chi · gin</text>

  <rect class="mt-box" x="112" y="140" width="252" height="76" rx="8"/>
  <text class="mt-title" x="238" y="164" text-anchor="middle">自前のハンドラ</text>
  <text class="mt-route" x="238" y="184" text-anchor="middle">/ · /api/* · /healthz</text>
  <text class="mt-route" x="238" y="202" text-anchor="middle">/metrics · /debug/pprof</text>

  <rect class="mt-op" x="396" y="140" width="252" height="76" rx="8"/>
  <text class="mt-title" x="522" y="164" text-anchor="middle">op.Provider</text>
  <text class="mt-route" x="522" y="184" text-anchor="middle">/oidc/* (mount prefix)</text>
  <text class="mt-route" x="522" y="202" text-anchor="middle">/.well-known/openid-configuration</text>
</svg>

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
  op.WithMountPrefix("/oidc"),
  /* ... */
)
```

既定の `/auth` エンドポイントは `/oidc/auth`、`/token` は `/oidc/token` … となります。**Discovery (`/.well-known/openid-configuration`) は常にルートに公開されます** — OIDC Discovery 1.0 §4 の要請です。

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

空フィールドは既定値を維持します。既定は OIDC Core 1.0 の慣習に従い `/auth`、`/token`、`/userinfo`、`/end_session`、`/jwks` です。ここに、オプションで有効化したプロトコルエンドポイント（`/par`、`/introspect`、`/revoke`、`/register`、`/device_authorization`、`/bc-authorize`、`/grant_management` など）が加わります。

## OP が公開 **しない** もの

OP が組み込み側のルータに載せるものは、意図的に絞ってあります。

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
