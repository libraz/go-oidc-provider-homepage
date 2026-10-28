---
layout: home
title: go-oidc-provider — OpenID Connect Provider library for Go
titleTemplate: false
description: Mount an OIDC Provider (Authorization Server) on any Go http.Handler. Supports the library's FAPI 2.0 Baseline and Message Signing profiles.
pageClass: pg-index
---

<figure class="fig">
  <div class="fig-head">The provider is a handler inside your application</div>
  <svg class="fig-svg" role="img" aria-labelledby="home-embed-title" viewBox="0 0 1440 472" xmlns="http://www.w3.org/2000/svg">
    <title id="home-embed-title">Clients call the OpenID Provider over HTTPS. The provider is an http.Handler that your Go application mounts under /oidc on its own router. It always serves discovery, JWKS, authorization, token, userinfo and logout endpoints, adds PAR, introspection, revocation, registration, device and CIBA endpoints when those features are enabled, and reaches storage, signing keys and the login flow through the options you pass to op.New.</title>
    <!-- 1440-wide viewBox: the landing column is ~1.6x a docs column, so this keeps the docs type scale at full width -->
    <text class="fg-lbl" x="32" y="52">clients</text>
    <rect class="fg-box" x="32" y="72" width="304" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="100">Web app (RP)</text>
    <text class="fg-mxs fg-dim" x="48" y="124">confidential client</text>
    <text class="fg-xs fg-faint" x="48" y="148">authorization code + PKCE</text>
    <path class="fg-edge" d="M336,120 H430" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="200" width="304" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="228">SPA · mobile · CLI</text>
    <text class="fg-mxs fg-dim" x="48" y="252">public client</text>
    <text class="fg-xs fg-faint" x="48" y="276">PKCE · device code</text>
    <path class="fg-edge" d="M336,248 H430" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="32" y="328" width="304" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="356">Resource server</text>
    <text class="fg-mxs fg-dim" x="48" y="380">verifies access tokens</text>
    <text class="fg-xs fg-faint" x="48" y="404">JWKS · /introspect</text>
    <path class="fg-edge" d="M336,376 H430" marker-end="url(#fg-a)"/>
    <!-- application boundary -->
    <rect class="fg-frame fg-frame--dashed" x="400" y="24" width="1008" height="424" rx="8"/>
    <text class="fg-lbl" x="424" y="52">your Go application</text>
    <text class="fg-lbl" x="1384" y="52" text-anchor="end">options you pass</text>
    <!-- provider -->
    <rect class="fg-box fg-box--accent" x="432" y="72" width="576" height="352" rx="8"/>
    <text class="fg-t fg-accent" x="448" y="100">op.New(…)</text>
    <text class="fg-mxs fg-dim" x="448" y="124">http.Handler mounted at /oidc</text>
    <path class="fg-rule" d="M448,144 H992"/>
    <text class="fg-lbl" x="448" y="176">always</text>
    <text class="fg-m" x="448" y="204">/auth</text>
    <text class="fg-m" x="592" y="204">/jwks</text>
    <text class="fg-m" x="448" y="228">/token</text>
    <text class="fg-m" x="592" y="228">/end_session</text>
    <text class="fg-m" x="448" y="252">/userinfo</text>
    <text class="fg-m" x="448" y="276">/.well-known/openid-configuration</text>
    <path class="fg-rule" d="M776,160 V320"/>
    <text class="fg-lbl" x="800" y="176">when enabled</text>
    <text class="fg-m fg-dim" x="800" y="204">/par</text>
    <text class="fg-m fg-dim" x="800" y="228">/introspect</text>
    <text class="fg-m fg-dim" x="800" y="252">/revoke</text>
    <text class="fg-m fg-dim" x="800" y="276">/register</text>
    <text class="fg-m fg-dim" x="800" y="300">/device_authorization</text>
    <path class="fg-rule" d="M448,336 H992"/>
    <text class="fg-lbl" x="448" y="368">built in</text>
    <text class="fg-m" x="448" y="396">PKCE · PAR · JAR · JARM · DPoP · mTLS · FAPI 2.0 profile</text>
    <!-- supplied through options -->
    <path class="fg-edge" d="M1008,120 H1070" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="1072" y="72" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="1088" y="100">Store</text>
    <text class="fg-mxs fg-accent" x="1088" y="124">WithStore</text>
    <text class="fg-xs fg-faint" x="1088" y="148">inmem · SQL · DynamoDB</text>
    <path class="fg-edge" d="M1008,248 H1070" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="1072" y="200" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="1088" y="228">Signing keys</text>
    <text class="fg-mxs fg-accent" x="1088" y="252">WithKeyset</text>
    <text class="fg-xs fg-faint" x="1088" y="276">ES256 · rotation</text>
    <path class="fg-edge" d="M1008,376 H1070" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="1072" y="328" width="312" height="96" rx="8"/>
    <text class="fg-t2" x="1088" y="356">Login flow</text>
    <text class="fg-mxs fg-accent" x="1088" y="380">WithLoginFlow</text>
    <text class="fg-xs fg-faint" x="1088" y="404">password · TOTP · passkey</text>
  </svg>
  <figcaption class="fig-note">Nothing runs as a separate server — the handler mounts on net/http, chi, gin or any other router. Storage, keys and sign-in are parts of your application that the provider calls. Logging and metrics hook in the same way, through <code>WithLogger</code> and <code>WithPrometheus</code>.</figcaption>
</figure>

## Standard use cases

Five typical configurations. Each one links to a runnable example in the upstream repository.

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

### 2. Run the library's FAPI 2.0 Baseline profile

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
  op.WithProfile(profile.FAPI2Baseline), // library profile: PAR + JAR, DPoP default, ES256
  op.WithStaticClients(op.PrivateKeyJWTClient{
    ID: "demo-fapi",
    JWKS: clientJWKS,
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes: []string{"openid", "profile"},
  }),
)
```

::: tip Why one switch is enough
`op.WithProfile(profile.FAPI2Baseline)` applies this library's FAPI profile policy: it enables `PAR` and `JAR`, intersects `token_endpoint_auth_methods_supported` with the profile allow-list, and selects DPoP unless you explicitly enable mTLS. It also keeps OP-issued JWT signing on ES256. The final FAPI 2.0 Security Profile requires PAR, PKCE with S256, and sender-constrained tokens; JAR and ES256-only signing are choices made by this library's profile. See [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).
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
  composite.WithDefault(durable), // everything else, consumed-JTI markers included
  composite.With(composite.Sessions, volatile),
  composite.With(composite.Interactions, volatile),
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

## Where to start

| You are | Start with |
|---|---|
| New to OAuth 2.0 and OIDC | [OAuth 2.0 / OIDC primer](/concepts/oauth2-oidc-primer), then [Minimal OP](/getting-started/minimal) |
| Ready to run the library | [Install](/getting-started/install), [Required options](/getting-started/required-options), [Mount on your router](/getting-started/mount) |
| Deciding whether to adopt it | [Why go-oidc-provider](/why), [Security posture](/security/posture), [FAQ](/faq) |
| Building something specific | [Use cases](/use-cases/) |

## Install

```sh
go get github.com/libraz/go-oidc-provider@v1.4.0
```

::: info Stable API
A configuration built with `op.New` and the bundled storage adapters generally upgrades unchanged. If you bring your own store or another extension, read the current migration guidance in [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) before upgrading. Symbols marked `Experimental:` in godoc remain the ordinary minor-release exemption.
:::

## License & related

Apache-2.0. Source: [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider). Vulnerability disclosure: [SECURITY.md](https://github.com/libraz/go-oidc-provider/blob/main/.github/SECURITY.md).
