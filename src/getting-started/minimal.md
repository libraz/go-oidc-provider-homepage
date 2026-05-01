---
title: Minimal OP
description: A runnable OpenID Connect Provider in ~30 lines.
---

# Minimal OP

The shortest path to a running OP. The four required options are `WithIssuer`, `WithStore`, `WithKeyset`, and `WithCookieKey` — `op.New` returns an error if any are missing.

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
  // Ephemeral ECDSA P-256 (ES256) — replace with a vault / KMS key in
  // production. The Keyset is a slice of {KeyID, Signer}.
  priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
  cookieKey := make([]byte, 32) // AES-256-GCM
  if _, err := rand.Read(cookieKey); err != nil {
    log.Fatal(err)
  }

  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(op.Keyset{{KeyID: "k1", Signer: priv}}),
    op.WithCookieKey(cookieKey),
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
    op.WithCookieKey(cookieKey),
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
    op.WithCookieKey(cookieKey),
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

::: tip Production caveats
- **Keys**: ephemeral here; load from a vault / KMS in production.
- **Store**: in-memory; use `op/storeadapter/sql` or `composite` in production.
- **Listener**: plain HTTP; front behind a TLS-terminating ingress.
:::

::: details What you can do with this OP right now
1. `curl http://localhost:8080/oidc/.well-known/openid-configuration` — discovery.
2. `curl http://localhost:8080/oidc/jwks` — public JWKS for verifying ID tokens.
3. The default mount prefix is `/oidc` — change it with `op.WithMountPrefix("/")`.
4. Authorization will return errors until you register a client and an authenticator.
:::

## Run the upstream example

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
go run -tags example ./examples/01-minimal
```

The upstream `01-minimal` example uses `examples/internal/devkeys` for the ephemeral keys and `examples/internal/serve` for the listener boilerplate, so the `main.go` file stays focused on `op.New`.

## Next

- [Required options](/getting-started/required-options) — why these four.
- [Mount on your router](/getting-started/mount) — `chi`, `gin`, …
- [Use case: Minimal OP](/use-cases/minimal-op) — same example with a registered client and an authenticator wired in.
