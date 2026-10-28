---
title: Comprehensive bundle
description: A reference wiring that combines the options a typical embedder reaches for — password plus TOTP login flow, captcha rule, public and confidential clients, first-party consent skip, SPA login UI, token lifetimes, and a JSON logger.
---

# Use case — Comprehensive bundle

[`01-minimal`](/use-cases/minimal-op) is the smallest OP that works. `02-bundle` is the same OP with the pieces a production deployment adds on top: a second login factor, a captcha rule, two kinds of client, a login UI served by the OP, shorter token lifetimes and structured logs.

> **Source:** [`examples/02-bundle/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle)

## What it composes

| Concern | Option / type | What the example does |
|---|---|---|
| Primary login | `op.LoginFlow{Primary: op.PrimaryPassword{...}}` | Password against the in-memory user store. |
| Second factor | `op.RuleAlways(op.StepTOTP{...})` | Every login also needs a TOTP code. |
| Captcha | `op.RuleAfterFailedAttempts(5, op.StepCaptcha{...})` | Fires from the fifth failed attempt in a session; the verifier is a stub that always passes. |
| Clients | `op.WithStaticClients(op.PublicClient{...}, op.ConfidentialClient{...})` | A browser app and a `client_secret_basic` backend client. |
| Consent | `op.WithFirstPartyClients(...)` | The browser app skips the consent screen ([First-party consent skip](/use-cases/first-party)). |
| Login UI | `op.WithSPAUI(op.SPAUI{LoginMount, StaticDir})` | The OP serves the shared SPA bundle at `/login` ([SPA / custom interaction](/use-cases/spa-custom-interaction)). |
| Token lifetimes | `op.WithAccessTokenTTL`, `op.WithRefreshTokenTTL` | 2 minutes and 7 days, against defaults of 5 minutes and 30 days. |
| Scope titles | `op.WithScope(op.PublicScope(...))` | Overrides for `profile` and `email`; see [Public / internal scopes](/use-cases/scopes). |
| Logging | `op.WithLogger(*slog.Logger)` | A JSON `slog` handler on stdout. |

A `ConfidentialClient` that authenticates with `client_secret_basic` or `client_secret_post` must carry a `Secret` (hashed on registration) or a pre-computed `SecretHash`; `op.New` refuses one with neither.

## The login chain

`Primary` runs first. Each `Rule` then decides, from the state of the attempt, whether to add a step; a step already completed in the attempt is not run twice.

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  Rules: []op.Rule{
    op.RuleAlways(op.StepTOTP{
      Store:         st.TOTPs(),
      EncryptionKey: keys.TOTPKey, // 32 bytes; AES-256-GCM at rest
    }),
    op.RuleAfterFailedAttempts(5, op.StepCaptcha{
      Verifier: alwaysOKCaptcha{}, // production: Turnstile, hCaptcha, reCAPTCHA
    }),
  },
}
```

The rules are checked again when `/auth` could answer from an existing session, and a session's earlier factors do not count toward them. Because `RuleAlways` matches on every pass, this OP asks for TOTP again on each such request: the chain runs from the session's subject, and `prompt=none` answers `interaction_required`. Captcha rules are skipped in that check, and risk-driven rules fire only inside a full login chain. To ask for the second factor only for sensitive clients or scopes, swap `RuleAlways` for `RuleClient`, `RuleScope` or `RuleACR`; [MFA / step-up](/use-cases/mfa-step-up) covers the full rule vocabulary, including `RuleRisk` and `LoginFlow.Risk`.

## Run it

```sh
cd examples/02-bundle && GOWORK=off go run -tags example .
```

Run it from that directory, since the SPA bundle path is relative. The startup log prints an `otpauth://` URI, a base32 secret and a terminal QR code for the seeded `demo` user; add it to an authenticator app, then open `http://127.0.0.1:9090/`, sign in as `demo` / `demo`, and enter the 6-digit code. The RP's `/me` page shows `"amr": ["mfa","otp","pwd"]`.

## Not in this example

| Need | Where to look |
|---|---|
| FAPI 2.0, OAuth 2.1 | [Declaring a security profile](/use-cases/security-profile), [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) |
| Risk-driven MFA | `op.RuleRisk` and `LoginFlow.Risk`, in [MFA / step-up](/use-cases/mfa-step-up) |
| Running behind a reverse proxy | `op.WithTrustedProxies(cidrs ...)`, in [Options](/reference/options) |
| Scopes hidden from discovery | `op.InternalScope`, in [Public / internal scopes](/use-cases/scopes) |
| A real database | [Persistent storage (SQL)](/use-cases/sql-store) |

## Read next

- [Minimal OP](/use-cases/minimal-op), the starting point this page extends.
- [MFA / step-up](/use-cases/mfa-step-up), the building blocks behind the rules.
