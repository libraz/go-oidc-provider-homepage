---
title: CIBA — Client-Initiated Backchannel Authentication
description: When the consumption channel and the authentication channel are different — POS terminals, call centers, fraud confirmations — without a code on screen.
---

# CIBA — Client-Initiated Backchannel Authentication

CIBA solves a different shape of problem than the [device flow](/concepts/device-code). With device code, two surfaces meet at the OP through a short code shown on the device. With **CIBA**, the device that initiates the request is **not visible to the user at all** — the user is pushed (or rung up, or notified) on a **separate authentication device** they already trust.

The canonical setup:

- **Consumption device** — a POS terminal, a call-center agent screen, an in-store kiosk, a bank's wire-transfer reviewer panel. It knows *who* the user is supposed to be (loyalty card, phone number, account number) but cannot authenticate them.
- **Authentication device** — the user's phone, with a banking app already installed and signed in. It receives a push notification ("Approve $80.00 at Acme Coffee?") and the user taps **Approve** or **Deny**.

The consumption device never asks the user for credentials — it just asks the OP "please ask Alice to approve this on her phone".

::: details Specs referenced on this page
- [OpenID Connect Client-Initiated Backchannel Authentication Flow — Core 1.0](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html) — the CIBA Core spec
- [FAPI-CIBA-ID1](https://openid.net/specs/openid-financial-api-ciba-ID1.html) — the FAPI profile that pins JAR + DPoP/mTLS + 10-minute access TTL
:::

::: details Vocabulary refresher
- **`auth_req_id`** — the opaque identifier returned from `/bc-authorize`. The consumption device polls `/token` with this; the authentication device approves against the same identifier.
- **Hint** — how the consumption device tells the OP **which user** to ask. CIBA Core §7.1 defines three:
  - `login_hint` — opaque value the embedder maps to a subject (`alice@example.com`, account number, …).
  - `id_token_hint` — a previously issued ID token whose `sub` identifies the user.
  - `login_hint_token` — a signed JWT the embedder verifies and maps to a subject (e.g. issued by another upstream system).
- **Delivery mode** — how the OP tells the consumption device that approval landed:
  - **poll** — the device polls `/token` with `auth_req_id`; this is the only delivery mode the library implements today.
  - **ping** — the OP calls back to the device's HTTPS endpoint with `auth_req_id`, then the device polls `/token`. (Deferred to v2+.)
  - **push** — the OP delivers the token directly to the device's HTTPS endpoint. (Deferred to v2+.)
:::

## How the flow runs (poll mode)

<style scoped>
.ciba-tx{fill:currentColor;stroke:none;}
.ciba-fb{font-family:var(--vp-font-family-base);}
.ciba-fm{font-family:var(--vp-font-family-mono);}
.ciba-accent{stroke:var(--vp-c-brand-2);}
.ciba-sec{stroke:#7c6fb0;}
.dark .ciba-sec{stroke:#b3a7e0;}
.ciba-accent-f{fill:var(--vp-c-brand-2);}
.ciba-sec-f{fill:#7c6fb0;}
.dark .ciba-sec-f{fill:#b3a7e0;}
.ciba-muted{opacity:.62;}
.ciba-life{stroke-width:1.5;stroke-dasharray:3 4;opacity:.5;}
.ciba-frag{stroke-width:1.4;stroke-dasharray:5 4;opacity:.55;}
</style>

<svg role="img" aria-labelledby="ciba-poll-flow-title" viewBox="0 0 760 456" width="760" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
<title id="ciba-poll-flow-title">CIBA poll-mode sequence: the POS terminal calls /bc-authorize, the OP resolves the hint and pushes to the staff phone, and the POS polls /token until the user approves and a token is issued.</title>
<line class="ciba-life" x1="93" y1="50" x2="93" y2="446"/>
<line class="ciba-life ciba-accent" x1="430" y1="50" x2="430" y2="446"/>
<line class="ciba-life ciba-sec" x1="680" y1="50" x2="680" y2="446"/>
<rect x="18" y="10" width="150" height="40" rx="6"/>
<rect class="ciba-accent" x="352" y="10" width="156" height="40" rx="6"/>
<rect class="ciba-sec" x="605" y="10" width="150" height="40" rx="6"/>
<text class="ciba-tx ciba-fb" x="93" y="28" text-anchor="middle" font-size="11.5" font-weight="600">Consumption device</text>
<text class="ciba-tx ciba-fb ciba-muted" x="93" y="42" text-anchor="middle" font-size="10.5">(POS terminal)</text>
<text class="ciba-tx ciba-fb ciba-accent-f" x="430" y="28" text-anchor="middle" font-size="11.5" font-weight="600">OP</text>
<text class="ciba-tx ciba-fm ciba-accent-f ciba-muted" x="430" y="42" text-anchor="middle" font-size="10.5">go-oidc-provider</text>
<text class="ciba-tx ciba-fb ciba-sec-f" x="680" y="28" text-anchor="middle" font-size="11.5" font-weight="600">Authentication device</text>
<text class="ciba-tx ciba-fb ciba-muted" x="680" y="42" text-anchor="middle" font-size="10.5">(staff phone)</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="100" font-size="10">1</text>
<text class="ciba-tx ciba-fm" x="261" y="71" text-anchor="middle" font-size="11">POST /bc-authorize</text>
<text class="ciba-tx ciba-fm ciba-muted" x="261" y="84" text-anchor="middle" font-size="10.5">login_hint=alice · scope=openid · binding_message</text>
<line x1="93" y1="97" x2="430" y2="97"/>
<polyline points="423,93 430,97 423,101"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="118" font-size="10">2</text>
<path class="ciba-accent" d="M430 108 H462 V122 H430"/>
<polyline class="ciba-accent" points="437,118 430,122 437,126"/>
<text class="ciba-tx ciba-fm ciba-accent-f" x="470" y="116" font-size="11">HintResolver → sub=alice123</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="173" font-size="10">3</text>
<text class="ciba-tx ciba-fb" x="555" y="147" text-anchor="middle" font-size="11">out-of-band push</text>
<text class="ciba-tx ciba-fb ciba-sec-f" x="555" y="160" text-anchor="middle" font-size="10.5">Approve $80 at Acme Coffee?</text>
<line class="ciba-accent" x1="430" y1="170" x2="680" y2="170"/>
<polyline class="ciba-accent" points="673,166 680,170 673,174"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="207" font-size="10">4</text>
<text class="ciba-tx ciba-fm" x="261" y="192" text-anchor="middle" font-size="11">200 · { auth_req_id, expires_in: 600, interval: 5 }</text>
<line class="ciba-accent" x1="430" y1="204" x2="93" y2="204"/>
<polyline class="ciba-accent" points="100,200 93,204 100,208"/>
<rect class="ciba-frag" x="30" y="216" width="710" height="156" rx="4"/>
<text class="ciba-tx ciba-fm ciba-muted" x="40" y="230" font-size="10" font-weight="600">par</text>
<rect class="ciba-frag" x="46" y="234" width="430" height="74" rx="4"/>
<text class="ciba-tx ciba-fb ciba-muted" x="54" y="247" font-size="10">loop · poll every interval s</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="277" font-size="10">5</text>
<text class="ciba-tx ciba-fm" x="261" y="262" text-anchor="middle" font-size="11">POST /token · grant_type=…:ciba · auth_req_id</text>
<line x1="93" y1="274" x2="430" y2="274"/>
<polyline points="423,270 430,274 423,278"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="301" font-size="10">6</text>
<text class="ciba-tx ciba-fm" x="261" y="288" text-anchor="middle" font-size="11">400 · { error: authorization_pending }</text>
<line class="ciba-accent" x1="430" y1="298" x2="93" y2="298"/>
<polyline class="ciba-accent" points="100,294 93,298 100,302"/>
<line class="ciba-frag" x1="30" y1="320" x2="740" y2="320"/>
<text class="ciba-tx ciba-fb ciba-muted" x="555" y="333" text-anchor="middle" font-size="10.5">User approves on phone</text>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="361" font-size="10">7</text>
<text class="ciba-tx ciba-fm" x="555" y="346" text-anchor="middle" font-size="11">approve(auth_req_id, sub=alice123)</text>
<line class="ciba-sec" x1="680" y1="358" x2="430" y2="358"/>
<polyline class="ciba-sec" points="437,354 430,358 437,362"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="411" font-size="10">8</text>
<text class="ciba-tx ciba-fm" x="278" y="396" text-anchor="end" font-size="11">POST /token</text>
<text class="ciba-tx ciba-fb ciba-muted" x="284" y="396" font-size="10.5">(next poll)</text>
<line x1="93" y1="408" x2="430" y2="408"/>
<polyline points="423,404 430,408 423,412"/>
<text class="ciba-tx ciba-fm ciba-muted" x="8" y="439" font-size="10">9</text>
<text class="ciba-tx ciba-fm" x="261" y="424" text-anchor="middle" font-size="11">200 · { access_token, id_token, refresh_token? }</text>
<line class="ciba-accent" x1="430" y1="436" x2="93" y2="436"/>
<polyline class="ciba-accent" points="100,432 93,436 100,440"/>
</svg>

The consumption device never holds a credential for the user. The user never types into the consumption device. The authentication device — which already authenticated Alice when she signed into her banking app — is the only place where consent is exercised.

## CIBA vs Device Code — when do you pick which?

Both flows have two devices. The difference is **whether the user knows the consumption device is asking**.

| | Device Code | CIBA |
|---|---|---|
| **Who initiates the trust?** | The user types `user_code` on the verification page. | The consumption device pushes a request to the OP; the user only sees a notification. |
| **Does the user have to discover the URL?** | Yes — `verification_uri` is shown on screen. | No — the OP knows where to push. |
| **Trust model on consumption side?** | Anonymous device asking the user to bind it. | Pre-registered device asking the OP to ask the user to confirm. |
| **Typical surface** | Smart TV, console, CLI, IoT pairing. | POS, call center, fraud-confirmation, in-app payments. |
| **Identifier the user types** | `user_code` (e.g. `BDWP-HQPK`). | None — the OP has the user's identifier already (`login_hint`). |
| **Risk of misdirection** | Low — the URL is on the device's screen. | Medium — the user must trust the push notification's text matches the consumption surface. **Use `binding_message`** so the prompt on the phone shows what the POS is requesting. |

If the user is **standing in front of the device** but the device cannot show a screen with a code — choose CIBA. If the user is **across the room from the device** and the device has a screen — choose device code. CIBA's authentication device must already know the user; device code's verification page works for any signed-in browser session.

## Hints — telling the OP "which user"

The consumption device cannot authenticate the user, so it has to tell the OP **which user to push to**. CIBA Core §7.1 lists three hint kinds; the OP supports all three through a single `HintResolver` interface:

```go
op.WithCIBA(
    op.WithCIBAHintResolver(op.HintResolverFunc(
        func(ctx context.Context, kind op.HintKind, value string) (string, error) {
            switch kind {
            case op.HintLoginHint:
                // value = "alice", "alice@example.com", account number, etc.
                return resolveLoginHint(ctx, value)
            case op.HintIDTokenHint:
                // value = a previously issued ID token (already verified by the OP).
                return claimsSubject(value)
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

## binding_message — the anti-confusion field

CIBA `binding_message` is a short string the consumption device sends with `/bc-authorize`. The OP forwards it to the authentication device so the prompt on the user's phone shows the same text the cashier sees on the POS:

> **Acme POS terminal #14**: Approve $80.00 at Acme Coffee?
>
> [ Approve ] [ Deny ]

Without `binding_message` the user has only the OP's generic prompt to go on, and a phishing flow ("we noticed unusual activity, please approve this push") becomes much more plausible. Treat `binding_message` as mandatory in the embedder's UX even though the spec marks it optional.

## See it run

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos) ships a complete POS-terminal scenario: the POS posts to `/bc-authorize`, the staff phone (simulated by a goroutine that calls `CIBARequestStore.Approve` directly) approves the request, and the POS polls until the OP issues a token. End-to-end runtime is around five seconds.

```sh
(cd examples/32-ciba-pos && go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring + `HintResolver`, `rp.go` for the POS-side polling, `device.go` for the simulated phone approval).

## Read next

- [Use case: CIBA wiring](/use-cases/ciba) — `op.WithCIBA`, the `HintResolver` contract, FAPI-CIBA profile constraints, and how the embedder's authentication-device callback talks back to `CIBARequestStore.Approve`.
- [Device Code primer](/concepts/device-code) — the conceptual sibling for "user is on a different surface" but with a code-on-screen ceremony.
