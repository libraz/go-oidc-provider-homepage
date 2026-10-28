---
title: Reproducing the OFCS run
description: Step-by-step recipe for running the OpenID Foundation Conformance Suite against go-oidc-provider — which plan maps to which op-demo flag, where the wiring lives, how to capture and diff a baseline.
pageClass: pg-compliance-ofcs-reproduce
---

# Reproducing the OFCS run

This page is the runbook for running the OpenID Foundation Conformance Suite (OFCS) against the library yourself. [OFCS conformance status](/compliance/ofcs) records *what* the suite saw on the latest run; this page covers *how* to reproduce it and *which library options* each plan exercises.

The status page summarizes the run captured on the v1.4.0 release candidate, core commit [`6b37232`](https://github.com/libraz/go-oidc-provider/commit/6b3723292cb6763faf2aff35be9acbc3117888d8), at `2026-10-22T16:26:08Z` against OFCS `release-v5.3.3`. Its JSON snapshot is a local, gitignored artifact and does not record the image tag or digest; the pin you reproduce with is the `conformance/docker-compose.yml` default, `release-v5.3.3`.

Start at [OFCS conformance status](/compliance/ofcs) for the PASS / REVIEW / SKIPPED / WARNING counts. Read on for the `op.With...` options your own OP needs for the same plans to pass.

::: warning Personal project, not certified
The numbers on this site are reproducible snapshots — this page tells you how to reproduce them. They are not a substitute for paid OpenID Foundation certification. Run the suite locally to verify your own embedder configuration; do not cite local PASS counts as certification.
:::

<figure class="fig">
  <div class="fig-head">Reproducing a run, end to end</div>
  <svg class="fig-svg" role="img" aria-labelledby="ofcs-repro-title" viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg">
    <title id="ofcs-repro-title">Six steps reproduce a conformance run: generate the certificates, start the conformance suite, start the demo OP on the profile under test, seed the plans, run them, and diff the result against the recorded baseline.</title>
    <!-- step 1 -->
    <rect class="fg-box" x="32" y="24" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="60" cy="48" r="12"/><text class="fg-badge-t" x="60" y="53.5" text-anchor="middle">1</text>
    <text class="fg-t2" x="84" y="52">Generate certs</text>
    <text class="fg-m" x="84" y="76">make certs</text>
    <path class="fg-edge fg-edge--thin" d="M304,60 H344" marker-end="url(#fg-a)"/>
    <!-- step 2 -->
    <rect class="fg-box" x="344" y="24" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="372" cy="48" r="12"/><text class="fg-badge-t" x="372" y="53.5" text-anchor="middle">2</text>
    <text class="fg-t2" x="396" y="52">Start OFCS</text>
    <text class="fg-m" x="396" y="76">docker compose</text>
    <path class="fg-edge fg-edge--thin" d="M616,60 H656" marker-end="url(#fg-a)"/>
    <!-- step 3 -->
    <rect class="fg-box fg-box--accent" x="656" y="24" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="684" cy="48" r="12"/><text class="fg-badge-t" x="684" y="53.5" text-anchor="middle">3</text>
    <text class="fg-t2 fg-accent" x="708" y="52">Start op-demo</text>
    <text class="fg-s" x="708" y="76">on the profile under test</text>
    <path class="fg-edge fg-edge--thin" d="M792,96 V120 H168 V144" marker-end="url(#fg-a)"/>
    <!-- step 4 -->
    <rect class="fg-box" x="32" y="144" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="60" cy="168" r="12"/><text class="fg-badge-t" x="60" y="173.5" text-anchor="middle">4</text>
    <text class="fg-t2" x="84" y="172">Seed the plans</text>
    <text class="fg-m" x="84" y="196">seed-plans</text>
    <path class="fg-edge fg-edge--thin" d="M304,180 H344" marker-end="url(#fg-a)"/>
    <!-- step 5 -->
    <rect class="fg-box" x="344" y="144" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="372" cy="168" r="12"/><text class="fg-badge-t" x="372" y="173.5" text-anchor="middle">5</text>
    <text class="fg-t2" x="396" y="172">Run</text>
    <text class="fg-s" x="396" y="196">all nine, unattended</text>
    <path class="fg-edge fg-edge--thin" d="M616,180 H656" marker-end="url(#fg-a)"/>
    <!-- step 6 -->
    <rect class="fg-box" x="656" y="144" width="272" height="72" rx="8"/>
    <circle class="fg-badge" cx="684" cy="168" r="12"/><text class="fg-badge-t" x="684" y="173.5" text-anchor="middle">6</text>
    <text class="fg-t2" x="708" y="172">Diff</text>
    <text class="fg-s" x="708" y="196">against the baseline</text>
  </svg>
  <figcaption class="fig-note">Step 6 is what makes the run worth keeping. A raw pass count drifts silently; a diff against a recorded baseline names the module that changed.</figcaption>
</figure>

## Prerequisites

- **Docker** with Compose v2 (the harness invokes `docker compose`, not `docker-compose`).
- **OpenSSL** for cert generation (`scripts/conformance.sh certs`).
- **Go 1.26 or later**; `go.mod` pins the `go1.27.3` toolchain.
- `curl` and `python3` for the seed-plans / drive scripts.

The OFCS image is pulled from the OpenID Foundation registry at the default tag `release-v5.3.3` in [`conformance/docker-compose.yml`](https://github.com/libraz/go-oidc-provider/blob/main/conformance/docker-compose.yml). You do not need a separate OFCS checkout or `mvn install` step.

## One-command quick start

From a clean clone of [`libraz/go-oidc-provider`](https://github.com/libraz/go-oidc-provider):

```sh
make conformance-up
```

That target chains four steps:

1. `scripts/conformance.sh certs` — self-signed RSA-2048 cert for the OP listener (covering `localhost` + `host.docker.internal`), a pair of client certs the FAPI 2.0 mtls / mtls2 plan slots use, and a JKS truststore the OFCS container mounts so the suite trusts the OP without manual cert work.
2. `scripts/conformance.sh ofcs-up` — `docker compose up -d` brings up the OFCS containers and waits for `https://localhost:8443` to answer.
3. `scripts/conformance.sh op-up` — builds and launches `cmd/op-demo` on `https://127.0.0.1:9443`, seeded with redirect URIs for every plan alias the suite will use.
4. `scripts/conformance.sh seed-plans` — POSTs each plan template from `conformance/plans/` to the OFCS REST API and prints the resulting plan IDs.

Tear everything down (including the mongo volume that holds OFCS state) with:

```sh
make conformance-down
```

## Plans, op-demo flags, and the wiring they activate

OFCS test plans differ in which library features they exercise. The table below maps each plan to the `cmd/op-demo` invocation that activates the matching wiring, and to the source file you can read end-to-end to see exactly what `op.With...` options that profile turns on.

| OFCS plan | `op-demo` invocation | Reference wiring |
|---|---|---|
| `oidcc-basic-certification-test-plan` | `make conformance-op-up` (no profile) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `commonOptions` |
| `oidcc-config-certification-test-plan` | `make conformance-op-up` (no profile) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `commonOptions` |
| `oidcc-dynamic-certification-test-plan` | `make conformance-op-up` (DCR on by default in `conformance.sh`) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `op.WithDynamicRegistration` branch |
| `oidcc-formpost-basic-certification-test-plan` | `make conformance-op-up` (no profile) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-rp-initiated-logout-certification-test-plan` | `make conformance-op-up` (DCR on by default in `conformance.sh`) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | `make conformance-op-up` (DCR on by default in `conformance.sh`) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `fapi2-security-profile-id2-test-plan` | `OP_PROFILE=fapi2-baseline make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2BaselineOptions` |
| `fapi2-message-signing-id1-test-plan` | `OP_PROFILE=fapi2-message-signing make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2MessageSigningOptions` |
| `fapi-ciba-id1-test-plan` | `OP_PROFILE=fapi-ciba make conformance-op-up` | [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go) — `fapiCIBAOptions` |

`scripts/conformance.sh op-up` starts `op-demo` with `-enable-dcr` unless you set `OP_ENABLE_DCR=0`, and with the in-memory store unless you set `OP_STORE=composite` (MySQL for the durable substores, Redis for the volatile ones, via `OP_MYSQL_DSN` and `OP_REDIS_DSN`). The composite store captures a baseline against the storage shape a deployment runs; reset both engines between captures, because records left from a previous run change what the replay and reuse modules observe.

The pinned OFCS release calls the Message Signing plan `fapi2-message-signing-id1-test-plan`; the `id1` suffix is an OFCS plan identifier, not a version label for the FAPI 2.0 Message Signing Final specification. Results from that plan describe only the pinned suite coverage and do not establish conformance or certification against every requirement in the current Final specification.

Every per-profile file in `cmd/op-demo/` opens with a comment block enumerating the options that profile activates, the spec sections each option satisfies, and the OFCS modules the wiring is in service of. Read the file for the plan you intend to run before you copy patterns into your own OP.

## What to wire into your own OP

The per-profile files in `cmd/op-demo/` are the canonical wiring reference. The following sections summarise them so you can cross-check against your own embedder.

### OIDC Core 1.0 (basic, config, formpost, RP-initiated logout)

The vanilla profile needs no `op.WithProfile` call. The base options live in `commonOptions` in `cmd/op-demo/main.go` and apply to every plan:

- `op.WithIssuer(...)` — the issuer URL discovery and ID tokens advertise.
- `op.WithStore(...)` — the storage adapter (`op/storeadapter/inmem` for the demo; production uses sql / redis adapters).
- `op.WithKeyset(...)` — the signing keyset (one ES256 key in the demo).
- `op.WithCookieKeys(...)` — the AEAD key for cookie encryption.
- `op.WithMountPrefix(...)` — the URL prefix the OP handler is mounted under.
- `op.WithStaticClients(...)` — the seed clients (public + confidential trio).
- `op.WithLoginFlow(...)` — the login orchestration; demo uses `op.PrimaryPassword`.
- `op.WithFeature(feature.JAR)` — opt-in JAR for non-FAPI profiles, so discovery advertises request-object signing algorithms (without `none`) and the OFCS request-object modules either pass or skip cleanly.
- `op.WithClaimsSupported(...)` — the claim list discovery advertises.

The conformance harness enables DCR by default. For the dynamic plans (`oidcc-dynamic`, `*-rp-initiated-logout-*`), `op.WithDynamicRegistration(op.RegistrationOption{...})` is added so `/register` is mounted and an Initial Access Token is minted at startup. Set `OP_ENABLE_DCR=0` only when you intentionally want to measure a non-DCR discovery surface. The demo registers with `Open: true` because OFCS has no slot for an Initial Access Token in its plan templates, and it also prints an IAT to stdout. In production leave `Open` false, issue IATs through `Provider.IssueInitialAccessToken`, and keep them out of logs; see [Dynamic client registration](/use-cases/dynamic-registration).

### FAPI 2.0 Baseline

Set `OP_PROFILE=fapi2-baseline` when starting `op-demo`. The profile-specific additions, captured in `fapi2BaselineOptions`, are:

- `op.WithProfile(profile.FAPI2Baseline)` — auto-enables PAR (RFC 9126), JAR (RFC 9101), and the FAPI alg lockdown.
- `op.WithFeature(feature.DPoP)` — sender-constrained access tokens. FAPI 2.0 requires DPoP **or** mTLS; the demo picks DPoP because the OFCS templates ship `sender_constrain=dpop` for the fapi2-* plans.

The demo also seeds two `op.PrivateKeyJWTClient` records (`demo-fapi`, `demo-fapi-2`) holding the public halves of the OFCS test client JWKSes. The matching private halves live in [`conformance/plans/fapi2-*.json`](https://github.com/libraz/go-oidc-provider/tree/main/conformance/plans) so OFCS can sign `private_key_jwt` assertions.

For deeper context on each option, see [Concepts → FAPI](/concepts/fapi), [Concepts → DPoP](/concepts/dpop), and [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).

### FAPI 2.0 Message Signing

Set `OP_PROFILE=fapi2-message-signing`. Everything Baseline does plus:

- `op.WithProfile(profile.FAPI2MessageSigning)` — auto-enables JARM (signed authorization response) on top of PAR / JAR / alg lockdown.
- `op.WithFeature(feature.DPoP)` — same sender constraint as Baseline.
- `op.WithDPoPNonceSource(...)` — when `profile.FAPI2MessageSigning` or `profile.FAPICIBA` is active with DPoP, the library requires a source for server-supplied DPoP nonces; `op.New` refuses the configuration without one (`op/options_validate.go`). This is a library configuration requirement, not a mandate in the FAPI 2.0 Message Signing Final specification: that document has no §5.3.4, and §5.6 covers ID-token signing. If mTLS is explicitly selected instead of DPoP, no DPoP nonce source is needed. The demo uses the in-memory rotator; a multi-instance OP must back the source with a shared store.

### FAPI-CIBA

Set `OP_PROFILE=fapi-ciba`. CIBA differs from the fapi2-* plans in three significant ways:

- The OFCS `fapi-ciba-id1` plan inherits FAPI 1.0's hardcoded cert-bound access-token requirement and exposes no sender-constraint variant. The demo therefore wires `op.WithFeature(feature.MTLS)` instead of `feature.DPoP`; either satisfies the profile's "DPoP or mTLS" requirement. Because mTLS is chosen, no DPoP nonce source is needed.
- CIBA clients never visit the authorization endpoint. Their seeds carry an empty `redirect_uri` set and a narrowed grant list (CIBA URN + `refresh_token`), and the provider is built with `op.WithGrants(AuthorizationCode, CIBA, RefreshToken)` and `op.WithCIBA(...)` with a one-second poll interval and a raised `WithCIBAMaxPollViolations(50)`, so the plan's rapid polling does not trip the strike limit.
- The OFCS plan drives the `auth_req_id` poll loop without a real authentication device. The demo wraps the in-memory `CIBARequestStore` with `cibaAutoApproveStore`, which schedules an out-of-band `Approve()` after a configurable delay so the OP can simulate a device callback. **Production embedders MUST trigger `Approve` from the user's actual authentication-device callback, never from inside the OP process.**

The full wiring (including the auto-approve substore and the hint resolver) lives in [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go).

## Driving the run

With the stack up and the plans seeded, you can drive modules in three ways.

### Single browser-driven flow

Useful when iterating on one module from the OFCS UI:

```sh
scripts/conformance.sh drive 'https://host.docker.internal:9443/oidc/auth?...'
```

Copy the `Browser` URL OFCS prints in the test detail panel.

### Multiple modules at once

Pass a plan ID printed by `seed-plans`:

```sh
scripts/conformance.sh batch <plan-id> oidcc-server oidcc-userinfo-get ...
```

The batch sub-command picks the right driver hint per module name (e.g. it sets `OFCS_DRIVE_REJECT=1` for `*user-rejects-authentication*` modules so the demo cancels consent).

### Every module in every plan

```sh
make conformance-baseline LABEL=local-check
```

That runs every module in every seeded plan, restarting `op-demo` with the right profile between plans, and writes a deterministic JSON snapshot to `conformance/baselines/<UTC-date>-local-check.json`. Use this when verifying a refactor does not regress against a previously captured baseline.

## Reading the result

OFCS reports four main terminal result values, and the harness also preserves advisory `WARNING` results.

- **PASSED** — the module ran and observed the spec-required behaviour.
- **REVIEW** — the module ran but a person must verify visual or out-of-band behaviour the harness cannot capture (consent UI strings, error page screenshots). Not a failure. The headless harness records `REVIEW` as-is; certification through the OpenID Foundation would have a person clear each one in the OFCS UI.
- **SKIPPED** — the module depends on something this OP does not advertise in discovery or per-client metadata. For example, a per-client `RS256` negative test skips when the client metadata declares `PS256` as its signing alg. Not a failure.
- **WARNING** — the module reached a non-failed advisory result. The current status page tracks these separately from FAILED.
- **FAILED** — the module did not reach the suite's expected result. It blocks the release unless `make conformance-release-verify` matches it to a reviewed, unexpired exclusion (see [Release gate](#release-gate)); [OFCS conformance status](/compliance/ofcs) has the current breakdown.
- **No verdict** — the module never reached a terminal state (`WAITING` or `CONFIGURED` after the runner's idle bound). Only an `unreachable_verdicts` entry with evidence can account for it.

[OFCS conformance status](/compliance/ofcs) lists which modules currently sit in REVIEW or SKIPPED, and why.

## Release gate {#release-gate}

`baseline-diff` tells you what changed; it is not the release sign-off. `make conformance-release-verify` is the strict gate:

```sh
make conformance-release-verify \
    BASELINE_REFERENCE=conformance/baselines/<approved-reference>.json \
    BASELINE_CANDIDATE=conformance/baselines/<candidate>.json
```

The candidate must contain exactly the reference's plan and module catalog, with no empty status or result. Every module must be `FINISHED` / `PASSED`, unless `conformance/release-exclusions.json` accounts for it. The manifest must be tracked and unchanged from `HEAD`, and each of its three sections covers one kind of outcome:

| Outcome | Manifest section | How an entry matches | What it must also carry |
|---|---|---|---|
| FAILED, including interrupted modules | `exclusions` | exact plan, module, status and result | the reason it fails by design |
| REVIEW or SKIPPED | `accepted_outcomes` | a class rule on the result and a module-name pattern (`oidcc-rp-initiated-logout-*`); `intermittent` marks a module the suite sometimes concludes as PASSED | the reason the suite cannot decide |
| No verdict (`WAITING`, `CONFIGURED`) | `unreachable_verdicts` | exact plan, module and status | `evidence` of what was tried in a standalone run |

Every entry also names an owner and an exclusive ISO expiry date. A missing, duplicate, stale or expired entry is itself a blocker, so an exception cannot outlive the review that granted it. An OFCS catalog change, such as a renamed module after a pin bump, fails the same gate until a new approved reference is captured.

## Capturing and diffing a baseline {#reproduce-baseline}

The harness is built around the cycle "freeze the current state, then verify a change does not regress against it":

```sh
make conformance-up
make conformance-baseline LABEL=pre-change

# … make changes …

make conformance-baseline LABEL=post-change
make conformance-baseline-diff \
    BASELINE_OLD=conformance/baselines/<utc>-pre-change.json \
    BASELINE_NEW=conformance/baselines/<utc>-post-change.json
```

`baseline-diff` exits non-zero on any module that **lost** `PASSED` between the two snapshots. The diff classifies modules as:

- **regressions** — were `PASSED`, now anything else (the gate).
- **fixes** — were not `PASSED`, now `PASSED`.
- **non-pass churn** — both states are non-`PASSED` but differ (e.g. REVIEW → SKIPPED).
- **catalog drift** — module appears in only one snapshot (typical when bumping the OFCS pin).

Snapshot files are gitignored — they record an environment-specific moment in time and would churn between machines and OFCS releases. If you want to keep a single canonical snapshot, copy it out from under `conformance/baselines/` to a path you commit elsewhere.

The module list is queried from OFCS at runtime, so a catalog drift between OFCS releases is captured automatically. Set `BASELINE_FILTER` to a regex when you only want to baseline a subset:

```sh
BASELINE_FILTER='^oidcc-' make conformance-baseline LABEL=oidcc-only
```

## Bumping the pinned OFCS release

`conformance/docker-compose.yml` carries the canonical pin as the default of `IMAGE_TAG`. To move forward for one run:

```sh
IMAGE_TAG=release-vX.Y.Z make conformance-up
```

OFCS test logic drifts between releases: modules are renamed, merged or tightened. After any bump, recapture every plan's baseline and diff it against the previous one. A new SKIPPED or REVIEW row is usually a catalog rename, not a regression; check the renamed module's intent first. To make the new default permanent, edit the compose file and commit it.

## Re-using the wiring in your own OP

The per-profile files in `cmd/op-demo/` are deliberately small and well-commented so you can lift their structure directly into your own embedder:

- [Concepts → FAPI](/concepts/fapi) — what `op.WithProfile(profile.FAPI2Baseline)` actually changes.
- [Concepts → DPoP](/concepts/dpop) — how DPoP slots into the access-token issuance path.
- [Concepts → mTLS](/concepts/mtls) — how `feature.MTLS` extracts the client cert and produces `cnf.x5t#S256`.
- [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — embedder walkthrough for a Baseline-target deployment.

A production embedder will replace the `cmd/op-demo` ephemera (in-memory store, ephemeral signing key, the auto-approve CIBA wrapper) with vault-backed keys, a durable storage adapter, and a real device-callback path — but the `op.With...` shape stays identical.

## Caveats worth naming

- **Plan suite version.** The default pin is `release-v5.3.3`. The retained snapshot carries the `ofcs-v5.3.3` label but not the image tag or digest.
- **Headless drive.** The drive script reverse-engineers the OFCS REST surface; OFCS does not document it.
- **No real RP cert.** The mTLS plan slots use generated self-signed certs at `conformance/certs/` so the plan can be instantiated. No real CA chain is exercised.
- **Single OP instance.** Cross-instance behaviour (e.g. token introspection across two OPs sharing a store) is exercised by the in-process Spec Scenario Suite under `test/scenarios/`, not OFCS.
