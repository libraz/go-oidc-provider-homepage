---
title: Sessions and logout
description: How the OP encodes a browser session, how RP-Initiated Logout and Back-Channel Logout differ, and why this library does not implement Front-Channel Logout.
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

The cookie that points at this row is `__Host-oidc_session` (defined in `internal/cookie/profile.go`). The library uses four cookies in total:

| Cookie | Purpose | Scheme |
|---|---|---|
| `__Host-oidc_session` | Persistent session pointer. | AES-256-GCM AEAD over an opaque payload. `__Host-` prefix forces same-origin only. `SameSite=Lax`. |
| `__Host-oidc_interaction` | In-flight interaction (login form, MFA challenge) state. | Same AEAD; one-hour TTL. |
| `__Host-oidc_csrf` | Double-submit CSRF token for the interaction form. | HMAC-only (no AEAD). `SameSite=Strict`. |
| `__Host-oidc_locale` | Remembers the user's chosen UI locale across interaction pages. | Plain text (not encrypted); one-year TTL. `SameSite=Lax`. |

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

For native and public clients, the same RFC 8252 loopback any-port rule used for `redirect_uri` also applies to `post_logout_redirect_uri`: a client may register a fixed loopback URI and return with a different ephemeral port at logout. Host, scheme, and path still have to match the registered shape; only the port varies.

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

<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="session-cascade-title" viewBox="0 0 720 420" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<title id="session-cascade-title">How one session row links to its cookies, and how /end_session cascades to grants, access tokens, and Back-Channel Logout notifications.</title>
<defs>
<marker id="sc-arw" viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="6" refY="4" orient="auto-start-reverse"><path d="M1.5 1.5 6 4 1.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3"/></marker>
<marker id="sc-arw-op" viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="6" refY="4" orient="auto-start-reverse"><path d="M1.5 1.5 6 4 1.5 6.5" fill="none" class="sc-op" stroke-width="1.3"/></marker>
<marker id="sc-arw-rs" viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="6" refY="4" orient="auto-start-reverse"><path d="M1.5 1.5 6 4 1.5 6.5" fill="none" class="sc-rs" stroke-width="1.3"/></marker>
</defs>
<text x="24" y="26" class="sc-m" font-size="10.5" letter-spacing="1.6" opacity="0.55">SESSION MODEL</text>
<text x="24" y="50" class="sc-b" font-size="10.5" opacity="0.6">Browser cookies</text>
<rect x="24" y="58" width="176" height="24" rx="5"/>
<text x="34" y="74" class="sc-m" font-size="10">__Host-oidc_session</text>
<g opacity="0.45">
<rect x="24" y="90" width="176" height="24" rx="5"/>
<text x="34" y="106" class="sc-m" font-size="10">__Host-oidc_interaction</text>
<rect x="24" y="122" width="176" height="24" rx="5"/>
<text x="34" y="138" class="sc-m" font-size="10">__Host-oidc_csrf</text>
<rect x="24" y="154" width="176" height="24" rx="5"/>
<text x="34" y="170" class="sc-m" font-size="10">__Host-oidc_locale</text>
</g>
<path d="M200 70 C 224 70, 226 96, 250 96" fill="none" marker-end="url(#sc-arw)"/>
<rect x="250" y="52" width="248" height="108" rx="8" class="sc-op" stroke-dasharray="5 4"/>
<text x="266" y="76" class="sc-m sc-opf" font-size="12.5">SessionStore</text>
<text x="266" y="94" class="sc-b" font-size="10.5" opacity="0.7">one session row · OP-side state</text>
<text x="266" y="118" class="sc-m" font-size="10" opacity="0.85">ID · Subject · AuthTime · ACR</text>
<text x="266" y="136" class="sc-m" font-size="10" opacity="0.85">AMR · ChooserGroupID · timestamps</text>
<text x="520" y="86" class="sc-b" font-size="10.5">The cookie is only a</text>
<text x="520" y="104" class="sc-b" font-size="10.5">pointer; the row is the</text>
<text x="520" y="122" class="sc-b" font-size="10.5">session. Delete the row,</text>
<text x="520" y="140" class="sc-b" font-size="10.5">not just the cookie.</text>
<line x1="24" y1="184" x2="696" y2="184" opacity="0.12" stroke-width="1"/>
<text x="24" y="210" class="sc-m" font-size="10.5" letter-spacing="1.6" opacity="0.55">END-SESSION CASCADE</text>
<rect x="24" y="228" width="132" height="34" rx="17" class="sc-op"/>
<text x="90" y="250" class="sc-m sc-opf" font-size="12" text-anchor="middle">/end_session</text>
<rect x="186" y="224" width="120" height="42" rx="8" class="sc-op" stroke-dasharray="5 4"/>
<text x="246" y="242" class="sc-m sc-opf" font-size="11" text-anchor="middle">SessionStore</text>
<text x="246" y="258" class="sc-b" font-size="10" text-anchor="middle" opacity="0.7">row deleted</text>
<rect x="336" y="224" width="118" height="42" rx="8" stroke-dasharray="5 4"/>
<text x="395" y="242" class="sc-m" font-size="11" text-anchor="middle">Grants</text>
<text x="395" y="258" class="sc-b" font-size="10" text-anchor="middle" opacity="0.7">walk grants</text>
<rect x="484" y="224" width="134" height="42" rx="8" stroke-dasharray="5 4"/>
<text x="551" y="242" class="sc-m" font-size="11" text-anchor="middle">AccessTokens</text>
<text x="551" y="258" class="sc-b" font-size="10" text-anchor="middle" opacity="0.7">flip → revoked</text>
<line x1="156" y1="245" x2="182" y2="245" marker-end="url(#sc-arw)"/>
<line x1="306" y1="245" x2="332" y2="245" marker-end="url(#sc-arw)"/>
<line x1="454" y1="245" x2="480" y2="245" marker-end="url(#sc-arw)"/>
<path d="M246 266 C 210 296, 180 300, 151 320" fill="none" marker-end="url(#sc-arw)"/>
<path d="M551 266 C 500 300, 440 302, 386 320" fill="none" class="sc-op" marker-end="url(#sc-arw-op)"/>
<path d="M551 266 C 560 292, 585 302, 594 320" fill="none" class="sc-rs" marker-end="url(#sc-arw-rs)"/>
<rect x="24" y="324" width="250" height="66" rx="8"/>
<text x="38" y="346" class="sc-b" font-size="11.5">Back-Channel Logout</text>
<text x="38" y="365" class="sc-m" font-size="10">POST logout_token →</text>
<text x="38" y="382" class="sc-m" font-size="10">each backchannel_logout_uri</text>
<rect x="296" y="324" width="176" height="66" rx="8" class="sc-op"/>
<text x="310" y="346" class="sc-b sc-opf" font-size="11">JWT access token</text>
<text x="310" y="365" class="sc-b" font-size="10" opacity="0.75">OP rejects at</text>
<text x="310" y="382" class="sc-m sc-opf" font-size="10">/userinfo · /introspect</text>
<rect x="494" y="324" width="204" height="66" rx="8" class="sc-rs"/>
<text x="508" y="346" class="sc-b sc-rsf" font-size="11">opaque access token</text>
<text x="508" y="365" class="sc-b sc-rsf" font-size="10">inactive only after</text>
<text x="508" y="382" class="sc-b sc-rsf" font-size="10">each RS must introspect</text>
<text x="149" y="408" class="sc-b" font-size="9.5" text-anchor="middle" opacity="0.65">OP notifies each RP (server-to-server)</text>
<text x="384" y="408" class="sc-b sc-opf" font-size="9.5" text-anchor="middle">OP revokes directly</text>
<text x="596" y="408" class="sc-b sc-rsf" font-size="9.5" text-anchor="middle">reach depends on every RS</text>
</svg>

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
