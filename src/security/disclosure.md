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

<figure class="fig">
  <div class="fig-head">What happens after you send a report</div>
  <svg class="fig-svg" role="img" aria-labelledby="disclosure-flow-title" viewBox="0 0 960 424" xmlns="http://www.w3.org/2000/svg">
    <title id="disclosure-flow-title">The pipeline a vulnerability report travels: received, acknowledged, triaged, and then either closed with a stated reason or fixed, disclosed on an agreed window, released, and published as a GHSA.</title>
    <!-- received -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="52">Report received</text>
    <text class="fg-s" x="48" y="76">privately, through the channel</text>
    <text class="fg-s" x="48" y="100">named in SECURITY.md</text>
    <path class="fg-edge fg-edge--thin" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <!-- acknowledged -->
    <rect class="fg-box" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="360" y="52">Acknowledged</text>
    <text class="fg-s" x="360" y="76">when I am next online;</text>
    <text class="fg-s" x="360" y="100">this is a personal project</text>
    <path class="fg-edge fg-edge--thin" d="M616,72 H656" marker-end="url(#fg-a)"/>
    <!-- triage -->
    <rect class="fg-box" x="656" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="672" y="52">Triage</text>
    <text class="fg-s" x="672" y="76">reproduced and classified</text>
    <text class="fg-s" x="672" y="100">valid, or out of scope</text>
    <!-- branches -->
    <path class="fg-leader" d="M792,120 V144 M168,144 H792"/>
    <path class="fg-edge fg-edge--ok fg-edge--thin" d="M168,144 V168" marker-end="url(#fg-ao)"/>
    <text class="fg-s fg-ok" x="180" y="162">confirmed</text>
    <path class="fg-edge fg-edge--muted fg-edge--thin" d="M792,144 V168" marker-end="url(#fg-am)"/>
    <text class="fg-s fg-dim" x="804" y="162">out of scope</text>
    <!-- fix -->
    <rect class="fg-box" x="32" y="168" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="196">Fix or mitigation plan</text>
    <text class="fg-s" x="48" y="220">severity sets the priority,</text>
    <text class="fg-s" x="48" y="244">not the reporter</text>
    <!-- closed -->
    <rect class="fg-box fg-box--muted" x="656" y="168" width="272" height="72" rx="8"/>
    <text class="fg-t2" x="672" y="196">Closed</text>
    <text class="fg-s" x="672" y="220">with the reason stated</text>
    <path class="fg-edge fg-edge--thin" d="M168,264 V304" marker-end="url(#fg-a)"/>
    <!-- disclosure -->
    <rect class="fg-box" x="32" y="304" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="332">Coordinated disclosure</text>
    <text class="fg-s" x="48" y="356">on a window agreed</text>
    <text class="fg-s" x="48" y="380">with the reporter</text>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M304,352 H344" marker-end="url(#fg-ac)"/>
    <!-- release -->
    <rect class="fg-box fg-box--accent" x="344" y="304" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="360" y="332">Patched release, GHSA</text>
    <text class="fg-s" x="360" y="356">with a CVE requested</text>
    <text class="fg-s" x="360" y="380">where it applies</text>
  </svg>
  <figcaption class="fig-note">Only the acknowledgement step has a soft timeline, and it says so plainly. Every step after it is fixed: nothing is published before the agreed window, and nothing is quietly patched without one.</figcaption>
</figure>

Realistic timing: acknowledgement usually takes a few days; severe issues get worked on right away, lower-severity ones may wait until I have a weekend free. If a week goes by without a reply, please ping again — it's not rudeness, just a missed notification or a busy stretch.

`SECURITY.md` lists 3 business days for acknowledgement and 14 days for a fix plan as aspirational targets; treat them as what I aim for, not as a contract.

## Supported versions

| Version | Supported |
|---------|-----------|
| `v1.x` | latest minor + previous minor |
| `v0.x` | unsupported |

::: tip Upgrade cadence
Pin to a tag in `go.mod` and read the [CHANGELOG](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) on each bump. The v1 public API follows Semantic Versioning; APIs marked `Experimental:` remain outside that promise. Security fixes land in supported v1 minors.
:::

## Disclosure flow

The project follows **coordinated disclosure** — nothing about that is adversarial:

1. Reporter and maintainer agree on a target patch date that fits both schedules.
2. A fix is developed in a private branch or GitHub Security Advisory draft.
3. The fix lands in `main` and a release tag is cut.
4. The advisory is published (a GHSA, GitHub's own advisory ID). A CVE is requested through GitHub's CNA (CVE Numbering Authority) when the issue meets the criteria; defence-in-depth hardening with no exploit path tends to ship as a GHSA without a CVE.
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
- A credential that stays usable after the revocation, sign-out or subject deletion that should have retired it (refresh, access, device-code, CIBA or token-exchange tokens).
- A `LoginFlow` rule or `Decider` that an existing session lets a request skip.
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
