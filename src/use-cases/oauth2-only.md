---
title: Plain OAuth 2.0 (no openid scope)
description: Serve OAuth 2.0 alongside OIDC. The same OP issues access-only tokens to non-OIDC clients.
---

# Use case — Plain OAuth 2.0

OIDC Core 1.0 §3.1.2.1 requires `openid` in an OIDC authorization request; without it, the request is not an OpenID request and OIDC Core does not define how the OP handles it. This library rejects such requests by default, but one option lets the same OP also serve OAuth-only clients that need an access token without an ID Token.

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750) — OAuth 2.0 Bearer Token Usage
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1 (the `openid` scope is the OIDC switch)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — `scopes_supported`
:::

::: details Vocabulary refresher
- **OAuth 2.0 vs OIDC** — OAuth 2.0 issues `access_token`s for *delegated API access* — the token says "this client may call this API on this user's behalf". OIDC layers identity on top: when the request includes the `openid` scope, the OP additionally returns an `id_token` that asserts *who* the user is. Without `openid`, the OP behaves as a plain OAuth 2.0 server.
- **Bearer token** — An access token whose presentation alone proves authorisation (RFC 6750). The resource server validates it (by introspection or by JWT signature) and then enforces the granted scopes.
- **`/userinfo`** — Defined by OIDC for access tokens obtained through OIDC authentication. This library also accepts a subject-bearing OAuth-only authorization-code token when its scopes allow user claims. That behavior is a library extension, not an OAuth 2.0 UserInfo standard; grantless service tokens are rejected.
:::

> **Source:** [`examples/04-oauth2-only`](https://github.com/libraz/go-oidc-provider/tree/main/examples/04-oauth2-only)

## The seam

```go
op.New(
  /* required options */
  op.WithOpenIDScopeOptional(),
  op.WithScope(op.PublicScope("api:read", "Read your API resources")),
  op.WithStaticClients(
    // OIDC client: lists "openid", so /token still returns an id_token.
    op.ConfidentialClient{
      ID: "oidc-rp", Secret: "…", AuthMethod: op.AuthClientSecretBasic,
      RedirectURIs: []string{"http://localhost:5173/cb"},
      GrantTypes:   []string{"authorization_code", "refresh_token"},
      Scopes:       []string{"openid", "profile", "email"},
    },
    // OAuth-only client: no "openid" in its scopes.
    op.ConfidentialClient{
      ID: "oauth-cli", Secret: "…", AuthMethod: op.AuthClientSecretBasic,
      RedirectURIs: []string{"http://localhost:5173/cb"},
      GrantTypes:   []string{"authorization_code"},
      Scopes:       []string{"api:read"},
    },
  ),
)
```

The option removes one check: the requirement that every authorization request carry `openid`. Every other check still runs, including the client's registered `Scopes` list and `Scope.AllowedClients`, so `oauth-cli` can request `api:read` and nothing else.

| Request | Behaviour |
|---|---|
| `scope=openid profile email` | Full OIDC: `id_token`, `/userinfo`, and a `refresh_token` when the grant gates pass |
| `scope=api:read` | OAuth 2.0: `access_token`, plus a `refresh_token` when the provider and the client both allow the `refresh_token` grant; no `id_token` |
| `scope=api:read` from a client that does not list it | `invalid_scope` |
| Any request without `openid`, option not set | `invalid_scope`, "openid scope is required" |

The choice is **per request**, driven by the client's registered scopes, not a global switch. A client whose `Scopes` includes `openid` can still ask for OIDC; a client whose `Scopes` omits it stays OAuth-only.

## Side effects

| Behaviour | Request with `openid` | Request without `openid` |
|---|---|---|
| `id_token` in the `/token` response | Issued | Never issued |
| `nonce` | Stored and echoed into the `id_token` when sent | Nothing to bind it to; optional unless a profile requires it |
| `/userinfo` with the access token | Yes | Only for a subject-bearing authorization-code token whose scopes allow user claims (a library extension) |
| Refresh token eligibility | Needs `openid` in the granted scope and the `refresh_token` grant on the client | The `openid` precondition is lifted; the client still needs the `refresh_token` grant |

A `client_credentials` token names no end user, so `/userinfo` rejects it with `invalid_token` in either mode.

## Try it

The example's header comment drives the OAuth-only path by hand. Derive a PKCE pair, open the authorization URL in a browser, sign in as `demo` / `demo`, then exchange the code:

```sh
(cd examples/04-oauth2-only && GOWORK=off go run -tags example .)

VERIFIER='oauth2-only-example-verifier-0123456789-ABCDEFGHIJKLMN'
CHALLENGE="$(printf %s "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
open "http://127.0.0.1:8080/oidc/auth?client_id=oauth-cli&response_type=code&redirect_uri=http://localhost:5173/cb&scope=api:read&state=xyz&code_challenge=${CHALLENGE}&code_challenge_method=S256"

# after consent, take the code from the redirect URL:
curl -u oauth-cli:oauth2-only-demo-secret-rotate-me \
     -d "grant_type=authorization_code&code=<CODE>&redirect_uri=http://localhost:5173/cb&code_verifier=${VERIFIER}" \
     http://127.0.0.1:8080/oidc/token | jq
```

The response carries `access_token` and no `id_token`, because the granted scope has no `openid`. The example calls `op.WithAllowLocalhostLoopback()` so that the `http://localhost` redirect URI is accepted; without it only the IP literals `127.0.0.1` and `[::1]` are.

## Mutual exclusion

`op.WithOpenIDScopeOptional` cannot be combined with the library's FAPI 2.0 profiles: `op.New` returns an error. This is a library policy. The FAPI 2.0 Security Profile can be used for OAuth 2.0 requests without OIDC, and OIDC applies when the client needs an authenticated user's identifier.

```go
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithOpenIDScopeOptional(), // ← op.New returns an error
)
```

`op.WithStrictOfflineAccess()` is also rejected, because strict mode applies OIDC Core §11 to refresh tokens, and combining it with non-OIDC requests would silently stop refresh tokens from being issued.

## When to use it

| Scenario | Pick |
|---|---|
| OAuth 2.0 only, no users (machine-to-machine) | [`client_credentials`](/use-cases/client-credentials); `WithOpenIDScopeOptional` is not needed |
| OAuth 2.0 and OIDC clients on the same OP | This option |
| FAPI 2.0 deployment | Do not use this option |

If every client of the OP is an OIDC RP, leave the option unset so that a request missing `openid` fails loudly instead of being served.

## Read next

- [Tokens primer](/concepts/tokens): what is in an access token versus an ID Token.
- [Client Credentials](/use-cases/client-credentials): the other "no end user" path.
