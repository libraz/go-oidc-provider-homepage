---
title: 最小構成 OP
description: 約 30 行で動く OpenID Connect Provider。
pageClass: pg-getting-started-minimal
---

# 最小構成 OP

OP を起動する最短の手順です。`op.New` は `WithIssuer`、`WithStore`、`WithKeyset` の 3 つが揃わないと起動を拒否します。既定の grant 集合には、ユーザをブラウザ経由で認可する `authorization_code` が含まれます。この grant を使うときは、ブラウザの cookie を暗号化する `WithCookieKeys` と、サインイン方法を決める `WithLoginFlow`（または `WithAuthenticators`）も必要です。`client_credentials` だけを提供する OP なら、最初の 3 つで足ります。

<figure class="fig">
  <div class="fig-head">5 つの値を渡すと handler が 1 つ返る</div>
  <svg class="fig-svg" role="img" aria-labelledby="min-op-title" viewBox="0 0 960 536" xmlns="http://www.w3.org/2000/svg">
    <title id="min-op-title">最小構成の OP は issuer・store・keyset・cookie 鍵・ログインフローの 5 つを op.New に渡します。op.New はそれらを検証し、通常の HTTP handler を返します。</title>
    <!-- five inputs -->
    <rect class="fg-box" x="32" y="24" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="52">Issuer</text>
    <text class="fg-s" x="48" y="76">OP の公開 https URL</text>
    <rect class="fg-box" x="32" y="128" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="156">Store</text>
    <text class="fg-s" x="48" y="180">認可コード · session · クライアント · 連鎖</text>
    <rect class="fg-box" x="32" y="232" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="260">Keyset</text>
    <text class="fg-s" x="48" y="284">ES256 署名鍵</text>
    <rect class="fg-box" x="32" y="336" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="364">Cookie keys</text>
    <text class="fg-s" x="48" y="388">AES-256-GCM による暗号化</text>
    <rect class="fg-box" x="32" y="440" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="468">Login flow</text>
    <text class="fg-s" x="48" y="492">ユーザのサインイン方法</text>
    <!-- bus -->
    <path class="fg-leader" d="M424,60 H448 M424,164 H448 M424,268 H448 M424,372 H448 M424,476 H448 M448,60 V476"/>
    <path class="fg-edge" d="M448,268 H512" marker-end="url(#fg-a)"/>
    <!-- op.New -->
    <rect class="fg-box fg-box--accent" x="512" y="220" width="416" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="528" y="248">op.New(…)</text>
    <text class="fg-s" x="528" y="272">構成を起動時に検証し、</text>
    <text class="fg-s" x="528" y="296">不備があれば起動を拒否する</text>
    <path class="fg-edge fg-edge--accent" d="M720,316 V364" marker-end="url(#fg-ac)"/>
    <!-- handler -->
    <rect class="fg-box" x="512" y="364" width="416" height="96" rx="8"/>
    <text class="fg-t" x="528" y="392">HTTP handler</text>
    <text class="fg-mxs" x="528" y="416">http.Handler</text>
    <text class="fg-s" x="528" y="440">マウントしても直接使ってもよい</text>
  </svg>
  <figcaption class="fig-note">ここにフレームワークはありません。返ってくるのは他と変わらない <code>http.Handler</code> です。だからこそ、既にあるルータのどこにでも OP を置けます。</figcaption>
</figure>

::: code-group

```go [net/http]
package main

import (
  "crypto/ecdsa"
  "crypto/elliptic"
  "crypto/rand"
  "log"
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

func main() {
  // 揮発性 ECDSA P-256 (ES256) — 本番では Vault / KMS の鍵に差し替えてください。
  // Keyset は {KeyID, Signer} のスライスです。
  priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
  cookieKey := make([]byte, 32) // AES-256-GCM
  if _, err := rand.Read(cookieKey); err != nil {
    log.Fatal(err)
  }

  st := inmem.New()
  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(st),
    op.WithKeyset(op.Keyset{{KeyID: "k1", Signer: priv}}),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(op.LoginFlow{
      Primary: op.PrimaryPassword{Store: st.UserPasswords()},
    }),
  )
  if err != nil {
    log.Fatal(err)
  }
  log.Fatal(http.ListenAndServe(":8080", handler))
}
```

```go [chi]
package main

import (
  "crypto/ecdsa"
  "crypto/elliptic"
  "crypto/rand"
  "log"
  "net/http"

  "github.com/go-chi/chi/v5"
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

func main() {
  priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
  cookieKey := make([]byte, 32)
  if _, err := rand.Read(cookieKey); err != nil {
    log.Fatal(err)
  }

  st := inmem.New()
  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(st),
    op.WithKeyset(op.Keyset{{KeyID: "k1", Signer: priv}}),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(op.LoginFlow{
      Primary: op.PrimaryPassword{Store: st.UserPasswords()},
    }),
  )
  if err != nil {
    log.Fatal(err)
  }

  r := chi.NewRouter()
  r.Mount("/", handler)
  log.Fatal(http.ListenAndServe(":8080", r))
}
```

```go [gin]
package main

import (
  "crypto/ecdsa"
  "crypto/elliptic"
  "crypto/rand"
  "log"
  "net/http"

  "github.com/gin-gonic/gin"
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

func main() {
  priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
  cookieKey := make([]byte, 32)
  if _, err := rand.Read(cookieKey); err != nil {
    log.Fatal(err)
  }

  st := inmem.New()
  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(st),
    op.WithKeyset(op.Keyset{{KeyID: "k1", Signer: priv}}),
    op.WithCookieKeys(cookieKey),
    op.WithLoginFlow(op.LoginFlow{
      Primary: op.PrimaryPassword{Store: st.UserPasswords()},
    }),
  )
  if err != nil {
    log.Fatal(err)
  }

  r := gin.New()
  r.Any("/*path", gin.WrapH(handler))
  log.Fatal(http.ListenAndServe(":8080", r))
}
```

:::

::: tip 本番運用の注意
- **鍵**: ここでは起動のたびに生成しています。本番では Vault / KMS から読み込み、再起動後もトークンが有効なままにします。
- **ストア**: ここでは in-memory です。本番では `op/storeadapter/sql`、`op/storeadapter/dynamodb`、`composite` のいずれかを使います。Redis は `composite` 構成の揮発層で、単独のストアにはなりません。
- **リスナ**: ここでは平文 HTTP です。前段に TLS 終端の ingress を置いてください。
:::

::: details この OP で今すぐ試せること
1. `curl http://localhost:8080/.well-known/openid-configuration` で discovery ドキュメントを取得できます。パスを含まない issuer なら、mount prefix に関わらずホストのルート直下に公開されます。
2. `curl http://localhost:8080/oidc/jwks` で ID トークンの検証に使う公開鍵を取得できます。既定の mount prefix は `/oidc` で、`op.WithMountPrefix("/")` を渡すとエンドポイントがルート直下に移ります。
3. `/oidc/auth` は、クライアントを登録するまで何を送ってもエラーを返します。次の節でクライアントとユーザを 1 つずつ追加します。
:::

## クライアントとユーザを 1 つずつ追加する

RP（Relying Party）は、OP にユーザのサインインを依頼するアプリケーションです。OP は登録済みのクライアントからのリクエストしか受け付けません。RP を登録し、パスワード認証の対象になるユーザも用意します。

```go
// 追加の import: "context", "github.com/libraz/go-oidc-provider/op/store"
hash, err := op.HashPassword("demo")
if err != nil {
  log.Fatal(err)
}
st.PutUserWithPassword(context.Background(), &store.User{
  Subject: "demo-user",
  Claims:  map[string]any{"name": "Demo User", "email": "demo@example.com"},
}, "demo", hash)

// 上のオプションと並べて op.New に渡す
op.WithStaticClients(op.PublicClient{
  ID:           "demo-rp",
  RedirectURIs: []string{"http://127.0.0.1:9090/callback"},
  Scopes:       []string{"openid", "profile"},
})
```

`PutUserWithPassword` はハッシュをそのまま保存するため、平文のパスワードを渡すと一致しません。`op.HashPassword` でハッシュ化してください。`PublicClient` はシークレットを持たず PKCE に依存するので、RP は code challenge を送る必要があります。次の upstream 例には、それを行う RP が付属しています。

## upstream 例の実行

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

`01-minimal` は 1 つのプロセスで 2 つのリスナを起動します。`:8080` が OP、`:9090` が小さな RP です。`http://127.0.0.1:9090/` を開いてログインを選び、`demo` / `demo` でサインインして同意画面を承認すると、RP が検証済みの ID トークンの claim を表示します。鍵の生成（`examples/internal/devkeys`）とリスナの定型コード（`examples/internal/serve`）は別パッケージに出してあるので、`main.go` は `op.New` に集中できます。

## 次へ

- [必須オプション](/ja/getting-started/required-options): この 5 つが必要な理由。
- [ルータへのマウント](/ja/getting-started/mount): `chi`、`gin`、prefix の付け方。
- [ユースケース: 最小構成 OP](/ja/use-cases/minimal-op): クライアント登録と authenticator を組み込んだ同じ OP。
