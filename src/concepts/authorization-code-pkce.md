---
title: Authorization Code + PKCE
description: The dominant OIDC flow, walked end-to-end with a full sequence diagram and parameter glossary.
pageClass: pg-concepts-authorization-code-pkce
---

# Authorization Code + PKCE

The flow every web app, mobile app, SPA, and desktop app uses to log a human in. The RP sends the browser to the OP, the user signs in and consents there, and the RP trades the one-time `code` that comes back for tokens at `/token`.

PKCE (Proof Key for Code Exchange, RFC 7636) ties that code to the client that started the flow. This library requires it for public and native clients, and for every client under the `Baseline`, `FAPI2Baseline`, and `FAPI2MessageSigning` profiles. A public client that omits `code_challenge` gets `invalid_request` at `/auth`, because it cannot authenticate at `/token` and the verifier is its only proof of identity. Confidential clients under the default profile may still skip PKCE, but new integrations should send `S256` everywhere.

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
  <div class="fig-head">The browser carries the request and the code</div>
  <svg class="fig-svg" role="img" aria-labelledby="acpkce-seq-title" viewBox="0 0 960 1040" xmlns="http://www.w3.org/2000/svg">
    <title id="acpkce-seq-title">The first half of Authorization Code with PKCE. The Relying Party builds a PKCE pair and sends the user to the OpenID Provider through the browser; the provider validates the request, authenticates the user and collects consent, then redirects back to the Relying Party with a code and state.</title>
    <rect class="fg-group" x="32" y="104" width="896" height="328" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">authorization request</text>
    <rect class="fg-group" x="32" y="456" width="896" height="560" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="484">authenticate and consent</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="1016"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="1016"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="1016"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">your web app</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">User</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">browser</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- phase 1 -->
    <path class="fg-edge" d="M512,184 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="352" y="174" text-anchor="middle">open the app</text>
    <path class="fg-edge" d="M192,224 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="230">build the PKCE pair</text>
    <text class="fg-mxs" x="248" y="252">code_challenge =</text>
    <text class="fg-mxs" x="248" y="274">S256(code_verifier)</text>
    <path class="fg-edge" d="M192,346 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="312" text-anchor="middle">302 → /auth</text>
    <text class="fg-mxs" x="352" y="334" text-anchor="middle">code_challenge · state · nonce</text>
    <path class="fg-edge" d="M512,408 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="398" text-anchor="middle">GET /auth</text>
    <!-- phase 2 -->
    <path class="fg-edge fg-edge--accent" d="M824,512 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="518" text-anchor="end">validate the request</text>
    <text class="fg-mxs" x="768" y="540" text-anchor="end">redirect_uri exact match</text>
    <text class="fg-mxs" x="768" y="562" text-anchor="end">client_id · S256</text>
    <path class="fg-edge" d="M824,626 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="616" text-anchor="middle">200 login page</text>
    <path class="fg-edge" d="M512,682 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="672" text-anchor="middle">POST credentials</text>
    <path class="fg-edge fg-edge--accent" d="M824,720 h-40 v24 h40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="768" y="726" text-anchor="end">authenticate</text>
    <text class="fg-xs" x="768" y="748" text-anchor="end">password · passkey · MFA</text>
    <path class="fg-edge" d="M824,808 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="798" text-anchor="middle">200 consent page</text>
    <path class="fg-edge" d="M512,864 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="854" text-anchor="middle">POST consent</text>
    <path class="fg-edge" d="M824,936 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="902" text-anchor="middle">302 → redirect_uri</text>
    <text class="fg-mxs" x="668" y="924" text-anchor="middle">code · state</text>
    <path class="fg-edge" d="M512,992 H192" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="982" text-anchor="middle">GET /callback?code&amp;state</text>
  </svg>
  <figcaption class="fig-note">The OP validates <code>redirect_uri</code>, <code>client_id</code> and the S256 challenge before it shows any login page, so a malformed request never reaches the user. Only the challenge leaves the RP here; the verifier stays behind until the token request.</figcaption>
</figure>

<figure class="fig">
  <div class="fig-head">PKCE is checked where the code is redeemed</div>
  <svg class="fig-svg" role="img" aria-labelledby="acpkce-seq2-title" viewBox="0 0 960 864" xmlns="http://www.w3.org/2000/svg">
    <title id="acpkce-seq2-title">The second half of Authorization Code with PKCE. The Relying Party verifies state, redeems the code at the token endpoint together with the PKCE verifier, the OpenID Provider checks the verifier against the earlier challenge and returns tokens, and the Relying Party then calls the Resource Server with the access token.</title>
    <rect class="fg-group" x="32" y="104" width="896" height="440" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">token exchange</text>
    <rect class="fg-group" x="32" y="568" width="896" height="272" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="596">resource access</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="840"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="840"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="840"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Relying Party</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">your web app</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OpenID Provider</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Resource Server</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">your API</text>
    <!-- phase 3 -->
    <path class="fg-edge" d="M192,152 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="158">verify state</text>
    <text class="fg-xs" x="248" y="180">must match the stored value</text>
    <path class="fg-edge" d="M192,256 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="222" text-anchor="middle">POST /token · client auth</text>
    <text class="fg-mxs" x="352" y="244" text-anchor="middle">code · code_verifier</text>
    <path class="fg-edge fg-edge--accent" d="M512,296 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="568" y="302">verify PKCE</text>
    <text class="fg-mxs" x="568" y="324">S256(code_verifier)</text>
    <text class="fg-mxs" x="568" y="346">== code_challenge</text>
    <path class="fg-edge fg-edge--accent" d="M512,424 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="390" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="352" y="412" text-anchor="middle">access_token · id_token</text>
    <path class="fg-edge" d="M192,464 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="470">verify the ID token</text>
    <text class="fg-mxs" x="248" y="492">iss · aud · exp · nonce</text>
    <text class="fg-xs" x="248" y="514">then set the session cookie</text>
    <!-- phase 4 -->
    <path class="fg-edge" d="M192,670 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="636" text-anchor="middle">GET /api/me</text>
    <text class="fg-mxs fg-halo" x="508" y="658" text-anchor="middle">Authorization: Bearer &lt;access_token&gt;</text>
    <path class="fg-edge fg-edge--muted" d="M824,742 H512" marker-end="url(#fg-am)"/>
    <text class="fg-m" x="668" y="708" text-anchor="middle">/introspect</text>
    <text class="fg-xs" x="668" y="730" text-anchor="middle">optional, or verify JWT locally</text>
    <path class="fg-edge" d="M824,814 H192" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="804" text-anchor="middle">200 OK · { data }</text>
  </svg>
  <figcaption class="fig-note">The verifier appears only in the <code>/token</code> request, so a code intercepted in the redirect is useless without it: the OP accepts the code only from whoever knows the verifier behind the challenge it saw earlier. The RP still checks the ID token <code>nonce</code> before it trusts the login.</figcaption>
</figure>

## Parameter glossary

Pages on this site write the authorization endpoint as `/auth`, the library default. With default routing the OP mounts under `/oidc`, so the authorization endpoint is served at `/oidc/auth` and the token endpoint at `/oidc/token`.

| Parameter | Sent at | Purpose |
|---|---|---|
| `response_type=code` | `/auth` | Asks for the authorization-code grant. |
| `client_id` | `/auth`, `/token` | Identifies the registered RP. |
| `redirect_uri` | `/auth` (and echoed at `/token`) | Where the OP sends the user back. **Exact match** against the registered list. |
| `scope` | `/auth` | Permissions requested. Must include `openid` for OIDC. |
| `state` | `/auth` | Random opaque value the RP echoes on callback. CSRF defense for the redirect. |
| `nonce` | `/auth` | Random value bound into the ID Token's `nonce` claim. Replay defense. |
| `code_challenge` | `/auth` | `BASE64URL(SHA256(code_verifier))`. |
| `code_challenge_method` | `/auth` | `S256` (the only one this library accepts). |
| `code` | `/auth` response | Single-use. Valid for 60 seconds; RFC 6749 §4.1.2 recommends a 10-minute maximum. |
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

**`code_challenge`** is what the RP sends to the OP at `/auth`. With `code_challenge_method=S256`, it's `BASE64URL(SHA-256(code_verifier))` — a one-way hash. The OP can't reverse it; only the RP can prove ownership later by sending the verifier itself.

**`S256`** is the SHA-256-based transform; it's the only `code_challenge_method` this library accepts. The legacy `plain` method (where challenge equals verifier) provides no protection against an attacker who reads the URL, so RFC 9700 forbids it for new deployments.
:::

::: details `redirect_uri` — strict exact-match, and why
The `redirect_uri` on `/auth` is checked **byte-for-byte** against the client's registered list — no tail-slash normalisation, no path-prefix matches, no wildcards. That strictness is on purpose: open-redirect bugs and "any subpath of `https://app.example.com/`" patterns are a well-trodden way to leak codes to attacker-controlled URLs. RFC 9700 §2.1 requires exact match, and this library enforces it. At `/token`, the RP must repeat the *same* `redirect_uri` it sent on `/auth`; a mismatch returns `invalid_grant`.
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

1. The legit RP generates a random `code_verifier` and sends only `SHA256(code_verifier)` (the `code_challenge`) to `/auth`.
2. The OP stores `code_challenge` alongside the issued code.
3. At `/token`, the OP requires `code_verifier` and recomputes the SHA-256.
4. The malicious app saw the code but never saw the verifier — its `/token` call fails.

This works even when the RP can't store a client secret (SPA / native).
:::

## How this library enforces it

| Behaviour | Where |
|---|---|
| `code_challenge_method=plain` is **rejected** — only `S256` accepted. | `internal/pkce` |
| An authorization request without `code_challenge` is rejected with `invalid_request` for public and native clients, and for every client under `Baseline`, `FAPI2Baseline`, and `FAPI2MessageSigning`. | `internal/authorize` |
| `code_verifier` length and char-set are validated against RFC 7636 §4.1. | `internal/pkce` |
| A mismatch returns RFC 6749 §5.2 `invalid_grant` at `/token` (not `/auth`). | `internal/tokenendpoint/authcode.go` |
| A public client's code that was issued without a challenge is refused at `/token` with `invalid_grant`, even if the request carries a verifier. | `internal/tokenendpoint/authcode_enforce.go` |
| A code that was issued with a challenge refuses a request without a matching verifier, and a code issued without one refuses any verifier. | `internal/grants/authcode` |
| A wrong client, a different `redirect_uri`, or a failed PKCE check rejects the request without spending the code. Only a second redemption of an already-used code counts as a replay and revokes the grant's tokens (RFC 6749 §4.1.2). | `internal/grants/authcode` |

## Common errors and what they mean

| Wire error | Cause | Where to look |
|---|---|---|
| `invalid_request` (at `/auth`) | `code_challenge` missing for a client that needs PKCE | Send `code_challenge` with `code_challenge_method=S256` |
| `invalid_request` `code_challenge_method` | Client sent `plain`, or no method | Send `S256` |
| `unsupported_response_type` | `response_type` is not `code` | Use `response_type=code` |
| `invalid_request_uri` | PAR `request_uri` unknown, expired, or already used to issue a code | Push a new PAR request |
| `invalid_grant` (at `/token`) | `code_verifier` doesn't match, or the code is unknown, used, or expired | Don't reuse codes; restart the flow |
| `invalid_grant` (at `/token`) | The `redirect_uri` at `/token` differs from `/auth` | They must be byte-identical |

## Run the flow yourself

`examples/01-minimal` runs this exact flow in one process: an OP with a public client plus a small RP that generates `state`, `nonce`, and the PKCE pair, then verifies the ID Token. Start there, sign in as `demo` / `demo`, and read the redirect URLs in the browser. `examples/03-fapi2` is the same flow hardened with PAR, `private_key_jwt` client authentication, and a DPoP-bound access token under `FAPI2Baseline`. The [OFCS results](/compliance/ofcs) cover the named Implementer's Draft plans.

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — how PKCE upgrades to "the access token only works for the client that got it."
- [Refresh tokens](/concepts/refresh-tokens) — what to do when the access token expires.
