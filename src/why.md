---
title: Why go-oidc-provider
description: The pain points this library solves vs. rolling your own OIDC OP, vs. patching a heavyweight IdP into a Go service.
pageClass: pg-why
---

# Why go-oidc-provider

<div class="why-callout">

::: info Why this library exists
This library is a personal project. It comes out of years of standing up OIDC providers with **OSS libraries in other languages**: here the parts that *should* be one switch are one switch, and the parts that *should never* be on by default are not on.

Things that ought to be easy to embed — two-factor, passkeys, risk-based auth, SPA-driven flows, FAPI 2.0, i18n — are **first-class building blocks**. Deprecated, unsafe flows that other stacks keep "for compatibility" (Implicit, ROPC, `alg=none`) are **not exposed as public options at all**. The sections below walk through both halves; [Use cases](/use-cases/) has production-shaped configurations.
:::

</div>

You're writing a Go service. You need to **be** an OpenID Connect Provider — issuing ID tokens / access tokens, hosting the authorization and token endpoints, signing the discovery document. The choices on the market are:

| Choice | What you gain | What you take on |
|---|---|---|
| **1. Roll your own**<br>(`go-jose` + a JWT lib) | Full control of the surface | Every CVE class is yours — algorithm confusion, redirect URI mismatch, PKCE downgrade, refresh-token reuse, cookie scope, CSRF on the consent post, … |
| **2. Front a heavyweight IdP** | Operationally rich | The IdP owns the user table, the templates, the upgrade cadence. **Your Go service becomes an embedder of *their* product.** |
| **3. `go-oidc-provider`** | Library owns the protocol | You bring user accounts, storage, and UI |

This page argues option 3 by walking through the things that hurt when you build options 1 or 2.

<figure class="fig">
  <div class="fig-head">Who owns what</div>
  <svg class="fig-svg" role="img" aria-labelledby="why-split-title" viewBox="0 0 960 164" xmlns="http://www.w3.org/2000/svg">
    <title id="why-split-title">The split of responsibility. Your application owns users, screens and storage; the library owns the OIDC and OAuth ceremony; the consuming app only verifies tokens.</title>
    <text class="fg-lbl" x="40" y="26">you own this</text>
    <text class="fg-lbl fg-accent" x="344" y="26">the library owns this</text>
    <text class="fg-lbl" x="648" y="26">someone else owns this</text>
    <rect class="fg-box" x="36" y="38" width="280" height="104" rx="8"/>
    <text class="fg-t" x="56" y="66">Your application</text>
    <text class="fg-xs" x="56" y="88">users · screens · storage</text>
    <line class="fg-rule" x1="56" y1="102" x2="296" y2="102"/>
    <text class="fg-mxs" x="56" y="126">Authenticator · Store · Templates</text>
    <path class="fg-edge" d="M320,88 H336" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="340" y="38" width="280" height="104" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="66">go-oidc-provider</text>
    <text class="fg-xs" x="360" y="88">the OIDC / OAuth ceremony</text>
    <line class="fg-rule" x1="360" y1="102" x2="600" y2="102"/>
    <text class="fg-mxs" x="360" y="126">/authorize · /token · /jwks</text>
    <path class="fg-edge" d="M624,88 H640" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="644" y="38" width="280" height="104" rx="8"/>
    <text class="fg-t" x="664" y="66">RP / API</text>
    <text class="fg-xs" x="664" y="88">the consuming application</text>
    <line class="fg-rule" x1="664" y1="102" x2="904" y2="102"/>
    <text class="fg-mxs" x="664" y="126">verifies the tokens it is given</text>
  </svg>
  <figcaption class="fig-note">The library never asks for your user table, your login screen, or your database. It asks for interfaces, which is the difference between a library and a product you have to migrate onto.</figcaption>
</figure>

Where the line falls:

- **The library owns** token issuance, signing, PKCE, CSRF, and the consent and logout ceremonies.
- **You own** user lookup, password verification, screens, storage, and mounting the handler on your router.
- **Neither side can switch an unsafe legacy mode back on.** Those modes are not exposed as options at all, and bundles such as FAPI are pinned by a profile.

## Pain points, answered

### "I want one switch for FAPI 2.0"

You can make PAR work, then later remember JAR, then later discover that discovery still advertises `client_secret_basic`, then later find that one test path signs an ID Token with an algorithm outside the profile's allow-list. That is the kind of drift FAPI makes expensive.

::: details Background — what FAPI 2.0 demands
The final FAPI 2.0 Security Profile requires **PAR** (RFC 9126), **PKCE with S256** (RFC 7636), and **sender-constrained tokens** via DPoP (RFC 9449) or mTLS (RFC 8705). This library also enforces exact `redirect_uri` matching as a policy; FAPI 2.0 §5.5 does not require pre-registration of exact values. JAR and ES256-only OP signing are choices made by this library's `profile.FAPI2Baseline`, not requirements of the FAPI Security Profile itself. In this library, Message Signing adds **JARM** for signed authorization responses. A profile also keeps discovery and implementation choices aligned.
:::

`op.WithProfile(profile.FAPI2Baseline)` applies this library's profile policy — it enables PAR + JAR, selects DPoP unless mTLS is explicitly enabled, intersects `token_endpoint_auth_methods_supported` with the profile allow-list, and keeps OP-issued JWT signing on ES256.

```go
op.New(
  /* required options */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithProfile(profile.FAPI2Baseline),
  op.WithDPoPNonceSource(nonces),
)
```

::: tip Conflicts caught at startup
The constructor rejects option conflicts and missing collaborators it can detect at startup. It does not establish conformance with every requirement in the final FAPI 2.0 specifications; see the [RFC status matrix](/compliance/rfc-matrix).
:::

### "I don't want to give up my users table"

Heavyweight IdPs often make user storage part of the product boundary: import users, sync them, accept their profile schema, then route login through their screens. That is a poor fit when the account model is already part of your Go service.

`op.WithStore(s store.Store)` plugs into a small set of substore interfaces (`store.AuthorizationCodeStore`, `store.SessionStore`, `store.UserStore`, …). The library never reads or writes your `users` table directly. When the claims should come from your existing table, pass an application-owned `store.UserStore` to `op.WithUserStore(...)`; the protocol state stays in the adapter.

```go
op.New(
  /* required options */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(passwordLoginFlow),
  op.WithStore(myStore),                 // protocol state
  op.WithUserStore(applicationUsers),    // claims from your users table
)
```

Reference adapters: `inmem`, `sql` (SQLite / MySQL / Postgres), `redis` (volatile substores), `dynamodb` (one table per substore; experimental), and `composite` (hot/cold splitter). See [DynamoDB storage](/use-cases/dynamodb-store) for its provisioning model.

### "Cookies and CSRF on the consent POST are a minefield"

The risky part is not choosing a cookie library. It is remembering every browser rule that makes an OAuth session cookie hard to steal or replay, and applying those rules identically across login, consent, and logout.

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

`op.WithSPAUI(op.SPAUI{...})` swaps the default HTML pages for a JSON-backed SPA flow, and lets the OP serve the shell and its static assets. Your SPA — React, Vue, Svelte, Angular — fetches each prompt from `/interaction/{uid}` and posts its response back. The protocol engine keeps the state machine.

```go
op.New(
  /* required options */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(flow),
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "../internal/webui/static",
  }),
)
```

::: info UI mount options
`op.WithSPAUI`, `op.WithConsentUI`, and `op.WithChooserUI` are runnable integration points. Use `WithSPAUI` when the OP should mount a SPA shell, `WithConsentUI` for a server-rendered consent template, and `WithChooserUI` for a server-rendered account chooser. The lower-level `interaction.JSONDriver` remains available when you want to own the router and state fetch loop yourself. See [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login).
:::

::: info SPA-safe error rendering
Error pages emit `<div id="op-error" data-code="..." data-description="...">` so the SPA host can `document.querySelector('#op-error')` without parsing markup, under CSP `default-src 'none'; style-src 'unsafe-inline'`.
:::

### "I need real conformance, not 'we follow the RFC'"

Security reviews rarely fail because a team cannot cite an RFC. They fail because no one can show which optional branches were implemented, which were refused, and what the conformance suite actually exercised.

Each release is regressed against the OpenID Foundation conformance suite. The latest release run and its full raw breakdown, review rationale, and blocker decision are on [OFCS conformance](/compliance/ofcs).

::: tip Reading REVIEW / SKIPPED
`REVIEW` is OFCS's "human reviewer must look" verdict — the OP error pages that stay there are intentional ([details](/compliance/ofcs)). `SKIPPED` are modules that exercise things the OP refuses by design (e.g. `alg=none` request objects). A raw `FAILED` or no-verdict result is never silently accepted: it must match a reviewed, unexpired exclusion for the release verifier to pass.
:::

### "I need observable refresh-token rotation"

When a mobile app retries the same refresh request, you want an idempotent replay inside the grace window. When a stolen old refresh token appears later, you want the whole chain revoked and an audit event that explains why.

Refresh tokens rotate by default. Reuse detection invalidates the entire chain. This is a library policy; final FAPI 2.0 Security Profile §5.3.2.1(9) prohibits routine refresh-token rotation except under extraordinary circumstances, so this default does not establish final-profile conformance.

- `op.WithRefreshGracePeriod` — widens the rotation window for racing clients; this library's `profile.FAPI2Baseline` and `profile.FAPI2MessageSigning` accept explicit values from 0 through 60 seconds (inclusive) and reject only a value above 60 seconds.
- Refresh rotation rechecks the effective scope against the client's current registration before consuming the presented token, so narrowing a registration takes effect on an existing chain.
- `op.WithRefreshTokenOfflineTTL` — separates the lifetime of `offline_access` refresh tokens (stay-signed-in) from conventional rotation.

The `token.issued` / `token.refreshed` audit events carry an `offline_access` flag in `extras` so SOC dashboards can split the chains.

```go
op.New(
  /* required options */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
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
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
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
