---
title: Client Credentials
description: Service-to-service tokens with no end user. RFC 6749 §4.4.
pageClass: pg-concepts-client-credentials
---

# Client Credentials

`grant_type=client_credentials` is the **service-to-service** grant: no end user, no browser, no consent. A confidential backend authenticates **as itself** and gets an access token to call another backend.

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework (§4.4 client credentials)
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) — Assertion Framework for OAuth 2.0
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication (`private_key_jwt`)
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
:::

::: details Vocabulary refresher
- **Confidential client** — a client that can hold a real authentication credential (a long-lived secret, an asymmetric key, or an X.509 certificate). Backends and trusted servers are confidential.
- **Public client** — a client that *cannot* hold a real secret in practice (SPAs in a browser, native mobile apps). They authenticate with `token_endpoint_auth_method=none` and rely on PKCE for code protection.
- **`private_key_jwt`** — client authentication where the client signs a short-lived JWT with its private key; the OP verifies it against the registered public key. Stronger than a shared secret because the secret never leaves the client.
:::

<figure class="fig">
  <div class="fig-head">Client Credentials — one service, no user</div>
  <svg class="fig-svg" role="img" aria-labelledby="cc-flow-title" viewBox="0 0 960 316" xmlns="http://www.w3.org/2000/svg">
    <title id="cc-flow-title">The client credentials flow. Service A authenticates to the OP as itself, receives an access token scoped to what it registered, and presents that token as a bearer credential to Service B.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="160" y1="62" x2="160" y2="300"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="300"/>
    <line class="fg-life" x1="820" y1="62" x2="820" y2="300"/>
    <!-- actors -->
    <rect class="fg-box" x="70" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="160" y="35" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="160" y="49" text-anchor="middle">your backend</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="730" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="820" y="35" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="820" y="49" text-anchor="middle">another backend</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="124" r="8.5"/>
    <text class="fg-badge-t" x="15" y="127" text-anchor="middle">1</text>
    <path class="fg-edge" d="M160,124 H500" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="330" y="92" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="330" y="105" text-anchor="middle">grant_type=client_credentials</text>
    <text class="fg-mxs" x="330" y="118" text-anchor="middle">scope · client authentication</text>
    <!-- 2 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="158" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="161" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,150 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="542" y="154">check the requested scope</text>
    <text class="fg-mxs" x="542" y="167">against the client's allow-list</text>
    <!-- 3 -->
    <circle class="fg-badge" cx="15" cy="204" r="8.5"/>
    <text class="fg-badge-t" x="15" y="207" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--accent" d="M500,204 H160" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="330" y="184" text-anchor="middle">200 OK</text>
    <text class="fg-mxs" x="330" y="197" text-anchor="middle">{ access_token, expires_in } — no id_token, no refresh_token</text>
    <!-- 4 -->
    <circle class="fg-badge" cx="15" cy="252" r="8.5"/>
    <text class="fg-badge-t" x="15" y="255" text-anchor="middle">4</text>
    <path class="fg-edge" d="M160,252 H820" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="490" y="232" text-anchor="middle">GET /things</text>
    <text class="fg-mxs fg-halo" x="490" y="245" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="288" r="8.5"/>
    <text class="fg-badge-t" x="15" y="291" text-anchor="middle">5</text>
    <path class="fg-edge" d="M820,288 H160" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="490" y="282" text-anchor="middle">200 [ … ]</text>
  </svg>
  <figcaption class="fig-note">There is no user anywhere in this picture, so there is nothing for an ID token to describe and nobody to re-consent when a refresh token would have expired. The <code>sub</code> of the resulting token is the client itself.</figcaption>
</figure>

::: warning Confidential clients only
`client_credentials` is structurally restricted to **confidential** clients in this library — clients with a real authentication credential (`client_secret_basic`, `client_secret_post`, `private_key_jwt`). Public clients (SPAs / native, `token_endpoint_auth_method=none`) cannot use it. mTLS can bind issued access tokens, but it is not a `client_credentials` authentication method.

There is no end user, so there is no PKCE, no consent, no `id_token`, and **no refresh token**. The client just re-runs the grant when the access token expires.
:::

## Wiring

Enable the grant explicitly. The library refuses to mint tokens for any grant type not in the enabled set.

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

st := inmem.New()
browserFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

handler, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(browserFlow),
  op.WithGrants(
    grant.AuthorizationCode, // for human users
    grant.RefreshToken,
    grant.ClientCredentials, // for service-to-service
  ),
  op.WithStaticClients(/* a confidential client */),
)
```

A registered client opting in via `GrantTypes`:

```go
op.WithStaticClients(op.ConfidentialClient{
  ID:         "service-a",
  Secret:     "rotate-me",
  AuthMethod: op.AuthClientSecretBasic, // or use op.PrivateKeyJWTClient instead for private_key_jwt
  GrantTypes: []string{"client_credentials"},
  Scopes:     []string{"read:things", "write:things"},
})
```

::: details Why both global and per-client opt-in?
- **Global** (`op.WithGrants`) gates which grants the OP supports at all, surfaced in `grant_types_supported` of the discovery document.
- **Per-client** (`store.Client.GrantTypes`) gates which of those grants *this specific client* may use.

A client only succeeds when both checks pass. This lets you run a single OP that issues `authorization_code` for end-user apps and `client_credentials` for backend services, without giving the SPA client the ability to mint app-level tokens.
:::

## Token shape

`client_credentials` access tokens carry:

- `iss` — the OP issuer
- `aud` — the resource server identifier (the typed seeds carry a `Resources []string` field that lists permitted RFC 8707 resource indicators; with DCR, the equivalent `resources` metadata field)
- `client_id` — the requesting client
- `sub = client_id` — RFC 9068 §2.2 / FAPI 2.0 posture: the client is the subject acting on its own behalf
- `scope` — the granted subset of the requested scopes

When `op.WithFeature(feature.MTLS)` or DPoP is configured and the client presented a sender constraint, the token additionally carries the `cnf` (Confirmation, RFC 7800) claim binding it to that constraint.

::: details Why `sub = client_id` here?
In the user-facing flows, `sub` is the end-user's stable identifier. In `client_credentials` there is no end user, so RFC 9068 §2.2 requires the `sub` to equal the `client_id` — the *client itself* is acting as the subject. RSes that read `sub` to log "who did this" still get a stable identifier; they just need to know that for service tokens, that identifier is a registered service rather than a person. A common bug is to assume `sub` always points to a row in the user table; for service tokens it points to a row in the *client* table.
:::

::: details `aud` for `client_credentials` — what it means and how it's set
**`aud`** is the resource server identifier — *not* the `client_id`, *not* the OP's issuer. It tells the RS "this token was minted for me to consume." The library populates it from:

- The client's registered `Resources []string` (the allow-list of RFC 8707 resource indicators the client is permitted to ask for); or
- The runtime `resource=...` request parameter (RFC 8707), if the client requests one within its allow-list.

Without `Resources` configured and without a runtime `resource` parameter, the OP falls back to a deployment-defined default. RSes should reject tokens whose `aud` doesn't match their own identifier — that's the audience-restriction defence against a token stolen from an RS being replayed against a different RS.
:::

::: details Bearer vs sender-constrained — what's the difference?
By default, `client_credentials` access tokens are **bearer** tokens (RFC 6750): "whoever holds it, can use it." A leaked bearer token works for the attacker until it expires.

**Sender-constrained** access tokens (RFC 8705 mTLS or RFC 9449 DPoP) carry a `cnf` claim binding the token to a key the legitimate client holds. The RS verifies, on every API call, that the caller proves possession of that key. A leaked token is then useless without the matching private key — and the matching private key never leaves the client.

For service-to-service traffic in regulated contexts (FAPI 2.0, PSD2, OBL), sender-constrained is the expected default. For internal-network service traffic where mTLS is already enforced at the mesh, plain bearer is often acceptable.
:::

## See it run

[`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) ships a runnable end-to-end version with a `client_secret_basic` client.

```sh
(cd examples/05-client-credentials && GOWORK=off go run -tags example .)
```

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — bind service tokens to a client-held key so a stolen token is useless.
- [Use case: client_credentials in production](/use-cases/client-credentials).
