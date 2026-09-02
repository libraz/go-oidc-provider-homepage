---
title: Scopes and claims
description: Scopes, claims, built-in OIDC mappings, and custom scope registration — including strict wire parsing and resource indicators.
pageClass: pg-concepts-scopes-and-claims
---

# Scopes and claims

**Scope** and **claim** are the two words OIDC newcomers most often confuse. They are not the same thing.

- A **scope** is what the client **asks for** in the authorize request. It is one of a small set of identifiers the OP advertises in `scopes_supported`.
- A **claim** is a key-value pair the OP **returns** — inside an ID Token, inside an access token, or inside a `/userinfo` response.

Scopes are the request; claims are the response. Granting a scope is what causes the OP to release the matching claims.

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

The `scope` parameter on `/auth` is a **space-separated** list of opaque identifiers. The user consents to the set; the OP records the granted set on the resulting authorization code, then on the access token, refresh token, and ID Token.

```
GET /auth?response_type=code&client_id=...&scope=openid%20profile%20email&...
```

A few observations beginners often miss:

- **Scope identifiers are opaque to the protocol.** `openid` is special only because OIDC Core §5.4 assigns it the meaning "this is an OIDC flow"; the rest are just strings the OP and the client agree on.
- **Scopes are case-sensitive.** `openid` is the scope; `OpenID` is a different (and unrecognised) scope.
- **`openid` is the magic that turns OAuth into OIDC.** Without `openid` in the request, no ID Token is issued. The library defaults to OIDC (the `openid` scope is required); `op.WithOpenIDScopeOptional()` flips it to pure OAuth 2.0.
- **The user can decline some scopes.** The granted set may be a subset of the requested set; the OP advertises which scopes were actually granted on the issued tokens.
- **Unknown scopes fail.** `op.New` rejects requests for scopes not registered through `WithScope` (or built-in OIDC standard scopes), returning `invalid_scope` per RFC 6749 §5.2.

## Claim: a key-value in a token or userinfo response

A **claim** is a single field inside a JSON object the OP signs (or, for `/userinfo`, returns plain). OIDC Core §5.1 catalogues a long list. They split structurally into two groups:

- **Standard claims about the request itself** — `iss`, `aud`, `exp`, `iat`, `nbf`, `sub`, `nonce`, `auth_time`, `acr`, `amr`, `azp`. These describe the token, not the user. The OP fills them in regardless of which scopes were granted.
- **User claims** — `name`, `family_name`, `email`, `email_verified`, `phone_number`, `address`, `picture`, etc. These are about the end-user. The OP releases them only when the granted scope authorises it.

The first group lives on every token. The second group is what scope grants control.

## OIDC Core scope-to-claim map

OIDC Core §5.4 fixes the mapping for the standard scopes. The library implements it verbatim:

| Scope | Claims released |
|---|---|
| `openid` | `sub` |
| `profile` | `name`, `family_name`, `given_name`, `middle_name`, `nickname`, `preferred_username`, `profile`, `picture`, `website`, `gender`, `birthdate`, `zoneinfo`, `locale`, `updated_at` |
| `email` | `email`, `email_verified` |
| `address` | `address` |
| `phone` | `phone_number`, `phone_number_verified` |
| `offline_access` | (no claim — controls the user-facing consent prompt for refresh-token issuance and which refresh-token TTL bucket applies) |

A request for `scope=openid email` therefore releases `sub`, `email`, and `email_verified` — and nothing else from the user-claim catalogue. A request for `scope=openid profile email` adds the entire `profile` group.

The map alone does not say *where* a released claim shows up. `sub` and the token-describing claims ride in the ID Token; the user claims a scope releases are served from `/userinfo`.

<svg role="img" aria-labelledby="scope-claim-map-title" viewBox="0 0 760 400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="scope-claim-map-title">Each standard scope releases a claim group. The openid scope releases sub, which rides in the ID Token; the profile, email, address and phone claims are served from /userinfo. offline_access releases no claim.</title>
  <text class="sc-cap" x="24" y="18">SCOPE REQUESTED</text>
  <text class="sc-cap" x="166" y="18">CLAIMS RELEASED</text>
  <text class="sc-cap" x="560" y="18">DELIVERED IN</text>
  <line class="sc-rule" x1="24" y1="28" x2="736" y2="28"/>

  <rect class="sc-dest" x="560" y="40" width="176" height="104" rx="8"/>
  <text class="sc-dest-title" x="576" y="64">ID Token</text>
  <text class="sc-dest-claims" x="576" y="86">iss · aud · exp · iat · sub</text>
  <text class="sc-dest-claims" x="576" y="102">nonce · auth_time · azp</text>
  <text class="sc-dest-claims" x="576" y="118">acr · amr · at_hash · sid</text>
  <text class="sc-note" x="576" y="136">filled in by the OP itself</text>

  <rect class="sc-scope" x="24" y="74" width="118" height="34" rx="6"/>
  <text class="sc-name" x="83" y="96" text-anchor="middle">openid</text>
  <path class="sc-link" d="M142 91 H158 M152 87 L159 91 L152 95"/>
  <text class="sc-name" x="166" y="96">sub</text>
  <path class="sc-route sc-route-dashed" d="M212 91 H556"/>
  <path class="sc-route" d="M549 87 L556 91 L549 95"/>

  <line class="sc-rule" x1="24" y1="162" x2="736" y2="162"/>

  <rect class="sc-dest" x="560" y="182" width="176" height="128" rx="8"/>
  <text class="sc-dest-path" x="576" y="206">/userinfo</text>
  <text class="sc-note" x="576" y="228">the RP calls it with the</text>
  <text class="sc-note" x="576" y="244">access token and gets a</text>
  <text class="sc-note" x="576" y="260">JSON body back</text>
  <text class="sc-note" x="576" y="284">only the claims the</text>
  <text class="sc-note" x="576" y="300">granted scopes authorise</text>

  <rect class="sc-scope" x="24" y="180" width="118" height="30" rx="6"/>
  <text class="sc-name" x="83" y="200" text-anchor="middle">profile</text>
  <path class="sc-link" d="M142 195 H158 M152 191 L159 195 L152 199"/>
  <text class="sc-claims" x="166" y="200">name · family_name · given_name · … (14 claims)</text>

  <rect class="sc-scope" x="24" y="218" width="118" height="30" rx="6"/>
  <text class="sc-name" x="83" y="238" text-anchor="middle">email</text>
  <path class="sc-link" d="M142 233 H158 M152 229 L159 233 L152 237"/>
  <text class="sc-claims" x="166" y="238">email · email_verified</text>

  <rect class="sc-scope" x="24" y="256" width="118" height="30" rx="6"/>
  <text class="sc-name" x="83" y="276" text-anchor="middle">address</text>
  <path class="sc-link" d="M142 271 H158 M152 267 L159 271 L152 275"/>
  <text class="sc-claims" x="166" y="276">address</text>

  <rect class="sc-scope" x="24" y="294" width="118" height="30" rx="6"/>
  <text class="sc-name" x="83" y="314" text-anchor="middle">phone</text>
  <path class="sc-link" d="M142 309 H158 M152 305 L159 309 L152 313"/>
  <text class="sc-claims" x="166" y="314">phone_number · phone_number_verified</text>

  <path class="sc-route" d="M506 192 V312"/>
  <path class="sc-route sc-route-dashed" d="M506 252 H556"/>
  <path class="sc-route" d="M549 248 L556 252 L549 256"/>

  <line class="sc-rule" x1="24" y1="336" x2="736" y2="336"/>
  <rect class="sc-scope" x="24" y="352" width="140" height="30" rx="6"/>
  <text class="sc-name-muted" x="94" y="372" text-anchor="middle">offline_access</text>
  <text class="sc-aside" x="184" y="372">no claim — it drives the refresh-token consent prompt and TTL bucket</text>
</svg>

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

Scopes describe **breadth of permission**; resource indicators describe **target audience**. A single authorize request can carry both — `scope=openid read:projects&resource=https://billing.example.com&resource=https://projects.example.com` asks the OP to mint two access tokens, one per resource, each carrying the granted scope set.

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
