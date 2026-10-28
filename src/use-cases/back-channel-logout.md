---
title: Back-Channel Logout
description: Notify grant-derived RP targets server-to-server with bounded fan-out when a session ends — OIDC Back-Channel Logout 1.0.
pageClass: pg-use-cases-back-channel-logout
---

# Use case — Back-Channel Logout

## What is "back-channel logout"?

A user typically signs into multiple apps (RPs) through the same OP — "sign in with Acme" buttons all share one identity session. When the user clicks **log out** at one RP, the other RPs still hold their own local cookies; without coordination, the user looks signed in at app B even though they signed out at app A.

**Back-channel logout** is the OP-driven fan-out that closes that gap. Each RP registers a server-side callback URL with the OP. When the session ends, the OP **POSTs a signed `logout_token` directly to every eligible RP target in the subject's grant-derived audience** (server to server, behind the user's back — hence "back-channel"). Each RP verifies the token and drops its local cookie.

The alternative — *front-channel* logout — embeds an `<iframe>` per RP and depends on third-party cookies, which modern browsers progressively break. Back-channel is the deployable choice.

::: details Specs referenced on this page
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JWT (the logout token shape)
- [RFC 8417](https://datatracker.ietf.org/doc/html/rfc8417) — Security Event Token (SET) — the `events` claim shape
- [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) — Private IPv4 ranges (used by the SSRF defence below)
:::

::: details Quick refresher
- **`logout_token`** — a short-lived JWT the OP signs and POSTs to each RP, naming the subject (`sub`) whose session ended. It is *not* an access token; the RP only verifies it and drops local state.
- **SET (Security Event Token, RFC 8417)** — a JWT shape designed for security event delivery. The `events` claim slots an event-type key (here `http://schemas.openid.net/event/backchannel-logout`) so a generic SET receiver can dispatch to the right handler.
:::

> **Source:** [`examples/42-back-channel-logout`](https://github.com/libraz/go-oidc-provider/tree/main/examples/42-back-channel-logout)

## Architecture

<figure class="fig">
  <div class="fig-head">One logout, fanned out to every RP</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-bcl-title" viewBox="0 0 960 472" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-bcl-title">RP A sends the user to the end-session endpoint. The OP terminates the session, then posts a signed logout token to every RP the session's grants point at, and finally redirects the user back to RP A.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="448"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="448"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="448"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">user clicks log out</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">RP B · RP C</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">every other RP</text>
    <!-- RP A sends the user to /end_session -->
    <path class="fg-edge" d="M192,144 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="110" text-anchor="middle">GET /end_session</text>
    <text class="fg-mxs" x="352" y="132" text-anchor="middle">id_token_hint=…</text>
    <!-- OP ends the session and walks its grants -->
    <path class="fg-edge fg-edge--accent" d="M512,200 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="206">end the session</text>
    <text class="fg-s" x="568" y="228">walk its grants</text>
    <!-- one logout_token POST per grant-derived target -->
    <path class="fg-edge" d="M512,304 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="270" text-anchor="middle">POST backchannel_logout_uri</text>
    <text class="fg-mxs" x="668" y="292" text-anchor="middle">logout_token, once per RP</text>
    <!-- best-effort answer -->
    <path class="fg-edge fg-edge--muted" d="M824,376 H512" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="668" y="366" text-anchor="middle">200, or no answer</text>
    <!-- redirect back to RP A -->
    <path class="fg-edge fg-edge--accent" d="M512,448 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="438" text-anchor="middle">302 → post_logout_redirect_uri</text>
  </svg>
  <figcaption class="fig-note">The dashed return is muted for a reason: the OP does not wait on it, and an RP that never answers still gets logged out everywhere else. Back-channel logout is a best-effort notification, not a distributed transaction.</figcaption>
</figure>

The OP signs a `logout_token` per RP and POSTs it to that RP's `backchannel_logout_uri`. The token contains:

| Claim | Meaning |
|---|---|
| `iss` | OP issuer |
| `aud` | The RP's `client_id` |
| `iat`, `jti` | Issuance time + replay nonce |
| `sub` | Whose session ended. `sid` is never emitted — see [below](#backchannel-target-resolution) |
| `events` | `{"http://schemas.openid.net/event/backchannel-logout": {}}` |

The JOSE header carries `typ: logout+jwt`, so an RP can refuse a token of any other type. The RP verifies the signature and `aud`, drops the local session, and returns 200. In the other direction, `/end_session` accepts only an ID Token as `id_token_hint`; a logout token or an access token is refused.

## Wiring

Per-client `BackchannelLogoutURI` opts the RP in:

```go
op.WithStaticClients(op.PublicClient{
  ID:                               "rp-a",
  RedirectURIs:                     []string{"https://rp-a.example.com/callback"},
  Scopes:                           []string{"openid", "profile"},
  BackchannelLogoutURI:             "https://rp-a.example.com/oidc/backchannel-logout",
  BackchannelLogoutSessionRequired: false, // sid is not supported; sub identifies the user
})
```

The `BackchannelLogoutURI` field also exists on `op.ConfidentialClient` and `op.PrivateKeyJWTClient` — every typed seed accepts it.

Library-wide knobs:

```go
op.New(
  /* ... */
  op.WithBackchannelLogoutHTTPClient(myHTTPClient), // custom Transport: mTLS, proxy
  op.WithBackchannelLogoutTimeout(5 * time.Second),
  op.WithBackchannelFanOutBudget(30 * time.Second), // whole detached fan-out; separate from per-RP timeout
)
```

The OP copies only the `Transport` of the client you pass. It always applies its own timeout, refuses redirects, and checks every target URL against the SSRF deny-list. A nil or `*http.Transport` additionally gets the dial-time check (the OP replaces any custom dial function); through a proxy, that check covers the proxy's address and the target host is checked once before the hand-off. Any other `http.RoundTripper`, an `otelhttp` wrapper for instance, is gated on the URL alone, which does not stop DNS rebinding.

Local demos and CI fixtures that bind a stub RP on loopback can opt into plain HTTP only for loopback `backchannel_logout_uri` values:

```go
op.WithAllowInsecureBackchannelLogoutForDev()
```

That option widens both the registration-time URL validator and the runtime SSRF gate for `127.0.0.1`, `[::1]`, and `localhost` only. It is not a production shortcut; public hosts and non-loopback private networks still require the explicit production posture below.

## SSRF defense

::: warning Private-network destinations are refused by default
The deliverer **refuses** to POST to a `backchannel_logout_uri` whose host resolves to a loopback / link-local / RFC 1918 / IPv6 ULA address. Without this, an RP that can register an arbitrary URL becomes an SSRF oracle into the OP's internal network.

The dial-time deny-list is layered on a URL-shape gate at registration time: `backchannel_logout_uri` MUST be `https`, carry no fragment, no userinfo, and a non-empty host — `https://attacker:internal@rp.example.com/...` and `https://rp.example.com/cb#anchor` both fail with `invalid_client_metadata`. `backchannel_logout_session_required=true` is unsupported and rejected; setting it does not enable `sid` delivery.

Embedders fronting their RPs with private DNS opt in:

```go
op.WithBackchannelAllowPrivateNetwork(true)
```

This must be a deliberate choice — the option is the visible site for the security trade-off.
:::

## How the audience is resolved (and why it is bounded) {#backchannel-target-resolution}

Fan-out resolves its audience from **grants**, not from session rows. The coordinator takes the ending session's subject and asks the grant store for the distinct clients that subject has consented to, through `store.GrantClientLister.ListClientIDsBySubject` — a keyset-paginated view separate from `ListBySubject`, because one subject can hold many historical grant rows per client. Every stage of the fan-out is bounded on purpose:

| Bound | Default | What it caps |
|---|---|---|
| Deduplicated audience | `DefaultMaxTargets` (256) | clients notified for one logout; the grant query itself is capped, not filtered afterwards |
| Concurrent deliveries | `DefaultMaxConcurrentDeliveries` (8) | simultaneous outbound POSTs |
| Whole detached fan-out | 30 seconds (`DefaultFanOutBudget`) | total wall-clock budget for one logout event |

When the audience page comes back with a `NextCursor`, more clients matched than the cap allows and the coordinator emits an overflow audit event carrying that cursor rather than silently truncating. A single unreachable RP surfaces as a per-target audit event instead of failing the whole fan-out.

Before detached work starts, `/end_session` groups the snapshot by subject, so multiple browser sessions for one subject create one fan-out. The grant query is distinct by client ID, so each eligible client receives at most one Logout Token for that subject; the target cap counts this deduplicated set.

During detached target resolution, a client-registry transport fault is recorded as `op.AuditLogoutBackChannelResolveFailed`, while a clean missing client is skipped without an event. The `/end_session` request's own `id_token_hint` / `client_id` lookup has separate `op.AuditLogoutClientLookupFailed` semantics: the wire refusal is uniform and a clean missing client is silent. See the [audit event catalog](/reference/audit-events).

`op.WithBackchannelFanOutBudget` changes the whole-event budget. It is independent of `op.WithBackchannelLogoutTimeout`, which limits each RP request. When the budget expires, remaining targets are recorded as failed and the detached work converges; `Provider.Shutdown(ctx)` waits for outstanding fan-outs when the process is draining.

::: tip `backchannel_logout_session_supported` is `false`
Discovery advertises it as `false`, and that follows directly from grant-based resolution: the OP cannot prove that an OP-side session identifier belongs to a particular RP, so a `sid` is never copied into a Logout Token. RPs must key their local session teardown on `sub`. Keep `BackchannelLogoutSessionRequired` false or omit it; `true` is unsupported and rejected.
:::

## When the fan-out resolves nothing

If the subject has no eligible grant-derived RP targets — every grant is revoked, or a stale record points to a client that no longer exists — the fan-out has nothing to notify. The library surfaces that as an audit event:

| Event | Meaning |
|---|---|
| `op.AuditBCLNoSessionsForSubject` | `/end_session` named a session, but grant-based audience resolution produced zero eligible RP targets. |

The event fires only when `/end_session` has named a session and grant-based audience resolution produces zero eligible RP targets. If a volatile `SessionStore` evicts the row before `/end_session` can snapshot it, the handler does not create a detached notice, so no fan-out or `AuditBCLNoSessionsForSubject` event starts. The extras carry the configured `op.SessionDurabilityPosture` (`SessionDurabilityVolatile` or `SessionDurabilityDurable`) as context for trigger/snapshot loss versus a no-target outcome; the posture does not claim that the no-target event itself proves eviction.

## Front-channel logout (a different mechanism)

OIDC Front-Channel Logout 1.0 (browser-side iframe fan-out) is a separate spec the library intentionally does not implement. Back-channel is the deployable choice: no third-party cookie dependency, works across origins, doesn't require the user's browser to be open at the moment fan-out happens.
