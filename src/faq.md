---
title: FAQ
description: Recurring questions — picked from the embedder pain points the maintainer hit while building the library and writing the example suite.
outline: 2
---

# FAQ

This page is the bottom of every section's "where do I look first?" answer. The questions below are not theoretical — every entry maps to something the maintainer hit while building examples or running the conformance harness, so if you are stuck on the same thing, the answer here is the one we use.

<ul class="faq-index">
  <li><a href="#setup-basics"><div class="faq-index-title">Setup &amp; basics</div><div class="faq-index-desc">Required four options, mount path, issuer normalization, minimal setup</div></a></li>
  <li><a href="#fapi"><div class="faq-index-title">FAPI 2.0</div><div class="faq-index-desc">Baseline vs Message Signing, DPoP / mTLS choice</div></a></li>
  <li><a href="#tokens"><div class="faq-index-title">Tokens &amp; rotation</div><div class="faq-index-desc">Refresh rotation grace, <code>offline_access</code>, TTL split</div></a></li>
  <li><a href="#dpop"><div class="faq-index-title">DPoP &amp; sender-constraint</div><div class="faq-index-desc">DPoP nonce distribution, narrowed alg list rationale</div></a></li>
  <li><a href="#storage"><div class="faq-index-title">Storage</div><div class="faq-index-desc">Existing users table, adapter choice, composite invariant</div></a></li>
  <li><a href="#ui-spa"><div class="faq-index-title">UI &amp; SPA</div><div class="faq-index-desc">SPA login flow (React/Vue/Svelte/…), CORS, consent UI customization</div></a></li>
  <li><a href="#auth-mfa"><div class="faq-index-title">Auth &amp; MFA</div><div class="faq-index-desc">Password / TOTP / passkey, step-up, risk-based</div></a></li>
  <li><a href="#logout"><div class="faq-index-title">Logout</div><div class="faq-index-desc">Why no Front-Channel, Back-Channel fan-out gaps</div></a></li>
  <li><a href="#native-loopback"><div class="faq-index-title">Native apps &amp; loopback</div><div class="faq-index-desc"><code>127.0.0.1</code> redirect_uri opt-in rules</div></a></li>
  <li><a href="#observability"><div class="faq-index-title">Observability</div><div class="faq-index-desc">Why no auto-mounted <code>/metrics</code>, audit event catalog</div></a></li>
  <li><a href="#conformance"><div class="faq-index-title">Conformance &amp; versions</div><div class="faq-index-desc">REVIEW meaning, certification claims, pre-v1.0 pinning</div></a></li>
  <li><a href="#errors"><div class="faq-index-title">Common errors</div><div class="faq-index-desc"><code>redirect_uri</code> mismatch, <code>alg not allowed</code>, <code>jkt mismatch</code></div></a></li>
  <li><a href="#adoption"><div class="faq-index-title">Adoption</div><div class="faq-index-desc">Production fit, security disclosure path</div></a></li>
</ul>

<div id="setup-basics" class="faq-anchor"></div>

## Setup & basics

### Why does `op.New(...)` return an error?

The four required options have no safe default, so `op.New` refuses to boot without them rather than silently using zero values:

| Option | Without it |
|---|---|
| `WithIssuer` | OP can't sign / namespace anything. |
| `WithStore` | OP has nowhere to persist clients, codes, tokens. |
| `WithKeyset` | OP can't sign ID tokens. |
| `WithCookieKey` | OP can't seal session / CSRF cookies. |

The error names the missing piece, so a typo at boot is a build-time error, not a runtime mystery.

::: tip Recommended pattern
Generate a 32-byte cookie key with `crypto/rand` once per environment and feed it through your config / secret manager. See [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal) for the canonical 30-line setup.
:::

### Where does the OP mount? Can I prefix it?

Wherever you mount the returned `http.Handler`. The handler is prefix-agnostic — `mux.Handle("/oidc/", op.StripPrefix("/oidc", h))` works exactly like `mux.Handle("/", h)`. The discovery document embeds the issuer + mount prefix you configured, so RPs see consistent URLs regardless of where you mount.

### What's the smallest config that boots?

```go
handler, err := op.New(
    op.WithIssuer("https://op.example.com"),
    op.WithStore(inmem.New()),
    op.WithKeyset(myKeyset),
    op.WithCookieKey(cookieKey), // 32 bytes
)
```

Four options, no implicit defaults. See [/getting-started/minimal](/getting-started/minimal).

### "Issuer must not have a trailing slash" — really?

Really. RFC 9207 mix-up defence depends on byte-exact `iss` comparison across the whole ecosystem, so `op.WithIssuer` enforces a single canonical form. It rejects:

- trailing slash (`https://op/` → no);
- mixed-case scheme (`HTTPS://op` → no);
- default port (`https://op:443` → no);
- fragment (`https://op#x` → no);
- query (`https://op?x=1` → no);
- `..` in the path.

::: details Why so strict?
A single non-canonical character on either side of an RP's verification flips byte equality and breaks the mix-up defence silently. The error is at construction time so the misconfiguration can't reach production. See <a class="doc-ref" href="/security/design-judgments">Design judgments §9</a>.
:::

<div id="fapi" class="faq-anchor"></div>

## FAPI 2.0

### What does `op.WithProfile(profile.FAPI2Baseline)` actually flip?

In one call, it tightens six knobs the spec mandates:

- enables `feature.PAR` and `feature.DPoP`;
- narrows `token_endpoint_auth_methods_supported` to the FAPI allow-list (`private_key_jwt`, `tls_client_auth`, `self_signed_tls_client_auth`);
- locks alg constraints to the FAPI subset;
- enforces `redirect_uri` exact match (no wildcarding);
- requires PKCE on every code request;
- requires `state` OR `nonce` on every authorize request.

::: warning Subsequent options that contradict the profile cause `op.New` to return an error.
The profile is intentionally rigid — silently relaxing it would break the audit guarantee FAPI 2.0 buys you.
:::

### Baseline vs Message Signing — when do I need each?

| Baseline | Message Signing |
|---|---|
| PAR + PKCE + DPoP / mTLS | + JAR (signed authorization request) |
|  | + JARM (signed authorization response) |

If your RP needs **non-repudiation** of the authorization request / response — e.g. open-banking style audit chain — pick Message Signing. Otherwise Baseline is enough.

### Can I run FAPI 2.0 without DPoP?

Yes — switch to mTLS sender-binding by enabling `feature.MTLS` and configuring the FAPI client with `tls_client_auth` / `self_signed_tls_client_auth`. FAPI 2.0 §3.1.4 mandates "DPoP **or** mTLS"; the library honours either.

<div id="tokens" class="faq-anchor"></div>

## Tokens & rotation

### My refresh-token retry returns `invalid_grant` — but the request was already in flight.

That's the **rotation grace window**. The default is 60 seconds: if the rotation network round-trip dropped, presenting the previous refresh token within the window mints a fresh access token without rotating again. After the window, or if the chain was already revoked for reuse-detection, you get `invalid_grant`.

::: details Tune the window
`op.WithRefreshGracePeriod(90 * time.Second)` widens it. `op.WithRefreshGracePeriod(-1)` disables grace entirely (strict single-use). See <a class="doc-ref" href="/security/design-judgments">Design judgments §2</a>.
:::

### Why didn't I get a refresh token?

Three conditions, **all required**:

1. The granted scope contains `openid`.
2. The granted scope contains `offline_access`.
3. The client's `GrantTypes` includes `refresh_token`.

Drop any one and the token endpoint succeeds with `access_token` + `id_token` and no `refresh_token`.

::: details Why strict by default?
OIDC Core 1.0 §11 leaves room for OPs to issue refresh tokens without `offline_access`, but doing so makes the consent prompt and the audit trail disagree on what the user authorised. The library reads the strict interpretation so both agree out of the box. See <a class="doc-ref" href="/security/design-judgments">Design judgments §3</a>.
:::

### Where do I split "stay signed in" from regular sessions?

`op.WithRefreshTokenOfflineTTL(...)` separates the long-lived `offline_access` chains from the conventional rotation TTL. The `token.issued` audit event carries `extras.offline_access=true` so SOC dashboards can split the chains.

<div id="dpop" class="faq-anchor"></div>

## DPoP & sender-constraint

### Why do I need a DPoP nonce, and how do I serve it?

**Why.** RFC 9449 §8 lets the OP push a server-supplied nonce through the `DPoP-Nonce` response header to mitigate pre-generated proof attacks.

**How.** The library ships an in-memory reference source and exposes the seam:

```go
src := op.NewInMemoryDPoPNonceSource(ctx, rotate) // demo-grade
op.WithDPoPNonceSource(src)
```

See [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce) for the wiring shape.

::: warning Multi-instance deployments
A process-local nonce source breaks across replicas. For HA, plug a shared store (Redis) behind your `DPoPNonceSource`. The library deliberately doesn't ship a Redis nonce source yet — the option matrix (TTL, rotation cadence, missed-rotation tolerance) is too specific to operator setup.
:::

### `dpop_signing_alg_values_supported` — RS256 missing?

Correct. The DPoP discovery list is `ES256, EdDSA, PS256` — narrower than the codebase JOSE allow-list. `RS256` works for ID-token signing where appropriate, but DPoP proofs are restricted to the FAPI-recommended subset.

<div id="storage" class="faq-anchor"></div>

## Storage

### Do I need to migrate my users table?

No. The library never reads or writes your `users` table directly. You implement `op.Authenticator` (or use the supplied TOTP one) and `store.UserStore` against whatever schema you already have. The OP asks "is this credential valid?" and "what claims does this subject have?" — that's the only contact surface.

### Which storage adapter should I pick?

| Adapter | When |
|---|---|
| `inmem` | Tests, demos, single-process dev |
| `sql` (SQLite / MySQL / Postgres) | Single durable backend; easiest production path |
| `redis` (volatile substores only) | Pair with `sql` via `composite` for hot/cold split |
| `composite` | Hot/cold; the store enforces "one durable backend" at construction time |
| `dynamodb` | Planned (v1.x) |

See [/use-cases/sql-store](/use-cases/sql-store) and [/use-cases/hot-cold-redis](/use-cases/hot-cold-redis).

### Why does `composite.New` reject my config at boot?

Because the transactional cluster invariant says all transactional substores (clients / codes / refresh tokens / access tokens / IATs) must share **one** backend. The volatile slice (sessions / DPoP nonce cache / JAR `jti` registry) is the only part that may diverge. `composite.New` validates this at construction and refuses to boot a configuration that would split a transaction across two stores.

<div id="ui-spa" class="faq-anchor"></div>

## UI & SPA

### How do I drive login / consent from a SPA?

```go
op.WithSPAUI(op.SPAUI{LoginMount: "/login", StaticDir: "./web/dist"})
```

mounts the SPA shell + JSON state surface — no outer mux required:

| Path | Role |
|---|---|
| `/login/{uid}` | SPA shell (serves `index.html`) |
| `/login/state/{uid}` | Prompt JSON (GET / POST / DELETE) |
| `/login/assets/{path...}` | Static asset fan-out |

The SPA — React, Vue, Svelte, Angular, or vanilla — fetches the prompt from `/login/state/{uid}`, POSTs `{state_ref, values}` back with the `X-CSRF-Token` header echoing `prompt.csrf_token` (double-submit cookie), and follows the terminal `{type:"redirect", location}` envelope. See [SPA / custom interaction](/use-cases/spa-custom-interaction) and [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login).

::: details SPA-safe error rendering
Error pages emit `<div id="op-error" data-code="..." data-description="...">` under CSP `default-src 'none'; style-src 'unsafe-inline'`, so the SPA host queries by selector without parsing markup.
:::

### CORS — how do I allow my SPA origin?

```go
op.WithCORSOrigins("https://app.example.com")
```

The library auto-derives the allowlist from registered redirect URIs when you don't pass one. See [/use-cases/cors-spa](/use-cases/cors-spa).

### Can I customise the consent screen without forking the library?

Yes. `op.WithConsentUI(template)` overrides the default consent HTML. For full control, ship a SPA via `op.WithSPAUI`. [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) shows the template seam.

<div id="auth-mfa" class="faq-anchor"></div>

## Auth & MFA

### Where does password / TOTP / passkey verification live?

The library ships building blocks (`op.PrimaryPassword`, `op.StepTOTP`, `op.RuleAlways`, …) that you compose into an `op.LoginFlow`. The flow is the DAG deciding which factors run in which order; the credential storage is your `store.UserPasswords()` / `store.TOTPs()` implementation. The `op.Authenticator` type is exposed for fully custom factors (passkey, email-OTP, …). [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) and onward.

### How do I implement step-up?

`op.RuleACR(level)` on the per-client policy. When the RP requests a higher `acr_values` than the current session provides, the OP returns `WWW-Authenticate: error="insufficient_user_authentication"` (RFC 9470). The session steps up through your authenticator chain and resumes. [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up).

### Risk-based MFA?

`op.RuleRisk(...)` consumes a `RiskAssessor` you supply. `RiskOutcome` carries an explicit `RiskScore`. See [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa).

<div id="logout" class="faq-anchor"></div>

## Logout

### Why no Front-Channel Logout?

Modern browser defaults (third-party-cookie phase-out, `SameSite=Lax` default) have made the iframe-based session signalling Front-Channel Logout 1.0 / Session Management 1.0 require effectively inoperative. The library ships RP-Initiated Logout 1.0 + Back-Channel Logout 1.0 instead — see <a class="doc-ref" href="/security/design-judgments">Design judgments §5</a>.

### Back-Channel Logout fan-out is missing some RPs.

This is expected when sessions live in a volatile store. If a session record was evicted before the logout fan-out runs (e.g. Redis TTL expired during a network partition), the library cannot fabricate it back. The `op.AuditBCLNoSessionsForSubject` audit event records the gap and carries the configured `op.SessionDurabilityPosture`, so SOC dashboards can distinguish "expected gap under volatile placement" from "unexpected gap under durable placement". This is best-effort by design — see <a class="doc-ref" href="/security/design-judgments">Design judgments §10</a>.

<div id="native-loopback" class="faq-anchor"></div>

## Native apps & loopback

### My CLI's `127.0.0.1:54312/cb` redirect_uri got rejected.

Default redirect-URI matching is byte-exact (OAuth 2.1 / FAPI 2.0). Loopback port wildcarding (RFC 8252 §7.3) is **opt-in per client**: the registered `redirect_uris` list must contain a loopback URI, and the OP will then ignore port mismatch when scheme is `http`, host is `127.0.0.1` or `::1`, and path / query / fragment exact-match. `localhost` is **not** accepted (DNS rebinding surface). See <a class="doc-ref" href="/security/design-judgments">Design judgments §4</a>.

<div id="observability" class="faq-anchor"></div>

## Observability

### Where's `/metrics`? I configured `op.WithPrometheus(...)`.

The library does **not** mount `/metrics`. `op.WithPrometheus(reg)` registers the OP's curated counter set on the registry you pass; the HTTP route is your router's job. Same separation for tracing (`otelhttp.NewMiddleware` is yours) and request duration histograms. This is a deliberate scope decision — the OP emits **OIDC business** counters / spans / audit events only; HTTP-lifecycle observation is embedder territory.

[`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics).

### What audit events does the library emit?

A finite catalog (search `op.Audit*` constants in `op/audit.go`):

| Category | Covers |
|---|---|
| `authorize.*` | authorize endpoint outcomes |
| `token.*` | token issuance / refresh / revoke |
| `session.*` | session lifecycle |
| `consent.*` | consent decisions |
| `logout.*` | logout fan-out |
| `dcr.*` | Dynamic Client Registration |

Every event carries `request-id`, `subject`, `client-id`, plus an `extras` map for category-specific fields. Subscribe via `op.WithAuditLogger(...)` (a `*slog.Logger`) — each event records as a structured log entry with the catalog name and `extras` attributes.

<div id="conformance" class="faq-anchor"></div>

## Conformance & versions

### Why does the README say "138 PASSED, 0 FAILED" but the OFCS UI shows REVIEW too?

OFCS uses three verdicts; only `FAILED` is an OP defect:

| Verdict | What it means |
|---|---|
| `PASSED` | Test ran, OP behaved correctly per spec. |
| `REVIEW` | Test ran, OP behaved correctly — OFCS wants a human to verify a UI artefact (e.g. a screenshot of the rendered error page). |
| `FAILED` | OP behaved wrongly. |

The headless harness records `REVIEW` as-is rather than auto-passing it. The library has zero `FAILED`. Full breakdown at <a class="doc-ref" href="/compliance/ofcs">OFCS conformance</a>.

### Can I cite this library as "OIDF-certified"?

No. The project pays no OpenID Foundation membership and holds no formal certification. The OFCS baseline is a reproducible snapshot of spec conformance, not a certification. See <a class="doc-ref" href="/security/posture">Security posture</a>.

### Pre-v1.0 — should I pin a tag?

Yes. The public Go API may carry breaking changes in any minor release until v1.0. Pin in `go.mod` and read the [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) on every bump. The library guarantees that `BREAKING` entries are called out explicitly.

<div id="errors" class="faq-anchor"></div>

## Common errors

### `invalid_request: redirect_uri does not match a registered URI`

You hit redirect-URI exact-match. Three usual causes:

1. Trailing slash drift (`/cb` vs `/cb/`).
2. Default port included on one side (`https://rp.example.com:443/cb` vs `https://rp.example.com/cb`).
3. CLI / native loopback without the RFC 8252 §7.3 opt-in (above).

### `invalid_client: alg not allowed`

The client's `request_object_signing_alg` / `token_endpoint_auth_signing_alg` is not in the codebase allow-list (`RS256`, `PS256`, `ES256`, `EdDSA`). For FAPI 2.0 plans, narrow each client to `PS256` (or `ES256` / `EdDSA`); FAPI 2.0 forbids `RS256` per spec.

### `invalid_dpop_proof: jkt mismatch`

The DPoP proof's public key thumbprint (RFC 7638) doesn't match the `cnf.jkt` bound to the access token. This is the sender-binding working — either the proof was generated with a different key, or the access token belongs to a different client.

### `invalid_request_uri` after a successful `/par`

You re-visited `/authorize?request_uri=…` after the authorization code was already issued. `request_uri` is one-time at code emission (RFC 9126 §2.2; see <a class="doc-ref" href="/security/design-judgments">Design judgments §1</a>). Re-running `/par` mints a fresh URI.

<div id="adoption" class="faq-anchor"></div>

## Adoption

### Should I use this in production?

Read <a class="doc-ref" href="/security/posture">Security posture</a> — specifically the "What is **not** here" block — and decide. Short version: fine for internal-only deployments where you control the RP / OP / users; not a fit if you need a paid audit trail or formal certification to ship.

### How do I report a security issue?

Privately, via [GitHub Security Advisories](https://github.com/libraz/go-oidc-provider/security/advisories/new). Full policy at <a class="doc-ref" href="/security/disclosure">Disclosure policy</a>.
