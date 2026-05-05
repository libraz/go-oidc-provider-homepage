---
title: Sessions and logout
description: How the OP encodes a browser session, how RP-Initiated Logout and Back-Channel Logout differ, and why this library does not implement Front-Channel Logout.
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
- If you only delete the cookie, the OP forgets the user. If you only kill the row, the cookie next request reads no session and the user is forced to re-authenticate.
:::

## How this library encodes the session

The OP keeps a row in `store.SessionStore` with:

| Field | Meaning |
|---|---|
| `ID` | Opaque session identifier (used as `sid` in logout tokens). |
| `Subject` | The OP-internal stable user id. Becomes `sub` in ID Tokens. |
| `AuthTime` | When the user authenticated. Becomes `auth_time` in ID Tokens. |
| `ACR` | Authentication Context Class Reference — the assurance level the session satisfies. |
| `AMR` | Authentication Methods References (RFC 8176) — `pwd`, `otp`, `mfa`, `hwk`, … |
| `ChooserGroupID` | Multi-account chooser group. Multiple sessions in one browser share this. |
| `ExpiresAt`, `CreatedAt`, `UpdatedAt` | Lifecycle timestamps. |

The cookie that points at this row is `__Host-oidc_session` (defined in `internal/cookie/profile.go`). The library uses three cookies in total:

| Cookie | Purpose | Scheme |
|---|---|---|
| `__Host-oidc_session` | Persistent session pointer. | AES-256-GCM AEAD over an opaque payload. `__Host-` prefix forces same-origin only. `SameSite=Lax`. |
| `__Host-oidc_interaction` | In-flight interaction (login form, MFA challenge) state. | Same AEAD; one-hour TTL. |
| `__Host-oidc_csrf` | Double-submit CSRF token for the interaction form. | HMAC-only (no AEAD). `SameSite=Strict`. |

::: details `__Host-` prefix — what's that?
A cookie name that starts with `__Host-` is, per RFC 6265bis, accepted by browsers only when the cookie also has `Secure`, `Path=/`, and **no** `Domain` attribute — meaning it is bound to exactly the OP's origin. Subdomain compromise can't forge it; a sibling domain can't read it. This library refuses to boot on plain HTTP precisely because the `__Host-` prefix would not survive.
:::

The session row goes through `store.SessionStore` — a substore that the embedder may serve from a volatile backend (Redis, Memcached) without violating any library invariant. See [design judgment #10](/security/design-judgments#dj-10) for the trade-off.

## Logout taxonomy

Three OIDC specs deal with logout. The library implements two of them.

### RP-Initiated Logout 1.0

The RP redirects the browser to:

```
GET /end_session?id_token_hint=<id_token>&post_logout_redirect_uri=<uri>&state=<opaque>
```

The OP does the following:

1. Verifies the `id_token_hint` (matches a session it issued).
2. Optionally renders an interstitial confirmation page (recommended for "are you sure?" UX).
3. Deletes the cookie and the `store.SessionStore` row.
4. If the `post_logout_redirect_uri` is registered for the client, redirects the browser back with `state` echoed.

The point is **end the OP's session for this browser**. The RP that initiated the logout already knows about it (it's the one that redirected); other RPs don't, unless the OP also runs Back-Channel Logout.

### Back-Channel Logout 1.0

When `/end_session` (or any other logout trigger) fires, the OP `POST`s a signed `logout_token` JWT to every RP that registered a `backchannel_logout_uri`. The RP validates the JWT and invalidates its own local session.

This is server-to-server. The browser is not involved, so it works whether the user closed the tab, switched browsers, or never had a tab open in the first place (e.g. a Back-Channel Logout triggered by an admin action).

The library guards the outbound HTTP request with the same SSRF deny-list as JWKS / sector_identifier_uri: no private networks unless the embedder explicitly opts in. Failures are logged via `op.AuditLogoutBackChannelFailed`. Successes via `op.AuditLogoutBackChannelDelivered`. A subject with no live sessions when `/end_session` fires emits `op.AuditBCLNoSessionsForSubject` — useful for distinguishing "delivery failed" from "no one to deliver to".

::: warning Back-Channel Logout is best-effort under volatile sessions
If `store.SessionStore` is served from a volatile cache and a session evicts before the logout fan-out runs, the library has nothing to walk. The user is logged out (the row is gone) but no notification reaches the RP. The `op.SessionDurabilityPosture` knob lets dashboards distinguish the two cases. See [design judgment #10](/security/design-judgments#dj-10).
:::

### Front-Channel Logout 1.0 — not implemented

Front-Channel Logout works by the OP serving an HTML page with one `<iframe>` per RP's `frontchannel_logout_uri`; each iframe loads in third-party context and reads its own cookie to clear it. The mechanism depends on a third-party iframe being able to read its own cookie from an embedded context — a capability that mainstream browsers have removed:

- Safari ITP since 2017
- Firefox ETP since 2019
- Chrome `SameSite=Lax` default since 2020
- Third-party-cookie phase-out across 2024–2025

The library does **not** ship Front-Channel Logout, and the discovery document does not advertise `frontchannel_logout_supported`. Embedders that need fan-out logout use Back-Channel Logout 1.0, which is server-to-server and unaffected by browser cookie policies. See [design judgment #5](/security/design-judgments#dj-5) for the full reasoning.

## End-session cascade

`/end_session` is not just "delete the cookie." When the embedder has wired `Grants` and `AccessTokens` substores, the library walks every grant the subject holds and revokes the per-grant access-token shadow rows. JWT access tokens become inactive at OP-served boundaries (`/userinfo`, `/introspect`); opaque access tokens become inactive at every RS that introspects.

| Wired stores | Cascade behaviour |
|---|---|
| `Grants` + `AccessTokens` (default with the bundled adapters) | Logout cascades. ATs flip to revoked. JWT ATs are rejected at `/userinfo`; opaque ATs are rejected at every RS. |
| Either left nil | Cascade short-circuits silently. ATs expire naturally at their `exp`. |

See [design judgment #17](/security/design-judgments#dj-17) for the rationale and the asymmetry between JWT and opaque cascade reach.

## Sessions in volatile vs durable storage

The session substore is intentionally separate from the transactional store (auth codes, refresh tokens, clients). Embedders typically pick:

| Posture | Backend for `SessionStore` | Trade-off |
|---|---|---|
| **Hot/cold split** (recommended for high-traffic) | Redis (volatile) | Low session-mutation latency. BCL becomes best-effort if eviction races logout. |
| **All-durable** | Same SQL cluster as the transactional store | BCL delivery is integrity-bounded. Session writes share latency with token writes. |

The `op.WithSessionDurabilityPosture(...)` option declares the embedder's choice so that the audit trail (`op.AuditBCLNoSessionsForSubject`) can be interpreted correctly. See the [hot/cold split use case](/use-cases/hot-cold-redis) for a complete wiring.

## Audit events on the session lifecycle

| Event | Fires on |
|---|---|
| `op.AuditSessionCreated` | New session minted. |
| `op.AuditSessionDestroyed` | Session row deleted (logout, eviction, GC). |
| `op.AuditLogoutRPInitiated` | `/end_session` fired. |
| `op.AuditLogoutBackChannelDelivered` | RP returned 2xx for a `logout_token` POST. |
| `op.AuditLogoutBackChannelFailed` | RP returned non-2xx, the network errored, or the deny-list blocked the URL. |
| `op.AuditBCLNoSessionsForSubject` | `/end_session` fired but the subject had no live sessions to fan out from. |

## Read next

- [Use case: Back-Channel Logout](/use-cases/back-channel-logout) — wiring an RP's `backchannel_logout_uri`, signing-key choices, and the `logout_token` payload.
- [Design judgments](/security/design-judgments) — judgments #5, #10, and #17 cover the explicit reads behind the logout posture.
- [Operations: multi-instance](/operations/multi-instance) — running the OP behind a load balancer when sessions are shared via a volatile store.
