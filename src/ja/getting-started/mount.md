---
title: ルータへのマウント
description: net/http、chi、gin 等で op.Provider を使う方法。
pageClass: pg-getting-started-mount
---

# ルータへのマウント

`op.New` は `*op.Provider` を返します。`*op.Provider` は `ServeHTTP` メソッドを持つため、標準の `http.Handler` として扱えます。ライブラリは listener を **所有せず**、どのルータを使うかにも **依存しません**。

OP は組み込み側のルータの 1 段下、自前のハンドラと並ぶ位置に入ります。ミドルウェアは OP も含めて外側から包み、OP が受け持つパス以外はすべて組み込み側のものです。

<figure class="fig">
  <div class="fig-head">OP がサーバのどこに入るか</div>
  <svg class="fig-svg" role="img" aria-labelledby="mount-title" viewBox="0 0 960 300" xmlns="http://www.w3.org/2000/svg">
    <title id="mount-title">OP のハンドラは組み込み側のルータの内側、自前のハンドラと並ぶ位置に入ります。listener とミドルウェアが両方を外側から包むため、追加の実装なしに OP のエンドポイントまで計測とアクセスログが届きます。</title>
    <rect class="fg-frame" x="36" y="24" width="888" height="262" rx="10"/>
    <text class="fg-lbl" x="52" y="46">自前の listener</text>
    <text class="fg-mxs" x="176" y="46">http.ListenAndServe</text>
    <rect class="fg-frame" x="56" y="58" width="848" height="208" rx="10"/>
    <text class="fg-lbl" x="72" y="80">自前のミドルウェア</text>
    <text class="fg-mxs" x="216" y="80">otelhttp · promhttp · access log</text>
    <rect class="fg-frame" x="76" y="92" width="808" height="154" rx="10"/>
    <text class="fg-lbl" x="92" y="114">自前のルータ</text>
    <text class="fg-mxs" x="196" y="114">net/http · chi · gin</text>
    <rect class="fg-box" x="96" y="128" width="374" height="98" rx="8"/>
    <text class="fg-t2" x="116" y="154">自前のハンドラ</text>
    <text class="fg-mxs" x="116" y="180">/ · /api/* · /healthz</text>
    <text class="fg-mxs" x="116" y="200">/metrics · /debug/pprof</text>
    <text class="fg-xs" x="116" y="218">OP が関与しない部分はすべてここ</text>
    <rect class="fg-box fg-box--accent" x="490" y="128" width="374" height="98" rx="8"/>
    <text class="fg-t2 fg-accent" x="510" y="154">op.Provider</text>
    <text class="fg-mxs" x="510" y="180">/oidc/* — マウント先の prefix は任意</text>
    <text class="fg-mxs" x="510" y="200">discovery — issuer に応じたパス</text>
    <text class="fg-xs" x="510" y="218">占有するのは 1 つの subtree だけ</text>
  </svg>
  <figcaption class="fig-note">OP が占有するのは 1 つの subtree だけで、その外側には触れません。ホストだけの issuer では discovery はホストのルートに公開されますが、パスを含む issuer では RFC 8414 と OpenID Connect Discovery が定める場所にも公開されます。外側を包む部分はすべて組み込み側のもので、これまでどおり動きます。</figcaption>
</figure>

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

既定の `/auth` エンドポイントは `/oidc/auth`、`/token` は `/oidc/token` … となります。`WithMountPrefix` が変えるのは issuer 相対のプロトコルパスで、discovery のパスは変えません。ホストだけの issuer では discovery は `/.well-known/openid-configuration` です。issuer にパスが含まれる場合は、RFC 8414 の位置（`/.well-known/openid-configuration/<issuer-path>`）と OIDC Discovery 1.0 §4 の位置（`/<issuer-path>/.well-known/openid-configuration`）の両方で公開します。

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
| discovery（issuer に応じたパス） | `/metrics`（組み込み側が `promhttp` で公開） |
| `/jwks` | `/healthz`、`/readyz` |
| `/auth`、`/token`、`/userinfo` | リクエスト時間の histogram middleware |
| `/end_session` | OpenTelemetry の HTTP サーバ span middleware |
| オプション: `/par`、`/introspect`、`/revoke`、`/register`、`/device_authorization`、`/bc-authorize`、`/grant_management` | `/debug/pprof` の公開 |
| オプション: `/interaction/*`、`/session/*`（SPA driver 使用時） | 汎用の IP 別 rate limiter |

これは意図的です。OP は **業務** メトリクスとログ / 監査イベントを `op.WithPrometheus`、`op.WithLogger`、`op.WithAuditLogger` 経由で、利用者が所有する sink に流します。OpenTelemetry のスパンは生成しません。

**HTTP ライフサイクルの観測は組み込み側の責務です** — `otelhttp` や `promhttp.InstrumentHandler` などで、自分の SRE 規約に合わせてルータをラップしてください。

::: tip TLS / Proxy
OP は TLS 終端 ingress の背後で動く想定です。`op.WithTrustedProxies(cidrs ...)` で、`X-Forwarded-For` を提供する proxy の範囲を許可リスト化してください。

proxy 側でクライアント TLS を終端し、RFC 8705 の証明書結び付けアクセストークン用に証明書をヘッダ転送する場合は、`op.WithMTLSProxy(headerName, cidrs)` をあわせて指定します。
:::

## 次へ

- [使い方](/ja/use-cases/) — SPA、client_credentials、hot/cold ストレージ、MFA などの具体実装。
- [セキュリティ方針](/ja/security/posture) — cookie / CSRF / SSRF の既定、必要に応じた緩め方。
