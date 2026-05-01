---
title: FAPI 2.0 primer
description: What FAPI is, why it exists, and what each of its mandates buys you. Aimed at engineers approaching FAPI for the first time.
---

# FAPI 2.0 — a primer

**FAPI** stands for **Financial-grade API**. It's a security profile family
maintained by the OpenID Foundation that builds on top of OAuth 2.0 + OIDC,
removing the optional choices the underlying specs allow but that have been
abused in production.

The original target was open banking — UK, Australian, and Brazilian
regulators require FAPI-grade OAuth between banks and third-party fintechs.
The same profile is increasingly adopted in healthcare, government identity,
and any setting where "we follow the RFC" isn't a sufficient audit answer.

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

A **profile** is a contract that says "for this deployment, the choices are
fixed." FAPI 2.0 picks the secure subset and forbids the rest. Compliance
becomes a checklist instead of an argument.

## FAPI 1.0 vs FAPI 2.0

You may still see references to FAPI 1.0 (split into "Read-Only" and
"Read-Write"). FAPI 2.0 is the modern successor — simpler, formally
verified threat model, easier to certify against:

| | FAPI 1.0 (still in use) | FAPI 2.0 |
|---|---|---|
| Bands | Read-Only / Read-Write | Baseline / Message Signing |
| Authorize request transport | Optional `request` JWT | **PAR mandatory** |
| Sender constraint | mTLS or holder-of-key | **DPoP or mTLS mandatory** |
| `response_type` | Allowed `code id_token` (hybrid) | `code` only |
| Algorithm list | Negotiated via metadata | Fixed allow-list |

`go-oidc-provider` targets FAPI 2.0; FAPI 1.0 is not supported.

## Baseline vs Message Signing

FAPI 2.0 has two bands:

::: tip Baseline — the floor
Pushed Authorization Requests (PAR), PKCE, DPoP **or** mTLS, ES256 / PS256
signing, exact `redirect_uri` matching, `private_key_jwt` / mTLS client
authentication. This is the floor for any FAPI 2.0 deployment.
:::

::: tip Message Signing — non-repudiation
On top of Baseline: **JAR** (the authorize request itself is a signed
JWT), **JARM** (the authorize response is signed too), **DPoP nonce**
required, RS-side response signing. The result is full
non-repudiation: every request and response is cryptographically
attributable to its sender.

UK Open Banking and Brazil Open Insurance mandate Message Signing.
:::

## What each acronym actually does

::: details PAR — Pushed Authorization Request (RFC 9126)
The classical OAuth flow has the RP build an `/authorize?...` URL with
all parameters in the query string and tell the browser to navigate
there. Anyone in the middle (browser extensions, intermediary proxies,
referrer leaks, server logs) sees the parameters.

PAR has the RP first POST the parameters to the OP's `/par` endpoint
**directly, server-to-server** with client authentication. The OP
returns a short-lived `request_uri` such as
`urn:ietf:params:oauth:request_uri:abc...`. The browser is then
redirected to `/authorize?request_uri=urn:...&client_id=...` and the
OP looks up the original parameters internally.

Result: sensitive parameters never travel through the browser.
:::

::: details JAR — JWT-Secured Authorization Request (RFC 9101)
PAR ensures the parameters reach the OP confidentially. JAR ensures
the **OP can prove they came from the legitimate RP**: the parameters
are wrapped in a JWT signed with the RP's private key. The OP
verifies the signature against the RP's registered public key.

PAR + JAR together give server-to-server delivery **and**
cryptographic origin authentication of the authorize request.
:::

::: details JARM — JWT-Secured Authorization Response Mode
The mirror of JAR for the response: the OP signs its authorize
**response** (the `code`, `state`, `iss`, etc.) into a JWT. The RP
verifies the signature, gaining non-repudiation that "the OP did
issue this code to me."

Required by FAPI 2.0 Message Signing.
:::

::: details DPoP / mTLS — sender constraint
Both bind the issued access token to a key the legitimate client
holds, so a leaked token alone is useless. See
[Sender constraint](/concepts/sender-constraint) for the mechanics.
:::

::: details ES256 / PS256 — why not RS256?
RS256 (RSA-SHA256, PKCS#1 v1.5 padding) is structurally vulnerable to
padding-oracle and key-confusion attacks. It's still allowed by OIDC
Core but not by FAPI 2.0. PS256 (RSA-PSS) and ES256 (ECDSA on P-256)
are the secure replacements. `go-oidc-provider` accepts ES256, EdDSA,
and PS256 under the FAPI profile; RS256 is dropped from the surface.
:::

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
2. Intersects `token_endpoint_auth_methods_supported` with the FAPI
   allow-list (`private_key_jwt`, `tls_client_auth`,
   `self_signed_tls_client_auth`).
3. Locks ID Token signing alg to `ES256` / `PS256`; rejects new
   issuance under `RS256`.
4. Forces exact-match `redirect_uri` comparison.

Conflicting options layered on top cause `op.New` to refuse to start —
partial-FAPI never escapes review.

For Message Signing, swap `profile.FAPI2Baseline` for
`profile.FAPI2MessageSigning`. The conformance suite covers both
plans; see [OFCS status](/compliance/ofcs).

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — what
  the binding actually does, in detail.
- [Use case: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — full wiring
  with a `private_key_jwt` client and DPoP.
- [Authorization Code + PKCE](/concepts/authorization-code-pkce) — the
  flow FAPI 2.0 builds on.
