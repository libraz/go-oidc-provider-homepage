---
title: Declaring a security profile
description: Declare OIDC Core, OAuth 2.1 Baseline, or FAPI deliberately — profiles add features but never silently add grants.
pageClass: pg-use-cases-security-profile
---

# Use case — Declaring a security profile

`op.WithProfile` makes the OP's intended security posture explicit. Leaving it unset is also a choice: this library's OpenID Connect Core 1.0-compatible shape accepts a confidential authorization-code client without PKCE. Use `profile.Baseline` when the deployment follows OAuth 2.1 / RFC 9700 and every authorization-code request must carry PKCE.

```go
provider, err := op.New(
  // issuer, store, keyset, cookie keys, clients, and login flow …
  op.WithProfile(profile.Baseline),
)
```

`profile.Baseline` changes that one rule only. It does not require PAR, cap token lifetimes, restrict client-authentication methods, or require sender-constrained tokens. Those controls belong to the applicable FAPI profiles; use [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) when that is the target profile.

At successful construction the OP emits `startup.profile` to its audit logger. The event records the declared profiles, features, and grants, and the resolved policy: `pkce_required`, `par_required`, `sender_constrained`, `client_auth_methods`, the token lifetimes and more. Use it to confirm the deployed posture before the first request.

> **Source:** [`examples/00-security-profile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/00-security-profile) runs an unprofiled OP and a `profile.Baseline` OP side by side, then sends both the same confidential-client request without a `code_challenge`.

## Decide deliberately

| Deployment intent | Configuration |
|---|---|
| Legacy OIDC clients must remain compatible | no profile declared; plan a PKCE migration |
| OAuth 2.1 posture | `op.WithProfile(profile.Baseline)` |
| Financial-grade API profile | `op.WithProfile(profile.FAPI2Baseline)` or the applicable FAPI profile |

In this library, public and native clients still require PKCE even without `profile.Baseline`; the visible difference is the confidential-client compatibility path.

## What each profile requires

| Profile | PKCE | Features switched on | Sender-constrained tokens | Grant required | Other limits |
|---|---|---|---|---|---|
| `profile.Baseline` | Required | none | not required | none | none |
| `profile.FAPI2Baseline` | Required | PAR, JAR | DPoP or mTLS (DPoP if neither is configured) | none | Access token lifetime ≤ 10 minutes; PAR `expires_in` below 600 seconds |
| `profile.FAPI2MessageSigning` | Required | PAR, JAR, JARM | DPoP or mTLS | none | The `FAPI2Baseline` limits |
| `profile.FAPICIBA` | Not applicable (no `/auth` redirect) | JAR | DPoP or mTLS | `grant.CIBA` | The `FAPI2Baseline` limits |

Source: `RequiredFeatures`, `RequiredAnyOf`, `RequiredGrants`, `RequiresPKCE`, `MaxAccessTokenTTL` and `PARLifetimeCeiling` in `op/profile`.

## Features are supplied, grants are not

A profile constrains its two neighbouring declaration axes differently, and the asymmetry is deliberate.

<figure class="fig">
  <div class="fig-head">A profile supplies features, never grants</div>
  <svg class="fig-svg" role="img" aria-labelledby="profile-supply-title" viewBox="0 0 960 288" xmlns="http://www.w3.org/2000/svg">
    <title id="profile-supply-title">Declaring a profile switches on the feature flags it needs. It never adds a grant: a grant the profile requires and the deployment did not declare makes op.New fail instead of quietly enabling it.</title>
    <!-- profile -->
    <rect class="fg-box fg-box--accent" x="340" y="24" width="280" height="48" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="52" text-anchor="middle">op.WithProfile(…)</text>
    <!-- branches -->
    <path class="fg-leader" d="M480,72 V96 M248,96 H712"/>
    <path class="fg-edge fg-edge--thin fg-edge--ok" d="M248,96 V120" marker-end="url(#fg-ao)"/>
    <path class="fg-edge fg-edge--thin fg-edge--danger" d="M712,96 V120" marker-end="url(#fg-ad)"/>
    <!-- features -->
    <rect class="fg-box fg-box--ok" x="32" y="120" width="432" height="144" rx="8"/>
    <text class="fg-t2" x="48" y="148">Features: supplied</text>
    <text class="fg-mxs" x="48" y="172">feature.PAR · feature.JAR · …</text>
    <text class="fg-s" x="48" y="196">policy the profile can decide alone</text>
    <rect class="fg-pill fg-pill--ok" x="48" y="216" width="400" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="248" y="237" text-anchor="middle">not declared → the profile enables it</text>
    <!-- grants -->
    <rect class="fg-box fg-box--danger" x="496" y="120" width="432" height="144" rx="8"/>
    <text class="fg-t2" x="512" y="148">Grants: never supplied</text>
    <text class="fg-mxs" x="512" y="172">grant.AuthorizationCode · grant.CIBA · …</text>
    <text class="fg-s" x="512" y="196">only you can supply what they need</text>
    <rect class="fg-pill fg-pill--danger" x="512" y="216" width="400" height="32" rx="16"/>
    <text class="fg-s fg-danger" x="712" y="237" text-anchor="middle">not declared → op.New fails</text>
  </svg>
  <figcaption class="fig-note">The asymmetry is deliberate. A feature is a rule the profile can enforce on its own; a grant needs an authenticator, a store, sometimes a notification channel — things only you can provide, so silently enabling one would produce an OP that answers requests it cannot complete.</figcaption>
</figure>

Either way, the resolved policy is recorded in the `startup.profile` audit event, so the configuration the OP actually booted with is readable from the audit trail rather than inferred from the option list.

**Missing features are switched on for you.** A feature flag such as PAR or JAR is policy the profile is entitled to decide, so declaring `profile.FAPI2Baseline` enables what it needs without a second option.

**A missing grant fails `op.New` instead.** Activating a grant drags in collaborators only the embedder can supply, so the library will not mount an endpoint the deployment never asked to serve. `profile.FAPICIBA` is the case that bites: the profile's entire subject matter is the `/bc-authorize` ceremony, but that endpoint is mounted from the grant set. Without the check, a deployment could declare the profile, have JAR and DPoP switched on for it, and still answer 404 to every backchannel-authentication request.

```go
provider, err := op.New(
  // …
  op.WithProfile(profile.FAPICIBA),
  op.WithCIBA(op.WithCIBAHintResolver(resolver)),
)
```

`op.WithCIBA` is the option that activates the grant: it adds `grant.CIBA` to the grant set and takes CIBA options such as `op.WithCIBAHintResolver`. The store must also provide a CIBA request substore. Declaring `profile.FAPICIBA` without it fails `op.New`, and the error names both the grant the profile requires and the option that activates it, so the fix can be read off the message. Listing `grant.CIBA` in `op.WithGrants` alone does not help, because it leaves the hint resolver unwired and moves the failure to the next check. Every profile other than `profile.FAPICIBA` requires no grant of its own.
