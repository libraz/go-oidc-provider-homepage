---
title: Client types
description: Public vs confidential vs FAPI-grade clients, the authentication methods this library implements, and how to register them.
pageClass: pg-concepts-client-types
---

# Client types

A **client** is the application that asks the OP for tokens. Clients fall into two structural buckets, **public** (cannot keep a secret) and **confidential** (can), and FAPI 2.0 deployments raise the bar further on top of confidential. The bucket decides how the client authenticates at the token endpoint, and that choice in turn affects refresh-token policy, sender-constraint requirements, and whether the consent prompt can be skipped.

::: tip Mental model in 30 seconds
- **Public clients**: SPAs, native apps, mobile apps. The code ships to users, so a secret in it is not secret. They use `none` + PKCE.
- **Confidential clients**: backends, services, machine-to-machine callers. They can hold a secret or a private key and use `client_secret_*` or `private_key_jwt`.
- **FAPI-grade clients**: confidential clients hardened with sender-constrained tokens (DPoP / mTLS), PAR, and asymmetric authentication.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §2.1 (client types), §2.3 (client authentication)
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) / [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — Assertion-based client authentication
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §9 (client authentication)
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — §5.3.2.1 (permitted client authentication methods)
:::

## Public clients

Public clients are applications whose code runs on a device the user controls: single-page apps, mobile apps, native desktop apps, and CLIs. **Anything shipped with the binary or page is in the attacker's hands too**, so there is nowhere to hide a long-lived secret.

### When to use one

Use a public client for apps that log a human in on the user's device.

- A browser SPA redirects to `/auth`, then exchanges the code and PKCE verifier at `/token` from JavaScript.
- A mobile or desktop app receives the authorization code through a custom URI scheme, claimed `https`, or loopback redirect.
- A CLI opens a local loopback listener, sends the user through browser login, and receives the authorization code locally.

Use a confidential client for server-side RPs and service-to-service callers where a backend can keep a shared secret, private key, or certificate out of user-reachable storage.

### Why the type exists

The split exists because a credential only authenticates a client if the client can keep it secret. If an SPA or mobile app had to use a `client_secret`, the developer could only put it in a JavaScript bundle, an app binary, or a local config file. Every user, attackers included, would receive that value, so the protocol cannot treat it as a secret.

```jsonc
// Wrong: the secret has to ship inside the SPA bundle, so it is not a secret
{
  "client_id": "browser-spa",
  "token_endpoint_auth_method": "client_secret_basic",
  "client_secret": "shipped-in-javascript"
}

// Right: register a public client and protect it with code + PKCE
{
  "client_id": "browser-spa",
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code"],
  "redirect_uris": ["https://app.example.com/callback"]
}
```

OAuth / OIDC therefore names public clients explicitly and protects them with other mechanisms: a registered `client_id`, exact redirect-URI matching, per-request PKCE, refresh-token rotation, and DPoP where appropriate. A public client is not an "untrusted client"; it is a client protected differently because it cannot keep a secret.

The library treats a client as public when its `TokenEndpointAuthMethod` is `"none"`. These protections compensate for the missing secret:

- **PKCE is required.** The OP accepts only `S256` PKCE (`plain` is refused regardless of profile; see [Design judgments #14](/security/design-judgments#dj-14)). The `code_verifier` is the per-request secret that proves "the same client that started the flow is the one finishing it"; without it, an authorization code intercepted on the redirect is enough to mint tokens.
- **Refresh tokens are rotated and DPoP-bound.** Every successful refresh exchange retires the previous refresh token and binds the next one to the DPoP key the client presented. A leaked refresh on a public client cannot be reused without the matching key, and a reuse of an already-rotated token revokes the entire chain. See [Design judgments #15](/security/design-judgments#dj-15).
- **Loopback redirects are admitted.** RFC 8252 §7.3 lets native clients vary the port on `127.0.0.1` / `[::1]` so a CLI can use an OS-assigned ephemeral port; see [Redirect URI](/concepts/redirect-uri).

Public clients still receive ID Tokens and refresh tokens and can call `/userinfo`. They are full RPs that work under stricter rules.

## Confidential clients

Confidential clients are backend services that keep a secret or a private key out of user-reachable storage: a server-side environment variable, a secrets manager, an HSM. They register a `TokenEndpointAuthMethod` other than `"none"`.

A confidential client gets:

- **Authentication at the token endpoint.** Every `POST /token` carries credentials; the OP verifies them before issuing anything. The verifier is one of the methods listed below.
- **Looser refresh-token policy.** Refresh tokens are rotated like every other client, but the chain is **not** DPoP-bound by default — the access tokens minted on each refresh are still bound to whatever key was presented, but the refresh chain itself can rotate keys. See [Design judgments #15](/security/design-judgments#dj-15).
- **Eligibility for first-party auto-consent.** `op.WithFirstPartyClients(...)` lets the consent prompt be skipped for vetted internal clients. Only statically seeded and admin-provisioned clients are eligible (DCR-registered clients are excluded by design), and `op.New` refuses the option together with a FAPI 2.0 profile.

## FAPI-grade clients

The FAPI 2.0 Security Profile requires confidential clients, PAR, sender-constrained access tokens (DPoP or mTLS), and either mTLS client authentication or `private_key_jwt`. It does not require a signed request object. This library's `profile.FAPI2Baseline` additionally requires JAR and admits only `private_key_jwt` for token-endpoint client authentication. mTLS is available as a sender constraint, but the two mTLS client-authentication methods are not selectable (see below). See the [FAPI 2.0 primer](/concepts/fapi).

The protocol has no separate "FAPI client type": a FAPI-grade client is a confidential client that meets the extra requirements, and the library enforces them at construction and at request time.

## Authentication methods

The library names six methods from the IANA "OAuth Token Endpoint Authentication Methods" registry as `op.AuthMethod` constants. Four can be used; the two mTLS client-authentication methods are named but not selectable.

The figure traces each client shape to the `token_endpoint_auth_method` it registers: a public client lands on `none`, a confidential client on a `client_secret_*` method, and a FAPI-grade client on an asymmetric method.

<figure class="fig">
  <div class="fig-head">Client shape decides the authentication method</div>
  <svg class="fig-svg" role="img" aria-labelledby="authmethod-decision-title" viewBox="0 0 960 392" xmlns="http://www.w3.org/2000/svg">
    <title id="authmethod-decision-title">Three client shapes and the token endpoint authentication method each one ends up with: a public client authenticates with none plus PKCE, a confidential client with a client secret, and a FAPI-grade client with private_key_jwt plus a sender constraint.</title>
    <text class="fg-lbl" x="32" y="40">client shape</text>
    <text class="fg-lbl" x="560" y="40">token_endpoint_auth_method</text>
    <!-- public -->
    <rect class="fg-box" x="32" y="64" width="336" height="72" rx="8"/>
    <text class="fg-t" x="48" y="92">Public client</text>
    <text class="fg-s" x="48" y="116">SPA · native app · CLI</text>
    <path class="fg-edge" d="M368,100 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="464" y="90" text-anchor="middle">no secret to keep</text>
    <rect class="fg-box" x="560" y="64" width="368" height="72" rx="8"/>
    <text class="fg-m" x="576" y="92">none</text>
    <text class="fg-s" x="576" y="116">with PKCE (S256) — never optional</text>
    <!-- confidential -->
    <rect class="fg-box" x="32" y="168" width="336" height="96" rx="8"/>
    <text class="fg-t" x="48" y="196">Confidential client</text>
    <text class="fg-s" x="48" y="220">backend web app · service</text>
    <path class="fg-edge" d="M368,216 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="464" y="206" text-anchor="middle">holds a secret</text>
    <rect class="fg-box" x="560" y="168" width="368" height="96" rx="8"/>
    <text class="fg-m" x="576" y="196">client_secret_basic</text>
    <text class="fg-m" x="576" y="220">client_secret_post</text>
    <text class="fg-s" x="576" y="244">pick one and register it</text>
    <!-- FAPI -->
    <rect class="fg-box fg-box--accent" x="32" y="296" width="336" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="324">FAPI-grade client</text>
    <text class="fg-s" x="48" y="348">sender-constrained · high assurance</text>
    <path class="fg-edge fg-edge--accent" d="M368,332 H560" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="464" y="322" text-anchor="middle">FAPI 2.0 profile</text>
    <rect class="fg-box fg-box--accent" x="560" y="296" width="368" height="72" rx="8"/>
    <text class="fg-m" x="576" y="324">private_key_jwt</text>
    <text class="fg-s" x="576" y="348">plus a DPoP or mTLS sender constraint</text>
  </svg>
  <figcaption class="fig-note">The shape is not a label you choose — it follows from where the code runs. Anything that ships to a browser or a device cannot keep a secret, so it is a public client whatever the registration says.</figcaption>
</figure>

| Method | Pre-shared secret? | Asymmetric? | FAPI 2.0? | Typical use |
|---|---|---|---|---|
| `none` | — | — | No | Public clients (SPA, native, CLI) with PKCE. |
| `client_secret_basic` | yes | — | No | Backend services with a shared secret, sent as HTTP Basic. The default for confidential clients. |
| `client_secret_post` | yes | — | No | Same secret in the form body. Discouraged for new deployments — Basic is the canonical wire format. |
| `private_key_jwt` | — | yes | Yes | Backend signs a short-lived JWT assertion with its own private key; OP verifies against the registered JWKS. The method this library uses for its FAPI profile. |
| `tls_client_auth` | — | yes (PKI) | Not selectable | Named for RFC 8705, but `op.New` rejects a static client using it, dynamic registration rejects it, and discovery never lists it. Use `private_key_jwt`. |
| `self_signed_tls_client_auth` | — | yes (pinned) | Not selectable | Same as `tls_client_auth`. |

mTLS-bound access tokens (RFC 8705 §3) are a separate feature and do not need either method: with `feature.MTLS` enabled, tokens issued to a client that presented a certificate carry `cnf.x5t#S256` whatever method the client authenticated with.

`client_secret_jwt` (HS256-shared-secret JWT) is **not** implemented. A shared-secret JWT widens the damage of a leaked secret and offers nothing `private_key_jwt` does not.

`private_key_jwt` assertions are checked strictly:

- `iss` and `sub` equal the `client_id`, `aud` is an accepted audience (see [Issuer](/concepts/issuer)), and `exp` is at most 5 minutes ahead.
- `jti` is required, at most 256 characters, and single-use: a replayed assertion is `invalid_client`.
- For clients registered with `jwks_uri`, an assertion signed with an unknown `kid` triggers one throttled, cache-bypassing JWKS refetch before verification fails. A real key rotation recovers immediately, while random `kid` values cannot amplify outbound fetches.
- If the client's JWKS cannot be fetched because of overload or a transient fault, `/token` answers `503 server_error`, not `invalid_client`. A client-store outage answers `500 server_error`. The client can retry in both cases.

::: tip Pick one method per client and stick to it
The discovery document lists every method the OP is configured to accept, but each client registers exactly one. Mixing methods on a single client is not standardised and has been the source of downgrade-attack research papers — the library matches the registered method exactly and refuses fallbacks.
:::

## Provisioning options

A client and its `TokenEndpointAuthMethod` reach the OP in one of two ways.

**Static seeds** go through `op.WithStaticClients(seeds ...ClientSeed)`. A seed is one of three typed builders, each fixing the authentication method for you:

| Builder | Registers | Credential field |
|---|---|---|
| `op.PublicClient` | `none` | none |
| `op.ConfidentialClient` | `client_secret_basic` (default) or `client_secret_post`, set with `AuthMethod` | `Secret` (hashed with Argon2id) or `SecretHash` |
| `op.PrivateKeyJWTClient` | `private_key_jwt` | `JWKS`, the public key set, e.g. from `op.LoadPublicJWKS` |

```go
jwks, err := op.LoadPublicJWKS("keys/fapi-client.jwks.json")
if err != nil {
    return err
}

provider, err := op.New(
    // ...
    op.WithStaticClients(
        op.PublicClient{
            ID:           "web-spa",
            RedirectURIs: []string{"https://app.example.com/callback"},
            Scopes:       []string{"openid", "profile"},
        },
        op.ConfidentialClient{
            ID:           "billing-backend",
            Secret:       os.Getenv("BILLING_CLIENT_SECRET"),
            RedirectURIs: []string{"https://billing.example.com/callback"},
            Scopes:       []string{"openid"},
        },
        op.PrivateKeyJWTClient{
            ID:           "bank-connector",
            JWKS:         jwks,
            RedirectURIs: []string{"https://bank.example.com/callback"},
            Scopes:       []string{"openid"},
        },
    ),
)
```

Every seed is validated at construction and `op.New` refuses to start on a malformed one. Two rules matter most:

- A `ConfidentialClient` using `client_secret_basic` or `client_secret_post` must have a `Secret` or `SecretHash`. A seed without one is refused, because an empty hash would accept an empty `client_secret`.
- A client record must not carry both `jwks` and `jwks_uri` (RFC 7591 §2). Dynamic registration rejects the pair, and a record that holds both (possible in a bring-your-own store) is refused on request-object verification, `private_key_jwt` and response encryption alike.

Static seeds suit a known fleet: internal tools, FAPI deployments, single-tenant SaaS.

**Dynamic Client Registration (RFC 7591)** goes through `op.WithDynamicRegistration(...)`. RPs register themselves at runtime with `POST /register`. The OP applies the same validation, hashes the generated `client_secret` at rest, returns the plaintext exactly once (see [Design judgments #20](/security/design-judgments#dj-20)), and exposes the RFC 7592 management endpoints. It suits marketplaces, multi-tenant SaaS, and any deployment whose operator does not know the clients in advance.

The two paths coexist on one OP; a static FAPI fleet next to dynamic partner clients is a common shape.

::: warning Public clients are still registered
"Public client" does not mean "anyone can show up". The `client_id` was issued by some path, static seed or DCR, and the OP refuses requests that name an unknown `client_id`. PKCE-only authentication applies to a `client_id` the OP already knows; it is not a "no registration" mode.
:::

## Read next

- [Scopes and claims](/concepts/scopes-and-claims) — what a client can ask for once it has authenticated.
- [Sender constraint](/concepts/sender-constraint) — DPoP and mTLS bind the access token to a key the client holds; the FAPI-grade requirement.
- [Dynamic Client Registration](/use-cases/dynamic-registration) — the runtime self-registration path and its full lifecycle.
- [FAPI 2.0 primer](/concepts/fapi) — the profile that pins everything together for high-assurance deployments.
