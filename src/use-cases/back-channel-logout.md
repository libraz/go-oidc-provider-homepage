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
  <svg class="fig-svg" role="img" aria-labelledby="uc-bcl-title" viewBox="0 0 960 366" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-bcl-title">RP A sends the user to the end-session endpoint. The OP terminates the session, then posts a signed logout token to every RP the session's grants point at, and finally redirects the user back to RP A.</title>
    <line class="fg-life" x1="110" y1="72" x2="110" y2="356"/>
    <line class="fg-life" x1="300" y1="72" x2="300" y2="356"/>
    <line class="fg-life fg-life--accent" x1="530" y1="72" x2="530" y2="356"/>
    <line class="fg-life" x1="760" y1="72" x2="760" y2="356"/>
    <line class="fg-life" x1="890" y1="72" x2="890" y2="356"/>
    <rect class="fg-box" x="40" y="24" width="140" height="44" rx="6"/>
    <text class="fg-t" x="110" y="44" text-anchor="middle">User</text>
    <text class="fg-xs" x="110" y="59" text-anchor="middle">browser</text>
    <rect class="fg-box" x="230" y="24" width="140" height="44" rx="6"/>
    <text class="fg-t" x="300" y="44" text-anchor="middle">RP A</text>
    <text class="fg-xs" x="300" y="59" text-anchor="middle">initiates</text>
    <rect class="fg-box fg-box--accent" x="450" y="24" width="160" height="44" rx="6"/>
    <text class="fg-t fg-accent" x="530" y="44" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="530" y="59" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="700" y="24" width="120" height="44" rx="6"/>
    <text class="fg-t" x="760" y="49" text-anchor="middle">RP B</text>
    <rect class="fg-box" x="838" y="24" width="86" height="44" rx="6"/>
    <text class="fg-t" x="881" y="49" text-anchor="middle">RP C</text>
    <circle class="fg-badge" cx="15" cy="102" r="8.5"/>
    <text class="fg-badge-t" x="15" y="105" text-anchor="middle">1</text>
    <path class="fg-edge" d="M110,102 H300" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="205" y="96" text-anchor="middle">the user clicks "log out"</text>
    <circle class="fg-badge" cx="15" cy="142" r="8.5"/>
    <text class="fg-badge-t" x="15" y="145" text-anchor="middle">2</text>
    <path class="fg-edge" d="M300,142 H530" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="415" y="122" text-anchor="middle">redirect to</text>
    <text class="fg-mxs fg-halo" x="415" y="135" text-anchor="middle">/end_session?id_token_hint=…</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="180" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="183" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--accent" d="M530,172 h28 v16 h-28" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="570" y="184">terminate the session, then walk its grants</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="228" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="231" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M530,228 H756" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--accent" d="M530,258 H886" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="643" y="208" text-anchor="middle">POST backchannel_logout_uri</text>
    <text class="fg-mxs" x="643" y="221" text-anchor="middle">logout_token — a signed JWT</text>
    <text class="fg-xs fg-halo" x="700" y="252" text-anchor="middle">one POST per grant-derived target</text>
    <circle class="fg-badge" cx="15" cy="292" r="8.5"/>
    <text class="fg-badge-t" x="15" y="295" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--muted" d="M756,292 H534" marker-end="url(#fg-am)"/>
    <path class="fg-edge fg-edge--muted" d="M886,314 H534" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="645" y="286" text-anchor="middle">200 — or nothing at all</text>
    <circle class="fg-badge" cx="15" cy="350" r="8.5"/>
    <text class="fg-badge-t" x="15" y="353" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--accent" d="M530,350 H110" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs fg-halo" x="320" y="344" text-anchor="middle">302 → post_logout_redirect_uri</text>
  </svg>
  <figcaption class="fig-note">Step 5 is drawn muted for a reason: the OP does not wait on it, and an RP that never answers still gets logged out everywhere else. Back-channel logout is a best-effort notification, not a distributed transaction.</figcaption>
</figure>

The OP signs a `logout_token` per RP and POSTs it to that RP's `backchannel_logout_uri`. The token contains:

| Claim | Meaning |
|---|---|
| `iss` | OP issuer |
| `aud` | The RP's `client_id` |
| `iat`, `jti` | Issuance time + replay nonce |
| `sub` | Whose session ended. `sid` is never emitted — see [below](#backchannel-target-resolution) |
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
  BackchannelLogoutSessionRequired: false, // sid is not supported; sub identifies the user
})
```

The `BackchannelLogoutURI` field also exists on `op.ConfidentialClient` and `op.PrivateKeyJWTClient` — every typed seed accepts it.

Library-wide knobs:

```go
op.New(
  /* ... */
  op.WithBackchannelLogoutHTTPClient(myHTTPClient), // mTLS / custom timeouts
  op.WithBackchannelLogoutTimeout(5 * time.Second),
  op.WithBackchannelFanOutBudget(30 * time.Second), // whole detached fan-out; separate from per-RP timeout
)
```

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
