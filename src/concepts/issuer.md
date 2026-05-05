---
title: Issuer
description: What the issuer URL is, why one canonical form matters, and what this library refuses at boot.
---

# Issuer

An **issuer** is the OP's identity URL. It appears in the `iss` claim of every token the OP signs, in the `issuer` field of `/.well-known/openid-configuration`, in the `iss` of every JWKS entry's parent metadata, and — depending on profile — in the `aud` of the `client_assertion` a confidential client signs to authenticate. It is the single string that ties a token, a signing key, and a discovery document back to the same OP.

::: tip Mental model in 30 seconds
- The issuer is **a URL**, not just a hostname. `https://login.example.com` is an issuer; `login.example.com` is not.
- RPs compare it **byte-for-byte**. `https://login.example.com` and `https://login.example.com/` are different issuers as far as a strict RP is concerned.
- This library refuses to boot on a non-canonical value rather than silently normalising it. The shape you pass to `op.WithIssuer` is the shape every emitted artefact will use.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework
- [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) — JSON Web Token (JWT) — the `iss` claim
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — OAuth 2.0 Authorization Server Metadata
- [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207) — OAuth 2.0 Authorization Server Issuer Identification
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — §3
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §2 (ID Token)
:::

## Why canonical form matters

OIDC Discovery 1.0 §3 says the issuer identifier is concatenated verbatim with `/.well-known/openid-configuration` to derive the configuration URL. RFC 9207 then requires the OP to echo the same `iss` on authorization responses so a misrouted code cannot be silently used against the wrong AS — the so-called "mix-up" defence. Both checks rely on the OP and every RP agreeing on **one** canonical spelling.

Real deployments commonly produce two URIs that look equivalent but are not:

| Drift | Looks like | Why it breaks |
|---|---|---|
| Trailing slash | `https://idp.example.com/` vs `https://idp.example.com` | `<issuer>/.well-known/...` would become `https://idp.example.com//.well-known/...` for the first, breaking the configuration URL. |
| Default port | `https://idp.example.com:443` vs `https://idp.example.com` | The byte-for-byte `iss` comparison on the RP side fails the moment the OP starts emitting one shape and a load balancer rewrites to the other. |
| Mixed-case scheme | `HTTPS://idp.example.com` | URL parsers normalise inconsistently. Some downcase the scheme during parsing, some do not — an RP that compares the raw string and one that compares the parsed form see two different issuers. |
| Mixed-case host | `https://Idp.Example.com` | RFC 3986 §3.2.2 / §6.2.2.1 require host case-folding for byte-exact comparison; an RP that does not fold sees a different issuer than one that does. |
| Non-canonical path | `https://idp.example.com//oidc` or `.../a/../b` | Duplicate slashes, `..`, and `.` segments confuse the issuer concatenation that produces the `.well-known` URL and defeat byte-exact comparison. |
| Fragment | `https://idp.example.com#main` | A fragment has no role in HTTP request routing; carrying one in `iss` is structurally meaningless. |
| Query string | `https://idp.example.com?env=prod` | The discovery URL would fold into a malformed concatenation; the spec forbids it. |

A single drift breaks every signature check and every RFC 9207 mix-up validation. The class of bug is usually invisible until production traffic from one RP reaches the OP through a CDN or alternate hostname.

## What this library refuses at boot

`op.WithIssuer` validates the value at the option site and `op.New` returns a build-time error rather than starting on a malformed issuer. The rules enforced today:

- **Must be a non-empty, parseable URL.** An empty string or a string that fails `url.Parse` is rejected.
- **Must be absolute and carry an authority.** `oidc.example.com` (no scheme) and `https:///path` (no host) both fail.
- **Must not carry a query.** A `?` in the URL is rejected — the discovery URL would fold into a malformed concatenation.
- **Must not carry a fragment.** A `#` in the URL is rejected for the same reason.
- **Must not end with a trailing slash on the path.** Both `https://idp.example.com/` and `https://idp.example.com/oidc/` are rejected because the issuer is concatenated verbatim with `/.well-known/openid-configuration` to derive the configuration URL.
- **Scheme must be all-lowercase.** `HTTPS://idp.example.com` and `HtTpS://idp.example.com` are rejected. The validator inspects the raw input (not just the parsed form) so a parser that downcases the scheme during normalisation cannot mask the drift.
- **Host must be all-lowercase.** `https://IDP.example.com` and `https://IDP.EXAMPLE.COM/oidc` are rejected. `u.Host` preserves raw casing, so any uppercase letter in the authority fails the check.
- **Must omit the default port.** `https://idp.example.com:443`, `https://idp.example.com:443/oidc`, and `http://127.0.0.1:80` are rejected. A redundant default port flips byte-equality the moment a load balancer canonicalises one side and not the other.
- **Path must be canonical.** `..` segments, `.` segments, and duplicate slashes (`https://idp.example.com/a/../b`, `https://idp.example.com/a/./b`, `https://idp.example.com//oidc`) are rejected. The validator runs `path.Clean` and refuses anything that does not round-trip.
- **Must use `https`.** The only carve-out is loopback IP literals (`127.0.0.0/8` and `[::1]`), which may use plain `http` so a development boot does not need TLS. The textual host `localhost` is **not** in the carve-out — it can be DNS-hijacked (RFC 8252 §7.3 reasoning), so production deployments and DNS-rebinding-sensitive setups are forced onto the IP literal.

These rules together guarantee `iss` is byte-exact across the discovery document, every issued token, and the authorization-response `iss` parameter — the form RPs compare under RFC 9207 mix-up defence.

Anything that passes those checks is accepted as the canonical form. Whatever you pass is the value reused for `iss` in every emitted artefact, for the discovery document's own `issuer` field, and for the `client_assertion` audience checks under FAPI 2.0.

## How to set it

```go
provider, err := op.New(
    op.WithIssuer("https://login.example.com"),
    // ... other options
)
```

A subpath issuer is fine for multi-tenant deployments — `op.New` mounts every endpoint relative to the issuer's path, so the discovery document for `https://login.example.com/tenant-a` lives at `https://login.example.com/tenant-a/.well-known/openid-configuration`. The trailing slash rule still applies: `https://login.example.com/tenant-a` is canonical; `https://login.example.com/tenant-a/` is not.

::: warning One value across the lifetime of the deployment
Once RPs have stored your issuer string, every change is a breaking change for them. Plan the canonical form before the first RP integrates: pick a hostname you will not need to retire, decide the subpath shape, and never let a load balancer rewrite the host or scheme on its way through. The library catches most boot-time mistakes; it cannot catch a TLS-terminating proxy that strips the path or downcases the host downstream.
:::

## Read next

- [Authorization Code + PKCE flow](/concepts/authorization-code-pkce) — the common flow whose `iss` echo (RFC 9207) depends on the canonical issuer.
- [Redirect URI](/concepts/redirect-uri) — the other URL the OP compares byte-for-byte; the same lessons apply.
- [Design judgments — Issuer identifier validation](/security/design-judgments#dj-9) — the explicit reasoning behind the rejection set above.
