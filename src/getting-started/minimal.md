---
title: Minimal OP
description: A runnable OpenID Connect Provider in ~30 lines.
pageClass: pg-getting-started-minimal
---

# Minimal OP

The shortest path to a running OP. `op.New` returns an error if `WithIssuer`, `WithStore`, or `WithKeyset` is missing. `WithCookieKeys` is required too whenever the `authorization_code` grant is enabled, which it is by default (along with `refresh_token`) — so for this minimal, default-grants config all four are effectively mandatory.

<svg role="img" aria-labelledby="minimal-options-title" viewBox="0 0 760 270" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="minimal-options-title">The four pieces a minimal OP needs: issuer, store, keyset, and cookie keys go into op.New, which returns an HTTP handler.</title>
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
  <text class="min-sub" x="371" y="176" text-anchor="middle">validates the config</text>

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

::: tip Production caveats
- **Keys**: ephemeral here; load from a vault / KMS in production.
- **Store**: in-memory; use `op/storeadapter/sql` or `composite` in production.
- **Listener**: plain HTTP; front behind a TLS-terminating ingress.
:::

::: details What you can do with this OP right now
1. `curl http://localhost:8080/.well-known/openid-configuration` — discovery, always mounted at the root regardless of mount prefix.
2. `curl http://localhost:8080/oidc/jwks` — public JWKS for verifying ID tokens.
3. The default mount prefix is `/oidc` — change it with `op.WithMountPrefix("/")`.
4. Authorization will return errors until you register a client and an authenticator.
:::

## Run the upstream example

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && go run -tags example .)
```

The upstream `01-minimal` example uses `examples/internal/devkeys` for the ephemeral keys and `examples/internal/serve` for the listener boilerplate, so the `main.go` file stays focused on `op.New`.

## Next

- [Required options](/getting-started/required-options) — why these four.
- [Mount on your router](/getting-started/mount) — `chi`, `gin`, …
- [Use case: Minimal OP](/use-cases/minimal-op) — same example with a registered client and an authenticator wired in.
