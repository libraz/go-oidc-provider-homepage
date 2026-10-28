---
title: CIBA — Client-Initiated Backchannel Authentication
description: CIBA poll mode for POS and other out-of-band approvals — verified hints, binding messages, and embedder-owned authentication-device approval.
pageClass: pg-concepts-ciba
---

# CIBA — Client-Initiated Backchannel Authentication

CIBA solves a different shape of problem than the [device flow](/concepts/device-code). With device code, two surfaces meet at the OP through a short code shown on the device. With **CIBA**, the device that initiates the request is **not visible to the user at all** — the embedder's notification service reaches a **separate authentication device** the user already trusts.

The canonical setup:

- **Consumption device** — a POS terminal, a call-center agent screen, an in-store kiosk, a bank's wire-transfer reviewer panel. It knows *who* the user is supposed to be (loyalty card, phone number, account number) but cannot authenticate them.
- **Authentication device** — the user's phone, with a banking app already installed and signed in. The embedder's notification service presents (for example) "Approve $80.00 at Acme Coffee?", and the user taps **Approve** or **Deny**.

The consumption device never asks the user for credentials — it just asks the OP "please ask Alice to approve this on her phone".

::: details Specs referenced on this page
- [OpenID Connect Client-Initiated Backchannel Authentication Flow — Core 1.0](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html) — the CIBA Core spec
- [FAPI-CIBA-ID1](https://openid.net/specs/openid-financial-api-ciba-ID1.html) — the historical profile, based on FAPI 1.0 and mTLS-era sender constraint. This library's `profile.FAPICIBA` also accepts DPoP, so the preset alone does not establish ID1 conformance.
:::

::: details Vocabulary refresher
- **`auth_req_id`** — the opaque identifier returned from `/bc-authorize`. The consumption device polls `/token` with this; the authentication device approves against the same identifier.
- **Hint** — how the consumption device tells the OP **which user** to ask. CIBA Core §7.1 defines three:
  - `login_hint` — opaque value the embedder maps to a subject (`alice@example.com`, account number, …).
  - `id_token_hint` — a previously issued ID token whose `sub` identifies the user.
  - `login_hint_token` — a signed JWT the embedder verifies and maps to a subject (e.g. issued by another upstream system).
- **Delivery mode** — how the OP tells the consumption device that approval landed:
  - **poll** — the device polls `/token` with `auth_req_id`. This is the only delivery mode implemented by the library.
:::

## How the flow runs (poll mode)

<figure class="fig">
  <div class="fig-head">The OP reaches the user's phone; the terminal only polls</div>
  <svg class="fig-svg" role="img" aria-labelledby="ciba-poll-title" viewBox="0 0 960 872" xmlns="http://www.w3.org/2000/svg">
    <title id="ciba-poll-title">CIBA in poll mode. The point-of-sale terminal calls the backchannel authentication endpoint, the OP resolves the login hint to a subject, the embedder's notification service reaches the staff phone, and the terminal polls the token endpoint until the user approves.</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="336" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">Start the request</text>
    <rect class="fg-group" x="32" y="464" width="896" height="382" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="492">Wait for approval</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="848"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="848"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="848"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">POS terminal</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">consumption device</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Staff phone</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">authentication device</text>
    <!-- backchannel request -->
    <path class="fg-edge" d="M192,206 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="172" text-anchor="middle">POST /bc-authorize</text>
    <text class="fg-mxs" x="352" y="194" text-anchor="middle">login_hint · binding_message</text>
    <!-- hint resolution -->
    <path class="fg-edge fg-edge--accent" d="M512,246 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="252">map the hint to a subject</text>
    <text class="fg-mxs" x="568" y="274">HintResolver → subject</text>
    <!-- notification -->
    <path class="fg-edge" d="M512,344 H824" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="310" text-anchor="middle">notification service</text>
    <text class="fg-mxs" x="668" y="332" text-anchor="middle">Acme Coffee: approve $80?</text>
    <!-- auth_req_id -->
    <path class="fg-edge fg-edge--accent" d="M512,416 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="382" text-anchor="middle">200 · auth_req_id</text>
    <text class="fg-mxs" x="352" y="404" text-anchor="middle">expires_in: 600 · interval: 5</text>
    <!-- poll -->
    <path class="fg-edge" d="M192,566 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="532" text-anchor="middle">POST /token · poll</text>
    <text class="fg-mxs" x="352" y="554" text-anchor="middle">grant_type=…:ciba</text>
    <!-- pending -->
    <path class="fg-edge fg-edge--muted" d="M512,622 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="612" text-anchor="middle">400 · authorization_pending</text>
    <!-- approval -->
    <path class="fg-edge" d="M824,694 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="660" text-anchor="middle">user approves on the phone</text>
    <text class="fg-mxs" x="668" y="682" text-anchor="middle">approve(auth_req_id)</text>
    <!-- next poll -->
    <path class="fg-edge" d="M192,750 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="740" text-anchor="middle">POST /token · next poll</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M512,822 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="788" text-anchor="middle">200 · access_token</text>
    <text class="fg-mxs" x="352" y="810" text-anchor="middle">id_token · refresh_token?</text>
  </svg>
  <figcaption class="fig-note">The terminal and the phone never talk to each other; the OP is the only thing both touch. That is why <code>binding_message</code> matters: it is the one string the person at the terminal and the person holding the phone can compare.</figcaption>
</figure>

The consumption device never holds a credential for the user. The user never types into the consumption device. The authentication device — which already authenticated Alice when she signed into her banking app — is the only place where consent is exercised.

## CIBA vs Device Code — when do you pick which?

Both flows have two devices. The difference is **whether the user knows the consumption device is asking**.

| | Device Code | CIBA |
|---|---|---|
| **Who initiates the trust?** | The user types `user_code` on the verification page. | The consumption device asks the OP; the embedder's authentication-device service presents the request to the user. |
| **Does the user have to discover the URL?** | Yes — `verification_uri` is shown on screen. | No — the deployment already knows the authentication device. |
| **Trust model on consumption side?** | Anonymous device asking the user to bind it. | Pre-registered device asking the OP to ask the user to confirm. |
| **Typical surface** | Smart TV, console, CLI, IoT pairing. | POS, call center, fraud-confirmation, in-app payments. |
| **Identifier the user types** | `user_code` (e.g. `BDWP-HQPK`). | None — the OP has the user's identifier already (`login_hint`). |
| **Risk of misdirection** | Low — the URL is on the device's screen. | Medium — the user must trust the out-of-band notification text matches the consumption surface. **Use `binding_message`** so the prompt on the phone shows what the POS is requesting. |

If the user is **standing in front of the device** but the device cannot show a screen with a code — choose CIBA. If the user is **across the room from the device** and the device has a screen — choose device code. CIBA's authentication device must already know the user; device code's verification page works for any signed-in browser session.

## Hints — telling the OP "which user"

The consumption device cannot authenticate the user, so it has to tell the OP **which user to identify for the approval service**. CIBA Core §7.1 lists three hint kinds; the OP supports all three through a single `HintResolver` interface:

```go
op.WithCIBA(
    op.WithCIBAHintResolver(op.HintResolverFunc(
        func(ctx context.Context, kind op.HintKind, value string) (string, error) {
            switch kind {
            case op.HintLoginHint:
                // value = "alice", "alice@example.com", account number, etc.
                return resolveLoginHint(ctx, value)
            case op.HintIDTokenHint:
                // value is the OP-verified subject, not the raw JWT.
                // The OP checked its signature, issuer, and the authenticated
                // client's audience. It intentionally does not enforce exp.
                return lookupSubject(ctx, value)
            case op.HintLoginHintToken:
                // value = a signed JWT issued by another system you trust.
                return verifyAndMap(ctx, value)
            }
            return "", op.ErrUnknownCIBAUser
        },
    )),
)
```

Returning `op.ErrUnknownCIBAUser` collapses the wire response to `unknown_user_id`. Any other error becomes `login_required`. The handler is required — `op.WithCIBA` without a resolver fails at `op.New`.

For `HintIDTokenHint`, the OP verifies the JWT against its own keys, requires its issuer and the authenticated client's audience, and passes only the verified `sub` to `Resolve`. It intentionally does not check `exp`, and it refuses a token whose `typ` header is anything other than absent or `JWT`, so a logout token or access token cannot pass as a hint. A client registered with pairwise subjects is rejected before `Resolve`, because the per-sector `sub` is not reversible; that client must use `login_hint` or `login_hint_token` instead. Never parse the raw JWT in the resolver.

## binding_message — the anti-confusion field

CIBA `binding_message` is a short string the consumption device sends with `/bc-authorize`. The OP forwards it to the authentication device so the prompt on the user's phone shows the same text the cashier sees on the POS:

> **Acme POS terminal #14**: Approve $80.00 at Acme Coffee?
>
> [ Approve ] [ Deny ]

Without `binding_message` the user has only the OP's generic prompt to go on, and a phishing flow ("we noticed unusual activity, please approve this notification") becomes much more plausible. Treat `binding_message` as mandatory in the embedder's UX even though the spec marks it optional.

The OP accepts at most 50 characters and refuses control characters (`400 invalid_binding_message`). It forwards the string exactly as received and does not HTML-escape it, so both devices can show identical text; escape it for the rendering context yourself.

## What the endpoints answer

`/bc-authorize` rejects at the request:

| Condition | Response |
|---|---|
| The hint does not resolve (`op.ErrUnknownCIBAUser`) | `400 unknown_user_id` |
| The resolver returns any other error | `login_required` |
| `id_token_hint` from a pairwise client | `400 invalid_request` |
| `binding_message` too long or containing control characters | `400 invalid_binding_message` |
| `user_code` or `client_notification_token` present | `400 invalid_request` (neither is supported) |
| `requested_expiry` not a positive integer, or above 10 minutes under `profile.FAPICIBA` | `400 invalid_request` (outside FAPI-CIBA a value above `WithCIBAMaxExpiresIn` is clamped) |
| Request object whose client JWKS cannot be fetched | `503` |

`/token` with `grant_type=urn:openid:params:grant-type:ciba` answers with the same four polling codes as the [device flow](./device-code): `authorization_pending`, `slow_down`, `access_denied` (denied on the authentication device, or five `slow_down` offences) and `expired_token`.

The lifetime of an `auth_req_id` is 600 s by default (`requested_expiry` can shorten it), and `interval` is 5 s. Tune them with `op.WithCIBADefaultExpiresIn`, `op.WithCIBAMaxExpiresIn` and `op.WithCIBAPollInterval`; negative values and, under `profile.FAPICIBA`, an expiry above 10 minutes make `op.New` fail.

When the approved request is redeemed, the OP records a consent grant for that client, as the device flow does. Introspection and `/userinfo` report the public (pairwise) subject, revoking the subject reaches the tokens, and a later `/auth` for the same scopes skips the consent screen.

## See it run

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) ships a complete POS-terminal scenario: the POS posts to `/bc-authorize`, the staff phone (simulated by a goroutine that calls `CIBARequestStore.Approve` directly) approves the request, and the POS polls until the OP issues a token. End-to-end runtime is around five seconds.

```sh
(cd examples/32-ciba-pos && GOWORK=off go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring + `HintResolver`, `rp.go` for the POS-side polling, `device.go` for the simulated phone approval).

## Read next

- [Use case: CIBA wiring](/use-cases/ciba) — `op.WithCIBA`, the `HintResolver` contract, FAPI-CIBA profile constraints, and how the embedder's authentication-device callback talks back to `CIBARequestStore.Approve`.
- [Authorization code + PKCE](/concepts/authorization-code-pkce) — the flow to use when the user is at the client.
- [Device Code primer](/concepts/device-code) — the conceptual sibling for "user is on a different surface" but with a code-on-screen ceremony.
