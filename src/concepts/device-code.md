---
title: Device Code (RFC 8628)
description: How a TV / console / CLI gets an access token without a keyboard — the device-authorization grant in plain English.
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

<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="device-code-flow-title" viewBox="0 0 700 570" style="width:100%;height:auto;max-width:720px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="device-code-flow-title">Device-authorization sequence: the device requests a device_code and user_code, polls the token endpoint while the user approves on a second screen, then receives an access token.</title>
  <style>
    .dcf-fp{font-family:var(--vp-font-family-base);}
    .dcf-fm{font-family:var(--vp-font-family-mono);}
    .dcf-neu{fill:currentColor;}
    .dcf-acc{fill:var(--vp-c-brand-2);}
    .dcf-mut{fill:var(--vp-c-text-3);}
    .dcf-sacc{stroke:var(--vp-c-brand-2);}
    .dcf-smut{stroke:var(--vp-c-text-3);}
    .dcf-frame{fill:none;stroke:var(--vp-c-text-3);stroke-width:1.5;}
    .dcf-life{stroke-width:1.5;opacity:.32;}
    .dcf-ret{stroke-dasharray:5 4;}
    .dcf-tabbg{fill:var(--vp-c-bg);stroke:var(--vp-c-text-3);stroke-width:1.5;}
    svg text{stroke:none;}
  </style>

  <!-- actors -->
  <rect x="12" y="14" width="128" height="40" rx="5"/>
  <rect class="dcf-sacc" x="286" y="14" width="128" height="40" rx="5"/>
  <rect class="dcf-smut" x="560" y="14" width="128" height="40" rx="5"/>
  <text class="dcf-fp dcf-neu" x="76" y="32" font-size="13" font-weight="600" text-anchor="middle">Device</text>
  <text class="dcf-fm dcf-neu" x="76" y="46" font-size="9.5" text-anchor="middle">TV · CLI · console</text>
  <text class="dcf-fp dcf-acc" x="350" y="32" font-size="13" font-weight="600" text-anchor="middle">OP</text>
  <text class="dcf-fm dcf-acc" x="350" y="46" font-size="9.5" text-anchor="middle">go-oidc-provider</text>
  <text class="dcf-fp dcf-mut" x="624" y="32" font-size="13" font-weight="600" text-anchor="middle">User</text>
  <text class="dcf-fm dcf-mut" x="624" y="46" font-size="9.5" text-anchor="middle">phone · 2nd screen</text>

  <!-- lifelines -->
  <line class="dcf-life" x1="76" y1="54" x2="76" y2="558"/>
  <line class="dcf-life dcf-sacc" x1="350" y1="54" x2="350" y2="558"/>
  <line class="dcf-life dcf-smut" x1="624" y1="54" x2="624" y2="558"/>

  <!-- msg1: device authorization request -->
  <text class="dcf-fm dcf-neu" x="213" y="74" font-size="11" text-anchor="middle">POST /device_authorization</text>
  <text class="dcf-fm dcf-neu" x="213" y="87" font-size="10" text-anchor="middle">client_id · scope=openid profile</text>
  <line x1="76" y1="96" x2="350" y2="96"/>
  <path d="M343 92 L350 96 L343 100"/>

  <!-- msg2: device authorization response -->
  <text class="dcf-fm dcf-neu" x="213" y="116" font-size="10.5" text-anchor="middle">200  device_code · user_code=ABCD-EFGH</text>
  <text class="dcf-fm dcf-neu" x="213" y="129" font-size="10" text-anchor="middle">verification_uri(_complete) · interval · expires_in</text>
  <line class="dcf-ret" x1="350" y1="138" x2="76" y2="138"/>
  <path d="M83 134 L76 138 L83 142"/>

  <!-- note over device -->
  <path class="dcf-frame" fill="var(--vp-c-bg)" d="M20 154 H238 L250 166 V196 H20 Z"/>
  <path class="dcf-frame" d="M238 154 V166 H250"/>
  <text class="dcf-fp dcf-neu" x="30" y="173" font-size="10.5">Display: open <tspan class="dcf-fm">op.example.com/device</tspan></text>
  <text class="dcf-fp dcf-neu" x="30" y="188" font-size="10.5">and enter <tspan class="dcf-fm">ABCD-EFGH</tspan></text>

  <!-- par frame -->
  <rect class="dcf-frame" x="30" y="210" width="658" height="264" rx="5"/>
  <line class="dcf-frame" x1="30" y1="356" x2="688" y2="356"/>
  <path class="dcf-tabbg" d="M30 210 h46 v12 l-6 6 h-40 z"/>
  <text class="dcf-fp dcf-mut" x="41" y="223" font-size="10.5" font-style="italic">par</text>
  <text class="dcf-fp dcf-mut" x="104" y="243" font-size="10.5">device polls the token endpoint</text>
  <text class="dcf-fp dcf-mut" x="40" y="370" font-size="10.5">user approves — out of band</text>

  <!-- loop frame -->
  <rect class="dcf-frame" x="44" y="250" width="340" height="94" rx="4"/>
  <path class="dcf-tabbg" d="M44 250 h50 v12 l-6 6 h-44 z"/>
  <text class="dcf-fp dcf-mut" x="55" y="263" font-size="10.5" font-style="italic">loop</text>
  <text class="dcf-fp dcf-mut" x="100" y="263" font-size="10.5">repeat every <tspan class="dcf-fm">interval</tspan> s</text>

  <!-- msg3: poll -->
  <text class="dcf-fm dcf-neu" x="213" y="284" font-size="11" text-anchor="middle">POST /token</text>
  <text class="dcf-fm dcf-neu" x="213" y="297" font-size="10" text-anchor="middle">grant_type=…:device_code · device_code</text>
  <line x1="76" y1="306" x2="350" y2="306"/>
  <path d="M343 302 L350 306 L343 310"/>

  <!-- msg4: pending -->
  <text class="dcf-fm dcf-neu" x="213" y="326" font-size="10.5" text-anchor="middle">400  authorization_pending</text>
  <line class="dcf-ret" x1="350" y1="334" x2="76" y2="334"/>
  <path d="M83 330 L76 334 L83 338"/>

  <!-- msg5: verification page -->
  <text class="dcf-fm dcf-neu" x="487" y="388" font-size="11" text-anchor="middle">GET /device</text>
  <text class="dcf-fp dcf-neu" x="487" y="401" font-size="10.5" text-anchor="middle">enter <tspan class="dcf-fm">ABCD-EFGH</tspan></text>
  <line x1="624" y1="410" x2="350" y2="410"/>
  <path d="M357 406 L350 410 L357 414"/>

  <!-- msg6: approve -->
  <text class="dcf-fp dcf-neu" x="487" y="444" font-size="10.5" text-anchor="middle">log in + consent → approve</text>
  <line x1="624" y1="452" x2="350" y2="452"/>
  <path d="M357 448 L350 452 L357 456"/>

  <!-- msg7: next poll -->
  <text class="dcf-fp dcf-neu" x="213" y="498" font-size="10.5" text-anchor="middle">next poll: <tspan class="dcf-fm">POST /token</tspan></text>
  <line x1="76" y1="506" x2="350" y2="506"/>
  <path d="M343 502 L350 506 L343 510"/>

  <!-- msg8: tokens -->
  <text class="dcf-fm dcf-neu" x="213" y="536" font-size="10.5" text-anchor="middle">200  access_token · id_token? · refresh_token?</text>
  <line class="dcf-ret" x1="350" y1="544" x2="76" y2="544"/>
  <path d="M83 540 L76 544 L83 548"/>
</svg>

The device never holds the user's password. The user never types anything on the device. The two surfaces meet at the OP through the short `user_code`.

## Polling responses

The token endpoint (`/token`) returns one of four shapes per poll:

| Response | Meaning | What the device should do |
|---|---|---|
| `400 authorization_pending` | The user has not approved (or denied) yet. | Wait `interval` seconds and try again. |
| `400 slow_down` | The device polled too fast. | Double the interval (RFC 8628 §3.5: "MUST honor the new value"). The OP persists the new interval atomically with `LastPolledAt` so a multi-replica deployment cannot be tricked into resetting it. |
| `400 access_denied` | The user clicked **deny** on the verification page (or an embedder revocation hook fired). | Stop polling. Show "Sign-in cancelled". |
| `400 expired_token` | The `device_code` outlived `expires_in` (default 600 s). | Stop polling. Restart the flow if the user wants to retry. |
| `200 { access_token, ... }` | The user approved. | Treat as a normal token response. |

::: warning user_code is brute-forceable by design
The `user_code` is short on purpose — long codes are unusable. That makes it brute-forceable in principle: an attacker who can hit `/device` faster than the user can type wins. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) with a per-record gate: `VerifyUserCode` constant-time-compares, increments a strike counter on miss, and locks the row out after `MaxUserCodeStrikes` (default 5). Embedders building their own verification page MUST use the helper, or implement an equivalent gate themselves.
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
(cd examples/31-device-code-cli && go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring, `cli.go` for the device-side polling, `device.go` for the simulated browser approval, `probe.go` for self-verification) so each surface is readable in isolation.

## Read next

- [Use case: device-code wiring](/use-cases/device-code) — `op.WithDeviceCodeGrant`, `devicecodekit.VerifyUserCode`, the verification page contract, and how to cascade-revoke issued tokens when a device is unenrolled.
- [CIBA primer](/concepts/ciba) — the conceptual sibling for "user is on a different channel" but without a code-on-screen ceremony.
