---
title: 最小構成 OP
description: 約 30 行で動く OpenID Connect Provider。
---

# 最小構成 OP

OP を起動する最短経路。必須 4 オプションは `WithIssuer`、`WithStore`、`WithKeyset`、`WithCookieKeys` — どれかを欠くと `op.New` は error を返します。

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
  // 揮発性 ECDSA P-256 (ES256) — 本番では vault / KMS の鍵に差し替えてください。
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
- **鍵**: ここでは揮発性ですが、本番では vault / KMS から読み込むこと。
- **ストア**: in-memory ですが、本番では `op/storeadapter/sql` か `composite` を使うこと。
- **リスナ**: 平文 HTTP のままです。TLS 終端 ingress の背後に置いてください。
:::

::: details この OP で今すぐ試せること
1. `curl http://localhost:8080/oidc/.well-known/openid-configuration` — discovery。
2. `curl http://localhost:8080/oidc/jwks` — ID token 検証用の公開 JWKS。
3. デフォルトの mount prefix は `/oidc` です。`op.WithMountPrefix("/")` で変更可。
4. クライアントと authenticator を登録するまで認可は error を返します。
:::

## upstream 例の実行

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
go run -tags example ./examples/01-minimal
```

upstream の `01-minimal` 例では `examples/internal/devkeys` で揮発性鍵を、`examples/internal/serve` でリスナの boilerplate を提供しているので、`main.go` 自体は `op.New` に集中できます。

## 次へ

- [必須オプション](/ja/getting-started/required-options) — なぜこの 4 つが必要なのか。
- [ルーターへのマウント](/ja/getting-started/mount) — `chi`、`gin` …
- [ユースケース: 最小構成 OP](/ja/use-cases/minimal-op) — クライアント登録と authenticator を組み込んだ同じ例。
