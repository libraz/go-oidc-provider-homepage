---
title: Reproducing the OFCS run
description: Step-by-step recipe for running the OpenID Foundation Conformance Suite against go-oidc-provider — which plan maps to which op-demo flag, where the wiring lives, how to capture and diff a baseline.
---

# Reproducing the OFCS run

This page is the operator's runbook. It complements [OFCS conformance status](/compliance/ofcs), which records *what* the suite saw on the latest run; this page covers *how* to reproduce it on your own machine and *which library options* each OFCS plan exercises.

If you are looking for the latest PASS/REVIEW/SKIPPED counts, start at [OFCS conformance status](/compliance/ofcs). If you want to understand which `op.With...` options to wire into your own OP so the same OFCS plans pass against it, you are in the right place.

::: warning Personal project, not certified
The numbers on this site are reproducible snapshots — this page tells you how to reproduce them. They are not a substitute for paid OpenID Foundation certification. Run the suite locally to verify your own embedder configuration; do not cite local PASS counts as certification.
:::

## Prerequisites

- **Docker** with Compose v2 (the harness invokes `docker compose`, not `docker-compose`).
- **OpenSSL** for cert generation (`scripts/conformance.sh certs`).
- **Go toolchain** matching the version pinned in `go.mod`.
- `curl` and `python3` for the seed-plans / drive scripts.

The OFCS image is pulled from the OpenID Foundation registry at the tag pinned in [`conformance/docker-compose.yml`](https://github.com/libraz/go-oidc-provider/blob/main/conformance/docker-compose.yml). You do not need a separate OFCS checkout or `mvn install` step.

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
| `oidcc-dynamic-certification-test-plan` | `OP_ENABLE_DCR=1 make conformance-op-up` | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) — `op.WithDynamicRegistration` branch |
| `oidcc-formpost-basic-certification-test-plan` | `make conformance-op-up` (no profile) | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-rp-initiated-logout-certification-test-plan` | `OP_ENABLE_DCR=1 make conformance-op-up` | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `oidcc-rp-initiated-logout-with-back-channel-logout-certification-test-plan` | `OP_ENABLE_DCR=1 make conformance-op-up` | [`cmd/op-demo/main.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/main.go) |
| `fapi2-security-profile-id2-test-plan` | `OP_PROFILE=fapi2-baseline make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2BaselineOptions` |
| `fapi2-message-signing-id1-test-plan` | `OP_PROFILE=fapi2-message-signing make conformance-op-up` | [`cmd/op-demo/profile_fapi2.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi2.go) — `fapi2MessageSigningOptions` |
| `fapi-ciba-id1-test-plan` | `OP_PROFILE=fapi-ciba make conformance-op-up` | [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go) — `fapiCIBAOptions` |

Every per-profile file in `cmd/op-demo/` opens with a comment block enumerating the options that profile activates, the spec sections each option satisfies, and the OFCS modules the wiring is in service of. Read the file for the plan you intend to run before you copy patterns into your own OP.

## What to wire into your own OP

The per-profile files in `cmd/op-demo/` are the canonical wiring reference. The following sections summarise them so you can cross-check against your own embedder.

### OIDC Core 1.0 (basic, config, formpost, RP-initiated logout)

The vanilla profile needs no `op.WithProfile` call. The base options live in `commonOptions` in `cmd/op-demo/main.go` and apply to every plan:

- `op.WithIssuer(...)` — the issuer URL discovery and ID tokens advertise.
- `op.WithStore(...)` — the storage adapter ([`op/storeadapter/inmem`](/operations/jwks) for the demo; production uses sql / redis adapters).
- `op.WithKeyset(...)` — the signing keyset.
- `op.WithCookieKeys(...)` — the AEAD key for cookie encryption.
- `op.WithMountPrefix(...)` — the URL prefix the OP handler is mounted under.
- `op.WithStaticClients(...)` — the seed clients (public + confidential trio).
- `op.WithLoginFlow(...)` — the login orchestration; demo uses `op.PrimaryPassword`.
- `op.WithFeature(feature.JAR)` — opt-in JAR for non-FAPI profiles so the OFCS request-object modules either pass or skip cleanly.
- `op.WithClaimsSupported(...)` — the claim list discovery advertises.

For the dynamic plans (`oidcc-dynamic`, `*-rp-initiated-logout-*`), add `op.WithDynamicRegistration(op.RegistrationOption{...})` so `/register` is mounted and an Initial Access Token is minted at startup. The demo prints the IAT to stdout; in production hand it to a secret manager and never log it.

### FAPI 2.0 Baseline

Set `OP_PROFILE=fapi2-baseline` when starting `op-demo`. The profile-specific additions, captured in `fapi2BaselineOptions`, are:

- `op.WithProfile(profile.FAPI2Baseline)` — auto-enables PAR (RFC 9126), JAR (RFC 9101), and the FAPI alg lockdown.
- `op.WithFeature(feature.DPoP)` — sender-constrained access tokens. FAPI 2.0 §3.1.4 requires DPoP **OR** mTLS; the demo picks DPoP because the OFCS templates ship `sender_constrain=dpop` for the fapi2-* plans.

The demo also seeds two `op.PrivateKeyJWTClient` records (`demo-fapi`, `demo-fapi-2`) holding the public halves of the OFCS test client JWKSes. The matching private halves live in [`conformance/plans/fapi2-*.json`](https://github.com/libraz/go-oidc-provider/tree/main/conformance/plans) so OFCS can sign `private_key_jwt` assertions.

For deeper context on each option, see [Concepts → FAPI](/concepts/fapi), [Concepts → DPoP](/concepts/dpop), and [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline).

### FAPI 2.0 Message Signing

Set `OP_PROFILE=fapi2-message-signing`. Everything Baseline does plus:

- `op.WithProfile(profile.FAPI2MessageSigning)` — auto-enables JARM (signed authorization response) on top of PAR / JAR / alg lockdown.
- `op.WithFeature(feature.DPoP)` — same sender constraint as Baseline.
- `op.WithDPoPNonceSource(...)` — FAPI 2.0 Message Signing §5.3.4 mandates a server-supplied DPoP nonce. The option layer rejects `op.New` under this profile if no source is wired. The demo uses the in-memory rotator; a multi-instance OP must back the source with a shared store.

### FAPI-CIBA

Set `OP_PROFILE=fapi-ciba`. CIBA differs from the fapi2-* plans in three significant ways:

- The OFCS `fapi-ciba-id1` plan inherits FAPI 1.0's hardcoded cert-bound access-token requirement and exposes no sender-constraint variant. The demo therefore wires `op.WithFeature(feature.MTLS)` instead of `feature.DPoP`. Both satisfy `WithProfile`'s "DPoP OR MTLS" disjunctive constraint.
- CIBA clients never visit `/authorize`. Their seeds carry an empty `redirect_uri` set and a narrowed grant list (CIBA URN + `refresh_token`).
- The OFCS plan drives the `auth_req_id` poll loop without a real authentication device. The demo wraps the in-memory `CIBARequestStore` with `cibaAutoApproveStore`, which schedules an out-of-band `Approve()` after a configurable delay so the OP can simulate a device callback. **Production embedders MUST trigger `Approve` from the user's actual authentication-device callback, never from inside the OP process.**

The full wiring (including the auto-approve substore and the hint resolver) lives in [`cmd/op-demo/profile_fapi_ciba.go`](https://github.com/libraz/go-oidc-provider/blob/main/cmd/op-demo/profile_fapi_ciba.go).

## Driving the run

With the stack up and the plans seeded, you can drive modules in three ways.

### Single browser-driven flow

Useful when iterating on one module from the OFCS UI:

```sh
scripts/conformance.sh drive 'https://host.docker.internal:9443/oidc/authorize?...'
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

That runs every module in every seeded plan and writes a deterministic JSON snapshot to `conformance/baselines/<UTC-date>-local-check.json`. Use this when verifying a refactor does not regress against a previously-captured baseline.

## Reading the result

OFCS has four terminal states.

- **PASSED** — the module ran and observed the spec-required behaviour.
- **REVIEW** — the module ran but a human reviewer must verify visual or out-of-band behaviour the harness cannot capture (consent UI strings, error page screenshots). Not a failure. The headless harness records `REVIEW` as-is; paid certification would require sitting in front of the OFCS UI to clear it.
- **SKIPPED** — the module depends on a feature this OP does not advertise in discovery or per-client metadata. For example, a per-client `RS256` negative test skips when the client metadata declares `PS256` as its signing alg, putting `RS256` out of scope for that probe. Not a failure.
- **FAILED** — observed behaviour diverged from the spec. The current snapshot tracks **0 failures** across all plans; see [OFCS conformance status](/compliance/ofcs#latest-baseline) for the breakdown.

The detailed breakdown of which modules currently sit in REVIEW or SKIPPED, and why, is on [OFCS conformance status](/compliance/ofcs#modules-currently-in-review).

## Capturing and diffing a baseline

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

`conformance/docker-compose.yml` carries the canonical pin via `IMAGE_TAG`. To move forward:

```sh
IMAGE_TAG=release-vX.Y.Z make conformance-up
```

OFCS test logic does drift between releases — module renames, condition strictness changes, new variants. After any bump, recapture every plan's baseline and diff it against the previous one. A new SKIPPED or REVIEW row is usually a catalog rename and not a regression; verify the renamed module's intent before treating it as one.

## Re-using the wiring in your own OP

The per-profile files in `cmd/op-demo/` are deliberately small and well-commented so you can lift their structure directly into your own embedder:

- [Concepts → FAPI](/concepts/fapi) — what `op.WithProfile(profile.FAPI2Baseline)` actually changes.
- [Concepts → DPoP](/concepts/dpop) — how DPoP slots into the access-token issuance path.
- [Concepts → mTLS](/concepts/mtls) — how `feature.MTLS` extracts the client cert and produces `cnf.x5t#S256`.
- [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — embedder walkthrough for a Baseline-target deployment.

A production embedder will replace the `cmd/op-demo` ephemera (in-memory store, ephemeral signing key, the auto-approve CIBA wrapper) with vault-backed keys, a durable storage adapter, and a real device-callback path — but the `op.With...` shape stays identical.

## Caveats worth naming

- **Plan suite version.** The pin is set in `conformance/docker-compose.yml`. Tests added or renamed in newer OFCS releases are not covered until the pin is bumped.
- **Headless drive.** The drive script reverse-engineers the OFCS REST surface; OFCS does not document it. Behaviour is confirmed against the pinned release only.
- **No real RP cert.** The mTLS plan slots use generated self-signed certs at `conformance/certs/` so the plan can be instantiated. No real CA chain is exercised.
- **Single OP instance.** Cross-instance behaviour (e.g. token introspection across two OPs sharing a store) is exercised by the in-process Spec Scenario Suite under `test/scenarios/`, not OFCS.
