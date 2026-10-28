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
op/profile/                 ← Baseline / FAPI 2.0 / FAPI-CIBA profiles
op/feature/                 ← PAR / JAR / JARM / DPoP / mTLS / introspect / revoke / DCR / RAR / Grant Management
op/grant/                   ← authorization_code, refresh_token, client_credentials, device_code, CIBA
op/store/                   ← Store interface (substores) + contract test suite
op/storeadapter/{inmem,sql,redis,dynamodb,composite}
op/interaction/             ← HTML / JSON driver seam for login UI
op/devicecodekit, op/passkeykit, op/totpkit, op/recoverykit
                            ← helpers for the parts the embedder owns (device verification page, factor enrollment)
op/testkit/                 ← a ready-made provider for tests

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

`op.New` constructs a `*http.ServeMux` and mounts one handler per configured path. The paths below are the defaults. Every protocol endpoint sits under the issuer's path plus the mount prefix (`/oidc` unless `WithMountPrefix` says otherwise), so `/token` on issuer `https://idp.example.com` is `https://idp.example.com/oidc/token`; `WithEndpoints` renames individual paths. Discovery and protected-resource metadata are the exceptions: they live at their well-known locations, outside the prefix.

| Path | Handler package | What it serves | Mounted |
|---|---|---|---|
| `/.well-known/openid-configuration` | `internal/discovery` | the OP's effective configuration as a discovery document | always |
| `/jwks` | `internal/jwks` | the public half of the signing keyset (plus `use=enc` keys when configured) | always |
| `/.well-known/oauth-protected-resource` (+ path suffix) | `internal/protectedresource` | RFC 9728 metadata for each declared protected resource | `WithProtectedResources` |
| `/auth` | `internal/authorizeendpoint` | request parsing, client and `redirect_uri` validation, the redirect into interaction | when the `authorization_code` grant is enabled |
| `/interaction/{uid}` | `internal/authorizeendpoint` + the `op/interaction` driver | the login and consent ceremony, rendered as HTML or served as JSON to an SPA. With `WithSPAUI` the route moves to `LoginMount` | with `/auth` |
| `/par` | `internal/parendpoint` | pushed authorization requests, returning a one-time `request_uri` | `feature.PAR` |
| `/token` | `internal/tokenendpoint` | client authentication, code and refresh redemption, token issuance | always |
| `/userinfo` | `internal/userinfo` | claims for the subject behind a presented access token | always |
| `/revoke` | `internal/revokeendpoint` | RFC 7009 revocation of a refresh or access token | `feature.Revoke` |
| `/introspect` | `internal/introspectendpoint` | RFC 7662 token state for an authorized resource server | `feature.Introspect` |
| `/device_authorization` | `internal/devicecodeendpoint` | RFC 8628 device authorization: returns a `device_code` and `user_code` | device-code grant |
| `/bc-authorize` | `internal/cibaendpoint` | CIBA backchannel authentication request, returns an `auth_req_id` | CIBA grant |
| `/grant_management/{grant_id}` | `internal/grantmgmtendpoint` | query or revoke one grant | `WithGrantManagement` |
| `/end_session` | `internal/endsession` | RP-initiated logout, including the back-channel fan-out | with `/auth` (the `authorization_code` grant) |
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
  <div class="fig-head">Authorize and interaction: where the OP calls your code</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-lifecycle-title" viewBox="0 0 960 952" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-lifecycle-title">The browser drives the authorize request and the interaction. The OP looks up the client and checks the request, hands the login to your LoginFlow, and saves the authorization code to your store; those calls all land in the right-hand lane, which is your code.</title>
    <!-- band: authorize request -->
    <rect class="fg-group" x="32" y="104" width="896" height="264" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">authorize request</text>
    <!-- band: interaction -->
    <rect class="fg-group" x="32" y="392" width="896" height="536" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="420">interaction</text>
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">User agent</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">browser</text>
    <line class="fg-life" x1="192" y1="88" x2="192" y2="928"/>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="928"/>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Your code</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">Store · LoginFlow</text>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="928"/>
    <!-- GET /auth -->
    <path class="fg-edge" d="M192,172 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="162" text-anchor="middle">GET /auth</text>
    <!-- client lookup -->
    <path class="fg-edge" d="M512,244 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="210" text-anchor="middle">Clients.GetClient</text>
    <text class="fg-xs" x="668" y="232" text-anchor="middle">exact-match redirect_uri</text>
    <!-- request checks -->
    <path class="fg-edge fg-edge--accent" d="M512,276 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="568" y="282">Check the request</text>
    <text class="fg-mxs" x="568" y="304">PKCE · scope</text>
    <text class="fg-mxs" x="568" y="326">response_type</text>
    <!-- redirect to interaction -->
    <path class="fg-edge fg-edge--accent" d="M512,460 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="450" text-anchor="middle">302 → /interaction/{uid}</text>
    <!-- login post -->
    <path class="fg-edge" d="M192,532 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="498" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-xs" x="352" y="520" text-anchor="middle">login</text>
    <!-- step chain -->
    <path class="fg-edge" d="M512,604 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="570" text-anchor="middle">Begin / Continue</text>
    <text class="fg-xs" x="668" y="592" text-anchor="middle">the Step chain</text>
    <!-- result -->
    <path class="fg-edge fg-edge--muted" d="M824,676 H512" marker-end="url(#fg-am)"/>
    <text class="fg-m" x="668" y="642" text-anchor="middle">Result</text>
    <text class="fg-mxs" x="668" y="664" text-anchor="middle">subject · AAL · AMR</text>
    <!-- consent page -->
    <path class="fg-edge fg-edge--accent" d="M512,748 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="738" text-anchor="middle">200 consent page</text>
    <!-- consent post -->
    <path class="fg-edge" d="M192,820 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="786" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-xs" x="352" y="808" text-anchor="middle">consent</text>
    <!-- save code -->
    <path class="fg-edge" d="M512,892 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="858" text-anchor="middle">AuthorizationCodes.Save</text>
    <text class="fg-xs" x="668" y="880" text-anchor="middle">code + PKCE challenge</text>
  </svg>
  <figcaption class="fig-note">The right-hand lane is yours. Every arrow that reaches it is an interface call, which is what makes the storage backend and the login experience replaceable without touching the protocol path in the middle.</figcaption>
</figure>
</div>

<div style="display:flex;justify-content:center;margin:1.5rem 0">

<figure class="fig">
  <div class="fig-head">Redeeming the code: client auth comes before consume</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-token-title" viewBox="0 0 960 760" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-token-title">The authorization code returns to the RP through the browser, then the RP redeems it directly at /token. The OP authenticates the client, consumes the code, registers or saves the tokens in your store, and answers with the token response.</title>
    <!-- band: code returns -->
    <rect class="fg-group" x="32" y="104" width="896" height="128" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">the code returns via the browser</text>
    <!-- band: redeeming -->
    <rect class="fg-group" x="32" y="256" width="896" height="480" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="284">redeeming the code</text>
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">separate app</text>
    <line class="fg-life" x1="192" y1="88" x2="192" y2="736"/>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="736"/>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Store</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">yours</text>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="736"/>
    <!-- redirect with code -->
    <path class="fg-edge fg-edge--accent" d="M512,192 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="158" text-anchor="middle">302 → redirect_uri</text>
    <text class="fg-mxs" x="352" y="180" text-anchor="middle">code · state · iss</text>
    <!-- token request -->
    <path class="fg-edge" d="M192,344 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="310" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="352" y="332" text-anchor="middle">grant_type=authorization_code</text>
    <!-- client auth -->
    <path class="fg-edge" d="M512,416 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="382" text-anchor="middle">Clients.GetClient</text>
    <text class="fg-xs" x="668" y="404" text-anchor="middle">authenticate the client first</text>
    <!-- consume -->
    <path class="fg-edge" d="M512,488 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="454" text-anchor="middle">AuthorizationCodes.Consume</text>
    <text class="fg-xs" x="668" y="476" text-anchor="middle">then PKCE and redirect_uri</text>
    <!-- register access token -->
    <path class="fg-edge" d="M512,560 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="526" text-anchor="middle">AccessTokens.Register</text>
    <text class="fg-xs" x="668" y="548" text-anchor="middle">only with JTIRegistry</text>
    <!-- save refresh token -->
    <path class="fg-edge" d="M512,632 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="598" text-anchor="middle">RefreshTokens.Save</text>
    <text class="fg-xs" x="668" y="620" text-anchor="middle">when eligible</text>
    <!-- token response -->
    <path class="fg-edge fg-edge--accent" d="M512,704 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="670" text-anchor="middle">200 · access_token · id_token</text>
    <text class="fg-xs" x="352" y="692" text-anchor="middle">+ refresh_token when eligible</text>
  </svg>
  <figcaption class="fig-note">The code travels through the browser but is redeemed on a direct back channel. Client authentication happens before the code is consumed, and PKCE and redirect_uri are enforced after it.</figcaption>
</figure>
</div>

`/par` and `/end_session` follow the same general shape; the sequence diagram is the canonical happy path.

Each authorization carries its own authentication state. The code, the refresh chain it starts and the access tokens it issues record the `auth_time`, `acr`, `amr`, `authorization_details` and OIDC `claims` request of the authorization that created them, rather than reading the one grant per (subject, client) that every later authorization rewrites. A second login by the same user does not change what an earlier code reports in its ID token, and revoking or rotating one refresh chain leaves the user's other sessions on the same client alone.

A JWT access token gets an `AccessTokens` shadow row only when `RevocationStrategyJTIRegistry` is selected. The default `RevocationStrategyGrantTombstone` records a grant tombstone at revocation instead, while `RevocationStrategyNone` disables server-side JWT revocation. A refresh token is saved only when the provider grant, client registration, and scope policy allow it.

### Requests served from an existing session

`/auth` does not always run the chain. It can mint straight from a live session when a cached grant covers the request or the first-party consent skip applies. `LoginFlow` rules and the `Decider` still apply on that path:

<figure class="fig">
  <div class="fig-head">An authorize request served from an existing session</div>
  <svg class="fig-svg" role="img" aria-labelledby="arch-reuse-title" viewBox="0 0 960 336" xmlns="http://www.w3.org/2000/svg">
    <title id="arch-reuse-title">When /auth can mint from a live session, the LoginFlow rules and the Decider are evaluated first, as if the primary step had just completed. If nothing demands another step the code is minted. If a step is demanded, prompt=none answers interaction_required, and any other request runs the chain from the session's subject before minting.</title>
    <!-- session -->
    <rect class="fg-box" x="32" y="124" width="232" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="152">Session reused</text>
    <text class="fg-xs" x="48" y="176">a cached grant covers it</text>
    <text class="fg-xs" x="48" y="200">first-party consent skip</text>
    <path class="fg-edge" d="M264,172 H312" marker-end="url(#fg-a)"/>
    <!-- evaluation -->
    <rect class="fg-box fg-box--accent" x="312" y="124" width="272" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="328" y="152">Rules and Decider</text>
    <text class="fg-xs" x="328" y="176">as if Primary just completed</text>
    <text class="fg-xs" x="328" y="200">earlier factors do not count</text>
    <path class="fg-leader" d="M584,172 H616 M616,68 V276"/>
    <path class="fg-edge fg-edge--thin" d="M616,68 H648" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M616,172 H648" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M616,276 H648" marker-end="url(#fg-a)"/>
    <!-- outcomes -->
    <rect class="fg-box fg-box--ok" x="648" y="32" width="280" height="72" rx="8"/>
    <text class="fg-t2" x="664" y="60">Mint the code</text>
    <text class="fg-xs" x="664" y="84">no step demanded</text>
    <rect class="fg-box fg-box--warn" x="648" y="136" width="280" height="72" rx="8"/>
    <text class="fg-m" x="664" y="164">interaction_required</text>
    <text class="fg-xs" x="664" y="188">step demanded, prompt=none</text>
    <rect class="fg-box" x="648" y="240" width="280" height="72" rx="8"/>
    <text class="fg-t2" x="664" y="268">Run the chain</text>
    <text class="fg-xs" x="664" y="292">step demanded, prompt is not none</text>
  </svg>
  <figcaption class="fig-note">Risk-driven rules fire only inside the chain, so they never trigger on this path. The chain starts from the session's subject, and a factor that returns a different subject than the one already bound ends it with a server error.</figcaption>
</figure>

A `Rule` predicate or `Decider` that panics fails closed: a panicking `Rule.When` counts as a match so the step is still demanded, and a panicking `Decider` denies. A `Decider` that returns nil or an unknown shape also denies.

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
  <div class="fig-head">LoginFlow: declared once, compiled once, driven per request</div>
  <svg class="fig-svg" role="img" aria-labelledby="loginflow-title" viewBox="0 0 960 472" xmlns="http://www.w3.org/2000/svg">
    <title id="loginflow-title">What you pass to WithLoginFlow is a specification. It is compiled once into a CompiledLoginFlow, which the orchestrator then drives in a loop for each request: begin the primary factor, prompt, bind an identity, evaluate the decider and the rules, and repeat until no rule fires.</title>
    <text class="fg-lbl" x="32" y="40">declared</text>
    <text class="fg-lbl fg-accent" x="376" y="40">compiled once</text>
    <text class="fg-lbl" x="640" y="40">driven per request</text>
    <!-- declared -->
    <rect class="fg-frame" x="32" y="64" width="248" height="352" rx="8"/>
    <text class="fg-lbl" x="56" y="92">LoginFlow</text>
    <rect class="fg-box" x="56" y="112" width="200" height="72" rx="8"/>
    <text class="fg-m" x="72" y="140">Primary</text>
    <text class="fg-xs" x="72" y="164">the first factor</text>
    <rect class="fg-box" x="56" y="216" width="200" height="72" rx="8"/>
    <text class="fg-m" x="72" y="244">Rules[]</text>
    <text class="fg-xs" x="72" y="268">when to ask for more</text>
    <rect class="fg-box" x="56" y="320" width="200" height="72" rx="8"/>
    <text class="fg-m" x="72" y="348">Decider · Risk</text>
    <text class="fg-xs" x="72" y="372">AAL policy and signals</text>
    <path class="fg-edge" d="M280,240 H376" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="328" y="230" text-anchor="middle">compile</text>
    <!-- compiled -->
    <rect class="fg-box fg-box--accent" x="376" y="192" width="208" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="392" y="220">CompiledLoginFlow</text>
    <text class="fg-mxs" x="392" y="244">internal/authn</text>
    <text class="fg-xs" x="392" y="268">resolved at op.New</text>
    <path class="fg-edge fg-edge--accent" d="M584,240 H612 V100 H640" marker-end="url(#fg-ac)"/>
    <!-- driven per request -->
    <rect class="fg-box" x="640" y="64" width="256" height="72" rx="8"/>
    <text class="fg-m" x="656" y="92">Primary.Begin → Step</text>
    <text class="fg-xs" x="656" y="116">once, at the start of the chain</text>
    <rect class="fg-box" x="640" y="168" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="196">Prompt, the user submits</text>
    <text class="fg-xs" x="656" y="220">binds subject · AAL · AMR</text>
    <rect class="fg-box" x="640" y="272" width="256" height="72" rx="8"/>
    <text class="fg-t2" x="656" y="300">Decider, then Rules</text>
    <text class="fg-xs" x="656" y="324">a rule fires → another Step</text>
    <rect class="fg-box fg-box--accent" x="640" y="376" width="256" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="656" y="404">No rule fires</text>
    <text class="fg-xs" x="656" y="428">the session is issued</text>
    <path class="fg-edge fg-edge--thin" d="M768,136 V168" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M768,240 V272" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M768,344 V376" marker-end="url(#fg-ac)"/>
    <path class="fg-edge" d="M896,308 H920 V204 H896" marker-end="url(#fg-a)"/>
  </svg>
  <figcaption class="fig-note">Compiling up front is what makes a misconfigured flow a start-up error rather than a runtime one. By the time a request arrives there is nothing left to interpret — only a chain to walk.</figcaption>
</figure>
</div>

For each authorize request:

1. `Primary.Begin` produces an `interaction.Step` (Prompt or Result).
2. UI driver (HTML or React) renders the prompt; the user submits.
3. `Primary.Continue` advances to a `Result` carrying the bound `Identity`.
4. Orchestrator builds a `LoginContext` (subject, scopes, completed steps, cached risk score, ACR values).
5. `Decider` runs (if non-nil); a non-`Pass` decision short-circuits. A factor that returns a different subject than the one already bound ends the chain with a server error, and the AAL3 user-verification check applies to a factor that completes in `Begin` without a prompt as well.
6. Otherwise `Rules` evaluate in order; the first matching rule whose `Step.Kind()` is not in `CompletedSteps` fires.
7. Loop until no rule fires; the session is then issued. `LoginFlow.Risk` is consulted at most once for the chain and its outcome is cached. A provider-level `WithRiskAssessor` is the alternative seam; combining it with `LoginFlow.Risk` is rejected at construction rather than choosing silently.

See [Use case: Custom authenticator](/use-cases/custom-authenticator) for how to plug your own factor in via `ExternalStep`.

## Storage seams

The library never reads or writes the embedder's `users` table directly. It talks to the `store.Store` interface, which is the union of small substores:

| Substore | What lives there | Adapter notes |
|---|---|---|
| `Clients` | OAuth client registry | typically durable |
| `Users` | subjects + claims | embedder-implemented; commonly maps to existing users table |
| `AuthorizationCodes` | one-shot codes (PKCE challenge, scope, per-authorization auth state) | durable |
| `RefreshTokens` | refresh chains (each with a `ChainID`), rotation history | durable |
| `AccessTokens` | per-`jti` registry for JWT access tokens, used by `RevocationStrategyJTIRegistry` | durable |
| `OpaqueAccessTokens` | opaque access-token records (each with the `ChainID` of the chain that minted it) | durable |
| `Grants` | consented scopes per (user, client), including the grants that device-code, CIBA and token-exchange redemptions record | durable |
| `GrantRevocations` | tombstones for revoked grants, optionally scoped to access tokens only | durable |
| `Sessions` | browser session records | volatile-eligible |
| `Interactions` | per-attempt interaction state | volatile-eligible |
| `ConsumedJTIs` | JAR / DPoP `jti` replay set | durable, or a Redis instance set to `noeviction` |
| `PushedAuthRequests` | pushed authorization requests | durable when PAR participates in an authorization-code transaction |
| `InitialAccessTokens` / `RegistrationAccessTokens` | DCR Initial / Registration Access Tokens | durable |
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

### Revocation scope and optional store interfaces

A grant is shared by every session of one subject on one client, so a revocation that works per grant would end sessions the caller never meant to touch. Two optional interfaces let a store keep revocation narrower:

| Interface | On | What it adds |
|---|---|---|
| `store.OpaqueAccessTokenChainRevoker` | `OpaqueAccessTokens()` | `RevokeByChain`: retire the opaque access tokens of one refresh chain |
| `store.IssuanceRevocationChecker` | `GrantRevocations()` | `IsIssuanceRevoked`: an access-token-only tombstone (`GrantTombstone.AccessTokensOnly`) does not refuse refresh or code redemption |

The in-memory, SQL and DynamoDB adapters implement both. A bring-your-own store that implements neither, or that drops `ChainID` / `AccessTokensOnly`, keeps the grant-wide behaviour. The same holds for `AuthorizationRecorded` on codes, refresh tokens and opaque access tokens: a row without the per-authorization fields falls back to the grant. What each trigger reaches:

| Trigger | Refresh tokens | Access tokens | Further issuance under the grant |
|---|---|---|---|
| refresh rotation | the predecessor retires; the chain continues | opaque tokens of that chain only (the grant's, when the store lacks the chain revoker) | open |
| `/revoke` on a refresh token | that chain (the grant's refresh tokens when the chain root cannot be resolved) | every access token of the grant | open: other chains and unredeemed codes still redeem |
| replayed refresh token | the replayed chain | every access token of the grant | closed |
| replayed authorization code | every refresh token of the grant | every access token of the grant | closed |
| grant revoke (`RevokeSubject`, Grant Management revoke, `/end_session` teardown) | all | all | closed |

A SQL deployment applies the `ALTER TABLE` statements in `op/storeadapter/sql/schema/MIGRATIONS.md` before upgrading, because `Store.Migrate` refuses to start without the new columns.

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
