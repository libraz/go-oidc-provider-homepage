---
title: Architecture overview
description: Where requests go inside the OP — package layout, handler dispatch, browser/M2M discovery boundaries, origin checks, LoginFlow risk evaluation, and storage seams.
outline: 2
pageClass: pg-reference-architecture
---

# Architecture overview

`op.New(...)` returns an `http.Handler` backed by an `http.ServeMux`. This page walks through what happens between request arrival and response — the packages involved, the order of validation, and the storage seams the embedder controls.

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
| `/authorize` | `internal/authorizeendpoint` | request parsing, client and `redirect_uri` validation, the redirect into interaction | always |
| `/interaction/{uid}` | `internal/authorizeendpoint` + the `op/interaction` driver | the login and consent ceremony, rendered as HTML or served as JSON to an SPA | with `/authorize` |
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

<svg role="img" aria-labelledby="seq-en-title" viewBox="0 0 760 662" xmlns="http://www.w3.org/2000/svg">
<title id="seq-en-title">Authorize-to-token happy path: the browser drives /authorize and interaction, then the RP redeems the code at /token.</title>
<defs>
<marker id="seq-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="seq-ahm" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-text-3)"/></marker>
</defs>
<line class="seq-ll" x1="66" y1="44" x2="66" y2="645"/>
<line class="seq-ll" x1="220" y1="44" x2="220" y2="645"/>
<line class="seq-llop" x1="380" y1="44" x2="380" y2="645"/>
<line class="seq-llst" x1="545" y1="44" x2="545" y2="645"/>
<line class="seq-lllf" x1="700" y1="44" x2="700" y2="645"/>
<rect class="seq-box" x="18" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd" x="66" y="32" text-anchor="middle">RP</text>
<rect class="seq-box" x="172" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd" x="220" y="32" text-anchor="middle">User agent</text>
<rect class="seq-boxop" x="332" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd seq-hdop" x="380" y="32" text-anchor="middle">OP</text>
<rect class="seq-boxst" x="497" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd" x="545" y="32" text-anchor="middle">Store</text>
<rect class="seq-boxlf" x="652" y="10" width="96" height="34" rx="6"/>
<text class="seq-hd seq-hdlf" x="700" y="32" text-anchor="middle">LoginFlow</text>
<line class="seq-msg" x1="66" y1="80" x2="220" y2="80" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="75">1</text>
<text class="seq-lbl" x="87" y="75">redirect to <tspan class="seq-mono">/authorize?…</tspan></text>
<line class="seq-msg" x1="220" y1="114" x2="380" y2="114" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="109">2</text>
<text class="seq-lbl" x="241" y="109"><tspan class="seq-mono">GET /authorize</tspan></text>
<line class="seq-msg" x1="380" y1="148" x2="545" y2="148" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="143">3</text>
<text class="seq-lbl" x="401" y="143"><tspan class="seq-mono">Clients.GetClient</tspan> / validate <tspan class="seq-mono">redirect_uri</tspan></text>
<path class="seq-msg" d="M380 174 h30 v14 h-30" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="420" y="170">4</text>
<text class="seq-lbl" x="432" y="170">PKCE / scope / <tspan class="seq-mono">response_type</tspan> checks</text>
<line class="seq-msg" x1="380" y1="216" x2="220" y2="216" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="211">5</text>
<text class="seq-lbl" x="241" y="211">302 → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="220" y1="250" x2="380" y2="250" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="245">6</text>
<text class="seq-lbl" x="241" y="245"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (login)</text>
<line class="seq-msg" x1="380" y1="284" x2="700" y2="284" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="279">7</text>
<text class="seq-lbl" x="401" y="279"><tspan class="seq-mono">Begin / Continue</tspan> (Step chain)</text>
<line class="seq-ret" x1="700" y1="318" x2="380" y2="318" marker-end="url(#seq-ahm)"/>
<text class="seq-num halo" x="386" y="313">8</text>
<text class="seq-lbl" x="401" y="313"><tspan class="seq-mono">Result</tspan> (subject + AAL + AMR)</text>
<line class="seq-msg" x1="380" y1="352" x2="220" y2="352" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="347">9</text>
<text class="seq-lbl" x="241" y="347">200 consent → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="220" y1="386" x2="380" y2="386" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="381">10</text>
<text class="seq-lbl" x="241" y="381"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (consent)</text>
<line class="seq-msg" x1="380" y1="420" x2="545" y2="420" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="415">11</text>
<text class="seq-lbl" x="401" y="415"><tspan class="seq-mono">AuthorizationCodes.Save</tspan> (code + PKCE)</text>
<line class="seq-msg" x1="380" y1="454" x2="220" y2="454" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="226" y="449">12</text>
<text class="seq-lbl" x="241" y="449">302 → <tspan class="seq-mono">redirect_uri?code=…&amp;state=…&amp;iss=…</tspan></text>
<line class="seq-msg" x1="220" y1="488" x2="66" y2="488" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="483">13</text>
<text class="seq-lbl" x="87" y="483">arrives with <tspan class="seq-mono">code</tspan></text>
<line class="seq-msg" x1="66" y1="522" x2="380" y2="522" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="517">14</text>
<text class="seq-lbl" x="87" y="517"><tspan class="seq-mono">POST /token</tspan> (<tspan class="seq-mono">grant_type=authorization_code</tspan>)</text>
<line class="seq-msg" x1="380" y1="556" x2="545" y2="556" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="551">15</text>
<text class="seq-lbl" x="401" y="539"><tspan class="seq-mono">AuthorizationCodes.Consume</tspan></text>
<text class="seq-lbl" x="401" y="551">verify PKCE / client auth</text>
<line class="seq-msg" x1="380" y1="590" x2="545" y2="590" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="386" y="585">16</text>
<text class="seq-lbl" x="401" y="585"><tspan class="seq-mono">AccessTokens.Register / RefreshTokens.Save</tspan></text>
<line class="seq-msg" x1="380" y1="624" x2="66" y2="624" marker-end="url(#seq-ah)"/>
<text class="seq-num halo" x="72" y="619">17</text>
<text class="seq-lbl" x="87" y="619">200 <tspan class="seq-mono">{ access_token, id_token, refresh_token? }</tspan></text>
</svg>
</div>

`/par` and `/end_session` follow the same general shape; the sequence-diagram is the canonical happy path.

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

<svg role="img" aria-labelledby="lfp-en-title" viewBox="0 0 760 410" xmlns="http://www.w3.org/2000/svg">
<title id="lfp-en-title">WithLoginFlow compiles the Primary, Rules, Decider and Risk spec into a CompiledLoginFlow the orchestrator drives in a per-request loop.</title>
<defs>
<marker id="lfp-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="lfp-arra" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-brand-2)"/></marker>
</defs>
<rect class="lfp-box" x="24" y="22" width="172" height="132" rx="8"/>
<text class="lfp-t1" x="110" y="44" text-anchor="middle">LoginFlow</text>
<text class="lfp-fld" x="44" y="72">Primary</text>
<text class="lfp-fld" x="44" y="94">Rules[]</text>
<text class="lfp-fld" x="44" y="116">Decider</text>
<text class="lfp-fld" x="44" y="138">Risk</text>
<path class="lfp-line" d="M196 88 H250" marker-end="url(#lfp-arrow)"/>
<text class="lfp-cap" x="223" y="82" text-anchor="middle">compile</text>
<rect class="lfp-op" x="252" y="22" width="206" height="132" rx="8"/>
<text class="lfp-t1a" x="355" y="42" text-anchor="middle">CompiledLoginFlow</text>
<text class="lfp-sub" x="355" y="57" text-anchor="middle">internal/authn</text>
<text class="lfp-fld" x="270" y="82">primary</text>
<text class="lfp-fld" x="270" y="102">rules</text>
<text class="lfp-fld" x="270" y="122">decider</text>
<text class="lfp-fld" x="270" y="142">risk</text>
<path class="lfp-oln" d="M355 154 V196" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="365" y="178" text-anchor="start">once at chain start</text>
<rect class="lfp-op" x="40" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="126" y="232" text-anchor="middle"><tspan class="lfp-mono">Primary.Begin /</tspan></text>
<text class="lfp-nd" x="126" y="248" text-anchor="middle"><tspan class="lfp-mono">Continue → Step</tspan></text>
<rect class="lfp-op" x="252" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="338" y="232" text-anchor="middle">Prompt → user submits</text>
<text class="lfp-nd" x="338" y="248" text-anchor="middle">Result binds <tspan class="lfp-mono">Identity</tspan></text>
<rect class="lfp-op" x="452" y="210" width="200" height="52" rx="8"/>
<text class="lfp-nd" x="552" y="232" text-anchor="middle"><tspan class="lfp-mono">LoginContext</tspan> → <tspan class="lfp-mono">Decider</tspan></text>
<text class="lfp-nd" x="552" y="248" text-anchor="middle">then <tspan class="lfp-mono">Rules</tspan> evaluate</text>
<path class="lfp-oln" d="M212 236 H252" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M424 236 H452" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M500 262 C 500 336, 126 336, 126 262" marker-end="url(#lfp-arra)"/>
<text class="lfp-lba" x="313" y="332" text-anchor="middle">repeat until no rule fires</text>
<path class="lfp-oln" d="M652 236 H704 V346" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="698" y="300" text-anchor="end">no rule fires</text>
<rect class="lfp-op" x="636" y="346" width="118" height="40" rx="8"/>
<text class="lfp-nd" x="695" y="370" text-anchor="middle">Session issued</text>
</svg>
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
- **`token_endpoint_auth_methods_supported`** is intersected with the FAPI allow-list when `WithProfile(profile.FAPI2Baseline)` / `FAPI2MessageSigning` is active.
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
