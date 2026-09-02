---
title: Declaring a security profile
description: Declare OIDC Core, OAuth 2.1 Baseline, or FAPI deliberately — profiles add features but never silently add grants.
pageClass: pg-use-cases-security-profile
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

<svg role="img" aria-labelledby="profile-axes-title" viewBox="0 0 760 260" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="profile-axes-title">A declared profile fills in the feature flags it needs, but never adds a grant: a grant the profile requires and the deployment did not declare fails op.New instead.</title>

  <rect class="sp-option" x="260" y="16" width="240" height="44" rx="8"/>
  <text class="sp-option-name" x="380" y="43" text-anchor="middle">op.WithProfile(…)</text>

  <path d="M380 60 V82"/>
  <path d="M192 82 H568"/>
  <path d="M192 82 V108"/>
  <path d="M188 102 L192 111 L196 102"/>
  <path d="M568 82 V108"/>
  <path d="M564 102 L568 111 L572 102"/>

  <rect x="24" y="114" width="336" height="130" rx="8"/>
  <text class="sp-axis" x="192" y="140" text-anchor="middle">Features</text>
  <text class="sp-axis-example" x="192" y="162" text-anchor="middle">feature.PAR, feature.JAR, feature.JARM, …</text>
  <path class="sp-divider" d="M44 178 H340"/>
  <text class="sp-claim" x="192" y="202" text-anchor="middle">Policy the profile is entitled to decide.</text>
  <text class="sp-outcome" x="192" y="226" text-anchor="middle">not declared → the profile switches it on</text>

  <rect x="400" y="114" width="336" height="130" rx="8"/>
  <text class="sp-axis" x="568" y="140" text-anchor="middle">Grants</text>
  <text class="sp-axis-example" x="568" y="162" text-anchor="middle">grant.AuthorizationCode, grant.CIBA, …</text>
  <path class="sp-divider" d="M420 178 H716"/>
  <text class="sp-claim" x="568" y="202" text-anchor="middle">Only the embedder can supply the collaborators.</text>
  <text class="sp-outcome" x="568" y="226" text-anchor="middle">not declared → op.New fails</text>
</svg>

Either way, the resolved policy is recorded in the `startup.profile` audit event, so the configuration the OP actually booted with is readable from the audit trail rather than inferred from the option list.

**Missing features are switched on for you.** A feature flag such as PAR or JAR is policy the profile is entitled to decide, so declaring `profile.FAPI2Baseline` enables what it needs without a second option.

**A missing grant fails `op.New` instead.** Activating a grant drags in collaborators only the embedder can supply, so the library will not mount an endpoint the deployment never asked to serve. `profile.FAPICIBA` is the case that bites: the profile's entire subject matter is the `/bc-authorize` ceremony, but that endpoint is mounted from the grant set. Without the check, a deployment could declare the profile, have JAR and DPoP switched on for it, and still answer 404 to every backchannel-authentication request.

```go
provider, err := op.New(
  // …
  op.WithGrants(grant.CIBA),
  op.WithProfile(profile.FAPICIBA),
  op.WithCIBA(op.WithCIBAHintResolver(resolver)),
)
```

The error names both the grant the profile requires and the option that activates it, so the fix is readable off the message. `WithCIBA` takes CIBA options such as `op.WithCIBAHintResolver`; it does not replace the explicit `op.WithGrants(grant.CIBA)` declaration. Every profile other than `profile.FAPICIBA` requires no grant of its own.
