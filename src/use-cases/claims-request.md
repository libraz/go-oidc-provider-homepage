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
1. **Step-up authentication** — RP asks for an essential `acr` value that the current session does not satisfy, prompting re-authentication.
2. **Privacy-minimising RPs** — RP asks for only the claims it needs, not the full scope bundle.

The two mechanisms differ in where their output lands. In the authorization code flow, the standard `profile`, `email`, `address`, and `phone` scopes request claims from `/userinfo`; a `claims` member requests only the claims it names, at the destination it specifies. In an ID Token-only response with no access token, scope-derived claims instead appear in the ID Token.

<figure class="fig">
  <div class="fig-head">Each request lands in one place</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-claims-title" viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-claims-title">In the authorization code flow, the id_token member requests claims in the ID Token; the userinfo member and standard profile scopes request claims from UserInfo.</title>
    <text class="fg-lbl" x="32" y="36">what you ask with</text>
    <text class="fg-lbl" x="568" y="36">where it comes out</text>
    <!-- claims["id_token"] -->
    <rect class="fg-box" x="32" y="56" width="376" height="72" rx="8"/>
    <text class="fg-m" x="48" y="84">claims["id_token"]</text>
    <text class="fg-s" x="48" y="108">exactly the claims it names</text>
    <!-- claims["userinfo"] -->
    <rect class="fg-box" x="32" y="160" width="376" height="72" rx="8"/>
    <text class="fg-m" x="48" y="188">claims["userinfo"]</text>
    <text class="fg-s" x="48" y="212">exactly the claims it names</text>
    <!-- scope -->
    <rect class="fg-box fg-box--accent" x="32" y="264" width="376" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="292">scope</text>
    <text class="fg-s" x="48" y="316">the whole bundle OIDC Core §5.4 defines</text>
    <!-- edges -->
    <path class="fg-edge" d="M408,92 H568" marker-end="url(#fg-a)"/>
    <path class="fg-edge" d="M408,196 H568" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--accent" d="M408,300 H568" marker-end="url(#fg-ac)"/>
    <!-- ID token -->
    <rect class="fg-box" x="568" y="56" width="360" height="72" rx="8"/>
    <text class="fg-t2" x="584" y="84">The ID token</text>
    <text class="fg-s" x="584" y="108">signed into the JWT, read by the RP</text>
    <!-- UserInfo -->
    <rect class="fg-box" x="568" y="160" width="360" height="176" rx="8"/>
    <text class="fg-t2" x="584" y="188">UserInfo</text>
    <text class="fg-m" x="584" y="212">GET /userinfo</text>
    <text class="fg-s" x="584" y="236">returned in the response</text>
  </svg>
  <figcaption class="fig-note">This diagram shows the authorization code flow. A claim requested only under <code>claims["userinfo"]</code> is not requested for the ID Token; the two members are separate requests.</figcaption>
</figure>

`essential` does not change that routing. For ordinary claims it signals importance to the OP's authorization experience but does not require an error when the claim is unavailable. An essential `acr` request with a required value has special matching rules and can trigger re-authentication.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.4 (scope-to-claim mapping), §5.5 (claims request)
- [RFC 9396](https://datatracker.ietf.org/doc/html/rfc9396) — Authorization Details (a structured alternative to scopes)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JAR (when the claims request rides inside a signed request object)
:::

::: details Quick refresher
- **Scope** — a coarse permission bundle (`profile`, `email`, …). One scope maps to a fixed set of claims.
- **Claim request** — a fine-grained, per-claim ask. The RP specifies exactly which claims it wants and where they should appear (`id_token` vs `userinfo`), with optional `essential` markers.
- **Essential vs voluntary** — for an ordinary claim, `essential` marks its importance but does not make absence an error. The OP may omit an unavailable claim; `acr` with `essential: true` and a required value has special matching rules (see [MFA / step-up](/use-cases/mfa-step-up)).
:::

> **Source:** [`examples/61-claims-request`](https://github.com/libraz/go-oidc-provider/tree/main/examples/61-claims-request)

## Wiring

```go
op.New(
  /* required options */
  op.WithClaimsParameterSupported(true), // the default; shown for clarity
  op.WithClaimsSupported(
    "sub", "iss", "aud", "exp", "iat", "auth_time", "nonce",
    "name", "given_name", "family_name", "preferred_username",
    "email", "email_verified",
    "locale",
  ),
)
```

`claims_parameter_supported` defaults to `true`. Pass `op.WithClaimsParameterSupported(false)` to remove the advertisement and ignore valid `claims` payloads. Scope-derived claims continue to work; malformed JSON is still rejected at the request boundary. `WithClaimsSupported` only fills the discovery `claims_supported` list (omitted when unset); it does not restrict which claims the OP can release.

The discovery document then advertises:

```json
{
  "claims_parameter_supported": true,
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "name", "given_name", "family_name", "preferred_username", "email", "email_verified", "locale"]
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
| `id_token` | `email` is included if the user store has it; if not, the OP omits it without failing the request |
| `/userinfo` response | `locale` is included on a best-effort basis (voluntary) |

## Essential vs voluntary

For ordinary claims (anything other than `acr`), `essential` communicates importance to the authorization experience. OIDC Core 1.0 §5.5.1 says the OP must not generate an error merely because an essential claim cannot be returned, unless a claim-specific rule says otherwise. This library omits an unavailable ordinary claim.

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

## Each authorization keeps its own request

The `claims` request belongs to the authorization that carried it. The authorization code records it, and the refresh tokens and access tokens descended from that code keep it: a JWT access token carries the `userinfo` member in a private `userinfo_claims` claim (`{}` when the request named none), and `/userinfo` releases claims from it. Resource servers should ignore the claim; the name is reserved, so a custom grant cannot set it.

Two consequences follow for a user who authorizes the same client twice:

- Tokens from the first authorization keep releasing exactly what the first request asked for. A later authorization that asks for more claims, or fewer, does not change them.
- An authorization served silently (`prompt=none`, or a cached grant that covers the request) without a `claims` parameter releases only the scope-derived claims. It does not inherit a `claims` request from an earlier authorization on the same grant. Send `claims` again on each authorization that needs it.

A refresh rotation carries the request of the token it replaces. A bring-your-own store that does not persist the per-authorization fields (see `AuthorizationRecorded` on `store.AuthorizationCode`, `store.RefreshToken` and `store.OpaqueAccessToken`) falls back to the request last stored on the grant.

When claims support is disabled, the OP stops releasing requested claims for every token, including ones issued while it was on and refresh chains descended from them. This applies to both ID Tokens and UserInfo; claims released by scopes are unaffected, and nothing is rewritten, re-prompted, or failed. The recorded requests are kept, so re-enabling the option restores the projection.

## Authorization Details (RFC 9396)

The `claims` parameter narrows *which claims* land in the ID Token / `/userinfo`. Its structured sibling, RFC 9396 `authorization_details`, describes *what the access token may do* at a resource server. The two compose on the same merge path — the library distinguishes the JSON array (`authorization_details`) from the JSON object (`claims`) by shape — but `authorization_details` is only accepted once you register the accepted types. See [Rich authorization requests](/use-cases/authorization-details).

## Read next

- [Tokens primer](/concepts/tokens) — what claims live where.
- [Rich authorization requests](/use-cases/authorization-details) — the structured `authorization_details` sibling.
- [FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — JAR + claims combined.
