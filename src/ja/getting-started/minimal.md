---
title: 最小構成 OP
description: 約 30 行で動く OpenID Connect Provider。
pageClass: pg-getting-started-minimal
---

# 最小構成 OP

OP を起動する最短経路です。`WithIssuer`、`WithStore`、`WithKeyset` のいずれかを欠くと `op.New` は error を返します。`WithCookieKeys` も、`authorization_code` grant を有効にしている場合は必須です。既定の grant 集合（`authorization_code` と `refresh_token`）はこれを含むため、この最小構成では実質的に 4 つとも必須になります。

<svg role="img" aria-labelledby="minimal-options-title" viewBox="0 0 760 282" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="minimal-options-title">最小構成 OP に必要な 4 要素: issuer、store、keyset、cookie keys を op.New に渡すと HTTP handler が返る。</title>
  <rect class="min-box" x="34" y="34" width="150" height="58" rx="8"/>
  <text class="min-text" x="109" y="68" text-anchor="middle">Issuer</text>
  <rect class="min-box" x="34" y="112" width="150" height="58" rx="8"/>
  <text class="min-text" x="109" y="146" text-anchor="middle">Store</text>
  <rect class="min-box" x="34" y="190" width="150" height="58" rx="8"/>
  <text class="min-text" x="109" y="224" text-anchor="middle">Keyset</text>

  <rect class="min-box" x="286" y="34" width="170" height="58" rx="8"/>
  <text class="min-text" x="371" y="68" text-anchor="middle">Cookie keys</text>
  <rect class="min-main" x="286" y="122" width="170" height="76" rx="8"/>
  <text class="min-text" x="371" y="154" text-anchor="middle">op.New(...)</text>
  <text class="min-sub" x="371" y="176" text-anchor="middle">構成を検証</text>

  <rect class="min-box" x="574" y="122" width="152" height="76" rx="8"/>
  <text class="min-text" x="650" y="154" text-anchor="middle">HTTP handler</text>
  <text class="min-sub" x="650" y="176" text-anchor="middle">ListenAndServe</text>

  <path class="min-flow" d="M184 63 C232 63 246 140 286 140"/>
  <path class="min-flow" d="M277 136 L286 140 L277 144"/>
  <path class="min-flow" d="M184 141 C232 141 246 160 286 160"/>
  <path class="min-flow" d="M277 156 L286 160 L277 164"/>
  <path class="min-flow" d="M184 219 C232 219 246 180 286 180"/>
  <path class="min-flow" d="M277 176 L286 180 L277 184"/>
  <path class="min-flow" d="M371 92 V122"/>
  <path class="min-flow" d="M367 113 L371 122 L375 113"/>
  <path class="min-flow" d="M456 160 H574"/>
  <path class="min-flow" d="M565 156 L574 160 L565 164"/>
</svg>

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
