---
title: Sessions and logout
description: How the OP encodes browser sessions, chooser-group and current-session RP-Initiated Logout, bounded Back-Channel Logout, and the deliberate lack of Front-Channel Logout.
pageClass: pg-concepts-sessions-and-logout
---

# Sessions and logout

A **session** is the OP-side state that says "this browser was authenticated by user X at time T with assurance level A." A small encrypted cookie binds the browser back to that state. **Logout** means killing the state — and, optionally, telling the RPs that depended on it that the user is gone.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2 (`auth_time`, `acr`, `amr`)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [OpenID Connect Front-Channel Logout 1.0](https://openid.net/specs/openid-connect-frontchannel-1_0.html) — referenced for the deliberate non-implementation
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) — `__Host-` cookies, `SameSite`
:::

::: tip Mental model in 30 seconds
- The session lives **on the OP**, not in the cookie.
- The cookie is just an encrypted pointer to the session row.
- "Logout" = delete the row. Optional fan-out tells RPs about it.
- Deleting only the cookie in the browser leaves the row on the OP. Deleting only the row leaves a cookie that points at nothing, so the user's next request finds no session and signs in again.
:::

## How this library encodes the session

The OP keeps a row in `store.SessionStore` with:

| Field | Meaning |
|---|---|
| `ID` | Opaque OP browser-session identifier; used for cookie/session lookup and audit correlation. It is not emitted as a `sid` claim: the Back-Channel Logout Tokens this OP sends carry `sub` only. |
| `Subject` | The OP-internal stable user id. Becomes `sub` in ID Tokens (projected per client when pairwise subjects are enabled). |
| `AuthTime` | When the user authenticated. Copied into the `auth_time` of tokens issued from this session. |
| `ACR` | Authentication Context Class Reference — the assurance level the session satisfies. |
| `AMR` | Authentication Methods References (RFC 8176) — `pwd`, `otp`, `mfa`, `hwk`, … |
| `ChooserGroupID` | Multi-account chooser group. Multiple sessions in one browser share this. |
| `ExpiresAt`, `CreatedAt`, `UpdatedAt` | Lifecycle timestamps. |

The cookie that points at this row is `__Host-oidc_session` (defined in `internal/cookie/profile.go`). Its encrypted payload holds the chooser-group ID, the current session ID, and the time the cookie was written; the session's lifetime is enforced against the stored row, so a replayed cookie cannot extend it. The library uses five cookies in total:

| Cookie | Purpose | Scheme |
|---|---|---|
| `__Host-oidc_session` | Persistent session pointer. | AES-256-GCM AEAD over an opaque payload. `__Host-` prefix forces same-origin only. `SameSite=Lax`; 14-day max age. |
| `__Host-oidc_interaction` | In-flight interaction (login form, MFA challenge) state. | Same AEAD; one-hour TTL. |
| `__Host-oidc_csrf` | Double-submit CSRF token for the interaction form. | HMAC-only (no AEAD). `SameSite=Strict`; browser-session cookie. |
| `__Host-oidc_logout_csrf` | Double-submit CSRF token that carries the `/end_session` confirmation from its GET page to its POST. | HMAC-only (no AEAD). `SameSite=Strict`; five-minute TTL. |
| `__Host-oidc_locale` | Remembers the user's chosen UI locale across interaction pages. | Plain text (not encrypted); one-year TTL. `SameSite=Lax`. |

::: details `__Host-` prefix — what's that?
A cookie name that starts with `__Host-` is, per RFC 6265bis, accepted by browsers only when the cookie also has `Secure`, `Path=/`, and **no** `Domain` attribute — meaning it is bound to exactly the OP's origin. Subdomain compromise can't forge it; a sibling domain can't read it. This library refuses to boot on plain HTTP precisely because the `__Host-` prefix would not survive.
:::

The session row goes through `store.SessionStore` — a substore that the embedder may serve from a volatile backend (Redis など) without violating any library invariant. See [design judgment #10](/security/design-judgments#dj-10) for the trade-off.

## Reusing a session at `/auth`

When a browser arrives at `/auth` with a live session, the OP decides per request whether that session may serve it:

| Request | What happens |
|---|---|
| `prompt=login` | The session is not reused. The user authenticates again in full. |
| `max_age` shorter than the time since the session's `auth_time` | Same: full re-authentication. |
| `acr_values` or an essential `acr` the session's `acr` does not meet | A step-up runs. The issued tokens keep the session's `acr`, `amr`, and `auth_time`, and the step-up factors are audited as `mfa.*` events. |
| A `LoginFlow` rule or the `Decider` demands another step | The chain runs from the session's subject, so `Primary` is not repeated. |
| None of the above | The session serves the request, and tokens carry its `auth_time`, `acr`, and `amr`. |

With `prompt=none`, any row that would need a user interface returns an error instead. Picking a stale or weaker session in the account chooser prompts for re-authentication rather than failing the request.

## Logout taxonomy

Three OIDC specs deal with logout. The library implements two of them.

### RP-Initiated Logout 1.0

The RP redirects the browser to:

```
GET /end_session?id_token_hint=<id_token>&post_logout_redirect_uri=<uri>&state=<opaque>
```

The OP does the following:

1. Verifies the `id_token_hint`: its signature, that `aud` names a registered client, and that `typ` is absent or `JWT` (a logout token or access token is refused). An expired ID Token is accepted, because a user logging out from a stale tab is the common case.
2. Shows a confirmation page unless the hint's `sub` matches the subject of the session cookie. A hint for a different subject, or no hint, always gets the page.
3. Resolves the logout scope and deletes the selected session rows.
4. If the `post_logout_redirect_uri` is registered for the client, redirects the browser back with `state` echoed.

| `logout_scope` | Sessions destroyed |
|---|---|
| absent (default) | Every session in the browser's chooser group. |
| `current` | Only the active session. If a sibling survives, the OP rebinds the cookie to it. |
| empty, unknown, or repeated | None: the request is rejected with HTTP 400 before any state changes. |

An `id_token_hint` whose subject does not match the session cookie cannot bypass confirmation. If the session store has a transport failure while the OP is resolving or destroying the session, `/end_session` returns a static HTTP 503 page with no post-logout redirect and leaves both the cookie and the session row intact. An absent or already-expired session is a different, safe-to-continue case.

The confirmation and browser-facing error HTML from `/end_session` carry both `X-Frame-Options: DENY` and a Content-Security-Policy with `frame-ancestors 'none'`, so neither page can be embedded.

For native and public clients, the same RFC 8252 loopback any-port rule used for `redirect_uri` also applies to `post_logout_redirect_uri`: a client may register a fixed loopback URI and return with a different ephemeral port at logout. Host, scheme, and path still have to match the registered shape; only the port varies.

The point is to **end the OP's session for this browser**. The RP that initiated the logout already knows about it; other RPs don't, unless the OP also runs Back-Channel Logout.

### Back-Channel Logout 1.0

When `/end_session` terminates a session, the OP `POST`s a signed `logout_token` JWT to each eligible RP target derived from that subject's grants. The RP validates the JWT and invalidates its own local session.

This is server-to-server. The browser is not involved, so it works whether the user closed the tab or switched browsers; the public session logout entry point is `/end_session`.

The library guards the outbound HTTP request with the same SSRF deny-list as JWKS / sector_identifier_uri: no private networks unless the embedder explicitly opts in. Failures are logged via `op.AuditLogoutBackChannelFailed`. Successes via `op.AuditLogoutBackChannelDelivered`. A session-bearing logout notice whose grant-derived RP audience is empty emits `op.AuditBCLNoSessionsForSubject` — useful for distinguishing "no RP targets resolved" from "delivery failed".

Detached fan-out has two independent time limits: `op.WithBackchannelLogoutTimeout` bounds one RP's HTTP delivery (5 seconds by default), while `op.WithBackchannelFanOutBudget` bounds the whole detached fan-out (30 seconds by default). The latter is a global event budget, not the per-RP timeout; `Provider.Shutdown(ctx)` also drains fan-outs that are still running.

::: warning Back-Channel Logout is best-effort under volatile sessions
If a volatile `store.SessionStore` evicts the row before `/end_session` can resolve and snapshot it, the browser logout trigger is lost and no detached fan-out starts. When the snapshot is captured, the RP audience is resolved from the grant store rather than by walking `SessionStore` rows; zero grant-derived RP targets are reported only for a session-bearing notice. The `op.SessionDurabilityPosture` knob provides context for trigger/snapshot loss versus a no-target outcome. See [design judgment #10](/security/design-judgments#dj-10).
:::

### Front-Channel Logout 1.0 — not implemented

Front-Channel Logout works by the OP serving an HTML page with one `<iframe>` per RP's `frontchannel_logout_uri`; each iframe loads in third-party context and reads its own cookie to clear it. The mechanism depends on a third-party iframe being able to read its own cookie from an embedded context — a capability that mainstream browsers have removed:

- Safari ITP since 2017
- Firefox ETP since 2019
- Chrome `SameSite=Lax` default since 2020
- Third-party-cookie phase-out across 2024–2025

The library does **not** ship Front-Channel Logout, and the discovery document does not advertise `frontchannel_logout_supported`. Embedders that need fan-out logout use Back-Channel Logout 1.0, which is server-to-server and unaffected by browser cookie policies. See [design judgment #5](/security/design-judgments#dj-5) for the full reasoning.

## End-session cascade

`/end_session` does more than delete the cookie. For each distinct subject in the sessions being destroyed, the library walks every grant the subject holds and retires the credentials issued under it: JWT and opaque access tokens, and refresh tokens. The grant records themselves stay, so the user's consent is remembered. JWT access tokens become inactive at OP-served boundaries (`/userinfo`, `/introspect`); opaque access tokens become inactive at every RS that introspects.

<figure class="fig">
  <div class="fig-head">Ending a session cascades, but not to every token</div>
  <svg class="fig-svg" role="img" aria-labelledby="session-cascade-title" viewBox="0 0 960 720" xmlns="http://www.w3.org/2000/svg">
    <title id="session-cascade-title">Above, the session model: five browser cookies scoped to the OP origin, of which one carries the id of a single SessionStore row that holds the OP-side state. Below, the end-session cascade: the row is deleted, each grant is walked and the access and refresh tokens under it are revoked, and a logout token is posted to every registered back-channel logout URI. A note marks that a JWT access token is refused only by the OP and an opaque one only once each resource server introspects it.</title>
    <!-- session model band -->
    <rect class="fg-group" x="32" y="24" width="896" height="176" rx="8"/>
    <text class="fg-lbl" x="56" y="52">session model</text>
    <rect class="fg-box" x="56" y="80" width="336" height="96" rx="8"/>
    <text class="fg-t2" x="72" y="108">Browser cookies</text>
    <text class="fg-mxs" x="72" y="132">five __Host-oidc_* cookies</text>
    <text class="fg-xs" x="72" y="156">scoped to the OP origin, never the RP</text>
    <path class="fg-edge" d="M392,128 H488" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="440" y="118" text-anchor="middle">row id</text>
    <rect class="fg-box fg-box--accent" x="488" y="80" width="416" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="504" y="108">SessionStore</text>
    <text class="fg-xs" x="504" y="132">one row per session, all OP-side state</text>
    <text class="fg-mxs" x="504" y="156">ID · Subject · AuthTime · ACR · AMR</text>
    <!-- cascade band -->
    <rect class="fg-group" x="32" y="232" width="896" height="464" rx="8"/>
    <text class="fg-lbl" x="56" y="260">end-session cascade</text>
    <rect class="fg-box" x="56" y="440" width="192" height="72" rx="8"/>
    <text class="fg-m" x="72" y="468">/end_session</text>
    <text class="fg-xs" x="72" y="492">RP-initiated logout</text>
    <path class="fg-leader" d="M248,476 H272 M272,324 V636"/>
    <!-- SessionStore -->
    <path class="fg-edge fg-edge--thin" d="M272,324 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="288" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="316">SessionStore</text>
    <text class="fg-xs" x="312" y="340">the row is deleted</text>
    <!-- Grants -->
    <path class="fg-edge fg-edge--thin" d="M272,428 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="392" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="420">Grants</text>
    <text class="fg-xs" x="312" y="444">one teardown per grant</text>
    <!-- Tokens under each grant -->
    <path class="fg-edge fg-edge--thin" d="M272,532 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="496" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="524">Tokens under each grant</text>
    <text class="fg-xs" x="312" y="548">access and refresh revoked</text>
    <!-- Back-channel logout -->
    <path class="fg-edge fg-edge--thin" d="M272,636 H296" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="296" y="600" width="264" height="72" rx="8"/>
    <text class="fg-t2" x="312" y="628">Back-channel logout</text>
    <text class="fg-mxs" x="312" y="652">logout_token → each RP</text>
    <!-- reach note -->
    <path class="fg-edge fg-edge--muted" d="M560,532 H608" marker-end="url(#fg-am)"/>
    <rect class="fg-box fg-box--muted" x="608" y="496" width="296" height="96" rx="8"/>
    <text class="fg-t2" x="624" y="524">How far it reaches</text>
    <text class="fg-xs" x="624" y="548">JWT: refused by the OP</text>
    <text class="fg-xs" x="624" y="572">opaque: needs RS introspection</text>
    <rect class="fg-pill fg-pill--warn" x="608" y="624" width="224" height="32" rx="16"/>
    <text class="fg-s" x="720" y="645" text-anchor="middle">depends on every RS</text>
  </svg>
  <figcaption class="fig-note">The first two steps are synchronous and under the OP's control. Token revocation and back-channel logout are not: a JWT already in flight stays syntactically valid until it expires, and a back-channel notification only helps for RPs that registered a URI and answer it.</figcaption>
</figure>

The cookie is only a pointer — the session is the row in `SessionStore`. Clearing the cookie in the browser leaves that row intact, so the OP has to delete the row itself.

| Wired stores | Cascade behaviour |
|---|---|
| `Grants` wired (default with the bundled adapters) | Logout cascades. JWT ATs are rejected at `/userinfo` and `/introspect`; opaque ATs are rejected at every RS; refresh tokens stop refreshing. |
| `Grants` left nil | The cascade is skipped. ATs expire naturally at their `exp`. |
| JWT revocation strategy `None` | The JWT half is skipped; opaque ATs and refresh tokens are still revoked. |

See [design judgment #17](/security/design-judgments#dj-17) for the rationale and the asymmetry between JWT and opaque cascade reach.

## Sessions in volatile vs durable storage

The session substore is intentionally separate from the transactional store (auth codes, refresh tokens, clients). Embedders typically pick:

| Posture | Backend for `SessionStore` | Trade-off |
|---|---|---|
| **Hot/cold split** (recommended for high-traffic) | Redis (volatile) | Low session-mutation latency. BCL becomes best-effort if eviction races logout. |
| **All-durable** | Same SQL cluster as the transactional store | BCL delivery is integrity-bounded. Session writes share latency with token writes. |

The `op.WithSessionDurabilityPosture(...)` option declares the embedder's choice so that the audit trail (`op.AuditBCLNoSessionsForSubject`) can be interpreted correctly. See the [hot/cold split use case](/use-cases/hot-cold-redis) for a complete wiring.

For graceful shutdown, stop accepting HTTP traffic first and then drain the provider's detached work:

```go
srv.Shutdown(ctx)      // stop accepting
provider.Shutdown(ctx) // then drain detached fan-out
```

## Audit events on the session lifecycle

| Event | Fires on |
|---|---|
| `op.AuditSessionCreated` | New session minted. |
| `op.AuditSessionDestroyed` | Session row deleted (logout, eviction, GC). |
| `op.AuditSessionAlreadyAbsent` | A logout targeted a session that was already absent or expired. |
| `op.AuditSessionDestroyFailed` | Session deletion hit a store failure; the request is a static 503 and state is preserved. |
| `op.AuditLogoutClientLookupFailed` | Client registry lookup failed while resolving a logout client; the wire response remains a uniform refusal. A clean missing client emits no event. |
| `op.AuditLogoutRPInitiated` | **Reserved** — the OP does not emit a separate event for the RP's logout request. |
| `op.AuditLogoutTokenRevokeFailed` | Logout-token or session cascade revocation hit a store failure. |
| `op.AuditLogoutBackChannelDelivered` | RP returned 2xx for a `logout_token` POST. |
| `op.AuditLogoutBackChannelFailed` | RP returned non-2xx, the network errored, or the deny-list blocked the URL. |
| `op.AuditLogoutBackChannelResolveFailed` | Grant-based target resolution failed. |
| `op.AuditLogoutBackChannelOverflow` | The bounded target list overflowed. |
| `op.AuditBCLNoSessionsForSubject` | A session-bearing `/end_session` notice resolved zero grant-derived RP targets. |

`op.AuditLogoutRPInitiated` is reserved catalog vocabulary; the OP does not emit a separate "RP asked" event. Correlate the resulting session and back-channel events instead.

## Read next

- [Use case: Back-Channel Logout](/use-cases/back-channel-logout) — wiring an RP's `backchannel_logout_uri`, signing-key choices, and the `logout_token` payload.
- [Design judgments](/security/design-judgments) — judgments #5, #10, and #17 cover the explicit reads behind the logout posture.
- [Operations: multi-instance](/operations/multi-instance) — running the OP behind a load balancer when sessions are shared via a volatile store.
