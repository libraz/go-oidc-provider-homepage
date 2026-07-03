---
title: Architecture overview
description: Where each request goes inside the OP — the package layout, the handler dispatch, and the storage seams.
outline: 2
---

# Architecture overview

`op.New(...)` returns an `http.Handler` backed by an `http.ServeMux`. This page walks through what happens between request arrival and response — the packages involved, the order of validation, and the storage seams the embedder controls.

## Package layout

```
op/                         ← public API surface (this is what you import)
op/profile/                 ← FAPI 2.0 / future profiles
op/feature/                 ← PAR / DPoP / mTLS / introspect / revoke / DCR / JAR
op/grant/                   ← authorization_code, refresh_token, client_credentials
op/store/                   ← Store interface (substores) + contract test suite
op/storeadapter/{inmem,sql,redis,composite}
op/interaction/             ← HTML / JSON driver seam for login UI

internal/                   ← cannot be imported externally (Go visibility)
  authn/                    ← LoginFlow orchestrator, Authenticator runtime
  authorize, parendpoint, tokenendpoint, userinfo,
  introspectendpoint, revokeendpoint, registrationendpoint,
  endsession, backchannel
  jose, jwks, keys          ← signing / verification / key set
  jar, dpop, mtls, pkce, sessions
  cookie, csrf, cors, httpx, redact, log, metrics
  discovery, scoperegistry, timex, i18n
```

The boundary is enforced structurally: external code cannot reach into `internal/`. Every embedder-controlled seam (option, store interface, authenticator, audit subscriber) is in `op/` or one of its subpackages.

## Handler graph

`op.New` constructs a `*http.ServeMux` and mounts handlers on the configured paths (defaults shown):

<div style="display:flex;justify-content:center;margin:1.5rem 0">
<svg role="img" aria-labelledby="hg-en-title" viewBox="0 0 656 492" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:660px;height:auto">
<title id="hg-en-title">op.New returns an http.Handler whose ServeMux dispatches each request path to its internal endpoint handler.</title>
<style>
.hg-box{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hg-op{fill:none;stroke:var(--vp-c-brand-2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hg-line{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.hg-t1{font-family:var(--vp-font-family-mono);fill:var(--vp-c-brand-2);font-size:13px;font-weight:600}
.hg-t2{font-family:var(--vp-font-family-mono);fill:currentColor;font-size:11px}
.hg-t3{font-family:var(--vp-font-family-mono);fill:var(--vp-c-text-3);font-size:10px}
.hg-path{font-family:var(--vp-font-family-mono);fill:currentColor;font-size:12px}
.hg-pkg{font-family:var(--vp-font-family-mono);fill:var(--vp-c-text-3);font-size:10px}
.hg-drv{font-family:var(--vp-font-family-base);fill:var(--vp-c-text-3);font-size:10px}
</style>
<defs><marker id="hg-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>
<rect class="hg-op" x="24" y="217" width="180" height="60" rx="8"/>
<text class="hg-t1" x="114" y="240" text-anchor="middle">op.New</text>
<text class="hg-t2" x="114" y="257" text-anchor="middle">→ http.Handler</text>
<text class="hg-t3" x="114" y="270" text-anchor="middle">ServeMux</text>
<path class="hg-line" d="M204 247 H248"/>
<path class="hg-line" d="M248 37 V457"/>
<path class="hg-line" d="M248 37 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="20" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="35">/.well-known/openid-configuration</text>
<text class="hg-pkg" x="292" y="49">discovery</text>
<path class="hg-line" d="M248 79 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="62" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="77">/jwks</text>
<text class="hg-pkg" x="292" y="91">internal/jwks</text>
<path class="hg-line" d="M248 121 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="104" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="119">/authorize</text>
<text class="hg-pkg" x="292" y="133">internal/authorizeendpoint</text>
<path class="hg-line" d="M248 163 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="146" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="161">/par</text>
<text class="hg-pkg" x="292" y="175">internal/parendpoint</text>
<path class="hg-line" d="M248 205 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="188" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="203">/token</text>
<text class="hg-pkg" x="292" y="217">internal/tokenendpoint</text>
<path class="hg-line" d="M248 247 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="230" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="245">/userinfo</text>
<text class="hg-pkg" x="292" y="259">internal/userinfo</text>
<path class="hg-line" d="M248 289 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="272" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="287">/revoke</text>
<text class="hg-pkg" x="292" y="301">internal/revokeendpoint</text>
<path class="hg-line" d="M248 331 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="314" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="329">/introspect</text>
<text class="hg-pkg" x="292" y="343">internal/introspectendpoint</text>
<path class="hg-line" d="M248 373 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="356" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="371">/end_session</text>
<text class="hg-pkg" x="292" y="385">internal/endsession</text>
<path class="hg-line" d="M248 415 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="398" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="413">/register</text>
<text class="hg-pkg" x="292" y="427">internal/registrationendpoint</text>
<path class="hg-line" d="M248 457 H278" marker-end="url(#hg-arrow)"/>
<rect class="hg-box" x="280" y="440" width="348" height="34" rx="6"/>
<text class="hg-path" x="292" y="455">/interaction/…</text>
<text class="hg-drv" x="292" y="469">HTML or SPA UI driver</text>
</svg>
</div>

Endpoints gated by features (`PAR`, `Introspect`, `Revoke`, `DynamicRegistration`) are mounted only when the corresponding `feature.*` is enabled or the corresponding option (`WithDynamicRegistration`) is supplied. Back-channel logout is not a mounted, feature-gated endpoint — it is an outbound fan-out triggered from `/end_session` that POSTs a logout token to each RP's registered `backchannel_logout_uri`. The discovery document only advertises endpoints that are actually mounted.

## Cross-cutting middleware

Every handler is wrapped by:

| Layer | Source | Role |
|---|---|---|
| **CORS** | `internal/cors` | public CORS for discovery and `/jwks`; strict allowlist for `/userinfo`, `/token`, interaction/session JSON surfaces, and mounted protocol endpoints such as `/par`, `/revoke`, `/introspect`, `/register`, `/bc-authorize`, `/device_authorization`, and `/end_session` |
| **Trusted proxy** | `internal/httpx` | resolves real client IP from `X-Forwarded-*` / `Forwarded` based on `WithTrustedProxies` |
| **Cookie** | `internal/cookie` | `__Host-` prefix, AES-256-GCM, `SameSite=Lax` for session, `Strict` where compatible |
| **CSRF** | `internal/csrf` | double-submit + Origin / Referer check on the consent / logout POST |

These are not optional — they apply structurally regardless of which options the embedder set.

## Authorize → token lifecycle

The most-trodden path. Roughly:

<div style="display:flex;justify-content:center;margin:1.5rem 0">
<svg role="img" aria-labelledby="seq-en-title" viewBox="0 0 870 662" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:850px;height:auto">
<title id="seq-en-title">Authorize-to-token happy path: the browser drives /authorize and interaction, then the RP redeems the code at /token.</title>
<style>
.seq-ll{stroke:currentColor;stroke-width:2}
.seq-llop{stroke:var(--vp-c-brand-2);stroke-width:2}
.seq-llst{stroke:currentColor;stroke-width:2;stroke-dasharray:5 5}
.seq-lllf{stroke:var(--vp-c-text-3);stroke-width:2}
.seq-box{fill:none;stroke:currentColor;stroke-width:2}
.seq-boxop{fill:none;stroke:var(--vp-c-brand-2);stroke-width:2}
.seq-boxst{fill:none;stroke:currentColor;stroke-width:2;stroke-dasharray:5 5}
.seq-boxlf{fill:none;stroke:var(--vp-c-text-3);stroke-width:2}
.seq-msg{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.seq-ret{fill:none;stroke:var(--vp-c-text-3);stroke-width:1.5;stroke-dasharray:5 4;stroke-linecap:round}
.seq-hd{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;fill:currentColor}
.seq-hdop{fill:var(--vp-c-brand-2)}
.seq-hdlf{fill:var(--vp-c-text-3)}
.seq-lbl{font-family:var(--vp-font-family-base);font-size:11.5px;fill:currentColor}
.seq-mono{font-family:var(--vp-font-family-mono)}
.seq-num{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3)}
</style>
<defs>
<marker id="seq-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="seq-ahm" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-text-3)"/></marker>
</defs>
<line class="seq-ll" x1="70" y1="44" x2="70" y2="645"/>
<line class="seq-ll" x1="250" y1="44" x2="250" y2="645"/>
<line class="seq-llop" x1="440" y1="44" x2="440" y2="645"/>
<line class="seq-llst" x1="630" y1="44" x2="630" y2="645"/>
<line class="seq-lllf" x1="800" y1="44" x2="800" y2="645"/>
<rect class="seq-box" x="20" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd" x="70" y="32" text-anchor="middle">RP</text>
<rect class="seq-box" x="200" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd" x="250" y="32" text-anchor="middle">User agent</text>
<rect class="seq-boxop" x="390" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd seq-hdop" x="440" y="32" text-anchor="middle">OP</text>
<rect class="seq-boxst" x="580" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd" x="630" y="32" text-anchor="middle">Store</text>
<rect class="seq-boxlf" x="750" y="10" width="100" height="34" rx="6"/>
<text class="seq-hd seq-hdlf" x="800" y="32" text-anchor="middle">LoginFlow</text>
<line class="seq-msg" x1="70" y1="80" x2="250" y2="80" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="75">1</text>
<text class="seq-lbl" x="91" y="75">redirect to <tspan class="seq-mono">/authorize?…</tspan></text>
<line class="seq-msg" x1="250" y1="114" x2="440" y2="114" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="109">2</text>
<text class="seq-lbl" x="271" y="109"><tspan class="seq-mono">GET /authorize</tspan></text>
<line class="seq-msg" x1="440" y1="148" x2="630" y2="148" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="143">3</text>
<text class="seq-lbl" x="461" y="143"><tspan class="seq-mono">Clients.GetClient</tspan> / validate <tspan class="seq-mono">redirect_uri</tspan></text>
<path class="seq-msg" d="M440 174 h30 v14 h-30" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="480" y="170">4</text>
<text class="seq-lbl" x="492" y="170">PKCE / scope / <tspan class="seq-mono">response_type</tspan> checks</text>
<line class="seq-msg" x1="440" y1="216" x2="250" y2="216" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="211">5</text>
<text class="seq-lbl" x="271" y="211">302 → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="250" y1="250" x2="440" y2="250" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="245">6</text>
<text class="seq-lbl" x="271" y="245"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (login)</text>
<line class="seq-msg" x1="440" y1="284" x2="800" y2="284" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="279">7</text>
<text class="seq-lbl" x="461" y="279"><tspan class="seq-mono">Begin / Continue</tspan> (Step chain)</text>
<line class="seq-ret" x1="800" y1="318" x2="440" y2="318" marker-end="url(#seq-ahm)"/>
<text class="seq-num" x="446" y="313">8</text>
<text class="seq-lbl" x="461" y="313"><tspan class="seq-mono">Result</tspan> (subject + AAL + AMR)</text>
<line class="seq-msg" x1="440" y1="352" x2="250" y2="352" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="347">9</text>
<text class="seq-lbl" x="271" y="347">200 consent → <tspan class="seq-mono">/interaction/{uid}</tspan></text>
<line class="seq-msg" x1="250" y1="386" x2="440" y2="386" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="381">10</text>
<text class="seq-lbl" x="271" y="381"><tspan class="seq-mono">POST /interaction/{uid}</tspan> (consent)</text>
<line class="seq-msg" x1="440" y1="420" x2="630" y2="420" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="415">11</text>
<text class="seq-lbl" x="461" y="415"><tspan class="seq-mono">AuthorizationCodes.Save</tspan> (code + PKCE)</text>
<line class="seq-msg" x1="440" y1="454" x2="250" y2="454" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="256" y="449">12</text>
<text class="seq-lbl" x="271" y="449">302 → <tspan class="seq-mono">redirect_uri?code=…&amp;state=…&amp;iss=…</tspan></text>
<line class="seq-msg" x1="250" y1="488" x2="70" y2="488" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="483">13</text>
<text class="seq-lbl" x="91" y="483">arrives with <tspan class="seq-mono">code</tspan></text>
<line class="seq-msg" x1="70" y1="522" x2="440" y2="522" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="517">14</text>
<text class="seq-lbl" x="91" y="517"><tspan class="seq-mono">POST /token</tspan> (<tspan class="seq-mono">grant_type=authorization_code</tspan>)</text>
<line class="seq-msg" x1="440" y1="556" x2="630" y2="556" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="551">15</text>
<text class="seq-lbl" x="461" y="551"><tspan class="seq-mono">AuthorizationCodes.Consume</tspan> / verify PKCE / client auth</text>
<line class="seq-msg" x1="440" y1="590" x2="630" y2="590" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="446" y="585">16</text>
<text class="seq-lbl" x="461" y="585"><tspan class="seq-mono">AccessTokens.Register / RefreshTokens.Save</tspan></text>
<line class="seq-msg" x1="440" y1="624" x2="70" y2="624" marker-end="url(#seq-ah)"/>
<text class="seq-num" x="76" y="619">17</text>
<text class="seq-lbl" x="91" y="619">200 <tspan class="seq-mono">{ access_token, id_token, refresh_token? }</tspan></text>
</svg>
</div>

`/par` and `/end_session` follow the same general shape; the sequence-diagram is the canonical happy path.

## LoginFlow internals

`WithLoginFlow(LoginFlow{...})` is compiled at construction time into an internal pipeline:

```
LoginFlow {Primary, Rules[], Decider, Risk}
    │
    ▼ (compile)
internal/authn/CompiledLoginFlow
    ├── Primary  → Authenticator (resolves Step descriptor → runtime impl)
    ├── Rules[]  → ordered (When, Then) pairs
    ├── Decider  → optional short-circuit
    └── Risk     → invoked once per evaluation pass
```

<div style="display:flex;justify-content:center;margin:1.5rem 0">
<svg role="img" aria-labelledby="lfp-en-title" viewBox="0 0 760 410" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;height:auto">
<title id="lfp-en-title">WithLoginFlow compiles the Primary, Rules, Decider and Risk spec into a CompiledLoginFlow the orchestrator drives in a per-request loop.</title>
<style>
.lfp-box{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lfp-op{fill:none;stroke:var(--vp-c-brand-2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lfp-line{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.lfp-oln{fill:none;stroke:var(--vp-c-brand-2);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.lfp-t1{font-family:var(--vp-font-family-mono);font-size:12px;font-weight:600;fill:currentColor}
.lfp-t1a{font-family:var(--vp-font-family-mono);font-size:12px;font-weight:600;fill:var(--vp-c-brand-2)}
.lfp-fld{font-family:var(--vp-font-family-mono);font-size:11px;fill:var(--vp-c-text-3)}
.lfp-sub{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-3)}
.lfp-lba{font-family:var(--vp-font-family-base);font-size:11px;fill:var(--vp-c-brand-2)}
.lfp-cap{font-family:var(--vp-font-family-base);font-size:11px;fill:var(--vp-c-text-3)}
.lfp-mono{font-family:var(--vp-font-family-mono)}
.lfp-nd{font-family:var(--vp-font-family-base);font-size:11px;fill:currentColor}
</style>
<defs>
<marker id="lfp-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>
<marker id="lfp-arra" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--vp-c-brand-2)"/></marker>
</defs>
<rect class="lfp-box" x="24" y="22" width="172" height="132" rx="8"/>
<text class="lfp-t1" x="110" y="44" text-anchor="middle">LoginFlow</text>
<text class="lfp-fld" x="44" y="72">Primary</text>
<text class="lfp-fld" x="44" y="94">Rules[]</text>
<text class="lfp-fld" x="44" y="116">Decider</text>
<text class="lfp-fld" x="44" y="138">Risk</text>
<path class="lfp-line" d="M196 88 H250" marker-end="url(#lfp-arrow)"/>
<text class="lfp-cap" x="223" y="82" text-anchor="middle">compile</text>
<rect class="lfp-op" x="252" y="22" width="206" height="132" rx="8"/>
<text class="lfp-t1a" x="355" y="42" text-anchor="middle">CompiledLoginFlow</text>
<text class="lfp-sub" x="355" y="57" text-anchor="middle">internal/authn</text>
<text class="lfp-fld" x="270" y="82">primary</text>
<text class="lfp-fld" x="270" y="102">rules</text>
<text class="lfp-fld" x="270" y="122">decider</text>
<text class="lfp-fld" x="270" y="142">risk</text>
<path class="lfp-oln" d="M355 154 V196" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="365" y="178" text-anchor="start">per authorize request</text>
<rect class="lfp-op" x="40" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="126" y="232" text-anchor="middle"><tspan class="lfp-mono">Primary.Begin /</tspan></text>
<text class="lfp-nd" x="126" y="248" text-anchor="middle"><tspan class="lfp-mono">Continue → Step</tspan></text>
<rect class="lfp-op" x="252" y="210" width="172" height="52" rx="8"/>
<text class="lfp-nd" x="338" y="232" text-anchor="middle">Prompt → user submits</text>
<text class="lfp-nd" x="338" y="248" text-anchor="middle">Result binds <tspan class="lfp-mono">Identity</tspan></text>
<rect class="lfp-op" x="452" y="210" width="200" height="52" rx="8"/>
<text class="lfp-nd" x="552" y="232" text-anchor="middle"><tspan class="lfp-mono">LoginContext</tspan> → <tspan class="lfp-mono">Decider</tspan></text>
<text class="lfp-nd" x="552" y="248" text-anchor="middle">then <tspan class="lfp-mono">Rules</tspan> evaluate</text>
<path class="lfp-oln" d="M212 236 H252" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M424 236 H452" marker-end="url(#lfp-arra)"/>
<path class="lfp-oln" d="M500 262 C 500 336, 126 336, 126 262" marker-end="url(#lfp-arra)"/>
<text class="lfp-lba" x="313" y="332" text-anchor="middle">repeat until no rule fires</text>
<path class="lfp-oln" d="M652 236 H704 V346" marker-end="url(#lfp-arra)"/>
<text class="lfp-cap" x="698" y="300" text-anchor="end">no rule fires</text>
<rect class="lfp-op" x="636" y="346" width="118" height="40" rx="8"/>
<text class="lfp-nd" x="695" y="370" text-anchor="middle">Session issued</text>
</svg>
</div>

For each authorize request:

1. `Primary.Begin` produces an `interaction.Step` (Prompt or Result).
2. UI driver (HTML or React) renders the prompt; the user submits.
3. `Primary.Continue` advances to a `Result` carrying the bound `Identity`.
4. Orchestrator builds a `LoginContext` (subject, scopes, completed steps, risk score, ACR values).
5. `Decider` runs (if non-nil); a non-`Pass` decision short-circuits.
6. Otherwise `Rules` evaluate in order; the first matching rule whose `Step.Kind()` is not in `CompletedSteps` fires.
7. Loop until no rule fires; the session is then issued.

See [Use case: Custom authenticator](/use-cases/custom-authenticator) for how to plug your own factor in via `ExternalStep`.

## Storage seams

The library never reads or writes the embedder's `users` table directly. It talks to the `op.Store` interface which is the union of small substores:

| Substore | What lives there | Adapter notes |
|---|---|---|
| `Clients` | OAuth client registry | typically durable |
| `Users` | subjects + claims | embedder-implemented; commonly maps to existing users table |
| `AuthorizationCodes` | one-shot codes (PKCE challenge, scope) | durable |
| `RefreshTokens` | refresh chains, rotation history | durable |
| `AccessTokens` | JWT id-side / opaque tokens | durable |
| `OpaqueAccessTokens` | opaque AT lookup | durable |
| `Grants` | consented scopes per (user, client) | durable |
| `GrantRevocations` | tombstones for revoked grants | durable |
| `Sessions` | browser session records | volatile-eligible |
| `Interactions` | per-attempt interaction state | volatile-eligible |
| `ConsumedJTIs` | JAR / DPoP `jti` replay set | volatile-eligible |
| `PARs` | pushed authorization requests | volatile-eligible |
| `IATs` / `RATs` | DCR Initial / Registration Access Tokens | durable |
| `DeviceCodes` | RFC 8628 device-authorization records | durable |
| `CIBARequests` | OpenID Connect CIBA backchannel-authentication records | durable |
| `Metadata` | OP-internal key/value state (e.g. the `subject_mode` marker) | durable, may be absent (nil) |

Volatile-eligible substores can live in a Redis tier behind the [`composite`](/use-cases/hot-cold-redis) adapter. The composite store enforces a single durable backend at construction time so a transactional cluster cannot split across two stores.

MFA factor stores (`EmailOTPStore`, `TOTPStore`, `PasskeyStore`, `RecoveryStore`) are not substores of `op.Store`. They are supplied directly to the corresponding authenticator `Step` (`StepEmailOTP.Store`, `StepTOTP.Store`, `StepPasskey.Store`, `StepRecovery.Store`) when the embedder builds the `LoginFlow`.

See [Architecture: storage tiering](/use-cases/hot-cold-redis) for production placement guidance.

## Discovery document assembly

The discovery handler at `/.well-known/openid-configuration` builds its document from the OP's effective configuration. Every advertised field is the authoritative answer for what the OP will actually do — there is no drift between discovery and behaviour because:

- **`response_types_supported`** is computed from `WithGrants` + the FAPI profile.
- **`token_endpoint_auth_methods_supported`** is intersected with the FAPI allow-list when `WithProfile(profile.FAPI2Baseline)` / `FAPI2MessageSigning` is active.
- **`scopes_supported`** is the union of built-in scopes and `WithScope` registrations.
- **`ui_locales_supported`** is auto-derived from the runtime locale resolver (seed bundles plus `WithLocale` additions) unless `WithDiscoveryMetadata(...).UILocalesSupported` supplies an explicit non-empty override.
- **`code_challenge_methods_supported`** is always `["S256"]` — `plain` is structurally absent.
- **`request_object_signing_alg_values_supported`** is the JOSE allow-list (`RS256`, `PS256`, `ES256`, `EdDSA`).
- **`dpop_signing_alg_values_supported`** is narrower (`ES256`, `EdDSA`, `PS256`) — see [FAQ § DPoP discovery](/faq#dpop-sender-constraint).

## Where to read next

- **[Options reference](/reference/options)** — every `op.With*` in one table, with cross-links into the handler graph above.
- **[Audit event catalog](/reference/audit-events)** — what fires from each handler at each stage.
- **[Custom authenticator](/use-cases/custom-authenticator)** — how the orchestrator's pipeline calls into your code.
- **[Hot/cold storage](/use-cases/hot-cold-redis)** — how the substore tiering interacts with the volatile / durable boundary above.
