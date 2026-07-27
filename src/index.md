---
layout: home
title: go-oidc-provider — OpenID Connect Provider library for Go
titleTemplate: false
description: Mount an OIDC Provider (Authorization Server) on any Go http.Handler. Targets FAPI 2.0 Baseline / Message Signing.
pageClass: pg-index
---

<svg role="img" aria-labelledby="home-embed-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="home-embed-title">go-oidc-provider mounts into an existing Go application as an http.Handler, wiring the OP endpoints to the application's own store, keyset, and logging.</title>
<rect class="home-box" x="34" y="92" width="156" height="82" rx="8"/>
  <text class="home-text" x="112" y="124" text-anchor="middle">Your Go app</text>
  <text class="home-sub" x="112" y="146" text-anchor="middle">router / middleware</text>

  <rect class="home-main" x="302" y="78" width="156" height="110" rx="8"/>
  <text class="home-text" x="380" y="116" text-anchor="middle">OIDC Provider</text>
  <text class="home-sub" x="380" y="138" text-anchor="middle">http.Handler</text>
  <text class="home-sub" x="380" y="156" text-anchor="middle">/authorize /token /jwks</text>

  <rect class="home-box" x="570" y="34" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="68" text-anchor="middle">Store</text>
  <rect class="home-box" x="570" y="112" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="146" text-anchor="middle">Keyset</text>
  <rect class="home-box" x="570" y="190" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="224" text-anchor="middle">Logs / audit</text>

  <path class="home-flow" d="M190 134 H298"/>
  <text class="home-sub" x="244" y="120" text-anchor="middle">Mount</text>
  <path class="home-flow" d="M290 130 L299 134 L290 138"/>
  <path class="home-flow" d="M458 116 C504 86 520 62 566 62"/>
  <path class="home-flow" d="M558 58 L567 62 L558 66"/>
  <path class="home-flow" d="M458 134 H566"/>
  <path class="home-flow" d="M558 130 L567 134 L558 138"/>
  <path class="home-flow" d="M458 152 C504 178 520 218 566 218"/>
  <path class="home-flow" d="M558 214 L567 218 L558 222"/>
</svg>

## Standard use cases

Five things people most often build with this library. Click through to a working example.

### 1. Stand up the smallest possible OP

```go
package main

import (
  "log"
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

func main() {
  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(myKeyset),    // see Quick Start: ephemeral key generation
    op.WithCookieKeys(cookieKey), // 32 bytes — AES-256-GCM
  )
  if err != nil {
    log.Fatal(err)
  }
  log.Fatal(http.ListenAndServe(":8080", handler))
}
```

> See [`examples/01-minimal`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) and [Quick Start](/getting-started/minimal).

### 2. Run a FAPI 2.0 Baseline OP

```go
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithProfile(profile.FAPI2Baseline), // PAR + JAR, DPoP default, ES256, FAPI narrowing
  op.WithStaticClients(/* private_key_jwt client with JWKS */),
)
```

::: tip Why one switch is enough
`op.WithProfile(profile.FAPI2Baseline)` activates the profile-required features (`PAR`, `JAR`), intersects `token_endpoint_auth_methods_supported` with the FAPI allow-list, selects DPoP unless mTLS was explicitly enabled, and tightens the discovery surface. See [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).
:::

### 3. Issue tokens to backend services (no end user)

```go
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithGrants(grant.ClientCredentials, grant.AuthorizationCode, grant.RefreshToken),
)
```

> See [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) and [Use case: client_credentials](/use-cases/client-credentials).

### 4. Drive login / consent / logout from an SPA

```go
handler, _ := op.New(
  /* required options */
  op.WithLoginFlow(flow),
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "./web/static",
  }),
)
```

::: info UI ownership options
`op.WithSPAUI`, `op.WithConsentUI`, and `op.WithChooserUI` cover the common UI ownership modes: OP-mounted SPA shell, custom consent template, and custom account chooser template. `interaction.JSONDriver` is still the lower-level route when you want your own router to serve the shell. See [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login), [Use case: SPA](/use-cases/spa-custom-interaction), and [Custom consent UI](/use-cases/custom-consent-ui).
:::

### 5. Persist on a real database, split hot from cold

```go
import (
  "context"

  "github.com/libraz/go-oidc-provider/op/storeadapter/composite"
  oidcredis "github.com/libraz/go-oidc-provider/op/storeadapter/redis"
  oidcsql "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
)

durable, _  := oidcsql.New(db, oidcsql.MySQL())
volatile, _ := oidcredis.New(context.Background(),
  oidcredis.WithDSN("rediss://redis:6380/0"),
  oidcredis.WithRedisAuth(redisUser, redisPassword),
)
combined, _ := composite.New(
  composite.WithDefault(durable),
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
  composite.With(composite.ConsumedJTIs, volatile),
)

handler, _ := op.New(
  op.WithStore(combined),
  /* … */
)
```

> See [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) and [Use case: hot/cold split](/use-cases/hot-cold-redis).

---

## Install

```sh
go get github.com/libraz/go-oidc-provider/op@latest
```

::: info Stable API
The library is at v1.0.0 and follows Semantic Versioning: the public API changes only in a major release. APIs marked `Experimental:` in godoc remain the stated exception and may change in a minor release.
:::

## License & related

Apache-2.0. Source: [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider). Vulnerability disclosure: [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/SECURITY.md).
