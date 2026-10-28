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
  <div class="fig-head">The user approves on a second screen while the device polls</div>
  <svg class="fig-svg" role="img" aria-labelledby="device-flow-title" viewBox="0 0 960 888" xmlns="http://www.w3.org/2000/svg">
    <title id="device-flow-title">The device authorization grant. The device asks for a device code and a short user code, shows the user where to go, and polls the token endpoint while the user approves on a second screen. Once approval lands, the next poll returns tokens.</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="296" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">Request the codes</text>
    <rect class="fg-group" x="32" y="424" width="896" height="440" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="452">Wait for approval</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="864"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="864"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="864"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Device</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">TV · CLI · console</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">User</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">phone · second screen</text>
    <!-- device authorization -->
    <path class="fg-edge" d="M192,206 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="172" text-anchor="middle">POST /device_authorization</text>
    <text class="fg-mxs" x="352" y="194" text-anchor="middle">client_id · scope</text>
    <!-- codes -->
    <path class="fg-edge fg-edge--accent" d="M512,278 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="244" text-anchor="middle">200 · device_code, user_code</text>
    <text class="fg-mxs" x="352" y="266" text-anchor="middle">verification_uri · interval</text>
    <!-- device shows the code -->
    <path class="fg-edge" d="M192,318 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="324">show the URL and the code</text>
    <text class="fg-mxs" x="248" y="346">op.example.com/device</text>
    <text class="fg-mxs fg-accent" x="248" y="368">user_code=ABCD-EFGH</text>
    <!-- poll -->
    <path class="fg-edge" d="M192,526 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="492" text-anchor="middle">POST /token · poll</text>
    <text class="fg-mxs" x="352" y="514" text-anchor="middle">grant_type=…:device_code</text>
    <!-- pending -->
    <path class="fg-edge fg-edge--muted" d="M512,582 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl" x="352" y="572" text-anchor="middle">400 · authorization_pending</text>
    <!-- user opens the verification page -->
    <path class="fg-edge" d="M824,638 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="628" text-anchor="middle">GET /device · user_code</text>
    <!-- approval -->
    <path class="fg-edge fg-edge--accent" d="M512,678 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="684">log in, consent, approve</text>
    <text class="fg-mxs" x="568" y="706">device_code → subject</text>
    <!-- next poll -->
    <path class="fg-edge" d="M192,768 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="758" text-anchor="middle">POST /token · next poll</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M512,840 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="806" text-anchor="middle">200 · access_token</text>
    <text class="fg-mxs" x="352" y="828" text-anchor="middle">id_token? · refresh_token?</text>
  </svg>
  <figcaption class="fig-note">The device holds only the <code>device_code</code> and never sees a password; the short <code>user_code</code> exists so a person can retype it on a real keyboard. The poll repeats every <code>interval</code> seconds until the approval lands.</figcaption>
</figure>

The device never holds the user's password. The user never types anything on the device. The two surfaces meet at the OP through the short `user_code`.

## Polling responses

The token endpoint (`/token`) returns one of four shapes per poll:

| Response | Meaning | What the device should do |
|---|---|---|
| `400 authorization_pending` | The user has not approved (or denied) yet. | Wait `interval` seconds and try again. |
| `400 slow_down` | The device polled too fast. | Increase the interval by 5 seconds for this and all subsequent requests (RFC 8628 §3.5). The OP persists the new interval atomically with `LastPolledAt` so a multi-replica deployment cannot be tricked into resetting it. |
| `400 access_denied` | The user clicked **deny** on the verification page, an embedder revoked the record, or the device ignored `slow_down` five times (`poll_abuse`). | Stop polling. Show "Sign-in cancelled". |
| `400 expired_token` | The `device_code` outlived `expires_in` (default 600 s), or an earlier poll already redeemed it. | Stop polling. Restart the flow if the user wants to retry. |
| `200 { access_token, ... }` | The user approved. | Treat as a normal token response. |

The device may poll no faster than `interval` (default 5 s, with one second of jitter tolerance). A poll sooner than that is answered `slow_down`, and the fifth such offence ends the record with `access_denied`.

Each `device_code` record moves through a closed set of states, and the token endpoint's answer follows from the state:

| Record state | Reached when | Next poll answers |
|---|---|---|
| Pending | `POST /device_authorization` created it | `authorization_pending` |
| Approved | the verification page called `ApproveUserCode` | tokens, and the record becomes Consumed |
| Denied | the user denied, the embedder revoked it, or a lockout fired (`poll_abuse`, or `user_code_lockout` from the record-bound verify helpers) | `access_denied` |
| Consumed | a poll redeemed the approval | `expired_token` |

Redemption is a single atomic Approved-to-Consumed transition, so two racing polls cannot both receive tokens. The loser gets `expired_token`.

::: warning user_code is brute-forceable by design
The `user_code` is short on purpose — long codes are unusable. That makes it brute-forceable in principle: an attacker who can hit `/device` faster than the user can type wins. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit). For the first manual entry, call `VerifyUserCodeByAttemptKey` with an opaque, server-side ceremony key, then call `ApproveUserCode` after the user authenticates and consents. Do not use the raw `user_code` as the attempt key. `Deps` contains a mutex-backed limiter and must be retained and passed by pointer; never copy it. The default limiter is process-local, so multi-instance deployments need a shared atomic `AttemptLimiter`.
:::

## What the OP serves and what you build

`op.WithDeviceCodeGrant()` mounts `/device_authorization`, advertises `device_authorization_endpoint` in discovery, and adds the device grant to the enabled set. It does **not** serve the verification page. You host that page (default URL `<issuer>/device`, override with `op.WithDeviceVerificationURI`), authenticate the user, and call the `devicecodekit` helpers:

```go
deps := &devicecodekit.Deps{DeviceCodes: st.DeviceCodes(), Grants: st.Grants()} // keep one, pass the pointer

ok, err := devicecodekit.VerifyUserCodeByAttemptKey(ctx, deps, ceremonyKey, typedCode)
// ok && err == nil: show consent, then
err = devicecodekit.ApproveUserCode(ctx, deps, typedCode, subject, authTime)
// or devicecodekit.DenyUserCode(ctx, deps, typedCode, devicecodekit.DenyReasonUserDenied)
```

`op.WithDeviceCodeExpiry` and `op.WithDeviceCodePollInterval` set the `expires_in` and `interval` the device is told; both must be positive.

Redeeming an approval records a consent grant for that client, so tokens from the device flow are covered by `RevokeSubject` and grant management, and report the public (pairwise) subject at introspection and `/userinfo`. A later `/auth` request from the same client for the same scopes skips the consent screen. `devicecodekit.Revoke(ctx, deps, deviceCode, reason)` cascades to the access and refresh tokens issued under that grant, through whichever token stores you set on `Deps` (`AccessTokens` or `GrantRevocations`, `OpaqueAccessTokens`, `RefreshTokens`). Set `Deps.Grants` as well, or the grant record itself stays behind.

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
- [Authorization code + PKCE](/concepts/authorization-code-pkce) — the default flow whenever the client can open a browser.
- [CIBA primer](/concepts/ciba) — the conceptual sibling for "user is on a different channel" but without a code-on-screen ceremony.
