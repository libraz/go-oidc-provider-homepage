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
  <div class="fig-head">CIBA in poll mode</div>
  <svg class="fig-svg" role="img" aria-labelledby="ciba-poll-title" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg">
    <title id="ciba-poll-title">CIBA in poll mode. The point-of-sale terminal calls the backchannel authentication endpoint, the OP resolves the login hint to a subject, the embedder's notification service reaches the staff phone, and the terminal polls the token endpoint until the user approves.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="150" y1="62" x2="150" y2="524"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="524"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="524"/>
    <!-- actors -->
    <rect class="fg-box" x="50" y="16" width="200" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">Consumption device</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">POS terminal</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="730" y="16" width="200" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">Authentication device</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">staff phone</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="96" r="8.5"/>
    <text class="fg-badge-t" x="15" y="99" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,96 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="76" text-anchor="middle">POST /bc-authorize</text>
    <text class="fg-mxs" x="325" y="89" text-anchor="middle">login_hint=alice · scope=openid · binding_message</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="126" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="129" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,118 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="542" y="122">resolve the hint to a subject</text>
    <text class="fg-mxs" x="542" y="135">HintResolver → sub=alice123</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="184" r="8.5"/>
    <text class="fg-badge-t" x="15" y="187" text-anchor="middle">3</text>
    <path class="fg-edge" d="M500,184 H830" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="665" y="164" text-anchor="middle">the embedder's notification service</text>
    <text class="fg-mxs" x="665" y="177" text-anchor="middle">"Approve $80 at Acme Coffee?"</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="216" r="8.5"/>
    <text class="fg-badge-t" x="15" y="219" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M500,216 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="210" text-anchor="middle">200 · { auth_req_id, expires_in: 600, interval: 5 }</text>
    <!-- par fragment -->
    <rect class="fg-frame" x="44" y="242" width="896" height="196" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="242" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="255">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="362" x2="940" y2="362"/>
    <!-- loop fragment -->
    <rect class="fg-frame" x="64" y="272" width="600" height="80" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="272" width="176" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="285">loop · every interval s</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="308" r="8.5"/>
    <text class="fg-badge-t" x="15" y="311" text-anchor="middle">5</text>
    <path class="fg-edge" d="M150,308 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="302" text-anchor="middle">POST /token · grant_type=…:ciba · auth_req_id</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="338" r="8.5"/>
    <text class="fg-badge-t" x="15" y="341" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--muted" d="M500,338 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="332" text-anchor="middle">400 · { error: authorization_pending }</text>
    <!-- 7 -->
    <text class="fg-xs" x="76" y="386">meanwhile, out of band: the user approves on the phone</text>
    <circle class="fg-badge" cx="15" cy="416" r="8.5"/>
    <text class="fg-badge-t" x="15" y="419" text-anchor="middle">7</text>
    <path class="fg-edge" d="M830,416 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="410" text-anchor="middle">approve(auth_req_id, sub=alice123)</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="472" r="8.5"/>
    <text class="fg-badge-t" x="15" y="475" text-anchor="middle">8</text>
    <path class="fg-edge" d="M150,472 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="466" text-anchor="middle">POST /token — the next poll</text>
    <!-- 9 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="510" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="513" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M500,510 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="504" text-anchor="middle">200 · { access_token, id_token, refresh_token? }</text>
  </svg>
  <figcaption class="fig-note">The terminal and the phone never talk to each other — the OP is the only thing both sides touch. That is why <code>binding_message</code> matters: it is the one string the person at the terminal and the person holding the phone can compare.</figcaption>
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

For `HintIDTokenHint`, the OP verifies the JWT against its own keys, requires its issuer and the authenticated client's audience, and passes only the verified `sub` to `Resolve`. It intentionally does not check `exp`. A client registered with pairwise subjects is rejected before `Resolve`, because the per-sector `sub` is not reversible; that client must use `login_hint` or `login_hint_token` instead. Never parse the raw JWT in the resolver.

## binding_message — the anti-confusion field

CIBA `binding_message` is a short string the consumption device sends with `/bc-authorize`. The OP forwards it to the authentication device so the prompt on the user's phone shows the same text the cashier sees on the POS:

> **Acme POS terminal #14**: Approve $80.00 at Acme Coffee?
>
> [ Approve ] [ Deny ]

Without `binding_message` the user has only the OP's generic prompt to go on, and a phishing flow ("we noticed unusual activity, please approve this notification") becomes much more plausible. Treat `binding_message` as mandatory in the embedder's UX even though the spec marks it optional.

## See it run

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) ships a complete POS-terminal scenario: the POS posts to `/bc-authorize`, the staff phone (simulated by a goroutine that calls `CIBARequestStore.Approve` directly) approves the request, and the POS polls until the OP issues a token. End-to-end runtime is around five seconds.

```sh
(cd examples/32-ciba-pos && GOWORK=off go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring + `HintResolver`, `rp.go` for the POS-side polling, `device.go` for the simulated phone approval).

## Read next

- [Use case: CIBA wiring](/use-cases/ciba) — `op.WithCIBA`, the `HintResolver` contract, FAPI-CIBA profile constraints, and how the embedder's authentication-device callback talks back to `CIBARequestStore.Approve`.
- [Device Code primer](/concepts/device-code) — the conceptual sibling for "user is on a different surface" but with a code-on-screen ceremony.
