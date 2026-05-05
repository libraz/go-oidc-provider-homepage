---
title: Client Credentials
description: Service-to-service tokens with no end user. RFC 6749 §4.4.
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

```mermaid
sequenceDiagram
    autonumber
    participant SVC as Service A<br/>(your backend)
    participant OP as OP (go-oidc-provider)
    participant SVC2 as Service B<br/>(another backend)

    SVC->>OP: POST /token<br/>grant_type=client_credentials<br/>scope=read:things<br/>client auth (basic / private_key_jwt / mTLS)
    OP->>OP: validate scopes against client allow-list
    OP->>SVC: 200 { access_token, expires_in }
    SVC->>SVC2: GET /things<br/>Authorization: Bearer <access_token>
    SVC2->>SVC: 200 [...]
```

::: warning Confidential clients only
`client_credentials` is structurally restricted to **confidential** clients in this library — clients with a real authentication credential (`client_secret_basic`, `client_secret_post`, `private_key_jwt`, `tls_client_auth`, `self_signed_tls_client_auth`). Public clients (SPAs / native, `token_endpoint_auth_method=none`) cannot use it.

There is no end user, so there is no PKCE, no consent, no `id_token`, and **no refresh token**. The client just re-runs the grant when the access token expires.
:::

## Wiring

Enable the grant explicitly. The library refuses to mint tokens for any grant type not in the enabled set.

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
)

handler, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(cookieKey),
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
go run -tags example ./examples/05-client-credentials
```

## Read next

- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — bind service tokens to a client-held key so a stolen token is useless.
- [Use case: client_credentials in production](/use-cases/client-credentials).
