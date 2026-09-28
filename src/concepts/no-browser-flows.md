---
title: No-browser flows — CIBA vs Device Code
description: Compare CIBA poll mode with RFC 8628 Device Code — hint-based identity, opaque verification attempts, and the different embedder responsibilities.
pageClass: pg-concepts-no-browser-flows
---

# No-browser flows: CIBA vs Device Code

[Device Code (RFC 8628)](/concepts/device-code) and [CIBA (OpenID Connect Client-Initiated Backchannel Authentication 1.0)](/concepts/ciba) are the two grants the spec ecosystem provides for the same broad situation: the device that wants the access token **cannot host a usable browser**. Smart TVs, gaming consoles, CLI tools, IoT devices, voice assistants, POS terminals, call-center panels, server-side processes that act on behalf of a person.

From a distance the two flows look like the same shape — "two surfaces meet at the OP, the user approves on a phone". They are not. They differ in **who initiates the request** and **how the user is identified to the OP**, and that single distinction drives almost every other difference: the wire endpoints, the polling subject, the anti-phishing primitive, the regulatory profile.

This page is the selection guide. The mechanics live on the dedicated pages for [Device Code](/concepts/device-code) and [CIBA](/concepts/ciba).

## The two flows in one paragraph each

**Device Code (RFC 8628).** The device with no browser asks the OP for a one-time code, displays it on its own screen, and tells the user "open this URL on your phone and enter this code". The user authenticates on whatever browser they happen to have at hand and approves. Meanwhile the device polls `/token` until approval lands. The user's identity is **discovered during the flow** — the OP did not know who would walk up to the TV.

**CIBA (Core 1.0).** The RP already knows who the user is — `login_hint` (`alice@example.com`, an account number), `id_token_hint` (a previously issued ID token), or `login_hint_token` (a signed JWT from an upstream system). The RP asks the OP "please authenticate this user out-of-band". The embedder's notification and authentication-device services notify the user; the OP stores the request and the RP polls until approval lands. This library implements poll mode only — ping and push delivery modes are not provided. The user's identity is **supplied upfront by the RP** so the deployment can route the approval to the right authentication device.

## Comparison

| Aspect | Device Code (RFC 8628) | CIBA (Core 1.0) |
|---|---|---|
| Trigger origin | The device with no browser (input device → OP) | The RP / API client (RP → OP) |
| User identification | The user types `user_code` on a separate browser | The RP supplies `login_hint` / `id_token_hint` / `login_hint_token` upfront |
| User device | Any browser the user happens to have | A device pre-registered by the deployment for out-of-band approval |
| Anti-phishing primitive | `user_code` displayed by the device + verification URI host visible to the user | `binding_message` shown on the user's authentication device |
| Browser involvement | Yes (on the user's phone) | Optional / none (the embedder's authentication device confirms) |
| Polling subject | The device with no browser | The RP |
| Spec endpoint | `/device_authorization` | `/bc-authorize` |
| Token `grant_type` | `urn:ietf:params:oauth:grant-type:device_code` | `urn:openid:params:grant-type:ciba` |
| Typical use cases | TV apps, CLI tools, kiosks, voice assistants, low-input IoT | Strong customer authentication (PSD2-style), finance / health out-of-band approval, customer-support flows that reset access without sharing a screen |
| Library status | RFC 8628 — full support, gated by `op.WithGrants(grant.DeviceCode)` plus `op.WithDeviceCodeGrant()` | OIDC CIBA Core 1.0 — poll mode only; discovery advertises `poll` only; ping and push are not implemented |
| Brute-force defense | `op/devicecodekit` opaque-attempt-key limiter plus record lockout (`MaxUserCodeStrikes`) | Poll-abuse lockout — rate-limited `/token` retries per `auth_req_id`, `AuditCIBAPollAbuseLockout` on crossing the cap |
| FAPI profile | Device Code is outside the FAPI 2.0 Security Profile's analyzed authorization flows | FAPI-CIBA is a separate profile from FAPI 2.0 Security Profile / Message Signing; this library's CIBA setting requires JAR, DPoP or mTLS, and a 10-minute access-token TTL ceiling |

::: tip Two grants, one symptom
Both grants exist because the canonical `authorization_code + PKCE` flow assumes a usable browser on the device that wants the token. That assumption breaks for TVs, CLIs, IoT, voice assistants, and for backend services acting on a user's behalf. RFC 8628 and CIBA solve **two different shapes** of "the browser is somewhere else".
:::

## Picking between them — decision tree

Run through these four questions in order. The first one usually settles it.

<figure class="fig">
  <div class="fig-head">CIBA or Device Code — four questions</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-decision-title" viewBox="0 0 960 470" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-decision-title">Four sequential questions that decide between CIBA and the Device Authorization Grant: whether the RP already knows the user, whether the device has a screen, whether the user has a pre-registered authentication device, and whether out-of-band approval is a regulatory requirement.</title>
    <!-- 1 -->
    <rect class="fg-box" x="36" y="24" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="52">Does the RP already know which user this is</text>
    <text class="fg-xs" x="56" y="74">it can supply a login_hint before the flow starts</text>
    <path class="fg-edge" d="M434,57 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="50" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="28" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="52">CIBA</text>
    <text class="fg-xs" x="550" y="72">the OP can address the user without a redirect</text>
    <path class="fg-edge" d="M233,94 V116" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="110">no</text>
    <!-- 2 -->
    <rect class="fg-box" x="36" y="120" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="148">Does the device that wants the token have a screen</text>
    <text class="fg-xs" x="56" y="170">enough to print a short code and a URL on</text>
    <path class="fg-edge" d="M434,153 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="146" text-anchor="middle">yes</text>
    <rect class="fg-box" x="530" y="124" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="148">Device Code</text>
    <text class="fg-xs" x="550" y="168">the user carries the code to a second screen</text>
    <path class="fg-edge" d="M233,190 V212" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="206">no</text>
    <!-- 3 -->
    <rect class="fg-box" x="36" y="216" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="244">Has the user pre-registered an authentication device</text>
    <text class="fg-xs" x="56" y="266">a phone the OP already knows how to reach</text>
    <path class="fg-edge" d="M434,249 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="242" text-anchor="middle">no</text>
    <rect class="fg-box" x="530" y="220" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="244">Device Code</text>
    <text class="fg-xs" x="550" y="264">nothing to notify — the user has to come to it</text>
    <path class="fg-edge" d="M233,286 V308" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="302">yes</text>
    <!-- 4 -->
    <rect class="fg-box" x="36" y="312" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="340">Regulated finance or health, out-of-band approval</text>
    <text class="fg-xs" x="56" y="362">approval must happen away from the transacting device</text>
    <path class="fg-edge" d="M434,345 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="338" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="530" y="316" width="394" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="550" y="340">CIBA</text>
    <text class="fg-xs" x="550" y="360">binding_message ties the two devices together</text>
    <path class="fg-edge" d="M233,382 V404" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="398">no</text>
    <!-- default -->
    <rect class="fg-box" x="36" y="408" width="888" height="54" rx="8"/>
    <text class="fg-t2" x="56" y="430">Default: Device Code</text>
    <text class="fg-xs" x="56" y="450">it asks less of your infrastructure — no hint resolver, no notification channel to operate</text>
  </svg>
  <figcaption class="fig-note">The dividing line is who starts the conversation. Device Code puts the user in charge of finding the OP; CIBA has the OP reach out to a device it was told about in advance, which only works if you already run that channel.</figcaption>
</figure>

**1. Does the RP know who the user is *before* the flow starts?**

- **Yes** → CIBA. The RP already has `login_hint` (or an ID token, or a hint token) and can send it with `/bc-authorize`. The user does not need to type anything to identify themselves.
- **No** → Device Code. The user identifies themselves during the flow by signing in on the verification page; the OP discovers who they are when the user authenticates on their phone.

**2. Is there a screen on the device that wants the token?**

- **Yes** → Device Code can display the `user_code` and `verification_uri` directly. This is the canonical TV / console / CLI case.
- **No (voice assistant, headless IoT)** → Both can work. Device Code can emit the `user_code` via TTS or print it as a QR (`verification_uri_complete`). CIBA uses a separate authentication device; the embedder's notification service delivers the approval prompt, so the consumption device needs no display.

**3. Does the user have a registered authentication device?**

- **CIBA assumes yes.** Without a registered device the embedder's approval service has no destination. Provisioning that device — the banking app, the staff phone, the regulator-issued authenticator — is part of the deployment.
- **Device Code does not assume.** Any browser session the user can sign into works. The user's phone, a colleague's laptop, a kiosk in the store.

**4. Is this a regulated finance / health context with out-of-band approval requirements?**

- **CIBA is designed for it.** Historical FAPI-CIBA-ID1 builds on FAPI 1.0 and mTLS. This library's `profile.FAPICIBA` requires JAR, accepts DPoP or mTLS for sender constraint, and caps access-token lifetime at 10 minutes; that preset does not by itself establish ID1 conformance. `binding_message` helps the user recognize the request they are approving.
- **Device Code is general-purpose.** It can be deployed to good effect, but it is not the shape regulators normally point to for SCA.

If you are still unsure after running the questions: default to **Device Code** for consumer-facing "the device has a screen but no browser" cases, and **CIBA** for "the RP knows the user and just needs them to approve out-of-band".

## Sequence diagrams

### Device Code (RFC 8628)

<figure class="fig">
  <div class="fig-head">Device Code (RFC 8628)</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-devicecode-title" viewBox="0 0 960 470" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-devicecode-title">The Device Authorization Grant. A device with no browser asks for a device code and a short user code, prints the code and a URL, and polls the token endpoint while the user approves from any other browser.</title>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="454"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="454"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="454"/>
    <rect class="fg-box" x="55" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">Device — no browser</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">TV · CLI · IoT</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="735" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">User's browser</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">any phone or laptop</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="96" r="8.5"/>
    <text class="fg-badge-t" x="15" y="99" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,96 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="90" text-anchor="middle">POST /device_authorization</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="130" r="8.5"/>
    <text class="fg-badge-t" x="15" y="133" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,130 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="124" text-anchor="middle">200 · { device_code, user_code, verification_uri }</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="176" r="8.5"/>
    <text class="fg-badge-t" x="15" y="179" text-anchor="middle">3</text>
    <rect class="fg-box fg-box--sub" x="55" y="156" width="330" height="40" rx="6"/>
    <text class="fg-xs" x="71" y="181">the device prints the <tspan class="fg-accent">user_code</tspan> and the URL to visit</text>
    <!-- par -->
    <rect class="fg-frame" x="44" y="216" width="896" height="176" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="216" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="229">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="322" x2="940" y2="322"/>
    <rect class="fg-frame" x="64" y="246" width="600" height="66" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="246" width="176" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="259">loop · every interval s</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="278" r="8.5"/>
    <text class="fg-badge-t" x="15" y="281" text-anchor="middle">4</text>
    <path class="fg-edge" d="M150,278 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="272" text-anchor="middle">POST /token · grant_type=…:device_code</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="304" r="8.5"/>
    <text class="fg-badge-t" x="15" y="307" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--muted" d="M500,304 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="298" text-anchor="middle">400 · authorization_pending</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="364" r="8.5"/>
    <text class="fg-badge-t" x="15" y="367" text-anchor="middle">6</text>
    <path class="fg-edge" d="M830,364 H500" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="665" y="344" text-anchor="middle">open verification_uri, enter the user_code,</text>
    <text class="fg-xs" x="665" y="357" text-anchor="middle">log in and approve</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="418" r="8.5"/>
    <text class="fg-badge-t" x="15" y="421" text-anchor="middle">7</text>
    <path class="fg-edge" d="M150,418 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="412" text-anchor="middle">POST /token — the next poll</text>
    <!-- 8 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="448" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="451" text-anchor="middle">8</text>
    <path class="fg-edge fg-edge--accent" d="M500,448 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="442" text-anchor="middle">200 · { access_token, id_token? }</text>
  </svg>
  <figcaption class="fig-note">The device and the browser are never connected to each other. The only thing that travels between them is the <code>user_code</code>, carried by a person reading one screen and typing into another.</figcaption>
</figure>

### CIBA (Core 1.0, poll mode)

<figure class="fig">
  <div class="fig-head">CIBA (OIDC Core 1.0, poll mode)</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-ciba-title" viewBox="0 0 960 470" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-ciba-title">CIBA in poll mode. The RP supplies a login hint at the backchannel authentication endpoint, the OP resolves it to a subject, the embedder's notification service reaches the user's pre-registered device, and the RP polls until the approval lands.</title>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="454"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="454"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="454"/>
    <rect class="fg-box" x="55" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">RP / API client</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">POS · call-centre panel</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="735" y="16" width="190" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">User's auth device</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">pre-registered</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="102" r="8.5"/>
    <text class="fg-badge-t" x="15" y="105" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,102 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="82" text-anchor="middle">POST /bc-authorize</text>
    <text class="fg-mxs" x="325" y="95" text-anchor="middle">login_hint=alice · binding_message</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="132" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="135" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,124 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="136">HintResolver → subject</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="180" r="8.5"/>
    <text class="fg-badge-t" x="15" y="183" text-anchor="middle">3</text>
    <path class="fg-edge" d="M500,180 H830" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="665" y="160" text-anchor="middle">the embedder's notification service</text>
    <text class="fg-mxs" x="665" y="173" text-anchor="middle">"Approve $80 at Acme Coffee?"</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="210" r="8.5"/>
    <text class="fg-badge-t" x="15" y="213" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M500,210 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="204" text-anchor="middle">200 · { auth_req_id, expires_in, interval }</text>
    <!-- par -->
    <rect class="fg-frame" x="44" y="230" width="896" height="162" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="230" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="243">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="330" x2="940" y2="330"/>
    <rect class="fg-frame" x="64" y="258" width="600" height="62" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="258" width="176" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="271">loop · every interval s</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="288" r="8.5"/>
    <text class="fg-badge-t" x="15" y="291" text-anchor="middle">5</text>
    <path class="fg-edge" d="M150,288 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="282" text-anchor="middle">POST /token · grant_type=…:ciba</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="312" r="8.5"/>
    <text class="fg-badge-t" x="15" y="315" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--muted" d="M500,312 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="306" text-anchor="middle">400 · authorization_pending</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="366" r="8.5"/>
    <text class="fg-badge-t" x="15" y="369" text-anchor="middle">7</text>
    <path class="fg-edge" d="M830,366 H500" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="665" y="346" text-anchor="middle">the user approves on the device</text>
    <text class="fg-mxs" x="665" y="359" text-anchor="middle">Approve(auth_req_id)</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="418" r="8.5"/>
    <text class="fg-badge-t" x="15" y="421" text-anchor="middle">8</text>
    <path class="fg-edge" d="M150,418 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="412" text-anchor="middle">POST /token — the next poll</text>
    <!-- 9 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="448" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="451" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M500,448 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="442" text-anchor="middle">200 · { access_token, id_token, refresh_token? }</text>
  </svg>
  <figcaption class="fig-note">Compared with the figure above, the difference is step 3: here the OP addresses the user, so it needs both a hint it can resolve and a channel it can send on. Steps 5 to 9 are the same polling loop either way.</figcaption>
</figure>

The shape is similar enough to map between the two mentally. The decisive difference is the diagonal arrow: in Device Code the user **walks to the OP** with a code in hand; in CIBA the OP **reaches out to a device the user already trusts**.

## Threat model side-by-side

**Phishing — attacker tricks the user into approving the *attacker's* request.**

- Device Code: the user verifies the URL host they are typing the code into. The `user_code` itself has no per-session secret value (entropy is intentional but moderate). If the user mistypes the host or clicks a link in a phishing email, the same `user_code` works on the attacker's site.
- CIBA: `binding_message` is attached to `/bc-authorize` and shown on the user's authentication device. The user sees "Acme POS terminal #14: Approve $80 at Acme Coffee?" before approving. An out-of-band prompt without context ("we noticed unusual activity, approve?") is the failure mode.

**Replay / brute-force on `user_code`.**

- Device Code: the `user_code` is short (`BDWP-HQPK`) on purpose so users can type it. That makes it brute-forceable in principle. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) — the first manual entry must call `VerifyUserCodeByAttemptKey` with an opaque server-side ceremony key, then `ApproveUserCode` or `DenyUserCode`; record-bound helpers still enforce `MaxUserCodeStrikes` (default 5). Embedder verification pages **MUST** route through the helper and must not use the raw `user_code` as the attempt key.
- CIBA: there is no user-typed code. The `auth_req_id` is opaque and OP-issued.

**Replay / abuse on `/token` polling.**

- Both flows return `authorization_pending` while the user is deciding and `slow_down` if the device polls faster than the negotiated `interval`. RFC 8628 §3.5 makes honoring the new `interval` a MUST; the OP persists the value atomically with `LastPolledAt` so a multi-replica deployment cannot reset it.
- CIBA additionally has a poll-abuse lockout: when the per-`auth_req_id` violation counter crosses the threshold the request is denied with `reason="poll_abuse"` and the audit catalogue records `AuditCIBAPollAbuseLockout`.

## What this library implements today

**Device Code (RFC 8628).** Full support, gated by `op.WithGrants(grant.DeviceCode)` plus `op.WithDeviceCodeGrant()`. The verification ceremony page (where the user types the `user_code`) is **embedder-hosted**; the first manual entry should call `devicecodekit.VerifyUserCodeByAttemptKey` with an opaque server-side ceremony key, followed by `ApproveUserCode` / `DenyUserCode`. Retain `devicecodekit.Deps` and pass it by pointer; its default limiter is process-local, so multi-instance deployments need a shared atomic `AttemptLimiter`. Audit records from these helpers go through `Deps.AuditLogger`. Audit catalogue:

- `AuditDeviceAuthorizationIssued`, `AuditDeviceAuthorizationRejected`, `AuditDeviceAuthorizationUnboundRejected`
- `AuditDeviceCodeVerificationApproved`, `AuditDeviceCodeVerificationDenied`, `AuditDeviceCodeUserCodeBruteForce`
- `AuditDeviceCodeTokenIssued`, `AuditDeviceCodeTokenRejected`, `AuditDeviceCodeTokenSlowDown`
- `AuditDeviceCodeRevoked` (from the public `Revoke` helper)

**CIBA (Core 1.0).** Poll mode only; discovery advertises `poll` only. Wire it with `op.WithGrants(grant.CIBA)` plus `op.WithCIBA(op.WithCIBAHintResolver(...))`. The `HintResolver` is the embedder hook that maps the inbound hint (`login_hint`, `id_token_hint`, `login_hint_token`) to a subject. For `id_token_hint`, the OP verifies signature, issuer, and authenticated-client audience before calling the resolver and passes only the verified `sub`; it intentionally does not check `exp`, and rejects pairwise clients before resolution. Ping and push delivery modes are not provided. Audit catalogue:

- `AuditCIBAAuthorizationIssued`, `AuditCIBAAuthorizationRejected`, `AuditCIBAAuthorizationUnboundRejected`
- `AuditCIBAPollAbuseLockout`
- `AuditCIBATokenIssued`, `AuditCIBATokenRejected`, `AuditCIBATokenSlowDown`
- `AuditCIBAPollObservationFailed` (the token endpoint observed a state transition it could not act on cleanly)

The authentication-device callback is an embedder path that calls the CIBA substore directly. The library does not emit `AuditCIBAAuthDeviceApproved` or `AuditCIBAAuthDeviceDenied` for those calls; those catalog names are available for deployment-owned telemetry.

## Read next

- [Device Code primer](/concepts/device-code) — RFC 8628 mechanics, polling responses, `user_code` brute-force gate.
- [CIBA primer](/concepts/ciba) — CIBA Core 1.0 mechanics, hint kinds, `binding_message`, FAPI-CIBA profile.
- [Use case: device-code wiring](/use-cases/device-code) — `op.WithDeviceCodeGrant`, the verification page contract, cascade revocation.
- [Use case: CIBA wiring](/use-cases/ciba) — `op.WithCIBA`, the `HintResolver` contract, FAPI-CIBA constraints.
- [Audit events](/reference/audit-events) — full catalogue with payload shapes.
