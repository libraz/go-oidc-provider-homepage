---
title: Vulnerability disclosure & CVE
description: How to report a security issue in go-oidc-provider, what to expect, and the current advisory state.
---

# Vulnerability disclosure & CVE

::: warning Personal-project security operations
go-oidc-provider is maintained by a single developer outside of work hours. Vulnerability handling is **best-effort**: a real human reads every report, but turnaround depends on availability — expect days, sometimes weeks, with no SLA. If your deployment needs a contractual response window, this is not the right project for that role; please escalate the requirement before adopting.
:::

## Reporting a vulnerability

**Do not open a public GitHub issue** for a suspected security flaw.

Use one of:

1. **GitHub Security Advisories** — [open a private report](https://github.com/libraz/go-oidc-provider/security/advisories/new) (preferred; triage is faster).
2. **Email** the maintainer at <SvgEmail />.

Please include whatever you have:

- A description of the issue and its impact.
- Steps to reproduce or a minimal proof of concept.
- Affected versions, if known.
- Your assessment of severity (CVSS welcome but not required).

If a detail is missing it's fine — partial reports are still useful, and follow-up questions are normal.

The formal version of this policy is [`SECURITY.md`](https://github.com/libraz/go-oidc-provider/blob/main/SECURITY.md) in the source repository; this page is the same intent in friendlier prose.

## What to expect

The rough flow once a report lands:

<svg role="img" aria-labelledby="disclosure-flow-title" viewBox="0 0 536 672" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:100%;max-width:640px;height:auto;margin:1.5rem auto;">
  <title id="disclosure-flow-title">The vulnerability-report pipeline: a report is received, acknowledged, triaged, and either closed as out of scope or fixed, disclosed, released, and published as a GHSA.</title>
  <style>
    .d-title{font-family:var(--vp-font-family-base);font-weight:600;font-size:14px;fill:var(--vp-c-text-1);stroke:none}
    .d-sub{font-family:var(--vp-font-family-base);font-weight:400;font-size:11.5px;fill:var(--vp-c-text-2);stroke:none}
    .d-edge{font-family:var(--vp-font-family-base);font-weight:500;font-size:11px;fill:var(--vp-c-text-2);stroke:none}
    .op-accent{stroke:var(--vp-c-brand-2)}
  </style>
  <!-- boxes -->
  <rect x="20" y="20" width="230" height="54" rx="8"/>
  <rect x="20" y="114" width="230" height="54" rx="8" class="op-accent"/>
  <rect x="20" y="208" width="230" height="54" rx="8" class="op-accent"/>
  <rect x="20" y="320" width="230" height="54" rx="8" class="op-accent"/>
  <rect x="20" y="414" width="230" height="54" rx="8" class="op-accent"/>
  <rect x="20" y="508" width="230" height="54" rx="8" class="op-accent"/>
  <rect x="20" y="602" width="230" height="54" rx="8" class="op-accent"/>
  <rect x="315" y="208" width="205" height="54" rx="8"/>
  <!-- connectors -->
  <path d="M135 74 L135 114"/><path d="M129 108 L135 114 L141 108"/>
  <path d="M135 168 L135 208"/><path d="M129 202 L135 208 L141 202"/>
  <path d="M135 262 L135 320"/><path d="M129 314 L135 320 L141 314"/>
  <path d="M135 374 L135 414"/><path d="M129 408 L135 414 L141 408"/>
  <path d="M135 468 L135 508"/><path d="M129 502 L135 508 L141 502"/>
  <path d="M135 562 L135 602"/><path d="M129 596 L135 602 L141 596"/>
  <path d="M250 235 L315 235"/><path d="M309 229 L315 235 L309 241"/>
  <!-- labels -->
  <text class="d-title" x="135" y="52" text-anchor="middle">Report received</text>
  <text class="d-title" x="135" y="135" text-anchor="middle">Acknowledge</text>
  <text class="d-sub" x="135" y="153" text-anchor="middle">when I'm next online</text>
  <text class="d-title" x="135" y="229" text-anchor="middle">Triage</text>
  <text class="d-sub" x="135" y="247" text-anchor="middle">reproduce / classify</text>
  <text class="d-title" x="135" y="341" text-anchor="middle">Fix or mitigation plan</text>
  <text class="d-sub" x="135" y="359" text-anchor="middle">severity drives priority</text>
  <text class="d-title" x="135" y="435" text-anchor="middle">Coordinated disclosure</text>
  <text class="d-sub" x="135" y="453" text-anchor="middle">window</text>
  <text class="d-title" x="135" y="540" text-anchor="middle">Release patched version</text>
  <text class="d-title" x="135" y="623" text-anchor="middle">Publish GHSA</text>
  <text class="d-sub" x="135" y="641" text-anchor="middle">request CVE if applicable</text>
  <text class="d-title" x="417" y="240" text-anchor="middle">Close with reason</text>
  <!-- edge labels -->
  <text class="d-edge" x="143" y="295" text-anchor="start">confirmed</text>
  <text class="d-edge" x="282" y="227" text-anchor="middle">out of scope</text>
</svg>

Realistic timing: acknowledgement usually takes a few days; severe issues get worked on right away, lower-severity ones may wait until I have a weekend free. If a week goes by without a reply, please ping again — it's not rudeness, just a missed notification or a busy stretch.

`SECURITY.md` lists 3 business days for acknowledgement and 14 days for a fix plan as aspirational targets; treat them as what I aim for, not as a contract.

## Supported versions

| Version | Supported |
|---------|-----------|
| `v0.x` (pre-v1.0) | latest minor only |
| `v1.x` | latest minor + previous minor (planned, post-v1.0) |

::: tip Pre-v1.0 cadence
While the project is pre-v1.0, the public Go API may change in any minor release. Pin to a tag in your `go.mod` and read the [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) on each bump. Security fixes go to the latest minor only; if you stay on an older one you'll need to upgrade to pick the fix up. Backports are not planned during the pre-v1.0 window — there's just one of me.
:::

## Disclosure flow

The project follows **coordinated disclosure** — nothing about that is adversarial:

1. Reporter and maintainer agree on a target patch date that fits both schedules.
2. A fix is developed in a private branch or GitHub Security Advisory draft.
3. The fix lands in `main` and a release tag is cut.
4. The advisory is published. CVE assignment is requested from GitHub's CNA when the issue meets the criteria; defence-in-depth hardening with no exploit path tends to ship as a GHSA without a CVE.
5. Subscribers of the GitHub repository (Watch → Releases / Security advisories) receive a notification.

## Current advisory state

::: details Status as of this page revision
**No public CVE has been assigned to date.** No security report meeting the criteria for a CVE has been received against the pre-v1.0 line. This is a literal status — there is nothing to publish — not a claim of audited safety. See the [Security posture](/security/posture) page for the honest framing around what the project's defences cover and don't cover.

GitHub Security Advisories are the canonical source of truth and will appear on the [advisories page](https://github.com/libraz/go-oidc-provider/security/advisories) as soon as one is filed.
:::

## Adjacent supply-chain hygiene

Even when the OP itself is sound, dependencies can carry known issues. Before you adopt and at every dependency bump:

```sh
# In your own consuming module
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...
```

Inside this module, the same tool runs in CI via [`scripts/govulncheck.sh`](https://github.com/libraz/go-oidc-provider/blob/main/scripts/govulncheck.sh). The dependency manifest is intentionally narrow — see [`THIRD_PARTY.md`](https://github.com/libraz/go-oidc-provider/blob/main/THIRD_PARTY.md) for the full list. AGPL / GPL / SSPL / BUSL / Elastic-licensed dependencies are forbidden by repository policy, which keeps the license-compatibility surface small.

## What's worth reporting

In scope (please report):

- Bypass of any `op.WithProfile(profile.FAPI2*)` security gate (PAR, JAR, DPoP, JARM, alg list, redirect_uri exact match).
- Algorithm confusion paths (any way to make the verifier accept `none`, `HS*`, or an alg outside the codebase allow-list).
- Token forgery, ID-token signature bypass, or `iss` mix-up paths.
- PKCE / nonce / state replay paths beyond what the relevant RFC permits.
- Refresh-token reuse without chain revocation.
- CSRF on consent / logout / interaction POSTs.
- Cookie-handling regressions (loss of `__Host-`, `Secure`, AES-256-GCM AEAD).
- Back-channel logout SSRF (private-network address bypassing the RFC 1918 deny-list).
- Information disclosure beyond the error catalog (`internal/redact`).
- Injection attacks against any storage adapter shipped under `op/storeadapter/`.

Out of scope (documented behaviour, see <a class="doc-ref" href="/security/design-judgments">Design judgments</a>):

- Front-Channel Logout / Session Management features being absent.
- Loopback redirect-URI relaxation when the operator opts in.
- Refresh-token issuance without `offline_access`.
- The `cmd/op-demo` binary being weakly configured — it is a conformance harness, not a production OP.

## Hall of fame

When the first valid security report lands, this section will list the reporter (with their permission). For now it's empty — not a claim that the library is exhaustively secure, just that nothing has been reported yet. See the posture page for the honest picture of what's defended.

## Read next

- **[Security posture](/security/posture)** — what's structurally defended, what tooling backs it, what's deliberately not in scope.
- **[Design judgments](/security/design-judgments)** — the explicit reading of conflicting RFCs.
- **[OFCS conformance](/compliance/ofcs)** — what conformance proves and what it doesn't.
