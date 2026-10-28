---
title: Issuer
description: What the issuer URL is, why one canonical form matters, and what this library refuses at boot.
---

# Issuer

An **issuer** is the OP's identity URL. The same string appears in three places at once:

- the `iss` claim of every token the OP signs,
- the `iss` parameter on every authorization response (RFC 9207),
- the `issuer` field of the [discovery document](/concepts/discovery).

A confidential client may also use it as the `aud` of the `client_assertion` it signs to authenticate. The issuer is the one string that ties a token, a signing key, and a discovery document back to the same OP.

::: tip Mental model in 30 seconds
- The issuer is **a URL**, not just a hostname. `https://login.example.com` is an issuer; `login.example.com` is not.
- RPs compare it **byte-for-byte**. `https://login.example.com` and `https://login.example.com/` are different issuers as far as a strict RP is concerned.
- This library refuses to boot on a non-canonical value rather than silently normalising it. The string you pass to `op.WithIssuer` is the string every emitted token and document will carry.
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

OIDC Discovery 1.0 §4 derives the configuration URL by removing any terminating slash from the issuer and appending `/.well-known/openid-configuration`. RFC 9207 then has the OP echo the same `iss` on every authorization response, so a code delivered by the wrong authorization server is detected instead of being redeemed against the wrong one. This is the "mix-up" defence. Both checks rely on the OP and every RP agreeing on **one** canonical spelling.

Real deployments often produce two URIs that look equivalent but are not:

| Drift | Looks like | Why it breaks |
|---|---|---|
| Trailing slash | `https://idp.example.com/` vs `https://idp.example.com` | Discovery strips the slash when it builds the well-known URL, but the two are different issuer strings under exact comparison. The library accepts only the latter. |
| Default port | `https://idp.example.com:443` vs `https://idp.example.com` | The RP's byte-for-byte `iss` comparison fails as soon as the OP emits one form and a load balancer rewrites it to the other. |
| Mixed-case scheme | `HTTPS://idp.example.com` | Some URL parsers downcase the scheme and some do not, so an RP comparing the raw string and one comparing the parsed form see two different issuers. |
| Mixed-case host | `https://Idp.Example.com` | Hostnames resolve without regard to case, but an exact string comparison does not, and components that normalise the host differently disagree. |
| Non-canonical path | `https://idp.example.com//oidc` or `.../a/../b` | A component that normalises the path and one that keeps it verbatim produce different issuer strings. The library rejects these forms. |
| Fragment | `https://idp.example.com#main` | A fragment is never sent in an HTTP request, so it has no meaning inside `iss`. |
| Query string | `https://idp.example.com?env=prod` | Appending the well-known suffix would produce a malformed URL; the spec forbids a query. |

A spelling mismatch breaks exact issuer checks, including RFC 9207 mix-up validation, but it does not invalidate a JWT signature. The bug usually stays hidden until production traffic from one RP reaches the OP through a CDN or an alternate hostname.

## What this library refuses at boot

`op.New` validates the issuer during its construction pass and returns an error instead of starting on a malformed value. The rules:

- **Must be a non-empty, parseable URL.** An empty string or a string that fails `url.Parse` is rejected.
- **Must be absolute and carry an authority.** `oidc.example.com` (no scheme) and `https:///path` (no host) both fail.
- **Must not carry a query.** A `?` in the URL is rejected, because the discovery URL would be malformed.
- **Must not carry a fragment.** A `#` in the URL is rejected for the same reason.
- **Must not end with a trailing slash.** Both `https://idp.example.com/` and `https://idp.example.com/oidc/` are rejected: the issuer is concatenated with the well-known suffix, and a trailing slash yields a second, non-canonical spelling of the same document.
- **Scheme must be all-lowercase.** `HTTPS://idp.example.com` and `HtTpS://idp.example.com` are rejected. The validator inspects the raw input, so a parser that downcases the scheme cannot hide the drift.
- **Host must be all-lowercase.** `https://IDP.example.com` and `https://IDP.EXAMPLE.COM/oidc` are rejected. `u.Host` preserves raw casing, so any uppercase letter in the authority fails the check.
- **Must omit the default port.** `https://idp.example.com:443`, `https://idp.example.com:443/oidc`, and `http://127.0.0.1:80` are rejected. A redundant default port flips byte-equality the moment a load balancer canonicalises one side and not the other.
- **Path must be canonical.** `..` segments, `.` segments, and duplicate slashes (`https://idp.example.com/a/../b`, `https://idp.example.com/a/./b`, `https://idp.example.com//oidc`) are rejected. The validator runs `path.Clean` and refuses anything that does not round-trip.
- **Must use `https`.** The one carve-out is loopback IP literals (`127.0.0.0/8` and `[::1]`), which may use plain `http` so a development boot does not need TLS. The textual host `localhost` is **not** part of it, because a name resolved through DNS can be hijacked (RFC 8252 §8.3). `op.WithAllowLocalhostLoopback()` admits `localhost` explicitly, and a local passkey deployment needs it: a WebAuthn Relying Party ID must be a domain, so an issuer on `127.0.0.1` has no valid RP ID to pair with. Use it on a developer machine only. Because the option can change the verdict, the issuer is checked in `op.New`'s validation pass rather than inside `WithIssuer`, and the order of options does not matter.

Together these rules make `iss` byte-identical across the discovery document, every issued token and the `iss` parameter of authorization responses, which is the form RPs compare under RFC 9207.

Whatever passes the checks is used verbatim as `iss`, as the discovery document's `issuer`, and as one of the `client_assertion` audiences the library accepts. FAPI 2.0 Security Profile §5.3.2.1(8) allows only the issuer identifier as a JSON string, while the library also accepts the token endpoint URL and an array, so enabling a FAPI preset alone does not make `client_assertion` handling final-profile conformant. See [Design judgments — `client_assertion` audience](/security/design-judgments#dj-13).

## How to set it

```go
provider, err := op.New(
    op.WithIssuer("https://login.example.com"),
    // ... other options
)
```

`op.New` refuses the malformed spellings from the table above:

```go
// Refused: uppercase host, default port and trailing slash each break byte equality.
op.WithIssuer("https://IDP.example.com:443/oidc/")

// Accepted: one canonical spelling.
op.WithIssuer("https://idp.example.com/oidc")
```

A subpath issuer works for multi-tenant deployments. The issuer's path is part of the public endpoint namespace, not just metadata, so `op.New` mounts every protocol handler beneath it, followed by the mount prefix (`/oidc` by default). An issuer of `https://login.example.com/tenant-a` serves the token endpoint at `/tenant-a/oidc/token`.

The discovery document is the exception, and it is easy to get backwards. OpenID Connect Discovery 1.0 §4 appends the well-known suffix to the issuer, while RFC 8414 §3 inserts it **between the host and the issuer path**. The library serves the same document at both URLs, outside the mount prefix:

| | URL |
|---|---|
| Issuer | `https://login.example.com/tenant-a` |
| Discovery document (OIDC Discovery 1.0 §4) | `https://login.example.com/tenant-a/.well-known/openid-configuration` |
| Discovery document (RFC 8414 §3) | `https://login.example.com/.well-known/openid-configuration/tenant-a` |
| Token endpoint | `https://login.example.com/tenant-a/oidc/token` |

An RP that follows discovery never notices, but an operator writing proxy rules by hand must route both discovery paths. `op.New` fails if an endpoint override collides with the issuer-path form. The trailing-slash rule still applies: `https://login.example.com/tenant-a` is canonical, `https://login.example.com/tenant-a/` is not.

::: warning One value across the lifetime of the deployment
Once RPs have stored your issuer string, every change breaks them. Fix the canonical form before the first RP integrates: pick a hostname you will not need to retire, decide the subpath shape, and never let a load balancer rewrite the host or scheme in transit. The library catches most boot-time mistakes, but it cannot see a TLS-terminating proxy that strips the path or downcases the host downstream.
:::

## Read next

- [Authorization Code + PKCE flow](/concepts/authorization-code-pkce) — the common flow whose `iss` echo (RFC 9207) depends on the canonical issuer.
- [Discovery](/concepts/discovery) — the document that carries `issuer` and every endpoint URL.
- [Redirect URI](/concepts/redirect-uri) — the other URL the OP compares byte-for-byte; the same lessons apply.
- [Design judgments — Issuer identifier validation](/security/design-judgments#dj-9) — the explicit reasoning behind the rejection set above.
