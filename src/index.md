---
layout: home
title: go-oidc-provider — OpenID Connect Provider library for Go
titleTemplate: false
description: Mount an OIDC Provider (Authorization Server) on any Go http.Handler. Targets FAPI 2.0 Baseline / Message Signing.
---

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
import "github.com/libraz/go-oidc-provider/op/interaction"

handler, _ := op.New(
  /* required options */
  op.WithInteractionDriver(interaction.JSONDriver{}),
  op.WithCORSOrigins("https://app.example.com"),
)
```

::: info UI ownership options
`op.WithSPAUI`, `op.WithConsentUI`, and `op.WithChooserUI` cover the common UI ownership modes: OP-mounted SPA shell, custom consent template, and custom account chooser template. `interaction.JSONDriver` is still the lower-level route when you want your own router to serve the shell. See [Use case: SPA](/use-cases/spa-custom-interaction) and [Custom consent UI](/use-cases/custom-consent-ui).
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

::: warning Pre-v1.0
The library is pre-v1.0; minor releases may carry breaking changes. The public API stabilises at v1.0.0. See the [pre-v1.0 note in the README](https://github.com/libraz/go-oidc-provider#status).
:::

## License & related

Apache-2.0. Source: [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider). Vulnerability disclosure: [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/SECURITY.md).
