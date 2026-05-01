---
title: Comprehensive bundle
description: A reference wiring that pulls together every option a typical embedder reaches for — login flow, MFA, captcha, risk, scopes, profile, trusted proxies, logger.
---

# Use case — Comprehensive bundle

`01-minimal` shows the smallest viable OP. `02-bundle` shows what a
**production-shaped** OP wiring looks like end-to-end: login flow,
MFA, captcha, risk, scope catalogue, trusted proxy normalisation,
the recommended logger.

> **Source:** [`examples/02-bundle/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle)

## What it composes

| Layer | Option / type |
|---|---|
| Login | `op.LoginFlow` with `op.PrimaryPassword` |
| MFA | `op.RuleAlways(op.StepTOTP{...})` |
| Captcha | `op.RuleAfterFailedAttempts(n, op.StepCaptcha{...})` |
| Risk | `op.RuleRisk(threshold, step)` + assessor on `LoginFlow.Risk` |
| Clients | `op.WithStaticClients(...)` (typed seeds) |
| Scopes | `op.WithScope(op.PublicScope(...))` / `op.WithScope(op.InternalScope(...))` per scope |
| Profile | `op.WithProfile(...)` (commented out by default — flip on for FAPI) |
| Proxy | `op.WithTrustedProxies(cidrs ...)` |
| Logging | `op.WithLogger(slog.Logger)` |

## Use it as a checklist

The example is intentionally long — its job is to be the page you copy
from and delete the parts you don't need. If you find yourself writing
a wiring from scratch, scan `02-bundle` first and confirm you didn't
miss anything obvious.

```sh
go run -tags example ./examples/02-bundle
```

## When to consult it

| Question | Look at |
|---|---|
| What's the minimum extra surface beyond `01-minimal`? | The `LoginFlow` block + `WithStaticClients` |
| How do I wire MFA + risk into one flow? | The `Rules` slice |
| How do I shape the discovery `scopes_supported` field? | The chain of `WithScope(PublicScope(...))` calls |
| What does a recommended slog logger look like? | The `WithLogger` call |
| How do I turn this into FAPI 2.0? | Uncomment the `WithProfile` line |

## Read next

- [Minimal OP](/use-cases/minimal-op) — the floor.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — what flipping the profile switch looks like.
- [MFA / step-up](/use-cases/mfa-step-up) — the building blocks behind the rules.
