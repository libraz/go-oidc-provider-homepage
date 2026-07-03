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
- **Essential vs voluntary** — for an ordinary claim, `essential` is a hint, not an enforcement lever: the OP makes a best-effort attempt and silently omits the claim if it isn't available, same as a voluntary request. The one exception is `acr`: an essential `acr` request the current session doesn't satisfy forces re-authentication (see [MFA / step-up](/use-cases/mfa-step-up)).
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
| `id_token` | `email` is included if the user store has it; if not, the OP silently omits it (essential only means "attempt harder", not "fail if absent") |
| `/userinfo` response | `locale` is included on a best-effort basis (voluntary) |

## Essential vs voluntary

For ordinary claims (anything other than `acr`), `essential` does not change what the OP is willing to fail on. OIDC Core 1.0 §5.5 only says the OP "MUST attempt to provide" an essential claim, and it stops there — it does not require the OP to refuse the request when the claim is absent.

- `{"essential": true}` — the OP looks the claim up and includes it if the value exists; if the user store doesn't carry the claim, the OP silently omits it, exactly as it would for a voluntary request. There is no error code and no re-prompt tied to a missing ordinary claim.
- `{"essential": false}` or `null` — the OP includes the claim **if it has it**; otherwise silently omits.

The one claim where `essential` has real teeth is `acr`. An essential `acr` request (`{"id_token":{"acr":{"essential":true,"values":[...]}}}`) that the current session's authentication context doesn't satisfy forces re-authentication — `interaction_required` under `prompt=none`, or an interactive login redirect otherwise — via the RFC 9470 step-up path. See [MFA / step-up](/use-cases/mfa-step-up) for that mechanism.

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

The `claims` parameter narrows *which claims* land in the id_token / userinfo. Its structured sibling, RFC 9396 `authorization_details`, describes *what the access token may do* at a resource server. The two compose on the same merge path — the library distinguishes the JSON array (`authorization_details`) from the JSON object (`claims`) by shape — but `authorization_details` is only accepted once you register the accepted types. See [Rich authorization requests](/use-cases/authorization-details).

## Read next

- [Tokens primer](/concepts/tokens) — what claims live where.
- [Rich authorization requests](/use-cases/authorization-details) — the structured `authorization_details` sibling.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — JAR + claims combined.
