---
title: Vulnerability disclosure & CVE
description: How to report a security issue in go-oidc-provider, what to expect, and where supported-version and advisory status are maintained.
pageClass: pg-security-disclosure
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

The formal version of this policy is [`SECURITY.md`](https://github.com/libraz/go-oidc-provider/blob/main/.github/SECURITY.md) in the source repository; this page is the same intent in friendlier prose.

## What to expect

The rough flow once a report lands:

<svg class="disclosure-flow" role="img" aria-labelledby="disclosure-flow-title" viewBox="0 0 760 400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="disclosure-flow-title">The vulnerability-report pipeline: a report is received, acknowledged, triaged, and either closed as out of scope or fixed, disclosed, released, and published as a GHSA.</title>
  <!-- intake column -->
  <rect x="60" y="30" width="240" height="62" rx="8"/>
  <rect x="60" y="122" width="240" height="62" rx="8" class="op-accent"/>
  <rect x="60" y="214" width="240" height="62" rx="8" class="op-accent"/>
  <rect x="60" y="306" width="240" height="62" rx="8"/>
  <!-- remediation column -->
  <rect x="460" y="30" width="240" height="62" rx="8" class="op-accent"/>
  <rect x="460" y="122" width="240" height="62" rx="8" class="op-accent"/>
  <rect x="460" y="214" width="240" height="62" rx="8" class="op-accent"/>
  <rect x="460" y="306" width="240" height="62" rx="8" class="op-accent"/>
  <!-- connectors -->
  <path d="M180 92 L180 122"/><path d="M174 116 L180 122 L186 116"/>
  <path d="M180 184 L180 214"/><path d="M174 208 L180 214 L186 208"/>
  <path d="M180 276 L180 306"/><path d="M174 300 L180 306 L186 300"/>
  <path d="M300 245 H380 V61 H456"/><path d="M450 55 L456 61 L450 67"/>
  <path d="M580 92 L580 122"/><path d="M574 116 L580 122 L586 116"/>
  <path d="M580 184 L580 214"/><path d="M574 208 L580 214 L586 208"/>
  <path d="M580 276 L580 306"/><path d="M574 300 L580 306 L586 300"/>
  <!-- intake labels -->
  <text class="d-title" x="180" y="66" text-anchor="middle">Report received</text>
  <text class="d-title" x="180" y="150" text-anchor="middle">Acknowledge</text>
  <text class="d-sub" x="180" y="168" text-anchor="middle">when I'm next online</text>
  <text class="d-title" x="180" y="242" text-anchor="middle">Triage</text>
  <text class="d-sub" x="180" y="260" text-anchor="middle">reproduce / classify</text>
  <text class="d-title" x="180" y="342" text-anchor="middle">Close with reason</text>
  <!-- remediation labels -->
  <text class="d-title" x="580" y="58" text-anchor="middle">Fix or mitigation plan</text>
  <text class="d-sub" x="580" y="76" text-anchor="middle">severity drives priority</text>
  <text class="d-title" x="580" y="150" text-anchor="middle">Coordinated disclosure</text>
  <text class="d-sub" x="580" y="168" text-anchor="middle">agreed window</text>
  <text class="d-title" x="580" y="250" text-anchor="middle">Release patched version</text>
  <text class="d-title" x="580" y="334" text-anchor="middle">Publish GHSA</text>
  <text class="d-sub" x="580" y="352" text-anchor="middle">request CVE if applicable</text>
  <!-- edge labels -->
  <text class="d-edge halo" x="340" y="237" text-anchor="middle">confirmed</text>
  <text class="d-edge halo" x="190" y="296" text-anchor="start">out of scope</text>
</svg>

Realistic timing: acknowledgement usually takes a few days; severe issues get worked on right away, lower-severity ones may wait until I have a weekend free. If a week goes by without a reply, please ping again — it's not rudeness, just a missed notification or a busy stretch.

`SECURITY.md` lists 3 business days for acknowledgement and 14 days for a fix plan as aspirational targets; treat them as what I aim for, not as a contract.

## Supported versions

| Version | Supported |
|---------|-----------|
| `v1.x` | latest minor + previous minor |

::: tip Upgrade cadence
Pin to a tag in `go.mod` and read the [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) on each bump. The v1 public API follows Semantic Versioning; APIs marked `Experimental:` remain outside that promise. Security fixes land in supported v1 minors.
:::

## Disclosure flow

The project follows **coordinated disclosure** — nothing about that is adversarial:

1. Reporter and maintainer agree on a target patch date that fits both schedules.
2. A fix is developed in a private branch or GitHub Security Advisory draft.
3. The fix lands in `main` and a release tag is cut.
4. The advisory is published. CVE assignment is requested from GitHub's CNA when the issue meets the criteria; defence-in-depth hardening with no exploit path tends to ship as a GHSA without a CVE.
5. Subscribers of the GitHub repository (Watch → Releases / Security advisories) receive a notification.

## Current advisory state

Advisory status changes over time, so this page intentionally does not duplicate a point-in-time CVE count. GitHub Security Advisories are the canonical current record; consult the [advisories page](https://github.com/libraz/go-oidc-provider/security/advisories) and the repository [`SECURITY.md`](https://github.com/libraz/go-oidc-provider/blob/main/.github/SECURITY.md) for the live policy and disclosures. See the [Security posture](/security/posture) page for the limits of the project's defences.

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
