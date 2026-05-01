---
layout: home
title: go-oidc-provider — OpenID Connect Provider library for Go
titleTemplate: false
description: Mount an OIDC Provider (Authorization Server) on any Go http.Handler. Targets FAPI 2.0 Baseline / Message Signing.

hero:
  name: 'go-oidc-provider'
  text: 'OIDC Provider you mount on http.Handler'
  tagline: Authorization Server library for Go. PAR / JAR / DPoP / mTLS / PKCE built in. Targets FAPI 2.0 Baseline & Message Signing.
  actions:
    - theme: brand
      text: View on GitHub
      link: https://github.com/libraz/go-oidc-provider
    - theme: alt
      text: Quick Start
      link: /getting-started/install
    - theme: alt
      text: Why this library
      link: /why

features:
  - icon:
      src: /icons/plug.svg
    title: Embeds as http.Handler
    details: '`op.New(...)` returns an `http.Handler`. Mount it on net/http, chi, gin — at any prefix. No framework lock-in, no global state.'
  - icon:
      src: /icons/shield.svg
    title: FAPI 2.0 ready
    details: Single `op.WithProfile(profile.FAPI2Baseline)` switch enables PAR + JAR + DPoP, locks the alg list, and tightens the discovery surface.
  - icon:
      src: /icons/key.svg
    title: BYO storage
    details: Plug into your existing users table. Tiny store interfaces — `inmem`, `sql`, `redis`, `composite` ship as adapters; DynamoDB planned.
  - icon:
      src: /icons/refresh-cw.svg
    title: Refresh & rotation
    details: Refresh tokens with reuse detection, configurable grace period, and a separate `offline_access` TTL bucket so stay-signed-in is observable.
  - icon:
      src: /icons/check-circle.svg
    title: OFCS-tested
    details: 'Regressed each release against the OpenID Foundation conformance suite — 138 PASSED, 0 FAILED across 3 plans (oidcc-basic, fapi2-baseline, fapi2-message-signing).'
  - icon:
      src: /icons/globe.svg
    title: SPA-friendly
    details: Headless interaction driver — drive login / consent / logout from a React SPA. CORS allowlist auto-derived from registered redirect_uris.
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
    op.WithCookieKey(cookieKey), // 32 bytes — AES-256-GCM
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
  op.WithCookieKey(cookieKey),
  op.WithProfile(profile.FAPI2Baseline), // PAR + JAR + DPoP, ES256, alg lock
  op.WithStaticClients(/* private_key_jwt client with JWKS */),
)
```

::: tip Why one switch is enough
`op.WithProfile(profile.FAPI2Baseline)` activates the required features (`PAR`, `JAR`, `DPoP`),
intersects `token_endpoint_auth_methods_supported` with the FAPI allow-list, and
tightens the discovery surface. See [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).
:::

### 3. Issue tokens to backend services (no end user)

```go
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKey(cookieKey),
  op.WithGrants(grant.ClientCredentials, grant.AuthorizationCode, grant.RefreshToken),
)
```

> See [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) and [Use case: client_credentials](/use-cases/client-credentials).

### 4. Drive login / consent / logout from an SPA

```go
handler, _ := op.New(
  /* required options */
  op.WithSPAUI(op.SPAUI{ /* SPA endpoints */ }),
  op.WithCORSOrigins("https://app.example.com"),
)
```

> See [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) and [Use case: SPA](/use-cases/spa-custom-interaction).

### 5. Persist on a real database, split hot from cold

```go
import (
  "github.com/libraz/go-oidc-provider/op/storeadapter/composite"
  "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
  "github.com/libraz/go-oidc-provider/op/storeadapter/redis"
)

durable, _ := sql.Open(/* MySQL DSN */)
volatile, _ := redis.Open(/* rediss:// */)
combined  := composite.New(durable, volatile)

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
The library is pre-v1.0; minor releases may carry breaking changes. The
public API stabilises at v1.0.0. See the [pre-v1.0 note in the README](https://github.com/libraz/go-oidc-provider#status).
:::

## License & related

Apache-2.0. Source: [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider).
Vulnerability disclosure: [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/SECURITY.md).
