---
title: Authorization Code + PKCE
description: The dominant OIDC flow, walked end-to-end with a full sequence diagram and parameter glossary.
---

# Authorization Code + PKCE

The most common OIDC flow. Used by every web app, mobile app, SPA, and desktop app that logs a human in. PKCE (Proof Key for Code Exchange, RFC 7636) is mandatory for every public or native client in this library, and mandatory for all authorization-code clients under FAPI profiles. Confidential clients outside a FAPI profile can still run the older OIDC Core shape, but new deployments should send `S256` everywhere.

::: warning Current behavior
Public and native clients that omit `code_challenge` are rejected at `/authorize` with `invalid_request`. Register these clients with PKCE and always send `code_challenge_method=S256`; the OP no longer issues a non-PKCE authorization code to a client that cannot authenticate at `/token`.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework (§5.2 error codes)
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — Proof Key for Code Exchange (PKCE)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1 (Authorization Code Flow)
:::

::: details New to the vocabulary?
- **Authorization code** — a one-time, opaque string the OP hands to the RP via a browser redirect. The RP swaps it at `/token` for the actual tokens.
- **PKCE** ("pixie") — a small extra dance with `code_verifier` / `code_challenge` that proves "the client redeeming this code is the same one that started the flow." Stops a malicious app from stealing a redirected code. Walked through in detail below.
- **`state`** — a random opaque value the RP sends with the authorize request and re-checks on the callback; CSRF defence for the redirect.
- **`nonce`** — a random opaque value bound into the ID Token; replay defence at the RP.
:::

## The full sequence

<style scoped>
text{stroke:none}
.actor{font-family:var(--vp-font-family-base);font-size:11px;font-weight:600;fill:var(--vp-c-text-1)}
.actor-op{fill:var(--vp-c-brand-2)}
.actor-rs{fill:var(--vp-c-text-3)}
.asub{font-family:var(--vp-font-family-base);font-size:9px;fill:var(--vp-c-text-3)}
.lbl{font-family:var(--vp-font-family-base);font-size:11px;fill:var(--vp-c-text-1)}
.sub{font-family:var(--vp-font-family-base);font-size:9.5px;fill:var(--vp-c-text-2)}
.mono{font-family:var(--vp-font-family-mono);font-size:10px;fill:var(--vp-c-text-2)}
.num{font-family:var(--vp-font-family-mono);font-size:9px;fill:var(--vp-c-text-3)}
.note{font-family:var(--vp-font-family-base);font-size:10px;fill:var(--vp-c-text-1)}
.notemono{font-family:var(--vp-font-family-mono);font-size:9.5px;fill:var(--vp-c-text-2)}
.box{fill:var(--vp-c-bg);stroke:currentColor}
.box-op{stroke:var(--vp-c-brand-2)}
.box-rs{stroke:var(--vp-c-text-3)}
.lane{fill:none;stroke:var(--vp-c-divider);stroke-width:1.3;stroke-dasharray:2 5}
.lane-op{stroke:var(--vp-c-brand-2)}
.lane-rs{stroke:var(--vp-c-text-3)}
.msg{fill:none;stroke:currentColor}
.self{fill:none;stroke:currentColor}
.op-accent{stroke:var(--vp-c-brand-2)}
.notebox{fill:var(--vp-c-bg-soft);stroke:var(--vp-c-divider);stroke-width:1.3}
</style>

<svg role="img" aria-labelledby="acpkce-seq-title" viewBox="0 0 684 712" style="width:100%;height:auto;max-width:684px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="acpkce-seq-title">Authorization Code + PKCE sequence: the browser, Relying Party, OpenID Provider, and Resource Server exchanges from login through PKCE-verified token issuance to a Bearer-token API call.</title>
  <defs>
    <marker id="acp-ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L5.5 3.5 L1 6" fill="none" stroke="currentColor" stroke-width="1.4"/></marker>
    <marker id="acp-ahb" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L5.5 3.5 L1 6" fill="none" class="op-accent" stroke-width="1.4"/></marker>
  </defs>
  <!-- lifelines -->
  <line class="lane" x1="70" y1="54" x2="70" y2="706"/>
  <line class="lane" x1="250" y1="54" x2="250" y2="706"/>
  <line class="lane lane-op" x1="430" y1="54" x2="430" y2="706"/>
  <line class="lane lane-rs" x1="610" y1="54" x2="610" y2="706"/>
  <!-- actor headers -->
  <rect class="box" x="20" y="14" width="100" height="40" rx="6"/>
  <text class="actor" x="70" y="31" text-anchor="middle">User</text>
  <text class="asub" x="70" y="45" text-anchor="middle">browser</text>
  <rect class="box" x="200" y="14" width="100" height="40" rx="6"/>
  <text class="actor" x="250" y="31" text-anchor="middle">Relying Party</text>
  <text class="asub" x="250" y="45" text-anchor="middle">your web app</text>
  <rect class="box box-op" x="380" y="14" width="100" height="40" rx="6"/>
  <text class="actor actor-op" x="430" y="31" text-anchor="middle">OpenID Provider</text>
  <text class="asub" x="430" y="45" text-anchor="middle">go-oidc-provider</text>
  <rect class="box box-rs" x="560" y="14" width="100" height="40" rx="6"/>
  <text class="actor actor-rs" x="610" y="31" text-anchor="middle">Resource Server</text>
  <text class="asub" x="610" y="45" text-anchor="middle">your API</text>
  <!-- PKCE note over RP -->
  <rect class="notebox" x="128" y="62" width="244" height="32" rx="5"/>
  <text class="note" x="250" y="76" text-anchor="middle">RP builds the PKCE pair</text>
  <text class="notemono" x="250" y="89" text-anchor="middle">code_challenge = SHA-256(code_verifier)</text>
  <!-- 1 -->
  <text class="num" x="12" y="119" text-anchor="middle">1</text>
  <path class="msg" d="M70 116 H250" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="160" y="111" text-anchor="middle">open app</text>
  <!-- 2 -->
  <text class="num" x="12" y="148" text-anchor="middle">2</text>
  <path class="msg" d="M250 145 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="160" y="130" text-anchor="middle">302 → OP</text>
  <text class="mono" x="160" y="141" text-anchor="middle">/authorize · S256 · state · nonce</text>
  <!-- 3 -->
  <text class="num" x="12" y="177" text-anchor="middle">3</text>
  <path class="msg" d="M70 174 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="158" y="169" text-anchor="middle">GET /authorize</text>
  <!-- 4 -->
  <text class="num" x="12" y="206" text-anchor="middle">4</text>
  <path class="self op-accent" d="M430 196 h32 v14 h-32" marker-end="url(#acp-ahb)"/>
  <text class="lbl" x="474" y="200">validate request</text>
  <text class="mono" x="474" y="211">redirect_uri exact-match</text>
  <!-- 5 -->
  <text class="num" x="12" y="235" text-anchor="middle">5</text>
  <path class="msg" d="M430 232 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="227" text-anchor="middle">200 login page</text>
  <!-- 6 -->
  <text class="num" x="12" y="264" text-anchor="middle">6</text>
  <path class="msg" d="M70 261 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="158" y="256" text-anchor="middle">POST credentials</text>
  <!-- 7 -->
  <text class="num" x="12" y="293" text-anchor="middle">7</text>
  <path class="self op-accent" d="M430 283 h32 v14 h-32" marker-end="url(#acp-ahb)"/>
  <text class="lbl" x="474" y="287">authenticate</text>
  <text class="sub" x="474" y="298">password / passkey</text>
  <!-- 8 -->
  <text class="num" x="12" y="322" text-anchor="middle">8</text>
  <path class="msg" d="M430 319 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="314" text-anchor="middle">200 consent page</text>
  <!-- 9 -->
  <text class="num" x="12" y="351" text-anchor="middle">9</text>
  <path class="msg" d="M70 348 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="158" y="343" text-anchor="middle">POST consent</text>
  <!-- 10 -->
  <text class="num" x="12" y="380" text-anchor="middle">10</text>
  <path class="msg" d="M430 377 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="362" text-anchor="middle">302 → redirect_uri</text>
  <text class="mono" x="158" y="373" text-anchor="middle">code &amp; state</text>
  <!-- 11 -->
  <text class="num" x="12" y="409" text-anchor="middle">11</text>
  <path class="msg" d="M70 406 H250" marker-end="url(#acp-ah)"/>
  <text class="mono" x="160" y="401" text-anchor="middle">GET /callback?code&amp;state</text>
  <!-- 12 -->
  <text class="num" x="12" y="438" text-anchor="middle">12</text>
  <path class="self" d="M250 428 h32 v14 h-32" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="294" y="438">verify state</text>
  <!-- 13 -->
  <text class="num" x="12" y="467" text-anchor="middle">13</text>
  <path class="msg" d="M250 464 H430" marker-end="url(#acp-ah)"/>
  <text class="mono" x="340" y="451" text-anchor="middle">POST /token</text>
  <text class="mono" x="340" y="461" text-anchor="middle">code · code_verifier · client auth</text>
  <!-- 14 -->
  <text class="num" x="12" y="496" text-anchor="middle">14</text>
  <path class="self op-accent" d="M430 486 h32 v14 h-32" marker-end="url(#acp-ahb)"/>
  <text class="lbl" x="474" y="490">verify PKCE</text>
  <text class="mono" x="474" y="501">SHA-256(verifier) == challenge</text>
  <!-- 15 -->
  <text class="num" x="12" y="525" text-anchor="middle">15</text>
  <path class="msg" d="M430 522 H250" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="340" y="510" text-anchor="middle">200 OK</text>
  <text class="mono" x="340" y="520" text-anchor="middle">access_token · id_token · refresh_token</text>
  <!-- 16 -->
  <text class="num" x="12" y="554" text-anchor="middle">16</text>
  <path class="self" d="M250 544 h32 v14 h-32" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="294" y="548">verify ID Token</text>
  <text class="mono" x="294" y="559">iss · aud · exp · nonce</text>
  <!-- 17 -->
  <text class="num" x="12" y="583" text-anchor="middle">17</text>
  <path class="msg" d="M250 580 H70" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="158" y="575" text-anchor="middle">set session cookie</text>
  <!-- 18 -->
  <text class="num" x="12" y="612" text-anchor="middle">18</text>
  <path class="msg" d="M70 609 H250" marker-end="url(#acp-ah)"/>
  <text class="mono" x="160" y="604" text-anchor="middle">GET /api/me</text>
  <!-- 19 -->
  <text class="num" x="12" y="641" text-anchor="middle">19</text>
  <path class="msg" d="M250 638 H610" marker-end="url(#acp-ah)"/>
  <text class="mono" x="520" y="626" text-anchor="middle">GET /api/me</text>
  <text class="mono" x="520" y="636" text-anchor="middle">Authorization: Bearer …</text>
  <!-- 20 -->
  <text class="num" x="12" y="670" text-anchor="middle">20</text>
  <path class="msg" d="M610 667 H430" marker-end="url(#acp-ah)"/>
  <text class="lbl" x="520" y="655" text-anchor="middle">(optional)</text>
  <text class="mono" x="520" y="665" text-anchor="middle">introspect · verify JWT</text>
  <!-- 21 -->
  <text class="num" x="12" y="699" text-anchor="middle">21</text>
  <path class="msg" d="M610 696 H250" marker-end="url(#acp-ah)"/>
  <text class="mono" x="520" y="691" text-anchor="middle">200 { user data }</text>
</svg>

## Parameter glossary

| Parameter | Sent at | Purpose |
|---|---|---|
| `response_type=code` | `/authorize` | Asks for the authorization-code grant. |
| `client_id` | `/authorize`, `/token` | Identifies the registered RP. |
| `redirect_uri` | `/authorize` (and echoed at `/token`) | Where the OP sends the user back. **Exact match** against the registered list. |
| `scope` | `/authorize` | Permissions requested. Must include `openid` for OIDC. |
| `state` | `/authorize` | Random opaque value the RP echoes on callback. CSRF defense for the redirect. |
| `nonce` | `/authorize` | Random value bound into the ID Token's `nonce` claim. Replay defense. |
| `code_challenge` | `/authorize` | `BASE64URL(SHA256(code_verifier))`. |
| `code_challenge_method` | `/authorize` | `S256` (the only one this library accepts). |
| `code` | `/authorize` response | Single-use. This library defaults to a 60 s max-age; RFC 6749 §4.1.2 recommends a 10-minute maximum. |
| `code_verifier` | `/token` | The pre-image of `code_challenge`. The OP recomputes the SHA-256. |
| `grant_type=authorization_code` | `/token` | Selects this grant. |
| Client auth | `/token` | One of `client_secret_basic`, `client_secret_post`, `private_key_jwt`, or `none` (PKCE-only). mTLS sender constraint is separate from token-endpoint client authentication. |

::: details `state` vs `nonce` — what's the difference?
Both are random opaque values, both defend against replay-style attacks, but they protect different legs of the flow:

- **`state`** travels on the **front channel** (browser query string). The RP stashes it in the user's session before redirecting and re-checks it on the callback. It defends the *redirect* against CSRF — an attacker can't forge a callback to your `/callback` and have your app accept it.
- **`nonce`** travels in the **ID Token claim**. The RP stashes it in the user's session before redirecting and re-checks it after token exchange. It defends the *ID Token* against replay — an attacker can't reuse a stolen ID Token at a different RP, or at the same RP for a different login attempt.

Use both. The OP rejects requests missing `state` for confidential clients in this library, and OIDC requires `nonce` whenever `response_type=code id_token` or `id_token` is involved.
:::

::: details `code_verifier` / `code_challenge` / `S256` — what's that?
**`code_verifier`** is a high-entropy random string the RP generates and *keeps to itself*. RFC 7636 §4.1 mandates 43-128 URL-safe characters.

**`code_challenge`** is what the RP sends to the OP at `/authorize`. With `code_challenge_method=S256`, it's `BASE64URL(SHA-256(code_verifier))` — a one-way hash. The OP can't reverse it; only the RP can prove ownership later by sending the verifier itself.

**`S256`** is the SHA-256-based transform; it's the only `code_challenge_method` this library accepts. The legacy `plain` method (where challenge equals verifier) provides no protection against an attacker who reads the URL, so RFC 9700 forbids it for new deployments.
:::

::: details `redirect_uri` — strict exact-match, and why
The `redirect_uri` on `/authorize` is checked **byte-for-byte** against the client's registered list — no tail-slash normalisation, no path-prefix matches, no wildcards. That strictness is on purpose: open-redirect bugs and "any subpath of `https://app.example.com/`" patterns are a well-trodden way to leak codes to attacker-controlled URLs. RFC 9700 §2.1 requires exact match, and this library enforces it. At `/token`, the RP must repeat the *same* `redirect_uri` it sent on `/authorize`; a mismatch returns `invalid_grant`.
:::

::: details `response_type=code` — what's that?
**`response_type=code`** asks for the **authorization code flow** — the OP returns a short-lived `code` on the redirect, and the RP swaps it at `/token` for the actual tokens. The alternatives (`token`, `id_token token`, `code id_token`, etc.) are legacy hybrid / implicit flows that OAuth 2.0 BCP (RFC 9700) discourages. This library implements `code` as the canonical path and treats hybrid forms as opt-in surface for compatibility, not new builds.
:::

::: details PAR — what's that, and when do I need it?
**PAR** (Pushed Authorization Requests, RFC 9126) lets the RP POST the authorize parameters to a server-side `/par` endpoint *first*, get back a short-lived `request_uri`, then redirect the browser with just `?client_id=...&request_uri=...`. The benefits:

- The full request never appears in browser history, server logs, or referrer headers.
- Tampering at the user-agent boundary is moot — only the `request_uri` is exposed there.
- Required by FAPI 2.0 Baseline. Optional (but worth opting in) elsewhere.

Wire it via `op.WithFeature(feature.PAR)` and the discovery document advertises `pushed_authorization_request_endpoint`.
:::

## What PKCE prevents

::: details Walk-through: the attack PKCE blocks
Without PKCE, a malicious app on the same device that controls a URI-handler for `myapp://` can intercept the authorization-code redirect:

1. User logs in on the legit RP. OP issues `code=abc` to `myapp://callback`.
2. Malicious app intercepts the redirect (race condition or universal-link spoof) and reads `code=abc`.
3. Malicious app posts `code=abc` to `/token` and gets tokens.

PKCE binds the code to a **secret only the legitimate RP knows**:

1. The legit RP generates a random `code_verifier` and sends only `SHA256(code_verifier)` (the `code_challenge`) to `/authorize`.
2. The OP stores `code_challenge` alongside the issued code.
3. At `/token`, the OP requires `code_verifier` and recomputes the SHA-256.
4. The malicious app saw the code but never saw the verifier — its `/token` call fails.

This works even when the RP can't store a client secret (SPA / native).
:::

## How this library enforces it

| Behaviour | Where |
|---|---|
| `code_challenge_method=plain` is **rejected** — only `S256` accepted. | `internal/pkce` |
| Authorization request without `code_challenge` is rejected when the client's `RequiresPKCE` is true (default for public clients, forced for FAPI 2.0). | `internal/authorize` |
| `code_verifier` length and char-set are validated against RFC 7636 §4.1. | `internal/pkce` |
| Mismatch returns RFC 6749 §5.2 `invalid_grant` at `/token` (not `/authorize`). | `internal/tokenendpoint/authcode.go` |

## Common errors and what they mean

| Wire error | Cause | Where to look |
|---|---|---|
| `invalid_request` `code_challenge_method` | Client sent `plain` | Send `S256` |
| `invalid_request_uri` | PAR `request_uri` expired or already consumed | New PAR request |
| `invalid_grant` (at `/token`) | `code_verifier` doesn't match, or code already used / expired | Don't reuse codes, regenerate |
| `invalid_grant` (at `/token`) | The `redirect_uri` at `/token` differs from `/authorize` | They must be byte-identical |

## Run the flow yourself

`examples/03-fapi2` runs a FAPI 2.0 Baseline OP that demands PAR + JAR + DPoP + PKCE in one wiring. The OFCS conformance suite drives this exact sequence through ~129 modules in two FAPI plans; [OFCS status](/compliance/ofcs) shows the breakdown.

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — how PKCE upgrades to "the access token only works for the client that got it."
- [Refresh tokens](/concepts/refresh-tokens) — what to do when the access token expires.
