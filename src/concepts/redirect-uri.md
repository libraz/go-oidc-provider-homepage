---
title: Redirect URI
description: How the default /auth redirect_uri check uses exact matching, what RFC 8252 loopback relaxation permits, and how to avoid a CVE-class mistake.
pageClass: pg-concepts-redirect-uri
---

# Redirect URI

A **redirect URI** is the URL the OP sends the user back to after `/auth` finishes — with `?code=...&state=...` on success, or `?error=...&state=...` on failure. When the provider is mounted at `/oidc`, this endpoint is `/oidc/auth`. The RP registers one (or more) at client-creation time; the OP compares the registered value against the `redirect_uri` query parameter on every authorize request. Mismatches reject the request before the user is sent anywhere.

::: tip Mental model in 30 seconds
- The `redirect_uri` is **byte-for-byte exact-match** by default. `/cb` and `/cb/` are different URIs.
- A few historical relaxations exist (loopback ports for CLI tools), but they are opt-in and narrowly scoped.
- The OP rejects the request **before** redirecting to a wrong URI, because the redirect itself is the attack vector.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §3.1.2.3 (redirect URI registration and matching)
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps (§7.3 loopback, §7.1 custom URI schemes, §8.3 DNS rebinding)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice (§4.1 redirect URI handling)
- [OpenID Connect Registration 1.0](https://openid.net/specs/openid-connect-registration-1_0.html) — §2 (`redirect_uris`, `application_type`)
:::

## Why exact-match

A wildcard or prefix-match policy on `redirect_uri` was the source of an entire CVE class in OAuth's early years. An attacker who could induce the OP to redirect to any URL within the registered prefix could:

1. Register their own subdomain or path under the registered prefix, or compromise one downstream resource the prefix admitted.
2. Initiate an authorize request, substituting their attacker-controlled URL for the legitimate `redirect_uri`.
3. Receive the authorization code in the redirect.
4. Exchange the code for a token because the client_id and PKCE state matched.

RFC 9700 §4.1 closes this off:

> **RFC 9700 §4.1 (paraphrase)** authorization servers MUST compare the `redirect_uri` parameter against the registered URIs using simple string comparison; pattern matching, wildcards, and substring matching MUST NOT be used.

The library implements this literally. Whatever string the client registered is the only string that satisfies that registration. If you registered `https://app.example.com/cb`, the request must use exactly that.

<svg role="img" aria-labelledby="redirect-exact-title" viewBox="0 0 760 280" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="redirect-exact-title">Only a byte-for-byte identical redirect_uri matches the registered value. A trailing slash, an added query parameter, a different host case, and a different port all fail.</title>
  <text class="ru-cap" x="24" y="18">REGISTERED</text>
  <rect class="ru-registered" x="24" y="28" width="712" height="40" rx="8"/>
  <text class="ru-registered-uri" x="44" y="53">https://app.example.com/cb</text>
  <text class="ru-cap" x="24" y="98">SENT ON THE AUTHORIZE REQUEST</text>
  <line class="ru-rule" x1="24" y1="108" x2="736" y2="108"/>
  <text class="ru-ok" x="30" y="132">✓</text>
  <text class="ru-uri" x="56" y="132">https://app.example.com/cb</text>
  <text class="ru-why" x="470" y="132">exact match — accepted</text>
  <text class="ru-no" x="30" y="164">✗</text>
  <text class="ru-uri" x="56" y="164">https://app.example.com/cb<tspan class="ru-diff">/</tspan></text>
  <text class="ru-why" x="470" y="164">trailing slash</text>
  <text class="ru-no" x="30" y="196">✗</text>
  <text class="ru-uri" x="56" y="196">https://app.example.com/cb<tspan class="ru-diff">?env=prod</tspan></text>
  <text class="ru-why" x="470" y="196">extra query parameter</text>
  <text class="ru-no" x="30" y="228">✗</text>
  <text class="ru-uri" x="56" y="228">https://<tspan class="ru-diff">APP</tspan>.example.com/cb</text>
  <text class="ru-why" x="470" y="228">host spelled in another case</text>
  <text class="ru-no" x="30" y="260">✗</text>
  <text class="ru-uri" x="56" y="260">https://app.example.com<tspan class="ru-diff">:8443</tspan>/cb</text>
  <text class="ru-why" x="470" y="260">different port</text>
</svg>

Every rejected row above differs from the registered string by one or two characters. The OP does not normalise any of them: it compares the two strings and stops. The one exception is the loopback carve-out below, where a native client may vary the port.

## What this library refuses

At registration time (DCR or `op.WithStaticClients`):

- **Empty values.** `redirect_uris` must contain at least one entry, and no entry may be empty.
- **Unparseable URLs.** A value that fails `url.Parse` is rejected.
- **Relative URLs.** Must be absolute (`scheme://host/...`).
- **Fragments.** A `#...` portion has no role in the redirect protocol; the spec forbids it.
- **Custom URI schemes for web clients.** Web clients (`application_type=web`, the default) must use `https`. The single carve-out is loopback `http`, gated by the rules below.
- **Schemes that collide with browser primitives** (`javascript:`, `data:`, `file:`, `ftp:`, `ws:`, `wss:`) — rejected outright for native clients.
- **Custom schemes without a dot** (e.g. `myapp:` instead of `com.example.myapp:`) — rejected for native clients per RFC 8252 §7.1, because non-reverse-DNS schemes have a high collision risk across applications.

At authorize time, the registered list is consulted with strict byte-for-byte comparison. Anything that does not match exactly returns an error response **before** the browser is redirected anywhere — the user sees a server-side error page rather than an attacker-controlled URL.

## Loopback (RFC 8252)

A native CLI tool cannot pre-register every ephemeral OS-assigned port — the registered redirect would have to be `http://127.0.0.1:54321/cb` today and `http://127.0.0.1:62114/cb` tomorrow. RFC 8252 §7.3 carves out an exception:

> **RFC 8252 §7.3 (paraphrase)** native applications using loopback redirect MUST be allowed to specify a port at request time even when the registered port differs.

The library honours the carve-out per client, with three rules tightening it against DNS rebinding (RFC 8252 §8.3):

| Condition | Behaviour |
|---|---|
| Scheme is `http` and registered host is `127.0.0.1` or `[::1]` | Authorize-time port may differ from the registered port; everything else (path, query, fragment) must match exactly. |
| Scheme is `http` and registered host is the textual `localhost` | **Refused for web clients by default.** The textual `localhost` resolves through DNS, which is hijackable. Web clients opt in via `op.WithAllowLocalhostLoopback()`; native clients (`application_type=native`) accept `localhost` unconditionally per OIDC Registration §2. |
| Scheme is `https` on a loopback host | No port relaxation. ACME does not issue certificates for `127.0.0.1`, so this combination is rare in practice. |

Outside the loopback carve-out, the strict exact-match policy still applies. A web client that registers `https://app.example.com/cb` cannot vary the port at request time.

::: warning DNS rebinding is the reason `localhost` is special
The textual `localhost` is a name the OS resolves through DNS. An attacker who can poison DNS for `localhost` (LAN-side DNS hijacks, malicious resolver, hostile WiFi) can cause the user's browser to land on an attacker-controlled host while the OP thinks it sent the user to loopback. The IP literals `127.0.0.1` and `[::1]` skip DNS entirely, which is why they are the strict-default loopback shape and `localhost` requires explicit opt-in. The default posture (literal IPs only) is the right one for DNS-rebinding-sensitive deployments. See [Design judgments — RFC 8252 loopback handling](/security/design-judgments#dj-4) for the explicit reasoning.
:::

## How clients are registered

You have two paths to put a redirect URI in front of the OP:

- **Static seeds.** Pass `op.WithStaticClients(seeds...)` at construction. Each seed lists its `RedirectURIs`; the OP validates them at boot and rejects malformed values before serving the first request. Best for a small, known fleet — internal tools, single-tenant SaaS, FAPI deployments where every client is vetted.
- **Dynamic Client Registration (RFC 7591).** The OP exposes `POST /register`; an RP creates itself at runtime by submitting metadata including `redirect_uris`. The same validation rules apply, surfaced as `400 invalid_redirect_uri` or `400 invalid_client_metadata` if any entry violates the policy. Best for multi-tenant SaaS, marketplaces, or any deployment where the OP operator does not pre-know the client population. See [Dynamic Client Registration](/use-cases/dynamic-registration) for the full walkthrough.

Both paths share the same validator, so the same rules apply whether a redirect was vetted at boot or self-registered ten seconds ago.

## Common mistakes

- **Hard-coding `localhost` in production seeds.** Works on your laptop, fails on every developer's laptop with a different DNS resolver. Use `127.0.0.1` if you really mean loopback; use the production hostname otherwise.
- **Trailing-slash drift.** `https://app.example.com/cb` and `https://app.example.com/cb/` are different URIs. Pick one shape, register it, and have the RP framework use it verbatim.
- **Mixed case in the host.** RP frameworks sometimes upper-case the host because someone pasted from a marketing email. The OP is case-sensitive byte-for-byte; case drift breaks the match.
- **Path-only registration.** A path without a scheme and host (`/cb`) is not a valid redirect URI. The OP rejects it at registration.
- **Wildcard expectations.** "Surely `*` works in the path?" It does not. Wildcards are forbidden by RFC 9700.

## Read next

- [Authorization Code + PKCE flow](/concepts/authorization-code-pkce) — where the redirect URI travels and what the OP checks at each step.
- [Client types](/concepts/client-types) — `application_type=native` is the switch that admits loopback `http` for CLIs.
- [Dynamic Client Registration](/use-cases/dynamic-registration) — runtime registration and how the same validation applies.
- [Design judgments — RFC 8252 loopback handling](/security/design-judgments#dj-4) — the explicit reasoning for the loopback rules.
