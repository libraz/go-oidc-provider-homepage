---
title: Claims request parameter
description: OIDC Core 1.0 §5.5 — RP asks for specific claims via `claims`; the OP projects them when claims support is enabled.
pageClass: pg-use-cases-claims-request
---

# Use case — Claims request parameter

## What is the `claims` parameter?

By default, the RP picks claims via **scopes**: `scope=openid profile email` asks for the bundle of claims OIDC Core 1.0 §5.4 maps to those scopes (`name`, `given_name`, ..., `email`, `email_verified`). That bundle is fixed.

OIDC Core 1.0 §5.5 adds a finer mechanism: the RP sends a `claims=...` JSON object listing **individual claims** (e.g. just `email_verified` and `phone_number`) and where they should appear (in the `id_token`, in `/userinfo`, or both), with optional `essential` markers and value constraints.

This is most useful for two cases:
1. **Step-up consent** — RP asks for `acr=urn:mace:incommon:iap:silver` as essential to force a higher-assurance authentication.
2. **Privacy-minimising RPs** — RP asks for only the claims it needs, not the full scope bundle.

The two mechanisms differ in where their output lands. A scope releases its whole bundle to both the ID Token and `/userinfo`; a `claims` member releases only the claims it names, and only to the destination it is nested under.

<figure class="fig">
  <div class="fig-head">Where each request lands</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-claims-title" viewBox="0 0 960 258" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-claims-title">The id_token member of the claims parameter selects claims for the ID token only; the userinfo member selects them for the userinfo response only. A scope, by contrast, reaches both destinations at once.</title>
    <text class="fg-lbl" x="40" y="26">what you ask with</text>
    <text class="fg-lbl" x="644" y="26">where it comes out</text>
    <rect class="fg-box" x="36" y="38" width="330" height="52" rx="6"/>
    <text class="fg-mxs" x="54" y="60">claims["id_token"]</text>
    <text class="fg-xs" x="54" y="78">exactly the claims it names</text>
    <rect class="fg-box fg-box--accent" x="36" y="102" width="330" height="52" rx="6"/>
    <text class="fg-mxs fg-accent" x="54" y="124">scope</text>
    <text class="fg-xs" x="54" y="142">the whole bundle OIDC Core §5.4 defines</text>
    <rect class="fg-box" x="36" y="166" width="330" height="52" rx="6"/>
    <text class="fg-mxs" x="54" y="188">claims["userinfo"]</text>
    <text class="fg-xs" x="54" y="206">exactly the claims it names</text>
    <path class="fg-edge fg-edge--thin" d="M370,64 H600" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M370,124 H470 V64 H600" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M470,124 V192 H600" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--thin" d="M370,192 H600" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="604" y="38" width="320" height="52" rx="6"/>
    <text class="fg-mxs" x="622" y="60">the ID token</text>
    <text class="fg-xs" x="622" y="78">signed into the JWT, read by the RP</text>
    <rect class="fg-box" x="604" y="166" width="320" height="52" rx="6"/>
    <text class="fg-mxs" x="622" y="188">GET /userinfo</text>
    <text class="fg-xs" x="622" y="206">returned in the JSON body</text>
    <text class="fg-xs" x="36" y="246">the two members are separate requests — naming a claim under one does not put it in the other</text>
  </svg>
  <figcaption class="fig-note">This is the part that surprises people: adding a claim to <code>claims["userinfo"]</code> will never make it appear in the ID token, however many times the RP retries.</figcaption>
</figure>

`essential` does not change that routing. It changes only how hard the OP tries: for `acr` an essential request forces re-authentication, and for every other claim it stays a best-effort hint.

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

`claims_parameter_supported` defaults to `true`. Pass `op.WithClaimsParameterSupported(false)` to remove the advertisement and ignore valid `claims` payloads. Scope-derived claims continue to work; malformed JSON is still rejected at the request boundary.

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

## Exact value constraints

`value` and `values` are exact JSON constraints, not hints or coercions:

- `value` requires the candidate claim to be JSON-equal to that one value.
- `values` requires the candidate claim to be JSON-equal to at least one member of the list; it is membership, not a range.
- When both are present, both constraints must pass.
- Numbers compare by exact numeric value across `json.Number` and the Go integer types a user store may return (`int`, `int64`, `uint64`, and the other sized integer types). Integral values above 2^53 are compared as integers rather than through `float64`, so adjacent large integers cannot become equal through rounding; a floating-point store value uses its actual floating-point value. Strings and booleans use their ordinary JSON equality.

If the candidate does not satisfy the constraint, the requested claim is omitted under the normal best-effort projection rules.

## `updated_at`

When selected for the `id_token` or `/userinfo`, `updated_at` is sourced from `store.User.UpdatedAt` as Unix seconds. A non-zero `UpdatedAt` therefore produces the same value in both objects for the same subject and grant; an explicit `updated_at` in the user `Claims` map takes precedence, and a zero timestamp does not synthesize the claim.

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

## Silent authorization and an existing projection

When a returning subject is authorised silently (`prompt=none`) against an existing grant, a `claims` parameter on that request updates the projection stored on the grant before the new authorization code is issued. The subsequent ID Token and UserInfo response therefore reflect the claims requested by the silent authorization, even when the earlier grant carried a different projection. If the request omits `claims`, the existing projection is preserved; omission means "leave it as agreed", not "erase it".

When claims support is disabled, the OP silently suppresses requested-claim projection from existing grants. That applies to both ID Tokens and UserInfo, including tokens descended from refresh rotation; claims released by scopes are unaffected, and the grant is not rewritten, re-prompted, or failed. Re-enabling the option restores projection for grants that still carry their validated request.

## Authorization Details (RFC 9396)

The `claims` parameter narrows *which claims* land in the ID Token / `/userinfo`. Its structured sibling, RFC 9396 `authorization_details`, describes *what the access token may do* at a resource server. The two compose on the same merge path — the library distinguishes the JSON array (`authorization_details`) from the JSON object (`claims`) by shape — but `authorization_details` is only accepted once you register the accepted types. See [Rich authorization requests](/use-cases/authorization-details).

## Read next

- [Tokens primer](/concepts/tokens) — what claims live where.
- [Rich authorization requests](/use-cases/authorization-details) — the structured `authorization_details` sibling.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — JAR + claims combined.
