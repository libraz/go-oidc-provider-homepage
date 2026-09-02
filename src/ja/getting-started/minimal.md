---
title: 最小構成 OP
description: 約 30 行で動く OpenID Connect Provider。
pageClass: pg-getting-started-minimal
---

# 最小構成 OP

OP を起動する最短経路です。`WithIssuer`、`WithStore`、`WithKeyset` のいずれかを欠くと `op.New` は error を返します。`WithCookieKeys` も、`authorization_code` grant を有効にしている場合は必須です。既定の grant 集合（`authorization_code` と `refresh_token`）はこれを含むため、この最小構成では実質的に 4 つとも必須になります。

<figure class="fig">
  <div class="fig-head">4 つの値を渡すと handler が 1 つ返る</div>
  <svg class="fig-svg" role="img" aria-labelledby="min-op-title" viewBox="0 10 960 200" xmlns="http://www.w3.org/2000/svg">
    <title id="min-op-title">最小構成の OP は issuer・store・keyset・cookie 鍵の 4 つを op.New に渡します。op.New はそれらを検証し、通常の HTTP handler を返します。</title>
    <rect class="fg-box" x="36" y="24" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="42">Issuer</text>
    <text class="fg-xs" x="52" y="57">OP の公開 https URL</text>
    <rect class="fg-box" x="36" y="68" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="86">Store</text>
    <text class="fg-xs" x="52" y="101">認可コード · session · クライアント · 連鎖</text>
    <rect class="fg-box" x="36" y="112" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="130">Keyset</text>
    <text class="fg-xs" x="52" y="145">ES256 署名鍵</text>
    <rect class="fg-box" x="36" y="156" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="174">Cookie keys</text>
    <text class="fg-xs" x="52" y="189">AES-256-GCM による暗号化</text>
    <path class="fg-leader" d="M280,44 H316 M280,88 H316 M280,132 H316 M280,176 H316 M316,44 V176"/>
    <path class="fg-edge" d="M316,110 H396" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="400" y="74" width="300" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="420" y="102">op.New(…)</text>
    <text class="fg-xs" x="420" y="124">構成を起動時に検証し、</text>
    <text class="fg-xs" x="420" y="140">不備があれば起動を拒否する</text>
    <path class="fg-edge fg-edge--accent" d="M704,110 H756" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="760" y="74" width="164" height="72" rx="8"/>
    <text class="fg-t" x="778" y="102">HTTP handler</text>
    <text class="fg-mxs" x="778" y="124">http.Handler</text>
    <text class="fg-xs" x="778" y="140">マウントしても直接使ってもよい</text>
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
- **鍵**: ここでは揮発性ですが、本番では Vault / KMS から読み込むこと。
- **ストア**: in-memory ですが、本番では `op/storeadapter/sql`、`op/storeadapter/dynamodb`、または `composite` を使うこと。Redis は composite 構成で揮発ティアとして使います。
- **リスナ**: 平文 HTTP のままです。TLS 終端 ingress の背後に置いてください。
:::

::: details この OP で今すぐ試せること
1. `curl http://localhost:8080/.well-known/openid-configuration` — discovery。mount prefix に関わらず常にルート直下に公開されます。
2. `curl http://localhost:8080/oidc/jwks` — ID トークン検証用の公開 JWKS。
3. 既定の mount prefix は `/oidc` です。`op.WithMountPrefix("/")` で変更できます。
4. クライアントを登録してユーザを seed するまで認可は error を返します。password authenticator は上で構成済みです。
:::

## upstream 例の実行

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

upstream の `01-minimal` 例では `examples/internal/devkeys` が揮発性鍵を、`examples/internal/serve` がリスナまわりの定型コードを提供します。そのため、`main.go` 自体は `op.New` に集中できます。

## 次へ

- [必須オプション](/ja/getting-started/required-options) — 常時必須の項目と、CookieKeys が必要になる条件。
- [ルータへのマウント](/ja/getting-started/mount) — `chi`、`gin` などへの載せ方。
- [使い方: 最小構成 OP](/ja/use-cases/minimal-op) — クライアント登録と authenticator を組み込んだ同じ例。
