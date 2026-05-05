---
title: FAPI 2.0 primer
description: What FAPI is, why it exists, and what each of its mandates buys you. Aimed at engineers approaching FAPI for the first time.
---

# FAPI 2.0 — a primer

**FAPI** stands for **Financial-grade API**. It's a security profile family maintained by the OpenID Foundation that builds on top of OAuth 2.0 + OIDC, removing the optional choices the underlying specs allow but that have been abused in production.

The original target was open banking — UK, Australian, and Brazilian regulators require FAPI-grade OAuth between banks and third-party fintechs. The same profile is increasingly adopted in healthcare, government identity, and any setting where "we follow the RFC" isn't a sufficient audit answer.

::: details Open Banking — what is it?
"Open Banking" is the regulatory framework that lets a customer authorize a third-party app to read account data or initiate payments on their behalf, instead of handing the third party their bank password. The UK's PSD2-driven Open Banking (2018), Brazil's Open Finance (2020), and Australia's Consumer Data Right (2020) are the largest examples. Each programme picked FAPI as the technical contract. If you're not in this regulated space you don't need FAPI for compliance reasons — but the same profile is a sensible default any time you'd find a CVE-class vulnerability hard to live with.
:::

::: details Specs referenced on this page
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — Final
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html)
- [FAPI 2.0 Attacker Model](https://openid.net/specs/fapi-2_0-attacker-model.html)
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [JARM](https://openid.net/specs/oauth-v2-jarm.html) — JWT-Secured Authorization Response Mode
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

## Why a profile, not just "OIDC plus best practices"

OIDC and OAuth 2.0 leave many things optional:

- The authorize request can travel as a plain query string.
- `redirect_uri` may be substring-matched.
- Signing algorithms can include `RS256`, `none`, `HS256`.
- Client authentication can be `client_secret_basic` (a long-lived shared secret).

Every one of those has produced a production CVE class.

A **profile** is a contract that says "for this deployment, the choices are fixed." FAPI 2.0 picks the secure subset and forbids the rest. Compliance becomes a checklist instead of an argument.

## FAPI 1.0 vs FAPI 2.0

You may still see references to FAPI 1.0 (split into "Read-Only" and "Read-Write"). FAPI 2.0 is the modern successor — simpler, formally verified threat model, easier to certify against:

| | FAPI 1.0 (still in use) | FAPI 2.0 |
|---|---|---|
| Bands | Read-Only / Read-Write | Baseline / Message Signing |
| Authorize request transport | Optional `request` JWT | **PAR mandatory** |
| Sender constraint | mTLS or holder-of-key | **DPoP or mTLS mandatory** |
| `response_type` | Allowed `code id_token` (hybrid) | `code` only |
| Algorithm list | Negotiated via metadata | Fixed allow-list |

::: details FAPI 1.0 Read-Only / Read-Write — what's the difference?
FAPI 1.0 had two bands. **Read-Only** was for use cases that only retrieved data (e.g. an app reading your account balance). **Read-Write** added requirements for use cases that initiated state changes (e.g. an app instructing a payment) — request signing, response signing, holder-of-key. FAPI 2.0 dropped this split because the threat model turned out to be the same once any third party was in the picture; instead, FAPI 2.0 exposes the choice as **Baseline vs Message Signing**, where the latter adds non-repudiation rather than any extra security boundary.
:::

`go-oidc-provider` targets FAPI 2.0; FAPI 1.0 is not supported.

## Baseline vs Message Signing

FAPI 2.0 has two bands:

::: tip Baseline — the floor
Pushed Authorization Requests (PAR), PKCE, DPoP **or** mTLS, ES256 / PS256 signing, exact `redirect_uri` matching, `private_key_jwt` / mTLS client authentication. This is the floor for any FAPI 2.0 deployment.
:::

::: tip Message Signing — non-repudiation
On top of Baseline: **JAR** (the authorize request itself is a signed JWT), **JARM** (the authorize response is signed too), **DPoP nonce** required, RS-side response signing. The result is full non-repudiation: every request and response is cryptographically attributable to its sender.

UK Open Banking and Brazil Open Insurance mandate Message Signing.
:::

::: details Message signing — what does that buy you?
"Message signing" means every business message (the authorize request, the authorize response, the API request and response) is wrapped in a JWS the sender produces. The receiver verifies the signature against the sender's published public key. The non-repudiation property follows: months later, neither party can plausibly claim "I never sent that" — the signature names them. Baseline ensures *channel* security; Message Signing additionally creates an *audit-grade* paper trail. You want it when transactions move money or trigger irreversible actions.
:::

::: details JWS — what is that?
**JWS** = "JSON Web Signature" (RFC 7515). The signed-blob construction underneath JWT. A JWT is a JWS whose payload happens to be a JSON object of standard claims. When FAPI talks about "signed authorize request" or "signed response," it means a JWS whose payload is the request/response object. Signing algorithms (`ES256`, `PS256`) are JWS-level concepts.
:::

## What each acronym actually does

::: details PAR — Pushed Authorization Request (RFC 9126)
The classical OAuth flow has the RP build an `/authorize?...` URL with all parameters in the query string and tell the browser to navigate there. Anyone in the middle (browser extensions, intermediary proxies, referrer leaks, server logs) sees the parameters.

PAR has the RP first POST the parameters to the OP's `/par` endpoint **directly, server-to-server** with client authentication. The OP returns a short-lived `request_uri` such as `urn:ietf:params:oauth:request_uri:abc...`. The browser is then redirected to `/authorize?request_uri=urn:...&client_id=...` and the OP looks up the original parameters internally.

Result: sensitive parameters never travel through the browser.
:::

::: details `request_uri` — what is it?
A reference to a server-side stash of the authorize parameters. PAR returns a `request_uri` whose URN-form value points to a one-time row the OP keeps for ~60 seconds. The browser replays only the URN and the `client_id` to `/authorize`; the OP joins them back to the stashed parameters. The `request_uri` mechanism predates PAR (RFC 9101 also uses it for inline `request` JWTs hosted at an HTTPS URL) — PAR specialises it to "the OP itself hosts the URI" and locks the lifetime to a single redemption.
:::

::: details JAR — JWT-Secured Authorization Request (RFC 9101)
PAR ensures the parameters reach the OP confidentially. JAR ensures the **OP can prove they came from the legitimate RP**: the parameters are wrapped in a JWT signed with the RP's private key. The OP verifies the signature against the RP's registered public key.

PAR + JAR together give server-to-server delivery **and** cryptographic origin authentication of the authorize request.
:::

::: details JARM — JWT-Secured Authorization Response Mode
The mirror of JAR for the response: the OP signs its authorize **response** (the `code`, `state`, `iss`, etc.) into a JWT. The RP verifies the signature, gaining non-repudiation that "the OP did issue this code to me."

Required by FAPI 2.0 Message Signing.
:::

::: details DPoP / mTLS — sender constraint
Both bind the issued access token to a key the legitimate client holds, so a leaked token alone is useless. See [Sender constraint](/concepts/sender-constraint) for the mechanics.
:::

::: details ES256 / PS256 — why not RS256?
RS256 (RSA-SHA256, PKCS#1 v1.5 padding) is structurally vulnerable to padding-oracle and key-confusion attacks. It's still allowed by OIDC Core but not by FAPI 2.0. PS256 (RSA-PSS) and ES256 (ECDSA on P-256) are the secure replacements. `go-oidc-provider` accepts ES256, EdDSA, and PS256 under the FAPI profile; RS256 is dropped from the surface.
:::

::: details Algorithm allow-list — why a list and not "negotiate"?
"Negotiation" used to be the OAuth way: the client and OP advertise the algorithms they support, then settle on one. The problem is that one party advertising a weak algorithm — `none`, `HS256`, RS256 with PKCS#1 v1.5 — can be tricked into accepting it on a forged token. FAPI fixes the set in advance. The OP's discovery document still lists the algorithms (so clients know what to use), but the **server** refuses to accept anything off the list, regardless of what arrives in a header. This pattern (announce the allow-list, enforce server-side) is how the library handles every alg knob.
:::

::: details `private_key_jwt` / `tls_client_auth` / `self_signed_tls_client_auth` — three ways to authenticate a client
Confidential clients have to prove their identity to the token endpoint. FAPI 2.0 limits the choice to three asymmetric methods:

| Method | Source | What the client presents | OP-side verification |
|---|---|---|---|
| **`private_key_jwt`** | OIDC Core §9 | A short JWT (`iss`, `sub` = its `client_id`, `aud` = the token endpoint, `exp`, `jti`) signed by a registered private key, posted as `client_assertion` on `/token` | Verify the signature against the client's registered JWKS |
| **`tls_client_auth`** | RFC 8705 §2.1.1 | An X.509 certificate presented during the TLS handshake | Validate the chain against a configured trust anchor and match against the registered subject DN / SAN |
| **`self_signed_tls_client_auth`** | RFC 8705 §2.2 | A self-signed X.509 certificate | Match the certificate's public key against the client's registered JWKS (no CA-chain walk) |

All three avoid the `client_secret_basic` failure mode (a long-lived shared secret leaks once and is silently bad forever). Pick whichever fits your existing identity infrastructure — the FAPI profile accepts any of them.
:::

## FAPI 2.0 × RFC mandate matrix

FAPI is a *profile* — it does not reinvent OAuth or OIDC. It tightens which existing RFCs you must implement, and with which options off the menu. The table below maps each FAPI 2.0 family member onto the RFCs it mandates, forbids, or leaves optional, so the question "FAPI says I need X — but what is X exactly?" reduces to a row lookup.

| Spec / RFC | FAPI 2.0 Baseline | FAPI 2.0 Message Signing | FAPI-CIBA |
|---|---|---|---|
| **OAuth 2.0 (RFC 6749)** | required | required | required |
| **OIDC Core 1.0** | required | required | required |
| **PKCE — `S256` only (RFC 7636)** | required | required | n/a (CIBA has no front-channel) |
| **PAR (RFC 9126)** | required | required | n/a (CIBA posts to `/bc-authorize`) |
| **JAR (RFC 9101)** — signed request object | required | required (`PS256` or `ES256`) | required |
| **JARM** — signed authorization response | optional | required | n/a (CIBA has no front-channel) |
| **DPoP (RFC 9449) OR mTLS (RFC 8705)** | one of the two required | one of the two required | one of the two required |
| **Resource Indicators (RFC 8707)** | optional | optional | optional |
| **`iss` parameter on authorization response (RFC 9207)** | required | required | n/a (CIBA has no front-channel) |
| **OAuth 2.0 Security BCP (RFC 9700)** | required | required | required |
| **Token-endpoint client auth** | `private_key_jwt` / `tls_client_auth` / `self_signed_tls_client_auth` | same | same |
| **`client_secret_basic` / `_post` / `_jwt`** | forbidden | forbidden | forbidden |
| **ID Token signing alg** | `PS256`, `ES256`, or `EdDSA` | same | same |
| **`alg=none`** | forbidden | forbidden | forbidden |
| **`RS256` (legacy RSA-PKCS1v15)** | forbidden | forbidden | forbidden |
| **`HS256` and other HMAC alg** | forbidden | forbidden | forbidden |
| **`redirect_uri` exact match** | required | required | n/a (no redirect) |
| **Refresh-token rotation + reuse detection (RFC 9700 §4.14)** | required | required | required |
| **Sender-constrained access tokens (RFC 7800 `cnf`)** | required | required | required |
| **Server-side access-token revocation (FAPI 2.0 SP §5.3.2.2)** | required | required | required |
| **Library option to enable** | `op.WithProfile(profile.FAPI2Baseline)` | `op.WithProfile(profile.FAPI2MessageSigning)` | `op.WithProfile(profile.FAPICIBA)` |

A few of those rows deserve a short prose note.

**Why DPoP *or* mTLS, not both.** Both bind the issued access token to a key the legitimate client holds, so a leaked token alone is useless. The choice is operational rather than security-grade — an embedder picks whichever fits the existing PKI / proxy topology. See [Sender constraint](/concepts/sender-constraint) for the mechanics. The FAPI profile only mandates that *one* of them be active; `op.New` refuses to start a FAPI profile with neither feature flag set.

**Why JARM is required for Message Signing but optional for Baseline.** Message Signing's whole purpose is signed *responses*, not just signed requests — it is the band that gives full non-repudiation, and the authorize response is half of that contract. Baseline gets channel security from PAR; the optional response signing is what the second band adds.

**What "forbidden" means in this library.** The profile gating is enforced at `op.New` time, not at request time: a Baseline-profile OP cannot register a `client_secret_basic` client, cannot advertise `RS256` for ID Token signing, and cannot serve a single token before the constructor has accepted the configuration. The closed-enum design behind the alg refusal is recorded as design judgment [#11](/security/design-judgments#dj-11); the disjunction-and-helper architecture that resolves DPoP-or-mTLS uniformly across handlers is [#7](/security/design-judgments#dj-7).

### See also

- [RFC compliance matrix](/compliance/rfc-matrix) — per-RFC implementation status across the whole library, not only the FAPI subset.
- [Use case — FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — full wiring with a `private_key_jwt` client and DPoP.
- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — what the binding actually does, in detail.
- [CIBA](/concepts/ciba) — the back-channel flow FAPI-CIBA constrains.

## How `go-oidc-provider` makes it one switch

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/profile"
)

op.New(
  /* required options */
  op.WithProfile(profile.FAPI2Baseline),
)
```

The profile call:

1. Auto-enables `feature.PAR`, `feature.JAR`, and `feature.DPoP`.
2. Intersects `token_endpoint_auth_methods_supported` with the FAPI allow-list (`private_key_jwt`, `tls_client_auth`, `self_signed_tls_client_auth`).
3. Locks ID Token signing alg to `ES256` / `PS256`; rejects new issuance under `RS256`.
4. Forces exact-match `redirect_uri` comparison.

Conflicting options layered on top cause `op.New` to refuse to start — partial-FAPI never escapes review.

For Message Signing, swap `profile.FAPI2Baseline` for `profile.FAPI2MessageSigning`. The conformance suite covers both plans; see [OFCS status](/compliance/ofcs).

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — what the binding actually does, in detail.
- [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — full wiring with a `private_key_jwt` client and DPoP.
- [Authorization Code + PKCE](/concepts/authorization-code-pkce) — the flow FAPI 2.0 builds on.
