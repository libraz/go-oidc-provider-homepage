---
title: OFCS conformance status
description: How go-oidc-provider runs against the OpenID Foundation Conformance Suite — the nine plans, the latest results, why every failure fails by design, and what REVIEW means.
pageClass: pg-compliance-ofcs
---

# OFCS conformance status

`go-oidc-provider` is regressed against the [OpenID Foundation Conformance Suite (OFCS)][ofcs]. The harness lives in [`conformance/`][harness] in the source repo and scaffolds nine OFCS plans; the published baseline below is the v1.0.0 release snapshot run end-to-end against a `cmd/op-demo` instance.

[ofcs]: https://gitlab.com/openid/conformance-suite
[harness]: https://github.com/libraz/go-oidc-provider/tree/main/conformance

::: warning Personal project, not certified
This is a personal project maintained by an individual developer. No OpenID Foundation membership fee is paid and **no formal OIDC certification** is held. The numbers on this page are reproducible snapshots from the plan set shown below. They are not a substitute for a paid OpenID Foundation certification and should not be cited as one.
:::

<svg role="img" aria-labelledby="ofcs-snapshot-title" viewBox="0 0 780 350" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="ofcs-snapshot-title">How to read the OFCS snapshot: nine plans in four spec families run against op-demo, and every module lands in exactly one of five outcomes — PASSED, REVIEW, SKIPPED, no verdict, or FAILED.</title>
  <text class="ofcs-cap" x="126" y="22" text-anchor="middle">TEST PLANS (9)</text>
  <text class="ofcs-cap" x="656" y="22" text-anchor="middle">OUTCOME PER MODULE</text>

  <rect class="ofcs-box" x="28" y="36" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="62" text-anchor="middle">OIDC Core 1.0</text>
  <text class="ofcs-sub" x="126" y="80" text-anchor="middle">6 plans</text>
  <rect class="ofcs-box" x="28" y="112" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="138" text-anchor="middle">FAPI 2.0 Baseline</text>
  <text class="ofcs-sub" x="126" y="156" text-anchor="middle">1 plan</text>
  <rect class="ofcs-box" x="28" y="188" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="214" text-anchor="middle">FAPI 2.0 Message Signing</text>
  <text class="ofcs-sub" x="126" y="232" text-anchor="middle">1 plan</text>
  <rect class="ofcs-box" x="28" y="264" width="196" height="60" rx="10"/>
  <text class="ofcs-text" x="126" y="290" text-anchor="middle">FAPI-CIBA</text>
  <text class="ofcs-sub" x="126" y="308" text-anchor="middle">1 plan</text>

  <rect class="ofcs-main" x="310" y="136" width="170" height="88" rx="10"/>
  <text class="ofcs-text" x="395" y="172" text-anchor="middle">cmd/op-demo</text>
  <text class="ofcs-sub" x="395" y="194" text-anchor="middle">the OP under test</text>

  <rect class="ofcs-box" x="560" y="42" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-pass" x="578" y="58" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="69">PASSED</text>
  <rect class="ofcs-box" x="560" y="100" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-review" x="578" y="116" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="127">REVIEW</text>
  <rect class="ofcs-box" x="560" y="158" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-skip" x="578" y="174" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="185">SKIPPED</text>
  <rect class="ofcs-box" x="560" y="216" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-noverdict" x="578" y="232" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="243">No verdict</text>
  <rect class="ofcs-box" x="560" y="274" width="192" height="44" rx="8"/>
  <rect class="ofcs-sw ofcs-sw-fail" x="578" y="290" width="12" height="12" rx="3"/>
  <text class="ofcs-text" x="602" y="301">FAILED</text>

  <path class="ofcs-flow" d="M224 66 C264 66 272 152 306 152"/>
  <path class="ofcs-flow" d="M224 142 C264 142 272 168 306 168"/>
  <path class="ofcs-flow" d="M224 218 C264 218 272 192 306 192"/>
  <path class="ofcs-flow" d="M224 294 C264 294 272 208 306 208"/>

  <path class="ofcs-flow" d="M480 180 C514 180 522 64 556 64"/>
  <path class="ofcs-flow" d="M480 180 C514 180 522 122 556 122"/>
  <path class="ofcs-flow" d="M480 180 H556"/>
  <path class="ofcs-flow" d="M480 180 C514 180 522 238 556 238"/>
  <path class="ofcs-flow" d="M480 180 C514 180 522 296 556 296"/>
  <path class="ofcs-flow" d="M548 60 L557 64 L548 68"/>
  <path class="ofcs-flow" d="M548 118 L557 122 L548 126"/>
  <path class="ofcs-flow" d="M548 176 L557 180 L548 184"/>
  <path class="ofcs-flow" d="M548 234 L557 238 L548 242"/>
  <path class="ofcs-flow" d="M548 292 L557 296 L548 300"/>
</svg>

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

## Latest baseline

<div class="ofcs-summary">
  <div class="ofcs-headline">
    <b>209 of 271</b>
    <span>modules PASSED across nine plans — 77.1% of the run</span>
  </div>
  <div class="ofcs-track">
    <div class="ofcs-stack" role="img" aria-label="271 modules: 209 PASSED, 39 REVIEW, 15 SKIPPED, 2 no verdict, 6 FAILED">
      <i class="pass" style="flex:209"></i>
      <i class="review" style="flex:39"></i>
      <i class="skip" style="flex:15"></i>
      <i class="noverdict" style="flex:2"></i>
      <i class="fail" style="flex:6"></i>
    </div>
  </div>
  <ul class="ofcs-legend">
    <li><span class="ofcs-dot pass"></span>PASSED<b>209</b><em>77.1%</em></li>
    <li><span class="ofcs-dot review"></span>REVIEW<b>39</b><em>14.4%</em></li>
    <li><span class="ofcs-dot skip"></span>SKIPPED<b>15</b><em>5.5%</em></li>
    <li><span class="ofcs-dot noverdict"></span>No verdict<b>2</b><em>0.7%</em></li>
    <li><span class="ofcs-dot fail"></span>FAILED<b>6</b><em>2.2%</em></li>
    <li><span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>WARNING<b>0</b><em>0.0%</em></li>
  </ul>
  <p class="ofcs-note">Every FAILED and no-verdict module is a reviewed release exclusion — <a href="#why-six-modules-failed">three causes, none of them an unresolved defect</a>.</p>
  <div class="ofcs-meta">
    <span><i>Captured</i>2026-07-26T23:22:11Z</span>
    <span><i>Repository SHA</i><a href="https://github.com/libraz/go-oidc-provider/commit/3ccc6bc7777a070ebd6485016e4574831dc983b7">3ccc6bc</a></span>
    <span><i>OFCS image</i>release-v5.2.1</span>
  </div>
</div>

::: info Snapshot status
The bars are the raw outcome of all nine plans. The matching timestamped JSON is under `conformance/baselines/`. `make conformance-release-verify` accepted this release snapshot with zero blockers: every raw failure and no-verdict module has a reviewed, expiry-bound entry in `conformance/release-exclusions.json`. That gate result is not an OIDC certification.
:::

### Why six modules FAILED

Every failing and no-verdict module traces back to one of three causes. Two are standing design decisions that will not change in the 1.x line; the third is a limit of driving the suite headlessly. None of them is an unresolved defect, and each one is listed with an owner and an expiry date in `conformance/release-exclusions.json`.

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
      <p>The OP advertises <code>backchannel_logout_session_supported: false</code> and logs out by subject rather than by <code>sid</code>. That metadata is optional in the spec, but the certification module requires <code>true</code> unconditionally, and the rest of the plan aborts on the same assertion. Session-scoped <code>sid</code> logout is an opt-in profile planned for a later minor; subject-only logout is the fail-secure default. <a href="/use-cases/back-channel-logout">Back-channel logout</a></p>
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

Bar length is the plan's module count on one shared scale, so a one-module plan cannot read as heavily as a seventy-one-module one. Outcomes with a count of zero are left out of the row.

<div class="ofcs-plans">
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-basic-certification-test-plan <span class="ofcs-plan-total">· 35 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>29</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>4</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:49.3%">
        <i class="pass" style="flex:29"></i>
        <i class="review" style="flex:4"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-config-certification-test-plan <span class="ofcs-plan-total">· 1 module</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot fail"></span><b>1</b> FAILED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:1.4%">
        <i class="fail" style="flex:1"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-dynamic-certification-test-plan <span class="ofcs-plan-total">· 23 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>7</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>6</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>5</b> SKIPPED</span>
        <span><span class="ofcs-dot noverdict"></span><b>2</b> no verdict</span>
        <span><span class="ofcs-dot fail"></span><b>3</b> FAILED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:32.4%">
        <i class="pass" style="flex:7"></i>
        <i class="review" style="flex:6"></i>
        <i class="skip" style="flex:5"></i>
        <i class="noverdict" style="flex:2"></i>
        <i class="fail" style="flex:3"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-formpost-basic-certification-test-plan <span class="ofcs-plan-total">· 35 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>30</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>3</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:49.3%">
        <i class="pass" style="flex:30"></i>
        <i class="review" style="flex:3"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-rp-initiated-logout-certification-test-plan <span class="ofcs-plan-total">· 11 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>3</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>8</b> REVIEW</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:15.5%">
        <i class="pass" style="flex:3"></i>
        <i class="review" style="flex:8"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">oidcc-backchannel-rp-initiated-logout-certification-test-plan <span class="ofcs-plan-total">· 2 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot fail"></span><b>2</b> FAILED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:2.8%">
        <i class="fail" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-security-profile-id2-test-plan <span class="ofcs-plan-total">· 58 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>48</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>1</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:81.7%">
        <i class="pass" style="flex:48"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:1"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi2-message-signing-id1-test-plan <span class="ofcs-plan-total">· 71 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>60</b> PASSED</span>
        <span><span class="ofcs-dot review"></span><b>9</b> REVIEW</span>
        <span><span class="ofcs-dot skip"></span><b>2</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:100%">
        <i class="pass" style="flex:60"></i>
        <i class="review" style="flex:9"></i>
        <i class="skip" style="flex:2"></i>
      </div>
    </div>
  </div>
  <div class="ofcs-plan">
    <div class="ofcs-plan-head">
      <span class="ofcs-plan-name">fapi-ciba-id1-test-plan <span class="ofcs-plan-total">· 35 modules</span></span>
      <span class="ofcs-plan-counts">
        <span><span class="ofcs-dot pass"></span><b>32</b> PASSED</span>
        <span><span class="ofcs-dot skip"></span><b>3</b> SKIPPED</span>
      </span>
    </div>
    <div class="ofcs-track">
      <div class="ofcs-stack" style="width:49.3%">
        <i class="pass" style="flex:32"></i>
        <i class="skip" style="flex:3"></i>
      </div>
    </div>
  </div>
</div>

::: details The same snapshot as a table
| Plan                                       | PASSED | REVIEW | SKIPPED | WARNING | FAILED | No verdict | Total |
|--------------------------------------------|-------:|-------:|--------:|--------:|-------:|-----------:|------:|
| `oidcc-basic-certification-test-plan`      |     29 |      4 |       2 |       0 |       0 |          0 |    35 |
| `oidcc-config-certification-test-plan`     |      0 |      0 |       0 |       0 |  **1** |          0 |     1 |
| `oidcc-dynamic-certification-test-plan`    |      7 |      6 |       5 |       0 |  **3** |          2 |    23 |
| `oidcc-formpost-basic-certification-test-plan` | 30 |      3 |       2 |       0 |       0 |          0 |    35 |
| `oidcc-rp-initiated-logout-certification-test-plan` | 3 | 8 | 0 | 0 | 0 | 0 | 11 |
| `oidcc-backchannel-rp-initiated-logout-certification-test-plan` | 0 | 0 | 0 | 0 | **2** | 0 | 2 |
| `fapi2-security-profile-id2-test-plan`     |     48 |      9 |       1 |       0 |       0 |          0 |    58 |
| `fapi2-message-signing-id1-test-plan`      |     60 |      9 |       2 |       0 |       0 |          0 |    71 |
| `fapi-ciba-id1-test-plan`                  |     32 |      0 |       3 |       0 |       0 |          0 |    35 |
| **Total**                                  | **209**| **39** |  **15** |   **0** |  **6** |      **2** | **271** |
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
| Refresh token rotation + reuse detection | enabled by default | [/concepts/refresh-tokens](/concepts/refresh-tokens) |

### `fapi2-message-signing-id1-test-plan` — FAPI 2.0 Message Signing

Message Signing layers signed authorization responses on top of Baseline. Everything the Baseline plan asserts also runs here — switch the profile constant and JARM activates automatically.

| What it tests | Library option to enable | Doc page |
|---|---|---|
| Everything from FAPI 2.0 Baseline (above) | `op.WithProfile(profile.FAPI2MessageSigning)` | (as above) |
| Signed authorization response (JARM) | profile implies `feature.JARM` | [/concepts/fapi](/concepts/fapi) (JARM section) |
| Signed ID Token in token response | profile-enforced | [/concepts/tokens](/concepts/tokens) |
| Request object signing (`PS256` / `ES256`) | profile-enforced | [/concepts/fapi](/concepts/fapi) |

### `fapi-ciba-id1-test-plan` — FAPI-CIBA (Client-Initiated Backchannel Authentication)

The CIBA plan exercises the OpenID Connect Client-Initiated Backchannel Authentication grant: an authentication request initiated by the client, completed asynchronously on the user's authentication device (push notification, IVR, etc.), and consumed back via a polling token request. The OP runs in poll mode, FAPI-CIBA inherits FAPI 1.0's hardcoded `tls_client_certificate_bound_access_tokens` requirement so mTLS sender constraint is mandatory.

| What it tests | Library option to enable | Doc page |
|---|---|---|
| `/bc-authorize` endpoint + `auth_req_id` | `op.WithCIBA(op.WithCIBAHintResolver(...))` | [/use-cases/ciba](/use-cases/ciba) |
| Hint resolution (`login_hint` / `id_token_hint` / `login_hint_token`) | embedder-supplied `HintResolver` | [/use-cases/ciba](/use-cases/ciba) |
| Polling discipline (`authorization_pending` / `slow_down`) | enabled by default; `op.WithCIBAPollInterval(...)` overrides advertised interval | [/use-cases/ciba](/use-cases/ciba) |
| Poll-abuse lockout cap | default `5` strikes; `op.WithCIBAMaxPollViolations(n)` raises or lowers the cap | [/use-cases/ciba](/use-cases/ciba) |
| `tls_client_certificate_bound_access_tokens` (FAPI-CIBA mandate) | `op.WithProfile(profile.FAPICIBA)` implies `feature.MTLS` | [/concepts/mtls](/concepts/mtls) |
| Signed `request` object on `/bc-authorize` | `op.WithFeature(feature.JAR)` (auto under FAPI-CIBA) | [/concepts/fapi](/concepts/fapi) |
| Bound `request_object` `iat` and `exp` claims (FAPI-CIBA §5.2.2) | profile-enforced | [/concepts/fapi](/concepts/fapi) |

### How REVIEW, SKIPPED, WARNING, and FAILED categorize

- <span class="ofcs-dot review"></span>**REVIEW** — the test ran, but a human reviewer must verify visual or out-of-band behaviour the harness cannot capture honestly (consent UI strings, error page screenshots, certificate chain confirmation). Not a failure.
- <span class="ofcs-dot skip"></span>**SKIPPED** — the test depends on a feature this OP does not advertise in discovery or per-client metadata. For example, the `RS256` negative tests skip because the FAPI client metadata declares `PS256` as its signing alg, putting `RS256` out of scope for that probe. Not a failure.
- <span class="ofcs-dot" style="background:var(--vp-c-divider)"></span>**WARNING** — OFCS records this as a non-failed result value: the test reached a terminal PASS on its main assertions but logged an advisory the operator may want to address. The current snapshot has **0 warnings**.
- <span class="ofcs-dot fail"></span>**FAILED** — a module did not reach the suite's expected result. In the v1.0.0 snapshot, six failures are reviewed release exclusions: four arise from the permanent ES256-only signing policy and two from the deliberately subject-scoped back-channel logout metadata. The release verifier fails unless each exception is explicitly listed and unexpired.
- <span class="ofcs-dot noverdict"></span>**No verdict** — the harness could not produce a terminal result. The two current modules require an in-process signing-key rotation or wait for an RS256 request object that the ES256-only OP correctly refuses. Both are reviewed release exclusions.

### How to reproduce the conformance run yourself

1. Stand up an OP with the relevant profile wired in — `op.WithProfile(profile.FAPI2Baseline)` for the security profile, `op.WithProfile(profile.FAPI2MessageSigning)` for message signing, `op.WithProfile(profile.FAPICIBA)` plus the CIBA options for FAPI-CIBA, or no `WithProfile` for the OIDC Core plan.
2. Register the plan against an OFCS deployment. The conformance suite is operated by the OpenID Foundation; the source repo's `conformance/` directory contains plan templates and a pinned Docker image that brings up a local copy.
3. Drive the plan. The harness pokes `/authorize`, `/par`, `/token`, `/userinfo`, `/jwks`, and the rest of the discovered endpoints through every required code path, then writes a JSON snapshot you can diff against the recorded baseline.

The detailed runbook (`make` targets, the JSON snapshot layout, the diff gate) is in [Reproducing the baseline yourself](#reproducing-the-baseline-yourself) below.

## REVIEW vs FAILED — the distinction

OFCS mainly reports `PASSED`, `FAILED`, `REVIEW`, and `SKIPPED`; the harness also preserves `WARNING` when OFCS emits an advisory result. **REVIEW does not mean a test failed.** It means the test wants a human operator to confirm something the automation cannot — for example, "did the OP show a login screen here?" The test runs, takes screenshots, then sits in a `WAITING` state until someone in the OFCS UI clicks "reviewed". Our headless runner records `REVIEW` when the test reached that state without erroring.

::: details Why we don't auto-pass REVIEW modules
The conformance suite gates these modules on human judgment by design. A `cmd/op-demo` running headless can't honestly upload a screenshot of "this is what my user saw"; turning the gate off would lie about what was actually checked. The harness records `REVIEW` as-is, on the understanding that paid certification would require sitting in front of the UI to clear them.
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
| `oidcc-request-uri-signed-rs256` | `oidcc-dynamic` | The module pushes an `RS256`-signed request object and waits for a successful authorization response. The ES256-only OP refuses before redirecting — the correct behaviour — so no callback ever arrives and the suite records no result either way. |

## Modules currently in REVIEW

### `oidcc-basic` plan (4)

| Module | What it gates |
|---|---|
| `oidcc-ensure-registered-redirect-uri` | Manual confirmation that the OP refused an unregistered `redirect_uri` |
| `oidcc-max-age-1` | Manual confirmation that `max_age=1` re-prompted the user |
| `oidcc-prompt-login` | Manual confirmation that `prompt=login` re-prompted |
| `oidcc-response-type-missing` | Manual confirmation of the first-party error page for a request without `response_type` |

### FAPI 2.0 plans (9 each, same set)

These all gate on a screenshot upload of the OP's error page or a manual "is the user actually re-prompted" judgment. They run cleanly headless but stay `REVIEW` until human sign-off (the same nine names appear on both `fapi2-security-profile-id2` and `fapi2-message-signing-id1`, totalling 18 across the two plans):

- `fapi2-…-ensure-different-nonce-inside-and-outside-request-object`
- `fapi2-…-ensure-different-state-inside-and-outside-request-object`
- `fapi2-…-ensure-request-object-with-long-nonce`
- `fapi2-…-ensure-request-object-with-long-state`
- `fapi2-…-ensure-unsigned-authorization-request-without-using-par-fails`
- `fapi2-…-par-attempt-reuse-request_uri`
- `fapi2-…-par-attempt-to-use-expired-request_uri`
- `fapi2-…-par-attempt-to-use-request_uri-for-different-client`
- `fapi2-…-state-only-outside-request-object-not-used`

The OP returns the right HTTP error in every case (the negative tests pass their internal assertions); OFCS just wants a human to inspect the rendered error UI.

## Modules currently in WARNING

None in the current snapshot. The previous `fapi-ciba-id1-refresh-token` advisory is now a plain `PASSED` module.

## Modules currently SKIPPED — and why

| Module | Reason |
|---|---|
| `fapi2-…-ensure-signed-client-assertion-with-RS256-fails` (×2) | The FAPI client used in the plan registers `token_endpoint_auth_signing_alg=PS256`, so OFCS skips the per-client `RS256` negative test on both fapi2 plans. |
| `fapi2-message-signing-…-ensure-signed-request-object-with-RS256-fails` | Same — the FAPI client's `request_object_signing_alg=PS256` makes the `RS256` negative test inapplicable. |
| `fapi-ciba-id1-ensure-request-object-signature-algorithm-is-RS256-fails` | The FAPI-CIBA client registers `request_object_signing_alg=PS256`. |
| `fapi-ciba-id1-ensure-client-assertion-signature-algorithm-in-backchannel-authorization-request-is-RS256-fails` | Same — `token_endpoint_auth_signing_alg=PS256` on the CIBA client. |
| `fapi-ciba-id1-ensure-client-assertion-signature-algorithm-in-token-endpoint-request-is-RS256-fails` | Same. |
| `oidcc-ensure-request-object-with-redirect-uri` | The `oidcc-basic` plan does not enable JAR; the OP omits `request_object_signing_alg_values_supported` from discovery and OFCS skips. |
| `oidcc-unsigned-request-object-supported-correctly-or-rejected-as-unsupported` | Same — JAR off, no `request` parameter, OFCS skips. |

::: tip "SKIPPED" is intentional, not "didn't run"
OFCS's skip decision is a function of what discovery and per-client metadata advertise. The FAPI clients in the plan declare `PS256` as their token-endpoint-auth and request-object signing alg, so OFCS's "`RS256` should fail" probes are not applicable and the suite marks them skipped rather than running them and recording a pass.
:::

## Reproducing the baseline yourself

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
make conformance-up
make conformance-baseline LABEL=local-check
ls conformance/baselines/   # JSON snapshot lands here
```

The harness:

1. Generates self-signed RSA-2048 certs (`scripts/conformance.sh certs`).
2. Brings up the OFCS Docker stack at `https://localhost:8443`.
3. Builds and runs `cmd/op-demo` at `https://127.0.0.1:9443`.
4. Seeds the OFCS plans via the REST API. The harness scaffolds nine plans; the latest status table above records all nine.
5. Records pass/fail per module to a deterministic JSON file.

`make conformance-baseline-diff` exits non-zero on any module that **lost** `PASSED` between two snapshots — that is the regression gate the project uses pre-merge for security-relevant changes.

## What FAPI 2.0 means in this codebase

`op.WithProfile(profile.FAPI2Baseline)` activates the configuration the two `fapi2-*` plans are built around:

- `feature.PAR` (auto-enabled by `FAPI2Baseline`) — `/par` becomes routable; `request_uri` accepted at `/authorize`
- `feature.JAR` (auto-enabled by `FAPI2Baseline`) — `request` / `request_uri` validated as signed JWTs
- `feature.JARM` (additionally auto-enabled by `FAPI2MessageSigning`) — authorization responses signed as JWTs
- Sender-constrained access tokens — the profile imposes a DPoP-or-mTLS requirement. If the embedder explicitly enables `feature.MTLS` (`cnf.x5t#S256`), that satisfies the requirement and suppresses the DPoP default. Otherwise `op.New` selects `feature.DPoP` (`cnf.jkt`) as the canonical default, so a plain `op.WithProfile(profile.FAPI2Baseline)` still boots with sender-constrained access tokens. Discovery advertises `dpop_signing_alg_values_supported: ES256, EdDSA, PS256` when DPoP is active.
- JOSE alg allow-list locked to `RS256 / PS256 / ES256 / EdDSA` codebase-wide; `HS*` and `none` are **structurally** unreachable (see `internal/jose/alg.go`)
- `token_endpoint_auth_methods_supported` intersected with the FAPI production path (`private_key_jwt`)
- `redirect_uri` exact-string match enforced
- per-client `RequestObjectSigningAlg` / `TokenEndpointAuthSigningAlg` narrowing pins each FAPI client to `PS256` (or `ES256` / `EdDSA`); the discovery doc still advertises the codebase-wide list

If you set conflicting options after `WithProfile`, `op.New(...)` returns a build-time error rather than letting a partial-FAPI configuration escape into production.

## Where the harness lives

| Path | What it is |
|---|---|
| `conformance/README.md` | Operator runbook |
| `conformance/plans/*.json` | Plan templates (server / client / resource blocks) |
| `conformance/docker-compose.yml` | OFCS image pin (`release-v5.2.1`) + JKS truststore wiring |
| `scripts/conformance.sh` | `certs` / `ofcs-up` / `op-up` / `seed-plans` / `drive` / `batch` |
| `tools/conformance/ofcs.py` | REST client + headless drive script |
| `conformance/baselines/*.json` | Captured snapshots (gitignored — environment-specific) |

## Caveats worth naming

- **Plan suite version.** OFCS is pinned to `release-v5.2.1`. Tests added or renamed in newer OFCS releases are not covered until the pin is bumped.
- **Headless drive.** The drive script reverse-engineers the OFCS REST surface; OFCS does not document it. Behaviour is confirmed against v5.2.1 only.
- **No real RP cert.** The mTLS plan slots use generated self-signed certs at `conformance/certs/` so the plan can be instantiated. No real CA chain is exercised.
- **Single OP instance.** Cross-instance behaviour (e.g. token introspection across two OPs sharing a store) is exercised by `test/scenarios`, not OFCS.

The conformance harness sits next to an in-process Spec Scenario Suite under `test/scenarios/`. The two suites cover different layers — OFCS runs end-to-end against a live OP via HTTP, the scenario suite drives the same protocol invariants in-process — and both must be passing before security-relevant changes merge.
