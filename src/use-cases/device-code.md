---
title: Device Code (RFC 8628) — wiring
description: Enable RFC 8628 device authorization — /device_authorization, polling, opaque-attempt-key verification, slow_down, and the embedder-owned approval page.
pageClass: pg-use-cases-device-code
---

# Use case — Device Code (RFC 8628)

For the conceptual background — what device flow is, when to pick it, why `slow_down` and `expired_token` exist — read the [Device Code primer](/concepts/device-code) first. This page covers the wiring.

<figure class="fig">
  <div class="fig-head">A code on one screen, typed into another</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-devicecode-title" viewBox="0 0 960 306" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-devicecode-title">An input-constrained device asks the OP for a device code and a short user code, prints the code, and polls the token endpoint. The user reads the code off that screen, enters it on their own phone or laptop, and approves there.</title>
    <rect class="fg-box" x="36" y="76" width="220" height="108" rx="8"/>
    <text class="fg-t2" x="146" y="106" text-anchor="middle">Device</text>
    <text class="fg-xs" x="146" y="128" text-anchor="middle">TV · CLI · printer</text>
    <line class="fg-rule" x1="56" y1="140" x2="236" y2="140"/>
    <text class="fg-xs" x="146" y="160" text-anchor="middle">input-constrained —</text>
    <text class="fg-xs" x="146" y="174" text-anchor="middle">no keyboard worth typing on</text>
    <rect class="fg-box fg-box--accent" x="320" y="46" width="320" height="168" rx="8"/>
    <text class="fg-t fg-accent" x="480" y="74" text-anchor="middle">OP</text>
    <line class="fg-rule" x1="340" y1="86" x2="620" y2="86"/>
    <text class="fg-mxs" x="340" y="112">/device_authorization</text>
    <text class="fg-xs" x="340" y="130">mints the pair of codes</text>
    <text class="fg-mxs" x="340" y="158">DeviceCodeStore</text>
    <text class="fg-xs" x="340" y="176">holds them until approval</text>
    <text class="fg-mxs" x="340" y="200">/token</text>
    <rect class="fg-box" x="704" y="76" width="220" height="108" rx="8"/>
    <text class="fg-t2" x="814" y="106" text-anchor="middle">The user's own device</text>
    <text class="fg-xs" x="814" y="128" text-anchor="middle">phone · laptop</text>
    <line class="fg-rule" x1="724" y1="140" x2="904" y2="140"/>
    <text class="fg-xs" x="814" y="160" text-anchor="middle">a browser they trust,</text>
    <text class="fg-xs" x="814" y="174" text-anchor="middle">and a keyboard</text>
    <path class="fg-edge" d="M260,96 H316" marker-end="url(#fg-a)"/>
    <circle class="fg-badge" cx="288" cy="84" r="8.5"/>
    <text class="fg-badge-t" x="288" y="87" text-anchor="middle">1</text>
    <path class="fg-edge fg-edge--accent" d="M316,126 H260" marker-end="url(#fg-ac)"/>
    <circle class="fg-badge" cx="288" cy="140" r="8.5"/>
    <text class="fg-badge-t" x="288" y="143" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--muted" d="M146,188 V232 H814 V188" marker-end="url(#fg-am)"/>
    <circle class="fg-badge" cx="480" cy="232" r="8.5"/>
    <text class="fg-badge-t" x="480" y="235" text-anchor="middle">3</text>
    <path class="fg-edge" d="M700,96 H648" marker-end="url(#fg-a)"/>
    <circle class="fg-badge" cx="672" cy="84" r="8.5"/>
    <text class="fg-badge-t" x="672" y="87" text-anchor="middle">4</text>
    <path class="fg-edge" d="M260,166 H316" marker-end="url(#fg-a)"/>
    <circle class="fg-badge" cx="288" cy="180" r="8.5"/>
    <text class="fg-badge-t" x="288" y="183" text-anchor="middle">5</text>
    <text class="fg-xs" x="36" y="266">1 · the device asks for a device_code and a user_code</text>
    <text class="fg-xs" x="36" y="284">2 · the OP returns both, plus the URL to visit</text>
    <text class="fg-xs" x="500" y="266">3 · the user reads the short code off the screen</text>
    <text class="fg-xs" x="500" y="284">4 · enters it and approves · 5 · the device polls /token</text>
  </svg>
  <figcaption class="fig-note">The dashed path is a person, not a network. Everything the flow needs from that leg is one short code, chosen to be readable and typeable rather than unguessable — the <code>device_code</code> the device keeps is the secret.</figcaption>
</figure>

::: details `device_code` vs `user_code` — what's the difference?
Two different identifiers come back from `/device_authorization`. **`device_code`** is a long opaque string the device keeps to itself and submits on every `/token` poll — it's effectively a bearer credential for "this pending authorization". **`user_code`** is the short, human-typeable string ("BDWP-HQPK") the device shows on its screen so the user can enter it on their phone or laptop. They live for the same duration (`expires_in`) but are presented to entirely different audiences; the user never sees `device_code`, the OP never accepts `user_code` on `/token`.
:::

::: details `verification_uri` vs `verification_uri_complete` — what's the difference?
**`verification_uri`** is the bare URL the user visits and types `user_code` into manually — printed on the screen for users who can't scan. **`verification_uri_complete`** is the same URL with `user_code` pre-filled as a query parameter, ideal for QR codes so the user doesn't have to type anything. Both reach the same embedder-owned page; the page should pre-populate from the `user_code` query parameter when it is present, and fall back to a manual input form otherwise.
:::

::: details `interval` and polling — what's that?
RFC 8628 has the device hit `/token` repeatedly until the user approves on their phone. `interval` (seconds) is the OP-set minimum delay between polls. If the device polls faster, the OP returns `slow_down` and bumps the device's stored interval — every replica honours the new floor. The default is 5 seconds; tighten it only if your fleet handles outage cleanup quickly enough that 5s of latency is the bottleneck.
:::

## Enabling the grant

```go
import (
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // ships a DeviceCodeStore substore
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithGrants(grant.DeviceCode),
  op.WithDeviceCodeGrant(),
  op.WithDeviceCodeExpiry(10*time.Minute),       // optional; default 10 minutes
  op.WithDeviceCodePollInterval(5*time.Second), // optional; default 5 seconds

  op.WithStaticClients(op.PublicClient{
    ID:           "tv-app",
    RedirectURIs: nil, // device-code clients never visit /auth
    GrantTypes:   []string{"urn:ietf:params:oauth:grant-type:device_code"},
    Scopes:       []string{"openid", "profile", "offline_access"},
  }),
)
```

`op.WithDeviceCodeGrant()` does three things:

1. Mounts `/device_authorization` at the configured endpoint path.
2. Registers the device-code URN (`urn:ietf:params:oauth:grant-type:device_code`) at `/token`.
3. Advertises `device_authorization_endpoint` and the URN in `grant_types_supported` in the discovery document.

The device-code substore (`store.DeviceCodeStore`) is required. The in-memory and SQL adapters both ship one — the SQL adapter persists to the `oidc_device_codes` table across sqlite / mysql / postgres. The Redis adapter returns `nil` for this substore, so on a Redis-only deployment route `DeviceCodes` to a durable tier (SQL or in-memory) through the composite adapter.

::: warning Substore-presence is enforced at op.New
If the configured store does not return a non-nil `DeviceCodes()` substore, `op.New` returns a configuration error rather than panicking on the first poll. The same gate fires whether you activate the grant via the dedicated `op.WithDeviceCodeGrant()` option or via `op.WithGrants(grant.DeviceCode, ...)` — both paths require the substore.
:::

## The verification page

`/device_authorization` returns a `verification_uri` that points at the page where users approve the request. **The library does not host this page** — by design. Verification is owned by the embedder for two reasons:

1. **Branding and UX**: the page lives next to the rest of your sign-in UI.
2. **Anti-abuse policy**: per-record brute-force gating, IP rate limiting, captcha, audit triage — these belong with the embedder's existing fraud stack.

The default URI is `<issuer>/device`; override it with `op.WithDeviceVerificationURI("https://acme.com/connect")` if your verification page lives elsewhere.

`expires_in` and `interval` have their own knobs: `op.WithDeviceCodeExpiry(...)` and `op.WithDeviceCodePollInterval(...)`. They are no longer derived from `op.WithAccessTokenTTL`. A deployment that uses 30- or 60-second access tokens can still leave the user ten minutes to reach a phone, enter the code, and approve the request.

::: warning user_code is brute-forceable by design
Short codes are usable; long codes are not. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) so embedders building the verification page do not have to invent the brute-force gate. For the first manual entry, **use `VerifyUserCodeByAttemptKey`** with an opaque server-side ceremony key, then call `ApproveUserCode` after authentication and consent. Never use the raw `user_code` as the attempt key.
:::

### Verifying a submitted user_code

```go
import (
    "crypto/rand"
    "encoding/base64"
    "errors"
    "time"

    "github.com/libraz/go-oidc-provider/op/devicecodekit"
)

// Build deps once, retain it, and pass the same pointer to every helper.
// Deps contains a mutex-backed default limiter; never copy it after use.
deps := &devicecodekit.Deps{
    DeviceCodes:  st.DeviceCodes(),
    AuditLogger: auditLogger, // optional; receives helper audit records
}

// The attempt key identifies the authenticated server-side ceremony. It is
// opaque and must not be the user-supplied user_code.
var rawAttemptKey [32]byte
if _, err := rand.Read(rawAttemptKey[:]); err != nil { /* handle 500 */ }
attemptKey := base64.RawURLEncoding.EncodeToString(rawAttemptKey[:])

matched, err := devicecodekit.VerifyUserCodeByAttemptKey(ctx, deps, attemptKey, submittedUserCode)
switch {
case err == nil && matched:
    // Code matched — proceed to consent screen.
case errors.Is(err, devicecodekit.ErrAlreadyDecided):
    // The record was already approved or denied. Surface "already used".
case errors.Is(err, devicecodekit.ErrUnknownDeviceCode), errors.Is(err, devicecodekit.ErrAttemptLocked):
    // Unknown/malformed or over-budget entry. Do not reveal which.
default:
    // Unexpected — log and surface a generic error.
}

// After the authenticated user approves the requested scopes:
if matched {
    err = devicecodekit.ApproveUserCode(ctx, deps, submittedUserCode, approvedSubject, time.Now())
}
```

The helper:

- **Canonicalises** the submitted string (case folding, hyphen stripping).
- **Constant-time compares** against the stored value.
- Charges the opaque attempt key before normalization and lookup, so malformed and unknown entries consume the same bounded budget; mismatches emit the `device_code.verification.user_code_brute_force` audit event through `Deps.AuditLogger` when configured.
- The built-in limiter is process-local and bounded. A deployment with multiple OP instances must inject a shared, atomic `AttemptLimiter` into `Deps.AttemptLimiter`; a separate read-then-increment implementation is not safe.
- Record-bound helpers still apply `devicecodekit.MaxUserCodeStrikes` (default 5) per device-code row. `ApproveUserCode` emits `device_code.verification.approved` through `Deps.AuditLogger` after the store transition.

If the user pressed **deny** rather than mistyping, your handler calls `devicecodekit.DenyUserCode(ctx, deps, submittedUserCode, devicecodekit.DenyReasonUserDenied)` or `devicecodekit.Revoke` for a known device-code id. The helper emits the corresponding audit event through `Deps.AuditLogger`; it does not charge a manual-entry mismatch.

### After approval

Once consent is granted, your handler calls `ApproveUserCode` with the same `*devicecodekit.Deps` pointer to flip the record to **Approved**:

```go
// `deps` is the retained pointer passed to VerifyUserCodeByAttemptKey.
// authTime is the wall-clock when the user actually authenticated; the
// token endpoint stamps id_token.auth_time from it (omit-on-zero), and
// clients with `RequireAuthTime` registered enforce it on the gate.
err := devicecodekit.ApproveUserCode(ctx, deps, submittedUserCode, approvedSubject, time.Now())
```

The next `/token` poll from the device will succeed.

## What `/device_authorization` returns

```sh
curl -s -d 'client_id=tv-app&scope=openid profile' \
  https://op.example.com/oidc/device_authorization
```

```json
{
  "device_code": "f8b2c1d4...long-opaque",
  "user_code": "BDWP-HQPK",
  "verification_uri": "https://op.example.com/device",
  "verification_uri_complete": "https://op.example.com/device?user_code=BDWP-HQPK",
  "expires_in": 600,
  "interval": 5
}
```

The device displays the `user_code` + `verification_uri`. If it can render a QR code, encode `verification_uri_complete` so the user does not have to type the code at all.

## RFC 8707 `resource=`

Devices may pin the issued access token to a specific resource server by sending `resource=<absolute URI>` on `/device_authorization`. The handler enforces the same gate as `/auth` and `/token`:

- The value MUST be an absolute URI (RFC 8707 §2). Relative URIs are rejected with `400 invalid_target`.
- The canonical form (lowercase scheme + host, trailing slash stripped) MUST appear in the client's registered `Resources` allowlist. A request that names a resource the client was never registered for is rejected with `400 invalid_target` — `Resources` is the only audience the OP will mint into the issued AT's `aud`.
- Multiple non-empty `resource=` values are rejected with `400 invalid_target`. The issuance pipeline accepts one audience, so the handler refuses input it would otherwise silently truncate.

::: warning Unregistered resources are rejected
The OP mints only audiences that appear in the client's registered `Resources`. Embedders must add every device-flow resource server URI to the client seed (or dynamic-registration metadata) before sending it as `resource=`.
:::

## Sender-constrained device records

When DPoP or mTLS is used, `/device_authorization` records the DPoP key thumbprint and/or mTLS certificate thumbprint. At `/token`, every binding present on the record is checked again before issuing a token. A record carrying both bindings requires both a matching DPoP proof and a matching mTLS certificate; presenting only one is insufficient. A missing or mismatched proof fails redemption. On success, the issued token's `cnf` carries every binding the OP reverified.

## Polling responses

| Wire response | Meaning |
|---|---|
| `400 authorization_pending` | User has not approved yet. Poll again after `interval` seconds. |
| `400 slow_down` | Polled too fast. Add 5 seconds to the polling interval for this and subsequent responses, per RFC 8628 §3.5. The OP persists the new interval atomically so this is enforced across replicas. If persisting the observation faults, the OP emits `device_code.poll_observation.failed` so the observability gap is visible. |
| `400 access_denied` | User denied (or the brute-force gate locked out, or `devicecodekit.Revoke` was called). Stop polling. |
| `400 expired_token` | `device_code` outlived `expires_in`. Stop polling. |
| `200 { access_token, ... }` | Approved — treat as a normal token response. |

## Cascade-revoking when a device is unenrolled

When an embedder revokes a device authorization (user clicks "remove this TV" in account settings), every access token issued from that device should die alongside the row. `devicecodekit.Revoke` performs that cascade when `devicecodekit.Deps.AccessTokens` is wired:

::: details Cascade revocation — what's that?
When a "parent" record (here, the device authorization) is revoked, every "child" credential issued from it should die in the same act. For device-code that means every access token whose `GrantID` references the device-code id. Without the cascade, the user clicks "remove this TV" but the access token in the TV's memory keeps working until its TTL expires — the revocation is silently incomplete. The library tags every issued token with `GrantID` so the helper can run this walk in one query.
:::

```go
deps := &devicecodekit.Deps{
    DeviceCodes:  st.DeviceCodes(),
    AccessTokens: st.AccessTokens(), // optional; nil skips the cascade
    AuditLogger:  auditLogger, // optional; receives the revoke audit record
}

if err := devicecodekit.Revoke(ctx, deps, deviceCodeID, devicecodekit.DenyReasonUserRevokedDevice); err != nil {
    // log + surface an operator-visible failure
}
```

When `AccessTokens` is set, the `device_code.revoked` audit event includes `revoked_access_tokens`. A nil registry is valid for JWT-stateless or out-of-band deployments; the authorization row is still denied and the audit event still fires.

## See it run

[`examples/31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) drives the full RFC 8628 round trip:

```sh
(cd examples/31-device-code-cli && GOWORK=off go run -tags example .)
```

The example boots the OP, prints a boxed `user_code` panel + `verification_uri_complete` shortcut, simulates browser approval after a few seconds, and polls until the OP issues an access_token + id_token. Files are split by role (`op.go` / `cli.go` / `device.go` / `probe.go`).

## Read next

- [Device Code primer](/concepts/device-code) — Netflix-style explanation of the flow.
- [CIBA wiring](/use-cases/ciba) — when the user is on a different surface but no code-on-screen ceremony fits.
