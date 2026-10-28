---
title: Client Credentials
description: Service-to-service tokens with no end user. RFC 6749 §4.4.
pageClass: pg-concepts-client-credentials
---

# Client Credentials

`grant_type=client_credentials` is the **service-to-service** grant: no end user, no browser, no consent. A confidential backend authenticates **as itself** at the token endpoint and gets an access token to call another backend. Use it for batch jobs, internal APIs and daemons; use [authorization code + PKCE](./authorization-code-pkce) whenever a person is involved.

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework (§4.4 client credentials)
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) — Assertion Framework for OAuth 2.0
- [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — JWT Profile for OAuth 2.0 Client Authentication (`private_key_jwt`)
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) — JWT Profile for OAuth 2.0 Access Tokens
:::

::: details Vocabulary refresher
- **Confidential client** — a client that can hold a real authentication credential (a long-lived secret, an asymmetric key, or an X.509 certificate). Backends and trusted servers are confidential. See [Client types](./client-types).
- **Public client** — a client that *cannot* hold a real secret in practice (SPAs in a browser, native mobile apps). They authenticate with `token_endpoint_auth_method=none` and rely on PKCE for code protection.
- **`private_key_jwt`** — client authentication where the client signs a short-lived JWT with its private key; the OP verifies it against the registered public key. Stronger than a shared secret because the secret never leaves the client.
:::

<figure class="fig">
  <div class="fig-head">One service gets a token as itself, no user</div>
  <svg class="fig-svg" role="img" aria-labelledby="cc-flow-title" viewBox="0 0 960 632" xmlns="http://www.w3.org/2000/svg">
    <title id="cc-flow-title">The client credentials flow. Service A authenticates to the OP as itself, receives an access token scoped to what it registered, and presents that token as a bearer credential to Service B.</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="296" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="132">Get a token</text>
    <rect class="fg-group" x="32" y="424" width="896" height="182" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="452">Call the API</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="608"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="608"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="608"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">your backend</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">another backend</text>
    <!-- token request -->
    <path class="fg-edge" d="M192,206 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="172" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="352" y="194" text-anchor="middle">grant_type=client_credentials</text>
    <!-- OP checks -->
    <path class="fg-edge fg-edge--accent" d="M512,246 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="252">authenticate the client</text>
    <text class="fg-s" x="568" y="274">check the scope against</text>
    <text class="fg-s" x="568" y="296">its allow-list</text>
    <!-- token response -->
    <path class="fg-edge fg-edge--accent" d="M512,376 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="342" text-anchor="middle">200 · access_token</text>
    <text class="fg-xs" x="352" y="364" text-anchor="middle">no id_token, no refresh_token</text>
    <!-- API call -->
    <path class="fg-edge" d="M192,526 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="492" text-anchor="middle">GET /things</text>
    <text class="fg-mxs fg-halo" x="508" y="514" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <!-- API response -->
    <path class="fg-edge fg-edge--muted" d="M824,582 H192" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="572" text-anchor="middle">200 [ … ]</text>
  </svg>
  <figcaption class="fig-note">The access token is the only thing that comes back: no ID token, because there is no user to describe, and no refresh token, because the client can authenticate and ask again. The <code>sub</code> of the token is the client itself.</figcaption>
</figure>

::: warning Confidential clients only
`client_credentials` is restricted to **confidential** clients — clients with a real authentication credential (`client_secret_basic`, `client_secret_post`, `private_key_jwt`). Public clients (SPAs / native, `token_endpoint_auth_method=none`) cannot use it. `tls_client_auth` and `self_signed_tls_client_auth` are not selectable in this library; [mTLS](./mtls) binds the issued access token to a certificate instead, whichever method authenticated the client.

There is no end user, so there is no PKCE, no consent, no `id_token`, and **no refresh token**. The client just re-runs the grant when the access token expires.
:::

## Wiring

Enable the grant explicitly. The token endpoint refuses any grant type that is not in the enabled set.

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

A registered client opts in through `GrantTypes`. A static `client_secret_basic` / `client_secret_post` client must carry `Secret` (or a pre-computed `SecretHash`); `op.New` refuses one without. For `private_key_jwt`, use `op.PrivateKeyJWTClient` with the public JWKS.

```go
op.WithStaticClients(op.ConfidentialClient{
  ID:         "service-a",
  Secret:     "rotate-me",
  AuthMethod: op.AuthClientSecretBasic, // the default when empty
  GrantTypes: []string{"client_credentials"},
  Scopes:     []string{"read:things", "write:things"},
})
```

::: details Why both global and per-client opt-in?
- **Global** (`op.WithGrants`) sets which grants the OP supports at all, surfaced in `grant_types_supported` of the [discovery document](./discovery).
- **Per-client** (`GrantTypes` on the client record) sets which of those grants *this client* may use. When left empty, a static client defaults to `authorization_code` and `refresh_token`; a non-empty list replaces the default entirely.

A request succeeds only when both checks pass. One OP can therefore issue `authorization_code` to end-user apps and `client_credentials` to backend services, and an SPA client cannot mint app-level tokens.
:::

## Token shape

`client_credentials` access tokens carry:

- `iss` — the OP issuer
- `aud` — the `resource` the request named (RFC 8707), or the OP issuer when it named none; see below
- `client_id` — the requesting client
- `sub = client_id` — RFC 9068 §2.2 says `sub` SHOULD correspond to the client application; this library uses the client itself as the subject
- `scope` — the granted scopes. A request without `scope` gets every scope registered on the client except `openid`

When `op.WithFeature(feature.MTLS)` or DPoP is configured and the client presented a sender constraint, the token additionally carries the `cnf` (Confirmation, RFC 7800) claim binding it to that constraint.

The subject is never pairwise: with a pairwise `SubjectType` on the client, `sub` is still the plain `client_id`, because pairwise identifiers are defined for end users only.

::: details Why `sub = client_id` here?
In the user-facing flows, `sub` is the end-user's stable identifier. In `client_credentials` there is no end user, so RFC 9068 §2.2 says `sub` SHOULD correspond to the client application; it does not require literal equality with `client_id`. This library chooses that direct mapping and sets `sub = client_id`, so the *client itself* acts as the subject. RSes that read `sub` to log "who did this" still get a stable identifier; they just need to know that for service tokens, that identifier is a registered service rather than a person. A common bug is to assume `sub` always points to a row in the user table; for service tokens it points to a row in the *client* table.
:::

::: details `aud` for `client_credentials` — what it means and how it's set
**`aud`** names the resource server the token is for — *not* the `client_id`. It tells the RS "this token was minted for me to consume." The library sets it from the request:

- With `resource=https://api.example.com` (RFC 8707), `aud` is that value, canonicalised. The value must appear in the client's registered `Resources` allow-list, and only one `resource` is accepted per request; anything else is `400 invalid_target`.
- Without `resource`, `aud` is the OP issuer.

`Resources` is an allow-list, not a default: registering it does not put anything into `aud` by itself. An RS should reject tokens whose `aud` is not its own identifier. That is the audience-restriction defence against a token stolen from one RS being replayed against another.
:::

## What the token endpoint answers

| Condition | Response |
|---|---|
| Client authentication fails | `invalid_client`; `503` instead when the client's JWKS fetch is overloaded or failing, `500 server_error` on a client-store outage |
| Public client, or `client_credentials` not in the client's `GrantTypes` | `400 unauthorized_client` |
| `scope` contains `openid` | `400 invalid_scope` |
| `scope` contains an entry outside the client's registered `Scopes` | `400 invalid_scope` (rejected, not silently narrowed) |
| `resource` malformed, repeated with different values, or not in `Resources` | `400 invalid_target` |

Public and unregistered-grant clients get the same code on purpose, so a caller cannot tell the two apart from the wire.

::: details Bearer vs sender-constrained — what's the difference?
By default, `client_credentials` access tokens are **bearer** tokens (RFC 6750): "whoever holds it, can use it." A leaked bearer token works for the attacker until it expires.

**Sender-constrained** access tokens (RFC 8705 mTLS or RFC 9449 DPoP) carry a `cnf` claim binding the token to a key the legitimate client holds. The RS verifies, on every API call, that the caller proves possession of that key. A leaked token is then useless without the matching private key — and the matching private key never leaves the client.

For service-to-service traffic in regulated contexts (FAPI 2.0, PSD2, OBL), sender-constrained is the expected default. For internal-network service traffic where mTLS is already enforced at the mesh, plain bearer is often acceptable.
:::

## See it run

[`examples/05-client-credentials`](https://github.com/libraz/go-oidc-provider/tree/main/examples/05-client-credentials) is a machine-to-machine-only OP (`op.WithGrants(grant.ClientCredentials)`) with one `client_secret_basic` client; the `curl` command it prints at startup fetches a token.

```sh
(cd examples/05-client-credentials && GOWORK=off go run -tags example .)
```

## Read next

- [Access token format](./access-token-format) — JWT vs opaque, and how `aud` selects the format.
- [Sender constraint (DPoP / mTLS)](/concepts/sender-constraint) — bind service tokens to a client-held key so a stolen token is useless.
- [Use case: client_credentials in production](/use-cases/client-credentials).
