---
title: MFA / step-up
description: Compose authenticators and rules — TOTP always, captcha after N failures, ACR step-up on demand.
---

# Use case — MFA / step-up

The library's authentication layer is built from three primitives that compose:

- **`Step`** — knows how to verify one factor (password, TOTP, passkey, email-OTP, …).
- **`Rule`** — decides whether a factor is **required** for this attempt.
- **`LoginFlow`** — a `Primary` step plus an ordered list of `Rules`.

Each authenticator runs only when its rule says yes. So "password always, TOTP always" is one flow; "password always, captcha after 3 failures, TOTP if risk score is high" is another.

Use this page when the login decision depends on more than "password accepted": mandatory MFA, suspicious-attempt captcha, risk-based extra factors, or RP-requested ACR step-up. If you only need a username/password login, the default password primary step and the user-store pages are enough; adding rules before you need them mainly increases test and recovery surface.

::: details Specs referenced on this page
- [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238) — TOTP (Time-Based One-Time Password)
- [RFC 8176](https://datatracker.ietf.org/doc/html/rfc8176) — Authentication Method Reference Values (`amr`)
- [RFC 9470](https://datatracker.ietf.org/doc/html/rfc9470) — OAuth 2.0 Step-up Authentication Challenge
- [WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) — Passkeys
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) — Authenticator Assurance Levels (AAL)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2 (`acr`, `amr`, `auth_time`)
:::

::: details Vocabulary refresher
- **MFA** — Multi-Factor Authentication. The user proves more than one factor (something they know / have / are) before the OP issues tokens.
- **Step-up** — when an RP needs higher assurance for a sensitive operation, it asks for `acr_values=aalN`. If the current session is below that, the OP runs an additional factor before issuing a freshly-elevated `id_token`. Defined by RFC 9470.
- **AAL (Authenticator Assurance Level)** — NIST's three-tier ladder: AAL1 ≈ password, AAL2 ≈ password + something, AAL3 ≈ hardware-backed proof-of-possession. Many OPs and RPs use these labels in `acr`.
- **`amr` claim** — RFC 8176 enumerates standard reference values (`pwd`, `otp`, `mfa`, `hwk`, `face`, `fpt`, …) so RPs can audit which factors actually ran.
:::

> **Sources:** [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) — password + always-TOTP; [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa) — risk-driven step-up; [`examples/22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha) — captcha after N failed attempts; [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — RFC 9470 ACR step-up; [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) — SQL-backed `store.TOTPStore` for production-style factor persistence.

## Composition

<style scoped>
text{stroke:none}
.d-lbl{font-family:var(--vp-font-family-base);fill:var(--vp-c-text-1)}
.d-cap{font-family:var(--vp-font-family-base);fill:var(--vp-c-text-2)}
.d-mono{font-family:var(--vp-font-family-mono)}
.d-accent{stroke:var(--vp-c-brand-2)}
.d-accent-t{fill:var(--vp-c-brand-2)}
</style>

<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="mfa-loginflow-title" viewBox="0 0 800 486" width="760" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="mfa-loginflow-title">Login flow composition: a primary password step, a rules layer that decides which factor steps run, then token issuance.</title>
  <rect x="330" y="16" width="140" height="38" rx="6"/>
  <rect x="290" y="78" width="220" height="50" rx="6"/>
  <rect x="17" y="352" width="176" height="42" rx="6"/>
  <rect x="214" y="352" width="176" height="42" rx="6"/>
  <rect x="410" y="352" width="176" height="42" rx="6"/>
  <rect x="607" y="352" width="176" height="42" rx="6"/>
  <rect class="d-accent" x="330" y="150" width="140" height="44" rx="6"/>
  <rect class="d-accent" x="17" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="214" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="410" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="607" y="240" width="176" height="58" rx="8"/>
  <rect class="d-accent" x="330" y="430" width="140" height="40" rx="6"/>
  <path d="M400 54 L400 78"/>
  <path d="M400 128 L400 150"/>
  <path d="M400 194 L400 214 M105 214 L695 214 M105 214 L105 240 M302 214 L302 240 M498 214 L498 240 M695 214 L695 240"/>
  <path d="M105 298 L105 352 M302 298 L302 352 M498 298 L498 352 M695 298 L695 352"/>
  <path d="M105 394 L105 412 M302 394 L302 412 M498 394 L498 412 M695 394 L695 412 M105 412 L695 412 M400 412 L400 430"/>
  <path d="M396 71 L400 78 L404 71"/>
  <path d="M396 143 L400 150 L404 143"/>
  <path d="M101 233 L105 240 L109 233"/>
  <path d="M298 233 L302 240 L306 233"/>
  <path d="M494 233 L498 240 L502 233"/>
  <path d="M691 233 L695 240 L699 233"/>
  <path d="M101 345 L105 352 L109 345"/>
  <path d="M298 345 L302 352 L306 345"/>
  <path d="M494 345 L498 352 L502 345"/>
  <path d="M691 345 L695 352 L699 345"/>
  <path d="M396 423 L400 430 L404 423"/>
  <text class="d-lbl" x="400" y="40" font-size="13" text-anchor="middle">Login start</text>
  <text class="d-lbl d-mono" x="400" y="100" font-size="13" text-anchor="middle">PrimaryPassword</text>
  <text class="d-cap" x="400" y="117" font-size="11" text-anchor="middle">primary step</text>
  <text x="400" y="177" font-size="13" text-anchor="middle"><tspan class="d-accent-t d-mono">Rules</tspan><tspan class="d-accent-t"> eval</tspan></text>
  <text class="d-accent-t d-mono" x="105" y="266" font-size="12.5" text-anchor="middle">RuleAlways</text>
  <text class="d-cap" x="105" y="285" font-size="11" text-anchor="middle">every attempt</text>
  <text class="d-accent-t d-mono" x="302" y="266" font-size="12" text-anchor="middle">RuleAfterFailedAttempts</text>
  <text class="d-cap" x="302" y="285" font-size="11" text-anchor="middle">count ≥ 3</text>
  <text class="d-accent-t d-mono" x="498" y="266" font-size="12.5" text-anchor="middle">RuleRisk</text>
  <text class="d-cap" x="498" y="285" font-size="11" text-anchor="middle">score ≥ High</text>
  <text class="d-accent-t d-mono" x="695" y="266" font-size="12.5" text-anchor="middle">RuleACR</text>
  <text x="695" y="285" font-size="11" text-anchor="middle"><tspan class="d-cap d-mono">aal3</tspan><tspan class="d-cap"> in acr_values</tspan></text>
  <text class="d-lbl d-mono" x="105" y="378" font-size="13" text-anchor="middle">StepTOTP</text>
  <text class="d-lbl d-mono" x="302" y="378" font-size="13" text-anchor="middle">StepCaptcha</text>
  <text class="d-lbl d-mono" x="498" y="378" font-size="13" text-anchor="middle">StepTOTP</text>
  <text class="d-lbl d-mono" x="695" y="378" font-size="13" text-anchor="middle">StepTOTP</text>
  <text class="d-accent-t" x="400" y="455" font-size="13" text-anchor="middle">Issue tokens</text>
</svg>

`LoginFlow` is a struct with a `Primary` step and a list of `Rules`. Each rule is a `Rule` value built from a constructor like `op.RuleAlways(step)`, `op.RuleAfterFailedAttempts(n, step)`, `op.RuleRisk(threshold, step)`, or `op.RuleACR(acr, step)`.

## Always TOTP

```go
import (
  "github.com/libraz/go-oidc-provider/op"
)

flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleAlways(op.StepTOTP{
      Store:         st.TOTPs(),
      EncryptionKey: keys.TOTPKey,
    }),
  },
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
)
```

## Captcha after N failed attempts

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleAfterFailedAttempts(3, op.StepCaptcha{Verifier: myCaptchaVerifier}),
  },
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
  op.WithCaptchaVerifier(myCaptchaVerifier), // hCaptcha / Turnstile / etc.
)
```

The `LoginAttemptObserver` (passed via `op.WithLoginAttemptObserver`) counts failures per identifier. `RuleAfterFailedAttempts` reads that count.

## Risk-based step-up

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleRisk(op.RiskScoreHigh, op.StepTOTP{Store: st.TOTPs(), EncryptionKey: keys.TOTPKey}),
  },
  Risk: myRiskAssessor, // RiskAssessor field on LoginFlow
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
)
```

The `RiskAssessor` returns a `RiskScore` per attempt. The library exposes the four-level ordered enum (`RiskScoreNone` < `RiskScoreLow` < `RiskScoreMedium` < `RiskScoreHigh`); your assessor translates whatever your provider returns onto it. `RuleRisk(threshold, step)` fires when the assessor's score meets or exceeds `threshold`.

## RFC 9470 ACR step-up

When the RP requests a higher Authentication Context Class (`acr_values=aal3`), the OP runs the step-up factor regardless of session state:

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleACR("aal3", op.StepTOTP{Store: st.TOTPs(), EncryptionKey: keys.TOTPKey}),
  },
}

op.New(
  /* ... */
  op.WithLoginFlow(flow),
  op.WithACRPolicy(myACRPolicy), // op.ACRPolicy implementation
)
```

If the user already authenticated at `aal2` earlier in the session, the RP requesting `acr_values=aal3` triggers an interactive step-up: the OP runs `passkeyAuth` to lift the session to `aal3` before redirecting back.

## The resource-server side: `op.StepUpChallenge`

RFC 9470 has two halves. The OP half is above — honour `acr_values` / `max_age` and re-authenticate. The other half lives at the **resource server**: when an access token lacks the required strength or freshness for a sensitive call, the resource server answers `401` with a `WWW-Authenticate: Bearer` challenge carrying `error="insufficient_user_authentication"` and the `acr_values` / `max_age` it needs. The client then re-authorizes with those values, and the OP step-up above kicks in.

`op.StepUpChallenge` builds that header value. The OP itself never emits it — token validation and the `401` belong to your resource server, so the library stops at producing a correctly-formatted challenge string:

```go
maxAge := int64(300)
challenge := op.StepUpChallenge("api", []string{"urn:acr:high", "urn:acr:mfa"}, &maxAge)
// challenge == `Bearer realm="api", error="insufficient_user_authentication",
//               acr_values="urn:acr:high urn:acr:mfa", max_age="300"`
w.Header().Set("WWW-Authenticate", challenge)
w.WriteHeader(http.StatusUnauthorized)
```

An empty `realm`, an empty `acrValues` slice, and a `nil` `maxAge` are each omitted; the mandatory `error="insufficient_user_authentication"` is always present. `acrValues` is encoded as a single space-delimited quoted string, mirroring the `acr_values` request parameter.

## One-time factors are single-use

The one-time factors — email-OTP (`op.StepEmailOTP`), TOTP (`op.StepTOTP`), and recovery codes (`op.StepRecoveryCode`) — are single-use under concurrency: a code cannot be accepted twice. The store enforces this with an atomic compare-and-set that returns `ErrAlreadyConsumed` on replay, so two racing requests presenting the same code cannot both succeed. A [custom factor store](/use-cases/byo-store) must make these consume operations a CAS (the in-memory reference shows the shape).

Terminal factor failures — an expired or already-consumed one-time code, lockout, a required reset, too many resends — are wrapped in the `authn.ErrFactorAbort` sentinel, which the authorize endpoint maps to **HTTP 400**, not 500: a spent code is a client-side condition, not a server fault.

## Audit trail

Each authenticator step emits a structured event from the `op.Audit*` catalog — `op.AuditLoginSuccess` / `op.AuditLoginFailed`, `op.AuditMFARequired` / `op.AuditMFASuccess` / `op.AuditMFAFailed`, `op.AuditStepUpRequired` / `op.AuditStepUpSuccess`. Each event records:

- `factor` (`pwd`, `otp`, `webauthn`, …)
- `aal` (the AAL level reached)
- `acr` (the ACR class value)
- `amr` (RFC 8176 method references)

The events thread through `op.WithAuditLogger` (a `*slog.Logger`).

## Where authenticators come from

The library ships ready-to-use steps for the common factors:

| Step | What it verifies | Storage interface |
|---|---|---|
| `op.PrimaryPassword` | Username / email + password | `store.UserPasswords()` |
| `op.PrimaryPasskey` | WebAuthn / passkey as the primary factor | `store.Passkeys()` |
| `op.StepTOTP` | RFC 6238 TOTP, AES-256-GCM at-rest secret encryption | `store.TOTPs()` |
| `op.StepEmailOTP` | Email-delivered one-time code | `store.EmailOTPs()` |
| `op.StepRecoveryCode` | Single-use recovery codes | `store.RecoveryCodes()` |
| `op.StepCaptcha` | hCaptcha / Turnstile / your verifier | n/a |

The **storage** behind each step is yours — the library never owns user records or password hashes. The reference `inmem` adapter is fine for examples and tests; in production you implement the `op/store/*` substores against your existing user table.

For a fully custom factor, implement `op.ExternalStep` (see `op/step.go` godoc) and add it to the rule list with a unique `KindLabel`. This is the pattern across every `examples/2x-*`.

## Enrolling a TOTP factor

`op.StepTOTP` verifies codes against a `store.TOTPRecord` the embedder has already persisted. The complementary registration path lives in the [`op/totpkit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/totpkit) package: it owns secret generation, the `otpauth://` provisioning URI rendered as a QR code, and the proof-of-possession step that marks an enrolment confirmed.

```go
import (
  "github.com/libraz/go-oidc-provider/op/totpkit"
)

// Construct one codec at startup; share the same key bytes with
// op.StepTOTP{EncryptionKey: keys.TOTPKey} so verify and enrolment
// produce / consume the same AES-256-GCM blob shape.
codec, err := totpkit.NewCodec(keys.TOTPKey /*, previousKey, ... */)

// 1. After primary auth succeeds, kick off enrolment.
pending, err := totpkit.NewEnrolment(codec,
  user.Subject,        // OP-internal stable user ID (bound as AAD)
  "Example Identity",  // issuer label shown by the authenticator app
  user.Email,          // account label shown beneath the issuer
)
// pending.OTPAuthURI    — render this as a QR code in HTML
// pending.SecretBase32  — show this for "manual entry" UX
// pending.Record        — sealed TOTPRecord, NOT yet persistable

// 2. Stash `pending` in a short-lived enrolment session (server-side
//    row keyed by a cookie). Render the QR code and the manual-entry
//    secret to the user.

// 3. The user types the code their authenticator app displays.
record, err := totpkit.Confirm(codec, pending, submittedCode, time.Now())
// On totpkit.ErrCodeRejected, render the form again — `pending` is
// unmutated and the user retries. ErrDecrypt fires when the key has
// rotated past the codec's retention window.

// 4. Persist the confirmed record. From this moment op.StepTOTP
//    accepts codes against the same secret.
_ = storage.TOTPs().Put(ctx, record)
```

`totpkit` deliberately stays out of the HTTP surface — the embedder owns the HTML, the QR rendering, and the enrolment session. Both `NewEnrolment` and `Confirm` bind the `subject` as GCM additional-authenticated-data, so a row exfiltrated from one user's enrolment cannot be replayed under a different subject. The verify path uses the same AAD shape, so the binding holds across both ends.

For demo / CLI-only enrolment (terminal QR rendering, pre-confirmed seed records), see `examples/internal/seedkit` — it sits behind a `//go:build example` tag so the QR rendering library never enters the host module's `go.sum`.

> **Source:** [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — in-process OP+RP demo that walks the full enrolment + RFC 9470 ACR step-up flow.
