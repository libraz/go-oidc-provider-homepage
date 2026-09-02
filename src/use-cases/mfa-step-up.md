---
title: MFA / step-up
description: Compose authenticators and rules — TOTP always, captcha after N failures, and ACR step-up on demand with login/MFA audit signals.
pageClass: pg-use-cases-mfa-step-up
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

> **Sources:** [`examples/20-mfa-totp`](https://github.com/libraz/go-oidc-provider/tree/main/examples/20-mfa-totp) — password + always-TOTP; [`examples/21-risk-based-mfa`](https://github.com/libraz/go-oidc-provider/tree/main/examples/21-risk-based-mfa) — risk-driven step-up; [`examples/22-login-captcha`](https://github.com/libraz/go-oidc-provider/tree/main/examples/22-login-captcha) — captcha after N failed attempts; [`examples/23-step-up`](https://github.com/libraz/go-oidc-provider/tree/main/examples/23-step-up) — RFC 9470 ACR step-up; [`examples/27-durable-mfa-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/27-durable-mfa-store) — the shipped SQL factor stores, shared with the core OP tables in one database.

## Composition

<figure class="fig">
  <div class="fig-head">One primary step, then whichever rules fire</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-mfa-title" viewBox="0 0 960 372" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-mfa-title">A login flow runs one primary step, then evaluates its rules. Each rule that fires contributes a further factor step; when none fires, the tokens are issued. The rules are independent of one another and of the order they are declared in.</title>
    <rect class="fg-box" x="360" y="24" width="240" height="46" rx="8"/>
    <text class="fg-t2" x="480" y="52" text-anchor="middle">Login starts</text>
    <path class="fg-edge fg-edge--thin" d="M480,74 V88" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="360" y="92" width="240" height="52" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="116" text-anchor="middle">PrimaryPassword</text>
    <text class="fg-xs" x="480" y="134" text-anchor="middle">the primary step — always runs</text>
    <path class="fg-edge fg-edge--thin" d="M480,148 V162" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--accent" x="360" y="166" width="240" height="46" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="194" text-anchor="middle">evaluate the Rules</text>
    <path class="fg-leader" d="M480,216 V230 M144,230 H816"/>
    <path class="fg-edge fg-edge--thin" d="M144,230 V244" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M368,230 V244" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M592,230 V244" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M816,230 V244" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="36" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="54" y="270">RuleAlways</text>
    <text class="fg-xs" x="54" y="288">on every attempt</text>
    <line class="fg-rule" x1="54" y1="300" x2="234" y2="300"/>
    <text class="fg-mxs fg-accent" x="54" y="322">→ StepTOTP</text>
    <rect class="fg-box" x="260" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="278" y="270">RuleAfterFailedAttempts</text>
    <text class="fg-xs" x="278" y="288">count ≥ 3</text>
    <line class="fg-rule" x1="278" y1="300" x2="458" y2="300"/>
    <text class="fg-mxs fg-accent" x="278" y="322">→ StepCaptcha</text>
    <rect class="fg-box" x="484" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="502" y="270">RuleRisk</text>
    <text class="fg-xs" x="502" y="288">score ≥ High</text>
    <line class="fg-rule" x1="502" y1="300" x2="682" y2="300"/>
    <text class="fg-mxs fg-accent" x="502" y="322">→ StepTOTP</text>
    <rect class="fg-box" x="708" y="248" width="216" height="92" rx="8"/>
    <text class="fg-mxs" x="726" y="270">RuleACR</text>
    <text class="fg-xs" x="726" y="288">aal3 in acr_values</text>
    <line class="fg-rule" x1="726" y1="300" x2="906" y2="300"/>
    <text class="fg-mxs fg-accent" x="726" y="322">→ StepTOTP</text>
    <path class="fg-edge fg-edge--ok" d="M632,189 H720" marker-end="url(#fg-ao)"/>
    <text class="fg-xs fg-ok" x="676" y="182" text-anchor="middle">none fires</text>
    <rect class="fg-box fg-box--ok" x="724" y="166" width="200" height="46" rx="8"/>
    <text class="fg-t2" x="824" y="194" text-anchor="middle">Issue the tokens</text>
  </svg>
  <figcaption class="fig-note">Nothing here is a chain of if-statements. Each rule answers independently, the steps it asks for are collected, and the loop runs again — so adding a fifth rule cannot change what the other four decide.</figcaption>
</figure>

`LoginFlow` is a struct with a `Primary` step and a list of `Rules`. Each rule is a `Rule` value built from a constructor like `op.RuleAlways(step)`, `op.RuleAfterFailedAttempts(n, step)`, `op.RuleRisk(threshold, step)`, or `op.RuleACR(acr, step)`.

A rule whose `When` is nil is an always-on rule: the library treats it as a constant-true predicate. This includes a bare struct literal such as `op.Rule{Then: step}`; use an explicit predicate when a factor must be conditional.

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

The observer receives one `op.LoginAttempt` per authentication attempt. Its `Outcome` is one of `op.AttemptSuccess`, `op.AttemptFailure`, or `op.AttemptLocked`. `AttemptLocked` means the brute-force gate ended the attempt, rather than the submitted credential being evaluated as an ordinary failure, so consumers should handle it as a separate outcome.

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

If the user already authenticated at `aal2` earlier in the session, the RP requesting `acr_values=aal3` triggers the configured rule's interactive factor before redirecting back. The factor is the one you put in `RuleACR`; the OP does not substitute a fixed `passkeyAuth` implementation.

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

The `AttemptsRemaining` value on the recovery-code prompt is the remaining failed-submission budget. It is not a count of unconsumed recovery codes, and a driver must not use it to infer how many recovery codes remain.

## Audit trail

The authentication flow emits actual factor outcomes from the `op.Audit*` catalog: the primary factor uses `op.AuditLoginSuccess` / `op.AuditLoginFailed`, and an additional factor uses `op.AuditMFASuccess` / `op.AuditMFAFailed`. `op.AuditLockoutStalled` reports repeated cross-factor lockout CAS contention that abandoned a failed attempt without counting it. `op.AuditMFARequired`, `op.AuditStepUpRequired`, and `op.AuditStepUpSuccess` are reserved catalog constants; the OP does not emit them.

- `factor` (`pwd`, `otp`, `webauthn`, …)

The events carry the resolved `factor` in `extras` and thread through `op.WithAuditLogger` (a `*slog.Logger`). Emission is synchronous on request goroutines, so the handler must not block and must be concurrency-safe.

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

For account-management flows, use the companion packages rather than constructing credential records yourself. [`op/passkeykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/passkeykit) runs the WebAuthn registration ceremony from the same `PrimaryPasskey` configuration used at login. [`op/recoverykit`](https://pkg.go.dev/github.com/libraz/go-oidc-provider/op/recoverykit) creates and replaces recovery-code batches; show `Result.Codes` once and never persist or log them. `op.NewEmailOTPAuthenticator(op.EmailOTPConfig{...})` builds the lower-level email-OTP authenticator when you use `WithAuthenticators` instead of `LoginFlow`. See [`28-email-otp-recovery`](https://github.com/libraz/go-oidc-provider/tree/main/examples/28-email-otp-recovery) and [`29-passkey`](https://github.com/libraz/go-oidc-provider/tree/main/examples/29-passkey).

::: warning Passkeys need a domain, not an IP
A WebAuthn Relying Party ID must be a domain name, and browsers reject an IP literal for it — so an OP developing against `http://127.0.0.1` has no valid RP ID to pair with. Bind the issuer to `localhost` and opt in with [`op.WithAllowLocalhostLoopback()`](/reference/options), which admits the textual host in the issuer as well as in redirect URIs. The carve-out is for a developer machine and nowhere else; production RPs belong behind https.

Setting `AAGUIDAllowlist` on `op.PrimaryPasskey` also switches the registration ceremony to `direct` attestation conveyance, because an allowlist compared against an unattested AAGUID proves nothing — a software authenticator could register by naming an approved model. Expect a user-agent attestation prompt, and a registration that cannot identify the model is refused rather than matched. Leave the allowlist empty to keep the prompt-free ceremony.

`RequireUserVerification: true` applies to both passkey registration and login. The authenticator must perform a user-verification gesture such as a PIN or biometric; a presence-only registration or assertion is refused. Keep this setting in the shared `op.PrimaryPasskey` configuration used by `op/passkeykit`, so a credential accepted during enrolment remains usable at login.
:::

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
