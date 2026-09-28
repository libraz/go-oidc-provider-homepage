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

At successful construction the OP emits `startup.profile` to its audit logger. The event records the declared profiles, features, and grants as well as the resolved policy, including `pkce_required`. Use it to confirm the deployed posture before the first request.

> **Source:** [`examples/00-security-profile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/00-security-profile) runs an unprofiled OP and a `profile.Baseline` OP side by side, then sends both the same confidential-client request without a `code_challenge`.

## Decide deliberately

| Deployment intent | Configuration |
|---|---|
| Legacy OIDC clients must remain compatible | no profile declared; plan a PKCE migration |
| OAuth 2.1 posture | `op.WithProfile(profile.Baseline)` |
| Financial-grade API profile | `op.WithProfile(profile.FAPI2Baseline)` or the applicable FAPI profile |

In this library, public and native clients still require PKCE even without `profile.Baseline`; the visible difference is the confidential-client compatibility path.

## Features are supplied, grants are not

A profile constrains its two neighbouring declaration axes differently, and the asymmetry is deliberate.

<figure class="fig">
  <div class="fig-head">A profile supplies features, never grants</div>
  <svg class="fig-svg" role="img" aria-labelledby="profile-supply-title" viewBox="0 0 960 236" xmlns="http://www.w3.org/2000/svg">
    <title id="profile-supply-title">Declaring a profile switches on the feature flags it needs. It never adds a grant: a grant the profile requires and the deployment did not declare makes op.New fail instead of quietly enabling it.</title>
    <rect class="fg-box fg-box--accent" x="340" y="24" width="280" height="44" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="52" text-anchor="middle">op.WithProfile(…)</text>
    <path class="fg-leader" d="M480,72 V88 M253,88 H707"/>
    <path class="fg-edge fg-edge--ok" d="M253,88 V106" marker-end="url(#fg-ao)"/>
    <path class="fg-edge fg-edge--danger" d="M707,88 V106" marker-end="url(#fg-ad)"/>
    <rect class="fg-box fg-box--ok" x="36" y="110" width="434" height="108" rx="8"/>
    <text class="fg-t2" x="56" y="138">Features — supplied</text>
    <text class="fg-mxs" x="56" y="160">feature.PAR · feature.JAR · feature.JARM · …</text>
    <line class="fg-rule" x1="56" y1="172" x2="450" y2="172"/>
    <text class="fg-xs" x="56" y="192">policy the profile is entitled to decide on its own</text>
    <text class="fg-xs fg-ok" x="56" y="208">not declared → the profile switches it on</text>
    <rect class="fg-box fg-box--danger" x="490" y="110" width="434" height="108" rx="8"/>
    <text class="fg-t2" x="510" y="138">Grants — never supplied</text>
    <text class="fg-mxs" x="510" y="160">grant.AuthorizationCode · grant.CIBA · …</text>
    <line class="fg-rule" x1="510" y1="172" x2="904" y2="172"/>
    <text class="fg-xs" x="510" y="192">only the embedder can supply the collaborators they need</text>
    <text class="fg-xs fg-danger" x="510" y="208">not declared → op.New fails</text>
  </svg>
  <figcaption class="fig-note">The asymmetry is deliberate. A feature is a rule the profile can enforce on its own; a grant needs an authenticator, a store, sometimes a notification channel — things only you can provide, so silently enabling one would produce an OP that answers requests it cannot complete.</figcaption>
</figure>

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
