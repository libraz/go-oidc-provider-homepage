---
title: Audit event catalog
description: Every op.Audit* event the OP emits, what fires it, and what the extras carry.
outline: 2
---

# Audit event catalog

The OP emits structured audit events from a closed catalog defined in `op/audit.go`. Each event is a stable string identifier of shape `<area>.<verb>` (or `<area>.<verb>.<qualifier>`) so SOC dashboards can pre-aggregate by area without parsing free-form messages.

## Subscribing

```go
op.New(
    /* required options */
    op.WithAuditLogger(slog.New(myJSONHandler)),
)
```

`op.WithAuditLogger` takes a `*slog.Logger`. Each event records as a structured log entry where the `msg` is the event identifier (e.g. `"token.issued"`) and the attributes carry the request-id, subject, client-id, and an `extras` group with category-specific fields.

If `WithAuditLogger` is not supplied, audit events fall through to the logger configured by `WithLogger` (or `slog.Default()`).

::: tip Prometheus mirror
A curated subset of these events is mirrored onto Prometheus counters when [`WithPrometheus`](/use-cases/prometheus) is configured. A single emission updates both the slog stream and the matching counter — there is no separate metrics emit step.
:::

## Common attributes

Every event carries:

| Attribute | Type | Notes |
|---|---|---|
| `request_id` | string | per-request identifier (propagated via `X-Request-ID` if set) |
| `subject` | string | OIDC `sub` of the affected user; empty for pre-authn events |
| `client_id` | string | OAuth `client_id`; empty for account-management events |
| `extras` | group | category-specific fields (see each section) |

## Event catalog

### Account management

Most fire from out-of-band admin paths the OP does not host directly. The catalog exists so a single subscription point covers SOC dashboards.

| Event | Fires when |
|---|---|
| `account.created` | user account provisioned |
| `account.deleted` | user account removed |
| `account.email.added` | email address added to account |
| `account.email.verified` | email ownership proven (link / OTP) |
| `account.email.removed` | email address removed |
| `account.email.set_primary` | primary email changed |
| `account.passkey.registered` | WebAuthn credential added |
| `account.passkey.removed` | WebAuthn credential removed |
| `account.totp.enabled` | TOTP enrollment completed |
| `account.totp.disabled` | TOTP removed |
| `account.password.changed` | password reset / changed |
| `account.recovery_codes.regenerated` | recovery batch reissued |
| `recovery.support_escalation` | manual recovery / support override invoked |
| `federation.linked` | external IdP credential linked |
| `federation.unlinked` | external IdP credential unlinked |

### Login / MFA / step-up

Fire from the authenticator chain after each factor resolves.

| Event | Fires when |
|---|---|
| `login.success` | primary credential verified, subject bound |
| `login.failed` | primary credential rejected |
| `mfa.required` | session AAL below requirement; second factor demanded |
| `mfa.success` | second factor accepted |
| `mfa.failed` | second factor rejected |
| `step_up.required` | RP requested higher `acr_values`; user re-prompted |
| `step_up.success` | step-up factor accepted |

::: details extras
- `factor` — `password`, `passkey`, `totp`, `email_otp`, `captcha`, `recovery_code`, or a user-defined Step kind
- `aal` — assurance level the factor raised the session to
- `amr_values` — RFC 8176 §2 codes contributed to the `amr` claim
:::

### Consent

| Event | Fires when |
|---|---|
| `consent.granted` | user clicked consent in the prompt |
| `consent.granted.first_party` | first-party auto-consent applied (no prompt) |
| `consent.granted.delta` | delta-consent triggered re-prompt for newly requested sensitive scope |
| `consent.skipped.existing` | existing grant already covered the request; no prompt |
| `consent.revoked` | user revoked a prior grant |

::: details extras
- `scopes_granted`, `scopes_requested` — string slices
- `audience` — when scope is per-audience
:::

### Codes & tokens

Fire from the authorize-code path and the token endpoint.

| Event | Fires when |
|---|---|
| `code.issued` | authorization code minted |
| `code.consumed` | code redeemed at `/token` |
| `code.replay_detected` | code presented twice — chain revoked |
| `token.issued` | access token + (optional) refresh + (optional) id_token issued |
| `token.refreshed` | refresh token rotated; new access token minted |
| `token.revoked` | token revoked via `/revoke` or grant cascade |
| `refresh.replay_detected` | refresh token presented past rotation grace — chain revoked |

::: details extras
- `grant_type` — `authorization_code`, `refresh_token`, `client_credentials`
- `format` — `jwt` or `opaque` for the access token
- `offline_access` — bool; true on `offline_access` chain
- `cnf` — `dpop_jkt` or `mtls_x5t#S256` when sender-bound
:::

### Sessions & logout

| Event | Fires when |
|---|---|
| `session.created` | new browser session minted (post-login) |
| `session.destroyed` | session deleted (logout, expiry, eviction) |
| `logout.rp_initiated` | RP-Initiated Logout invoked |
| `logout.back_channel.delivered` | Back-Channel logout token delivered to RP |
| `logout.back_channel.failed` | Back-Channel delivery failed (HTTP error / timeout / verification) |
| `bcl.no_sessions_for_subject` | `/end_session` named a subject but no sessions resolved |

::: details `bcl.no_sessions_for_subject` rationale
Under a volatile `SessionStore` (Redis without persistence, in-memory under maxmemory eviction) this event is the signal that a session was evicted between establishment and logout — narrowing OIDC Back-Channel Logout 1.0 §2.7's best-effort delivery floor to zero. INFO-level by design: under volatile placement the gap is expected; SOC tooling should alert on elevated rates rather than per-event. The event includes the configured `WithSessionDurabilityPosture` so dashboards can split "expected gap under volatile" from "unexpected gap under durable".
:::

### Defensive

Fire from request-validation paths that detect abuse signals or operator-visible policy hits.

| Event | Fires when |
|---|---|
| `rate_limit.exceeded` | request rejected by rate limiter |
| `rate_limit.bypassed` | rate-limit bypass token consumed (operator override) |
| `pkce.violation` | PKCE verifier mismatch / `plain` rejected / missing on FAPI |
| `redirect_uri.mismatch` | redirect URI did not match the registered list |
| `alg.legacy_used` | a legacy alg path was reached (telemetry; rejected by the verifier) |

### Dynamic Client Registration

Fire from `/register` and `/register/{client_id}`.

| Event | Fires when |
|---|---|
| `dcr.iat.consumed` | Initial Access Token redeemed |
| `dcr.iat.expired` | IAT presented past TTL |
| `dcr.iat.invalid` | IAT signature / format invalid |
| `dcr.open_registration_used` | open (no-IAT) registration accepted |
| `dcr.client.registered` | new client created |
| `dcr.client.metadata_read` | RAT-bearing GET against `/register/{client_id}` |
| `dcr.client.metadata_updated` | RAT-bearing PUT against `/register/{client_id}` |
| `dcr.client.deleted` | RAT-bearing DELETE against `/register/{client_id}` |
| `dcr.rat.invalid` | Registration Access Token rejected |
| `dcr.metadata.validation_failed` | metadata payload failed policy |

## Stability

Audit event names are part of the public API surface:

- New events MAY be added in any minor release.
- Existing event names are renamed only in a major release with a deprecation notice.

Pin your dashboards on the names; do not rely on the order or the extras shape for any field not documented here.

## Verifying this list

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
grep -hE 'AuditEvent\("[a-z_.]+"\)' op/audit.go \
  | grep -oE '"[a-z_.]+"' | sort -u
```

The output is the closed catalog this page mirrors.
