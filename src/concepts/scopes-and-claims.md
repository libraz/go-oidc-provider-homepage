---
title: Scopes and claims
description: Scopes, claims, built-in OIDC mappings, and custom scope registration — including strict wire parsing and resource indicators.
pageClass: pg-concepts-scopes-and-claims
---

# Scopes and claims

**Scope** and **claim** are the two words OIDC newcomers most often confuse. They are not the same thing.

- A **scope** is what the client **asks for** in the authorize request. It is one of a small set of identifiers the OP advertises in `scopes_supported`.
- A **claim** is a key-value pair the OP **returns** in a structured response — for example, inside an ID Token, a JWT access token, or a `/userinfo` response.

Scopes are the request; claims are the response. Granting a scope authorises the OP to release the matching claims when the claim source can provide them.

::: tip Mental model in 30 seconds
- Scope = "I want to see your email." — `scope=openid email`
- Claim = `"email": "alice@example.com"` — the value that comes back.
- One scope can release several claims; the OIDC standard map below shows how.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §3.3 (scope), §5.2 (`invalid_scope`)
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — Authorization Server Metadata (`scopes_supported`)
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators for OAuth 2.0
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §5.1 (standard claims), §5.4 (scope-to-claim map), §5.5 (claims request)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — §3 (`scopes_supported`, `claims_supported`)
:::

## Scope: what the client asks for

The `scope` parameter on `/auth` is a **space-separated** list of opaque identifiers. The user consents to the set; the OP records the granted set with the resulting authorization code and carries it into the access-token and refresh-token state. An ID Token does not carry a standard `scope` claim.

```
GET /auth?response_type=code&client_id=...&scope=openid%20profile%20email&...
```

A few observations beginners often miss:

- **Scope identifiers are opaque to OAuth 2.0.** OIDC Core §3.1.2.1 gives `openid` its special meaning; other scope names are agreed between the OP and client or defined by extensions.
- **Scopes are case-sensitive.** `openid` is the scope; `OpenID` is a different (and unrecognised) scope.
- **`openid` is the magic that turns OAuth into OIDC.** Without `openid` in the request, no ID Token is issued. The library defaults to OIDC (the `openid` scope is required); `op.WithOpenIDScopeOptional()` flips it to pure OAuth 2.0.
- **The user can decline some scopes.** The granted set may be a subset of the requested set; the OP reports the granted scopes in the token response and access-token state.
- **Unknown scopes fail.** The OP rejects authorization requests for scopes not registered through `WithScope` (or built-in OIDC standard scopes), returning `invalid_scope` per RFC 6749 §5.2.

## Claim: a key-value in a token or userinfo response

A **claim** is a single field inside a JSON object returned by the OP. Tokens are signed; `/userinfo` returns JSON by default or a signed/encrypted JWT when requested. OIDC Core §5.1 catalogues a long list. Token metadata claims are type-specific; user claims are controlled by scopes and claims requests.

- **ID Token claims** — `iss`, `sub`, `aud`, `iat`, and `exp` are required; `nonce`, `auth_time`, `acr`, `amr`, `azp`, `at_hash`, `c_hash`, and `sid` are conditional on the flow and request.
- **JWT access-token claims** — `iss`, `sub`, `aud`, `client_id`, `iat`, `exp`, and `jti` are required by RFC 9068; `scope`, `cnf`, `auth_time`, `acr`, `amr`, and other extensions appear when applicable. In this library, opaque access tokens, refresh tokens, and authorization codes do not carry claims on the wire.
- **User claims** — `name`, `family_name`, `email`, `email_verified`, `phone_number`, `address`, `picture`, etc. These describe the end user. The OP releases them only when the granted scope or an explicit claims request authorises them and the claim source supplies a value.

Scopes control user claims; the token type and the flow determine which token metadata claims are present.

## OIDC Core scope-to-claim map

OIDC Core §5.4 maps `profile`, `email`, `address`, and `phone` to user claims. The table also shows `openid` (the OIDC request marker from §3.1.2.1) and `offline_access` (the refresh-token consent scope from §11); those two are not §5.4 user-claim bundles.

| Scope | Claims released |
|---|---|
| `openid` | `sub` |
| `profile` | `name`, `family_name`, `given_name`, `middle_name`, `nickname`, `preferred_username`, `profile`, `picture`, `website`, `gender`, `birthdate`, `zoneinfo`, `locale`, `updated_at` |
| `email` | `email`, `email_verified` |
| `address` | `address` |
| `phone` | `phone_number`, `phone_number_verified` |
| `offline_access` | (no claim — controls the user-facing consent prompt for refresh-token issuance and which refresh-token TTL bucket applies) |

A request for `scope=openid email` therefore releases `sub`, `email`, and `email_verified` — and nothing else from the user-claim catalogue. A request for `scope=openid profile email` adds the entire `profile` group.

The map alone does not say *where* a released claim shows up. In the ordinary scope flow, `sub` and the ID Token's metadata claims ride in the ID Token, while the user claims released by `profile`, `email`, `address`, and `phone` are served from `/userinfo`. The access token carries the granted `scope`; the ID Token does not carry a standard `scope` claim.

<figure class="fig">
  <div class="fig-head">Scope requested → claims released → where they arrive</div>
  <svg class="fig-svg" role="img" aria-labelledby="scope-claim-map-title" viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg">
    <title id="scope-claim-map-title">Each standard scope releases a group of claims. The openid scope releases sub, which rides in the ID token; profile, email, address and phone are served from the userinfo endpoint. offline_access releases no claim at all.</title>
    <text class="fg-lbl" x="40" y="26">scope requested</text>
    <text class="fg-lbl" x="228" y="26">claims released</text>
    <text class="fg-lbl" x="664" y="26">delivered in</text>
    <line class="fg-rule fg-rule--strong" x1="36" y1="36" x2="924" y2="36"/>
    <!-- openid -->
    <rect class="fg-box fg-box--accent" x="36" y="52" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="71">openid</text>
    <text class="fg-m" x="232" y="71">sub</text>
    <line class="fg-rule" x1="36" y1="96" x2="620" y2="96"/>
    <!-- profile -->
    <rect class="fg-box" x="36" y="106" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="125">profile</text>
    <text class="fg-m" x="232" y="125">name · family_name · given_name · … (14 claims)</text>
    <line class="fg-rule" x1="36" y1="150" x2="620" y2="150"/>
    <!-- email -->
    <rect class="fg-box" x="36" y="160" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="179">email</text>
    <text class="fg-m" x="232" y="179">email · email_verified</text>
    <line class="fg-rule" x1="36" y1="204" x2="620" y2="204"/>
    <!-- address -->
    <rect class="fg-box" x="36" y="214" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="233">address</text>
    <text class="fg-m" x="232" y="233">address</text>
    <line class="fg-rule" x1="36" y1="258" x2="620" y2="258"/>
    <!-- phone -->
    <rect class="fg-box" x="36" y="268" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="287">phone</text>
    <text class="fg-m" x="232" y="287">phone_number · phone_number_verified</text>
    <line class="fg-rule" x1="36" y1="312" x2="924" y2="312"/>
    <!-- offline_access -->
    <rect class="fg-box fg-box--muted" x="36" y="322" width="164" height="28" rx="6"/>
    <text class="fg-m" x="52" y="341">offline_access</text>
    <text class="fg-xs" x="232" y="341">no claim at all — it drives the consent prompt and the refresh-token TTL bucket</text>
    <!-- ID Token panel -->
    <rect class="fg-box fg-box--accent" x="660" y="44" width="264" height="98" rx="8"/>
    <text class="fg-t fg-accent" x="678" y="68">ID token</text>
    <text class="fg-mxs" x="678" y="88">iss · aud · exp · iat · sub</text>
    <text class="fg-mxs" x="678" y="102">optional: nonce · auth_time · azp</text>
    <text class="fg-mxs" x="678" y="116">optional: acr · amr · at_hash · sid</text>
    <text class="fg-xs" x="678" y="134">filled in by the OP itself</text>
    <path class="fg-edge fg-edge--accent" d="M624,68 H656" marker-end="url(#fg-ac)"/>
    <!-- userinfo panel -->
    <rect class="fg-box" x="660" y="158" width="264" height="130" rx="8"/>
    <text class="fg-m" x="678" y="182">/userinfo</text>
    <text class="fg-xs" x="678" y="202">the RP calls it with the access</text>
    <text class="fg-xs" x="678" y="216">token and gets claims back (JSON by default)</text>
    <line class="fg-rule" x1="678" y1="232" x2="906" y2="232"/>
    <text class="fg-xs" x="678" y="252">it returns only the claims the</text>
    <text class="fg-xs" x="678" y="266">granted scopes authorise</text>
    <path class="fg-leader" d="M628,120 H640 V240 H628"/>
    <path class="fg-edge" d="M640,196 H656" marker-end="url(#fg-a)"/>
  </svg>
  <figcaption class="fig-note">A scope is a request, not a guarantee. The OP grants the intersection of what the client registered, what the user consented to, and what your claim source can actually produce — so a claim listed here can still be absent from the response.</figcaption>
</figure>

An RP that wants a user claim inside the ID Token instead has to ask for it explicitly with the OIDC Core §5.5 `claims` parameter; a scope grant alone puts it at `/userinfo`.

::: details `offline_access` does not release a claim
`offline_access` is the OIDC standard scope that signals "the client wants to keep working when the user is not present" — i.e. the user-facing consent prompt for refresh-token issuance. It releases no user claim. In this library it routes the resulting refresh token to a separate TTL bucket (`op.WithRefreshTokenOfflineTTL`) so stay-signed-in chains can outlive everyday short-session refreshes; see [Refresh tokens](/concepts/refresh-tokens).
:::

## Custom scopes

The library lets embedders register additional scopes through `op.WithScope`. Every custom scope is a `op.Scope` struct describing the wire identifier, the consent-prompt UI text, the claim list it releases, and (optionally) which clients may request it.

```go
op.WithScope(op.PublicScope("read:projects", "Read your projects")),
op.WithScope(op.Scope{
    Name:        "write:projects",
    Title:       "Write to your projects",
    Description: "Create and modify projects on your behalf.",
    Public:      true,
    Claims:      []string{"projects:permissions"},
    AllowedClients: []string{"trusted-client-1"},
}),
```

Two helpers cover the common shapes:

- `op.PublicScope(name, label)` — registers a scope that is advertised in the discovery document's `scopes_supported`. Use this for scopes any vetted client can request.
- `op.InternalScope(name)` — registers a scope that is **omitted** from `scopes_supported` (RFC 8414 §2 / OIDC Discovery §3 explicitly permit the omission). Acceptance is still governed by the scope's `AllowedClients` list. Use this for scopes that should not be discoverable but are honoured for specific clients.

Standard OIDC scopes are recognised automatically with built-in defaults. Calling `WithScope` for a standard name (e.g. `email`) overrides the built-in entry — typically to attach translations or extra claim mappings — but registering one with `Public: false` fails `op.New` so the discovery document never advertises an OIDC scope as missing.

`op.Scope.Parse` is a convenience helper for embedder-side strings and splits on any Unicode whitespace run. The protocol path remains stricter: wire-facing scope parsing uses RFC 6749's ASCII-space grammar, so tabs or newlines in `/auth` / `/par` input are not a portability feature to rely on.

See [Use case: Scopes](/use-cases/scopes) for the full walkthrough including i18n labels, claim mapping, and consent-prompt rendering.

## Scopes vs RFC 8707 resource indicators

A common modelling question: do you split a permission with a new scope, or with a new audience?

| Question | Answer | Example |
|---|---|---|
| "Is this a different **kind** of permission the same RS understands?" | Use a scope. | `read:projects` vs `write:projects` against the same project API. |
| "Is this a different **resource server** that needs its own audience?" | Use RFC 8707. | An access token for the project API vs an access token for the billing API; both flows want different `aud` values so the RS verifiers reject cross-audience tokens. |
| "Is the lifetime/format/revocation policy different per audience?" | Use RFC 8707 with per-audience format. | Admin API gets opaque (immediate revocation) while the read API stays JWT (horizontal scale). The library wires this through `op.WithAccessTokenFormatPerAudience`. |

Scopes describe **breadth of permission**; resource indicators describe **target audience**. A single authorization request can carry both, for example `scope=openid read:projects&resource=https://projects.example.com`. This library issues one access token for the selected resource. Repeating `resource` in a built-in authorization flow is rejected with `invalid_target`; use separate requests for different resource servers.

Every surface that accepts a `resource` parameter reduces it to the same canonical form first:

| Rule | Effect |
|---|---|
| Absolute URI required | A value without a scheme and host is rejected. |
| Scheme and host lowercased | `HTTPS://API.example.com` and `https://api.example.com` are the same resource. |
| Default port removed | `:80` for HTTP and `:443` for HTTPS drop out; a non-default port is preserved. |
| One trailing slash removed | `https://api.example.com/` becomes `https://api.example.com`. |
| Query preserved | The query string is part of the identity of the resource. |
| Fragment or userinfo rejected | The request fails with `invalid_target`. |

The same normalization runs behind allow-list comparisons and `WithAccessTokenFormatPerAudience`, so one resource cannot compare differently at authorize, PAR, token, device authorization, CIBA, or token exchange.

See [Use case: Claims request](/use-cases/claims-request) for the OIDC §5.5 `claims` parameter, which lets the RP request specific claims independent of scope grouping; see [Access token format](/concepts/access-token-format) for the per-audience format trade-off.

## Read next

- [ID Token, access token, userinfo](/concepts/tokens) — what each artefact actually contains and how scopes shape it.
- [Use case: Scopes](/use-cases/scopes) — i18n labels, claim mapping, allowed-clients, and the consent-prompt surface.
- [Use case: Claims request](/use-cases/claims-request) — the OIDC §5.5 `claims` parameter for fine-grained claim selection.
