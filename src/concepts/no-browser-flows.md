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
| Library status | RFC 8628 — full support, enabled by `op.WithDeviceCodeGrant()` | OIDC CIBA Core 1.0 — poll mode only; discovery advertises `poll` only; ping and push are not implemented |
| Brute-force defense | `op/devicecodekit` opaque-attempt-key limiter plus record lockout (`MaxUserCodeStrikes`, 5), and a poll-abuse lockout after five `slow_down` offences | Poll-abuse lockout — five `slow_down` offences per `auth_req_id` (`WithCIBAMaxPollViolations`), `AuditCIBAPollAbuseLockout` on crossing the cap. No user-typed code to guess |
| FAPI profile | Device Code is outside the FAPI 2.0 Security Profile's analyzed authorization flows | FAPI-CIBA is a separate profile from FAPI 2.0 Security Profile / Message Signing; this library's CIBA setting requires JAR, DPoP or mTLS, and a 10-minute ceiling on both access-token TTL and `auth_req_id` lifetime |

::: tip Two grants, one symptom
Both grants exist because the canonical `authorization_code + PKCE` flow assumes a usable browser on the device that wants the token. That assumption breaks for TVs, CLIs, IoT, voice assistants, and for backend services acting on a user's behalf. RFC 8628 and CIBA solve **two different shapes** of "the browser is somewhere else".
:::

## Picking between them — decision tree

Run through these four questions in order. The first one usually settles it.

<figure class="fig">
  <div class="fig-head">Four questions decide between CIBA and Device Code</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-decision-title" viewBox="0 0 960 568" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-decision-title">Four sequential questions that decide between CIBA and the Device Authorization Grant: whether the RP already knows the user, whether the device has a screen, whether the user has a pre-registered authentication device, and whether out-of-band approval is a regulatory requirement.</title>
    <!-- question 1 -->
    <rect class="fg-box" x="32" y="24" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="52">Does the RP already know the user?</text>
    <text class="fg-s" x="48" y="76">it can send a login_hint up front</text>
    <path class="fg-edge" d="M424,60 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="50" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="536" y="24" width="392" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="552" y="52">CIBA</text>
    <text class="fg-s" x="552" y="76">the OP reaches the user directly</text>
    <path class="fg-edge" d="M228,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="121">no</text>
    <!-- question 2 -->
    <rect class="fg-box" x="32" y="136" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="164">Does the device have a screen?</text>
    <text class="fg-s" x="48" y="188">enough to print a short code and a URL</text>
    <path class="fg-edge" d="M424,172 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="162" text-anchor="middle">yes</text>
    <rect class="fg-box" x="536" y="136" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="552" y="164">Device Code</text>
    <text class="fg-s" x="552" y="188">the user carries the code to a phone</text>
    <path class="fg-edge" d="M228,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="233">no</text>
    <!-- question 3 -->
    <rect class="fg-box" x="32" y="248" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="276">Has the user registered a device?</text>
    <text class="fg-s" x="48" y="300">a phone the OP already knows how to reach</text>
    <path class="fg-edge" d="M424,284 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="274" text-anchor="middle">no</text>
    <rect class="fg-box" x="536" y="248" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="552" y="276">Device Code</text>
    <text class="fg-s" x="552" y="300">nothing to notify, the user comes to it</text>
    <path class="fg-edge" d="M228,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="345">yes</text>
    <!-- question 4 -->
    <rect class="fg-box" x="32" y="360" width="392" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="388">Is out-of-band approval required?</text>
    <text class="fg-s" x="48" y="412">regulated finance or health, away from the device</text>
    <path class="fg-edge" d="M424,396 H536" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="480" y="386" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--accent" x="536" y="360" width="392" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="552" y="388">CIBA</text>
    <text class="fg-s" x="552" y="412">binding_message ties the two devices</text>
    <path class="fg-edge" d="M228,432 V472" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="457">no</text>
    <!-- default -->
    <rect class="fg-box" x="32" y="472" width="896" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="500">Default: Device Code</text>
    <text class="fg-s" x="48" y="524">it asks less of your infrastructure: no hint resolver, no notification channel to operate</text>
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
  <div class="fig-head">Device Code: a person carries the code between screens</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-devicecode-title" viewBox="0 0 960 600" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-devicecode-title">The Device Authorization Grant. A device with no browser asks for a device code and a short user code, prints the code and a URL, and polls the token endpoint while the user approves from any other browser.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="576"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="576"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="576"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Device</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">no browser · TV · CLI</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">User's browser</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">any phone or laptop</text>
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">POST /device_authorization</text>
    <path class="fg-edge fg-edge--accent" d="M512,192 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="182" text-anchor="middle">200 · device_code, user_code</text>
    <path class="fg-edge" d="M192,232 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="238">show the URL and the code</text>
    <text class="fg-mxs fg-accent" x="248" y="260">user_code=ABCD-EFGH</text>
    <path class="fg-edge" d="M192,328 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="318" text-anchor="middle">POST /token · poll</text>
    <path class="fg-edge fg-edge--muted" d="M512,384 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="374" text-anchor="middle">400 · authorization_pending</text>
    <path class="fg-edge" d="M824,440 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="430" text-anchor="middle">enter the code and approve</text>
    <path class="fg-edge" d="M192,496 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="486" text-anchor="middle">POST /token · next poll</text>
    <path class="fg-edge fg-edge--accent" d="M512,552 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="542" text-anchor="middle">200 · access_token, id_token?</text>
  </svg>
  <figcaption class="fig-note">The device and the browser are never connected to each other. Only the <code>user_code</code> travels between them, carried by a person reading one screen and typing into another.</figcaption>
</figure>

### CIBA (Core 1.0, poll mode)

<figure class="fig">
  <div class="fig-head">CIBA: the OP reaches out to a registered device</div>
  <svg class="fig-svg" role="img" aria-labelledby="nbf-ciba-title" viewBox="0 0 960 624" xmlns="http://www.w3.org/2000/svg">
    <title id="nbf-ciba-title">CIBA in poll mode. The RP supplies a login hint at the backchannel authentication endpoint, the OP resolves it to a subject, the embedder's notification service reaches the user's pre-registered device, and the RP polls until the approval lands.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="600"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="600"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="600"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">POS · call-centre panel</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">User's device</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">pre-registered</text>
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">POST /bc-authorize</text>
    <path class="fg-edge fg-edge--accent" d="M512,176 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="182">map the hint to a subject</text>
    <path class="fg-edge" d="M512,240 H824" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="230" text-anchor="middle">notify the user's device</text>
    <path class="fg-edge fg-edge--accent" d="M512,296 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="286" text-anchor="middle">200 · auth_req_id</text>
    <path class="fg-edge" d="M192,352 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="342" text-anchor="middle">POST /token · poll</text>
    <path class="fg-edge fg-edge--muted" d="M512,408 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="398" text-anchor="middle">400 · authorization_pending</text>
    <path class="fg-edge" d="M824,464 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="454" text-anchor="middle">user approves on the phone</text>
    <path class="fg-edge" d="M192,520 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="510" text-anchor="middle">POST /token · next poll</text>
    <path class="fg-edge fg-edge--accent" d="M512,576 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="566" text-anchor="middle">200 · access_token, id_token</text>
  </svg>
  <figcaption class="fig-note">Compared with the Device Code figure, the OP here addresses the user itself, so it needs both a hint it can resolve and a channel it can send on. The polling that follows is the same either way.</figcaption>
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
- Both flows lock the record after five `slow_down` offences: the request is denied with `reason="poll_abuse"` and the next poll gets `access_denied`. CIBA also records `AuditCIBAPollAbuseLockout`; the CIBA threshold is tunable with `op.WithCIBAMaxPollViolations`.

## What this library implements today

**Device Code (RFC 8628).** Full support, enabled by `op.WithDeviceCodeGrant()` (it adds the grant to the enabled set, so naming `grant.DeviceCode` in `op.WithGrants` as well is a no-op). The verification ceremony page (where the user types the `user_code`) is **embedder-hosted**; the first manual entry should call `devicecodekit.VerifyUserCodeByAttemptKey` with an opaque server-side ceremony key, followed by `ApproveUserCode` / `DenyUserCode`. Retain `devicecodekit.Deps` and pass it by pointer; its default limiter is process-local, so multi-instance deployments need a shared atomic `AttemptLimiter`. Audit records from these helpers go through `Deps.AuditLogger`. Audit catalogue:

- `AuditDeviceAuthorizationIssued`, `AuditDeviceAuthorizationRejected`, `AuditDeviceAuthorizationUnboundRejected`
- `AuditDeviceCodeVerificationApproved`, `AuditDeviceCodeVerificationDenied`, `AuditDeviceCodeUserCodeBruteForce`
- `AuditDeviceCodeTokenIssued`, `AuditDeviceCodeTokenRejected`, `AuditDeviceCodeTokenSlowDown`
- `AuditDeviceCodePollObservationFailed` (the token endpoint observed a state transition it could not act on cleanly)
- `AuditDeviceCodeRevoked` (from the public `Revoke` helper)

**CIBA (Core 1.0).** Poll mode only; discovery advertises `poll` only. Enable it with `op.WithCIBA(op.WithCIBAHintResolver(...))`; the resolver is required. The `HintResolver` is the embedder hook that maps the inbound hint (`login_hint`, `id_token_hint`, `login_hint_token`) to a subject. For `id_token_hint`, the OP verifies signature, issuer, and authenticated-client audience before calling the resolver and passes only the verified `sub`; it intentionally does not check `exp`, refuses a token whose `typ` is not `JWT`, and rejects pairwise clients before resolution. Ping and push delivery modes are not provided. Audit catalogue:

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
