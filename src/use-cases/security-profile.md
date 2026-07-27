---
title: Declaring a security profile
description: Choose plain OIDC Core compatibility, OAuth 2.1 Baseline, or FAPI explicitly at provider construction.
---

# Use case — Declaring a security profile

`op.WithProfile` makes the OP's intended security posture explicit. Leaving it unset is also a choice: the OpenID Connect Core 1.0-compatible shape accepts a confidential authorization-code client without PKCE. Use `profile.Baseline` when the deployment follows OAuth 2.1 / RFC 9700 and every authorization-code request must carry PKCE.

```go
provider, err := op.New(
  // issuer, store, keyset, cookie keys, clients, and login flow …
  op.WithProfile(profile.Baseline),
)
```

`profile.Baseline` changes that one rule only. It does not require PAR, cap token lifetimes, restrict client-authentication methods, or require sender-constrained tokens. Those are FAPI requirements; use [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) when that is the target profile.

At successful construction the OP emits `startup.profile` to its audit logger. The event records the declared profiles, features, and grants as well as the resolved policy, including `pkce_required`. Use it to confirm the deployed posture before the first request.

> **Source:** [`examples/00-security-profile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/00-security-profile) runs an unprofiled OP and a `profile.Baseline` OP side by side, then sends both the same confidential-client request without a `code_challenge`.

## Decide deliberately

| Deployment intent | Configuration |
|---|---|
| Legacy OIDC clients must remain compatible | no profile declared; plan a PKCE migration |
| OAuth 2.1 posture | `op.WithProfile(profile.Baseline)` |
| Financial-grade API profile | `op.WithProfile(profile.FAPI2Baseline)` or the applicable FAPI profile |

Public and native clients still require PKCE even without `profile.Baseline`; the visible difference is the confidential-client compatibility path.

## Features are supplied, grants are not

A profile constrains its two neighbouring declaration axes differently, and the asymmetry is deliberate.

**Missing features are switched on for you.** A feature flag such as PAR or JAR is policy the profile is entitled to decide, so declaring `profile.FAPI2Baseline` enables what it needs without a second option.

**A missing grant fails `op.New` instead.** Activating a grant drags in collaborators only the embedder can supply, so the library will not mount an endpoint the deployment never asked to serve. `profile.FAPICIBA` is the case that bites: the profile's entire subject matter is the `/bc-authorize` ceremony, but that endpoint is mounted from the grant set. Without the check, a deployment could declare the profile, have JAR and DPoP switched on for it, and still answer 404 to every backchannel-authentication request.

```go
provider, err := op.New(
  // …
  op.WithProfile(profile.FAPICIBA),
  op.WithCIBA(cibaOpts...),  // omit this and op.New fails, naming the option
)
```

The error names both the grant the profile requires and the option that activates it, so the fix is readable off the message. Every profile other than `profile.FAPICIBA` requires no grant of its own.
