---
title: Authorization Code + PKCE
description: The dominant OIDC flow, walked end-to-end with a full sequence diagram and parameter glossary.
pageClass: pg-concepts-authorization-code-pkce
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

<figure class="fig">
  <div class="fig-head">Authorization Code + PKCE — browser to API</div>
  <svg class="fig-svg" role="img" aria-labelledby="acpkce-seq-title" viewBox="0 0 960 924" xmlns="http://www.w3.org/2000/svg">
    <title id="acpkce-seq-title">Authorization Code with PKCE, in four phases: the authorization request the Relying Party builds, the authentication and consent the OpenID Provider runs, the token exchange where the PKCE verifier is checked, and the resource access that follows.</title>
    <!-- phase bands -->
    <rect class="fg-group" x="30" y="68" width="916" height="164" rx="8"/>
    <rect class="fg-group" x="30" y="240" width="916" height="246" rx="8"/>
    <rect class="fg-group" x="30" y="494" width="916" height="258" rx="8"/>
    <rect class="fg-group" x="30" y="760" width="916" height="152" rx="8"/>
    <text class="fg-lbl" x="42" y="86">1 · authorization request</text>
    <text class="fg-lbl" x="42" y="258">2 · authenticate and consent</text>
    <text class="fg-lbl" x="42" y="512">3 · token exchange</text>
    <text class="fg-lbl" x="42" y="778">4 · resource access</text>
    <!-- lifelines -->
    <line class="fg-life" x1="110" y1="62" x2="110" y2="912"/>
    <line class="fg-life" x1="330" y1="62" x2="330" y2="912"/>
    <line class="fg-life fg-life--accent" x1="570" y1="62" x2="570" y2="912"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="912"/>
    <!-- actors -->
    <rect class="fg-box" x="34" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="110" y="35" text-anchor="middle">User</text>
    <text class="fg-xs" x="110" y="49" text-anchor="middle">browser</text>
    <rect class="fg-box" x="254" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="330" y="35" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="330" y="49" text-anchor="middle">your web app</text>
    <rect class="fg-box fg-box--accent" x="490" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="570" y="35" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="570" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="754" y="16" width="152" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">Resource Server</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">your API</text>
    <!-- phase 1 -->
    <rect class="fg-box fg-box--sub" x="236" y="94" width="320" height="36" rx="6"/>
    <text class="fg-t2" x="396" y="110" text-anchor="middle">RP builds the PKCE pair</text>
    <text class="fg-mxs" x="396" y="123" text-anchor="middle">code_challenge = S256(code_verifier)</text>
    <circle class="fg-badge" cx="15" cy="152" r="8.5"/>
    <text class="fg-badge-t" x="15" y="155" text-anchor="middle">1</text>
    <path class="fg-edge" d="M110,152 H330" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="220" y="146" text-anchor="middle">open the app</text>
    <circle class="fg-badge" cx="15" cy="192" r="8.5"/>
    <text class="fg-badge-t" x="15" y="195" text-anchor="middle">2</text>
    <path class="fg-edge" d="M330,192 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="220" y="172" text-anchor="middle">302 to the OP</text>
    <text class="fg-mxs" x="220" y="185" text-anchor="middle">/authorize · code_challenge · state · nonce</text>
    <circle class="fg-badge" cx="15" cy="220" r="8.5"/>
    <text class="fg-badge-t" x="15" y="223" text-anchor="middle">3</text>
    <path class="fg-edge" d="M110,220 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="400" y="214" text-anchor="middle">GET /authorize</text>
    <!-- phase 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="274" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="277" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M570,266 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="612" y="270">validate the request</text>
    <text class="fg-mxs" x="612" y="283">redirect_uri exact match · client_id · S256</text>
    <circle class="fg-badge" cx="15" cy="308" r="8.5"/>
    <text class="fg-badge-t" x="15" y="311" text-anchor="middle">5</text>
    <path class="fg-edge" d="M570,308 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="400" y="302" text-anchor="middle">200 login page</text>
    <circle class="fg-badge" cx="15" cy="338" r="8.5"/>
    <text class="fg-badge-t" x="15" y="341" text-anchor="middle">6</text>
    <path class="fg-edge" d="M110,338 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="400" y="332" text-anchor="middle">POST credentials</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="364" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="367" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M570,356 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="612" y="360">authenticate</text>
    <text class="fg-xs" x="612" y="373">password · passkey · step-up MFA</text>
    <circle class="fg-badge" cx="15" cy="398" r="8.5"/>
    <text class="fg-badge-t" x="15" y="401" text-anchor="middle">8</text>
    <path class="fg-edge" d="M570,398 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="400" y="392" text-anchor="middle">200 consent page</text>
    <circle class="fg-badge" cx="15" cy="428" r="8.5"/>
    <text class="fg-badge-t" x="15" y="431" text-anchor="middle">9</text>
    <path class="fg-edge" d="M110,428 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="400" y="422" text-anchor="middle">POST consent</text>
    <circle class="fg-badge" cx="15" cy="468" r="8.5"/>
    <text class="fg-badge-t" x="15" y="471" text-anchor="middle">10</text>
    <path class="fg-edge" d="M570,468 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="400" y="448" text-anchor="middle">302 back to redirect_uri</text>
    <text class="fg-mxs fg-halo" x="400" y="461" text-anchor="middle">code · state</text>
    <!-- phase 3 -->
    <circle class="fg-badge" cx="15" cy="536" r="8.5"/>
    <text class="fg-badge-t" x="15" y="539" text-anchor="middle">11</text>
    <path class="fg-edge" d="M110,536 H330" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="220" y="530" text-anchor="middle">GET /callback?code&amp;state</text>
    <circle class="fg-badge" cx="15" cy="564" r="8.5"/>
    <text class="fg-badge-t" x="15" y="567" text-anchor="middle">12</text>
    <path class="fg-edge" d="M330,556 h30 v16 h-30" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="372" y="560">verify state</text>
    <text class="fg-xs" x="372" y="573">must equal the value stored at step 2</text>
    <circle class="fg-badge" cx="15" cy="608" r="8.5"/>
    <text class="fg-badge-t" x="15" y="611" text-anchor="middle">13</text>
    <path class="fg-edge" d="M330,608 H570" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="450" y="588" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="450" y="601" text-anchor="middle">code · code_verifier · client auth</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="636" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="639" text-anchor="middle">14</text>
    <path class="fg-edge fg-edge--accent" d="M570,628 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="612" y="632">verify PKCE</text>
    <text class="fg-mxs" x="612" y="645">S256(code_verifier) == code_challenge</text>
    <circle class="fg-badge" cx="15" cy="680" r="8.5"/>
    <text class="fg-badge-t" x="15" y="683" text-anchor="middle">15</text>
    <path class="fg-edge" d="M570,680 H330" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="450" y="660" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="450" y="673" text-anchor="middle">access_token · id_token · refresh_token</text>
    <circle class="fg-badge" cx="15" cy="708" r="8.5"/>
    <text class="fg-badge-t" x="15" y="711" text-anchor="middle">16</text>
    <path class="fg-edge" d="M330,700 h30 v16 h-30" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="372" y="704">verify the ID token</text>
    <text class="fg-mxs" x="372" y="717">iss · aud · exp · nonce</text>
    <circle class="fg-badge" cx="15" cy="740" r="8.5"/>
    <text class="fg-badge-t" x="15" y="743" text-anchor="middle">17</text>
    <path class="fg-edge" d="M330,740 H110" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="220" y="734" text-anchor="middle">set the session cookie</text>
    <!-- phase 4 -->
    <circle class="fg-badge" cx="15" cy="802" r="8.5"/>
    <text class="fg-badge-t" x="15" y="805" text-anchor="middle">18</text>
    <path class="fg-edge" d="M110,802 H330" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="220" y="796" text-anchor="middle">GET /api/me</text>
    <circle class="fg-badge" cx="15" cy="842" r="8.5"/>
    <text class="fg-badge-t" x="15" y="845" text-anchor="middle">19</text>
    <path class="fg-edge" d="M330,842 H830" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="580" y="822" text-anchor="middle">GET /api/me</text>
    <text class="fg-mxs fg-halo" x="580" y="835" text-anchor="middle">Authorization: Bearer …</text>
    <circle class="fg-badge" cx="15" cy="874" r="8.5"/>
    <text class="fg-badge-t" x="15" y="877" text-anchor="middle">20</text>
    <path class="fg-edge fg-edge--muted" d="M830,874 H570" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="700" y="856" text-anchor="middle">optional</text>
    <text class="fg-mxs" x="700" y="868" text-anchor="middle">introspect · or verify the JWT locally</text>
    <circle class="fg-badge" cx="15" cy="902" r="8.5"/>
    <text class="fg-badge-t" x="15" y="905" text-anchor="middle">21</text>
    <path class="fg-edge" d="M830,902 H330" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="580" y="896" text-anchor="middle">200 { user data }</text>
  </svg>
  <figcaption class="fig-note">Steps 4, 7 and 14 are the only ones the OP performs on its own; everything else is a hop between two parties. Step 14 is what PKCE buys: the code redeemed at <code>/token</code> is only accepted from whoever knows the verifier behind the challenge sent at step 2.</figcaption>
</figure>

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

Use both when your RP validates an ID Token. OIDC makes `nonce` mandatory for response types that include an ID Token; this library accepts `response_type=code` only, so hybrid and implicit response types are rejected before the authorization flow starts.
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
**`response_type=code`** asks for the **authorization code flow** — the OP returns a short-lived `code` on the redirect, and the RP swaps it at `/token` for the actual tokens. The alternatives (`token`, `id_token token`, `code id_token`, etc.) are legacy hybrid / implicit flows that OAuth 2.0 BCP (RFC 9700) discourages. This library supports `code` only and rejects every other response type.
:::

::: details PAR — what's that, and when do I need it?
**PAR** (Pushed Authorization Requests, RFC 9126) lets the RP POST the authorize parameters to a server-side `/par` endpoint *first*, get back a short-lived `request_uri`, then redirect the browser with just `?client_id=...&request_uri=...`. The benefits:

- The full request never appears in browser history, server logs, or referrer headers.
- Tampering at the user-agent boundary is moot — only the `request_uri` is exposed there.
- Required by the FAPI 2.0 Security Profile. Also recommended for authorization-code clients outside FAPI.

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

`examples/03-fapi2` runs this library's `FAPI2Baseline` setting with PAR, JAR, DPoP, and PKCE. JAR is an additional library requirement here; the final FAPI 2.0 Security Profile does not require it. The [OFCS results](/compliance/ofcs) cover the named Implementer's Draft plans.

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — how PKCE upgrades to "the access token only works for the client that got it."
- [Refresh tokens](/concepts/refresh-tokens) — what to do when the access token expires.
