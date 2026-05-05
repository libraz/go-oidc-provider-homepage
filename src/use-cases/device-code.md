---
title: Device Code (RFC 8628) — wiring
description: Enable the device-authorization grant — /device_authorization, polling, slow_down, and the embedder-owned verification page.
---

# Use case — Device Code (RFC 8628)

For the conceptual background — what device flow is, when to pick it, why `slow_down` and `expired_token` exist — read the [Device Code primer](/concepts/device-code) first. This page covers the wiring.

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
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // ships a DeviceCodeStore substore
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithDeviceCodeGrant(),

  op.WithStaticClients(op.PublicClient{
    ID:           "tv-app",
    RedirectURIs: nil, // device-code clients never visit /authorize
    GrantTypes:   []string{"urn:ietf:params:oauth:grant-type:device_code"},
    Scopes:       []string{"openid", "profile", "offline_access"},
  }),
)
```

`op.WithDeviceCodeGrant()` does three things:

1. Mounts `/device_authorization` at the configured endpoint path.
2. Registers the device-code URN (`urn:ietf:params:oauth:grant-type:device_code`) at `/token`.
3. Advertises `device_authorization_endpoint` and the URN in `grant_types_supported` in the discovery document.

The device-code substore (`store.DeviceCodeStore`) is required: the in-memory adapter ships one out of the box; SQL / Redis adapters land in v0.9.2.

::: warning Substore-presence is enforced at op.New
If the configured store does not return a non-nil `DeviceCodes()` substore, `op.New` returns a configuration error rather than panicking on the first poll. The same gate fires whether you activate the grant via the dedicated `op.WithDeviceCodeGrant()` option or via `op.WithGrants(grant.DeviceCode, ...)` — both paths require the substore. SQL / Redis adapters in v0.9.0 do not yet provide one; use the in-memory adapter, the composite adapter (in-memory hot tier), or wait for v0.9.2.
:::

## The verification page

`/device_authorization` returns a `verification_uri` that points at the page where users approve the request. **The library does not host this page** — by design. Verification is owned by the embedder for two reasons:

1. **Branding and UX**: the page lives next to the rest of your sign-in UI.
2. **Anti-abuse policy**: per-record brute-force gating, IP rate limiting, captcha, audit triage — these belong with the embedder's existing fraud stack.

The default URI is `<issuer>/device`; override it with `op.WithDeviceVerificationURI("https://acme.com/connect")` if your verification page lives elsewhere.

::: warning user_code is brute-forceable by design
Short codes are usable; long codes are not. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) so embedders building the verification page do not have to invent the brute-force gate. **Use it** unless you have a fully-equivalent gate in your existing stack.
:::

### Verifying a submitted user_code

```go
import "github.com/libraz/go-oidc-provider/op/devicecodekit"

// In your verification handler:
matched, err := devicecodekit.VerifyUserCode(ctx, deps, deviceCodeID, submittedUserCode)
switch {
case err == nil && matched:
    // Code matched — proceed to consent screen.
case errors.Is(err, devicecodekit.ErrAlreadyDecided):
    // The record was already approved or denied. Surface "already used".
case errors.Is(err, devicecodekit.ErrUserCodeMismatch):
    // Wrong code; counter incremented. Show "incorrect code"; do not leak how many strikes remain.
case errors.Is(err, devicecodekit.ErrUserCodeLockout):
    // Five strikes — the row was flipped to Denied with reason "user_code_lockout".
    // The device will see access_denied on its next poll.
default:
    // Unexpected — log and surface a generic error.
}
```

The helper:

- **Canonicalises** the submitted string (case folding, hyphen stripping).
- **Constant-time compares** against the stored value.
- Increments the strike counter on miss and emits the `device_code.verification.user_code_brute_force` audit event.
- After `devicecodekit.MaxUserCodeStrikes` (default 5) misses, transitions the row to **Denied** with reason `"user_code_lockout"` and emits `device_code.verification.denied`.

If the user pressed **deny** rather than mistyping, your handler calls `devicecodekit.Revoke(ctx, deps, deviceCodeID, "user_denied")` instead — same audit event, no brute-force counter mutation.

### After approval

Once consent is granted, your handler calls the substore directly to flip the record to **Approved**:

```go
// Call the substore on the *inmem.Store (or other adapter) the embedder
// passed to op.WithStore — there is no provider.Store() accessor.
// authTime is the wall-clock when the user actually authenticated; the
// token endpoint stamps id_token.auth_time from it (omit-on-zero), and
// clients with `RequireAuthTime` registered enforce it on the gate.
err := st.DeviceCodes().Approve(ctx, deviceCodeID, approvedSubject, time.Now())
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

Devices may pin the issued access token to a specific resource server by sending `resource=<absolute URI>` on `/device_authorization`. The handler enforces the same gate as `/authorize` and `/token`:

- The value MUST be an absolute URI (RFC 8707 §2). Relative URIs are rejected with `400 invalid_target`.
- The canonical form (lowercase scheme + host, trailing slash stripped) MUST appear in the client's registered `Resources` allowlist. A request that names a resource the client was never registered for is rejected with `400 invalid_target` — `Resources` is the only audience the OP will mint into the issued AT's `aud`.
- Multiple non-empty `resource=` values are rejected with `400 invalid_target`. The current issuance pipeline encodes a single audience, so the handler refuses input it would otherwise silently truncate. Multi-aud support is deferred.

::: warning Pre-v0.9.x silently accepted unregistered resources
Earlier releases checked only that `resource=` parsed as an absolute URI; the value was persisted on the device-code record and surfaced on the eventual access token's `aud` claim regardless of the client's registered `Resources`. Embedders relying on that lenient behaviour MUST extend the client's `Resources` to include the value, or stop sending `resource=`.
:::

## Polling responses

| Wire response | Meaning |
|---|---|
| `400 authorization_pending` | User has not approved yet. Poll again after `interval` seconds. |
| `400 slow_down` | Polled too fast. Double the interval — RFC 8628 §3.5. The OP persists the new interval atomically so this is enforced across replicas. |
| `400 access_denied` | User denied (or the brute-force gate locked out, or `devicecodekit.Revoke` was called). Stop polling. |
| `400 expired_token` | `device_code` outlived `expires_in`. Stop polling. |
| `200 { access_token, ... }` | Approved — treat as a normal token response. |

## Cascade-revoking when a device is unenrolled

When an embedder revokes a device authorization (user clicks "remove this TV" in account settings), every access token issued from that device should die alongside the row. v0.9.1 ships the audit signal but defers the in-tree cascade walk to v0.9.2; until then, embedders subscribe to `op.AuditDeviceCodeRevoked` and run the cascade themselves:

::: details Cascade revocation — what's that?
When a "parent" record (here, the device authorization) is revoked, every "child" credential issued from it should die in the same act. For device-code that means: every access token whose `GrantID` references the device-code id, every refresh token in the same chain. Without the cascade, the user clicks "remove this TV" but the access token in the TV's memory keeps working until its TTL expires — the revocation is silently incomplete. The library tags every issued token with `GrantID` precisely so the embedder can run this walk in one query.
:::

```go
// In your audit logger / observer:
case op.AuditDeviceCodeRevoked:
    deviceCodeID := event.Extras["device_code_id"].(string)
    // Every access token derived from this device authorization carries
    // GrantID == deviceCodeID, so the existing per-grant cascade is sufficient.
    if _, err := st.AccessTokens().RevokeByGrant(ctx, deviceCodeID); err != nil {
        // log + alert
    }
```

A library-side `IssuedAccessTokens(deviceCodeID) []string` substore extension and an OP-side `RevokeByGrant` driver are tracked for v0.9.2 alongside the SQL / Redis substore wiring.

## See it run

[`examples/30-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/30-device-code-cli) drives the full RFC 8628 round trip:

```sh
go run -tags example ./examples/30-device-code-cli
```

The example boots the OP, prints a boxed `user_code` panel + `verification_uri_complete` shortcut, simulates browser approval after a few seconds, and polls until the OP issues an access_token + id_token. Files are split by role (`op.go` / `cli.go` / `device.go` / `probe.go`).

## Read next

- [Device Code primer](/concepts/device-code) — Netflix-style explanation of the flow.
- [CIBA wiring](/use-cases/ciba) — when the user is on a different surface but no code-on-screen ceremony fits.
