---
title: FAQ
description: Recurring questions — picked from the embedder pain points the maintainer hit while building the library and writing the example suite.
outline: 2
pageClass: pg-faq
---

# FAQ

Every question below came out of building the example suite or running the conformance harness. If you are stuck on one of them, the answer here is the one the project itself uses.

<figure class="fig">
  <div class="fig-head">How to read this FAQ</div>
  <svg class="fig-svg" role="img" aria-labelledby="faq-order-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="faq-order-title">A reading order for this FAQ: get the OP booted first, then move into whichever area you are working in, then finish at the error catalogue and the adoption questions.</title>
    <!-- start -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="52">Boot it first</text>
    <text class="fg-s" x="360" y="76">required options</text>
    <text class="fg-s" x="360" y="100">issuer · store · keys</text>
    <!-- fan-out -->
    <path class="fg-leader" d="M480,120 V144 M168,144 H792"/>
    <path class="fg-edge fg-edge--thin" d="M168,144 V168" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M480,144 V168" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M792,144 V168" marker-end="url(#fg-a)"/>
    <!-- areas -->
    <rect class="fg-box" x="32" y="168" width="272" height="72" rx="8"/>
    <text class="fg-t" x="48" y="196">FAPI / DPoP</text>
    <text class="fg-s" x="48" y="220">profiles, sender constraints</text>
    <rect class="fg-box" x="344" y="168" width="272" height="72" rx="8"/>
    <text class="fg-t" x="360" y="196">Tokens / storage</text>
    <text class="fg-s" x="360" y="220">formats, TTLs, store choice</text>
    <rect class="fg-box" x="656" y="168" width="272" height="72" rx="8"/>
    <text class="fg-t" x="672" y="196">UI / SPA / MFA</text>
    <text class="fg-s" x="672" y="220">screens and interaction</text>
    <!-- merge -->
    <path class="fg-leader" d="M168,240 V264 M480,240 V264 M792,240 V264 M168,264 H792"/>
    <path class="fg-edge fg-edge--thin" d="M480,264 V288" marker-end="url(#fg-a)"/>
    <!-- errors, adoption -->
    <rect class="fg-box" x="344" y="288" width="272" height="72" rx="8"/>
    <text class="fg-t" x="360" y="316">Errors</text>
    <text class="fg-s" x="360" y="340">failures and what to change</text>
    <path class="fg-edge fg-edge--thin" d="M616,324 H656" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="656" y="288" width="272" height="72" rx="8"/>
    <text class="fg-t" x="672" y="316">Adoption</text>
    <text class="fg-s" x="672" y="340">production · disclosure</text>
  </svg>
  <figcaption class="fig-note">Only the middle row is a choice: pick the area you are working in. Booting first, and the error and adoption pages at the end, apply to everyone.</figcaption>
</figure>

<ul class="faq-index">
  <li><a href="#setup-basics"><div class="faq-index-title">Setup &amp; basics</div><div class="faq-index-desc">Required options, mount path, issuer normalization, minimal setup</div></a></li>
  <li><a href="#fapi"><div class="faq-index-title">FAPI 2.0</div><div class="faq-index-desc">Baseline vs Message Signing, DPoP / mTLS choice</div></a></li>
  <li><a href="#tokens"><div class="faq-index-title">Tokens &amp; rotation</div><div class="faq-index-desc">Refresh rotation grace, <code>offline_access</code>, TTL split</div></a></li>
  <li><a href="#dpop"><div class="faq-index-title">DPoP &amp; sender-constraint</div><div class="faq-index-desc">DPoP nonce distribution, narrowed alg list rationale</div></a></li>
  <li><a href="#storage"><div class="faq-index-title">Storage</div><div class="faq-index-desc">Existing users table, adapter choice, composite invariant</div></a></li>
  <li><a href="#ui-spa"><div class="faq-index-title">UI &amp; SPA</div><div class="faq-index-desc">SPA login flow (React/Vue/Svelte/…), CORS, consent UI customization</div></a></li>
  <li><a href="#auth-mfa"><div class="faq-index-title">Auth &amp; MFA</div><div class="faq-index-desc">Password / TOTP / passkey, step-up, risk-based</div></a></li>
  <li><a href="#logout"><div class="faq-index-title">Logout</div><div class="faq-index-desc">Why no Front-Channel, Back-Channel fan-out gaps</div></a></li>
  <li><a href="#native-loopback"><div class="faq-index-title">Native apps &amp; loopback</div><div class="faq-index-desc"><code>127.0.0.1</code> redirect_uri opt-in rules</div></a></li>
  <li><a href="#observability"><div class="faq-index-title">Observability</div><div class="faq-index-desc">Why no auto-mounted <code>/metrics</code>, audit event catalog</div></a></li>
  <li><a href="#conformance"><div class="faq-index-title">Conformance &amp; versions</div><div class="faq-index-desc">REVIEW meaning, certification claims, upgrade stability</div></a></li>
  <li><a href="#errors"><div class="faq-index-title">Common errors</div><div class="faq-index-desc"><code>redirect_uri</code> mismatch, <code>alg not allowed</code>, <code>jkt mismatch</code></div></a></li>
  <li><a href="#adoption"><div class="faq-index-title">Adoption</div><div class="faq-index-desc">Production fit, security disclosure path</div></a></li>
</ul>

<div id="setup-basics" class="faq-anchor"></div>

## Setup & basics

### Why does `op.New(...)` return an error?

The core options have no safe default, so `op.New` refuses to start without them instead of falling back to zero values. `WithIssuer`, `WithStore` and `WithKeyset` are always required. When the `authorization_code` grant is enabled, which the default grant set does, `WithCookieKeys` and `WithLoginFlow` (or `WithAuthenticators`) are required too:

| Option | Without it |
|---|---|
| `WithIssuer` | The OP has no identity to put in `iss` or in the discovery URL. |
| `WithStore` | The OP has nowhere to persist clients, codes and tokens. |
| `WithKeyset` | The OP cannot sign ID tokens. |
| `WithCookieKeys` | The OP cannot seal the session and CSRF cookies of the browser flow. |
| `WithLoginFlow` | No user can sign in, so the OP refuses instead of failing the first real request. |

The error names the missing piece, so a typo at boot surfaces at start-up instead of as a runtime mystery. `op.New` also rejects combinations that cannot work, such as `WithLoginFlow` together with `WithAuthenticators`, or a statically seeded `client_secret_basic` client with no secret. [Required options](/getting-started/required-options) walks through each.

::: tip Recommended pattern
Generate a 32-byte cookie key with `crypto/rand` once per environment and feed it through your config or secret manager. [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) shows the complete setup, including the RP that drives it.
:::

### Where does the OP mount? Can I prefix it?

Mount the returned `http.Handler` at the root of your router and choose the URL prefix with `op.WithMountPrefix`. The default is `/oidc`; `op.WithMountPrefix("/")` serves the endpoints at the root. The discovery document is built from the issuer and the mount prefix, so RPs always see consistent URLs. [Mount on your router](/getting-started/mount) lists where each endpoint lands.

### What's the smallest config that boots?

```go
st := inmem.New()
handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(st),
    op.WithKeyset(myKeyset),
    op.WithCookieKeys(cookieKey), // 32 bytes
    op.WithLoginFlow(op.LoginFlow{
        Primary: op.PrimaryPassword{Store: st.UserPasswords()},
    }),
)
```

This is the minimum for a browser flow: the three always-required options, plus cookie keys and a login flow for the authorization-code grant. See [Minimal OP](/getting-started/minimal).

### "Issuer must not have a trailing slash" — really?

Really. RFC 9207 mix-up defence depends on byte-exact `iss` comparison across the whole ecosystem, so `op.WithIssuer` enforces a single canonical form. It rejects:

- trailing slash (`https://op/` → no);
- mixed-case scheme (`HTTPS://op` → no);
- mixed-case host (`https://OP.example.com` → no);
- default port (`https://op:443` → no, `http://127.0.0.1:80` → no);
- fragment (`https://op#x` → no);
- query (`https://op?x=1` → no);
- non-canonical path (`..`, `.`, or duplicate slashes — checked via `path.Clean`).

::: details Why so strict?
A single non-canonical character on either side of an RP's verification flips byte equality and breaks the mix-up defence silently. The error is at construction time so the misconfiguration can't reach production. See <a class="doc-ref" href="/security/design-judgments">Design judgments §9</a>.
:::

<div id="fapi" class="faq-anchor"></div>

## FAPI 2.0

### What does `op.WithProfile(profile.FAPI2Baseline)` actually flip?

In one call, it applies this library's FAPI profile policy across these areas:

| Knob | Effect |
|---|---|
| Feature flags | enables `feature.PAR` and this library's JAR setting; selects `feature.DPoP` unless `feature.MTLS` is explicitly enabled |
| Client auth | narrows `token_endpoint_auth_methods_supported` to `private_key_jwt`, the method implemented by this library profile |
| Alg constraints | narrows client-signed request and assertion algorithms to the profile allow-list |
| `redirect_uri` | enforces exact match (no wildcarding) |
| PKCE | requires S256 on every code request |
| `state` / `nonce` | one of the two required on every authorize request |
| PAR | `/auth` rejects a request that was not pushed to `/par` first |
| Lifetimes | caps `WithAccessTokenTTL` at 10 minutes, and `WithPARLifetime` must stay below 600 seconds |

The final FAPI 2.0 Security Profile requires PAR, PKCE with S256, and sender-constrained tokens. The exact `redirect_uri` row is this library's policy; FAPI 2.0 §5.5 does not require pre-registration of exact values. JAR, this library's algorithm narrowing, and ES256-only OP signing are library profile settings, not requirements of the FAPI Security Profile.

::: warning Subsequent options that contradict the profile cause `op.New` to return an error.
The profile is intentionally rigid, so it cannot be partially relaxed by accident.
:::

### Baseline vs Message Signing — when do I need each?

In this library, Message Signing is `profile.FAPI2Baseline` plus JARM, and it also requires an `op.WithDPoPNonceSource` whenever DPoP is active. Pick it when your RP needs **non-repudiation** of the authorization request and response — an open-banking style audit chain, for example. Otherwise the library's Baseline profile is enough.

| `FAPI2Baseline` (library profile) | Message Signing |
|---|---|
| PAR + JAR (library setting) + PKCE (S256) + DPoP / mTLS | + JARM (signed authorization response) |

### Can I run FAPI 2.0 without DPoP?

Yes. Switch to mTLS sender binding by enabling it with `op.WithFeature(feature.MTLS)` and, when a proxy terminates TLS, configuring the certificate header with `op.WithMTLSProxy(...)`. FAPI 2.0 §5.3.2.1(4)–(5) requires "DPoP **or** mTLS"; this library's FAPI profile still uses `private_key_jwt` for `/token` client authentication.

<div id="tokens" class="faq-anchor"></div>

## Tokens & rotation

### My refresh-token retry returns `invalid_grant` — but the request was already in flight.

That's the **rotation grace window**. The default is 60 seconds: if the rotation network round-trip dropped, presenting the previous refresh token within the window returns the saved successor without rotating again. A sender-constrained retry may receive a newly bound access token. After the window, or if the chain was already revoked for reuse detection, you get `invalid_grant`.

::: details Tune the window
For a non-FAPI profile, `op.WithRefreshGracePeriod(90 * time.Second)` widens it. Under this library's `profile.FAPI2Baseline` or `profile.FAPI2MessageSigning`, explicit values from `0` through `60s` (inclusive; the default) are accepted and only a value above `60s` is rejected. `op.WithRefreshGracePeriod(0)` disables grace entirely (strict single-use); negative values are rejected at the option site. See <a class="doc-ref" href="/security/design-judgments">Design judgments §2</a>.

This window is a library setting, not a final FAPI conformance rule. FAPI 2.0 Security Profile §5.3.2.1(9) prohibits routine refresh-token rotation except under extraordinary circumstances.
:::

### Why didn't I get a refresh token?

The built-in authorization-code response issues a refresh token only when all of these conditions hold:

1. The provider's grant set accepts `grant.RefreshToken` (it is enabled by default; `WithGrants` replaces the default set).
2. The client's `GrantTypes` includes `refresh_token`.
3. The granted scope contains `openid`, unless `op.WithOpenIDScopeOptional()` is enabled.
4. When `op.WithStrictOfflineAccess()` is enabled, the granted scope also contains `offline_access`.

If the provider or client grant is missing while `openid` is present, the token endpoint succeeds with `access_token` + `id_token` and no `refresh_token`. Without `openid`, no ID Token is issued. With `op.WithOpenIDScopeOptional()`, an OAuth-only request can receive an access token and a refresh token when the grant gates pass. Under this library's default policy, `offline_access` is **not** required to receive a refresh token — it selects the offline TTL bucket and shapes the consent/audit surface.

::: details Making `offline_access` a hard requirement
OIDC Core 1.0 §11 defines `offline_access` for access after the user is no longer present. Opt in with `op.WithStrictOfflineAccess()` to make that scope a hard refresh-token issuance gate; every RP that wants this behavior must then request `offline_access` explicitly. The constructor rejects combining this option with `op.WithOpenIDScopeOptional()` as a library policy. See <a class="doc-ref" href="/security/design-judgments">Design judgments §3</a>.
:::

### Where do I split "stay signed in" from regular sessions?

`op.WithRefreshTokenOfflineTTL(...)` separates the long-lived `offline_access` chains from the conventional rotation TTL. The `token.issued` audit event carries `extras.offline_access=true` so SOC dashboards can split the chains.

### What does revoking a refresh token revoke?

`/revoke` on a refresh token revokes that token's whole rotation chain, however long the chain has grown, and the access tokens issued under the grant stop being accepted. The user's other refresh chains on the same client are not touched, so a second device keeps working and can mint new access tokens. A refresh-token replay is the exception: RFC 9700 §2.2.2 treats it as theft, so the OP revokes the replayed chain together with every access token issued under the grant. The `token.revoked` audit event reports `surface: "refresh_grant"` when `/revoke` had to fall back from the chain to the grant's refresh tokens.

A bring-your-own store gets this per-chain scope only if it implements `store.OpaqueAccessTokenChainRevoker` and `store.IssuanceRevocationChecker` and persists `ChainID`. Without them, revocation stays grant-wide.

<div id="dpop" class="faq-anchor"></div>

## DPoP & sender-constraint {#dpop-sender-constraint}

### Why do I need a DPoP nonce, and how do I serve it?

**Why.** RFC 9449 §8 lets the OP push a server-supplied nonce through the `DPoP-Nonce` response header to mitigate pre-generated proof attacks.

**How.** The library ships an in-memory reference source and exposes the seam:

```go
src, err := op.NewInMemoryDPoPNonceSource(ctx, rotate) // demo-grade
if err != nil { /* handle */ }
op.WithDPoPNonceSource(src)
```

See [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) for the wiring shape.

::: warning Multi-instance deployments
A process-local nonce source breaks across replicas. For HA, plug a shared store (Redis) behind your `DPoPNonceSource`. The library deliberately doesn't ship a Redis nonce source yet — the option matrix (TTL, rotation cadence, missed-rotation tolerance) is too specific to operator setup.
:::

### `dpop_signing_alg_values_supported` — RS256 missing?

Correct. The DPoP discovery list is `ES256, EdDSA, PS256` — narrower than the codebase JOSE allow-list, which the OP applies when it *verifies* a client assertion or JAR request object. DPoP proofs are restricted to the FAPI-recommended subset. Note that `RS256` is not an OP signing algorithm either: this library issues tokens with `ES256` only, as a library policy rather than an implementation gap.

<div id="storage" class="faq-anchor"></div>

## Storage

### Do I need to migrate my users table?

No. The library never reads or writes your `users` table directly. You point `op.PrimaryPassword` (or another login step, or your own `op.Authenticator`) and `store.UserStore` at whatever schema you already have. The OP asks "is this credential valid?" and "what claims does this subject have?" — that's the only contact surface.

### Which storage adapter should I pick?

| Adapter | When |
|---|---|
| `inmem` | Tests, demos, single-process dev |
| `sql` (SQLite / MySQL / Postgres) | Single durable backend; easiest production path |
| `redis` (sessions, interactions, consumed JTIs) | Pair with `sql` via `composite` for a hot/cold split; it cannot serve as the store alone |
| `composite` | Hot/cold; all `TxClusterKinds` share one comparable transactional backend, while other kinds may route separately |
| `dynamodb` | One-table-per-substore durable backend; `store.Transactional` supports the browser authorization-code flow. Experimental API. |

See [/use-cases/sql-store](/use-cases/sql-store), [/use-cases/dynamodb-store](/use-cases/dynamodb-store), and [/use-cases/hot-cold-redis](/use-cases/hot-cold-redis).

### Why does `composite.New` reject my config at boot?

Because the transactional cluster invariant says the substores that take part in one transaction must share **one** backend: authorization codes, refresh tokens, grants, pushed authorization requests, access tokens, opaque access tokens and grant revocations (`composite.TxClusterKinds`). Sessions and interactions are outside the cluster and may live in Redis. Consumed-JTI markers are not eviction-tolerant, so route them to Redis only on a `noeviction` instance; the default is to keep them with the durable store. `composite.New` checks all of this at construction and refuses a configuration that would split a transaction across two stores.

<div id="ui-spa" class="faq-anchor"></div>

## UI & SPA

### How do I drive login / consent from a SPA?

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

op.WithInteractionDriver(interaction.JSONDriver{})
```

The JSON driver returns each prompt (`login`, `consent.scope`, `chooser`, …) as JSON at the same `/interaction/{uid}` path the HTML driver uses. The SPA — React, Vue, Svelte, Angular, or vanilla — fetches the prompt, POSTs `{state_ref, values}` back with the `X-CSRF-Token` header echoing `prompt.csrf_token` (double-submit cookie), and follows the terminal `{type:"redirect", location}` envelope.

::: info UI mount options
Use `op.WithSPAUI` when the OP should mount the SPA shell and JSON state surface for you. In that mode the shell lives at `LoginMount/{uid}` and prompt JSON at `LoginMount/state/{uid}`. Use `op.WithConsentUI` and `op.WithChooserUI` when you want server-rendered HTML templates for consent or account selection. The `interaction.JSONDriver` path remains available when your own router serves the shell; its state endpoint is `/interaction/{uid}`. See [SPA / custom interaction](/use-cases/spa-custom-interaction), [Custom chooser UI](/use-cases/custom-chooser-ui), [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login), and [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui).

`WithSPAUI` and `WithConsentUI` are mutually exclusive. `WithChooserUI` can be supplied with `WithSPAUI`, but SPA mode shadows the chooser template and emits a warning because the SPA owns the chooser surface.
:::

::: details SPA-safe error rendering
Error pages emit `<div id="op-error" data-code="..." data-description="...">` under CSP `default-src 'none'; style-src 'unsafe-inline'`, so the SPA host queries by selector without parsing markup.
:::

### CORS — how do I allow my SPA origin?

```go
op.WithCORSOrigins("https://app.example.com")
```

For the API endpoints (`/token`, `/userinfo`, `/introspect`, `/revoke`, `/par`) the allowlist also includes the issuer origin and the redirect-URI origins of clients seeded with `WithStaticClients`. A client that lives only in the client store, or was created by dynamic registration, contributes no origin, so a browser client of that kind needs its origin in `WithCORSOrigins`. See [/use-cases/cors-spa](/use-cases/cors-spa).

Redirect-URI origins never authorize cross-origin interaction or end-session ceremonies. Those accept only the issuer origin and origins explicitly passed to `WithCORSOrigins`, and a ceremony origin must be same-site with the issuer. A genuinely cross-site explicit origin may pass preflight and receive CORS headers, but the browser withholds the `__Host-` ceremony cookies, including `__Host-oidc_interaction` (`SameSite=Lax`), `__Host-oidc_csrf` (`SameSite=Strict`), and `__Host-oidc_logout_csrf` (`SameSite=Strict`), so interaction and end-session requests return `404`. Put ceremony UI on an issuer-sibling host, such as `login.example.com` alongside `op.example.com`.

### Can I customize the consent screen without forking the library?

Yes. There are three supported paths:

- **Stay on the bundled HTML driver and rebrand via locale bundles.** `op.WithLocale` overrides any consent string by key — the seed `en` / `ja` bundles cover the rendered surface and you ship overlays for the keys you care about. See [Use case: i18n / locale negotiation](/use-cases/i18n).
- **Pass `op.WithConsentUI` and own the template.** The OP renders your `*html/template.Template` with `ConsentTemplateData` and still owns state, CSRF, and persistence. See [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui).
- **Switch to the JSON driver and own the markup.** `op.WithInteractionDriver(interaction.JSONDriver{})` returns the consent prompt as JSON, and your own page (or SPA) renders it. See [SPA / custom interaction](/use-cases/spa-custom-interaction).

<div id="auth-mfa" class="faq-anchor"></div>

## Auth & MFA

### Where does password / TOTP / passkey verification live?

The library ships building blocks (`op.PrimaryPassword`, `op.StepTOTP`, `op.RuleAlways`, …) that you compose into an `op.LoginFlow`. The flow decides which factors run and in which order; the credential storage is your implementation of `store.UserPasswordStore` and `store.TOTPStore` (the in-memory adapter exposes them as `UserPasswords()` and `TOTPs()`). The `op.Authenticator` type is exposed for fully custom factors (passkey, email-OTP, …). [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) and onward.

### How do I implement step-up?

Add `op.RuleACR("urn:example:mfa", op.StepTOTP{...})` to `LoginFlow.Rules`. It runs its step when the authorization request's `acr_values` contains that exact value; your flow defines which ACR values require which factors. This is an authorization-request rule, not the RFC 9470 resource-server-to-authorization-server challenge. [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) shows the complete flow.

### Can I trigger MFA only when the risk score is high?

Configure a `RiskAssessor`, then add a rule such as `op.RuleRisk(op.RiskScoreHigh, op.StepTOTP{...})` to `LoginFlow.Rules`. `RiskOutcome.Score` selects the threshold; the rule's second argument is the step to run. See [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa).

<div id="logout" class="faq-anchor"></div>

## Logout

### Why no Front-Channel Logout?

Modern browser defaults (third-party-cookie phase-out, `SameSite=Lax` default) have made the iframe-based session signalling Front-Channel Logout 1.0 / Session Management 1.0 require effectively inoperative. The library ships RP-Initiated Logout 1.0 + Back-Channel Logout 1.0 instead — see <a class="doc-ref" href="/security/design-judgments">Design judgments §5</a>.

### Back-Channel Logout fan-out is missing some RPs.

The `/end_session` handler snapshots each subject from the OP session before it calls the detached BCL coordinator. The coordinator derives its audience with `GrantStore.ListClientIDsBySubject` and resolves eligible clients with a registered back-channel URI. `op.AuditBCLNoSessionsForSubject` therefore means that this session-bearing logout notice resolved to zero eligible grant-derived RP targets; it is not a direct session-eviction signal. If a volatile `SessionStore` loses the session before the handler can take that snapshot, the logout trigger/snapshot can be lost and the fan-out (and this event) never starts. `op.WithSessionDurabilityPosture` records the declared durability so SOC dashboards can interpret that risk; see <a class="doc-ref" href="/security/design-judgments">Design judgments §10</a>.

<div id="native-loopback" class="faq-anchor"></div>

## Native apps & loopback

### My CLI's `127.0.0.1:54312/cb` redirect_uri got rejected.

This library's default redirect-URI matching is byte-exact, and its FAPI profiles keep that policy. Loopback port wildcarding (RFC 8252 §7.3) is **opt-in per client**: the registered `redirect_uris` list must contain a loopback URI, and the OP will then ignore port mismatch when scheme is `http`, the registered hostname is a loopback shape (`127.0.0.1`, `::1`, or — when registration-side opt-in is on — the textual `localhost`), the requested host matches the registered one, and path / query / fragment exact-match. The textual `localhost` is admitted only when the embedder opted in at registration time (`op.WithAllowLocalhostLoopback()` for web clients, `application_type=native` for native clients); deployments that need the strict literal-IP-only posture leave both opt-ins off. See <a class="doc-ref" href="/security/design-judgments">Design judgments §4</a>.

<div id="observability" class="faq-anchor"></div>

## Observability

### Where's `/metrics`? I configured `op.WithPrometheus(...)`.

The library does **not** mount `/metrics`. `op.WithPrometheus(reg)` registers the OP's curated counter set on the registry you pass; the HTTP route is your router's job. The same separation applies to tracing (`otelhttp.NewMiddleware` is yours) and request-duration histograms. This is a deliberate scope decision — the OP emits **OIDC business** counters, logs, and audit events only; it does not create OpenTelemetry spans. HTTP-lifecycle observation is embedder territory.

[`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics).

### What audit events does the library emit?

A finite catalog (search `op.Audit*` constants in `op/audit.go`):

| Category | Covers |
|---|---|
| `login.*` / `mfa.*` / `step_up.*` | login flow factor outcomes |
| `code.*` / `token.*` / `refresh.*` | code + token issuance / refresh / revoke |
| `session.*` / `logout.*` / `bcl.*` | session and logout lifecycle |
| `consent.*` | consent decisions |
| `dcr.*` | Dynamic Client Registration |
| `device_authorization.*` / `device_code.*` | RFC 8628 |
| `ciba.*` | OIDC CIBA |
| `token_exchange.*` | RFC 8693 |
| `client_authn.*` / `introspection.*` | client auth / introspection |
| `account.*` / `federation.*` / `recovery.*` | account-management feed |
| `rate_limit.*` / `pkce.*` / `redirect_uri.*` / `alg.*` / `cors.*` / `dpop.*` / `key.*` / `lockout.*` | defensive signals |
| `custom_grant.*` / `grant_management.*` / `cascade.*` / `startup.*` | custom grants, Grant Management, teardown cascades, boot-time posture record |

Every event carries `audit="true"` and its `event` identifier. Fields such as `actor_id`, `client_id`, and `request_id` appear only when set; the category-specific `extras` group is omitted when empty. Subscribe through `op.WithAuditLogger(...)` (a `*slog.Logger`). See the [audit event catalog](/reference/audit-events#common-attributes) for the full record shape.

<div id="conformance" class="faq-anchor"></div>

## Conformance & versions

### Why does the OFCS status show REVIEW as well as PASSED?

OFCS records several outcomes, and only `PASSED` means "ran clean". A raw `FAILED` means the suite did not observe the expected result, and it blocks the release unless the strict verifier matches it to a reviewed, unexpired exclusion:

| Verdict | What it means |
|---|---|
| `PASSED` | Test ran, OP behaved correctly per spec. |
| `REVIEW` | Test ran, OP behaved correctly — OFCS wants a human to verify a UI artefact (e.g. a screenshot of the rendered error page). |
| `FAILED` | The module did not reach the suite's expected result. It blocks a release unless it has a reviewed, expiry-bound exclusion. |

The headless harness records `REVIEW` as-is rather than auto-passing it. The current release run and its detailed breakdown are documented on <a class="doc-ref" href="/compliance/ofcs">OFCS conformance</a>.

### Can I cite this library as "OIDF-certified"?

No. The project pays no OpenID Foundation membership and holds no formal certification. The OFCS baseline is a reproducible snapshot of spec conformance, not a certification. See <a class="doc-ref" href="/security/posture">Security posture</a>.

### Should I pin a tag?

Yes. Pin production dependencies in `go.mod` and read the [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) before an upgrade. Configurations using `op.New` with bundled storage adapters generally upgrade unchanged; BYO stores and other extensions need a review of the current migration guidance. APIs marked `Experimental:` remain the ordinary minor-release exemption.

<div id="errors" class="faq-anchor"></div>

## Common errors {#common-errors}

### `invalid_request: redirect_uri is not registered for this client`

`/auth` compares `redirect_uri` byte for byte with the client's registered list, and shows this error on the OP's own page instead of redirecting, because the URI is not yet trusted. Three usual causes:

1. Trailing slash drift (`/cb` vs `/cb/`).
2. Default port included on one side (`https://rp.example.com:443/cb` vs `https://rp.example.com/cb`).
3. CLI / native loopback without the RFC 8252 §7.3 opt-in (above).

### `invalid_request_object: request object alg is not allowed`

The `alg` of a JAR request object at `/auth` or `/par` is outside the allow-list (`RS256`, `PS256`, `ES256`, `EdDSA`) or outside the client's `request_object_signing_alg`. A `private_key_jwt` client assertion with a bad `alg` gets the deliberately opaque `invalid_client` ("client authentication failed") instead. If you use this library's `profile.FAPI2Baseline`, narrow each client to `PS256` (or `ES256` / `EdDSA`); that library profile rejects `RS256`.

### `invalid_request: this OP requires authorization requests to be pushed via the PAR endpoint`

A FAPI 2.0 profile makes PAR mandatory, so a plain `/auth?...` URL is refused. Push the request to `/par` first and send only `client_id` and the returned `request_uri` to `/auth`.

### `invalid_token: DPoP proof key does not match the bound thumbprint`

The DPoP proof's public key thumbprint (RFC 7638) differs from the `cnf.jkt` bound to the access token. `/userinfo` answers with this `invalid_token` challenge, and a refresh with the wrong key gets `invalid_grant`. It is the sender binding doing its job: the proof was signed with a different key, or the token belongs to a different client.

### `/token` answers 503 for a `private_key_jwt` client

The OP could not fetch or use the client's JWKS (`jwks_uri`) because the fetch was rejected for capacity or failed transiently. The response is 503 `server_error` ("client keys are temporarily unavailable"), not `invalid_client`, because the fault is on the OP side and the call is safe to retry. `/auth`, `/par` and `/bc-authorize` answer the same way for request objects. A client-store outage gives 500 `server_error`.

### `invalid_request_uri` after a successful `/par`

You re-visited `/oidc/auth?request_uri=…` after the authorization code was already issued. `request_uri` is one-time at code emission (RFC 9126 §2.2; see <a class="doc-ref" href="/security/design-judgments">Design judgments §1</a>). Re-running `/par` mints a fresh URI.

<div id="adoption" class="faq-anchor"></div>

## Adoption

### Should I use this in production?

It is a reasonable fit for internal-only deployments where you control the RP, the OP, and the users. It is not a fit if you need a paid audit trail or a formal certification to ship. Read <a class="doc-ref" href="/security/posture">Security posture</a> — specifically the "What is **not** here" block — before you decide.

### How do I report a security issue?

Privately, via [GitHub Security Advisories](https://github.com/libraz/go-oidc-provider/security/advisories/new). Full policy at <a class="doc-ref" href="/security/disclosure">Disclosure policy</a>.
