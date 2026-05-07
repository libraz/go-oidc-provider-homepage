---
title: Claims request parameter
description: OIDC Core 1.0 §5.5 — RP asks for specific claims via the `claims` parameter, OP projects them onto id_token / userinfo.
---

# Use case — Claims request parameter

## What is the `claims` parameter?

By default, the RP picks claims via **scopes**: `scope=openid profile email` asks for the bundle of claims OIDC Core 1.0 §5.4 maps to those scopes (`name`, `given_name`, ..., `email`, `email_verified`). That bundle is fixed.

OIDC Core 1.0 §5.5 adds a finer mechanism: the RP sends a `claims=...` JSON object listing **individual claims** (e.g. just `email_verified` and `phone_number`) and where they should appear (in the `id_token`, in `/userinfo`, or both), with optional `essential` markers and value constraints.

This is most useful for two cases:
1. **Step-up consent** — RP asks for `acr=urn:mace:incommon:iap:silver` as essential to force a higher-assurance authentication.
2. **Privacy-minimising RPs** — RP asks for only the claims it needs, not the full scope bundle.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.4 (scope-to-claim mapping), §5.5 (claims request)
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — Authorization Details (a structured alternative to scopes)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR (when the claims request rides inside a signed request object)
:::

::: details Quick refresher
- **Scope** — a coarse permission bundle (`profile`, `email`, …). One scope maps to a fixed set of claims.
- **Claim request** — a fine-grained, per-claim ask. The RP specifies exactly which claims it wants and where they should appear (`id_token` vs `userinfo`), with optional `essential` markers.
- **Essential vs voluntary** — `{"essential": true}` makes the OP refuse the request if the claim isn't available; `{"essential": false}` (or `null`) lets the OP omit it silently.
:::

> **Source:** [`examples/61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request)

## Wiring

```go
op.New(
  /* required options */
  op.WithClaimsSupported(
    "sub", "iss", "aud", "exp", "iat",
    "email", "email_verified",
    "name", "given_name", "family_name",
    "locale", "zoneinfo",
  ),
)
```

`claims_parameter_supported` defaults to `true`; pass `op.WithClaimsParameterSupported(false)` only when you want to stop advertising and honoring `claims` requests.

The discovery document then advertises:

```json
{
  "claims_parameter_supported": true,
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "email", "email_verified", "name", "given_name", "family_name", "locale", "zoneinfo"]
}
```

## Driving it

```sh
CLAIMS='{"id_token":{"email":{"essential":true}},"userinfo":{"locale":null}}'
curl -G --data-urlencode "claims=$CLAIMS" \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=demo' \
  --data-urlencode 'redirect_uri=http://localhost:5173/callback' \
  --data-urlencode 'scope=openid' \
  --data-urlencode 'code_challenge_method=S256' \
  --data-urlencode "code_challenge=$CHALLENGE" \
  http://localhost:8080/oidc/auth
```

After the flow:

| Place | Outcome |
|---|---|
| `id_token` | `email` is included **and** the OP enforces a re-prompt if the user store doesn't have it (essential) |
| `/userinfo` response | `locale` is included on a best-effort basis (voluntary) |

## Essential vs voluntary

- `{"essential": true}` — the OP **must** include the claim. If the user store doesn't carry the claim and the user can't supply it via the login flow, the OP fails the authorize request with `claim_not_available`.
- `{"essential": false}` or `null` — the OP includes the claim **if it has it**; otherwise silently omits.

## With JAR

When [JAR](/use-cases/fapi2-baseline) is enabled, the `claims` JSON goes inside the request object:

```json
{
  "iss": "client",
  "aud": "https://op.example.com",
  "client_id": "demo",
  "response_type": "code",
  "redirect_uri": "https://rp.example.com/callback",
  "scope": "openid",
  "claims": {"id_token": {"email": {"essential": true}}}
}
```

The library parses both shapes — query parameter and JAR-embedded — through the same merge path.

## Authorization Details (RFC 9396)

The library also accepts the RFC 9396 `authorization_details` array on the same merge path; the format is JSON-array vs JSON-object, and the library distinguishes them by shape rather than asking embedders to opt in separately.

## Read next

- [Tokens primer](/concepts/tokens) — what claims live where.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — JAR + claims combined.
