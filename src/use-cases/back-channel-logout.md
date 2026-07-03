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

<style scoped>
.bcl-svg text{font-family:var(--vp-font-family-base);fill:var(--vp-c-text-1);stroke:none;}
.bcl-svg .m{font-family:var(--vp-font-family-mono);}
.bcl-svg .nm{font-weight:600;font-size:13px;}
.bcl-svg .rl{font-size:9px;fill:var(--vp-c-text-2);}
.bcl-svg .lb{font-size:12px;}
.bcl-svg .lbm{font-size:10.5px;fill:var(--vp-c-text-2);}
.bcl-svg .fr{font-size:11px;fill:var(--vp-c-text-2);}
.bcl-svg .bn{font-size:10px;font-weight:600;fill:var(--vp-c-text-2);}
.bcl-svg .accent{stroke:var(--vp-c-brand-2);}
.bcl-svg .accentt{fill:var(--vp-c-brand-2);}
.bcl-svg .life{stroke-width:1.4;opacity:.28;}
.bcl-svg .frame{stroke-width:1.4;opacity:.5;}
.bcl-svg .ret{opacity:.55;}
.bcl-svg .bg{fill:var(--vp-c-bg);}
</style>

<svg class="bcl-svg" role="img" aria-labelledby="bcl-arch-title" viewBox="0 0 764 386" style="width:100%;height:auto;max-width:760px" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="bcl-arch-title">Back-channel logout sequence: RP A drives /end_session, the OP terminates the session and fans out signed logout tokens to RP B and RP C, then redirects RP A.</title>

  <path class="life" d="M70 48V372"/>
  <path class="life" d="M220 48V372"/>
  <path class="life" d="M380 48V372"/>
  <path class="life" d="M540 48V372"/>
  <path class="life" d="M700 48V372"/>

  <rect x="24" y="12" width="92" height="36" rx="7"/>
  <text class="nm" x="70" y="35" text-anchor="middle">User</text>

  <rect x="168" y="12" width="104" height="36" rx="7"/>
  <text class="nm" x="220" y="30" text-anchor="middle">RP A</text>
  <text class="rl" x="220" y="42" text-anchor="middle">initiates</text>

  <rect class="accent" x="328" y="12" width="104" height="36" rx="7"/>
  <text class="nm accentt" x="380" y="35" text-anchor="middle">OP</text>

  <rect x="488" y="12" width="104" height="36" rx="7"/>
  <text class="nm" x="540" y="35" text-anchor="middle">RP B</text>

  <rect x="654" y="12" width="92" height="36" rx="7"/>
  <text class="nm" x="700" y="35" text-anchor="middle">RP C</text>

  <text class="lb" x="145" y="74" text-anchor="middle">click &#8220;log out&#8221;</text>
  <path d="M70 82L220 82M213 78L220 82L213 86"/>
  <circle class="bg" cx="70" cy="82" r="8" stroke-width="1.5"/>
  <text class="bn" x="70" y="85.5" text-anchor="middle">1</text>

  <text class="lb" x="300" y="104" text-anchor="middle">redirect to</text>
  <text class="lbm m" x="300" y="116" text-anchor="middle">/end_session?id_token_hint=&#8230;</text>
  <path d="M220 124L380 124M373 120L380 124L373 128"/>
  <circle class="bg" cx="220" cy="124" r="8" stroke-width="1.5"/>
  <text class="bn" x="220" y="127.5" text-anchor="middle">2</text>

  <rect class="accent" x="326" y="138" width="108" height="26" rx="5"/>
  <text class="lb" x="380" y="155" text-anchor="middle">terminate session</text>
  <circle class="bg" cx="312" cy="151" r="8" stroke-width="1.5"/>
  <text class="bn" x="312" y="154.5" text-anchor="middle">3</text>

  <rect class="frame" x="350" y="176" width="396" height="94" rx="8"/>
  <text class="fr" x="360" y="193">fan-out to every RP in the session</text>
  <text class="lbm m" x="548" y="211" text-anchor="middle">POST backchannel_logout_uri &#183; logout_token = signed JWT</text>

  <path class="accent" d="M380 228L540 228M533 224L540 228L533 232"/>
  <circle class="bg" cx="380" cy="228" r="8" stroke-width="1.5"/>
  <text class="bn" x="380" y="231.5" text-anchor="middle">4</text>

  <path class="accent" d="M380 254L700 254M693 250L700 254L693 258"/>
  <circle class="bg" cx="380" cy="254" r="8" stroke-width="1.5"/>
  <text class="bn" x="380" y="257.5" text-anchor="middle">5</text>

  <text class="lbm m" x="392" y="288">200</text>
  <path class="ret" d="M540 294L380 294M387 290L380 294L387 298"/>
  <circle class="bg" cx="540" cy="294" r="8" stroke-width="1.5"/>
  <text class="bn" x="540" y="297.5" text-anchor="middle">6</text>

  <text class="lbm m" x="392" y="314">200</text>
  <path class="ret" d="M700 320L380 320M387 316L380 320L387 324"/>
  <circle class="bg" cx="700" cy="320" r="8" stroke-width="1.5"/>
  <text class="bn" x="700" y="323.5" text-anchor="middle">7</text>

  <text class="lb" x="300" y="348" text-anchor="middle">302 <tspan class="m" font-size="10.5">post_logout_redirect_uri</tspan></text>
  <path class="accent" d="M380 356L220 356M227 352L220 356L227 360"/>
  <circle class="bg" cx="380" cy="356" r="8" stroke-width="1.5"/>
  <text class="bn" x="380" y="359.5" text-anchor="middle">8</text>
</svg>

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

Local demos and CI fixtures that bind a stub RP on loopback can opt into plain HTTP only for loopback `backchannel_logout_uri` values:

```go
op.WithAllowInsecureBackchannelLogoutForDev()
```

That option widens both the registration-time URL validator and the runtime SSRF gate for `127.0.0.1`, `[::1]`, and `localhost` only. It is not a production shortcut; public hosts and non-loopback private networks still require the explicit production posture below.

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
