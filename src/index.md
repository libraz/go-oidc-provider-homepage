---
layout: home
title: go-oidc-provider — OpenID Connect Provider library for Go
titleTemplate: false
description: Mount an OIDC Provider (Authorization Server) on any Go http.Handler. Targets FAPI 2.0 Baseline / Message Signing.
pageClass: pg-index
---

<svg role="img" aria-labelledby="home-embed-title" viewBox="0 0 760 280" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="home-embed-title">go-oidc-provider mounts into an existing Go application as an http.Handler, wiring the OP endpoints to the application's own store, keyset, and logging.</title>
  <rect class="home-box" x="34" y="92" width="156" height="82" rx="8"/>
  <text class="home-text" x="112" y="124" text-anchor="middle">Your Go app</text>
  <text class="home-sub" x="112" y="146" text-anchor="middle">router / middleware</text>

  <rect class="home-main" x="286" y="74" width="190" height="118" rx="8"/>
  <text class="home-text" x="381" y="108" text-anchor="middle">OIDC Provider</text>
  <text class="home-sub" x="381" y="130" text-anchor="middle">http.Handler</text>
  <text class="home-sub" x="381" y="152" text-anchor="middle">/oidc/auth /oidc/token</text>
  <text class="home-sub" x="381" y="170" text-anchor="middle">/oidc/jwks</text>

  <rect class="home-box" x="570" y="34" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="68" text-anchor="middle">Store</text>
  <rect class="home-box" x="570" y="112" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="146" text-anchor="middle">Keyset</text>
  <rect class="home-box" x="570" y="190" width="154" height="56" rx="8"/>
  <text class="home-text" x="647" y="224" text-anchor="middle">Logs / audit</text>

  <path class="home-flow" d="M190 133 H286"/>
  <path class="home-flow" d="M277 129 L286 133 L277 137"/>
  <text class="home-sub halo" x="238" y="137" text-anchor="middle">Mount</text>
  <path class="home-flow" d="M476 116 C520 96 530 62 570 62"/>
  <path class="home-flow" d="M561 58 L570 62 L561 66"/>
  <path class="home-flow" d="M476 140 H570"/>
  <path class="home-flow" d="M561 136 L570 140 L561 144"/>
  <path class="home-flow" d="M476 164 C520 184 530 218 570 218"/>
  <path class="home-flow" d="M561 214 L570 218 L561 222"/>
</svg>

## Standard use cases

The five configurations people build most often with this library. Each one links to a runnable example in the upstream repository.

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
  st := inmem.New()
  handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(st),
    op.WithKeyset(myKeyset),    // see Quick Start: ephemeral key generation
    op.WithCookieKeys(cookieKey), // 32 bytes — AES-256-GCM
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

> See [`examples/01-minimal`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) and [Quick Start](/getting-started/minimal).

### 2. Run a FAPI 2.0 Baseline OP

```go
st := inmem.New()
clientJWKS, _ := op.LoadPublicJWKS("conformance/keys/fapi-client.jwks.json")
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(op.LoginFlow{
    Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  }),
  op.WithProfile(profile.FAPI2Baseline), // PAR + JAR, DPoP default, ES256, FAPI narrowing
  op.WithStaticClients(op.PrivateKeyJWTClient{
    ID: "demo-fapi",
    JWKS: clientJWKS,
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes: []string{"openid", "profile"},
  }),
)
```

::: tip Why one switch is enough
`op.WithProfile(profile.FAPI2Baseline)` enables the features the profile requires (`PAR`, `JAR`) and intersects `token_endpoint_auth_methods_supported` with the FAPI allow-list. It selects DPoP unless you explicitly enabled mTLS, and tightens the discovery surface to match. See [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).
:::

### 3. Issue tokens to backend services (no end user)

```go
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithGrants(grant.ClientCredentials),
  op.WithStaticClients(op.ConfidentialClient{
    ID: "backend-service",
    Secret: "cc-demo-secret-rotate-me",
    AuthMethod: op.AuthClientSecretBasic,
    GrantTypes: []string{"client_credentials"},
    Scopes: []string{"api:read"},
  }),
  op.WithScope(op.PublicScope("api:read", "Read API resources")),
)
```

> See [`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) and [Use case: client_credentials](/use-cases/client-credentials).

### 4. Drive login / consent / logout from an SPA

```go
st := inmem.New()
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(op.LoginFlow{
    Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  }),
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "../internal/webui/static",
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

  "github.com/libraz/go-oidc-provider/op"
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

loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: durable.UserPasswords()}}
handler, _ := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(combined),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
)
```

> See [`examples/09-redis-volatile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/09-redis-volatile) and [Use case: hot/cold split](/use-cases/hot-cold-redis).

---

## Install

```sh
go get github.com/libraz/go-oidc-provider/op@v1.2.0
```

::: info Stable API
A configuration built with `op.New` and the bundled storage adapters generally upgrades unchanged. If you bring your own store or another extension, read the current migration guidance in [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) before upgrading. Symbols marked `Experimental:` in godoc remain the ordinary minor-release exemption.
:::

## License & related

Apache-2.0. Source: [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider). Vulnerability disclosure: [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/SECURITY.md).
