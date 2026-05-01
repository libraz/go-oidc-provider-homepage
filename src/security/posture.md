---
title: Security posture
description: How go-oidc-provider thinks about safety — five separate properties, what's structurally enforced, and the explicit limits of an individually-maintained OSS library.
---

# Security posture

This page lays out **how** the library tries to stay safe, and — equally
important — **what kind of assurance it does and does not give you**.

::: warning Set expectations
go-oidc-provider is an OSS library maintained by a single individual
developer in their spare time. It has **not** been independently
audited, **not** received a paid pentest, and **not** been formally
certified by the OpenID Foundation. The properties below describe what
the codebase actively defends against; they are not equivalent to a
third-party audit report.
:::

## Five separate properties

When someone asks "is this safe?", the honest answer needs five
sub-answers:

| # | Property | Evidence here |
|---|---|---|
| 1 | **Conformance** — implements the spec | OFCS green ([compliance/ofcs](/compliance/ofcs)) |
| 2 | **Correctness** — sane on all inputs | Unit + scenario + fuzz tests under `test/` |
| 3 | **Security** — resists active attackers | Structural defenses (below) + design judgments |
| 4 | **Supply-chain** — dependencies stay safe | `govulncheck` in CI, depguard, third-party manifest |
| 5 | **Operational** — stays safe over time | SECURITY.md disclosure path, GitHub Security Advisories |

> Conformance ≠ Security. An OFCS-passing OP can still be exploitable
> (alg confusion, PKCE downgrade, redirect_uri partial match, timing
> attacks on secret compare). The next sections describe how each
> class is closed structurally rather than by runtime checks alone.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#374151","primaryTextColor":"#fff","lineColor":"#888"}}}%%
flowchart LR
  A[Conformance<br/>OFCS] --> B[Correctness<br/>tests + fuzz]
  B --> C[Security<br/>structural<br/>defenses]
  C --> D[Supply-chain<br/>govulncheck<br/>depguard]
  D --> E[Operational<br/>SECURITY.md<br/>GHSA]
  style A fill:#0c5460,color:#fff
  style B fill:#0c5460,color:#fff
  style C fill:#0c5460,color:#fff
  style D fill:#0c5460,color:#fff
  style E fill:#0c5460,color:#fff
```

## Structural defenses (what the codebase enforces by shape)

These are not "we remembered to validate"; they are decisions made at
the type / package boundary so the unsafe path does not exist.

### 1. The constructor refuses zero-value boots

`op.New(...)` returns `error` — not a "use defaults" handler — when any
of the four required options is missing: `WithIssuer`, `WithStore`,
`WithKeyset`, `WithCookieKey`. There is no usable zero-value `Provider`.

::: details Why this matters
Most "default-on" framework libraries silently boot on missing config.
This shape closes the class of "OP came up with no signing key /
guessable cookie key / wrong issuer" errors before a single request is
served. See `op.WithIssuer` / `op.WithKeyset` / `op.WithCookieKey` /
`op.WithStore` for the build-time errors emitted on absence.
:::

### 2. The JOSE alg list is a closed type

`internal/jose.Algorithm` enumerates only `RS256`, `PS256`, `ES256`,
`EdDSA`. `none`, `HS256/384/512`, and any custom string fail
`IsAllowed()`. `ParseAlgorithm` returns `ok=false` rather than a
fallback. Because every signing / verifying path in the codebase
imports through `internal/jose`, **algorithm-confusion attacks
(RFC 7519 §6 / RFC 8725 §2.1) are structurally unreachable**.

| Concern | Mitigation |
|---|---|
| `alg=none` accepted by a JWT lib | `Algorithm(s)` rejects unknown / empty values |
| `HS256` with public-key trust path | `HS*` not in the type at all |
| Per-deployment alg "feature flag" creep | depguard forbids importing the underlying JOSE library outside `internal/jose/` |

### 3. `crypto/rand` only — never `math/rand`

A repository-wide rule bans `math/rand`. The lint configuration backs
it up. Every nonce, code, refresh token, authorization code, and
DPoP server-nonce uses `crypto/rand`.

### 4. `time.Now()` is funnelled through `internal/timex/`

Direct `time.Now()` calls are forbidden. A `Clock` abstraction makes
time injection at the boundary explicit and prevents replay-window
tests from passing accidentally because clocks drift differently in
tests.

### 5. Errors go through a typed catalog

`fmt.Errorf` cannot create an API-visible error. Every wire-emitted
error is built from `op.Error` / catalog values, so error codes,
status codes, and `WWW-Authenticate` shapes stay consistent — and
information leakage is bounded by the catalog rather than free-form
formatting.

### 6. The `internal/` boundary is non-negotiable

External code cannot import `internal/`. Anything that needs to be
public has a stable public surface in `op/`, `op/profile/`,
`op/feature/`, `op/grant/`, `op/store/`, `op/storeadapter/`. Embedders
who want to "just patch the JAR verifier" cannot, by Go's package
visibility rules.

### 7. ORM-agnostic by design

The library never embeds an ORM (no GORM, no ent, no xo). Storage is
through small `store.*Store` interfaces. Embedders implement them
with whatever they already use. Side effect: there is no
"surprise migration" — the library cannot mutate your DB behind your back.

## Defensive features that ship enabled

| Defence | Source of truth | Spec |
|---|---|---|
| `__Host-` cookies, AES-256-GCM, double-submit CSRF, Origin/Referer check | `internal/cookie`, `internal/csrf` | OWASP ASVS L1 / RFC 6265bis |
| PKCE required on `authorization_code`; `plain` refused | `internal/pkce` | RFC 7636 |
| Refresh-token rotation + reuse detection (chain revoke) | `internal/grants/refresh` | RFC 9700 §4.14 |
| Sender-constrained tokens (DPoP `cnf.jkt`, mTLS `cnf.x5t#S256`) | `internal/dpop`, `internal/mtls`, `internal/tokens` | RFC 9449, RFC 8705 |
| `iss` in authorization response | `internal/authorize` | RFC 9207 |
| `redirect_uri` exact match (configurable; default exact) | `internal/authorize` | OAuth 2.1, RFC 8252 |
| Loopback redirect hardening | `internal/registrationendpoint`, `internal/authorize` | RFC 8252 |
| Back-channel logout SSRF defense (RFC 1918 deny-list) | `internal/backchannel` | OIDC Back-Channel Logout 1.0 |
| OP-side request_object replay (`jti`) | `internal/jar` | RFC 9101 §10.8 |
| Algorithm allow-list at every verify path | `internal/jose` | RFC 8725 |
| Issuer canonicalisation / no trailing slash drift | `op/op.go` | RFC 9207 |

## Tooling

| Tier | Tool | Where |
|---|---|---|
| Lint | `golangci-lint v2` (errcheck, govet, staticcheck, unused, **gosec**, errorlint, revive, depguard, …) | `.golangci.yaml` |
| Vuln scan | `govulncheck` | `scripts/govulncheck.sh` |
| Fuzz | Go native `Fuzz*` (run `make fuzz` or `scripts/fuzz.sh 30s`) | targets across `internal/jose`, `internal/jar`, `internal/dpop`, `internal/pkce`, `internal/jwks` |
| License | `go-licenses` | `scripts/licenses.sh` |
| Conformance | `make conformance-baseline` | `tools/conformance/`, `conformance/` |
| Scenarios | catalog-driven Spec Scenario Suite | `test/scenarios/` |

## What is **not** here

Be loud about the limits. This is the part you should read twice.

::: danger Read this before adopting
- ❌ **No paid third-party security audit.**
- ❌ **No paid pentest.**
- ❌ **No formal OpenID Foundation certification.** (See <a class="doc-ref" href="/compliance/ofcs">OFCS conformance</a>.)
- ❌ **No SLA on patch turnaround.** SECURITY.md commits to *aim* — 3 business days ack, 14 days for confirmed-issue mitigations — without a contractual guarantee.
- ❌ **No 24/7 incident channel.** Disclosure is via GitHub Security Advisories or the maintainer profile.
- ❌ **No CVE database entry yet** (see <a class="doc-ref" href="/security/disclosure">Disclosure policy</a>). The pre-v1.0 line has not had any reported security issue, so there is nothing to publish; that's the literal status, not "we don't bother".
:::

If you need any of those for compliance, this library is the wrong
choice — at least until v1.0 and a formal audit. The honest framing
costs nothing and prevents misuse.

## How to think about adoption

| If you are… | Then… |
|---|---|
| Building an internal-only OP for a product you control | Reasonable fit; pin to a tag, run `govulncheck` in your own CI, follow GHSA |
| Building a public-facing OP for high-value flows (banking-grade FAPI) | Treat the library as a starting point, run a third-party audit, contribute findings back |
| Replacing a certified IdP for compliance reasons | Don't — until v1.0 and a paid audit you can cite |
| Learning OIDC mechanics from a real OP codebase | Best use; the structural defenses are part of the lesson |

## Read next

- **[Design judgments](/security/design-judgments)** — how the
  library resolves conflicts between RFCs (PAR vs `request_uri`
  reuse, refresh rotation vs RFC 9700 grace, alg list vs OIDC Core, …).
- **[Disclosure policy](/security/disclosure)** — vulnerability
  reporting, supported versions, CVE handling.
- **[OFCS conformance](/compliance/ofcs)** — what conformance does and
  does not prove.
