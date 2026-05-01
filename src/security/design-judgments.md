---
title: Design judgments
description: Where the library's behaviour is the result of a deliberate read of conflicting RFCs — what was chosen, what was rejected, and why.
---

# Design judgments

Every spec the OP touches is a layered set of MUSTs, SHOULDs, and "the
authorization server may". Several places need an explicit reading
because the literature disagrees with itself, or because a literal
reading collides with another spec. This page lists those calls.

::: tip How to read this page
Each block follows the same shape: **the spec text**, **the conflict**,
and **what this library does**. The decision sits in the green callout;
the prose above it is the spec text and the conflict. Look at the
cited package paths under `op/` and `internal/` for the implementation
details.
:::

## Quick index

| # | Theme | Decision in one line |
|---|---|---|
| [#1](#dj-1) | PAR `request_uri` one-time-use timing | Find at `/authorize`, Consume at code emission |
| [#2](#dj-2) | Refresh-token rotation grace window | 60 s grace by default; chain reuse retires the chain |
| [#3](#dj-3) | `offline_access` — gate or UX signal | **Gate** (`openid` + `offline_access` + `refresh_token` all required) |
| [#4](#dj-4) | RFC 8252 §7.3 loopback redirect port handling | Default exact-match; opt-in per client allows port mismatch on `127.0.0.1`/`[::1]` only |
| [#5](#dj-5) | Session Management 1.0 / Front-Channel Logout 1.0 | **Not implemented**; superseded by Back-Channel Logout 1.0 |
| [#6](#dj-6) | JAR `request=` replay defence | OP-side `jti` cache, evicted at `exp`; default-on with JAR |
| [#7](#dj-7) | Profile constraint resolution | Disjunction via `*config` helpers; handlers see only `bool` |
| [#8](#dj-8) | ACR / AAL — internal vs wire vocabulary | Two-layer model (internal AAL ladder + wire `acr` mapping) |
| [#9](#dj-9) | Issuer identifier validation | `op.WithIssuer` rejects trailing slash, case mismatch, default port, fragment, … |
| [#10](#dj-10) | Sessions in or out of the transactional cluster | Separate substore; volatile stores OK; BCL is best-effort under volatility |
| [#11](#dj-11) | JOSE `alg=none` / HMAC family lockout | Closed enum in `internal/jose.Algorithm`; `none`/`HS*` not in the type |
| [#12](#dj-12) | Discovery narrowing on profile | Built once at `op.New`; golden test catches drift |
| [#13](#dj-13) | `client_assertion` audience — FAPI 2.0 vs OIDC Core | Accept both shapes via `Audience` + `AuxAudiences` |
| [#14](#dj-14) | PKCE — `plain` vs `S256` | `S256`-only across all profiles; `plain` rejected by policy |
| [#15](#dj-15) | DPoP refresh-token binding policy | Bind for public clients, leave unbound for confidential |
| [#16](#dj-16) | Introspection — same-client gate + inactive shape | Cross-client lookup collapses to the uniform `{"active": false}` |
| [#17](#dj-17) | `/end_session` access-token cascade scope | Cascade by default when registry/opaque substores are wired |
| [#18](#dj-18) | Access-token format default | JWT default; opaque opt-in; per-RFC 8707-resource override |
| [#19](#dj-19) | JWT access-token revocation strategy default | Grant-tombstone default — zero rows on issuance, `O(revoked grants)` at the rest; FAPI rejects "no revocation" |
| [#20](#dj-20) | DCR `client_secret` storage and disclosure | Hash-only at rest; plaintext returned only on `POST /register` and on PUT-driven rotation; `GET /register/{id}` never re-emits it |
| [#21](#dj-21) | RFC 7592 PUT omission semantics | Omitted defaulted fields reset to server defaults; omitted optional metadata becomes empty; deletion semantics not implemented |
| [#22](#dj-22) | `sector_identifier_uri` fetch bounds and native loopback | Fetched once at registration with a 5 s / 5 MiB cap; native `application_type` accepts all three loopback hosts unconditionally |

<a class="faq-anchor" id="dj-1"></a>

## 1. PAR `request_uri` — when does "one-time use" apply?

**Spec:** RFC 9126 §2.2 says the `request_uri` "MUST be one-time use only".

**Conflict:** A literal "consume on first sight" interpretation breaks
multi-step interaction (consent → MFA → locale change can re-redirect
to the same `/authorize?request_uri=…` before the original interaction
finishes). FAPI 2.0 OFCS confirms this with two separate negative
tests — one that requires the OP to *accept* a re-visit before
authentication completes, and one that requires it to *reject* the
re-visit afterwards.

::: tip Decision
`request_uri` is **looked up at `/authorize` entry** (`PARs.Find`)
and **consumed at authorization-code issuance** (`PARs.Consume`).
Re-visits during interaction succeed; re-visits after the code is
emitted are rejected with `invalid_request_uri`. The matching OFCS
module `fapi2-…-par-attempt-reuse-request_uri` exercises the
post-emission rejection path; see <a class="doc-ref" href="/compliance/ofcs">OFCS conformance</a>.
:::

<a class="faq-anchor" id="dj-2"></a>

## 2. Refresh-token rotation grace window

**Spec:**

> **RFC 9700 §2.2.2** the previous refresh token MAY be invalidated
> but MUST remain valid until the new refresh token is delivered to
> the client successfully.

**Conflict:** A strict "single-use, no grace" reading kills any client
where the token rotation network round-trip is interrupted (mobile
backgrounding, dropped TCP, retried HTTP/2 stream). OFCS asserts the
grace path with a 30-second wait between rotation and re-exchange of
the previous token.

::: tip Decision
Rotated refresh tokens stay accepted for `GraceTTL` (default 60 s)
when the chain has not been revoked for reuse-detection. Within the
grace window, presenting the old refresh token returns a fresh access
token but does **not** rotate the chain again. Reuse *after* the
grace window — or any reuse on a chain that was already revoked —
invalidates the entire chain (RFC 9700 §4.14). Implemented in
`internal/grants/refresh.Exchanger.tryGrace`;
`store.RefreshToken.Revoked` distinguishes "consumed by rotation" from
"retired by chain compromise". Configurable via
`op.WithRefreshGracePeriod`.
:::

<a class="faq-anchor" id="dj-3"></a>

## 3. `offline_access` — gate for refresh, or just a UX signal?

**Spec:** OIDC Core 1.0 §11 simultaneously asserts:

> **OIDC Core 1.0 §11 (a)** the use of Refresh Tokens is not exclusive
> to the Offline Access use case.

> **OIDC Core 1.0 §11 (b)** when `offline_access` is requested, the
> Authorization Server MUST ensure the prompt parameter contains
> `consent`.

**Conflict:** Reading (a) suggests refresh tokens are issued whenever
the client is granted the `refresh_token` grant; the scope only
governs consent UX. Reading (b) suggests `offline_access` is the
canonical scope for refresh issuance and the consent gate is
secondary. Other OPs split — some treat `offline_access` as
mandatory, others as a UX-only marker.

::: tip Decision
**`offline_access` is the gate.** Refresh tokens are issued only when
**all three** hold: (i) the granted scope contains `openid`, (ii) the
granted scope contains `offline_access`, and (iii) the client's
`GrantTypes` includes `refresh_token`. The narrower interpretation
matches reading (b) and ensures the audit trail and the user-facing
consent prompt agree on what offline reach the user authorised.
`op.WithRefreshTokenOfflineTTL` continues to let operators give
offline chains a longer rotation lifetime. The defence-in-depth
`op.WithStrictOfflineAccess()` option additionally rejects refresh
**exchange** for tokens whose originating grant did not carry
`offline_access` — useful as a transition guard when upgrading from
older library versions where the issuance gate was laxer.
:::

<a class="faq-anchor" id="dj-4"></a>

## 4. RFC 8252 §7.3 loopback redirect — exact-match or port wildcarding?

**Spec:** RFC 6749 §3.1.2.3 + OAuth 2.1 mandate byte-exact
`redirect_uri` match. RFC 8252 §7.3 says native apps on loopback
"MUST be allowed any port at request time".

**Conflict:** The two readings disagree by construction. A CLI tool
cannot pre-register every ephemeral OS-assigned port; a strict
exact-match policy breaks the canonical native-app flow.

::: tip Decision
Default is exact-match (the strict OAuth 2.1 reading). RFC 8252 §7.3
relaxation is **opt-in per client** via the registered `redirect_uris`
listing a loopback URI; the OP then ignores port mismatch when scheme
is `http`, host is `127.0.0.1` or `::1`, and path / query / fragment
exact-match. `localhost` is **not** accepted (DNS rebinding surface).
HTTPS loopback is not relaxed (no ACME on `127.0.0.1`).
:::

<a class="faq-anchor" id="dj-5"></a>

## 5. Session Management 1.0 / Front-Channel Logout 1.0

**Spec:** Both are published OpenID Connect specs, separate from Core.

**Conflict:** Both rely on a third-party iframe being able to read its
own cookie from an embedded context. Modern browser defaults (Safari
ITP since 2017, Firefox ETP since 2019, Chrome `SameSite=Lax` default
since 2020, third-party-cookie phase-out across 2024–2025) have
removed that capability for mainstream browsers.

::: tip Decision
**Not implemented.** The discovery document does **not** advertise
`frontchannel_logout_supported` or `check_session_iframe`. The
library ships RP-Initiated Logout 1.0 + Back-Channel Logout 1.0
(server-to-server `POST` of a signed `logout_token`) as the modern
substitutes. Embedders that need iframe-based session signalling
should pick a different library — this is a load-bearing scope
decision, not a backlog item.
:::

<a class="faq-anchor" id="dj-6"></a>

## 6. JAR `request=` replay — opt-in `jti` cache?

**Spec:** RFC 9101 §10.8 RECOMMENDS rejecting replayed request objects
within their `exp` window. It does not mandate a registry.

**Conflict:** A naive "verify and accept" honours the spec but allows
a one-shot intercepted request object to be replayed against a fresh
`/authorize` until `exp`. FAPI 2.0 Message Signing assumes the OP
implements replay defence even though the base spec only says SHOULD.

::: tip Decision
OP-side `jti` cache, scoped to the JAR window, evicted on `exp`.
Active by default whenever JAR is enabled. The cache uses the same
`Sessions` storage as the rest of the OP's volatile state, so
operators that already plan a Redis volatile slice get replay defence
"for free".
:::

<a class="faq-anchor" id="dj-7"></a>

## 7. Profile constraint resolution — disjunction, not switch

**Spec:** No spec text. The challenge is internal: when an OP is
configured with `WithProfile(FAPI2Baseline)` AND
`WithProfile(FAPI2MessageSigning)`, the OR of the two profiles' rules
must apply uniformly across handlers.

**Conflict:** Open-coded `switch profile` blocks in every handler
silently diverge. A future profile (CIBA, iGov) added without
revisiting every handler fails open.

::: tip Decision
**Profile-conditional security gates resolved through `*config`
helpers.** Each gate (e.g. `requireSenderConstrainedTokens`,
`requirePAR`, `requireSignedRequestObject`) loops over the active
profile set and returns a single `bool`. Handlers see only the
boolean. Build-time validators in `op/profile/constraints.go` ensure
that whatever the helper says is true is actually wired
(`RequiredFeatures`, `RequiredAnyOf`), so the runtime path skips
defensive nil-checks.
:::

<a class="faq-anchor" id="dj-8"></a>

## 8. ACR / AAL mapping — internal vs wire vocabulary

**Spec:** OIDC Core 1.0 emits `acr` claims; RFC 6711 / 8485 govern the
identifier registry; RFC 9470 standardises step-up via
`acr_values` + `WWW-Authenticate: error="insufficient_user_authentication"`.

**Conflict:** Internal AAL ("which factors did the user complete?") is
not the same vocabulary as the OIDC `acr` echoed on the wire.
Mapping them naively (e.g. `acr=urn:authn:aal=2` literal) ties the
wire vocabulary to internal taxonomy, which embedders cannot evolve
without breaking RPs.

::: tip Decision
A two-layer model — `op/aal.go` for the internal AAL ladder,
`op/acr.go` for the wire-side `acr` mapping. `RuleACR` (in
`op/rule.go`) implements RFC 9470 step-up: an RP that asks for a
higher `acr_values` than the session currently provides receives the
`insufficient_user_authentication` challenge with the next step.
:::

<a class="faq-anchor" id="dj-9"></a>

## 9. Issuer identifier validation

**Spec:** RFC 9207 says the OP MUST emit `iss` on authorization
responses. OIDC Discovery 1.0 §3 implies the issuer is the OP's
canonical identifier.

**Conflict:** Real deployments commonly run with two URIs that look
equivalent but differ by trailing slash, scheme case, or default port
inclusion. RFC 9207 mix-up defence depends on byte-exact `iss`
comparison; if the OP normalises the canonical form differently to
the RP, mix-up defence fails.

::: tip Decision
`op.WithIssuer` rejects URIs with trailing slash, scheme in mixed
case, default port present, fragment, query, or path containing `..`.
The same canonical form is reused for `iss` in every emitted
artifact. `op.New` returns a build-time error rather than booting on
a non-canonical issuer.
:::

<a class="faq-anchor" id="dj-10"></a>

## 10. Sessions — in or out of the transactional cluster?

**Spec:** None. This is an architecture decision.

**Conflict:** Putting sessions in the same SQL cluster as auth codes /
refresh tokens / clients (the transactional store) couples session
mutation latency to the transactional path. Putting them on Redis
loses durability — but session loss is recoverable (the user logs in
again), whereas authorization-code loss is not (the RP loop breaks).

::: tip Decision
Sessions are routed through a separate substore
(`store.SessionStore`) that the embedder may serve from a volatile
store (Redis / Memcached). Back-channel logout delivery is best-effort
under volatile sessions — "we lost a session, the RP doesn't get
notified" is an acceptable failure mode for a Redis sliced deployment,
and the `op.AuditBCLNoSessionsForSubject` event together with the
embedder-configured `op.SessionDurabilityPosture` lets dashboards
distinguish the two cases.
:::

<a class="faq-anchor" id="dj-11"></a>

## 11. JOSE `alg=none` and the HMAC family

**Spec:** RFC 7518 enumerates `none` and `HS256/384/512`. RFC 8725
("JWT BCP") §3.1 says implementations MUST NOT trust JWTs based on
`none`, and §3.2 warns about HMAC-with-public-key alg confusion.

**Conflict:** The underlying JOSE library accepts the full registry by
default. Adding a runtime check is fragile — a future code path that
imports the JOSE library directly bypasses it.

::: tip Decision
`internal/jose.Algorithm` is a closed enum: `RS256`, `PS256`, `ES256`,
`EdDSA`. `none` and `HS*` are **not in the type at all**. `depguard`
(lint) forbids importing the underlying JOSE package outside
`internal/jose/`, so no future code path can reach the broader
registry. Algorithm-confusion is closed structurally.
:::

<a class="faq-anchor" id="dj-12"></a>

## 12. Discovery document — narrowing on profile

**Spec:** OIDC Discovery 1.0 + RFC 8414 enumerate the metadata fields.
FAPI 2.0 §3.1.3 narrows
`token_endpoint_auth_methods_supported`. RFC 9101 §10.1 demands
`request_object_signing_alg_values_supported` when JAR is on.

**Conflict:** The `_supported` lists are produced by feature
activation, then potentially narrowed by the active profile, then
copied into the introspection / revocation auth-method lists. Doing
this in handlers re-introduces drift; doing it at construction time
forces a single point that must agree.

::: tip Decision
Discovery is built once at `op.New` time
(`internal/discovery/build.go`), profiles narrow the auth-method list
via `ProfileAllowedAuthMethods`, and the introspection / revocation
endpoints copy the post-narrowed list. A discovery golden test in the
repository asserts the document shape per profile so silent drift is
caught at PR time.
:::

<a class="faq-anchor" id="dj-13"></a>

## 13. `client_assertion` audience — FAPI 2.0 vs OIDC Core

**Spec:** RFC 7523 §3 says the JWT bearer assertion's `aud` MUST be
"a value identifying the authorization server" — without pinning
which identifier. OIDC Core 1.0 §9 (private_key_jwt) reads that as
the OP's token endpoint URL. FAPI 2.0 §5.2.2 reads it as the issuer
URL.

**Conflict:** A single OP that runs OIDC Core *and* a FAPI 2.0 profile
simultaneously needs to authenticate clients sending either shape; a
strict "match exactly one" verifier rejects half the fleet on every
request. RFC 7523 itself is wide enough to admit both, so the
disagreement is between the two profile specs that wrap it.

::: tip Decision
The verifier accepts a primary `Audience` (OIDC Core: token endpoint
URL) plus a list of `AuxAudiences` (FAPI 2.0: issuer URL). `op.New`
populates `AuxAudiences` with the issuer for every OP, so a client
using the FAPI 2.0 shape authenticates without any per-deployment
knob. Implemented in `internal/clientauth/assertion.go`; `jti`
consumption runs once across the merged path so neither dialect can
sneak past replay defence.
:::

<a class="faq-anchor" id="dj-14"></a>

## 14. PKCE — `S256`-only, `plain` rejected by policy

**Spec:** RFC 7636 §4.2 lists two transformations: `plain` and
`S256`. §4.4.1 says clients SHOULD use `S256`, with `plain` retained
for environments that cannot compute SHA-256. OAuth 2.1
(`draft-ietf-oauth-v2-1` §4.1.1) and FAPI 2.0 §3.1.4 forbid `plain`
outright.

**Conflict:** A literal RFC 7636 reading lets the OP accept whichever
method the client requests. A strict reading of OAuth 2.1 / FAPI 2.0
requires rejection. A "per-profile gate" architecture would let the
same client succeed against an OIDC-Core OP and fail against the
same OP under a FAPI 2.0 profile — the kind of silent profile drift
the rest of the codebase works hard to avoid.

::: tip Decision
The OP rejects `plain` **regardless of profile**. `internal/pkce.Method`
is the singleton constant `"S256"`; `ValidateChallenge` returns
`ErrChallengeMethodUnsupported` for any other value, and
`code_challenge_methods_supported` advertises only `S256` in
discovery. Reasoning: `plain` provides no PKCE protection (the
verifier IS the challenge), the SHOULD reading from RFC 7636 has aged
out under OAuth 2.1, and a uniform stance keeps client behaviour
consistent across profiles.
:::

<a class="faq-anchor" id="dj-15"></a>

## 15. DPoP refresh-token binding — public vs confidential split

**Spec:** RFC 9449 §5.0 / §5.4 say the AS MAY bind refresh tokens to
the DPoP key supplied at the token endpoint. §5.4 adds that once
bound, the binding MUST persist across rotations.

**Conflict:** "MAY bind" is genuinely two-handed. **Always-bind** locks
confidential clients to a single DPoP key for the chain's lifetime,
which clashes with FAPI 2.0 OFCS plans that explicitly rotate the
DPoP key across refresh requests. **Never-bind** leaves public-client
refresh tokens (SPAs, native apps) as raw bearer secrets — exactly
the threat model RFC 9449 §1 cites as motivating sender constraints.

::: tip Decision
**Bind for public clients, leave unbound for confidential.** A client
whose `TokenEndpointAuthMethod` is `"none"` (the public-client signal)
gets its refresh chain DPoP-bound on first issue, and the binding
propagates through every rotation per §5.4. Confidential clients
(`private_key_jwt`, `client_secret_*`, `tls_client_auth`) leave the
refresh chain unbound, free to rotate DPoP keys per request — but
the access tokens minted on each refresh are still bound to whatever
key was presented, so any holder of those access tokens still needs
the matching private key. Implemented in
`internal/tokenendpoint.refreshDPoPJKT`; once a chain is bound, the
§5.4 persistence rule kicks in and prevents an opportunistic upgrade
from locking later key rotation.
:::

<a class="faq-anchor" id="dj-16"></a>

## 16. Introspection — same-client gate + uniform inactive shape

**Spec:** RFC 7662 §2.2 says introspection responses MUST carry
`"active": false` for tokens the AS does not consider active, and
MAY include only the `active` member in that case. §2.1 lets the AS
"differently respond depending on the audience" — i.e. permits
cross-client refusal but does not mandate it.

**Conflict:** Three readings circulate:
1. **Liberal** — let any authenticated client introspect any token the
   AS recognises, returning `"active": true` even when the calling
   client is not the issuer.
2. **Strict-distinguishable** — refuse cross-client introspection but
   signal it (e.g. HTTP 403 or `error: not_authorized`).
3. **Conservative** — refuse cross-client introspection and surface
   the same `{"active": false}` shape used for unknown / expired /
   revoked tokens.

Reading 2 leaks token-existence information through the response
shape: a curious client can probe whether a guessed token belongs to
*some* live grant.

::: tip Decision
**Reading 3.** A token whose `client_id` does not match the calling
client returns `{"active": false}` — structurally indistinguishable
from "unknown", "expired", and "revoked". The same uniform inactive
shape applies to JWT, opaque-AT, and refresh-token branches.
Implemented in `internal/introspectendpoint.resolveJWT` /
`resolveOpaque` / `resolveOpaqueAccessToken`; every miss path
returns `inactive()` so timing and shape both stay uniform.
:::

<a class="faq-anchor" id="dj-17"></a>

## 17. `/end_session` — access-token cascade scope

**Spec:** OIDC RP-Initiated Logout 1.0 §6:

> **OIDC RP-Initiated Logout 1.0 §6** the OP MAY also revoke any
> active sessions, refresh tokens, and access tokens once the user
> signs out.

Back-Channel Logout 1.0 §2.3 governs RP-side fan-out but is silent
on AT revocation reach.

**Conflict:** A literal "MAY" admits postures from "delete the cookie
and walk away" to "revoke every grant the subject holds". The blast
radius differs:

- **Cookie-only** — outstanding access tokens remain valid until
  their `exp`. JWT tokens that never round-trip through `/userinfo`
  cannot be retracted at all.
- **Registry flip + opaque tombstone** — every OP-served boundary
  (`/userinfo`, `/introspect`) sees the token as inactive
  immediately, and resource servers that introspect or hit
  `/userinfo` get the same view.
- **Opaque tokens** go further — every RS sees inactive on the very
  next bearer-presentation, because the wire form has no offline
  verification path.

::: tip Decision
**Cascade by default.** When the embedder wires the `Grants` and
`AccessTokens` substores, `/end_session` enumerates every grant the
subject holds and revokes the per-grant access-token shadow rows;
the matching opaque-AT records flip to revoked through the same
cascade. Embedders that explicitly want the cookie-only posture
leave `Grants` / `AccessTokens` nil — the cascade short-circuits
silently and ATs expire naturally. The cascade-reach gap between
JWT and opaque tokens (JWT → OP-served boundaries only, opaque →
every RS via introspection) is documented separately on the
<a class="doc-ref" href="/concepts/access-token-format">access-token-format</a>
page; the choice of which form to issue is the lever embedders pull
when this gap matters.
:::

<a class="faq-anchor" id="dj-18"></a>

## 18. Access-token format — default JWT, opaque opt-in, per-audience override

**Spec:** RFC 9068 standardises the JWT-shaped OAuth 2.0 access
token. RFC 6749 itself treats the access token as an opaque bearer
string. RFC 7662 introspection is optional. RFC 8707 lets a single
client request tokens for multiple resources in one flow.

**Conflict:** Two opposite defaults are defensible:

- **Default JWT** — every RS validates locally, no `/introspect`
  round-trip, scales horizontally; but `/end_session` cannot retract
  a JWT that never sees the OP again until `exp`.
- **Default opaque** — every RS hits the OP, latency-coupled with
  the OP path; but immediate revocation reach.

A single hard-coded default forces every embedder onto one
trade-off. Per-audience selection (RFC 8707) lets a single OP issue
different forms to different RSes inside the same authorization.

::: tip Decision
**Default is `op.AccessTokenFormatJWT`** — matches the typical
horizontal-scale RS layout and keeps the wire shape compatible with
off-the-shelf JWT verifiers. `op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)`
flips the global default;
`op.WithAccessTokenFormatPerAudience(map[string]op.AccessTokenFormat{...})`
selects per RFC 8707 resource indicator so high-revocation-reach
audiences (admin APIs, payment APIs) can take opaque while
general-purpose APIs keep JWT. The full trade-off (load
concentration, header size, cascade reach, storage shape) lives on
the <a class="doc-ref" href="/concepts/access-token-format">access-token-format</a>
page; this entry exists so the *decision* is recorded alongside the
other deliberate spec reads.
:::

<a class="faq-anchor" id="dj-19"></a>

## 19. JWT access-token revocation strategy — grant tombstone over per-`jti` registry

**Spec:** RFC 6749 §4.1.2 says the AS "SHOULD revoke (when possible)"
on code re-use. RFC 6819 §5.2.1.1 expects a server-side reuse-detection
invariant. RFC 7009 §2.2 lets revocation be unsupported for
self-contained tokens. FAPI 2.0 SP §5.3.2.2 mandates server-side
revocation.

**Conflict:** The literal "shadow every `jti` so revocation can flip a
row" model satisfies every spec but loads `O(issuance_rate × AT_TTL)`
rows on the transactional store, and the cascade path on a logged-out
user with N outstanding ATs becomes N row updates. The opposite
extreme — "no revocation, JWT lives until `exp`" — clears the
issuance hot path but fails FAPI 2.0 SP §5.3.2.2 outright.

The middle reading is to keep the JWT self-contained but bind it to
a server-side **grant** rather than to a per-token row. One write per
revoked grant fans out to every AT under that grant; issuance writes
nothing.

::: tip Decision
**Default is `op.RevocationStrategyGrantTombstone`.** Every JWT AT
carries a `gid` private claim (the OP-side GrantID, RFC 7519 §4.3,
omitempty). Verification at OP-served boundaries
(`/userinfo`, `/introspect`) consults a small per-grant tombstone
table keyed on `gid`. Cascades (logout, code-replay, refresh
compromise) write one tombstone row per revoked grant; single-AT
`/revocation` writes one denylist row per revoked `jti`. The default
issuance path writes **zero** rows on `/token`. Steady-state row
count is `O(revoked grants + revoked JTIs)`, not `O(issued)`.

Embedders who need a per-AT audit trail flip
`op.WithAccessTokenRevocationStrategy(op.RevocationStrategyJTIRegistry)`,
which restores the one-row-per-issuance shadow in
`store.AccessTokenRegistry`. Both strategies are FAPI 2.0 SP §5.3.2.2
conformant. `op.RevocationStrategyNone` is a third option for
non-FAPI deployments that explicitly accept the RFC 6749 §4.1.2
"SHOULD" wiggle; `op.New` rejects it under any FAPI profile.

The opaque AT path
(`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)`) is unaffected
by this enum: opaque verification needs the row, so storage is
intrinsically per-token. Implemented in `op/access_token_revocation.go`,
`internal/tokens` (gid claim), `op/store/grant_revocation.go`, and the
backend adapters.
:::

<a class="faq-anchor" id="dj-20"></a>

## 20. DCR `client_secret` storage and disclosure

**Spec:** RFC 7591 §3.2.1 marks `client_secret` as OPTIONAL in the
registration response. RFC 7592 §2.1 (read) and §2.2 (update) both
allow but do not require the OP to re-emit `client_secret` in the
response body.

**Conflict:** A "store the cleartext so we can re-emit it on every
GET" reading is the simplest implementation and matches what some
historic OPs do, but it places the cleartext in a recoverable form
forever and turns the registration record into the most sensitive
row in the database. A "hash on POST and never re-emit" reading
matches how every other credential in the OP is stored and removes
the recoverable surface entirely, at the cost of asymmetry between
the POST response (plaintext available once) and the GET response
(plaintext gone forever).

::: tip Decision
**Hash-only at rest. Plaintext returned exactly once on
`POST /register`, and again only on `PUT /register/{client_id}` when
either (a) `token_endpoint_auth_method` is upgraded from `none` to a
confidential method, or (b) the embedder explicitly requests
rotation. `GET /register/{client_id}` never re-emits
`client_secret`.** Embedders that need recoverable access to the
plaintext keep their own copy at the moment of the original POST
response; the OP refuses to be the system of record for the
cleartext. Implemented in `internal/registrationendpoint/manage.go`
and `internal/registrationendpoint/register.go`. Storage is governed
by `op/store/client.go` (`SecretHash`-only), so the same posture
applies to every `store.ClientStore` adapter.
:::

<a class="faq-anchor" id="dj-21"></a>

## 21. RFC 7592 PUT omission semantics

**Spec:** RFC 7592 §2.2 reads in two parts:

> **RFC 7592 §2.2 (sentence 1)** the values of the metadata returned
> in the response MUST replace, not augment, the values previously
> associated with this client.

> **RFC 7592 §2.2 (sentence 2)** the server MAY ignore any null or
> empty value in the request just as any other value.

**Conflict:** A strict reading of the first sentence makes a missing
`grant_types` field on PUT mean "delete `grant_types`", which leaves
the client with no grant capability and breaks every subsequent
`/token` request. The MAY clause in the second sentence is the
escape hatch every reference OP uses to avoid that footgun, but the
ecosystem has not converged on a single replacement policy.

::: tip Decision
**Omitted *defaulted* fields reset to the server-side default.
Omitted *optional* fields become empty.** The defaulted set is
`grant_types`, `response_types`, `token_endpoint_auth_method`,
`application_type`, `subject_type`, and
`id_token_signed_response_alg`; on PUT they fall back to the OP's
documented defaults rather than vanishing from the record. Optional
metadata (`client_uri`, `logo_uri`, `policy_uri`, `tos_uri`,
`contacts`, …) is genuinely cleared when omitted. Server-managed
fields — `registration_access_token`, `registration_client_uri`,
`client_secret_expires_at`, `client_id_issued_at` — are rejected
with `400 invalid_request` if present in the body, and a
`client_secret` value that does not match the authenticated client
is rejected with the same status. The "configured vs defaulted"
sparse persistence model that would let a PUT distinguish "the
client deliberately omitted this" from "the server defaulted this"
is not implemented in v1.0; the on-the-wire behaviour is the same
either way for every defaulted field. Implemented in
`internal/registrationendpoint/manage.go` (`validateManageUpdateRequest`)
and `internal/registrationendpoint/metadata.go`
(`applyMetadataDefaults`).
:::

<a class="faq-anchor" id="dj-22"></a>

## 22. `sector_identifier_uri` fetch bounds and native loopback rules

**Spec:** OIDC Core 1.0 §8.1 makes the `sector_identifier_uri` fetch
and the containment check on the registered `redirect_uris` a MUST:

> **OIDC Core 1.0 §8.1** the values registered in `redirect_uris`
> MUST be included in the elements of the array, or registration
> MUST fail.

The spec fixes neither a timeout nor a body cap. OIDC Registration §2
lists `localhost`, `127.0.0.1`, and `[::1]` as valid loopback hosts
for `application_type=native`. RFC 8252 §8.3 marks `localhost` as
NOT RECOMMENDED in favour of the IP literals, citing DNS rebinding.

**Conflict:** "Fetch with the language default" implicitly means
"hold a goroutine open until the upstream eventually answers", and
the request body is unbounded — both are footguns at registration
time. On `localhost`, OIDC Registration §2 and RFC 8252 §8.3
disagree: the OIDC text accepts it for native, the OAuth text
warns against it. A web client that registers `http://localhost/cb`
is a separate question from a native client that does the same.

::: tip Decision
**Fetch is bounded to a 5 s timeout, a 5 MiB body cap, HTTPS only,
no caching, no later re-fetch.** Failure or containment mismatch
produces `400 invalid_client_metadata`; the cause goes to the audit
log but never to the response body so upstream details (host, TLS
state, partial bytes) do not leak.

For loopback hosts, the registration layer splits on
`application_type`. Web clients (the default) accept `127.0.0.1`
and `[::1]` over `http`; the textual `localhost` is rejected unless
the embedder explicitly opts in via
`op.WithAllowLocalhostLoopback()`. Native clients
(`application_type=native`) accept all three loopback hosts
unconditionally per OIDC Registration §2, plus claimed `https`
redirects and reverse-DNS custom URI schemes (`com.example.app:/cb`)
per RFC 8252 §7.1. Custom schemes that lack a `.` are rejected
because non-reverse-DNS schemes collide across applications. The
authorize-time port wildcard for loopback URIs is governed by a
separate per-client opt-in (#dj-4) and composes with this rule
without overlap. Implemented in
`internal/registrationendpoint/sector_identifier.go` and
`internal/registrationendpoint/metadata.go`
(`validateRedirectURI` / `validateNativeRedirectURIScheme`).
:::
