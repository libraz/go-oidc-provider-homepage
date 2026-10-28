---
title: ルータへのマウント
description: net/http、chi、gin 等で op.Provider を使う方法。
pageClass: pg-getting-started-mount
---

# ルータへのマウント

`op.New` は `*op.Provider` を返します。`ServeHTTP` メソッドを持つので、標準の `http.Handler` としてそのまま使えます。ライブラリは listener を持たず、ルータも選びません。

OP は、組み込み側のルータの中で自前のハンドラと並ぶ位置に入ります。ミドルウェアは OP も外側から包み、OP が受け持たないパスはすべて組み込み側のものです。

<figure class="fig">
  <div class="fig-head">OP がサーバのどこに入るか</div>
  <svg class="fig-svg" role="img" aria-labelledby="mount-title" viewBox="0 0 960 488" xmlns="http://www.w3.org/2000/svg">
    <title id="mount-title">OP のハンドラは組み込み側のルータの内側、自前のハンドラと並ぶ位置に入ります。listener とミドルウェアが両方を外側から包むため、追加の実装なしに OP のエンドポイントまで計測とアクセスログが届きます。</title>
    <!-- request path: listener, middleware, router -->
    <rect class="fg-box" x="32" y="24" width="896" height="72" rx="8"/>
    <text class="fg-t" x="48" y="52">自前の listener</text>
    <text class="fg-mxs" x="48" y="76">http.ListenAndServe</text>
    <path class="fg-edge" d="M480,96 V136" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="136" width="896" height="72" rx="8"/>
    <text class="fg-t" x="48" y="164">自前のミドルウェア</text>
    <text class="fg-mxs" x="48" y="188">otelhttp · promhttp · access log</text>
    <path class="fg-edge" d="M480,208 V248" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="248" width="896" height="72" rx="8"/>
    <text class="fg-t" x="48" y="276">自前のルータ</text>
    <text class="fg-mxs" x="48" y="300">net/http · chi · gin</text>
    <!-- router dispatches to two subtrees -->
    <path class="fg-leader" d="M480,320 V344 M244,344 H716"/>
    <path class="fg-edge fg-edge--thin" d="M244,344 V368" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M716,344 V368" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="368" width="424" height="96" rx="8"/>
    <text class="fg-t" x="48" y="396">自前のハンドラ</text>
    <text class="fg-mxs" x="48" y="420">/ · /api/* · /healthz · /metrics</text>
    <text class="fg-s" x="48" y="444">OP が関与しない部分はすべてここ</text>
    <rect class="fg-box fg-box--accent" x="504" y="368" width="424" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="520" y="396">op.Provider</text>
    <text class="fg-mxs" x="520" y="420">/oidc/*</text>
    <text class="fg-s" x="520" y="444">選んだ mount prefix 配下の subtree 1 つだけ</text>
  </svg>
  <figcaption class="fig-note">リクエストはルータが振り分ける前に listener とミドルウェアを通るので、計測とアクセスログは OP にも届きます。OP が占有するのは 1 つの subtree だけで、その外側には触れません。ホストだけの issuer では discovery はホストのルートに公開されますが、パスを含む issuer では RFC 8414 と OpenID Connect Discovery が定める場所にも公開されます。</figcaption>
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

## URL の prefix を決める

ハンドラは完全なリクエストパスで振り分けます。ルータのルートに載せ、エンドポイントの置き場所はライブラリに任せてください。`http.StripPrefix` で包むと、削られたパスがどのエンドポイントにも一致しなくなります。エンドポイントを動かすには `WithMountPrefix` を使います。

```go
op.New(
  op.WithMountPrefix("/"), // 既定は "/oidc"
  /* ... */
)
```

既定の prefix `/oidc` では、エンドポイント `/auth` が `/oidc/auth`、`/token` が `/oidc/token` になります。issuer URL にパスが含まれる場合は、そのパスが先頭に付きます。mount prefix が動かすのはプロトコルのエンドポイントだけで、discovery ドキュメントの位置は動きません。

| issuer | mount prefix | token エンドポイント | discovery ドキュメント |
|---|---|---|---|
| `https://op.example.com` | `/oidc`（既定） | `/oidc/token` | `/.well-known/openid-configuration` |
| `https://op.example.com` | `/` | `/token` | `/.well-known/openid-configuration` |
| `https://example.com/tenant` | `/oidc` | `/tenant/oidc/token` | `/.well-known/openid-configuration/tenant` と `/tenant/.well-known/openid-configuration` |

パスを持つ issuer は、RFC 8414 の位置と OpenID Connect Discovery 1.0 §4 の位置のどちらからも探されるため、OP は両方で公開します。

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

空フィールドは既定値のままで、変更したパスは discovery にそのまま載ります。既定は `/auth`、`/token`、`/userinfo`、`/end_session`、`/jwks` です。機能を有効にしたときだけ存在するエンドポイントとして、`/par`、`/introspect`、`/revoke`、`/register`、`/device_authorization`、`/bc-authorize`、`/grant_management` があります。上書きしたパスどうしが衝突すると、`op.New` は error を返します。

## OP が公開 **しない** もの

OP がルータに載せるものは、意図的に絞ってあります。

| OP が公開する | OP が公開しない |
|---|---|
| discovery（issuer に応じたパス） | `/metrics`（組み込み側が `promhttp` で公開） |
| `/jwks` | `/healthz`、`/readyz` |
| `/auth`、`/token`、`/userinfo` | リクエスト時間の histogram middleware |
| `/end_session` | OpenTelemetry の HTTP サーバ span middleware |
| オプション: `/par`、`/introspect`、`/revoke`、`/register`、`/device_authorization`、`/bc-authorize`、`/grant_management` | `/debug/pprof` の公開 |
| `/interaction/{uid}`（ログイン・同意画面）。`WithSPAUI` を使うときは `LoginMount` 配下のパス | 汎用の IP 別 rate limiter |

OP は **業務** メトリクスとログ・監査イベントを、`op.WithPrometheus`、`op.WithLogger`、`op.WithAuditLogger` を通じて、利用者が所有する出力先に流します。OpenTelemetry のスパンは作りません。**HTTP ライフサイクルの観測は組み込み側の責務です。** `otelhttp` や `promhttp.InstrumentHandler` で、自分の SRE 規約に合わせてルータをラップしてください。

::: tip TLS / Proxy
OP は TLS 終端 ingress の背後で動く想定です。`op.WithTrustedProxies(cidrs ...)` で、`X-Forwarded-For` を提供する proxy の範囲を許可リスト化してください。

proxy 側でクライアント TLS を終端し、RFC 8705 の証明書結び付けアクセストークン用に証明書をヘッダ転送する場合は、`op.WithMTLSProxy(headerName, cidrs)` をあわせて指定します。
:::

## 安全に停止する

`/end_session` は OP のセッションを消した時点でブラウザに応答し、RP への Back-Channel Logout トークンの送信はバックグラウンドで行います。リクエストの処理経路はこの送信を待たないため、`http.Server.Shutdown` の直後にプロセスを終了すると、送信待ちのログアウト通知が失われることがあります。listener がリクエストの受け付けを止めたあとで、`Provider.Shutdown` を呼んでください。

```go
srv := &http.Server{Addr: ":8080", Handler: mux}
// ... SIGTERM を受けたら:
_ = srv.Shutdown(ctx)       // 受け付けを止め、処理中のリクエストを終える
_ = provider.Shutdown(ctx)  // back-channel logout の送信待ちを完了させる
```

`Provider.Shutdown` は、送信待ちが空になれば `nil` を、時間切れなら context の error を返します。`/end_session` を公開しない provider に呼んでも問題ありません。upstream の例は `examples/internal/serve` がこの処理を行います。

## 次へ

- [ガイド](/ja/concepts/): OAuth と OIDC が初めての方へ。3 つの役割から DPoP・FAPI まで、読む順番を示しています。ここまでに設定したオプションの意味がつかめます。
- [ユースケース](/ja/use-cases/): SPA ログイン、`client_credentials`、hot/cold ストレージ、MFA などの具体的な構成。
- [セキュリティ方針](/ja/security/posture): cookie、CSRF、SSRF の既定値と、必要なときの緩め方。
