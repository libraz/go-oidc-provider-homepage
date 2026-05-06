---
title: Why go-oidc-provider
description: The pain points this library solves vs. rolling your own OIDC OP, vs. patching a heavyweight IdP into a Go service.
---

# Why go-oidc-provider

<div class="why-callout">

::: info Why this library exists
This library is a personal project. It distills the author's own pain — accumulated across years of standing up OIDC providers with **OSS libraries in other languages** — into a Go library so the parts that *should* be one switch actually are, and the parts that *should never* be on by default actually aren't.

Things that ought to be easy to embed (two-factor, passkeys, risk-based auth, SPA-driven flows, FAPI 2.0, i18n, …) are **first-class building blocks**, while deprecated, unsafe flows kept "for compatibility" elsewhere (Implicit, ROPC, `alg=none`, …) are **not exposed as public options at all**. Details are in the sections below; see [Use cases](/use-cases/) for production-shaped configurations.
:::

</div>

You're writing a Go service. You need to **be** an OpenID Connect Provider — issuing ID tokens / access tokens, hosting `/authorize` and `/token`, signing the discovery document. The choices on the market are:

| Choice | What you gain | What you take on |
|---|---|---|
| **1. Roll your own**<br>(`go-jose` + a JWT lib) | Full control of the surface | Every CVE class is yours — algorithm confusion, redirect URI mismatch, PKCE downgrade, refresh-token reuse, cookie scope, CSRF on the consent post, … |
| **2. Front a heavyweight IdP** | Operationally rich | The IdP owns the user table, the templates, the upgrade cadence. **Your Go service becomes an embedder of *their* product.** |
| **3. `go-oidc-provider`** | Library owns the protocol | You bring user accounts, storage, and UI |

This page argues option 3 by walking through the things that hurt when you build options 1 or 2.

## Pain → Answer

### "I want one switch for FAPI 2.0"

You can make PAR work, then later remember JAR, then later discover that discovery still advertises `client_secret_basic`, then later find that one test path signs an ID Token with a non-FAPI alg. That is the kind of drift FAPI makes expensive.

::: details Background — what FAPI 2.0 demands
FAPI 2.0 Baseline mandates **PAR** (RFC 9126) for authorization requests, **PKCE** (RFC 7636), **sender-constrained tokens** via DPoP (RFC 9449) or mTLS (RFC 8705), **ES256** OP signing, and **redirect_uri exact match**. Message Signing additionally requires **JAR** (RFC 9101) and **JARM** for non-repudiation of authorize request/response. Toggling these by hand is a half-dozen options and three places the discovery document needs to agree.
:::

`op.WithProfile(profile.FAPI2Baseline)` does the profile work — auto-enables PAR + JAR, requires DPoP or mTLS, intersects `token_endpoint_auth_methods_supported` with the FAPI allow-list, and keeps OP-issued JWT signing on ES256.

```go
op.New(
  /* required options */
  op.WithProfile(profile.FAPI2Baseline),
  op.WithFeature(feature.DPoP), // or feature.MTLS
  op.WithDPoPNonceSource(nonces),
)
```

::: tip Conflicts caught at startup
The constructor refuses to start if the declared profile and the declared options conflict, so partial-FAPI never escapes review.
:::

### "I don't want to give up my users table"

Heavyweight IdPs often make user storage part of the product boundary: import users, sync them, accept their profile schema, then route login through their screens. That is a poor fit when the account model is already part of your Go service.

`op.WithStore(s store.Store)` plugs into a tiny set of substore interfaces (`store.AuthCodeStore`, `store.SessionStore`, `store.UserStore`, …). The library never reads or writes your `users` table directly — your store implementation does.

```go
op.New(
  /* required options */
  op.WithStore(myStore),              // protocol state
  op.WithAuthenticators(passwordAuth), // your user lookup
)
```

Reference adapters: `inmem`, `sql` (SQLite / MySQL / Postgres), `redis` (volatile substores), `composite` (hot/cold splitter). DynamoDB is planned.

### "Cookies and CSRF on the consent POST are a minefield"

The risky part is not choosing a cookie library. It is remembering every browser rule that makes an OAuth session cookie hard to steal or replay, and keeping that rule identical across login, consent, and logout.

::: warning Easy to get one detail wrong
The `__Host-` prefix, no Domain, Path=`/`, Secure, AES-256-GCM, double-submit CSRF, Origin / Referer check, the right `SameSite` — miss any one and you have a CVE class.
:::

The library bakes in:

- `__Host-` cookie prefix (no Domain, Path=`/`, Secure)
- AES-256-GCM encryption (cookie key supplied via `op.WithCookieKeys`)
- Double-submit CSRF + Origin / Referer check on the consent / logout POST
- SameSite=`Lax` for the session cookie, `Strict` where compatible

You don't write any of this. You generate one 32-byte key, hand it to `WithCookieKeys`, and the cookie scheme is correct.

```go
cookieKey := make([]byte, 32)
if _, err := rand.Read(cookieKey); err != nil {
  return err
}

op.New(
  /* required options */
  op.WithCookieKeys(cookieKey),
)
```

### "I want to drive UI from a SPA"

The protocol engine should decide what prompt is next; your frontend should decide how it looks. Those are separate jobs.

`op.WithInteractionDriver(interaction.JSONDriver{})` swaps the default HTML driver for a JSON one — the SPA (React, Vue, Svelte, Angular, …) hits `/interaction/{uid}/...` for the prompts and posts back signed responses. Mount the SPA shell on your own router; the OP serves the JSON state surface.

```go
op.New(
  /* required options */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)

router.Handle("/", spaAssets)
router.Handle("/oidc/", provider)
```

::: warning UI mounts (`op.WithSPAUI` / `WithConsentUI` / `WithChooserUI`) are not wired yet
The option shapes are reserved for the v1.0 surface but the runtime mounts have not landed. Calling any of them today causes `op.New` to return a configuration error. Use `interaction.JSONDriver` plus your own router for now; see [Use case: SPA / custom interaction](/use-cases/spa-custom-interaction) for the working pattern.
:::

::: info SPA-safe error rendering
Error pages emit `<div id="op-error" data-code="..." data-description="...">` so the SPA host can `document.querySelector('#op-error')` without parsing markup, under CSP `default-src 'none'; style-src 'unsafe-inline'`.
:::

### "I need real conformance, not 'we follow the RFC'"

Security reviews rarely fail because a team cannot cite an RFC. They fail because no one can show which optional branches were implemented, which were refused, and what the conformance suite actually exercised.

Each release is regressed against the OpenID Foundation conformance suite. Latest baseline (sha `ab23d3c`):

| Plan | PASSED | REVIEW | SKIPPED | FAILED |
|---|---:|---:|---:|---:|
| oidcc-basic-certification-test-plan | 30 | 3 | 2 | **0** |
| fapi2-security-profile-id2-test-plan | 48 | 9 | 1 | **0** |
| fapi2-message-signing-id1-test-plan | 60 | 9 | 2 | **0** |
| **Total (3 plans, 164 modules)** | **138** | **21** | **5** | **0** |

::: tip Reading REVIEW / SKIPPED
`REVIEW` is OFCS's "human reviewer must look" verdict — the OP error pages that stay there are intentional ([details](/compliance/ofcs)). `SKIPPED` are modules that exercise things the OP refuses by design (e.g. `alg=none` request objects).
:::

### "I need observable refresh-token rotation"

When a mobile app retries the same refresh request, you want an idempotent replay inside the grace window. When a stolen old refresh token appears later, you want the whole chain revoked and an audit event that explains why.

Refresh tokens rotate by default. Reuse-detection invalidates the entire chain.

- `op.WithRefreshGracePeriod` — widens the rotation window for racing clients.
- `op.WithRefreshTokenOfflineTTL` — separates the lifetime of `offline_access` refresh tokens (stay-signed-in) from conventional rotation.

The `token.issued` / `token.refreshed` audit events carry an `offline_access` flag in `extras` so SOC dashboards can split the chains.

```go
op.New(
  /* required options */
  op.WithRefreshGracePeriod(60*time.Second),
  op.WithRefreshTokenOfflineTTL(90*24*time.Hour),
  op.WithAuditLogger(auditLogger),
)
```

### "I want metrics, but not a `/metrics` route I didn't ask for"

Libraries that mount their own observability routes tend to fight your router, auth boundary, path conventions, and SRE middleware. This library only emits protocol signals; you decide where those signals are served.

`op.WithPrometheus(reg)` registers a curated counter set on your registry. The library does **not** mount `/metrics` itself — that's your router's job.

The same separation holds for tracing (you bring `otelhttp`) and request duration histograms (your middleware).

```go
reg := prometheus.NewRegistry()
provider, _ := op.New(
  /* required options */
  op.WithPrometheus(reg),
)

router.Handle("/oidc/", provider)
router.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
```

## What this library is not

::: warning Out of scope on purpose
- **Not an IdP.** It does not store users, hash passwords, or send email. You bring the user model and an `op.Authenticator`. There's a TOTP authenticator shipped, but the password check is yours.
- **Not a generic OAuth2 framework.** It targets OpenID Connect Core 1.0 and the FAPI 2.0 family. Pure-OAuth2 builds are supported via `op.WithOpenIDScopeOptional`, but the library is opinionated toward OIDC.
- **Not a UI kit.** The default HTML driver exists so the OP boots without configuration; production embedders ship their own templates or a SPA.
:::

## Next

- [Concepts: OAuth 2.0 / OIDC primer](/concepts/oauth2-oidc-primer) — read this first if "client_credentials" or "authorization_code + PKCE" are unfamiliar.
- [Quick Start](/getting-started/install) — get a minimal OP running in 30 lines of Go.
- [Use cases](/use-cases/) — production-shaped examples, each linked to a build-tagged file in `examples/`.
