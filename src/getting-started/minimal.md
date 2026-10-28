---
title: Minimal OP
description: A runnable OpenID Connect Provider in ~30 lines.
pageClass: pg-getting-started-minimal
---

# Minimal OP

This is the shortest path to a running OP. `op.New` refuses to start unless it gets three values: `WithIssuer`, `WithStore` and `WithKeyset`. The default grant set includes `authorization_code`, the grant that sends a user through a browser, and that grant needs two more: `WithCookieKeys` to seal the browser cookies and `WithLoginFlow` (or `WithAuthenticators`) to say how users sign in. An OP that serves only `client_credentials` needs the first three alone.

<figure class="fig">
  <div class="fig-head">Five values in, one handler out</div>
  <svg class="fig-svg" role="img" aria-labelledby="min-op-title" viewBox="0 0 960 536" xmlns="http://www.w3.org/2000/svg">
    <title id="min-op-title">A minimal OP takes five values — an issuer, a store, a keyset, cookie keys and a login flow — into op.New, which validates them and returns an ordinary HTTP handler.</title>
    <!-- five inputs -->
    <rect class="fg-box" x="32" y="24" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="52">Issuer</text>
    <text class="fg-s" x="48" y="76">the public https URL of the OP</text>
    <rect class="fg-box" x="32" y="128" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="156">Store</text>
    <text class="fg-s" x="48" y="180">codes · sessions · clients · chains</text>
    <rect class="fg-box" x="32" y="232" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="260">Keyset</text>
    <text class="fg-s" x="48" y="284">ES256 signing keys</text>
    <rect class="fg-box" x="32" y="336" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="364">Cookie keys</text>
    <text class="fg-s" x="48" y="388">AES-256-GCM sealing</text>
    <rect class="fg-box" x="32" y="440" width="392" height="72" rx="8"/>
    <text class="fg-m" x="48" y="468">Login flow</text>
    <text class="fg-s" x="48" y="492">how a user signs in</text>
    <!-- bus -->
    <path class="fg-leader" d="M424,60 H448 M424,164 H448 M424,268 H448 M424,372 H448 M424,476 H448 M448,60 V476"/>
    <path class="fg-edge" d="M448,268 H512" marker-end="url(#fg-a)"/>
    <!-- op.New -->
    <rect class="fg-box fg-box--accent" x="512" y="220" width="416" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="528" y="248">op.New(…)</text>
    <text class="fg-s" x="528" y="272">validates the configuration up front</text>
    <text class="fg-s" x="528" y="296">and refuses to start on a bad one</text>
    <path class="fg-edge fg-edge--accent" d="M720,316 V364" marker-end="url(#fg-ac)"/>
    <!-- handler -->
    <rect class="fg-box" x="512" y="364" width="416" height="96" rx="8"/>
    <text class="fg-t" x="528" y="392">HTTP handler</text>
    <text class="fg-mxs" x="528" y="416">http.Handler</text>
    <text class="fg-s" x="528" y="440">mount it, or serve it directly</text>
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
- **Keys**: generated at start-up here. Load them from a vault or KMS in production, so tokens survive a restart.
- **Store**: in memory here. Use `op/storeadapter/sql`, `op/storeadapter/dynamodb` or `composite` in production. Redis is the volatile tier of a `composite` deployment, not a store on its own.
- **Listener**: plain HTTP here. Put a TLS-terminating ingress in front.
:::

::: details What you can try right now
1. `curl http://localhost:8080/.well-known/openid-configuration` returns the discovery document. For an issuer without a path it sits at the host root, whatever the mount prefix is.
2. `curl http://localhost:8080/oidc/jwks` returns the public keys that verify ID tokens. The default mount prefix is `/oidc`; `op.WithMountPrefix("/")` moves the endpoints to the root.
3. `/oidc/auth` answers every request with an error until a client is registered. The next section adds one client and one user.
:::

## Add one client and one user

A relying party (RP) is an application that asks the OP to sign users in. The OP only accepts requests from clients it knows, so register the RP and give the password step someone to authenticate:

```go
// extra imports: "context", "github.com/libraz/go-oidc-provider/op/store"
hash, err := op.HashPassword("demo")
if err != nil {
  log.Fatal(err)
}
st.PutUserWithPassword(context.Background(), &store.User{
  Subject: "demo-user",
  Claims:  map[string]any{"name": "Demo User", "email": "demo@example.com"},
}, "demo", hash)

// pass to op.New alongside the options above
op.WithStaticClients(op.PublicClient{
  ID:           "demo-rp",
  RedirectURIs: []string{"http://127.0.0.1:9090/callback"},
  Scopes:       []string{"openid", "profile"},
})
```

`PutUserWithPassword` stores the hash as given, so a plaintext password would never match; hash it with `op.HashPassword`. A `PublicClient` has no secret and relies on PKCE, so the RP must send a code challenge. The upstream example below ships an RP that does.

## Run the upstream example

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

`01-minimal` starts two listeners in one process: the OP on `:8080` and a small RP on `:9090`. Open `http://127.0.0.1:9090/`, choose to log in, sign in as `demo` / `demo`, approve the consent screen, and the RP shows the verified ID token claims. The example keeps key generation (`examples/internal/devkeys`) and listener boilerplate (`examples/internal/serve`) out of `main.go`, so the file stays focused on `op.New`.

## Next

- [Required options](/getting-started/required-options): why these five.
- [Mount on your router](/getting-started/mount): `chi`, `gin` and prefixes.
- [Use case: Minimal OP](/use-cases/minimal-op): the same OP with a registered client and an authenticator wired in.
