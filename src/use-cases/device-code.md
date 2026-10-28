---
title: Device Code (RFC 8628) — wiring
description: Enable RFC 8628 device authorization — /device_authorization, polling, opaque-attempt-key verification, slow_down, and the embedder-owned approval page.
pageClass: pg-use-cases-device-code
---

# Use case — Device Code (RFC 8628)

The device flow lets a device with no usable keyboard or browser (a TV, a CLI, a printer) get tokens by sending the user to a second device to approve. For the concepts, including when to pick it and why `slow_down` and `expired_token` exist, read the [Device Code primer](/concepts/device-code) first. This page covers the wiring.

<figure class="fig">
  <div class="fig-head">A code on one screen, typed into another</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-devicecode-title" viewBox="0 0 960 616" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-devicecode-title">An input-constrained device asks the OP for a device code and a short user code, shows the code, and polls the token endpoint. The user reads the code off that screen, enters it on their own phone or laptop, and approves there; the next poll returns tokens.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="592"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="592"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="592"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Device</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">TV · CLI · printer</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">User's device</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">phone · laptop</text>
    <!-- ask -->
    <path class="fg-edge" d="M192,136 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="126" text-anchor="middle">POST /device_authorization</text>
    <!-- codes -->
    <path class="fg-edge fg-edge--accent" d="M512,208 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="174" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="352" y="196" text-anchor="middle">device_code · user_code · URL</text>
    <!-- show -->
    <path class="fg-edge" d="M192,256 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="262">show the user_code</text>
    <text class="fg-s" x="248" y="284">and the URL</text>
    <!-- human -->
    <path class="fg-edge fg-edge--muted" d="M192,352 H824" marker-end="url(#fg-am)"/>
    <text class="fg-s fg-halo" x="504" y="342" text-anchor="middle">a person reads the code and types it elsewhere</text>
    <!-- approve -->
    <path class="fg-edge" d="M824,424 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="414" text-anchor="middle">enter the code and approve</text>
    <!-- poll -->
    <path class="fg-edge" d="M192,496 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="486" text-anchor="middle">POST /token · poll</text>
    <!-- tokens -->
    <path class="fg-edge fg-edge--accent" d="M512,568 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="558" text-anchor="middle">tokens, once approved</text>
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
RFC 8628 has the device call `/token` repeatedly until the user approves on their phone. `interval` (seconds) is the minimum delay between polls that the OP asks for. If the device polls faster, the OP answers `slow_down` and raises the stored interval, so every replica enforces the new minimum. The default is 5 seconds.
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

  // Naming grant.DeviceCode replaces the default
  // {authorization_code, refresh_token} pair: the device has no browser.
  // WithDeviceCodeGrant mounts /device_authorization and requires the
  // DeviceCodes substore.
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

The device-code substore (`store.DeviceCodeStore`) is required. The in-memory, SQL, and DynamoDB adapters each ship one; the SQL adapter persists to the `oidc_device_codes` table on sqlite, mysql, and postgres. The Redis adapter returns `nil` for this substore, so on a Redis-based deployment route `DeviceCodes` to a durable tier (SQL or in-memory) through the composite adapter.

::: warning Substore presence is checked at op.New
If the configured store returns a nil `DeviceCodes()` substore, `op.New` fails with a configuration error instead of panicking on the first poll. The check applies whether you activate the grant with `op.WithDeviceCodeGrant()` or with `op.WithGrants(grant.DeviceCode, ...)`.
:::

## The verification page

`/device_authorization` returns a `verification_uri` that points at the page where users approve the request. **The library does not host this page**, for two reasons:

1. **Branding and UX**: the page belongs next to the rest of your sign-in UI.
2. **Anti-abuse policy**: per-record brute-force limits, IP rate limiting, captcha, and audit triage belong with your existing fraud controls.

The default URI is `<issuer>/device`; override it with `op.WithDeviceVerificationURI("https://acme.com/connect")` if your verification page lives elsewhere (it must be an absolute URL).

`expires_in` and `interval` have their own options, `op.WithDeviceCodeExpiry(...)` and `op.WithDeviceCodePollInterval(...)`, independent of `op.WithAccessTokenTTL`. A deployment with 30- or 60-second access tokens can still give the user ten minutes to reach a phone, enter the code, and approve.

<figure class="fig">
  <div class="fig-head">Device authorization record: states and who moves it</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-dc-state-title" viewBox="0 0 960 456" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dc-state-title">A device authorization starts Pending. Your verification page moves it to Approved or Denied, the brute-force limit moves it to Denied, and a successful token poll moves Approved to Consumed. Revoke turns Pending or Approved into Denied, and a record that outlives expires_in answers expired_token.</title>
    <rect class="fg-box fg-box--accent" x="32" y="32" width="288" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="60">Pending</text>
    <text class="fg-mxs" x="48" y="84">/device_authorization</text>
    <rect class="fg-box" x="32" y="176" width="288" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="204">Approved</text>
    <text class="fg-s" x="48" y="228">subject and auth_time recorded</text>
    <rect class="fg-box fg-box--sub" x="32" y="320" width="288" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="348">Consumed</text>
    <text class="fg-s" x="48" y="372">tokens issued once</text>
    <rect class="fg-box fg-box--danger" x="544" y="176" width="288" height="72" rx="8"/>
    <text class="fg-t2" x="560" y="204">Denied</text>
    <text class="fg-s" x="560" y="228">the poll gets access_denied</text>
    <!-- Pending to Approved -->
    <path class="fg-edge fg-edge--accent" d="M176,104 V176" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="188" y="144">ApproveUserCode</text>
    <!-- Approved to Consumed -->
    <path class="fg-edge" d="M176,248 V320" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="188" y="288">/token poll succeeds</text>
    <!-- Pending to Denied -->
    <path class="fg-edge fg-edge--danger" d="M320,68 H688 V176" marker-end="url(#fg-ad)"/>
    <text class="fg-m" x="504" y="34" text-anchor="middle">DenyUserCode</text>
    <text class="fg-mxs" x="504" y="56" text-anchor="middle">user_code lockout · Revoke</text>
    <!-- Approved to Denied -->
    <path class="fg-edge fg-edge--danger" d="M320,212 H544" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs" x="432" y="202" text-anchor="middle">Revoke</text>
    <!-- note -->
    <text class="fg-xs" x="32" y="432">A record that outlives expires_in answers expired_token.</text>
  </svg>
  <figcaption class="fig-note">Your page owns the two transitions out of Pending. The OP owns the last one, and it happens at most once per record.</figcaption>
</figure>

::: warning user_code is brute-forceable by design
A `user_code` has to be short enough to type, so an attacker can guess it unless the verification page limits attempts. The library ships [`op/devicecodekit`](https://github.com/libraz/go-oidc-provider/tree/main/op/devicecodekit) so you do not have to build that limit yourself. For the first manual entry, **use `VerifyUserCodeByAttemptKey`** with an opaque server-side ceremony key, then call `ApproveUserCode` after authentication and consent. Never use the raw `user_code` as the attempt key.
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

// The attempt key identifies one server-side ceremony (for example the
// signed-in browser session on the verification page). Mint it once when
// the ceremony starts and reuse it for every submission in that ceremony;
// the limiter charges each call against it. A key minted per submission
// would give every guess a fresh budget. It is opaque and must not be the
// user-supplied user_code.
var rawAttemptKey [32]byte
if _, err := rand.Read(rawAttemptKey[:]); err != nil { /* handle 500 */ }
attemptKey := base64.RawURLEncoding.EncodeToString(rawAttemptKey[:])
// ... store attemptKey in the ceremony's server-side session ...

matched, err := devicecodekit.VerifyUserCodeByAttemptKey(ctx, deps, attemptKey, submittedUserCode)
switch {
case err == nil && matched:
    // Code matched — proceed to consent screen.
case errors.Is(err, devicecodekit.ErrAlreadyDecided):
    // The record was already approved or denied. Surface "already used".
case errors.Is(err, devicecodekit.ErrUnknownDeviceCode), errors.Is(err, devicecodekit.ErrAttemptLocked):
    // Unknown/malformed or over-budget entry. Do not reveal which.
case errors.Is(err, devicecodekit.ErrAttemptLimiterSaturated):
    // The built-in limiter is full of live keys: an overload signal, not a
    // verdict on this key. Ask the user to retry shortly.
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
- **Compares in constant time** against the stored value.
- Charges the opaque attempt key before normalization and lookup, so malformed and unknown entries consume the same bounded budget. Each mismatch emits the `device_code.verification.user_code_brute_force` audit event through `Deps.AuditLogger` when one is configured.
- Uses a built-in limiter that is process-local and bounded. A deployment with several OP instances must put a shared, atomic `AttemptLimiter` in `Deps.AttemptLimiter`; a separate read-then-increment implementation is not safe.
- Leaves the record-bound helpers (`VerifyUserCode`, `VerifyUserCodeByUserCode`) on their own per-record limit of `devicecodekit.MaxUserCodeStrikes` (5), after which the record is denied with the reason `user_code_lockout`.

If the user pressed **deny** rather than mistyping, your handler calls `devicecodekit.DenyUserCode(ctx, deps, submittedUserCode, devicecodekit.DenyReasonUserDenied)`, or `devicecodekit.Revoke` for a known device-code id. Either call emits its audit event through `Deps.AuditLogger` and does not charge a manual-entry mismatch.

### After approval

Once the user has authenticated and consented, your handler calls `ApproveUserCode` with the same `*devicecodekit.Deps` pointer to move the record to **Approved**. It emits `device_code.verification.approved` after the store accepts the transition.

```go
// `deps` is the retained pointer passed to VerifyUserCodeByAttemptKey.
// authTime is the wall-clock when the user actually authenticated; the
// token endpoint stamps id_token.auth_time from it (omit-on-zero), and
// clients with `RequireAuthTime` registered enforce it on the gate.
err := devicecodekit.ApproveUserCode(ctx, deps, submittedUserCode, approvedSubject, time.Now())
```

The next `/token` poll from the device succeeds.

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

The device shows the `user_code` and `verification_uri`. If it can render a QR code, encode `verification_uri_complete` so the user does not have to type the code at all.

The client must list `urn:ietf:params:oauth:grant-type:device_code` in its `GrantTypes`, or this endpoint answers `400 unauthorized_client`. A `scope` outside the client's registered scopes gets `400 invalid_scope`; omitting `scope` uses the client's full registered set.

## RFC 8707 `resource=`

Devices may pin the issued access token to a specific resource server by sending `resource=<absolute URI>` on `/device_authorization`. The endpoint applies the same rules as `/auth` and `/token`:

- The value MUST be an absolute URI (RFC 8707 §2). Relative URIs are rejected with `400 invalid_target`.
- The canonical form (lowercase scheme and host, trailing slash stripped) MUST appear in the client's registered `Resources` allowlist. A resource the client was never registered for is rejected with `400 invalid_target`; `Resources` is the only source of `aud` values the OP will mint.
- Multiple non-empty `resource=` values are rejected with `400 invalid_target`, because a device authorization carries a single audience and the OP will not silently drop the others.

Add every resource server URI a device may request to the client's `Resources` (in the client seed or dynamic-registration metadata) before the device sends it.

## Sender-constrained device records

When DPoP or mTLS is used, `/device_authorization` records the DPoP key thumbprint and/or the mTLS certificate thumbprint. At `/token`, the OP checks every binding on the record again before issuing a token. A record with both bindings needs both a matching DPoP proof and a matching mTLS certificate; one is not enough. A missing or mismatched proof fails redemption. On success, the token's `cnf` carries every binding the OP rechecked. Under a profile that mandates sender constraint (FAPI 2.0), `/device_authorization` itself rejects a request that carries neither.

## Polling responses

| Wire response | Meaning |
|---|---|
| `400 authorization_pending` | User has not approved yet. Poll again after `interval` seconds. |
| `400 slow_down` | Polled too fast. Add 5 seconds to the polling interval for this and later polls, per RFC 8628 §3.5. The OP stores the new interval, so every replica enforces it. If storing the poll observation fails, the OP emits `device_code.poll_observation.failed` and still answers the poll. |
| `400 access_denied` | The user denied, the `user_code` limit locked the record, `devicecodekit.Revoke` was called, or the device kept polling faster than the interval until the poll-abuse limit denied the record. Stop polling. |
| `400 expired_token` | `device_code` outlived `expires_in`, is unknown, or was already redeemed. Stop polling. |
| `400 invalid_grant` | The `device_code` belongs to another client, or a DPoP / mTLS binding on the record is missing or does not match. |
| `200 { access_token, ... }` | Approved. Treat it as a normal token response. |

A successful poll returns an `access_token`, plus an `id_token` when the granted scope includes `openid`, plus a `refresh_token` when the client is registered for the `refresh_token` grant, `refresh_token` is in `WithGrants`, and the scope includes `openid` (and `offline_access` too under `op.WithStrictOfflineAccess`). The redemption records a consent grant for that client and subject, so the tokens resolve their subject at introspection and `/userinfo` (the pairwise value when the client is pairwise), and a later `/auth` request for the same scopes can skip the consent screen.

## Revoking a device when the user removes it

When the user removes a device ("remove this TV" in account settings), the tokens already issued to it should stop working at the same moment. `devicecodekit.Revoke` denies the authorization record and then revokes every credential issued under it.

::: details Cascade revocation — what's that?
Revoking a parent record (here, the device authorization) should also revoke every credential issued from it. Without that, the TV keeps a working access token and refresh token after "remove this TV". The OP issues every credential from a device authorization under one grant identifier derived from the device code, and `Revoke` walks that identifier through each store you give it.
:::

```go
deps := &devicecodekit.Deps{
    DeviceCodes:        st.DeviceCodes(),
    AccessTokens:       st.AccessTokens(),       // JWT access-token registry / fallback
    GrantRevocations:   st.GrantRevocations(),   // grant tombstones (the default JWT strategy)
    OpaqueAccessTokens: st.OpaqueAccessTokens(), // opaque access tokens
    RefreshTokens:      st.RefreshTokens(),      // refresh-token chains
    Grants:             st.Grants(),             // deletes the consent record last
    AuditLogger:        auditLogger,
}

if err := devicecodekit.Revoke(ctx, deps, deviceCodeID, devicecodekit.DenyReasonUserRevokedDevice); err != nil {
    // The record is already denied; the cascade may be partial. Revoke is safe to repeat.
}
```

Wire each store that your deployment actually issues credentials into; a nil field skips that part of the cascade. `Deps.RevocationStrategy` must match `op.WithAccessTokenRevocationStrategy`; the default, grant tombstone, writes a tombstone through `GrantRevocations` (or falls back to `AccessTokens` when `GrantRevocations` is nil), and `Deps.AccessTokenTTL` should equal the provider's access-token TTL so the tombstone outlives the tokens it covers. With the JTI-registry strategy `AccessTokens` is required, and with the `None` strategy no JWT backend is needed. `Revoke` returns `ErrMissingRevocationBackend` when the selected strategy has nothing to write to.

`Revoke` attempts every store even when an earlier one fails, deletes the grant record only after all of them succeed, and returns a joined error otherwise. The `device_code.revoked` audit event carries `cascade_complete` and a count or flag per store it attempted.

## See it run

[`examples/31-device-code-cli`](https://github.com/libraz/go-oidc-provider/tree/main/examples/31-device-code-cli) drives the full RFC 8628 round trip:

```sh
(cd examples/31-device-code-cli && GOWORK=off go run -tags example .)
```

The example boots the OP, prints a boxed `user_code` panel + `verification_uri_complete` shortcut, simulates browser approval after a few seconds, and polls until the OP issues an access_token + id_token. Files are split by role (`op.go` / `cli.go` / `device.go` / `probe.go`).

## Read next

- [Device Code primer](/concepts/device-code) — the flow explained from the device's point of view.
- [CIBA wiring](/use-cases/ciba) — when the user is on a different surface but no code-on-screen ceremony fits.
