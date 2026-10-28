---
title: Design judgments
description: Security design decisions in go-oidc-provider — how conflicting RFCs, introspection authorization, revocation, profiles, and bounded fetches are reconciled.
pageClass: pg-security-design-judgments
---

# Design judgments

Every spec the OP touches is a layered set of MUSTs, SHOULDs, and "the authorization server may". Several places need an explicit reading because the literature disagrees with itself, or because a literal reading collides with another spec. This page lists those calls.

<figure class="fig">
  <div class="fig-head">How to read a design judgment</div>
  <svg class="fig-svg" role="img" aria-labelledby="dj-shape-title" viewBox="0 0 960 232" xmlns="http://www.w3.org/2000/svg">
    <title id="dj-shape-title">Each design judgment names the specification text involved, the point where two documents disagree, and the rule this library adopted — then says where that rule is actually enforced.</title>
    <!-- spec text -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="52">The spec text</text>
    <text class="fg-m" x="48" y="76">MUST · SHOULD · MAY</text>
    <text class="fg-s" x="48" y="100">quoted, with the section</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <!-- conflict -->
    <rect class="fg-box fg-box--warn" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="360" y="52">Where they conflict</text>
    <text class="fg-s" x="360" y="76">two documents give different</text>
    <text class="fg-s" x="360" y="100">answers to the same request</text>
    <path class="fg-edge" d="M616,72 H656" marker-end="url(#fg-a)"/>
    <!-- adopted rule -->
    <rect class="fg-box fg-box--accent" x="656" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="672" y="52">The rule adopted here</text>
    <text class="fg-s" x="672" y="76">one reading is chosen,</text>
    <text class="fg-s" x="672" y="100">and the reason is recorded</text>
    <path class="fg-edge fg-edge--accent" d="M792,120 V160" marker-end="url(#fg-ac)"/>
    <!-- enforcement -->
    <rect class="fg-box fg-box--sub" x="32" y="160" width="896" height="48" rx="8"/>
    <text class="fg-lbl" x="48" y="189">enforced in</text>
    <text class="fg-m" x="192" y="189">op.New checks · the store contract · the internals</text>
  </svg>
  <figcaption class="fig-note">The last row is what separates a judgment from an opinion. If a rule is not enforced somewhere concrete, it is not a rule — it is a note about what the author intended.</figcaption>
</figure>

<div class="dj-hero">
  <div>
    <p class="dj-kicker">Security ADR index</p>
    <p class="dj-lede">Use this page when you need to know whether a behaviour is an accident, a spec compromise, or a deliberate security posture. Each entry names the conflict, the chosen rule, and the implementation surface that enforces it.</p>
  </div>
  <div class="dj-stats" aria-label="Design judgment summary">
    <span><strong>33</strong> decisions</span>
    <span><strong>5</strong> surfaces</span>
    <span><strong>fail-fast</strong> defaults</span>
  </div>
</div>

::: tip How to read this page
Start with the cards for the surface you are changing. Each detailed entry then follows the same shape: **the spec text**, **the conflict**, and **what this library does**. The highlighted callout is the operative rule; cited package paths under `op/` and `internal/` point to the implementation.
:::

::: details Terms used on this page
- **OP** (OpenID Provider): the authorization server this library implements.
- **RP** (Relying Party): the client application that signs users in through the OP.
- **RS** (resource server): the API that accepts access tokens.
- **Grant**: the OP's record of one subject's consent to one client. Several sessions and tokens can sit under one grant; see [Consent](/concepts/consent).
- **Chain**: a refresh token and every successor produced by rotation; see [Refresh tokens](/concepts/refresh-tokens).
- **Tombstone**: a small revocation record keyed by grant (or by `jti`), which lets a JWT be rejected without keeping a row per token.
:::

## Decision map

<div class="dj-map">
  <section class="dj-group">
    <h3>Protocol profiles and discovery</h3>
    <a href="#dj-7"><strong>#7</strong><span>Profiles auto-enable features but reject grants that lack deployment wiring.</span></a>
    <a href="#dj-8"><strong>#8</strong><span>ACR on the wire is separated from the internal AAL ladder.</span></a>
    <a href="#dj-12"><strong>#12</strong><span>Discovery is built once from construction inputs and pinned by golden tests.</span></a>
    <a href="#dj-13"><strong>#13</strong><span><code>client_assertion</code> accepts both OIDC token-endpoint and FAPI issuer audiences.</span></a>
    <a href="#dj-25"><strong>#25</strong><span>DPoP nonce challenges happen before assertion <code>jti</code> consumption.</span></a>
    <a href="#dj-26"><strong>#26</strong><span>CIBA is poll mode only; slow-down strikes are bounded.</span></a>
  </section>
  <section class="dj-group">
    <h3>Tokens, grants, and revocation</h3>
    <a href="#dj-2"><strong>#2</strong><span>Refresh rotation has a 60 s grace window and chain compromise retirement.</span></a>
    <a href="#dj-3"><strong>#3</strong><span><code>offline_access</code> is a UX / TTL signal by default; strict mode makes it a gate.</span></a>
    <a href="#dj-15"><strong>#15</strong><span>DPoP refresh-token chains bind for public clients, not confidential clients.</span></a>
    <a href="#dj-16"><strong>#16</strong><span>Confidential-only introspection delegates across clients only through the resource audience.</span></a>
    <a href="#dj-17"><strong>#17</strong><span><code>/end_session</code> retires everything issued under the subject's grants, class by class.</span></a>
    <a href="#dj-18"><strong>#18</strong><span>JWT access tokens are the default; opaque is opt-in and can vary by resource.</span></a>
    <a href="#dj-19"><strong>#19</strong><span>JWT revocation uses grant tombstones by default; FAPI rejects no-revocation.</span></a>
    <a href="#dj-28"><strong>#28</strong><span>Custom grants ask for refresh tokens; the OP owns value and lineage.</span></a>
    <a href="#dj-29"><strong>#29</strong><span><code>devicecodekit.Revoke</code> owns the cascade, grant record included.</span></a>
    <a href="#dj-31"><strong>#31</strong><span>Grant Management stays explicit while the draft surface is unstable.</span></a>
    <a href="#dj-32"><strong>#32</strong><span>Codes, refresh chains and access tokens carry the state of the authorization that issued them.</span></a>
  </section>
  <section class="dj-group">
    <h3>Registration, issuer, and outbound fetch</h3>
    <a href="#dj-4"><strong>#4</strong><span>Loopback port wildcarding is a narrow native-app opt-in.</span></a>
    <a href="#dj-9"><strong>#9</strong><span>Non-canonical issuer identifiers are rejected at construction time.</span></a>
    <a href="#dj-20"><strong>#20</strong><span>DCR client secrets are hash-only at rest and disclosed once.</span></a>
    <a href="#dj-21"><strong>#21</strong><span>RFC 7592 PUT resets defaulted fields and clears optional metadata.</span></a>
    <a href="#dj-22"><strong>#22</strong><span><code>sector_identifier_uri</code> uses bounded fetch, 24 h success cache, and change detection.</span></a>
    <a href="#dj-23"><strong>#23</strong><span>Custom transports can change trust, not bypass the dial-time SSRF gate.</span></a>
    <a href="#dj-24"><strong>#24</strong><span>Open DCR omitted <code>scope</code> means no registered scopes unless configured.</span></a>
  </section>
  <section class="dj-group">
    <h3>Browser, session, and UI boundaries</h3>
    <a href="#dj-5"><strong>#5</strong><span>Iframe logout specs are not implemented; BCL and RP-Initiated Logout are.</span></a>
    <a href="#dj-10"><strong>#10</strong><span>Sessions may live outside the transactional cluster; volatile BCL is best-effort.</span></a>
    <a href="#dj-30"><strong>#30</strong><span>Cookie keys are conditional: required only when browser authorization is enabled.</span></a>
    <a href="#dj-33"><strong>#33</strong><span>Step-up rules also apply when an authorization is served from an existing session.</span></a>
  </section>
  <section class="dj-group">
    <h3>JOSE and request objects</h3>
    <a href="#dj-1"><strong>#1</strong><span>PAR <code>request_uri</code> is looked up at entry and consumed when a code is emitted.</span></a>
    <a href="#dj-6"><strong>#6</strong><span>JAR <code>request=</code> objects that carry a <code>jti</code> are deduplicated by an OP-side cache.</span></a>
    <a href="#dj-11"><strong>#11</strong><span><code>none</code> and <code>HS*</code> are excluded; OP-issued artifacts are ES256 only.</span></a>
    <a href="#dj-14"><strong>#14</strong><span>PKCE is <code>S256</code> only across all profiles.</span></a>
    <a href="#dj-27"><strong>#27</strong><span>JWE algorithms are allow-listed and JOSE nesting is capped.</span></a>
  </section>
</div>

<a class="faq-anchor" id="dj-1"></a>

## 1. PAR `request_uri` — when does "one-time use" apply?

**Spec:** RFC 9126 §2.2 separates client use from AS handling:

> **RFC 9126 §2.2 (summary)** A client MUST use each `request_uri` only once. An AS SHOULD treat it as one-time, MAY allow duplicates caused by a user-agent reload or refresh, and MUST reject an expired value.

**Conflict:** A literal "consume on first sight" interpretation breaks multi-step interaction (consent → MFA → locale change can re-redirect to the same `/auth?request_uri=…` before the original interaction finishes). The checked-in OFCS FAPI plans confirm this with two separate negative tests — one that requires the OP to *accept* a re-visit before authentication completes, and one that requires it to *reject* the re-visit afterwards. Those plans are Implementer's Draft-era plans and do not by themselves establish conformance to the current FAPI Final profile.

::: tip Decision
`request_uri` is **looked up at `/auth` entry** (`PARs.Find`) and **consumed at authorization-code issuance** (`PARs.Consume`). Re-visits during interaction succeed; re-visits after the code is emitted are rejected with `invalid_request_uri`. The matching OFCS module `fapi2-…-par-attempt-reuse-request_uri` exercises the post-emission rejection path; see <a class="doc-ref" href="/compliance/ofcs">OFCS conformance</a>.
:::

<a class="faq-anchor" id="dj-2"></a>

## 2. Refresh-token rotation grace window

**Spec:** RFC 9700 §4.14.2 requires an AS to detect refresh-token replay for public clients with sender-constrained refresh tokens or rotation. FAPI 2.0 Security Profile Final §5.3.2.1(9) limits refresh-token rotation to extraordinary circumstances; when rotation is used, it allows a time-limited retry with the previous token after the new token is lost.

> **RFC 9700 §4.14.2 (summary)** Rotation issues a new refresh token, invalidates the previous one while retaining the relationship, and revokes the active token when reuse reveals a compromise.

**Conflict:** A strict "single-use, no grace" reading kills any client where the token rotation network round-trip is interrupted (mobile backgrounding, dropped TCP, retried HTTP/2 stream). The checked-in OFCS FAPI plans exercise a grace path with a 30-second wait between rotation and re-exchange of the previous token; those plans are Implementer's Draft-era plans and do not by themselves establish conformance to the current FAPI Final profile.

::: tip Decision
Rotated refresh tokens stay accepted for the library's configurable `GraceTTL` (default 60 s) when the chain has not been revoked for reuse-detection. Within the grace window, presenting the old refresh token returns the saved successor without rotating again; a sender-constrained retry may receive a newly bound access token. Reuse *after* the grace window — or any reuse on a chain that was already revoked — invalidates the entire chain (RFC 9700 §4.14.2) and retires the access tokens of its grant.

The 60-second default is an implementation choice for a bounded lost-response retry path, not an RFC requirement. It matches the time-limited retry shape in FAPI 2.0 Security Profile Final §5.3.2.1(9) when rotation is used, but does not establish that the deployment meets the profile's extraordinary-circumstance condition.

`op.WithRefreshGracePeriod` rejects negative values and treats an explicit zero as no grace. Under the library's FAPI 2.0 profiles, explicit values from 0 through 60 seconds are accepted and wider values are construction errors; omitting the option still resolves to 60 seconds. Deployments without those profiles may choose a wider non-negative window.

A rotation touches only its own chain. The successor keeps the scope of the token it replaces, even when the refresh request narrowed `scope` for that one access token, and the rotation retires only the opaque access tokens minted from the same chain, so the user's other sessions on the same client keep theirs. Implemented in `internal/grants/refresh.Exchanger.tryGrace`; `store.RefreshToken.Revoked` distinguishes "consumed by rotation" from "retired by chain compromise", and `store.RefreshToken.ChainID` names the chain.
:::

<a class="faq-anchor" id="dj-3"></a>

## 3. `offline_access` — gate for refresh, or just a UX signal?

**Spec:** OIDC Core 1.0 §11 simultaneously asserts:

> **OIDC Core 1.0 §11 (a)** the use of Refresh Tokens is not exclusive to the Offline Access use case.

> **OIDC Core 1.0 §11 (b)** when `offline_access` is requested, the Authorization Server MUST ensure the prompt parameter contains `consent`.

**Conflict:** Reading (a) suggests refresh tokens are issued whenever the client is granted the `refresh_token` grant; the scope only governs consent UX. Reading (b) suggests `offline_access` is the canonical scope for refresh issuance and the consent gate is secondary. Other OPs split — some treat `offline_access` as mandatory, others as a UX-only marker.

::: tip Decision
**Default: `offline_access` is a UX and TTL signal, not the refresh-token issuance gate.** Refresh tokens are issued when the granted scope contains `openid` and the client's `GrantTypes` includes `refresh_token`. If the grant also carries `offline_access`, `op.WithRefreshTokenOfflineTTL` may place that chain in the offline lifetime bucket and the consent/audit surface can reflect the offline reach the user authorised.

Embedders that want the strict §11 reading pass `op.WithStrictOfflineAccess()`. In that mode, refresh-token issuance additionally requires `offline_access`, and `grant_type=refresh_token` rejects a token whose originating grant did not carry `offline_access` with `invalid_grant`. The option is incompatible with `op.WithOpenIDScopeOptional()` because §11 has no coherent meaning outside OIDC requests. Implemented in `op/options_features.go`, `internal/tokenendpoint/strict_offline_test.go`, and the refresh issuance path.
:::

<a class="faq-anchor" id="dj-4"></a>

## 4. RFC 8252 §7.3 loopback redirect — exact-match or port wildcarding?

**Spec:** RFC 6749 §3.1.2.3 + OAuth 2.1 mandate byte-exact `redirect_uri` match. RFC 8252 §7.3 says native apps on loopback "MUST be allowed any port at request time".

**Conflict:** The two readings disagree by construction. A CLI tool cannot pre-register every ephemeral OS-assigned port; a strict exact-match policy breaks the canonical native-app flow.

::: tip Decision
Default is exact-match (the strict OAuth 2.1 reading). RFC 8252 §7.3 relaxation is **opt-in per client** via the registered `redirect_uris` listing a loopback URI. The OP then ignores a port mismatch when four conditions hold: the scheme is `http`; the registered hostname is one of the loopback shapes (`127.0.0.1`, `::1`, or the textual `localhost`); the requested host matches the registered host; and path, query, and fragment match exactly. The textual `localhost` is admitted to keep the authorize-side rule aligned with OIDC Registration's native-client loopback carve-out; without it, a native app that registered `http://localhost/cb` would pass registration but fail at `/auth` once the OS handed it an ephemeral port. The `localhost` admission still depends on the embedder having opted in at registration via `op.WithAllowLocalhostLoopback()` for web clients (or `application_type=native` for native clients), so DNS-rebinding-sensitive deployments keep the strict literal-IP-only posture by leaving both opt-ins off. HTTPS loopback is not relaxed (no ACME on `127.0.0.1`).
:::

<a class="faq-anchor" id="dj-5"></a>

## 5. Session Management 1.0 / Front-Channel Logout 1.0

**Spec:** Both are published OpenID Connect specs, separate from Core.

**Conflict:** Both rely on a third-party iframe being able to read its own cookie from an embedded context. Modern browser defaults (Safari ITP since 2017, Firefox ETP since 2019, Chrome `SameSite=Lax` default since 2020, third-party-cookie phase-out across 2024–2025) have removed that capability for mainstream browsers.

::: tip Decision
**Not implemented.** The discovery document does **not** advertise `frontchannel_logout_supported` or `check_session_iframe`. The library ships RP-Initiated Logout 1.0 + Back-Channel Logout 1.0 (server-to-server `POST` of a signed `logout_token`) as the modern substitutes. Embedders that need iframe-based session signalling should pick a different library — this is a load-bearing scope decision, not a backlog item.
:::

<a class="faq-anchor" id="dj-6"></a>

## 6. JAR `request=` replay — opt-in `jti` cache?

**Spec:** RFC 9101 §10.8 RECOMMENDS rejecting replayed request objects within their `exp` window. It does not mandate a registry.

**Conflict:** A naive "verify and accept" follows the minimum JAR rules but allows an intercepted request object to be replayed against a fresh `/auth` until `exp`. FAPI 2.0 Message Signing requires a signed request object at PAR, but does not make `jti` replay detection mandatory. The cache below is a library defense-in-depth choice.

::: tip Decision
**A request object that carries a `jti` is deduplicated.** The OP marks `jar:<use>:<clientID>:<jti>` in `ConsumedJTIStore` for the verifier's max-age / max-lifetime window plus clock skew. The retention is clamped to that OP-side ceiling, so a client-supplied far-future `exp` cannot pin a marker indefinitely. The store is the one DPoP proofs and client assertions already use, so a deployment that shares it across instances gets all three defences.

A request object without `jti` is accepted at `/auth` and `/par`: RFC 9101 §6.1 marks the claim optional, and the OFCS FAPI message-signing plans send request objects without one. FAPI-CIBA promotes `jti` to required at `/bc-authorize`, where a missing value is rejected (`ErrJTIMissing`). A `jti` longer than 256 bytes is a malformed request object.
:::

<a class="faq-anchor" id="dj-7"></a>

## 7. Profile declaration — auto-enable features, reject unwired grants

**Spec:** FAPI profiles impose a mixture of requirements: some are routable features such as PAR, JAR, and JARM; others require deployment-owned collaborators. RFC 9700 §2.1.1 requires PKCE for public clients and recommends it for confidential clients. This library applies a stricter all-client rule under its Baseline and FAPI profiles, while OIDC Core compatibility remains available for deployments that need it.

**Conflict:** Open-coded `switch profile` blocks in handlers silently diverge. Auto-enabling every requirement is also wrong: a missing feature can be selected safely, but mounting a grant without its store and resolver collaborators creates a half-wired endpoint.

::: tip Decision
**Profiles accumulate their policy, but features and grants resolve differently.** `WithProfile` auto-enables required features. Thus FAPI 2.0 Baseline selects PAR and JAR, Message Signing also selects JARM, and a FAPI profile selects DPoP unless the embedder explicitly chose mTLS. `profile.Baseline` has no routable feature. The library's `profile.Baseline`, `profile.FAPI2Baseline`, and `profile.FAPI2MessageSigning` policies make PKCE mandatory for every authorization-code request, including confidential clients.

Required grants are never auto-enabled. `profile.FAPICIBA` without the CIBA grant fails `op.New` and names `WithCIBA(WithCIBAHintResolver(...))` as the wiring path. This preserves a useful construction error instead of mounting `/bc-authorize` without its collaborators. The resolved profiles, features, grants, and policy are emitted once as the `startup.profile` audit event, so operators can verify the actual posture before the first request. The constraint functions live in `op/profile/constraints.go`; `WithProfile` and construction validation apply them centrally.
:::

<a class="faq-anchor" id="dj-8"></a>

## 8. ACR / AAL mapping — internal vs wire vocabulary

**Spec:** OIDC Core 1.0 emits `acr` claims; RFC 6711 / 8485 govern the identifier registry; RFC 9470 standardises step-up via `acr_values` + `WWW-Authenticate: error="insufficient_user_authentication"`.

**Conflict:** Internal AAL ("which factors did the user complete?") is not the same vocabulary as the OIDC `acr` echoed on the wire. Mapping them naively (e.g. `acr=urn:authn:aal=2` literal) ties the wire vocabulary to internal taxonomy, which embedders cannot evolve without breaking RPs.

::: tip Decision
A two-layer model — `op/aal.go` for the internal AAL ladder, `op/acr.go` for the wire-side `acr` mapping. `RuleACR` (in `op/rule.go`) implements RFC 9470 step-up: an RP that asks for a higher `acr_values` than the session currently provides receives the `insufficient_user_authentication` challenge with the next step.
:::

<a class="faq-anchor" id="dj-9"></a>

## 9. Issuer identifier validation

**Spec:** RFC 9207 says the OP MUST emit `iss` on authorization responses, and clients compare that value with the expected issuer using simple string comparison. OIDC Discovery 1.0 §3 and RFC 8414 §2 define the issuer as an HTTPS URL without query or fragment components and require the metadata `issuer` to match the issuer used for the configuration request. Discovery §4.1 (and RFC 8414 §3.1) removes a terminating `/` from a path issuer before constructing the well-known request. FAPI 2.0 Security Profile Final §5.3.2.1(1) requires the AS to distribute that discovery metadata.

**Conflict:** URI syntax permits representations that differ by scheme or host case, default-port spelling, or a trailing slash, and Discovery explicitly removes a terminating slash when constructing the well-known request. These specifications do not require this library to reject every such representation, but RFC 9207 and the metadata specifications still require one exact issuer value at comparison boundaries. If an OP and an RP canonicalize that value differently, issuer validation fails.

::: tip Decision
`op.WithIssuer` deliberately applies a strict canonicalization policy and rejects a URI carrying any of these:

- a trailing slash
- a mixed-case scheme
- a mixed-case host
- a default port (`:443` for https, `:80` for http)
- a fragment
- a query
- a non-canonical path (`..`, `.`, or duplicate slashes detected via `path.Clean`)

Query and fragment rejection follows the issuer requirements; the case, port, trailing-slash, and path rules are additional library policy. The same accepted form is reused for `iss` in every emitted artifact, in the discovery document's own `issuer` field, and in the authorization-response `iss` parameter — so simple string comparison under RFC 9207 mix-up defence has one value end-to-end. `op.New` returns a build-time error rather than booting on a non-canonical issuer.
:::

<a class="faq-anchor" id="dj-10"></a>

## 10. Sessions — in or out of the transactional cluster?

**Spec:** None. This is an architecture decision.

**Conflict:** Putting sessions in the same SQL cluster as auth codes / refresh tokens / clients (the transactional store) couples session mutation latency to the transactional path. Putting them on Redis loses durability — but session loss is recoverable (the user logs in again), whereas authorization-code loss is not (the RP loop breaks).

::: tip Decision
Sessions are routed through a separate substore (`store.SessionStore`) that the embedder may serve from a volatile store such as Redis. `/end_session` takes the session snapshot before deleting it, and the BCL coordinator resolves its audience from grant-derived client IDs via `GrantStore.ListClientIDsBySubject`. If eviction happens before that snapshot, no fan-out starts and no BCL no-sessions event is emitted. `op.AuditBCLNoSessionsForSubject` instead means that a session-bearing logout notice reached the coordinator but resolved to zero eligible grant-derived RP targets; `op.SessionDurabilityPosture` records the embedder's declared durability so operators can interpret logout-trigger and snapshot-retention risk without treating the event as a direct eviction signal.
:::

<a class="faq-anchor" id="dj-11"></a>

## 11. JOSE allow-list and ES256-only issuance

**Spec:** RFC 8725 ("JWT BCP") §3.1 requires libraries to let the caller specify an algorithm allow-list and to reject algorithms outside it. Section 3.2 makes algorithm selection an application decision, warns about HMAC/public-key confusion, and does not categorically prohibit `none` when another end-to-end protection exists; libraries SHOULD consume or generate it only when explicitly requested.

**Conflict:** The underlying JOSE library accepts the full registry by default. Adding a runtime check is fragile — a future code path that imports the JOSE library directly bypasses it.

::: tip Decision
`internal/jose.Algorithm` is a closed enum: `RS256`, `PS256`, `ES256`, `EdDSA`. `none` and `HS*` are **not in the type at all**. `depguard` (lint) forbids importing the underlying JOSE package outside a short list of `internal/` packages that already hold raw handles (`jose`, `keys`, `dpop`, `jar`, `jarm`, `mtls`, `clientauth`, and a few more), so a new code path has to be added to that list on purpose.

The verification allow-list is deliberately wider than the issuing policy. Client assertions and request objects may use the accepted asymmetric algorithms, but every artifact the OP signs — ID Tokens, JWT access tokens, signed UserInfo, and JARM responses — uses ES256 with a P-256 key. This issuing policy is fixed: an RP that requires RS256 or PS256 for OP-issued tokens is unsupported. Keeping issuance to one vetted curve removes algorithm negotiation and its downgrade paths without making the OP reject standards-compliant client assertions.
:::

<a class="faq-anchor" id="dj-12"></a>

## 12. Discovery document — narrowing on profile

**Spec:** OIDC Discovery 1.0 + RFC 8414 enumerate the metadata fields. FAPI 2.0 Security Profile Final §5.3.2.1(6) restricts AS client authentication to mTLS or `private_key_jwt`, which narrows `token_endpoint_auth_methods_supported`. RFC 9101 §10.1 demands `request_object_signing_alg_values_supported` when JAR is on.

**Conflict:** The `_supported` lists are produced by feature activation, then potentially narrowed by the active profile, then copied into the introspection / revocation auth-method lists. Doing this in handlers re-introduces drift; doing it at construction time forces a single point that must agree.

::: tip Decision
Discovery is built once at `op.New` time (`internal/discovery/build.go`), profiles narrow the auth-method list via `ProfileAllowedAuthMethods`, and the introspection / revocation endpoints copy the post-narrowed list. A discovery golden test in the repository asserts the document shape per profile so silent drift is caught at PR time.
:::

<a class="faq-anchor" id="dj-13"></a>

## 13. `client_assertion` audience — FAPI 2.0 vs OIDC Core

**Spec:** RFC 7523 §3 says the JWT bearer assertion's `aud` MUST be "a value identifying the authorization server" — without pinning which identifier. OIDC Core 1.0 §9 (private_key_jwt) reads that as the OP's token endpoint URL. FAPI 2.0 Security Profile Final §5.3.2.1(8) narrows the authorization-server requirement: the AS must accept only the issuer identifier, and that value must be a JSON string. FAPI clients have the matching obligation in §5.3.3.1(5). RFC 7519 generally permits a string or an array for `aud`, but FAPI narrows that shape.

**Conflict:** The library's compatibility verifier accepts OIDC Core's token-endpoint form, FAPI's issuer form, and an array containing an accepted value. That is useful when one OP serves both dialects, but it is not FAPI 2.0 Security Profile Final conformance: accepting the token endpoint URL or an `aud` array violates §5.3.2.1(8). A Final FAPI profile needs a stricter validation policy; the broad RFC 7523 interpretation does not override the profile requirement.

::: tip Decision
Keep the primary `Audience` plus `AuxAudiences` compatibility behavior in the general library. `op.New` populates `AuxAudiences` with the issuer for every OP, and `internal/clientauth/assertion.go` consumes `jti` once across the merged path, so neither accepted dialect can bypass replay defence. Treat this as a library compatibility policy, not as a claim of FAPI 2.0 Security Profile Final conformance. A Final FAPI profile must accept only the issuer identifier encoded as a JSON string and reject the token-endpoint audience and array form.
:::

<a class="faq-anchor" id="dj-14"></a>

## 14. PKCE — `S256`-only, `plain` rejected by policy

**Spec:** RFC 7636 §4.2 lists two transformations: `plain` and `S256`. §4.4.1 says clients SHOULD use `S256`, with `plain` retained for environments that cannot compute SHA-256. OAuth 2.1 (`draft-ietf-oauth-v2-1` §4.1.1) and FAPI 2.0 Security Profile Final §5.3.2.2(5) forbid `plain` outright.

**Conflict:** A literal RFC 7636 reading lets the OP accept whichever method the client requests. A strict reading of OAuth 2.1 / FAPI 2.0 requires rejection. A "per-profile gate" architecture would let the same client succeed against an OIDC-Core OP and fail against the same OP under a FAPI 2.0 profile — the kind of silent profile drift the rest of the codebase works hard to avoid.

::: tip Decision
The OP rejects `plain` **regardless of profile**. `internal/pkce.Method` is the singleton constant `"S256"`; `ValidateChallenge` returns `ErrChallengeMethodUnsupported` for any other value, and `code_challenge_methods_supported` advertises only `S256` in discovery. Reasoning: `plain` provides no PKCE protection (the verifier IS the challenge), the SHOULD reading from RFC 7636 has aged out under OAuth 2.1, and a uniform stance keeps client behaviour consistent across profiles.
:::

<a class="faq-anchor" id="dj-15"></a>

## 15. DPoP refresh-token binding — public vs confidential split

**Spec:** RFC 9449 §5.0 / §5.4 say the AS MAY bind refresh tokens to the DPoP key supplied at the token endpoint. §5.4 adds that once bound, the binding MUST persist across rotations.

**Conflict:** "MAY bind" is genuinely two-handed. **Always-bind** locks confidential clients to a single DPoP key for the chain's lifetime, which clashes with FAPI 2.0 OFCS plans that explicitly rotate the DPoP key across refresh requests. **Never-bind** leaves public-client refresh tokens (SPAs, native apps) as raw bearer secrets — exactly the threat model RFC 9449 §1 cites as motivating sender constraints.

::: tip Decision
**Bind for public clients, leave unbound for confidential.** A client whose `TokenEndpointAuthMethod` is `"none"` (the public-client signal) gets its refresh chain DPoP-bound on first issue, and the binding propagates through every rotation per §5.4. Confidential clients (`private_key_jwt`, `client_secret_*`) leave the refresh chain unbound, free to rotate DPoP keys per request — but the access tokens minted on each refresh are still bound to whatever key was presented, so any holder of those access tokens still needs the matching private key. Implemented in `internal/tokenendpoint.refreshDPoPJKT`; once a chain is bound, the §5.4 persistence rule kicks in and prevents an opportunistic upgrade from locking later key rotation. The split applies to DPoP only: a refresh chain issued to an mTLS-bound request is bound to the client certificate for every client type, and each refresh must present the same certificate (`requireMTLSMatch`).
:::

<a class="faq-anchor" id="dj-16"></a>

## 16. Introspection — confidential callers, audience-scoped delegation, and uniform inactive shape

**Spec:**

> **RFC 7662 §2.2** an introspection response for a token the AS does not consider active MUST carry `"active": false`, and MAY contain only the `active` member.

§2.1 additionally lets the AS "differently respond depending on the audience". Cross-client refusal is therefore permitted, but not mandated.

**Conflict:** Three readings circulate:
1. **Liberal** — let any authenticated client introspect any token the AS recognises, returning `"active": true` even when the calling client is not the issuer.
2. **Strict-distinguishable** — refuse cross-client introspection but signal it (e.g. HTTP 403 or `error: not_authorized`).
3. **Audience-scoped** — allow the resource server named by the token audience to introspect through an explicit allow-list, while refusing unrelated callers with the same `{"active": false}` shape used for unknown / expired / revoked tokens.

Reading 2 leaks token-existence information through the response shape: a curious client can probe whether a guessed token belongs to *some* live grant.

::: tip Decision
**Only confidential callers may use `/introspect`.** A public client or a client whose token-endpoint authentication method is `none` receives `401 invalid_client` before token resolution. A confidential client may introspect its own access or refresh token. Cross-client access-token introspection is allowed only when the calling client is listed in the token audience's protected resource `IntrospectionClients`; the audience check is the delegation boundary. Refresh tokens are never delegated across clients. An unauthorized cross-client access-token lookup returns the same `{"active": false}` shape as an unknown, expired, or revoked token. Active opaque responses include `iss`. An active refresh-token response omits `token_type`, because RFC 7662 §2.2 defines that member as the access-token type. Implemented in `internal/introspectendpoint` and the protected-resource configuration; tests cover the confidential gate, audience delegation, and refresh-token refusal.
:::

<a class="faq-anchor" id="dj-17"></a>

## 17. `/end_session` — access-token cascade scope

**Spec:** OIDC RP-Initiated Logout 1.0 §6:

> **OIDC RP-Initiated Logout 1.0 §6** the OP MAY also revoke any active sessions, refresh tokens, and access tokens once the user signs out.

Back-Channel Logout 1.0 §2.3 governs RP-side fan-out but is silent on AT revocation reach.

**Conflict:** A literal "MAY" admits postures from "delete the cookie and walk away" to "revoke every grant the subject holds". The blast radius differs:

- **Cookie-only**: outstanding access tokens remain valid until their `exp`. A JWT that never returns to the OP cannot be retracted at all.
- **Revoke at the OP-served boundaries**: `/userinfo` and `/introspect` see the token as inactive at once. A resource server that validates a JWT offline does not.
- **Opaque tokens** reach every resource server: the token has no offline verification path, so the next introspection reports it inactive.

::: tip Decision
**Cascade by default.** `/end_session` lists every grant the subject holds and retires what was issued under each: JWT access tokens (by the configured revocation strategy, a grant tombstone by default), opaque access tokens and refresh tokens. Under the tombstone strategy the grant is also closed to further issuance. Each class goes through the substore the configured `Store` exposes; a class whose substore is absent is skipped, and a store that exposes no `Grants` leaves the cookie-only posture, where access tokens expire naturally. A failed class is reported in the audit stream and does not block the sign-out. The table in <a href="#dj-19">#19</a> compares this reach with the other revocation triggers. The cascade-reach gap between JWT and opaque tokens (JWT → OP-served boundaries only, opaque → every RS via introspection) is documented separately on the <a class="doc-ref" href="/concepts/access-token-format">access-token-format</a> page; the choice of which form to issue is the lever embedders pull when this gap matters.
:::

<a class="faq-anchor" id="dj-18"></a>

## 18. Access-token format — default JWT, opaque opt-in, per-audience override

**Spec:** RFC 9068 standardises the JWT-shaped OAuth 2.0 access token. RFC 6749 itself treats the access token as an opaque bearer string. RFC 7662 introspection is optional. RFC 8707 lets a single client request tokens for multiple resources in one flow.

**Conflict:** Two opposite defaults are defensible:

- **Default JWT** — every RS validates locally, no `/introspect` round-trip, scales horizontally; but `/end_session` cannot retract a JWT that never sees the OP again until `exp`.
- **Default opaque** — every RS hits the OP, latency-coupled with the OP path; but immediate revocation reach.

A single hard-coded default forces every embedder onto one trade-off. Per-audience selection (RFC 8707) lets a single OP issue different forms to different RSes inside the same authorization.

::: tip Decision
**Default is `op.AccessTokenFormatJWT`** — matches the typical horizontal-scale RS layout and keeps the wire shape compatible with off-the-shelf JWT verifiers. `op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` flips the global default; `op.WithAccessTokenFormatPerAudience(map[string]op.AccessTokenFormat{...})` selects per RFC 8707 resource indicator so high-revocation-reach audiences (admin APIs, payment APIs) can take opaque while general-purpose APIs keep JWT. The full trade-off (load concentration, header size, cascade reach, storage shape) lives on the <a class="doc-ref" href="/concepts/access-token-format">access-token-format</a> page; this entry exists so the *decision* is recorded alongside the other deliberate spec reads.
:::

<a class="faq-anchor" id="dj-19"></a>

## 19. JWT access-token revocation strategy — grant tombstone over per-`jti` registry

**Spec:** RFC 6749 §4.1.2 says the AS "SHOULD revoke (when possible)" on code re-use. RFC 6819 §5.2.1.1 expects a server-side reuse-detection invariant. RFC 7009 §2.2 lets revocation be unsupported for self-contained tokens. FAPI 2.0 Security Profile Final §5.3.4(3) requires resource servers to verify the validity, integrity, expiration, and revocation status of access tokens. That requirement is enforced at the RS boundary; it does not prescribe an OP-side storage strategy.

**Conflict:** The literal "shadow every `jti` so revocation can flip a row" model satisfies every spec but loads `O(issuance_rate × AT_TTL)` rows on the transactional store, and the cascade path on a logged-out user with N outstanding ATs becomes N row updates. The opposite extreme — "no revocation, JWT lives until `exp`" — leaves a resource server without revocation status unless the deployment supplies another check, so it cannot meet the FAPI 2.0 Security Profile Final §5.3.4(3) requirement.

The middle reading is to keep the JWT self-contained but bind it to a server-side **grant** rather than to a per-token row. One write per revoked grant fans out to every AT under that grant; issuance writes nothing.

::: tip Decision
**Default is `op.RevocationStrategyGrantTombstone`.** Every JWT AT carries a `gid` private claim (the OP-side GrantID, RFC 7519 §4.3, omitempty). Verification at OP-served boundaries (`/userinfo`, `/introspect`) consults a small per-grant tombstone table keyed on `gid`. Cascades (logout, code-replay, refresh compromise) write one tombstone row per revoked grant; single-AT `/revoke` writes one deny-list row per revoked `jti`. The default issuance path writes **zero** rows on `/token`. Steady-state row count is `O(revoked grants + revoked JTIs)`, not `O(issued)`.

Embedders who need a per-AT audit trail flip `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyJTIRegistry)`, which keeps one shadow row per issuance in `store.AccessTokenRegistry`. Both strategies provide server-side revocation state at the OP-served boundaries, but selecting either OP strategy alone does not establish FAPI Final conformance: resource servers still have to satisfy §5.3.4(3). `op.RevocationStrategyNone` is a third option for non-FAPI deployments that explicitly accept the RFC 6749 §4.1.2 "SHOULD" wiggle; `op.New` rejects it under any FAPI profile.

The opaque AT path (`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)`) is unaffected by this enum: opaque verification needs the row, so storage is intrinsically per-token. Implemented in `op/access_token_revocation.go`, `internal/tokens` (gid claim), `op/store/grant_revocation.go`, and the backend adapters.
:::

Every trigger routes through one owner (`internal/grants/teardown`), which states the blast radius per trigger. A grant is shared by all of one subject's sessions on one client, so most triggers deliberately stop short of the whole grant:

| Trigger | Refresh tokens retired | Access tokens retired | Grant closed to further issuance |
|---|---|---|---|
| `/end_session`, for each grant the subject holds | all of the grant's | all of the grant's, JWT and opaque | yes |
| Authorization-code replay | all of the grant's | all of the grant's | yes |
| Refresh-token replay (reuse after the grace window) | the replayed chain; all of the grant's if the chain root cannot be resolved | all of the grant's | yes |
| `/revoke` of a refresh token | that chain; all of the grant's if the chain root cannot be resolved | all of the grant's | no: other chains and unredeemed codes keep redeeming |
| Refresh rotation | the previous token | the opaque ones minted from the same chain | no |

"Closed" holds under the tombstone strategy: the tombstone also refuses the grant's refresh and code redemption. The `/revoke` row writes an access-token-only tombstone (`store.GrantTombstone.AccessTokensOnly`), and a store that implements the optional `store.IssuanceRevocationChecker` lets the token endpoint ignore that kind when it decides whether a chain or code may still mint. The chain-wide opaque retirement on rotation needs `store.OpaqueAccessTokenChainRevoker`. A store that implements neither, or drops `ChainID`, falls back to grant-wide behaviour, which over-revokes rather than under-revokes. `/revoke` records `token.revoked` with `surface` `refresh_chain`, or `refresh_grant` when it fell back to the grant's refresh tokens.

A code or refresh token presented by the wrong client, or one failing the `redirect_uri` or PKCE check, is not a replay: it consumes nothing and tears down nothing. Only a genuine replay triggers the rows above.

<a class="faq-anchor" id="dj-20"></a>

## 20. DCR `client_secret` storage and disclosure

**Spec:** RFC 7591 §3.2.1 marks `client_secret` as OPTIONAL in the registration response. RFC 7592 §2.1 (read) and §2.2 (update) both allow but do not require the OP to re-emit `client_secret` in the response body.

**Conflict:** A "store the cleartext so we can re-emit it on every GET" reading is the simplest implementation and matches what some historic OPs do, but it places the cleartext in a recoverable form forever and turns the registration record into the most sensitive row in the database. A "hash on POST and never re-emit" reading matches how every other credential in the OP is stored and removes the recoverable surface entirely, at the cost of asymmetry between the POST response (plaintext available once) and the GET response (plaintext gone forever).

::: tip Decision
**Hash-only at rest. Plaintext returned exactly once on `POST /register`, and again only on `PUT /register/{client_id}` when `token_endpoint_auth_method` changes from `none` to a confidential method. `GET /register/{client_id}` never re-emits `client_secret`.** A confidential-to-confidential update keeps the existing hash, so editing metadata never rotates the secret. Embedders that need recoverable access to the plaintext keep their own copy at the moment of the original POST response; the OP refuses to be the system of record for the cleartext. Implemented in `internal/registrationendpoint/manage.go` and `internal/registrationendpoint/register.go`. Storage is governed by `op/store/client.go` (`SecretHash`-only), so the same posture applies to every `store.ClientStore` adapter.
:::

<a class="faq-anchor" id="dj-21"></a>

## 21. RFC 7592 PUT omission semantics

**Spec:** RFC 7592 §2.2 reads in two parts:

> **RFC 7592 §2.2 (sentence 1)** the values of the metadata returned in the response MUST replace, not augment, the values previously associated with this client.

> **RFC 7592 §2.2 (sentence 2)** the server MAY ignore any null or empty value in the request just as any other value.

**Conflict:** A strict reading of the first sentence makes a missing `grant_types` field on PUT mean "delete `grant_types`", which leaves the client with no grant capability and breaks every subsequent `/token` request. The MAY clause in the second sentence is the escape hatch every reference OP uses to avoid that footgun, but the ecosystem has not converged on a single replacement policy.

::: tip Decision
**Omitted *defaulted* fields reset to the server-side default. Omitted *optional* fields become empty.** The defaulted set is `grant_types`, `response_types`, `token_endpoint_auth_method`, `application_type`, `subject_type`, and `id_token_signed_response_alg`; on PUT they fall back to the OP's documented defaults rather than vanishing from the record. Optional metadata (`client_uri`, `logo_uri`, `policy_uri`, `tos_uri`, `contacts`, …) is genuinely cleared when omitted. Server-managed fields — `registration_access_token`, `registration_client_uri`, `client_secret_expires_at`, `client_id_issued_at` — are rejected with `400 invalid_request` if present in the body, and a `client_secret` value that does not match the authenticated client is rejected with the same status. The OP does not persist a separate "configured vs defaulted" bit for these fields; the on-the-wire behaviour is the same either way for every defaulted field. Implemented in `internal/registrationendpoint/manage.go` (`validateManageUpdateRequest`) and `internal/registrationendpoint/metadata.go` (`applyMetadataDefaults`).
:::

<a class="faq-anchor" id="dj-22"></a>

## 22. `sector_identifier_uri` fetch bounds and native loopback rules

**Spec:** OIDC Core 1.0 §8.1 makes the `sector_identifier_uri` fetch and the containment check on the registered `redirect_uris` a MUST:

> **OIDC Core 1.0 §8.1** the values registered in `redirect_uris` MUST be included in the elements of the array, or registration MUST fail.

The spec fixes neither a timeout nor a body cap. OIDC Registration §2 lists `localhost`, `127.0.0.1`, and `[::1]` as valid loopback hosts for `application_type=native`. RFC 8252 §8.3 marks `localhost` as NOT RECOMMENDED in favour of the IP literals, citing DNS rebinding.

**Conflict:** "Fetch with the language default" implicitly means "hold a goroutine open until the upstream eventually answers", and the request body is unbounded — both are footguns at registration time. On `localhost`, OIDC Registration §2 and RFC 8252 §8.3 disagree: the OIDC text accepts it for native, the OAuth text warns against it. A web client that registers `http://localhost/cb` is a separate question from a native client that does the same.

::: tip Decision
**Fetch is bounded to a 5 s timeout, a 64 KiB body cap, HTTPS only, no redirects, and a 24 h success cache.** Failures are not cached. A cache hit still re-runs the redirect-URI subset check against the currently registering client, so the cache never widens what a different client can register under the same sector.

When a later fetch observes that the remote document's canonical hash changed, the resolver returns `ErrSectorContentChanged` once and evicts the stale entry. The next valid registration for that URI repopulates the cache with the new document, which lets legitimate RP-side rotations recover without an OP restart while still surfacing unexpected sector changes to operators. Failure or containment mismatch produces `400 invalid_client_metadata`; the cause goes to the audit log but never to the response body so upstream details (host, TLS state, partial bytes) do not leak.

For loopback hosts, the registration layer splits on `application_type`. Web clients (the default) accept `127.0.0.1` and `[::1]` over `http`; the textual `localhost` is rejected unless the embedder explicitly opts in via `op.WithAllowLocalhostLoopback()`. Native clients (`application_type=native`) accept all three loopback hosts unconditionally per OIDC Registration §2, plus claimed `https` redirects and reverse-DNS custom URI schemes (`com.example.app:/cb`) per RFC 8252 §7.1. Custom schemes that lack a `.` are rejected because non-reverse-DNS schemes collide across applications. The authorize-time port wildcard for loopback URIs is governed by a separate per-client opt-in (#dj-4) and composes with this rule without overlap. Implemented in `internal/registrationendpoint/sector_identifier.go` and `internal/registrationendpoint/metadata.go` (`validateRedirectURI` / `validateNativeRedirectURIScheme`).
:::

<a class="faq-anchor" id="dj-23"></a>

## 23. Outbound JWKS / metadata fetch SSRF boundary

**Spec:** OIDC Dynamic Registration, JAR, private_key_jwt, pairwise subjects, and Back-Channel Logout all let RP-controlled metadata point the OP at outbound URLs. Those specs define what has to be fetched, but they do not define a common SSRF envelope for private networks, loopback, DNS rebinding, or custom TLS roots.

**Conflict:** A deployment often needs a custom transport for conformance runners, internal CAs, or RP networks that are not publicly trusted. Letting a caller replace the HTTP client wholesale would also let them accidentally remove the dial-time SSRF guard. Refusing custom transports keeps the guard simple but makes otherwise valid deployments impossible.

::: tip Decision
**Outbound trust and outbound reachability are separate knobs.** `op.WithJWKSHTTPTransport` lets embedders supply TLS trust and transport settings for RP JWKS fetches, but for an `*http.Transport` the package replaces its dial functions with the gated dialer, so the SSRF deny-list still runs at connect time. Any other `http.RoundTripper` is checked on the request URL of every request and redirect hop only, which does not stop a DNS-rebinding peer; through a proxy, the dial-time gate sees the proxy's address and the target URL is checked once before the hand-off. Private-network admission remains controlled by the explicit `WithAllowPrivateNetworkJWKS` / `WithAllowPrivateNetworkJAR` style policy knobs; a custom transport alone never widens the network boundary.

The same bounded-fetch posture is used for JAR JWKS, client-auth JWKS, `sector_identifier_uri`, and Back-Channel Logout destinations: URL-shape validation first, dial-time network checks second, bounded response handling third. Implemented in `op/options_session.go`, `internal/netsec`, `internal/securefetch`, `internal/jar`, `internal/endpointsupport/clientauth.go`, and `internal/registrationendpoint/sector_identifier.go`.
:::

<a class="faq-anchor" id="dj-24"></a>

## 24. Open DCR omitted `scope`

**Spec:** RFC 7591 makes `scope` optional in registration metadata. In an IAT-bound registration flow, the issuer of the Initial Access Token is operator code and may attach an explicit `AllowedScopes` policy. In open registration, there is no such operator-issued per-request envelope.

**Conflict:** Treating omitted `scope` as "all public scopes" makes a no-body open-registration POST surprisingly powerful. Treating it as "no scopes" is safer, but a client then has to ask for scope explicitly, or the embedder has to configure a default.

::: tip Decision
**Open registration defaults omitted `scope` to an empty registered scope set.** A later `/auth` request that asks for scopes the client did not register is rejected as `invalid_scope`. Embedders that intentionally want a public default opt in via `RegistrationOption.OpenRegistrationDefaultScopes`, which is validated against the OP scope registry at construction time.

The IAT-bound path keeps the broader operator-trusted default: if the IAT has no `AllowedScopes`, the request can default from the public scope registry. Implemented in `op/registration.go`, `op/options_validate.go`, `internal/registrationendpoint/handler.go`, `internal/registrationendpoint/register.go`, and `internal/registrationendpoint/metadata_validate.go`.
:::

<a class="faq-anchor" id="dj-25"></a>

## 25. DPoP nonce challenge before `client_assertion` replay consumption

**Spec:** RFC 9449 lets an AS challenge a token request with `use_dpop_nonce`; the client then retries with a fresh DPoP proof. RFC 7523 requires replay protection for JWT client assertions through `jti` / time-window checks.

**Conflict:** If the token endpoint authenticates the client first, the first request consumes the `client_assertion` `jti` and then returns `use_dpop_nonce`. A client that retries the same form body with only the DPoP proof changed then fails as `invalid_client` / assertion replay, even though the nonce challenge is the expected RFC 9449 recovery path.

::: tip Decision
**DPoP nonce validation runs before client authentication on token and PAR paths.** A missing or stale DPoP nonce produces the nonce challenge without burning the form-borne `client_assertion`. Once the DPoP proof is acceptable, the normal private_key_jwt replay cache consumes the assertion exactly once. Implemented in `internal/tokenendpoint/authcode.go`, the refresh-token token path, `internal/parendpoint/par.go`, and pinned by `internal/tokenendpoint/refresh_dpop_nonce_pkjwt_test.go`.
:::

<a class="faq-anchor" id="dj-26"></a>

## 26. CIBA / FAPI-CIBA polling and error taxonomy

**Spec:** CIBA Core 1.0 defines poll, ping, and push modes, `slow_down`, and a general §13 error vocabulary. It leaves the poll-abuse lockout threshold implementation-defined. FAPI-CIBA layers signed request-object requirements on top of CIBA but conformance modules still expect CIBA-shaped wire errors.

**Conflict:** A strict poll ladder without a cap lets a client ignore `slow_down` until `auth_req_id` expiry. A hard-coded low cap protects production but can break OFCS modules that intentionally exercise repeated polling. Separately, surfacing detailed JAR parser errors from `/bc-authorize` would be helpful for debugging but leaks a JOSE-specific taxonomy through a CIBA endpoint that expects `invalid_request`.

::: tip Decision
**The library implements CIBA poll mode only and applies a bounded slow-down strike counter.** The default cap is 5 violations; `op.WithCIBAMaxPollViolations(n)` raises or lowers it, `0` means the library default, and `255` effectively disables lockout because the counter is `uint8`. Production deployments should keep a finite cap. `op.New` also refuses a negative `WithCIBADefaultExpiresIn` or `WithCIBAPollInterval`, and under FAPI-CIBA a default or maximum expiry above 10 minutes.

At `/bc-authorize`, duplicate single-valued parameters are rejected and request-object failures map to `invalid_request` per CIBA Core §13. Under FAPI-CIBA, the JAR verifier requires `iat`, caps request-object lifetime at 60 minutes, and accepts RP JWKS fetched through the same SSRF-bounded fetcher as the rest of the OP. Implemented in `op/options_ciba.go`, `internal/ciba/polling.go`, `internal/cibaendpoint`, `internal/jar`, and `op/op_builders.go`.
:::

<a class="faq-anchor" id="dj-27"></a>

## 27. JWE allow-list and JOSE nesting cap

**Spec:** RFC 7516 and RFC 7519 allow a broad set of JWE algorithms and nested JWT shapes. In principle, a JWT can be a JWE wrapping another JWE wrapping another JWT, and so on.

**Conflict:** Accepting every JOSE shape supported by a general-purpose library widens the cryptographic surface beyond what the OP needs. A per-layer plaintext cap protects memory for each decryption, but it does not by itself bound an attacker-controlled nesting chain.

::: tip Decision
**JWE is closed by policy and nested JOSE traversal is capped.** The OP accepts only its explicit `alg` and `enc` allow-lists, rejects unknown `crit`, caps decrypted plaintext at 1 MiB, and rejects the 11th JOSE layer with `ErrJWENestingTooDeep`. A normal encrypted request object is two layers at most (JWE wrapping JWS), so the 10-layer ceiling leaves room for future protocol shapes without making recursion unbounded.

Implemented in `internal/jose/jwe.go`, wired through JAR / PAR verification, and pinned by `internal/jar/verify_jwe_test.go` plus scenario coverage for deeply nested encrypted request objects.
:::

<a class="faq-anchor" id="dj-28"></a>

## 28. Custom-grant refresh tokens — handler value or OP-issued credential?

**Spec:** RFC 6749 §6 treats a refresh token as a credential issued by the authorization server. RFC 9700 §4.14.2 requires the AS to detect refresh-token replay for public clients with either sender-constrained refresh tokens or rotation; rotation issues a new token, invalidates the previous token while retaining the relationship, and revokes the active token when reuse reveals a compromise.

**Conflict:** Custom grants are intentionally handler-defined. Letting a handler return an arbitrary refresh-token string is tempting because it mirrors `AccessToken`, but the OP cannot rotate, bind, or cascade-revoke a credential whose value and lineage it did not create. Rejecting refresh tokens entirely is simpler, but it prevents legitimate custom grants and token-exchange policies from using the OP's existing rotation machinery for long-lived service chains.

::: tip Decision
**Handlers signal intent; the OP owns the refresh-token value.** `CustomGrantResponse.IssueRefreshToken` asks the OP to mint and persist the refresh token through `RefreshTokenStore`. The record shares the issued access token's grant identity and DPoP / mTLS confirmation, so the normal rotation, replay cascade, grant revocation, and introspection semantics apply. A handler never supplies the refresh-token string directly.

Issuance is a five-gate decision: the provider must serve `refresh_token`, the client must be registered for it, the response subject (or the bound access token's subject) must be non-empty, the response scope must be non-empty, and the response may contain at most one audience. If any gate fails, the access-token response and any otherwise eligible ID Token still succeed, the refresh token is omitted, and `custom_grant.refresh_dropped` records the drop reason. An empty scope therefore drops only the refresh token. Implemented in `internal/tokenendpoint/customgrant.go`, with token-exchange carrying the same policy shape through `TokenExchangeDecision.IssueRefreshToken`.

The handler, not a grant record, vouches for the subject of a generic custom grant's credentials. `Provider.RevokeSubject` therefore leaves them live until they expire or are revoked individually, and pairwise `/userinfo` answers `invalid_token` for them, unless the handler records a grant. Revoking them when an account is removed is the handler's job. Token exchange differs: its credentials live under the `subject_token`'s grant, so revoking that grant revokes them, and a refresh token obtained through exchange stops rotating once the subject is deleted.
:::

<a class="faq-anchor" id="dj-29"></a>

## 29. Device-code revocation — audit hook or library-owned cascade?

**Spec:** RFC 8628 defines the device authorization state machine but does not spell out what should happen to access tokens already issued from a device authorization when the user later removes that device. RFC 7009 gives the AS a revocation endpoint, but device unenrolment is an embedder-owned UX action rather than a standard wire request.

**Conflict:** If revocation only flips the device-code row to denied, future polls stop but already-issued access tokens remain usable until `exp`. If every embedder must subscribe to an audit event and run `RevokeByGrant` itself, the security posture depends on remembering out-of-band glue code in each deployment.

::: tip Decision
**The public helper owns the cascade.** `devicecodekit.Revoke` first denies the device-code row. It then recomputes the grant identity the device flow allocated for it, a one-way derivation of the device-code ID so the device code itself is never republished, and retires what was issued under that grant: JWT access tokens through `Deps.RevocationStrategy`, opaque access tokens when `Deps.OpaqueAccessTokens` is set, and refresh-token chains when `Deps.RefreshTokens` is set. When `Deps.Grants` is set it deletes the consent record last, after the cascade completed, so that consent no longer satisfies a later authorization request. Every class is attempted even if an earlier one fails. A partial failure returns a joined error and records `cascade_complete=false`, and repeating the call finishes the job.

A substore left nil is skipped. JWT-only deployments, and deployments that drive revocation out of band, still get the denied row and the audit event, and the helper does not pretend the skipped cascade happened. `device_code.revoked` carries one extra per attempted class (`revoked_access_tokens`, `grant_tombstone_written`, `revoked_opaque_access_tokens`, `refresh_token_cascade_complete`, `grant_record_deleted`) plus `cascade_complete`, so operators can alert on a cascade that fell short. Implemented in `op/devicecodekit.Revoke`.
:::

<a class="faq-anchor" id="dj-30"></a>

## 30. Cookie keys — always required, or required only for browser authorization?

**Spec:** OIDC Core and OAuth 2.0 define the authorization and token protocols, but they do not mandate that an OP use browser cookies at all. Cookie encryption is an implementation detail of this library's interaction/session binding.

**Conflict:** Two implementation postures are plausible:

- **Always require cookie keys** — simpler documentation and fewer branches, but a `client_credentials`-only OP or other no-browser deployment must configure a secret it will never use.
- **Require cookie keys only when browser authorization is enabled** — more precise and friendlier to machine-to-machine deployments, but the option layer must know which grants need encrypted cookies before any handler is mounted.

::: tip Decision
`WithIssuer`, `WithStore`, and `WithKeyset` are unconditional construction requirements. `WithCookieKeys` is required when the enabled grant set contains `authorization_code`, which is true for the default grant set. The authorization-code flow uses encrypted session / CSRF cookies to bind browser interaction state; `client_credentials`-only deployments that explicitly remove `authorization_code` can boot without cookie keys.

The rule is centralised in `validateCookieKeysRequired`, so future grants that need authorize-endpoint cookies can opt into the same check without changing handler code. Individual keys must still be exactly 32 bytes, matching AES-256-GCM. Implemented in `op/options_validate.go`; documented in [Required options](/getting-started/required-options).
:::

<a class="faq-anchor" id="dj-31"></a>

## 31. Grant Management — draft surface, explicit opt-in

**Spec:** OAuth 2.0 Grant Management is still an IETF draft. It defines stable `grant_id` values plus `create`, `replace`, `merge`, `query`, and `revoke` actions, but the wire shape may still change before publication.

**Conflict:** A long-lived consent OP benefits from naming grants and letting clients query or revoke them later. Enabling a draft feature by default, however, would expose a moving wire contract to every deployment and make the discovery document advertise semantics the operator may not be ready to support.

::: tip Decision
Grant Management is **off by default and explicitly marked experimental**. `op.WithGrantManagement(actions, actionRequired)` must name the exact action set the OP accepts; the same set is advertised in discovery and enforced at PAR / authorize-time (`create` / `replace` / `merge`) and endpoint-time (`query` / `revoke`). Unknown actions, duplicate actions, an empty action set, or an action/`grant_id` mismatch fail at construction or request validation.

When enabled, token responses carry `grant_id` and the `/grant_management` query / revoke endpoint is mounted. Query or revoke returns `404` for a confirmed missing or foreign grant, but a store error that leaves existence uncertain returns `500 server_error` without attempting a cascade. A cascade failure also returns `500`, emits the failure audit event, and leaves the grant retryable/queryable; a final delete racing with another successful delete is the idempotent `204` case. The draft remains isolated behind this option so a future wire-incompatible draft bump can be handled as an explicit migration rather than an accidental default change. Implemented in `op/grant_management.go`, `internal/parendpoint`, `internal/authorizeendpoint`, `internal/grantmgmtendpoint`, and `internal/tokenendpoint`.
:::

<a class="faq-anchor" id="dj-32"></a>

## 32. Per-authorization state — copied onto the credential, not read from the grant

**Spec:** OIDC Core 1.0 defines `auth_time`, `acr` and `amr` as properties of the authentication event behind an ID Token, and scopes a `claims` request (§5.5) to the authorization request that carried it. RFC 9396 ties `authorization_details` to what the resource owner granted in that request.

**Conflict:** The library keeps one `store.Grant` per (subject, client) pair and reuses it across authorizations, because it carries the consent. Reading `auth_time`, claims or details from that shared record when a credential is used lets a later authorization rewrite what an earlier one reports. A code redeemed after a second login by the same user would show the second login in its ID Token, release the claims the second request asked for, and pick up `authorization_details` it was never granted.

::: tip Decision
**The credential carries the state of the authorization that issued it.** `store.AuthorizationCode`, `store.RefreshToken` and `store.OpaqueAccessToken` hold `AuthTime`, `ACR`, `AMR`, `AuthorizationDetails` and the claims request. A refresh rotation copies them forward, so the ID Token, access token and introspection response of a chain describe its own authorization. A Grant Management `replace` still withdraws details from live tokens; nothing a later authorization adds reaches them. An authorization served silently without a `claims` parameter releases only what its own request asked for, never what an earlier request on the same grant asked for.

JWT access tokens issued from a code or its refresh chain also carry a `userinfo_claims` private claim: the `userinfo` member of the claims request, or `{}` when it requested none. `/userinfo` releases claims from it; resource servers should ignore it. The name is reserved, so a custom grant cannot set it through its extra claims.

`AuthorizationRecorded` marks a row that carries the state. A row without the marker, such as one written by a store that does not persist these fields, falls back to the grant, so a bring-your-own store keeps working with the shared-grant behaviour until it persists them. Implemented in `internal/tokenendpoint`, `internal/tokens` and `op/store`.
:::

<a class="faq-anchor" id="dj-33"></a>

## 33. Step-up rules on a reused session

**Spec:** OIDC Core 1.0 §3.1.2.1 defines `prompt` and `max_age`, and RFC 9470 defines step-up through `acr_values`. Neither says how an OP's own policy rules interact with single sign-on, where the user already holds a session.

**Conflict:** A `LoginFlow` rule such as `RuleClient` or `RuleScope` guards a client or scope behind an extra factor. If rules are evaluated only while the factor chain runs, a session established with the primary factor alone reaches the guarded client or scope through a cached grant that covers the request, or through the first-party consent skip, without ever meeting the rule.

::: tip Decision
**Rules and the `Decider` are evaluated before minting from a session**, as if the chain had just completed `Primary`. When one demands a step, `/auth` runs the chain from the session's subject instead of minting, and `prompt=none` answers `interaction_required`. Factors from the session's earlier login do not count toward a rule, matching the consent-screen path; risk-driven rules still fire only inside the chain.

After a step-up, the issued tokens keep the session's `acr`, `amr` and `auth_time` rather than reporting only the step-up factors. Risk assessors see the session's methods in `AMRSoFar`, and step-up factors are audited as `mfa.*` events rather than `login.*`. The evaluation fails closed: a panicking `Rule.When` counts as a match, and a `Decider` that panics, returns nil, a nil pointer or an unknown shape denies. A factor whose `interaction.Result` names a subject other than the one an earlier factor or the account chooser bound ends the chain with a server error, and the same check covers a factor that completes in `Begin` without a prompt. Implemented in `internal/authorizeendpoint`, `op/rule.go` and `op/decider.go`.
:::
