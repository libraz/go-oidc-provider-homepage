---
title: 最小構成 OP
description: 約 30 行で動く OpenID Connect Provider。
---

# 最小構成 OP

OP を起動する最短経路です。`WithIssuer`、`WithStore`、`WithKeyset` のいずれかを欠くと `op.New` は error を返します。`WithCookieKeys` も、`authorization_code` grant を有効にしている場合は必須です。既定の grant 集合（`authorization_code` と `refresh_token`）はこれを含むため、この最小構成では実質的に 4 つとも必須になります。

<svg role="img" aria-labelledby="minimal-options-title" viewBox="0 0 760 270" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:100%;max-width:780px;height:auto;margin:1.5rem auto;">
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

  <path class="min-flow" d="M184 63 C230 64 252 118 282 148"/>
  <path class="min-flow" d="M184 141 H282"/>
  <path class="min-flow" d="M184 219 C230 214 252 184 282 172"/>
  <path class="min-flow" d="M371 92 V118"/>
  <path class="min-flow" d="M367 110 L371 119 L375 110"/>
  <path class="min-flow" d="M456 160 H570"/>
  <path class="min-flow" d="M562 156 L571 160 L562 164"/>
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

  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(op.Keyset{{KeyID: "k1", Signer: priv}}),
    op.WithCookieKeys(cookieKey),
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

  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(op.Keyset{{KeyID: "k1", Signer: priv}}),
    op.WithCookieKeys(cookieKey),
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

  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(op.Keyset{{KeyID: "k1", Signer: priv}}),
    op.WithCookieKeys(cookieKey),
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
- **ストア**: in-memory ですが、本番では `op/storeadapter/sql` か `composite` を使うこと。
- **リスナ**: 平文 HTTP のままです。TLS 終端 ingress の背後に置いてください。
:::

::: details この OP で今すぐ試せること
1. `curl http://localhost:8080/.well-known/openid-configuration` — discovery。mount prefix に関わらず常にルート直下に公開されます。
2. `curl http://localhost:8080/oidc/jwks` — ID トークン検証用の公開 JWKS。
3. 既定の mount prefix は `/oidc` です。`op.WithMountPrefix("/")` で変更できます。
4. クライアントと authenticator を登録するまで認可は error を返します。
:::

## upstream 例の実行

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && go run -tags example .)
```

upstream の `01-minimal` 例では `examples/internal/devkeys` が揮発性鍵を、`examples/internal/serve` がリスナまわりの定型コードを提供します。そのため、`main.go` 自体は `op.New` に集中できます。

## 次へ

- [必須オプション](/ja/getting-started/required-options) — 常時必須の項目と、CookieKeys が必要になる条件。
- [ルーターへの組み込み](/ja/getting-started/mount) — `chi`、`gin` …
- [使い方: 最小構成 OP](/ja/use-cases/minimal-op) — クライアント登録と authenticator を組み込んだ同じ例。
