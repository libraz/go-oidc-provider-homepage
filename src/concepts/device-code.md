---
title: Device Code (RFC 8628)
description: RFC 8628 device authorization for TVs, consoles, and CLIs — embedder-hosted verification, opaque attempt keys, and bounded user-code attempts.
pageClass: pg-concepts-device-code
---

# Device Code (RFC 8628)

The device-authorization grant — also called "device code" or "device flow" — exists for clients that **cannot run a browser** or **have no convenient way to type a password**. Smart TVs, gaming consoles, CLI tools, IoT devices, point-of-sale terminals.

The most familiar example is signing into Netflix on a new TV: the screen displays a short code (`ABCD-EFGH`) and a URL (`netflix.com/tv`); you open that URL on your phone, type the code, and approve. The TV — which never saw your password — then receives an access token.

::: details Specs referenced on this page
- [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628) — OAuth 2.0 Device Authorization Grant
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework (terminology)
:::

::: details Vocabulary refresher
- **device_code** — the long, opaque identifier the OP issues for the device to poll with. Never shown to the user; sent only to the device.
- **user_code** — the short, human-readable code (e.g. `BDWP-HQPK`) shown on the device's screen and typed into the verification page.
- **verification_uri** — the URL printed on the device's screen (`https://op.example.com/device`); the user opens it on their phone.
- **verification_uri_complete** — the same URL pre-filled with the `user_code`; if the device can render a QR code, the user just scans it and skips the typing step.
- **interval** — how often, in seconds, the device should poll `/token`. The OP raises this value when it returns `slow_down`.
:::

## How the flow runs

<figure class="fig">
  <div class="fig-head">Device Authorization Grant</div>
  <svg class="fig-svg" role="img" aria-labelledby="device-flow-title" viewBox="0 0 960 556" xmlns="http://www.w3.org/2000/svg">
    <title id="device-flow-title">The device authorization grant. The device asks for a device code and a short user code, shows the user where to go, and polls the token endpoint while the user approves on a second screen. Once approval lands, the next poll returns tokens.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="150" y1="62" x2="150" y2="540"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="540"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="540"/>
    <!-- actors -->
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">Device</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">TV · CLI · console</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="740" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">User</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">phone · second screen</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="102" r="8.5"/>
    <text class="fg-badge-t" x="15" y="105" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,102 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="325" y="82" text-anchor="middle">POST /device_authorization</text>
    <text class="fg-mxs" x="325" y="95" text-anchor="middle">client_id · scope=openid profile</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="146" r="8.5"/>
    <text class="fg-badge-t" x="15" y="149" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,146 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="126" text-anchor="middle">200 · device_code · user_code=ABCD-EFGH</text>
    <text class="fg-mxs" x="325" y="139" text-anchor="middle">verification_uri(_complete) · interval · expires_in</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="192" r="8.5"/>
    <text class="fg-badge-t" x="15" y="195" text-anchor="middle">3</text>
    <rect class="fg-box fg-box--sub" x="60" y="170" width="360" height="44" rx="6"/>
    <text class="fg-xs" x="76" y="188">the device shows: open <tspan class="fg-accent">op.example.com/device</tspan></text>
    <text class="fg-xs" x="76" y="204">and enter <tspan class="fg-accent">ABCD-EFGH</tspan></text>
    <!-- par fragment -->
    <rect class="fg-frame" x="44" y="234" width="896" height="240" rx="8"/>
    <rect class="fg-box fg-box--muted" x="44" y="234" width="52" height="18" rx="4"/>
    <text class="fg-tab" x="56" y="247">par</text>
    <line class="fg-rule fg-rule--dashed" x1="44" y1="360" x2="940" y2="360"/>
    <!-- loop -->
    <rect class="fg-frame" x="64" y="266" width="600" height="80" rx="6"/>
    <rect class="fg-box fg-box--muted" x="64" y="266" width="184" height="18" rx="4"/>
    <text class="fg-tab" x="76" y="279">loop · repeat every interval s</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="302" r="8.5"/>
    <text class="fg-badge-t" x="15" y="305" text-anchor="middle">4</text>
    <path class="fg-edge" d="M150,302 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="325" y="296" text-anchor="middle">POST /token · grant_type=…:device_code · device_code</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="332" r="8.5"/>
    <text class="fg-badge-t" x="15" y="335" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--muted" d="M500,332 H150" marker-end="url(#fg-am)"/>
    <text class="fg-mxs fg-halo" x="325" y="326" text-anchor="middle">400 · authorization_pending</text>
    <!-- second screen -->
    <text class="fg-xs" x="76" y="384">meanwhile, on the second screen</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="412" r="8.5"/>
    <text class="fg-badge-t" x="15" y="415" text-anchor="middle">6</text>
    <path class="fg-edge" d="M830,412 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="406" text-anchor="middle">GET /device — enter ABCD-EFGH</text>
    <!-- 7 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="450" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="453" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M500,442 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="542" y="446">log in, consent, approve</text>
    <text class="fg-xs" x="542" y="459">the device code is now bound to a subject</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="504" r="8.5"/>
    <text class="fg-badge-t" x="15" y="507" text-anchor="middle">8</text>
    <path class="fg-edge" d="M150,504 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="498" text-anchor="middle">POST /token — the next poll</text>
    <!-- 9 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="536" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="539" text-anchor="middle">9</text>
    <path class="fg-edge fg-edge--accent" d="M500,536 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="530" text-anchor="middle">200 · access_token · id_token? · refresh_token?</text>
  </svg>
  <figcaption class="fig-note">The device never sees a password and never renders a login form — it only ever holds the <code>device_code</code>. The short <code>user_code</code> exists purely so a person can retype it on a keyboard that actually has letters.</figcaption>
</figure>

The device never holds the user's password. The user never types anything on the device. The two surfaces meet at the OP through the short `user_code`.

## Polling responses

The token endpoint (`/token`) returns one of four shapes per poll:

| Response | Meaning | What the device should do |
|---|---|---|
| `400 authorization_pending` | The user has not approved (or denied) yet. | Wait `interval` seconds and try again. |
| `400 slow_down` | The device polled too fast. | Increase the interval by 5 seconds for this and all subsequent requests (RFC 8628 §3.5). The OP persists the new interval atomically with `LastPolledAt` so a multi-replica deployment cannot be tricked into resetting it. |
| `400 access_denied` | The user clicked **deny** on the verification page (or an embedder revocation hook fired). | Stop polling. Show "Sign-in cancelled". |
| `400 expired_token` | The `device_code` outlived `expires_in` (default 600 s). | Stop polling. Restart the flow if the user wants to retry. |
| `200 { access_token, ... }` | The user approved. | Treat as a normal token response. |

::: warning user_code is brute-forceable by design
The `user_code` is short on purpose — long codes are unusable. That makes it brute-forceable in principle: an attacker who can hit `/device` faster than the user can type wins. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit). For the first manual entry, call `VerifyUserCodeByAttemptKey` with an opaque, server-side ceremony key, then call `ApproveUserCode` after the user authenticates and consents. Do not use the raw `user_code` as the attempt key. `Deps` contains a mutex-backed limiter and must be retained and passed by pointer; never copy it. The default limiter is process-local, so multi-instance deployments need a shared atomic `AttemptLimiter`.
:::

## When to use it

Pick the device flow when one of the device-side constraints holds:

- **No browser** — set-top boxes, smart TVs, voice assistants.
- **No keyboard / clumsy keyboard** — TV remotes, game-controller D-pads.
- **CLI tools** that ship without a web server (`gcloud auth login`, `gh auth login`, `kubectl oidc-login`).
- **Headless** automation contexts where pairing happens once at provisioning.

Avoid it for browser-able clients (regular SPAs, native apps with custom URL schemes) — `authorization_code + PKCE` is shorter, safer, and gives a richer UX. RFC 8628 §3 frames device flow as the **fallback** when the canonical flow is impractical.

## See it run

[`examples/31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) drives the full RFC 8628 round trip from a single binary: it stands up the OP, prints a boxed `user_code` panel + the `verification_uri_complete` shortcut, simulates browser approval after a few seconds, and polls until the OP issues an `access_token` + `id_token`.

```sh
(cd examples/31-device-code-cli && GOWORK=off go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring, `cli.go` for the device-side polling, `device.go` for the simulated browser approval, `probe.go` for self-verification) so each surface is readable in isolation.

## Read next

- [Use case: device-code wiring](/use-cases/device-code) — `op.WithDeviceCodeGrant`, `devicecodekit.VerifyUserCodeByAttemptKey`, the verification page contract, and how to cascade-revoke issued tokens when a device is unenrolled.
- [CIBA primer](/concepts/ciba) — the conceptual sibling for "user is on a different channel" but without a code-on-screen ceremony.
