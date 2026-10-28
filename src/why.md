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

The rest of this page walks through what hurts when you pick option 1 or 2, and what the library does about each.

<figure class="fig">
  <div class="fig-head">Who owns what</div>
  <svg class="fig-svg" role="img" aria-labelledby="why-split-title" viewBox="0 0 960 176" xmlns="http://www.w3.org/2000/svg">
    <title id="why-split-title">The split of responsibility. Your application owns users, screens and storage; the library owns the OIDC and OAuth ceremony; the consuming app only verifies tokens.</title>
    <!-- column labels -->
    <text class="fg-lbl" x="32" y="40">you own this</text>
    <text class="fg-lbl fg-accent" x="344" y="40">the library owns this</text>
    <text class="fg-lbl" x="656" y="40">someone else owns this</text>
    <!-- your application -->
    <rect class="fg-box" x="32" y="56" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="84">Your application</text>
    <text class="fg-s" x="48" y="108">users · screens · storage</text>
    <text class="fg-mxs" x="48" y="132">Authenticator · Store</text>
    <path class="fg-edge" d="M304,104 H344" marker-end="url(#fg-a)"/>
    <!-- the library -->
    <rect class="fg-box fg-box--accent" x="344" y="56" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="84">go-oidc-provider</text>
    <text class="fg-s" x="360" y="108">the OIDC / OAuth ceremony</text>
    <text class="fg-mxs" x="360" y="132">/auth · /token · /jwks</text>
    <path class="fg-edge" d="M616,104 H656" marker-end="url(#fg-a)"/>
    <!-- the consuming application -->
    <rect class="fg-box" x="656" y="56" width="272" height="96" rx="8"/>
    <text class="fg-t" x="672" y="84">RP / API</text>
    <text class="fg-s" x="672" y="108">the consuming application</text>
    <text class="fg-s" x="672" y="132">verifies tokens it receives</text>
  </svg>
  <figcaption class="fig-note">The library never asks for your user table, your login screen, or your database. It asks for interfaces, which is the difference between a library and a product you have to migrate onto.</figcaption>
</figure>

Where the line falls:

- **The library owns** token issuance, signing, PKCE, CSRF, and the consent and logout ceremonies.
- **You own** user lookup, password verification, screens, storage, and mounting the handler on your router.
- **Neither side can switch an unsafe legacy mode back on.** Those modes are not exposed as options at all, and bundles such as FAPI are pinned by a profile.

## Pain points, answered

| What hurts | What the library gives you | Section |
|---|---|---|
| FAPI 2.0 settings drift apart | `op.WithProfile(profile.FAPI2Baseline)` | [one switch](#fapi) |
| Your users table cannot move | `op.WithUserStore` plus your own store | [users table](#users-table) |
| Cookie and CSRF details | a fixed scheme keyed by one 32-byte secret | [cookies](#cookies) |
| Login UI in a SPA | `op.WithSPAUI` or the JSON driver | [SPA](#spa) |
| "We follow the RFC" is not evidence | a conformance-suite run per release | [conformance](#conformance) |
| Refresh-token theft and retry storms | rotation with a grace window and reuse detection | [rotation](#rotation) |
| A `/metrics` route you did not ask for | counters on your registry, no route | [metrics](#metrics) |

### "I want one switch for FAPI 2.0" {#fapi}

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

### "I don't want to give up my users table" {#users-table}

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

### "Cookies and CSRF on the consent POST are a minefield" {#cookies}

The risky part is not choosing a cookie library. It is remembering every browser rule that makes an OAuth session cookie hard to steal or replay, and applying those rules identically across login, consent, and logout.

::: warning Easy to get one detail wrong
The `__Host-` prefix, no Domain, Path=`/`, Secure, AES-256-GCM, double-submit CSRF, Origin / Referer check, the right `SameSite` — miss any one and you have a CVE class.
:::

The library bakes in:

- `__Host-` cookie prefix (no Domain, Path=`/`, Secure)
- AES-256-GCM encryption (cookie key supplied via `op.WithCookieKeys`)
- Double-submit CSRF + Origin / Referer check on the consent / logout POST
- `SameSite=Lax` for the session cookie, `SameSite=Strict` for the CSRF cookies

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

### "I want to drive UI from a SPA" {#spa}

The protocol engine should decide what prompt is next; your frontend should decide how it looks. Those are separate jobs.

`op.WithSPAUI(op.SPAUI{...})` swaps the default HTML pages for a JSON-backed SPA flow, and lets the OP serve the shell and its static assets. Your SPA (React, Vue, Svelte, Angular) fetches each prompt as JSON under `LoginMount/state/{uid}` and posts its response back. The protocol engine keeps the state machine.

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

### "I need real conformance, not 'we follow the RFC'" {#conformance}

Security reviews rarely fail because a team cannot cite an RFC. They fail because no one can show which optional branches were implemented, which were refused, and what the conformance suite actually exercised.

Each release is regressed against the OpenID Foundation conformance suite. The latest release run and its full raw breakdown, review rationale, and blocker decision are on [OFCS conformance](/compliance/ofcs).

::: tip Reading REVIEW / SKIPPED
`REVIEW` is OFCS's "human reviewer must look" verdict — the OP error pages that stay there are intentional ([details](/compliance/ofcs)). `SKIPPED` are modules that exercise things the OP refuses by design (e.g. `alg=none` request objects). A raw `FAILED` or no-verdict result is never silently accepted: it must match a reviewed, unexpired exclusion for the release verifier to pass.
:::

### "I need observable refresh-token rotation" {#rotation}

When a mobile app retries the same refresh request, you want an idempotent replay inside the grace window. When a stolen old refresh token appears later, you want the whole chain revoked and an audit event that explains why.

Refresh tokens rotate by default. When an already-rotated token is presented outside the grace window, the OP treats it as theft (RFC 9700 §2.2.2): it revokes that refresh chain and every access token issued under the grant. Revoking a single refresh token at `/revoke` is narrower: it retires only that token's own chain, so the user's other devices keep their refresh tokens. Rotation is a library policy. Final FAPI 2.0 Security Profile §5.3.2.1(9) prohibits routine refresh-token rotation except under extraordinary circumstances, so this default does not establish final-profile conformance.

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

### "I want metrics, but not a `/metrics` route I didn't ask for" {#metrics}

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
