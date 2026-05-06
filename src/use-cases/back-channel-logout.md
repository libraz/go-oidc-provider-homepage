---
title: Back-Channel Logout
description: Notify every RP server-to-server when a session ends — OIDC Back-Channel Logout 1.0.
---

# Use case — Back-Channel Logout

## What is "back-channel logout"?

A user typically signs into multiple apps (RPs) through the same OP — "sign in with Acme" buttons all share one identity session. When the user clicks **log out** at one RP, the other RPs still hold their own local cookies; without coordination, the user looks signed in at app B even though they signed out at app A.

**Back-channel logout** is the OP-driven fan-out that closes that gap. Each RP registers a server-side callback URL with the OP. When the session ends, the OP **POSTs a signed `logout_token` directly to every RP** (server to server, behind the user's back — hence "back-channel"). Each RP verifies the token and drops its local cookie.

The alternative — *front-channel* logout — embeds an `<iframe>` per RP and depends on third-party cookies, which modern browsers progressively break. Back-channel is the deployable choice.

::: details Specs referenced on this page
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT (the logout token shape)
- [RFC 8417](https://datatracker.ietf.org/doc/html/rfc8417) — Security Event Token (SET) — the `events` claim shape
- [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) — Private IPv4 ranges (used by the SSRF defence below)
:::

::: details Quick refresher
- **`logout_token`** — a short-lived JWT the OP signs and POSTs to each RP, naming the subject (`sub`) or session (`sid`) that ended. It is *not* an access token; the RP only verifies it and drops local state.
- **SET (Security Event Token, RFC 8417)** — a JWT shape designed for security event delivery. The `events` claim slots an event-type key (here `http://schemas.openid.net/event/backchannel-logout`) so a generic SET receiver can dispatch to the right handler.
:::

> **Source:** [`examples/42-back-channel-logout`](https://github.com/libraz/go-oidc-provider/tree/main/examples/42-back-channel-logout)

## Architecture

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant RP_A as RP A (initiates)
    participant OP
    participant RP_B as RP B
    participant RP_C as RP C

    U->>RP_A: click "log out"
    RP_A->>OP: redirect to /end_session?id_token_hint=...
    OP->>OP: terminate session
    par fan-out to every RP in the session
      OP->>RP_B: POST <backchannel_logout_uri><br/>logout_token=<signed JWT>
      OP->>RP_C: POST <backchannel_logout_uri><br/>logout_token=<signed JWT>
    end
    RP_B->>OP: 200
    RP_C->>OP: 200
    OP->>RP_A: 302 post_logout_redirect_uri
```

The OP signs a `logout_token` per RP and POSTs it to that RP's `backchannel_logout_uri`. The token contains:

| Claim | Meaning |
|---|---|
| `iss` | OP issuer |
| `aud` | The RP's `client_id` |
| `iat`, `jti` | Issuance time + replay nonce |
| `sub` or `sid` | Whose session ended |
| `events` | `{"http://schemas.openid.net/event/backchannel-logout": {}}` |

The RP verifies the signature and `aud`, drops the local session, and returns 200.

## Wiring

Per-client `BackchannelLogoutURI` opts the RP in:

```go
op.WithStaticClients(op.PublicClient{
  ID:                               "rp-a",
  RedirectURIs:                     []string{"https://rp-a.example.com/callback"},
  Scopes:                           []string{"openid", "profile"},
  BackchannelLogoutURI:             "https://rp-a.example.com/oidc/backchannel-logout",
  BackchannelLogoutSessionRequired: true, // request the "sid" claim on the logout token
})
```

The `BackchannelLogoutURI` field also exists on `op.ConfidentialClient` and `op.PrivateKeyJWTClient` — every typed seed accepts it.

Library-wide knobs:

```go
op.New(
  /* ... */
  op.WithBackchannelLogoutHTTPClient(myHTTPClient), // mTLS / custom timeouts
  op.WithBackchannelLogoutTimeout(5 * time.Second),
)
```

## SSRF defense

::: warning Private-network destinations are refused by default
The deliverer **refuses** to POST to a `backchannel_logout_uri` whose host resolves to a loopback / link-local / RFC 1918 / IPv6 ULA address. Without this, an RP that can register an arbitrary URL becomes an SSRF oracle into the OP's internal network.

The dial-time deny-list is layered on a URL-shape gate at registration time: `backchannel_logout_uri` MUST be `https`, carry no fragment, no userinfo, and a non-empty host — `https://attacker:internal@rp.example.com/...` and `https://rp.example.com/cb#anchor` both fail with `invalid_client_metadata`. `backchannel_logout_session_required=true` paired with an empty URI is also rejected, so a client cannot opt into `sid` delivery without a destination.

Embedders fronting their RPs with private DNS opt in:

```go
op.WithBackchannelAllowPrivateNetwork(true)
```

This must be a deliberate choice — the option is the visible site for the security trade-off.
:::

## Volatile-store gap (and the audit event for it)

Back-channel fan-out walks the OP's `SessionStore` to find every RP attached to the ending session. Under a **volatile** session store (Redis without persistence, Memcached, in-memory under maxmemory eviction), a session evicted between establishment and `/end_session` silently removes the rows the back-channel coordinator would walk — nothing fires for those RPs.

The library surfaces the gap as an audit event:

| Event | Meaning |
|---|---|
| `op.AuditBCLNoSessionsForSubject` | The caller named a session (`/end_session` with `id_token_hint`, or `Provider.Logout` against a session-bearing subject) but the fan-out resolved zero RPs. |

Under volatile placement this is the OIDC Back-Channel Logout 1.0 §2.7 "best effort" floor; under durable placement it's an unexpected gap. The event extras carry the configured `op.SessionDurabilityPosture` (`SessionDurabilityVolatile` or `SessionDurabilityDurable`) so SOC dashboards distinguish the two without keying on the store-adapter type.

## Front-channel logout (a different mechanism)

OIDC Front-Channel Logout 1.0 (browser-side iframe fan-out) is a separate spec the library intentionally does not implement. Back-channel is the deployable choice: no third-party cookie dependency, works across origins, doesn't require the user's browser to be open at the moment fan-out happens.
