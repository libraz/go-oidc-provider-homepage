---
title: Architecture overview
description: Where requests go inside the OP — package layout, handler dispatch, browser/M2M discovery boundaries, origin checks, LoginFlow risk evaluation, and storage seams.
outline: 2
pageClass: pg-reference-architecture
---

# Architecture overview

`op.New(...)` returns an `http.Handler` backed by an `http.ServeMux`. This page walks through what happens between request arrival and response — the packages involved, the order of validation, and the storage seams the embedder controls.

The RP in the sequence below is a separate application. The OP application embeds go-oidc-provider and owns the `Store` and `LoginFlow` implementations.

## Package layout

```
op/                         ← public API surface (this is what you import)
op/profile/                 ← FAPI 2.0 / future profiles
op/feature/                 ← PAR / DPoP / mTLS / introspect / revoke / DCR / JAR
op/grant/                   ← authorization_code, refresh_token, client_credentials
op/store/                   ← Store interface (substores) + contract test suite
op/storeadapter/{inmem,sql,redis,composite}
op/interaction/             ← HTML / JSON driver seam for login UI

internal/                   ← cannot be imported externally (Go visibility)
  authn/                    ← LoginFlow orchestrator, Authenticator runtime
  authorizeendpoint, parendpoint, tokenendpoint, userinfo,
  introspectendpoint, revokeendpoint, registrationendpoint,
  endsession, backchannel
  jose, jwks, keys          ← signing / verification / key set
  jar, dpop, mtls, pkce, sessions
  cookie, csrf, cors, httpx, redact, log, metrics
  discovery, scoperegistry, timex, i18n
```

The boundary is enforced structurally: external code cannot reach into `internal/`. Every embedder-controlled seam (option, store interface, authenticator, audit subscriber) is in `op/` or one of its subpackages.

## Routes

`op.New` constructs a `*http.ServeMux` and mounts one handler per configured path. The defaults, and the package behind each one:

| Path | Handler package | What it serves | Mounted |
|---|---|---|---|
| `/.well-known/openid-configuration` | `internal/discovery` | the OP's effective configuration as a discovery document | always |
| `/jwks` | `internal/jwks` | the public half of the signing keyset (plus `use=enc` keys when configured) | always |
| `/auth` | `internal/authorizeendpoint` | request parsing, client and `redirect_uri` validation, the redirect into interaction | when the `authorization_code` grant is enabled |
| `/interaction/{uid}` | `internal/authorizeendpoint` + the `op/interaction` driver | the login and consent ceremony, rendered as HTML or served as JSON to an SPA | with `/auth` |
| `/par` | `internal/parendpoint` | pushed authorization requests, returning a one-time `request_uri` | `feature.PAR` |
| `/token` | `internal/tokenendpoint` | client authentication, code and refresh redemption, token issuance | always |
| `/userinfo` | `internal/userinfo` | claims for the subject behind a presented access token | always |
| `/revoke` | `internal/revokeendpoint` | RFC 7009 revocation of a refresh or access token | `feature.Revoke` |
| `/introspect` | `internal/introspectendpoint` | RFC 7662 token state for an authorized resource server | `feature.Introspect` |
| `/end_session` | `internal/endsession` | RP-initiated logout, including the back-channel fan-out | when a session manager is configured |
| `/register` | `internal/registrationendpoint` | dynamic client registration and the per-client management routes | `WithDynamicRegistration` |

Back-channel logout has no row of its own because it is not a mounted endpoint. It is an outbound fan-out that `/end_session` triggers: the OP POSTs a logout token to each RP's registered `backchannel_logout_uri`. The discovery document advertises only the endpoints that are actually mounted, so a deployment that leaves `feature.Introspect` off never announces `/introspect`.

## Cross-cutting middleware

Every handler is wrapped by:

| Layer | Source | Role |
|---|---|---|
| **CORS** | `internal/cors` | public CORS for discovery and `/jwks`; strict allow-list for `/userinfo`, `/token`, interaction/session JSON surfaces, and mounted protocol endpoints such as `/par`, `/revoke`, `/introspect`, `/register`, `/bc-authorize`, `/device_authorization`, and `/end_session` |
| **Trusted proxy** | `internal/httpx` | resolves real client IP from `X-Forwarded-*` / `Forwarded` based on `WithTrustedProxies` |
| **Cookie** | `internal/cookie` | `__Host-` prefix, AES-256-GCM, `SameSite=Lax` for session, `Strict` where compatible |
| **CSRF** | `internal/csrf` | double-submit + Origin / Referer check on the consent / logout POST |

These are not optional — they apply structurally regardless of which options the embedder set.

The origin sets are deliberately separate. API CORS is widened only by explicit `WithCORSOrigins` (with redirect-URI origins included for API compatibility); interaction and end-session ceremony checks allow the issuer origin plus those explicit origins only. A redirect URI's origin never authorizes a cross-origin interaction or logout POST by itself.

## Authorize → token lifecycle

The most-trodden path. Roughly:

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<figure class="fig">
  <div class="fig-head">Authorize → token, with the store and the login flow in view</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-lifecycle-title" viewBox="0 0 960 740" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-lifecycle-title">The happy path from the authorize request to the token response, showing which calls reach the store and which reach the configured login flow. The RP is a separate application; the OP application embeds go-oidc-provider. The browser drives the first two phases; the third is a direct back-channel exchange between the RP and the OP.</title>
    <rect class="fg-group" x="30" y="68" width="916" height="146" rx="8"/>
    <rect class="fg-group" x="30" y="222" width="916" height="236" rx="8"/>
    <rect class="fg-group" x="30" y="466" width="916" height="262" rx="8"/>
    <text class="fg-lbl" x="42" y="86">1 · the authorize request</text>
    <text class="fg-lbl" x="42" y="240">2 · interaction</text>
    <text class="fg-lbl" x="42" y="484">3 · redeeming the code</text>
    <line class="fg-life" x1="106" y1="62" x2="106" y2="728"/>
    <line class="fg-life" x1="300" y1="62" x2="300" y2="728"/>
    <line class="fg-life fg-life--accent" x1="510" y1="62" x2="510" y2="728"/>
    <line class="fg-life" x1="710" y1="62" x2="710" y2="728"/>
    <line class="fg-life" x1="880" y1="62" x2="880" y2="728"/>
    <rect class="fg-box" x="36" y="16" width="140" height="42" rx="6"/>
    <text class="fg-t" x="106" y="35" text-anchor="middle">RP</text>
    <text class="fg-xs" x="106" y="49" text-anchor="middle">separate app</text>
    <rect class="fg-box" x="230" y="16" width="140" height="42" rx="6"/>
    <text class="fg-t" x="300" y="35" text-anchor="middle">User agent</text>
    <text class="fg-xs" x="300" y="49" text-anchor="middle">browser</text>
    <rect class="fg-box fg-box--accent" x="430" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="510" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="510" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="640" y="16" width="140" height="42" rx="6"/>
    <text class="fg-t" x="710" y="35" text-anchor="middle">Store</text>
    <text class="fg-xs" x="710" y="49" text-anchor="middle">yours</text>
    <rect class="fg-box" x="812" y="16" width="136" height="42" rx="6"/>
    <text class="fg-t" x="880" y="35" text-anchor="middle">LoginFlow</text>
    <text class="fg-xs" x="880" y="49" text-anchor="middle">yours</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="102" r="8.5"/>
    <text class="fg-badge-t" x="15" y="105" text-anchor="middle">1</text>
    <path class="fg-edge" d="M106,102 H300" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="203" y="96" text-anchor="middle">redirect to /authorize?…</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="132" r="8.5"/>
    <text class="fg-badge-t" x="15" y="135" text-anchor="middle">2</text>
    <path class="fg-edge" d="M300,132 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="405" y="126" text-anchor="middle">GET /authorize</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="164" r="8.5"/>
    <text class="fg-badge-t" x="15" y="167" text-anchor="middle">3</text>
    <path class="fg-edge" d="M510,164 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="158" text-anchor="middle">Clients.GetClient · exact-match redirect_uri</text>
    <!-- 4 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="196" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="199" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M510,188 h28 v16 h-28" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="550" y="200">PKCE · scope · response_type checks</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="266" r="8.5"/>
    <text class="fg-badge-t" x="15" y="269" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M510,266 H300" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="405" y="260" text-anchor="middle">302 → /interaction/{uid}</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="298" r="8.5"/>
    <text class="fg-badge-t" x="15" y="301" text-anchor="middle">6</text>
    <path class="fg-edge" d="M300,298 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="405" y="292" text-anchor="middle">POST /interaction/{uid} — login</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="330" r="8.5"/>
    <text class="fg-badge-t" x="15" y="333" text-anchor="middle">7</text>
    <path class="fg-edge" d="M510,330 H880" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="695" y="324" text-anchor="middle">Begin / Continue — the Step chain</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="362" r="8.5"/>
    <text class="fg-badge-t" x="15" y="365" text-anchor="middle">8</text>
    <path class="fg-edge" d="M880,362 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="695" y="356" text-anchor="middle">Result — subject · AAL · AMR</text>
    <!-- 9 -->
    <circle class="fg-badge" cx="15" cy="394" r="8.5"/>
    <text class="fg-badge-t" x="15" y="397" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M510,394 H300" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="405" y="388" text-anchor="middle">200 consent page</text>
    <!-- 10 -->
    <circle class="fg-badge" cx="15" cy="424" r="8.5"/>
    <text class="fg-badge-t" x="15" y="427" text-anchor="middle">10</text>
    <path class="fg-edge" d="M300,424 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="405" y="418" text-anchor="middle">POST /interaction/{uid} — consent</text>
    <!-- 11 -->
    <circle class="fg-badge" cx="15" cy="452" r="8.5"/>
    <text class="fg-badge-t" x="15" y="455" text-anchor="middle">11</text>
    <path class="fg-edge" d="M510,452 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="446" text-anchor="middle">AuthorizationCodes.Save — code + PKCE</text>
    <!-- 12 -->
    <circle class="fg-badge" cx="15" cy="514" r="8.5"/>
    <text class="fg-badge-t" x="15" y="517" text-anchor="middle">12</text>
    <path class="fg-edge fg-edge--accent" d="M510,514 H300" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="405" y="508" text-anchor="middle">302 → redirect_uri?code&amp;state&amp;iss</text>
    <!-- 13 -->
    <circle class="fg-badge" cx="15" cy="544" r="8.5"/>
    <text class="fg-badge-t" x="15" y="547" text-anchor="middle">13</text>
    <path class="fg-edge" d="M300,544 H106" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="203" y="538" text-anchor="middle">arrives carrying the code</text>
    <!-- 14 -->
    <circle class="fg-badge" cx="15" cy="586" r="8.5"/>
    <text class="fg-badge-t" x="15" y="589" text-anchor="middle">14</text>
    <path class="fg-edge" d="M106,586 H510" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="308" y="566" text-anchor="middle">POST /token</text>
    <text class="fg-mxs fg-halo" x="308" y="579" text-anchor="middle">grant_type=authorization_code</text>
    <!-- 15 -->
    <circle class="fg-badge" cx="15" cy="614" r="8.5"/>
    <text class="fg-badge-t" x="15" y="617" text-anchor="middle">15</text>
    <path class="fg-edge" d="M510,614 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="598" text-anchor="middle">Clients.GetClient · client authentication</text>
    <text class="fg-xs" x="610" y="611" text-anchor="middle">before consuming the authorization code</text>
    <!-- 16 -->
    <circle class="fg-badge" cx="15" cy="644" r="8.5"/>
    <text class="fg-badge-t" x="15" y="647" text-anchor="middle">16</text>
    <path class="fg-edge" d="M510,644 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="636" text-anchor="middle">AuthorizationCodes.Consume</text>
    <text class="fg-xs" x="610" y="649" text-anchor="middle">then enforce PKCE and redirect_uri</text>
    <!-- 17 -->
    <circle class="fg-badge" cx="15" cy="674" r="8.5"/>
    <text class="fg-badge-t" x="15" y="677" text-anchor="middle">17</text>
    <path class="fg-edge" d="M510,674 H710" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="610" y="668" text-anchor="middle">AccessTokens.Register (JTIRegistry only) · RefreshTokens.Save (eligible)</text>
    <!-- 18 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="704" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="707" text-anchor="middle">18</text>
    <path class="fg-edge fg-edge--accent" d="M510,704 H106" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs fg-halo" x="308" y="698" text-anchor="middle">200 · { access_token, id_token, refresh_token? }</text>
  </svg>
  <figcaption class="fig-note">The two rightmost lanes are yours. Every arrow that reaches them is an interface call, which is what makes the storage backend and the login experience replaceable without touching the protocol path in the middle.</figcaption>
</figure>
</div>

`/par` and `/end_session` follow the same general shape; the sequence diagram is the canonical happy path.

A JWT access token gets an `AccessTokens` shadow row only when `RevocationStrategyJTIRegistry` is selected. The default `RevocationStrategyGrantTombstone` records a grant tombstone at revocation instead, while `RevocationStrategyNone` disables server-side JWT revocation. A refresh token is saved only when the provider grant, client registration, and scope policy allow it.

<a class="faq-anchor" id="loginflow-internals"></a>

## LoginFlow internals

`WithLoginFlow(LoginFlow{...})` is compiled at construction time into an internal pipeline:

```
LoginFlow {Primary, Rules[], Decider, Risk}
    │
    ▼ (compile)
internal/authn/CompiledLoginFlow
    ├── Primary  → Authenticator (resolves Step descriptor → runtime impl)
    ├── Rules[]  → ordered (When, Then) pairs
    ├── Decider  → optional short-circuit
    └── Risk     → invoked once at chain start; score is cached
```

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<figure class="fig">
  <div class="fig-head">LoginFlow — declared once, compiled once, driven per request</div>
  <svg class="fig-svg" role="img" aria-labelledby="loginflow-title" viewBox="0 0 960 344" xmlns="http://www.w3.org/2000/svg">
    <title id="loginflow-title">What you pass to WithLoginFlow is a specification. It is compiled once into a CompiledLoginFlow, which the orchestrator then drives in a loop for each request: begin the primary factor, prompt, bind an identity, evaluate the decider and the rules, and repeat until no rule fires.</title>
    <text class="fg-lbl" x="40" y="26">declared</text>
    <text class="fg-lbl fg-accent" x="334" y="26">compiled once</text>
    <text class="fg-lbl" x="620" y="26">driven per request</text>
    <rect class="fg-box" x="36" y="38" width="234" height="192" rx="8"/>
    <text class="fg-t2" x="56" y="64">LoginFlow</text>
    <text class="fg-xs" x="56" y="82">what you hand to WithLoginFlow</text>
    <line class="fg-rule" x1="56" y1="94" x2="250" y2="94"/>
    <text class="fg-m" x="56" y="120">Primary</text>
    <text class="fg-xs" x="56" y="136">the first factor</text>
    <text class="fg-m" x="56" y="164">Rules[]</text>
    <text class="fg-xs" x="56" y="180">when to ask for more</text>
    <text class="fg-m" x="56" y="208">Decider · Risk</text>
    <text class="fg-xs" x="56" y="224">AAL policy and signals</text>
    <path class="fg-edge" d="M274,134 H326" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="300" y="127" text-anchor="middle">compile</text>
    <rect class="fg-box fg-box--accent" x="330" y="38" width="244" height="192" rx="8"/>
    <text class="fg-t2 fg-accent" x="350" y="64">CompiledLoginFlow</text>
    <text class="fg-mxs" x="350" y="82">internal/authn</text>
    <line class="fg-rule" x1="350" y1="94" x2="554" y2="94"/>
    <text class="fg-mxs" x="350" y="120">primary</text>
    <text class="fg-mxs" x="350" y="146">rules</text>
    <text class="fg-mxs" x="350" y="172">decider</text>
    <text class="fg-mxs" x="350" y="198">risk</text>
    <text class="fg-xs" x="350" y="222">resolved and validated at op.New</text>
    <path class="fg-edge fg-edge--accent" d="M578,134 H610" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="616" y="38" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="58">Primary.Begin → Step</text>
    <text class="fg-xs" x="634" y="76">once, at the start of the chain</text>
    <path class="fg-edge fg-edge--thin" d="M758,88 V96" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="616" y="98" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="118">prompt → the user submits</text>
    <text class="fg-xs" x="634" y="136">one Step at a time</text>
    <path class="fg-edge fg-edge--thin" d="M758,148 V156" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="616" y="158" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="178">Result binds an Identity</text>
    <text class="fg-xs" x="634" y="196">subject · AAL · AMR</text>
    <path class="fg-edge fg-edge--thin" d="M758,208 V216" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="616" y="218" width="284" height="48" rx="6"/>
    <text class="fg-mxs" x="634" y="238">LoginContext → Decider, then Rules</text>
    <text class="fg-xs" x="634" y="256">a rule fires → another Step</text>
    <path class="fg-edge" d="M904,242 H930 V122 H904" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M758,268 V276" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="616" y="278" width="284" height="48" rx="6"/>
    <text class="fg-t2 fg-accent" x="634" y="298">No rule fires</text>
    <text class="fg-xs" x="634" y="316">the session is issued</text>
  </svg>
  <figcaption class="fig-note">Compiling up front is what makes a misconfigured flow a start-up error rather than a runtime one. By the time a request arrives there is nothing left to interpret — only a chain to walk.</figcaption>
</figure>
</div>

For each authorize request:

1. `Primary.Begin` produces an `interaction.Step` (Prompt or Result).
2. UI driver (HTML or React) renders the prompt; the user submits.
3. `Primary.Continue` advances to a `Result` carrying the bound `Identity`.
4. Orchestrator builds a `LoginContext` (subject, scopes, completed steps, cached risk score, ACR values).
5. `Decider` runs (if non-nil); a non-`Pass` decision short-circuits.
6. Otherwise `Rules` evaluate in order; the first matching rule whose `Step.Kind()` is not in `CompletedSteps` fires.
7. Loop until no rule fires; the session is then issued. `LoginFlow.Risk` is consulted at most once for the chain and its outcome is cached. A provider-level `WithRiskAssessor` is the alternative seam; combining it with `LoginFlow.Risk` is rejected at construction rather than choosing silently.

See [Use case: Custom authenticator](/use-cases/custom-authenticator) for how to plug your own factor in via `ExternalStep`.

## Storage seams

The library never reads or writes the embedder's `users` table directly. It talks to the `store.Store` interface, which is the union of small substores:

| Substore | What lives there | Adapter notes |
|---|---|---|
| `Clients` | OAuth client registry | typically durable |
| `Users` | subjects + claims | embedder-implemented; commonly maps to existing users table |
| `AuthorizationCodes` | one-shot codes (PKCE challenge, scope) | durable |
| `RefreshTokens` | refresh chains, rotation history | durable |
| `AccessTokens` | JWT id-side / opaque tokens | durable |
| `OpaqueAccessTokens` | opaque AT lookup | durable |
| `Grants` | consented scopes per (user, client) | durable |
| `GrantRevocations` | tombstones for revoked grants | durable |
| `Sessions` | browser session records | volatile-eligible |
| `Interactions` | per-attempt interaction state | volatile-eligible |
| `ConsumedJTIs` | JAR / DPoP `jti` replay set | volatile-eligible |
| `PARs` | pushed authorization requests | durable when PAR participates in an authorization-code transaction |
| `IATs` / `RATs` | DCR Initial / Registration Access Tokens | durable |
| `DeviceCodes` | RFC 8628 device-authorization records | durable |
| `CIBARequests` | OpenID Connect CIBA backchannel-authentication records | durable |
| `Metadata` | OP-internal key/value state (e.g. the `subject_mode` marker) | durable, may be absent (nil) |

Volatile-eligible substores can live in a Redis tier behind the [`composite`](/use-cases/hot-cold-redis) adapter. At construction time, the composite adapter requires every `Kind` to have a route. The seven members of `composite.TxClusterKinds` must all resolve to the same comparable backend, and that backend must implement `store.Transactional`:

- authorization codes
- refresh tokens
- grants
- PARs
- JWT access-token registrations
- opaque access tokens
- grant-revocation tombstones

Other kinds may use separate backends. Invalid kinds, missing routes, a split cluster, a non-comparable cluster backend, and a non-transactional anchor are reported as construction errors.

MFA factor stores (`EmailOTPStore`, `TOTPStore`, `PasskeyStore`, `RecoveryStore`, `AuthnLockoutStore`) are not substores of `store.Store`. They are supplied directly to the matching login-flow values (`StepEmailOTP.Store`, `StepTOTP.Store`, `PrimaryPasskey.Store`, `StepRecoveryCode.Store`, and `WithAuthnLockoutStore`) when the embedder builds the `LoginFlow`. In-memory, SQL, and DynamoDB adapters expose these stores with matching accessors. [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) uses the shipped SQL factor stores with the core OP tables in one database; custom backends implement the same contracts themselves.

See [Architecture: storage tiering](/use-cases/hot-cold-redis) for production placement guidance.

## Discovery document assembly

The discovery handler at `/.well-known/openid-configuration` builds its document from the OP's effective configuration. Every advertised field is the authoritative answer for what the OP will actually do — there is no drift between discovery and behaviour because:

- **`response_types_supported`** is computed from `WithGrants` + the FAPI profile; a client-credentials-only OP advertises an empty list and omits browser authorization/logout surfaces.
- **`token_endpoint_auth_methods_supported`** is intersected with the library's FAPI allow-list when `WithProfile(profile.FAPI2Baseline)` or `WithProfile(profile.FAPI2MessageSigning)` is active.
- **`scopes_supported`** is the union of built-in scopes and `WithScope` registrations.
- **`ui_locales_supported`** is auto-derived from the runtime locale resolver (seed bundles plus `WithLocale` additions) unless `WithDiscoveryMetadata(...).UILocalesSupported` supplies an explicit non-empty override.
- **`code_challenge_methods_supported`** is always `["S256"]` — `plain` is structurally absent.
- **`request_object_signing_alg_values_supported`** is the JOSE allow-list (`RS256`, `PS256`, `ES256`, `EdDSA`).
- **`dpop_signing_alg_values_supported`** is narrower (`ES256`, `EdDSA`, `PS256`) — see [FAQ § DPoP discovery](/faq#dpop-sender-constraint).

## Where to read next

- **[Options reference](/reference/options)** — every `op.With*` in one table, with cross-links into the route table above.
- **[Audit event catalog](/reference/audit-events)** — what fires from each handler at each stage.
- **[Custom authenticator](/use-cases/custom-authenticator)** — how the orchestrator's pipeline calls into your code.
- **[Hot/cold storage](/use-cases/hot-cold-redis)** — how the substore tiering interacts with the volatile / durable boundary above.
