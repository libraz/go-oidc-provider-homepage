---
title: Minimal OP
description: A runnable OpenID Connect Provider in ~30 lines.
pageClass: pg-getting-started-minimal
---

# Minimal OP

The shortest path to a running OP. `op.New` returns an error if `WithIssuer`, `WithStore`, or `WithKeyset` is missing. `WithCookieKeys` is required too whenever the `authorization_code` grant is enabled, which it is by default (along with `refresh_token`) — so for this minimal, default-grants config all four are effectively mandatory.

<figure class="fig">
  <div class="fig-head">Four values in, one handler out</div>
  <svg class="fig-svg" role="img" aria-labelledby="min-op-title" viewBox="0 10 960 200" xmlns="http://www.w3.org/2000/svg">
    <title id="min-op-title">A minimal OP takes four values — an issuer, a store, a keyset and cookie keys — into op.New, which validates them and returns an ordinary HTTP handler.</title>
    <rect class="fg-box" x="36" y="24" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="42">Issuer</text>
    <text class="fg-xs" x="52" y="57">the public https URL of the OP</text>
    <rect class="fg-box" x="36" y="68" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="86">Store</text>
    <text class="fg-xs" x="52" y="101">codes · sessions · clients · chains</text>
    <rect class="fg-box" x="36" y="112" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="130">Keyset</text>
    <text class="fg-xs" x="52" y="145">ES256 signing keys</text>
    <rect class="fg-box" x="36" y="156" width="240" height="40" rx="6"/>
    <text class="fg-m" x="52" y="174">Cookie keys</text>
    <text class="fg-xs" x="52" y="189">AES-256-GCM sealing</text>
    <path class="fg-leader" d="M280,44 H316 M280,88 H316 M280,132 H316 M280,176 H316 M316,44 V176"/>
    <path class="fg-edge" d="M316,110 H396" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="400" y="74" width="300" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="420" y="102">op.New(…)</text>
    <text class="fg-xs" x="420" y="124">validates the configuration up front</text>
    <text class="fg-xs" x="420" y="140">and refuses to start on a bad one</text>
    <path class="fg-edge fg-edge--accent" d="M704,110 H756" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="760" y="74" width="164" height="72" rx="8"/>
    <text class="fg-t" x="778" y="102">HTTP handler</text>
    <text class="fg-mxs" x="778" y="124">http.Handler</text>
    <text class="fg-xs" x="778" y="140">mount it, or serve it directly</text>
  </svg>
  <figcaption class="fig-note">Nothing here is a framework. What comes back is an <code>http.Handler</code> like any other, which is why the OP can sit anywhere in a router you already have.</figcaption>
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
  // Ephemeral ECDSA P-256 (ES256) — replace with a vault / KMS key in
  // production. The Keyset is a slice of {KeyID, Signer}.
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

::: tip Production caveats
- **Keys**: ephemeral here; load from a vault / KMS in production.
- **Store**: in-memory; use `op/storeadapter/sql`, `op/storeadapter/dynamodb`, or `composite` in production. Redis is a volatile tier for composite deployments.
- **Listener**: plain HTTP; front behind a TLS-terminating ingress.
:::

::: details What you can do with this OP right now
1. `curl http://localhost:8080/.well-known/openid-configuration` — discovery, always mounted at the root regardless of mount prefix.
2. `curl http://localhost:8080/oidc/jwks` — public JWKS for verifying ID tokens.
3. The default mount prefix is `/oidc` — change it with `op.WithMountPrefix("/")`.
4. Authorization will return errors until you register a client and seed a user; the password authenticator is configured above.
:::

## Run the upstream example

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

The upstream `01-minimal` example uses `examples/internal/devkeys` for the ephemeral keys and `examples/internal/serve` for the listener boilerplate, so the `main.go` file stays focused on `op.New`.

## Next

- [Required options](/getting-started/required-options) — why these four.
- [Mount on your router](/getting-started/mount) — `chi`, `gin`, …
- [Use case: Minimal OP](/use-cases/minimal-op) — same example with a registered client and an authenticator wired in.
