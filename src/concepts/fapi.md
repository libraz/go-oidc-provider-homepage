---
title: FAPI 2.0 primer
description: What FAPI is, why it exists, and what each of its mandates buys you. Aimed at engineers approaching FAPI for the first time.
pageClass: pg-concepts-fapi
---

# FAPI 2.0 — a primer

**FAPI** stands for **Financial-grade API**. It is a family of high-security profiles maintained by the OpenID Foundation and based on OAuth 2.0. The FAPI 2.0 Security Profile uses OpenID Connect when a deployment needs to return an authenticated user's identifier, but it does not require OIDC for every use case.

The original target was open banking. Open banking and open finance schemes in the UK, Australia, Brazil, and elsewhere have used FAPI or related regional profiles between banks and third-party fintechs. The same profile is increasingly adopted in healthcare, government identity, and any setting where "we follow the RFC" isn't a sufficient audit answer.

::: details Open Banking — what is it?
"Open Banking" is the regulatory framework that lets a customer authorize a third-party app to read account data or initiate payments on their behalf, instead of handing the third party their bank password. The UK's PSD2-driven Open Banking (2018), Brazil's Open Finance (2020), and Australia's Consumer Data Right (2020) are the largest examples. Their security standards have used FAPI and related profiles in different versions and combinations. If you're not in this regulated space you don't need FAPI for compliance reasons — but the same profile is a sensible default any time you'd find a CVE-class vulnerability hard to live with.
:::

::: details Specs referenced on this page
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — Final (the former Baseline specification)
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-message-signing-2_0.html) — Final
- [FAPI 2.0 Attacker Model](https://openid.net/specs/fapi-attacker-model-2_0-final.html) — Final
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [JARM](https://openid.net/specs/oauth-v2-jarm.html) — JWT-Secured Authorization Response Mode
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

## Why a profile, not just "OIDC plus best practices"

OAuth 2.0 and related specifications leave many deployment choices open:

- The authorize request can travel as a plain query string.
- Implementations may expose more signing algorithms than a high-security deployment needs.
- Client authentication can use `client_secret_basic` (a long-lived shared secret).

Those choices have contributed to serious implementation vulnerabilities when they are combined incorrectly.

A **profile** is a contract that fixes the security-critical choices for a deployment. FAPI 2.0 fixes those choices and leaves explicit options where the underlying specifications allow them. Compliance becomes a checklist instead of an argument.

## FAPI 1.0 vs FAPI 2.0

You may still see references to FAPI 1.0 (split into "Read-Only" and "Read-Write"). FAPI 2.0 is its successor with a formally analysed attacker model and a single general-purpose security profile. Message Signing is a separate FAPI 2.0 profile that adds non-repudiation methods:

| | FAPI 1.0 (still in use) | FAPI 2.0 |
|---|---|---|
| Profiles | Read-Only / Read-Write | Security Profile / Message Signing |
| Authorize request transport | Optional `request` JWT | **PAR mandatory** |
| Sender constraint | mTLS or holder-of-key | **DPoP or mTLS mandatory** |
| `response_type` | Allowed `code id_token` (hybrid) | `code` only |
| JWT algorithms | Profile-specific choices | `PS256`, `ES256`, or `EdDSA` |

::: details FAPI 1.0 Read-Only / Read-Write — what's the difference?
FAPI 1.0 had two profiles. **Read-Only** was for use cases that only retrieved data (for example, an app reading an account balance). **Read-Write** added requirements for use cases that initiated state changes (for example, an app instructing a payment). FAPI 2.0 uses the Security Profile as its general security baseline and defines Message Signing separately for deployments that need non-repudiation. Message Signing does not replace the Security Profile; it extends it.
:::

`go-oidc-provider` targets FAPI 2.0; FAPI 1.0 is not supported.

## Security Profile and Message Signing

FAPI 2.0 has a general Security Profile and a separate Message Signing profile. The Go library keeps the historical `profile.FAPI2Baseline` identifier for the former.

<figure class="fig">
  <div class="fig-head">What each FAPI layer adds</div>
  <svg class="fig-svg" role="img" aria-labelledby="fapi-layers-title" viewBox="0 0 960 336" xmlns="http://www.w3.org/2000/svg">
    <title id="fapi-layers-title">The FAPI 2.0 profiles. The base specifications leave many options open; the Security Profile fixes a high-security baseline; Message Signing adds separately testable signed authorization requests, signed authorization responses, and signed introspection responses.</title>
    <!-- message signing -->
    <rect class="fg-box fg-box--accent" x="36" y="24" width="664" height="102" rx="8"/>
    <text class="fg-t fg-accent" x="56" y="52">FAPI 2.0 Message Signing</text>
    <text class="fg-xs" x="56" y="74">Security Profile, plus JAR, JARM or signed introspection</text>
    <text class="fg-xs" x="56" y="94">each signing method can be implemented and tested separately</text>
    <text class="fg-mxs" x="56" y="116">op.WithProfile(profile.FAPI2MessageSigning)</text>
    <path class="fg-leader" d="M704,44 H736 M704,80 H736"/>
    <rect class="fg-box fg-box--muted" x="740" y="32" width="184" height="24" rx="4"/>
    <text class="fg-lbl" x="756" y="48">audit trail</text>
    <rect class="fg-box fg-box--muted" x="740" y="68" width="184" height="24" rx="4"/>
    <text class="fg-lbl" x="756" y="84">non-repudiation</text>
    <!-- security profile -->
    <rect class="fg-box" x="36" y="138" width="664" height="88" rx="8"/>
    <text class="fg-t" x="56" y="166">FAPI 2.0 Security Profile</text>
    <text class="fg-xs" x="56" y="188">PAR · PKCE S256 · confidential clients · DPoP or mTLS</text>
    <text class="fg-mxs" x="56" y="212">op.WithProfile(profile.FAPI2Baseline)</text>
    <path class="fg-leader" d="M704,182 H736"/>
    <rect class="fg-box fg-box--muted" x="740" y="170" width="184" height="24" rx="4"/>
    <text class="fg-lbl" x="756" y="186">safety floor</text>
    <!-- base -->
    <rect class="fg-box fg-box--muted" x="36" y="238" width="664" height="74" rx="8"/>
    <text class="fg-t" x="56" y="266">OAuth 2.0 + OpenID Connect</text>
    <text class="fg-xs" x="56" y="288">the base specifications — many options, some dangerous in combination</text>
    <path class="fg-leader" d="M704,275 H736"/>
    <rect class="fg-box fg-box--muted" x="740" y="263" width="184" height="24" rx="4"/>
    <text class="fg-lbl" x="756" y="279">transport</text>
  </svg>
  <figcaption class="fig-note">The Security Profile fixes the high-security choices in the underlying specifications. Message Signing adds application-level signatures for selected OAuth messages; it does not wrap every API request and response in a JWS.</figcaption>
</figure>

FAPI is not a separate protocol. It fixes how OAuth 2.0 and its related specifications are used for a high-security deployment, which is why the diagram places the profiles on top of the base specifications.

::: tip Security Profile — the required baseline
The FAPI 2.0 Security Profile requires confidential clients, sender-constrained access tokens using DPoP **or** mTLS, PAR, PKCE with `S256`, `response_type=code`, an `iss` authorization-response parameter, and secure TLS endpoints. Token-endpoint client authentication uses mTLS or `private_key_jwt`. Its JWT algorithm set is `PS256`, `ES256`, or `EdDSA`; it does not require JAR or an ES256-only implementation.
:::

::: tip Message Signing — non-repudiation
Message Signing inherits the Security Profile and defines three independently testable methods: JAR-signed pushed authorization request objects, JARM-signed authorization responses, and signed introspection responses using RFC 9701. It does not require DPoP nonces and does not sign every resource request or response. The library's `profile.FAPI2MessageSigning` auto-enables PAR, JAR, and JARM; when `feature.Introspect` is also enabled, it forces that endpoint to emit signed introspection responses. With DPoP active, the library validator also requires `WithDPoPNonceSource`; that is a library constraint, not a Message Signing requirement. The profile does not mount the introspection endpoint itself.

Regional open banking and open insurance schemes may add message-signing requirements; check the scheme's current security standard separately from the FAPI specification.
:::

::: details Message signing — what does that buy you?
"Message signing" in FAPI 2.0 covers selected OAuth messages: a JAR-signed pushed authorization request object sent to PAR, the JARM-signed authorization response, and the signed introspection response. With PAR, the browser's front-channel request carries only `request_uri` and `client_id`; it is not a separately signed authorization request for non-repudiation. The receiver verifies the signature against the sender's published public key. The profile does not define a JWS wrapper for every resource API request and response.
:::

::: details JWS — what is that?
**JWS** = "JSON Web Signature" (RFC 7515). It is a signed representation whose payload can be arbitrary bytes. A signed JWT uses the JWS compact serialization with a JSON claims payload; a JWT can also be encrypted as a JWE. When FAPI talks about a signed authorization request or response, it means the corresponding protocol object is carried in a signed JWT or JWS as required by that method.
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
JARM carries the authorization **response** (`code`, `state`, `iss`, and errors) in a JWT signed by the OP. The RP verifies the signature and claims before processing the response. FAPI 2.0 Message Signing defines this as the signed-authorization-response method; the library's `profile.FAPI2MessageSigning` requires it.
:::

::: details DPoP / mTLS — sender constraint
Both bind the issued access token to a key the legitimate client holds, so a leaked token alone is useless. See [Sender constraint](/concepts/sender-constraint) for the mechanics.
:::

::: details FAPI JWT algorithms — why not RS256?
The FAPI 2.0 Security Profile requires `PS256`, `ES256`, or `EdDSA` (Ed25519) for JWT processing and forbids `none`; `RS256` is therefore outside the profile's set. The library makes a narrower implementation choice for OP-issued JWTs and uses ES256, while accepting `PS256`, `ES256`, and `EdDSA` for client-signed objects. The library choice is not an ES256-only requirement of the Final Security Profile.
:::

::: details Algorithm allow-list — why a list and not "negotiate"?
The FAPI 2.0 Security Profile fixes the JWT algorithm set in advance: `PS256`, `ES256`, or `EdDSA`, and no `none`. Discovery can advertise the algorithms a deployment accepts, but the **server** must enforce its allow-list when it verifies a JWT. The library applies its own closed allow-lists at each JOSE surface; its ES256-only OP signing policy is an implementation choice.
:::

::: details `private_key_jwt` — FAPI client authentication
Confidential clients have to prove their identity to the token endpoint. The FAPI 2.0 Security Profile permits mTLS client authentication or `private_key_jwt`; mTLS has the `tls_client_auth` and `self_signed_tls_client_auth` variants defined by RFC 8705:

| Method | Source | What the client presents | OP-side verification |
|---|---|---|---|
| **`private_key_jwt`** | OIDC Core §9 | A short JWT (`iss`, `sub` = its `client_id`, `aud` = the authorization server's issuer URL as a string under the Final FAPI profile, `exp`, `jti`) signed by a registered private key, posted as `client_assertion` on `/token` | Verify the signature against the client's registered JWKS |
| **`tls_client_auth`** | RFC 8705 §2.1.1 | An X.509 certificate presented during the TLS handshake | Validate the chain against a configured trust anchor and match against the registered subject DN / SAN |
| **`self_signed_tls_client_auth`** | RFC 8705 §2.2 | A self-signed X.509 certificate | Match the certificate's public key against the client's registered JWKS (no CA-chain walk) |

Both classes avoid the `client_secret_basic` failure mode (a long-lived shared secret leaks once and remains compromised until it is replaced).

Implementation note: this library advertises and dispatches `private_key_jwt` for token-endpoint authentication under its FAPI profiles. Its mTLS verifier supplies certificate-bound tokens, but `tls_client_auth` and `self_signed_tls_client_auth` are not dispatched as token-endpoint authentication methods. That is a library limitation, not a restriction in the Final Security Profile.

The Final Security Profile requires the `aud` claim to be the issuer identifier as a string. This library's verifier also accepts the token-endpoint URL and a JSON array form for interoperability, so a deployment using those alternatives must not claim Final Security Profile conformance without an additional enforcement layer.
:::

## FAPI 2.0 × RFC requirement matrix

FAPI is a *profile* — it does not reinvent OAuth or OIDC. It tightens how the existing specifications are used. The table separates the Final Security Profile from the independently testable Message Signing methods and from library-specific settings.

| Spec / RFC | FAPI 2.0 Security Profile | FAPI 2.0 Message Signing | FAPI-CIBA |
|---|---|---|---|
| **OAuth 2.0 (RFC 6749)** | required | inherited | profile-specific |
| **OIDC Core 1.0** | conditional: needed when an authenticated user identifier is returned | inherited | profile-specific |
| **PKCE — `S256` only (RFC 7636)** | required for authorization code | inherited | n/a (CIBA has no front-channel) |
| **PAR (RFC 9126)** | required | inherited | n/a (CIBA posts to `/bc-authorize`) |
| **JAR (RFC 9101)** — signed request object | optional | optional signed-authorization-request method | profile-specific |
| **JARM** — signed authorization response | optional | optional signed-authorization-response method | n/a (CIBA has no front-channel) |
| **Signed introspection response (RFC 9701)** | optional | optional signed-introspection-response method | profile-specific |
| **DPoP (RFC 9449) OR mTLS (RFC 8705)** | one of the two required | inherited | profile-specific |
| **Resource Indicators (RFC 8707)** | optional | inherited | profile-specific |
| **`iss` parameter on authorization response (RFC 9207)** | required | inherited | n/a (CIBA has no front-channel) |
| **OAuth 2.0 Security BCP (RFC 9700)** | followed by profile | inherited | profile-specific |
| **Token-endpoint client auth** | mTLS or `private_key_jwt` | inherited | profile-specific |
| **`client_secret_basic` / `_post` / `_jwt`** | not permitted | inherited | profile-specific |
| **JWT signing alg** | `PS256`, `ES256`, or `EdDSA`; `none` is forbidden | inherited | profile-specific |
| **`redirect_uri` in PAR** | required | inherited | n/a (no redirect) |
| **Refresh-token rotation** | prohibited except extraordinary circumstances | inherited | profile-specific |
| **Sender-constrained access tokens** | required | inherited | profile-specific |
| **Library option to enable** | `op.WithProfile(profile.FAPI2Baseline)` | `op.WithProfile(profile.FAPI2MessageSigning)` | `op.WithProfile(profile.FAPICIBA)` |

A few rows deserve a short prose note.

**Why DPoP *or* mTLS.** Both bind an access token to a key the legitimate client holds, so a leaked token alone is useless. The choice is operational: select the method that fits the existing PKI or proxy topology. See [Sender constraint](/concepts/sender-constraint) for the mechanics. The Final Security Profile requires one method; when neither is configured explicitly, this library selects DPoP as its default.

**Why JAR and JARM are separate methods.** Message Signing defines signed authorization requests, signed authorization responses, and signed introspection responses as distinct methods. An implementation can select the methods its deployment needs. `profile.FAPI2MessageSigning` is a library setting that auto-enables PAR, JAR, and JARM. If the separately enabled `feature.Introspect` mounts `/introspect`, the profile forces that endpoint's successful responses into the signed RFC 9701 format. When DPoP is active, the library profile also requires a configured DPoP nonce source; the Final Message Signing specification does not.

**What differs in this library.** `profile.FAPI2Baseline` auto-enables PAR and JAR, restricts token-endpoint client authentication to `private_key_jwt`, uses ES256 for OP-issued JWTs, and enforces exact redirect-URI matching. These are implementation choices or stricter settings; they must not be presented as additional Final Security Profile requirements. The library also rotates refresh tokens in its normal refresh flow, whereas the Final Security Profile prohibits routine rotation and allows it only in extraordinary circumstances. Review the running configuration before making a conformance claim.

### See also

- [RFC compliance matrix](/compliance/rfc-matrix) — per-RFC implementation status across the whole library, not only the FAPI subset.
- [Use case — FAPI 2.0 Security Profile](/use-cases/fapi2-baseline) — full wiring with a `private_key_jwt` client and DPoP.
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

1. Auto-enables `feature.PAR` and `feature.JAR` as library settings. JAR is optional in the Final Security Profile.
2. Intersects `token_endpoint_auth_methods_supported` with the library's FAPI allow-list. Use `private_key_jwt` for the token-endpoint client-auth path; mTLS remains available for sender-constrained access tokens.
3. Requires at least one sender-constraint feature: explicit `feature.MTLS` is preserved, otherwise `feature.DPoP` is selected as the canonical default.
4. Locks OP-issued ID Tokens to `ES256`; this is a library policy, while the Final Security Profile allows `PS256`, `ES256`, or `EdDSA`.
5. Forces exact-match `redirect_uri` comparison as a library policy.

The library's refresh flow also rotates refresh tokens during normal use. The Final Security Profile prohibits routine refresh-token rotation, so this setting alone is not evidence of Final conformance.

Options that conflict with the profile cause `op.New` to refuse to start; the constructor catches those detected conflicts before the OP is created.

To select the library's Message Signing profile, use `profile.FAPI2MessageSigning` instead of `profile.FAPI2Baseline`; when DPoP is active, also configure `WithDPoPNonceSource`. The conformance suite covers both settings; see [OFCS status](/compliance/ofcs).

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — what the binding actually does, in detail.
- [Use case: FAPI 2.0 Security Profile](/use-cases/fapi2-baseline) — full wiring with a `private_key_jwt` client and DPoP.
- [Authorization Code + PKCE](/concepts/authorization-code-pkce) — the flow FAPI 2.0 builds on.
