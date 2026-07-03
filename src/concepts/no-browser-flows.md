---
title: No-browser flows — CIBA vs Device Code
description: Both flows handle the case where the device that wants the token cannot host a usable browser. They look similar from a distance but differ in who initiates and how the user is identified to the OP.
---

# No-browser flows: CIBA vs Device Code

[Device Code (RFC 8628)](/concepts/device-code) and [CIBA (OpenID Connect Client-Initiated Backchannel Authentication 1.0)](/concepts/ciba) are the two grants the spec ecosystem provides for the same broad situation: the device that wants the access token **cannot host a usable browser**. Smart TVs, gaming consoles, CLI tools, IoT devices, voice assistants, POS terminals, call-center panels, server-side processes that act on behalf of a person.

From a distance the two flows look like the same shape — "two surfaces meet at the OP, the user approves on a phone". They are not. They differ in **who initiates the request** and **how the user is identified to the OP**, and that single distinction drives almost every other difference: the wire endpoints, the polling subject, the anti-phishing primitive, the regulatory profile.

This page is the selection guide. The mechanics live on the dedicated pages for [Device Code](/concepts/device-code) and [CIBA](/concepts/ciba).

## The two flows in one paragraph each

**Device Code (RFC 8628).** The device with no browser asks the OP for a one-time code, displays it on its own screen, and tells the user "open this URL on your phone and enter this code". The user authenticates on whatever browser they happen to have at hand and approves. Meanwhile the device polls `/token` until approval lands. The user's identity is **discovered during the flow** — the OP did not know who would walk up to the TV.

**CIBA (Core 1.0).** The RP already knows who the user is — `login_hint` (`alice@example.com`, an account number), `id_token_hint` (a previously issued ID token), or `login_hint_token` (a signed JWT from an upstream system). The RP asks the OP "please authenticate this user out-of-band". The OP pings the user's pre-registered authentication device (push notification, SMS, app prompt). Meanwhile the RP polls (or, in ping/push mode, waits for a callback) until approval lands. The user's identity is **supplied upfront by the RP** — the OP needs it to know which device to push to.

## Comparison

| Aspect | Device Code (RFC 8628) | CIBA (Core 1.0) |
|---|---|---|
| Trigger origin | The device with no browser (input device → OP) | The RP / API client (RP → OP) |
| User identification | The user types `user_code` on a separate browser | The RP supplies `login_hint` / `id_token_hint` / `login_hint_token` upfront |
| User device | Any browser the user happens to have | A device pre-registered with the OP for backchannel push |
| Anti-phishing primitive | `user_code` displayed by the device + verification URI host visible to the user | `binding_message` shown on the user's authentication device |
| Browser involvement | Yes (on the user's phone) | Optional / none (push notification confirms) |
| Polling subject | The device with no browser | The RP |
| Spec endpoint | `/device_authorization` | `/bc-authorize` |
| Token `grant_type` | `urn:ietf:params:oauth:grant-type:device_code` | `urn:openid:params:grant-type:ciba` |
| Typical use cases | TV apps, CLI tools, kiosks, voice assistants, low-input IoT | Strong customer authentication (PSD2-style), finance / health out-of-band approval, customer-support flows that reset access without sharing a screen |
| Library status | RFC 8628 — full support, gated by `op.WithDeviceCodeGrant()` | OIDC CIBA Core 1.0 — poll mode only in the current release; ping / push deferred |
| Brute-force defense | `op/devicecodekit` constant-time compare + N-strike lockout (`MaxUserCodeStrikes`) | Poll-abuse lockout — rate-limited `/token` retries per `auth_req_id`, `AuditCIBAPollAbuseLockout` on cross |
| FAPI profile | Not in FAPI 2.0 (RFC 8628 itself is sufficient for Baseline-like deployments) | FAPI-CIBA — a separate FAPI profile from FAPI 2.0 Baseline / Message Signing, pinning JAR + DPoP \| mTLS + 10-minute access TTL |

::: tip Two grants, one symptom
Both grants exist because the canonical `authorization_code + PKCE` flow assumes a usable browser on the device that wants the token. That assumption breaks for TVs, CLIs, IoT, voice assistants, and for backend services acting on a user's behalf. RFC 8628 and CIBA solve **two different shapes** of "the browser is somewhere else".
:::

## Picking between them — decision tree

Run through these four questions in order. The first one usually settles it.

<style scoped>
.dtx-q{stroke:currentColor;stroke-width:1.6}
.dtx-op{stroke:var(--vp-c-brand-2);stroke-width:1.8}
.dtx-rp{stroke:currentColor;stroke-width:1.8}
.dtx-edge{stroke:currentColor;stroke-width:1.6}
.dtx-qt{font-family:var(--vp-font-family-base);font-size:12.5px;fill:var(--vp-c-text-1);stroke:none}
.dtx-leaf{font-family:var(--vp-font-family-base);font-size:13.5px;font-weight:700;fill:var(--vp-c-text-1);stroke:none}
.dtx-leaf-op{font-family:var(--vp-font-family-base);font-size:13.5px;font-weight:700;fill:var(--vp-c-brand-2);stroke:none}
.dtx-lbl{font-family:var(--vp-font-family-base);font-size:10.5px;font-weight:600;fill:var(--vp-c-text-3);stroke:none}
.dtx-sub{font-family:var(--vp-font-family-base);font-size:10px;fill:var(--vp-c-text-3);stroke:none}
</style>

<svg role="img" aria-labelledby="nobrowser-choice-title" viewBox="0 0 660 480" width="660" style="max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="nobrowser-choice-title">Decision tree for choosing between CIBA and Device Code from four sequential questions.</title>
  <rect class="dtx-q" x="20" y="20" width="320" height="58" rx="6"/>
  <rect class="dtx-q" x="20" y="118" width="320" height="58" rx="6"/>
  <rect class="dtx-q" x="20" y="216" width="320" height="58" rx="6"/>
  <rect class="dtx-q" x="20" y="314" width="320" height="58" rx="6"/>
  <rect class="dtx-op" x="470" y="27" width="180" height="44" rx="6"/>
  <rect class="dtx-rp" x="470" y="125" width="180" height="44" rx="6"/>
  <rect class="dtx-rp" x="470" y="223" width="180" height="44" rx="6"/>
  <rect class="dtx-op" x="470" y="321" width="180" height="44" rx="6"/>
  <rect class="dtx-rp" x="90" y="418" width="200" height="44" rx="6"/>
  <path class="dtx-edge" d="M340 49 H470 M463 45 L470 49 L463 53"/>
  <path class="dtx-edge" d="M340 147 H470 M463 143 L470 147 L463 151"/>
  <path class="dtx-edge" d="M340 245 H470 M463 241 L470 245 L463 249"/>
  <path class="dtx-edge" d="M340 343 H470 M463 339 L470 343 L463 347"/>
  <path class="dtx-edge" d="M180 78 V118 M176 111 L180 118 L184 111"/>
  <path class="dtx-edge" d="M180 176 V216 M176 209 L180 216 L184 209"/>
  <path class="dtx-edge" d="M180 274 V314 M176 307 L180 314 L184 307"/>
  <path class="dtx-edge" d="M180 372 V418 M176 411 L180 418 L184 411"/>
  <text class="dtx-qt" x="180" y="45" text-anchor="middle">Does the RP know the user</text>
  <text class="dtx-qt" x="180" y="61" text-anchor="middle">before the flow starts?</text>
  <text class="dtx-qt" x="180" y="143" text-anchor="middle">Is there a screen on the</text>
  <text class="dtx-qt" x="180" y="159" text-anchor="middle">device that wants the token?</text>
  <text class="dtx-qt" x="180" y="241" text-anchor="middle">Does the user have a</text>
  <text class="dtx-qt" x="180" y="257" text-anchor="middle">registered auth device?</text>
  <text class="dtx-qt" x="180" y="339" text-anchor="middle">Regulated finance / health,</text>
  <text class="dtx-qt" x="180" y="355" text-anchor="middle">out-of-band approval?</text>
  <text class="dtx-leaf-op" x="560" y="54" text-anchor="middle">CIBA</text>
  <text class="dtx-leaf" x="560" y="152" text-anchor="middle">Device Code</text>
  <text class="dtx-leaf" x="560" y="250" text-anchor="middle">Device Code</text>
  <text class="dtx-leaf-op" x="560" y="348" text-anchor="middle">CIBA</text>
  <text class="dtx-leaf" x="190" y="440" text-anchor="middle">Device Code</text>
  <text class="dtx-sub" x="190" y="454" text-anchor="middle">default</text>
  <text class="dtx-lbl" x="405" y="43" text-anchor="middle">Yes</text>
  <text class="dtx-lbl" x="405" y="141" text-anchor="middle">Yes</text>
  <text class="dtx-lbl" x="405" y="239" text-anchor="middle">No</text>
  <text class="dtx-lbl" x="405" y="337" text-anchor="middle">Yes</text>
  <text class="dtx-lbl" x="188" y="102" text-anchor="start">No</text>
  <text class="dtx-lbl" x="188" y="200" text-anchor="start">No</text>
  <text class="dtx-lbl" x="188" y="298" text-anchor="start">Yes</text>
  <text class="dtx-lbl" x="188" y="396" text-anchor="start">No</text>
</svg>

**1. Does the RP know who the user is *before* the flow starts?**

- **Yes** → CIBA. The RP already has `login_hint` (or an ID token, or a hint token) and can send it with `/bc-authorize`. The user does not need to type anything to identify themselves.
- **No** → Device Code. The user identifies themselves during the flow by signing in on the verification page; the OP discovers who they are when the user authenticates on their phone.

**2. Is there a screen on the device that wants the token?**

- **Yes** → Device Code can display the `user_code` and `verification_uri` directly. This is the canonical TV / console / CLI case.
- **No (voice assistant, headless IoT)** → Both can work. Device Code can emit the `user_code` via TTS or print it as a QR (`verification_uri_complete`). CIBA pushes to a separate device entirely and needs no display.

**3. Does the user have a registered authentication device?**

- **CIBA assumes yes.** Without a registered device the OP has nowhere to push. Provisioning that device — the banking app, the staff phone, the regulator-issued authenticator — is part of the deployment.
- **Device Code does not assume.** Any browser session the user can sign into works. The user's phone, a colleague's laptop, a kiosk in the store.

**4. Is this a regulated finance / health context with out-of-band approval requirements?**

- **CIBA is designed for it.** The FAPI-CIBA profile pins JAR, sender constraint (DPoP or mTLS), and a 10-minute access TTL on top of CIBA Core. `binding_message` is the audit primitive regulators look for ("the user saw exactly what they were approving").
- **Device Code is general-purpose.** It can be deployed to good effect, but it is not the shape regulators normally point to for SCA.

If you are still unsure after running the questions: default to **Device Code** for consumer-facing "the device has a screen but no browser" cases, and **CIBA** for "the RP knows the user and just needs them to approve out-of-band".

## Sequence diagrams

### Device Code (RFC 8628)

<style scoped>
.dcx-op{stroke:var(--vp-c-brand-2)}
.dcx-rp{stroke:currentColor}
.dcx-user{stroke:var(--vp-c-text-3)}
.dcx-frame{stroke:currentColor;stroke-width:1.4;opacity:.42}
.dcx-life{stroke-width:1.4;opacity:.32}
.dcx-actor{font-family:var(--vp-font-family-base);font-size:12.5px;font-weight:600;fill:var(--vp-c-text-1);stroke:none}
.dcx-actor-op{font-family:var(--vp-font-family-base);font-size:13px;font-weight:700;fill:var(--vp-c-brand-2);stroke:none}
.dcx-sub{font-family:var(--vp-font-family-base);font-size:10.5px;fill:var(--vp-c-text-3);stroke:none}
.dcx-hdr{font-family:var(--vp-font-family-base);font-size:10.5px;font-weight:600;letter-spacing:.04em;fill:var(--vp-c-text-3);stroke:none}
.dcx-note{font-family:var(--vp-font-family-base);font-size:11.5px;fill:var(--vp-c-text-2);stroke:none}
.dcx-mono{font-family:var(--vp-font-family-mono);font-size:11.5px;fill:var(--vp-c-text-1);stroke:none}
.dcx-step{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3);stroke:none}
</style>

<svg role="img" aria-labelledby="dc-seq-title" viewBox="0 0 720 452" width="720" style="max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="dc-seq-title">Device Code (RFC 8628) sequence: the browserless device polls the OP while the user enters the user_code and approves on a separate browser.</title>
  <line class="dcx-rp dcx-life" x1="115" y1="50" x2="115" y2="446"/>
  <line class="dcx-op dcx-life" x1="360" y1="50" x2="360" y2="446"/>
  <line class="dcx-user dcx-life" x1="605" y1="50" x2="605" y2="446"/>
  <rect class="dcx-frame" x="44" y="198" width="644" height="166" rx="6"/>
  <rect class="dcx-rp" x="20" y="6" width="190" height="44" rx="6"/>
  <rect class="dcx-op" x="265" y="6" width="190" height="44" rx="6"/>
  <rect class="dcx-user" x="510" y="6" width="190" height="44" rx="6"/>
  <text class="dcx-actor" x="115" y="24" text-anchor="middle">Device — no browser</text>
  <text class="dcx-sub" x="115" y="40" text-anchor="middle">TV / CLI / IoT</text>
  <text class="dcx-actor-op" x="360" y="24" text-anchor="middle">OP</text>
  <text class="dcx-sub" x="360" y="40" text-anchor="middle">go-oidc-provider</text>
  <text class="dcx-actor" x="605" y="24" text-anchor="middle">User's browser</text>
  <text class="dcx-sub" x="605" y="40" text-anchor="middle">any phone / laptop</text>
  <path class="dcx-rp" d="M115 86 H360 M353 82 L360 86 L353 90"/>
  <text class="dcx-mono" x="237" y="78" text-anchor="middle"><tspan class="dcx-step">1  </tspan>POST /device_authorization</text>
  <path class="dcx-op" d="M360 124 H115 M122 120 L115 124 L122 128"/>
  <text class="dcx-mono" x="237" y="116" text-anchor="middle"><tspan class="dcx-step">2  </tspan>200 { device_code, user_code, verification_uri }</text>
  <rect class="dcx-frame" x="40" y="138" width="170" height="36" rx="4"/>
  <text class="dcx-note" x="125" y="161" text-anchor="middle">Shows <tspan class="dcx-mono">user_code</tspan> + verify URL</text>
  <text class="dcx-hdr" x="237" y="216" text-anchor="middle">Device polls</text>
  <text class="dcx-hdr" x="482" y="216" text-anchor="middle">User approves</text>
  <path class="dcx-rp" d="M115 246 H360 M353 242 L360 246 L353 250"/>
  <text class="dcx-mono" x="237" y="238" text-anchor="middle"><tspan class="dcx-step">3  </tspan>POST /token · grant_type=device_code</text>
  <path class="dcx-op" d="M360 282 H115 M122 278 L115 282 L122 286"/>
  <text class="dcx-mono" x="237" y="274" text-anchor="middle"><tspan class="dcx-step">4  </tspan>400 authorization_pending</text>
  <text class="dcx-note" x="237" y="302" text-anchor="middle">repeat every interval s</text>
  <path class="dcx-user" d="M605 252 H360 M367 248 L360 252 L367 256"/>
  <text class="dcx-note" x="482" y="244" text-anchor="middle"><tspan class="dcx-step">5  </tspan>Open <tspan class="dcx-mono">verification_uri</tspan>, enter <tspan class="dcx-mono">user_code</tspan></text>
  <path class="dcx-user" d="M605 312 H360 M367 308 L360 312 L367 316"/>
  <text class="dcx-note" x="482" y="304" text-anchor="middle"><tspan class="dcx-step">6  </tspan>Log in + consent → approve</text>
  <path class="dcx-rp" d="M115 392 H360 M353 388 L360 392 L353 396"/>
  <text class="dcx-mono" x="237" y="384" text-anchor="middle"><tspan class="dcx-step">7  </tspan>POST /token <tspan class="dcx-note">(next poll)</tspan></text>
  <path class="dcx-op" d="M360 430 H115 M122 426 L115 430 L122 434"/>
  <text class="dcx-mono" x="237" y="422" text-anchor="middle"><tspan class="dcx-step">8  </tspan>200 { access_token, id_token? }</text>
</svg>

### CIBA (Core 1.0, poll mode)

<style scoped>
.cbx-op{stroke:var(--vp-c-brand-2)}
.cbx-rp{stroke:currentColor}
.cbx-user{stroke:var(--vp-c-text-3)}
.cbx-frame{stroke:currentColor;stroke-width:1.4;opacity:.42}
.cbx-life{stroke-width:1.4;opacity:.32}
.cbx-actor{font-family:var(--vp-font-family-base);font-size:12.5px;font-weight:600;fill:var(--vp-c-text-1);stroke:none}
.cbx-actor-op{font-family:var(--vp-font-family-base);font-size:13px;font-weight:700;fill:var(--vp-c-brand-2);stroke:none}
.cbx-sub{font-family:var(--vp-font-family-base);font-size:10.5px;fill:var(--vp-c-text-3);stroke:none}
.cbx-hdr{font-family:var(--vp-font-family-base);font-size:10.5px;font-weight:600;letter-spacing:.04em;fill:var(--vp-c-text-3);stroke:none}
.cbx-note{font-family:var(--vp-font-family-base);font-size:11.5px;fill:var(--vp-c-text-2);stroke:none}
.cbx-mono{font-family:var(--vp-font-family-mono);font-size:11.5px;fill:var(--vp-c-text-1);stroke:none}
.cbx-step{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3);stroke:none}
</style>

<svg role="img" aria-labelledby="ciba-seq-title" viewBox="0 0 720 560" width="720" style="max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="ciba-seq-title">CIBA (OIDC Core 1.0, poll mode) sequence: the RP supplies a login_hint at /bc-authorize, the OP resolves it and pushes to the user's pre-registered device, and the RP polls until approval.</title>
  <line class="cbx-rp cbx-life" x1="115" y1="50" x2="115" y2="554"/>
  <line class="cbx-op cbx-life" x1="360" y1="50" x2="360" y2="554"/>
  <line class="cbx-user cbx-life" x1="605" y1="50" x2="605" y2="554"/>
  <rect class="cbx-frame" x="44" y="306" width="644" height="164" rx="6"/>
  <rect class="cbx-rp" x="20" y="6" width="190" height="44" rx="6"/>
  <rect class="cbx-op" x="265" y="6" width="190" height="44" rx="6"/>
  <rect class="cbx-user" x="510" y="6" width="190" height="44" rx="6"/>
  <text class="cbx-actor" x="115" y="24" text-anchor="middle">RP / API client</text>
  <text class="cbx-sub" x="115" y="40" text-anchor="middle">POS, call-center panel</text>
  <text class="cbx-actor-op" x="360" y="24" text-anchor="middle">OP</text>
  <text class="cbx-sub" x="360" y="40" text-anchor="middle">go-oidc-provider</text>
  <text class="cbx-actor" x="605" y="24" text-anchor="middle">User's auth device</text>
  <text class="cbx-sub" x="605" y="40" text-anchor="middle">pre-registered</text>
  <path class="cbx-rp" d="M115 82 H360 M353 78 L360 82 L353 86"/>
  <text class="cbx-mono" x="237" y="74" text-anchor="middle"><tspan class="cbx-step">1  </tspan>POST /bc-authorize</text>
  <rect class="cbx-frame" x="35" y="96" width="175" height="40" rx="4"/>
  <text class="cbx-mono" x="122" y="112" text-anchor="middle">login_hint=alice</text>
  <text class="cbx-mono" x="122" y="128" text-anchor="middle">binding_message</text>
  <path class="cbx-op" d="M360 158 H398 V184 H367 M367 180 L360 184 L367 188"/>
  <text class="cbx-note" x="406" y="176" text-anchor="start"><tspan class="cbx-step">2  </tspan><tspan class="cbx-mono">HintResolver</tspan> → subject</text>
  <path class="cbx-op" d="M360 210 H605 M598 206 L605 210 L598 214"/>
  <text class="cbx-note" x="482" y="202" text-anchor="middle"><tspan class="cbx-step">3  </tspan>out-of-band push</text>
  <rect class="cbx-frame" x="510" y="224" width="190" height="34" rx="4"/>
  <text class="cbx-note" x="605" y="245" text-anchor="middle">“Approve $80 at Acme Coffee?”</text>
  <path class="cbx-op" d="M360 286 H115 M122 282 L115 286 L122 290"/>
  <text class="cbx-mono" x="237" y="278" text-anchor="middle"><tspan class="cbx-step">4  </tspan>200 { auth_req_id, expires_in, interval }</text>
  <text class="cbx-hdr" x="237" y="326" text-anchor="middle">RP polls</text>
  <text class="cbx-hdr" x="482" y="326" text-anchor="middle">User approves</text>
  <path class="cbx-rp" d="M115 356 H360 M353 352 L360 356 L353 360"/>
  <text class="cbx-mono" x="237" y="348" text-anchor="middle"><tspan class="cbx-step">5  </tspan>POST /token · grant_type=ciba</text>
  <path class="cbx-op" d="M360 392 H115 M122 388 L115 392 L122 396"/>
  <text class="cbx-mono" x="237" y="384" text-anchor="middle"><tspan class="cbx-step">6  </tspan>400 authorization_pending</text>
  <text class="cbx-note" x="237" y="412" text-anchor="middle">repeat every interval s</text>
  <path class="cbx-user" d="M605 362 H360 M367 358 L360 362 L367 366"/>
  <text class="cbx-note" x="482" y="354" text-anchor="middle"><tspan class="cbx-step">7  </tspan>Approve → <tspan class="cbx-mono">Approve(auth_req_id)</tspan></text>
  <path class="cbx-rp" d="M115 500 H360 M353 496 L360 500 L353 504"/>
  <text class="cbx-mono" x="237" y="492" text-anchor="middle"><tspan class="cbx-step">8  </tspan>POST /token <tspan class="cbx-note">(next poll)</tspan></text>
  <path class="cbx-op" d="M360 538 H115 M122 534 L115 538 L122 542"/>
  <text class="cbx-mono" x="237" y="530" text-anchor="middle"><tspan class="cbx-step">9  </tspan>200 { access_token, id_token, refresh_token? }</text>
</svg>

The shape is similar enough to map between the two mentally. The decisive difference is the diagonal arrow: in Device Code the user **walks to the OP** with a code in hand; in CIBA the OP **reaches out to a device the user already trusts**.

## Threat model side-by-side

**Phishing — attacker tricks the user into approving the *attacker's* request.**

- Device Code: the user verifies the URL host they are typing the code into. The `user_code` itself has no per-session secret value (entropy is intentional but moderate). If the user mistypes the host or clicks a link in a phishing email, the same `user_code` works on the attacker's site.
- CIBA: `binding_message` is attached to `/bc-authorize` and shown on the user's authentication device. The user sees "Acme POS terminal #14: Approve $80 at Acme Coffee?" before approving. A pure push prompt without context ("we noticed unusual activity, approve?") is the failure mode.

**Replay / brute-force on `user_code`.**

- Device Code: the `user_code` is short (`BDWP-HQPK`) on purpose so users can type it. That makes it brute-forceable in principle. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) — `VerifyUserCode` constant-time-compares and increments a strike counter on miss, locking the row after `MaxUserCodeStrikes` (default 5). Embedder verification pages **MUST** route through the helper.
- CIBA: there is no user-typed code. The `auth_req_id` is opaque and OP-issued.

**Replay / abuse on `/token` polling.**

- Both flows return `authorization_pending` while the user is deciding and `slow_down` if the device polls faster than the negotiated `interval`. RFC 8628 §3.5 makes honoring the new `interval` a MUST; the OP persists the value atomically with `LastPolledAt` so a multi-replica deployment cannot reset it.
- CIBA additionally has a poll-abuse lockout: when the per-`auth_req_id` violation counter crosses the threshold the request is denied with `reason="poll_abuse"` and the audit catalogue records `AuditCIBAPollAbuseLockout`.

## What this library implements today

**Device Code (RFC 8628).** Full support, gated by `op.WithDeviceCodeGrant()`. The verification ceremony page (where the user types the `user_code`) is **embedder-hosted**; the embedder calls `devicecodekit.VerifyUserCode` and `ApproveUserCode` / `DenyUserCode` to drive the OP-side state machine. Audit catalogue:

- `AuditDeviceAuthorizationIssued`, `AuditDeviceAuthorizationRejected`, `AuditDeviceAuthorizationUnboundRejected`
- `AuditDeviceCodeVerificationApproved`, `AuditDeviceCodeVerificationDenied`, `AuditDeviceCodeUserCodeBruteForce`
- `AuditDeviceCodeTokenIssued`, `AuditDeviceCodeTokenRejected`, `AuditDeviceCodeTokenSlowDown`
- `AuditDeviceCodeRevoked` (from the public `Revoke` helper)

**CIBA (Core 1.0).** Poll mode only in the current release; ping and push are deferred. Wired through `op.WithCIBA(op.WithCIBAHintResolver(...))`; the `HintResolver` is the embedder hook that maps the inbound hint (`login_hint`, `id_token_hint`, `login_hint_token`) to a subject. Audit catalogue:

- `AuditCIBAAuthorizationIssued`, `AuditCIBAAuthorizationRejected`, `AuditCIBAAuthorizationUnboundRejected`
- `AuditCIBAAuthDeviceApproved`, `AuditCIBAAuthDeviceDenied`
- `AuditCIBAPollAbuseLockout`
- `AuditCIBATokenIssued`, `AuditCIBATokenRejected`, `AuditCIBATokenSlowDown`
- `AuditCIBAPollObservationFailed` (the token endpoint observed a state transition it could not act on cleanly)

## Read next

- [Device Code primer](/concepts/device-code) — RFC 8628 mechanics, polling responses, `user_code` brute-force gate.
- [CIBA primer](/concepts/ciba) — CIBA Core 1.0 mechanics, hint kinds, `binding_message`, FAPI-CIBA profile.
- [Use case: device-code wiring](/use-cases/device-code) — `op.WithDeviceCodeGrant`, the verification page contract, cascade revocation.
- [Use case: CIBA wiring](/use-cases/ciba) — `op.WithCIBA`, the `HintResolver` contract, FAPI-CIBA constraints.
- [Audit events](/reference/audit-events) — full catalogue with payload shapes.
