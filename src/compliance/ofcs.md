---
title: OFCS conformance status
description: How go-oidc-provider runs against the OpenID Foundation Conformance Suite — the nine plans, the latest results, why every failure fails by design, and what REVIEW means.
pageClass: pg-compliance-ofcs
---

# OFCS conformance status

`go-oidc-provider` is regressed against the [OpenID Foundation Conformance Suite (OFCS)][ofcs]. The harness lives in [`conformance/`][harness] in the source repo and scaffolds nine OFCS plans; the baseline below is the run captured on the v1.4.0 release candidate, commit [`6b37232`](https://github.com/libraz/go-oidc-provider/commit/6b3723292cb6763faf2aff35be9acbc3117888d8), executed end-to-end against a `cmd/op-demo` instance. The commits between that run and the `v1.4.0` tag change only tests, module pins and the conformance image tag.

[ofcs]: https://gitlab.com/openid/conformance-suite
[harness]: https://github.com/libraz/go-oidc-provider/tree/main/conformance

::: warning Personal project, not certified
This is a personal project maintained by an individual developer. No OpenID Foundation membership fee is paid and **no formal OIDC certification** is held. The numbers on this page are reproducible snapshots from the plan set shown below. They are not a substitute for a paid OpenID Foundation certification and should not be cited as one.
:::

<figure class="fig">
  <div class="fig-head">Nine plans in, one outcome per module out</div>
  <svg class="fig-svg" role="img" aria-labelledby="ofcs-shape-title" viewBox="0 0 960 408" xmlns="http://www.w3.org/2000/svg">
    <title id="ofcs-shape-title">Nine conformance test plans across four specification families are run against the demo OP. Every module in every plan lands in exactly one of five outcomes: passed, review, skipped, no verdict, or failed.</title>
    <text class="fg-lbl" x="32" y="40">test plans — nine of them</text>
    <text class="fg-lbl" x="640" y="40">outcome per module</text>
    <!-- plans -->
    <rect class="fg-box" x="32" y="96" width="288" height="256" rx="8"/>
    <text class="fg-t2" x="48" y="124">OIDC Core 1.0</text>
    <text class="fg-s" x="48" y="148">6 plans</text>
    <line class="fg-rule" x1="48" y1="160" x2="304" y2="160"/>
    <text class="fg-t2" x="48" y="188">FAPI 2.0 Baseline</text>
    <text class="fg-s" x="48" y="212">1 plan</text>
    <line class="fg-rule" x1="48" y1="224" x2="304" y2="224"/>
    <text class="fg-t2" x="48" y="252">FAPI 2.0 Message Signing</text>
    <text class="fg-s" x="48" y="276">1 plan</text>
    <line class="fg-rule" x1="48" y1="288" x2="304" y2="288"/>
    <text class="fg-t2" x="48" y="316">FAPI-CIBA</text>
    <text class="fg-s" x="48" y="340">1 plan</text>
    <path class="fg-edge fg-edge--accent" d="M320,224 H360" marker-end="url(#fg-ac)"/>
    <!-- op under test -->
    <rect class="fg-box fg-box--accent" x="360" y="188" width="240" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="376" y="216">cmd/op-demo</text>
    <text class="fg-s" x="376" y="240">the OP under test</text>
    <path class="fg-edge fg-edge--accent" d="M600,224 H640" marker-end="url(#fg-ac)"/>
    <!-- outcomes -->
    <rect class="fg-box" x="640" y="64" width="288" height="320" rx="8"/>
    <rect class="fg-fill--ok" x="656" y="80" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="92">PASSED</text>
    <text class="fg-s" x="680" y="116">every condition was met</text>
    <line class="fg-rule" x1="656" y1="128" x2="912" y2="128"/>
    <rect class="fg-fill--warn" x="656" y="144" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="156">REVIEW</text>
    <text class="fg-s" x="680" y="180">the suite asks a human</text>
    <line class="fg-rule" x1="656" y1="192" x2="912" y2="192"/>
    <rect class="fg-fill--muted" x="656" y="208" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="220">SKIPPED</text>
    <text class="fg-s" x="680" y="244">not applicable here</text>
    <line class="fg-rule" x1="656" y1="256" x2="912" y2="256"/>
    <rect class="fg-dot" x="656" y="272" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="284">No verdict</text>
    <text class="fg-s" x="680" y="308">it ran and returned nothing</text>
    <line class="fg-rule" x1="656" y1="320" x2="912" y2="320"/>
    <rect class="fg-fill--danger" x="656" y="336" width="12" height="12" rx="3"/>
    <text class="fg-t2" x="680" y="348">FAILED</text>
    <text class="fg-s" x="680" y="372">a condition was not met</text>
  </svg>
  <figcaption class="fig-note">Only the last row is a defect. The middle three are the suite declining to answer — because the module does not apply to this profile, or because the verdict is one a person has to make.</figcaption>
</figure>

## What this snapshot exercises

| Plan | What it covers | Profile |
|---|---|---|
| `oidcc-basic-certification-test-plan` | Authorization Code + PKCE, ID Token, UserInfo, refresh, discovery | OIDC Core 1.0 |
| `oidcc-config-certification-test-plan` | The discovery document and the shape of the published JWKS | OIDC Core 1.0 — Discovery |
| `oidcc-dynamic-certification-test-plan` | Dynamic client registration, then the code flow against the client it registered | OIDC Core 1.0 — Dynamic Registration |
| `oidcc-formpost-basic-certification-test-plan` | The basic plan again with `response_mode=form_post` | OIDC Core 1.0 — `form_post` |
| `oidcc-rp-initiated-logout-certification-test-plan` | `/end_session`, `id_token_hint`, `post_logout_redirect_uri` | RP-Initiated Logout 1.0 |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | RP-initiated logout plus `logout_token` delivery to the registered back-channel URI | Back-Channel Logout 1.0 |
| `fapi2-security-profile-id2-test-plan` | + PAR, sender-constrained access tokens (DPoP), strict alg list, `redirect_uri` exact match | FAPI 2.0 Baseline |
| `fapi2-message-signing-id1-test-plan` | + JAR (signed authorization request), JARM (signed authorization response) | FAPI 2.0 Message Signing |
| `fapi-ciba-id1-test-plan` | Client-Initiated Backchannel Authentication (poll mode), mTLS-bound tokens | FAPI-CIBA |

The `fapi2-security-profile-id2` and `fapi2-message-signing-id1` plans are the Implementer's Draft-era plans bundled with this harness. Their results describe those plans and the corresponding library settings; they do not establish conformance to the current FAPI 2.0 Security Profile Final. In particular, Final §5.3.2.1(9) limits refresh-token rotation to extraordinary circumstances, while the library and these plans exercise rotation by default.

## Latest baseline

<div class="ofcs-summary">
  <div class="ofcs-headline">
    <b>210 of 270</b>
    <span>modules PASSED across nine plans — 77.8% of the run</span>
  </div>
  <div class="ofcs-scale"><span>0</span><span>270 modules — every module in the run</span></div>
  <div class="ofcs-track">
    <div class="ofcs-stack" role="img" aria-label="270 modules: 210 PASSED, 38 REVIEW, 14 SKIPPED, 2 no verdict, 6 FAILED">
      <i class="pass" style="flex:210"></i>
      <i class="review" style="flex:38"></i>
      <i class="skip" style="flex:14"></i>
      <i class="noverdict" style="flex:2"></i>
      <i class="fail" style="flex:6"></i>
    </div>
  </div>
  <ul class="ofcs-legend">
    <li><span class="ofcs-dot pass"></span>PASSED<b>210</b><em>77.8%</em></li>
    <li><span class="ofcs-dot review"></span>REVIEW<b>38</b><em>14.1%</em></li>
    <li><span class="ofcs-dot skip"></span>SKIPPED<b>14</b><em>5.2%</em></li>
    <li><span class="ofcs-dot noverdict"></span>No verdict<b>2</b><em>0.7%</em></li>
    <li><span class="ofcs-dot fail"></span>FAILED<b>6</b><em>2.2%</em></li>
    <li><span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>WARNING<b>0</b><em>0.0%</em></li>
  </ul>
  <p class="ofcs-note">Every FAILED and no-verdict module is a reviewed release exclusion — <a href="#why-six-modules-failed">three causes, none of them an unresolved defect</a>.</p>
  <div class="ofcs-meta">
    <span><i>Captured</i>2026-10-22T16:26:08Z</span>
    <span><i>Repository SHA</i><a href="https://github.com/libraz/go-oidc-provider/commit/6b3723292cb6763faf2aff35be9acbc3117888d8">6b37232</a></span>
    <span><i>OFCS release</i>release-v5.3.3 (run label)</span>
  </div>
</div>

::: info Snapshot status
The bars are the raw outcome of all nine plans, run against OFCS `release-v5.3.3`. The run label records that suite release; the JSON artifact, a local gitignored file under `conformance/baselines/`, stores neither the image tag nor the digest. `make conformance-release-verify` accepted the run with zero blockers: every raw failure has a reviewed, expiry-bound entry in `conformance/release-exclusions.json`, every no-verdict module has an entry with evidence, and every REVIEW or SKIPPED module falls under a reviewed rule. That gate result is not an OIDC certification.
:::

### Why six modules FAILED

Every failing and no-verdict module traces back to one of three causes. Two are standing design decisions; the third is a limit of driving the suite headlessly. None of them is an unresolved defect, and each one is listed with an owner and an expiry date in `conformance/release-exclusions.json`.

<div class="ofcs-causes">
  <div class="ofcs-cause">
    <div class="ofcs-cause-main">
      <strong>ES256-only signing — permanent, not a staged rollout</strong>
      <p>Discovery advertises <code>ES256</code> and nothing else, so the modules that assert the OIDC Core 1.0 §15.1 <code>RS256</code> requirement fail, and a dynamic registration asking for an <code>RS256</code>-signed ID Token or UserInfo response is refused before it reaches its assertions. Supporting one algorithm removes algorithm negotiation — and the downgrade guard negotiation would need — and FAPI 2.0 forbids <code>RS256</code> outright. <a href="/security/design-judgments">Why the alg list is closed</a></p>
    </div>
    <div class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>4</b> FAILED</span>
      <span><span class="ofcs-dot noverdict"></span><b>1</b> no verdict</span>
    </div>
  </div>
  <div class="ofcs-cause">
    <div class="ofcs-cause-main">
      <strong>Back-channel logout is subject-scoped, not session-scoped</strong>
      <p>The OP advertises <code>backchannel_logout_session_supported: false</code> and logs out by subject rather than by <code>sid</code>. That metadata is optional in the spec, but the certification module requires <code>true</code> unconditionally, and the rest of the plan aborts on the same assertion. Session-scoped <code>sid</code> logout is not currently enabled; subject-only logout is the fail-secure default. <a href="/use-cases/back-channel-logout">Back-channel logout</a></p>
    </div>
    <div class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>2</b> FAILED</span>
    </div>
  </div>
  <div class="ofcs-cause">
    <div class="ofcs-cause-main">
      <strong>A key rotation the harness cannot perform</strong>
      <p><code>oidcc-server-rotate-keys</code> asks a human to rotate the signing keys mid-module and press Start. The library takes its keyset at <code>op.New</code>, so a deployment rotates by constructing a new provider — which would drop the in-memory store the plan's registered client lives in. What the OP serves is unaffected: JWKS publishes every configured key. <a href="/operations/key-rotation">Key rotation</a></p>
    </div>
    <div class="ofcs-plan-counts">
      <span><span class="ofcs-dot noverdict"></span><b>1</b> no verdict</span>
    </div>
  </div>
</div>

### Per-plan breakdown

Each bar is one plan on its own scale: full width is that plan's own module count, spelled out as the fraction at the right of the row. The segments are therefore shares of that plan, never of the run — so a plan's size is read from its numbers, not from its bar length. Outcomes with a count of zero are left out of the row.

<div class="ofcs-plans">
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-basic-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>30</b> / 35 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-basic-certification-test-plan, 35 modules: 30 PASSED, 3 REVIEW, 2 SKIPPED">
        <i class="pass" style="flex:30"></i>
        <i class="review" style="flex:3"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>30</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>3</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-config-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>0</b> / 1 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-config-certification-test-plan, 1 module: 1 FAILED">
        <i class="fail" style="flex:1"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>1</b> FAILED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-dynamic-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>7</b> / 23 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-dynamic-certification-test-plan, 23 modules: 7 PASSED, 6 REVIEW, 5 SKIPPED, 2 no verdict, 3 FAILED">
        <i class="pass" style="flex:7"></i>
        <i class="review" style="flex:6"></i>
        <i class="skip" style="flex:5"></i>
        <i class="noverdict" style="flex:2"></i>
        <i class="fail" style="flex:3"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>7</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>6</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>5</b> SKIPPED</span>
      <span><span class="ofcs-dot noverdict"></span><b>2</b> no verdict</span>
      <span><span class="ofcs-dot fail"></span><b>3</b> FAILED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-formpost-basic-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>30</b> / 35 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-formpost-basic-certification-test-plan, 35 modules: 30 PASSED, 3 REVIEW, 2 SKIPPED">
        <i class="pass" style="flex:30"></i>
        <i class="review" style="flex:3"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>30</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>3</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-rp-initiated-logout-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>3</b> / 11 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-rp-initiated-logout-certification-test-plan, 11 modules: 3 PASSED, 8 REVIEW">
        <i class="pass" style="flex:3"></i>
        <i class="review" style="flex:8"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>3</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>8</b> REVIEW</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-backchannel-rp-initiated-logout-certification-test-plan</span>
      <span class="ofcs-plan-score"><b>0</b> / 2 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="oidcc-backchannel-rp-initiated-logout-certification-test-plan, 2 modules: 2 FAILED">
        <i class="fail" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot fail"></span><b>2</b> FAILED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-security-profile-id2-test-plan</span>
      <span class="ofcs-plan-score"><b>48</b> / 58 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="fapi2-security-profile-id2-test-plan, 58 modules: 48 PASSED, 9 REVIEW, 1 SKIPPED">
        <i class="pass" style="flex:48"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:1"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>48</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>1</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-message-signing-id1-test-plan</span>
      <span class="ofcs-plan-score"><b>60</b> / 71 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="fapi2-message-signing-id1-test-plan, 71 modules: 60 PASSED, 9 REVIEW, 2 SKIPPED">
        <i class="pass" style="flex:60"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>60</b> PASSED</span>
      <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi-ciba-id1-test-plan</span>
      <span class="ofcs-plan-score"><b>32</b> / 34 PASSED</span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" role="img" aria-label="fapi-ciba-id1-test-plan, 34 modules: 32 PASSED, 2 SKIPPED">
        <i class="pass" style="flex:32"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
    <span class="ofcs-plan-counts">
      <span><span class="ofcs-dot pass"></span><b>32</b> PASSED</span>
      <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
    </span>
  </div>
</div>

::: details The same snapshot as a table
| Plan                                       | PASSED | REVIEW | SKIPPED | WARNING | FAILED | No verdict | Total |
|--------------------------------------------|-------:|-------:|--------:|--------:|-------:|-----------:|------:|
| `oidcc-basic-certification-test-plan`      |     30 |      3 |       2 |       0 |       0 |          0 |    35 |
| `oidcc-config-certification-test-plan`     |      0 |      0 |       0 |       0 |  **1** |          0 |     1 |
| `oidcc-dynamic-certification-test-plan`    |      7 |      6 |       5 |       0 |  **3** |          2 |    23 |
| `oidcc-formpost-basic-certification-test-plan` | 30 |      3 |       2 |       0 |       0 |          0 |    35 |
| `oidcc-rp-initiated-logout-certification-test-plan` | 3 | 8 | 0 | 0 | 0 | 0 | 11 |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | 0 | 0 | 0 | 0 | **2** | 0 | 2 |
| `fapi2-security-profile-id2-test-plan`     |     48 |      9 |       1 |       0 |       0 |          0 |    58 |
| `fapi2-message-signing-id1-test-plan`      |     60 |      9 |       2 |       0 |       0 |          0 |    71 |
| `fapi-ciba-id1-test-plan`                  |     32 |      0 |       2 |       0 |       0 |          0 |    34 |
| **Total**                                  | **210**| **38** |  **14** |   **0** |  **6** |      **2** | **270** |
:::

## What each test plan covers

Each OFCS test plan exercises a specific spec profile. The tables below map every plan to the library options that turn on the relevant code paths and to the doc pages where that surface is documented, so embedders can verify their own deployments expose the same configuration the suite asserts against.

### `oidcc-basic-certification-test-plan` — OIDC Core 1.0

| What it tests | Library option to enable | Doc page |
|---|---|---|
| Authorization Code flow + PKCE | enabled by default | [/concepts/authorization-code-pkce](/concepts/authorization-code-pkce) |
| ID Token issuance + claims | enabled by default | [/concepts/tokens](/concepts/tokens) |
| UserInfo endpoint | enabled by default | [/concepts/tokens](/concepts/tokens) |
| Discovery (`/.well-known/openid-configuration`) | enabled by default | [/concepts/discovery](/concepts/discovery) |
| JWKS publication | enabled by default | [/operations/jwks](/operations/jwks) |
| Refresh tokens + rotation | enabled by default; long-lived refresh requires the `offline_access` scope | [/concepts/refresh-tokens](/concepts/refresh-tokens) |
| Standard scopes (`profile`, `email`, `address`, `phone`) | `op.WithScope(...)` once per scope | [/concepts/scopes-and-claims](/concepts/scopes-and-claims) |
| Public / pairwise subjects | `op.WithPairwiseSubject(salt)` for pairwise; per-client `SubjectType` selects which one applies | [/use-cases/pairwise-subject](/use-cases/pairwise-subject) |

### `fapi2-security-profile-id2-test-plan` — FAPI 2.0 Baseline

| What it tests | Library option to enable | Doc page |
|---|---|---|
| PAR (RFC 9126) | `op.WithProfile(profile.FAPI2Baseline)` implies `feature.PAR` | [/concepts/fapi](/concepts/fapi), [/use-cases/fapi2-baseline](/use-cases/fapi2-baseline) |
| JAR (RFC 9101) | profile implies `feature.JAR` | [/concepts/fapi](/concepts/fapi) |
| `S256` PKCE enforcement | profile-enforced | [/concepts/authorization-code-pkce](/concepts/authorization-code-pkce) |
| `iss` in authorization response (RFC 9207) | profile-enforced | [/concepts/issuer](/concepts/issuer) |
| `ES256` for ID Token signing | profile-enforced; OP-issued ID Tokens are never signed with `PS256` or `RS256` | [/concepts/jose-basics](/concepts/jose-basics) |
| Refusal of `RS256` (FAPI), `HS*`, `none` | closed alg type at `internal/jose/alg.go` | [/security/design-judgments](/security/design-judgments) |
| `private_key_jwt` | profile-enforced | [/concepts/client-types](/concepts/client-types) |
| DPoP or mTLS sender constraint | `op.WithFeature(feature.DPoP)` or `op.WithFeature(feature.MTLS)` (at least one is mandatory under FAPI 2.0) | [/concepts/sender-constraint](/concepts/sender-constraint), [/concepts/dpop](/concepts/dpop), [/concepts/mtls](/concepts/mtls) |
| `redirect_uri` exact match | profile-enforced | [/concepts/redirect-uri](/concepts/redirect-uri) |
| Refresh token rotation + reuse detection | enabled by default for this library and exercised by the checked-in Implementer's Draft-era plan; current FAPI Final §5.3.2.1(9) limits rotation to extraordinary circumstances and requires a time-limited retry path when it is used | [/concepts/refresh-tokens](/concepts/refresh-tokens) |

### `fapi2-message-signing-id1-test-plan` — FAPI 2.0 Message Signing

Message Signing layers signed authorization responses on top of Baseline. Everything the Baseline plan asserts also runs here — switch the profile constant and JARM activates automatically.

| What it tests | Library option to enable | Doc page |
|---|---|---|
| Everything from FAPI 2.0 Baseline (above) | `op.WithProfile(profile.FAPI2MessageSigning)` | (as above) |
| Signed authorization response (JARM) | profile implies `feature.JARM` | [/concepts/fapi](/concepts/fapi) (JARM section) |
| Signed ID Token in token response | profile-enforced | [/concepts/tokens](/concepts/tokens) |
| Request object signing (`PS256` / `ES256`) | profile-enforced | [/concepts/fapi](/concepts/fapi) |

### `fapi-ciba-id1-test-plan` — FAPI-CIBA (Client-Initiated Backchannel Authentication)

The CIBA plan exercises the OpenID Connect Client-Initiated Backchannel Authentication grant: an authentication request initiated by the client, completed asynchronously on the user's authentication device (push notification, IVR, etc.), and consumed back via a polling token request. The OP runs in poll mode. The historical FAPI-CIBA-ID1 plan uses mTLS certificate-bound access tokens; the demo explicitly enables `feature.MTLS` to match its `tls_client_certificate_bound_access_tokens` metadata. The library's general `profile.FAPICIBA` preset also permits DPoP and defaults to it when neither binding is chosen, so that preset alone does not reproduce the ID1 plan.

| What it tests | Library option to enable | Doc page |
|---|---|---|
| `/bc-authorize` endpoint + `auth_req_id` | `op.WithCIBA(op.WithCIBAHintResolver(...))` | [/use-cases/ciba](/use-cases/ciba) |
| Hint resolution (`login_hint` / `id_token_hint` / `login_hint_token`) | embedder-supplied `HintResolver` | [/use-cases/ciba](/use-cases/ciba) |
| Polling discipline (`authorization_pending` / `slow_down`) | enabled by default; `op.WithCIBAPollInterval(...)` overrides advertised interval | [/use-cases/ciba](/use-cases/ciba) |
| Poll-abuse lockout cap | default `5` strikes; `op.WithCIBAMaxPollViolations(n)` raises or lowers the cap | [/use-cases/ciba](/use-cases/ciba) |
| Sender-constrained access tokens | `op.WithProfile(profile.FAPICIBA)` permits DPoP or mTLS, defaulting to DPoP; this OFCS demo explicitly enables `feature.MTLS` for the historical ID1 plan | [/concepts/sender-constraint](/concepts/sender-constraint), [/concepts/mtls](/concepts/mtls) |
| Signed `request` object on `/bc-authorize` | `op.WithFeature(feature.JAR)` (auto under FAPI-CIBA) | [/concepts/fapi](/concepts/fapi) |
| Bound `request_object` `iat` and `exp` claims (FAPI-CIBA §5.2.2) | profile-enforced | [/concepts/fapi](/concepts/fapi) |

### How REVIEW, SKIPPED, WARNING, and FAILED categorize

- <span class="ofcs-dot review"></span>**REVIEW** — the test ran, but a person has to confirm something the harness cannot see, such as the error page the OP rendered or whether a login screen appeared again. The suite uploads a screenshot placeholder and waits in `WAITING` until someone marks it reviewed in the OFCS UI; the headless runner records `REVIEW` as-is. Not a failure.
- <span class="ofcs-dot skip"></span>**SKIPPED** — the test depends on something this OP does not advertise in discovery or per-client metadata, so the suite does not run it. For example, the `RS256` negative tests skip because the OP signs with `ES256` only and the FAPI plans register `PS256` clients. Not a failure.
- <span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>**WARNING** — the test reached a terminal PASS but logged an advisory. The current snapshot has **0 warnings**.
- <span class="ofcs-dot fail"></span>**FAILED** — a module did not reach the result the suite expects. In this run, six failures are reviewed release exclusions: four from the permanent ES256-only signing policy and two from the deliberately subject-scoped back-channel logout metadata. The release verifier fails unless each one is listed and unexpired.
- <span class="ofcs-dot noverdict"></span>**No verdict** — the harness could not drive the module to a terminal result. One needs a signing-key rotation in the middle of the module; the other pushes an `RS256`-signed request object, which the OP refuses before redirecting, so the suite waits for a callback that never comes. Both are reviewed release exclusions with evidence from a standalone run.

::: details Why REVIEW modules are not auto-passed
The suite gates these modules on human judgment by design. A headless `cmd/op-demo` cannot honestly upload a screenshot of "this is what my user saw", and turning the gate off would misstate what was checked. The harness keeps `REVIEW` as it is; certification through the OpenID Foundation would have a person clear each one in the UI.
:::

## Modules currently FAILED — and why

Six modules across three plans. Each row is a reviewed, expiry-bound entry in `conformance/release-exclusions.json`; `make conformance-release-verify` fails the release if any of them is missing, unowned, or past its expiry.

| Module | Plan | Why it fails |
|---|---|---|
| `oidcc-discovery-endpoint-verification` | `oidcc-config` | `id_token_signing_alg_values_supported` lists `ES256` only; the module asserts the OIDC Core 1.0 §15.1 `RS256` requirement. |
| `oidcc-discovery-endpoint-verification` | `oidcc-dynamic` | Same assertion, same cause, on the dynamic plan. |
| `oidcc-idtoken-rs256` | `oidcc-dynamic` | Registration requests `id_token_signed_response_alg=RS256`; dynamic client registration answers `invalid_client_metadata`, so the module never reaches its assertions. |
| `oidcc-userinfo-rs256` | `oidcc-dynamic` | Same, for `userinfo_signed_response_alg=RS256`. |
| `oidcc-backchannel-logout-discovery-endpoint-verification` | `oidcc-backchannel-rp-initiated-logout` | The OP advertises `backchannel_logout_session_supported: false`, which the spec permits and this module refuses. |
| `oidcc-backchannel-rp-initiated-logout` | `oidcc-backchannel-rp-initiated-logout` | Cascades from the module above — the plan aborts on that assertion before this one can run. |

## Modules with no verdict — and why

Two modules the harness could not drive to a terminal result. Both are recorded with the evidence from a standalone run against a live suite.

| Module | Plan | Why there is no verdict |
|---|---|---|
| `oidcc-server-rotate-keys` | `oidcc-dynamic` | The module waits for an operator to rotate the signing keys and press Start. The keyset is fixed at `op.New`, and rebuilding the provider mid-plan would drop the in-memory store holding the plan's registered client. The module stays `CONFIGURED` until the runner's idle bound. |
| `oidcc-request-uri-signed-rs256` | `oidcc-dynamic` | The module pushes an `RS256`-signed request object and waits for a successful authorization response. Signing is `ES256` only, so `/auth` refuses with a pre-redirect error page and the suite is left `WAITING` for a callback the OP must not send. This is the same policy as the `oidcc-idtoken-rs256` exclusion, reaching the suite at request time instead of at registration. |

## Modules currently in REVIEW

Thirty-eight modules, all of them cases where the OP refuses or re-prompts and the suite has no callback to assert on, so it asks a person to look at the rendered screen. In each case the refusal itself is pinned by the library's own tests.

| Plan | Modules | Why a person has to look |
|---|---|---|
| `oidcc-basic`, `oidcc-formpost-basic` (3 each) | `oidcc-ensure-registered-redirect-uri` | An unregistered `redirect_uri` must not be redirected to, so the outcome is an error page. |
| | `oidcc-max-age-1`, `oidcc-prompt-login` | Only a person can confirm the login screen appeared again instead of the session being reused. |
| `oidcc-dynamic` (6) | `oidcc-ensure-redirect-uri-in-authorization-request`, `oidcc-redirect-uri-query-added`, `oidcc-redirect-uri-query-mismatch` | Same as the first row: refused without redirecting. |
| | `oidcc-registration-logo-uri`, `oidcc-registration-policy-uri`, `oidcc-registration-tos-uri` | The suite asks a person to confirm the consent screen presents the registered URIs. Whether they render depends on the interaction driver the embedder supplies. |
| `oidcc-rp-initiated-logout` (8) | `oidcc-rp-initiated-logout-*` | Each ends on a screen the OP renders itself — the logout confirmation, or the error page for a bad `id_token_hint` or unregistered `post_logout_redirect_uri` — because a refused logout must not redirect back to the RP. |
| `fapi2-security-profile-id2`, `fapi2-message-signing-id1` (9 each) | the nine modules below | PAR `request_uri` refusals and request-object mismatches are refused before redirecting, leaving an error page to confirm. |

The nine FAPI 2.0 modules (the same names appear in both plans, 18 in total):

- `fapi2-…-ensure-different-nonce-inside-and-outside-request-object`
- `fapi2-…-ensure-different-state-inside-and-outside-request-object`
- `fapi2-…-ensure-request-object-with-long-nonce`
- `fapi2-…-ensure-request-object-with-long-state`
- `fapi2-…-ensure-unsigned-authorization-request-without-using-par-fails`
- `fapi2-…-par-attempt-reuse-request_uri`
- `fapi2-…-par-attempt-to-use-expired-request_uri`
- `fapi2-…-par-attempt-to-use-request_uri-for-different-client`
- `fapi2-…-state-only-outside-request-object-not-used`

## Modules currently SKIPPED — and why

Fourteen modules. The suite decides to skip from what discovery and per-client metadata advertise, so a skip here records a deliberate omission, not a test that failed to run.

| Module | Plan | Reason |
|---|---|---|
| `fapi2-security-profile-id2-ensure-signed-client-assertion-with-RS256-fails` | both `fapi2-*` plans | The OP signs with `ES256` only and the plan's FAPI client registers `token_endpoint_auth_signing_alg=PS256`, so the `RS256` negative probe has nothing to exercise. |
| `fapi2-security-profile-id2-ensure-signed-request-object-with-RS256-fails` | `fapi2-message-signing-id1` | Same, for `request_object_signing_alg=PS256`. (The Message Signing plan reuses the security-profile module names.) |
| `fapi-ciba-id1-ensure-request-object-signature-algorithm-is-RS256-fails` | `fapi-ciba-id1` | The CIBA client registers `request_object_signing_alg=PS256`. |
| `fapi-ciba-id1-ensure-client-assertion-signature-algorithm-in-token-endpoint-request-is-RS256-fails` | `fapi-ciba-id1` | Same, for `token_endpoint_auth_signing_alg=PS256`. |
| `oidcc-ensure-request-object-with-redirect-uri`, `oidcc-unsigned-request-object-supported-correctly-or-rejected-as-unsupported` | `oidcc-basic`, `oidcc-formpost-basic` (both), `oidcc-dynamic` (first only) | Request-object modules of the non-FAPI plans. The suite skips them based on the request-object capabilities discovery advertises, and the OP never accepts `alg=none`. Signed request objects run in the FAPI plans, where JAR is mandatory. |
| `oidcc-request-uri-unsigned` | `oidcc-dynamic` | Same family, for an unsigned object behind `request_uri`. |
| `oidcc-idtoken-unsigned` | `oidcc-dynamic` | Asks for an unsigned ID Token. The OP signs every ID Token and does not advertise `none`. |
| `oidcc-registration-sector-bad`, `oidcc-registration-sector-uri` | `oidcc-dynamic` | `sector_identifier_uri` modules. Pairwise subjects are opt-in (`op.WithPairwiseSubject`) and the demo runs the dynamic plan with public subjects; pairwise is covered by the library's own tests and by [`examples/34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas). |

## Reproducing the baseline yourself

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
make conformance-up
make conformance-baseline LABEL=local-check
ls conformance/baselines/   # JSON snapshot lands here
```

`make conformance-up` generates certificates, starts the OFCS containers at `https://localhost:8443`, builds and starts `cmd/op-demo` at `https://127.0.0.1:9443`, and seeds the nine plans through the OFCS REST API. `make conformance-baseline` then drives every module and records a deterministic JSON file. `make conformance-baseline-diff` exits non-zero on any module that **lost** `PASSED` between two snapshots; that is the regression gate the project uses before merging security-relevant changes.

Which `op.With...` options each plan needs, the plan-to-flag table, and the release gate are in [Reproducing the OFCS run](/compliance/ofcs-reproduce). The baseline-diff cycle is under [Capturing and diffing a baseline](/compliance/ofcs-reproduce#reproduce-baseline).

## What FAPI 2.0 means in this codebase

`op.WithProfile(profile.FAPI2Baseline)` activates the configuration the two `fapi2-*` plans are built around. The full explanation is in [FAPI 2.0](/concepts/fapi); the pieces the plans assert are:

- `feature.PAR` and `feature.JAR`, both auto-enabled by `FAPI2Baseline`: `/oidc/par` becomes routable, `request` / `request_uri` are validated as signed JWTs.
- `feature.JARM`, additionally auto-enabled by `FAPI2MessageSigning`: authorization responses are signed JWTs.
- Sender-constrained access tokens. The profile requires DPoP or mTLS. If the embedder enables `feature.MTLS` (`cnf.x5t#S256`), that satisfies it and the DPoP default is not added. Otherwise `op.New` selects `feature.DPoP` (`cnf.jkt`), so a plain `op.WithProfile(profile.FAPI2Baseline)` still boots with sender-constrained tokens. With DPoP active, discovery advertises `dpop_signing_alg_values_supported: ES256, EdDSA, PS256`.
- A JOSE algorithm allow-list of `RS256 / PS256 / ES256 / EdDSA` across the codebase; `HS*` and `none` are structurally unreachable (see `internal/jose/alg.go`).
- `token_endpoint_auth_methods_supported` narrowed to the FAPI production path (`private_key_jwt`), and `redirect_uri` exact-string match.
- Per-client `RequestObjectSigningAlg` / `TokenEndpointAuthSigningAlg` pin each FAPI client to `PS256` (or `ES256` / `EdDSA`); discovery still advertises the codebase-wide list.

If you set options that conflict with the profile after `WithProfile`, `op.New(...)` returns a build-time error instead of letting a partial-FAPI configuration reach production.

## Where the harness lives

| Path | What it is |
|---|---|
| `conformance/README.md` | Operator runbook |
| `conformance/plans/*.json` | Plan templates (server / client / resource blocks) |
| `conformance/docker-compose.yml` | Current OFCS image pin (`release-v5.3.3`) + JKS truststore wiring |
| `conformance/release-exclusions.json` | Reviewed, expiry-bound exceptions the release gate accepts |
| `scripts/conformance.sh` | `certs` / `ofcs-up` / `op-up` / `seed-plans` / `drive` / `batch` / `baseline` / `baseline-diff` / `release-verify` |
| `tools/conformance/` | REST client, headless drive script, baseline and release-verify logic (Python) |
| `conformance/baselines/*.json` | Captured snapshots (gitignored — environment-specific) |

## Caveats worth naming

- **Plan suite version.** The run behind this page is labelled `ofcs-v5.3.3`, and the current default pin in `docker-compose.yml` is `release-v5.3.3`. The JSON artifact does not record the image tag or digest itself.
- **Headless drive.** The drive script reverse-engineers the OFCS REST surface; OFCS does not document it.
- **No real RP cert.** The mTLS plan slots use generated self-signed certs at `conformance/certs/` so the plan can be instantiated. No real CA chain is exercised.
- **Single OP instance.** Cross-instance behaviour (e.g. token introspection across two OPs sharing a store) is exercised by `test/scenarios`, not OFCS.

The conformance harness sits next to an in-process Spec Scenario Suite under `test/scenarios/`. OFCS runs end-to-end against a live OP over HTTP; the scenario suite drives the same protocol invariants in-process. Both must pass before security-relevant changes merge.
