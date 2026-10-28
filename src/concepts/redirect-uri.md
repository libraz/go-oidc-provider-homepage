---
title: Redirect URI
description: How the /auth redirect_uri check uses exact matching, what the RFC 8252 loopback relaxation permits, and which registrations the library refuses.
pageClass: pg-concepts-redirect-uri
---

# Redirect URI

A **redirect URI** is the URL the OP sends the user back to after the authorization endpoint (`/auth`, or `/oidc/auth` when the provider is mounted at `/oidc`) finishes, with `?code=...&state=...` on success or `?error=...&state=...` on failure. The RP registers one or more when the client is created, and the OP compares the `redirect_uri` query parameter of every authorize request against them. A mismatch rejects the request before the user is sent anywhere.

::: tip Mental model in 30 seconds
- The `redirect_uri` must match a registered value **byte for byte**. `/cb` and `/cb/` are different URIs.
- The one relaxation is the RFC 8252 loopback port, which applies only to public and native clients.
- The OP rejects a bad request **before** redirecting anywhere, because the redirect itself is the attack vector.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §3.1.2.3 (redirect URI registration and matching)
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps (§7.3 loopback, §7.1 custom URI schemes, §8.3 DNS rebinding)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice (§4.1 redirect URI handling)
- [OpenID Connect Registration 1.0](https://openid.net/specs/openid-connect-registration-1_0.html) — §2 (`redirect_uris`, `application_type`)
:::

## Why exact-match

Wildcard and prefix matching on `redirect_uri` caused a whole class of vulnerabilities in OAuth's early years. If the OP redirects to any URL under a registered prefix, an attacker can:

1. Control one URL under that prefix, by registering their own subdomain or path or by compromising one downstream resource the prefix admits.
2. Start an authorize request with that URL as the `redirect_uri`.
3. Receive the authorization code in the redirect.
4. Exchange the code for tokens.

RFC 9700 §4.1 closes this off:

> **RFC 9700 §4.1 (paraphrase)** authorization servers MUST compare the `redirect_uri` parameter against the registered URIs using simple string comparison; pattern matching, wildcards, and substring matching MUST NOT be used.

The library implements this literally. If you registered `https://app.example.com/cb`, the request must use exactly that string.

<figure class="fig">
  <div class="fig-head">What "exact match" rejects</div>
  <svg class="fig-svg" role="img" aria-labelledby="redirect-exact-title" viewBox="0 0 960 432" xmlns="http://www.w3.org/2000/svg">
    <title id="redirect-exact-title">Only a byte-for-byte identical redirect_uri matches the registered value. A trailing slash, an added query parameter, a differently cased host, and a different port are each rejected.</title>
    <text class="fg-lbl" x="32" y="40">registered on the client</text>
    <rect class="fg-box fg-box--accent" x="32" y="56" width="448" height="48" rx="8"/>
    <text class="fg-m" x="48" y="84">https://app.example.com/cb</text>
    <text class="fg-lbl" x="72" y="152">value sent on the authorize request</text>
    <text class="fg-lbl" x="504" y="152">result</text>
    <line class="fg-rule fg-rule--strong" x1="32" y1="168" x2="928" y2="168"/>
    <!-- row 1 -->
    <path class="fg-edge fg-edge--ok fg-edge--thin" d="M42,193 l5,6 l9,-12"/>
    <text class="fg-s fg-ok" x="504" y="198">accepted — every byte identical</text>
    <text class="fg-m" x="72" y="198">https://app.example.com/cb</text>
    <line class="fg-rule" x1="32" y1="216" x2="928" y2="216"/>
    <!-- row 2 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,234 l12,12 M54,234 l-12,12"/>
    <text class="fg-s" x="504" y="246">a trailing slash is a different path</text>
    <text class="fg-m" x="72" y="246">https://app.example.com/cb<tspan class="fg-danger">/</tspan></text>
    <line class="fg-rule" x1="32" y1="264" x2="928" y2="264"/>
    <!-- row 3 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,282 l12,12 M54,282 l-12,12"/>
    <text class="fg-s" x="504" y="294">extra query parameters are not merged in</text>
    <text class="fg-m" x="72" y="294">https://app.example.com/cb<tspan class="fg-danger">?env=prod</tspan></text>
    <line class="fg-rule" x1="32" y1="312" x2="928" y2="312"/>
    <!-- row 4 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,330 l12,12 M54,330 l-12,12"/>
    <text class="fg-s" x="504" y="342">the comparison never case-folds the host</text>
    <text class="fg-m" x="72" y="342">https://<tspan class="fg-danger">APP</tspan>.example.com/cb</text>
    <line class="fg-rule" x1="32" y1="360" x2="928" y2="360"/>
    <!-- row 5 -->
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M42,378 l12,12 M54,378 l-12,12"/>
    <text class="fg-s" x="504" y="390">a different port is a different origin</text>
    <text class="fg-m" x="72" y="390">https://app.example.com<tspan class="fg-danger">:8443</tspan>/cb</text>
    <line class="fg-rule" x1="32" y1="408" x2="928" y2="408"/>
  </svg>
  <figcaption class="fig-note">None of these are normalised before the comparison, and that is deliberate: every normalisation rule is a rule an attacker can aim a lookalike URI at. A string comparison has no such surface.</figcaption>
</figure>

Every rejected row above differs from the registered string by a character or two, and the OP normalises none of them. It compares the two strings and stops. The one exception is the loopback carve-out below, where the port may vary.

## What this library refuses

Registration (DCR or `op.WithStaticClients`) applies the same validator. `redirect_uris` must be non-empty, every entry must be a non-empty absolute URL that `url.Parse` accepts, and no entry may contain a fragment, which has no role in the redirect and which the spec forbids. The scheme rules depend on `application_type`:

| `application_type` | Accepted schemes |
|---|---|
| `web` (default) | `https` with a host and no userinfo. Also `http` on the loopback IP literals `127.0.0.1` and `[::1]`; `http://localhost` only with `op.WithAllowLocalhostLoopback()`. Custom schemes are refused. |
| `native` | `https` (claimed links), loopback `http` as above, and private-use schemes such as `com.example.app:/cb`. |

Private-use schemes must contain a dot (reverse-DNS form), because RFC 8252 §7.1 warns that short names like `myapp:` collide across applications. `javascript:`, `data:`, `file:`, `ftp:`, `ws:` and `wss:` are refused outright.

At authorize time the registered list is checked by string comparison (plus the loopback rule below). A request that matches nothing gets an error response from the OP itself **before** the browser is redirected anywhere, so the user sees a server-side error page and never an attacker-controlled URL.

## Loopback (RFC 8252)

A CLI tool listens on a port the OS assigns at run time, so it cannot register a fixed redirect: `http://127.0.0.1:54321/cb` today would be `http://127.0.0.1:62114/cb` tomorrow. RFC 8252 §7.3 carves out an exception:

> **RFC 8252 §7.3 (paraphrase)** native applications using loopback redirect MUST be allowed to specify a port at request time even when the registered port differs.

The library honours the carve-out for **public clients and `application_type=native` clients** only, and tightens it against DNS rebinding (RFC 8252 §8.3):

| Registered redirect URI | Behaviour |
|---|---|
| `http` on `127.0.0.1` or `[::1]` | A public or native client may use any port at authorize time. Scheme, host, path and query must still match exactly. A confidential web client gets exact matching, port included. |
| `http` on the textual `localhost` | **Refused at registration unless `op.WithAllowLocalhostLoopback()` is set**, for web and native clients alike. `localhost` resolves through DNS, which can be hijacked. Once admitted, it follows the same any-port rule as the IP literals. |
| `https` on a loopback host | No port relaxation. Certificate authorities do not issue certificates for `127.0.0.1`, so this combination is rare. |

<figure class="fig">
  <div class="fig-head">The loopback exception relaxes only the port</div>
  <svg class="fig-svg" role="img" aria-labelledby="redirect-match-title" viewBox="0 0 960 384" xmlns="http://www.w3.org/2000/svg">
    <title id="redirect-match-title">Decision flow for the redirect_uri on an authorize request. A value identical to a registered entry is accepted. Otherwise the loopback exception applies only to a public or native client whose registered URI is http on a loopback host and whose request differs only in the port. Anything else is rejected with an error page and no redirect.</title>
    <!-- test 1 -->
    <rect class="fg-box" x="32" y="24" width="448" height="72" rx="8"/>
    <text class="fg-t" x="48" y="52">Identical to a registered entry?</text>
    <text class="fg-s" x="48" y="76">compared as a plain string, byte for byte</text>
    <path class="fg-edge fg-edge--ok" d="M480,60 H568" marker-end="url(#fg-ao)"/>
    <text class="fg-edge-lbl" x="524" y="50" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--ok" x="568" y="24" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="52">Accepted</text>
    <text class="fg-s" x="584" y="76">redirect to the registered URI</text>
    <!-- test 2 -->
    <path class="fg-edge" d="M256,96 V144" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="268" y="124">no</text>
    <rect class="fg-box" x="32" y="144" width="448" height="96" rx="8"/>
    <text class="fg-t" x="48" y="172">Does the loopback exception apply?</text>
    <text class="fg-s" x="48" y="196">public or native client, http loopback URI</text>
    <text class="fg-s" x="48" y="220">same scheme, host, path, query; port differs</text>
    <path class="fg-edge fg-edge--ok" d="M480,192 H568" marker-end="url(#fg-ao)"/>
    <text class="fg-edge-lbl" x="524" y="182" text-anchor="middle">yes</text>
    <rect class="fg-box fg-box--ok" x="568" y="144" width="360" height="96" rx="8"/>
    <text class="fg-t" x="584" y="172">Accepted</text>
    <text class="fg-s" x="584" y="196">redirect to the requested URI</text>
    <text class="fg-s" x="584" y="220">with the port it sent</text>
    <!-- rejected -->
    <path class="fg-edge fg-edge--danger" d="M256,240 V288" marker-end="url(#fg-ad)"/>
    <text class="fg-edge-lbl" x="268" y="268">no</text>
    <rect class="fg-box fg-box--danger" x="32" y="288" width="448" height="72" rx="8"/>
    <text class="fg-t" x="48" y="316">Rejected</text>
    <text class="fg-s" x="48" y="340">OP shows an error page; no redirect happens</text>
  </svg>
  <figcaption class="fig-note">The only loopback exception is the port. A <code>localhost</code> registration reaches the second test only if <code>op.WithAllowLocalhostLoopback()</code> let it through at registration.</figcaption>
</figure>

::: warning DNS rebinding is the reason `localhost` is special
The textual `localhost` is a name the OS resolves through DNS. An attacker who can poison DNS for `localhost` (a hijacked LAN resolver, a malicious resolver, hostile WiFi) can make the user's browser land on a host the attacker controls while the OP believes it sent the user to loopback. The IP literals `127.0.0.1` and `[::1]` skip DNS entirely, so they are the default loopback form and `localhost` needs an explicit opt-in. See [Design judgments — RFC 8252 loopback handling](/security/design-judgments#dj-4).
:::

## How clients are registered

A redirect URI reaches the OP by one of two paths, and both use the same validator:

- **Static seeds.** Pass `op.WithStaticClients(seeds...)` at construction, with `RedirectURIs` on each seed (see [Client types](/concepts/client-types#provisioning-options)). The OP validates them in `op.New` and refuses to start on a malformed value. This suits a small, known fleet: internal tools, single-tenant SaaS, vetted FAPI clients.
- **Dynamic Client Registration (RFC 7591).** An RP registers itself at runtime with `POST /register` and its `redirect_uris`. A violating entry is answered with `400 invalid_redirect_uri` or `400 invalid_client_metadata`. This suits multi-tenant SaaS, marketplaces, and any OP whose operator does not know the clients in advance. See [Dynamic Client Registration](/use-cases/dynamic-registration).

## Common mistakes

- **Registering `http://localhost/...` for development.** Registration fails unless `op.WithAllowLocalhostLoopback()` is set, and that option belongs on a developer machine only. Prefer `http://127.0.0.1:<port>/...`, which needs no option.
- **Trailing-slash drift.** `https://app.example.com/cb` and `https://app.example.com/cb/` are different URIs. Register one form and have the RP framework send it verbatim.
- **Mixed case in the host.** An RP framework fed a pasted URL may upper-case the host. The comparison is case-sensitive, so the request no longer matches.
- **Path-only registration.** `/cb` has no scheme or host, so it is not a valid redirect URI, and registration rejects it.
- **Expecting wildcards.** `*` in a path does not work; RFC 9700 forbids wildcards.

## Read next

- [Authorization Code + PKCE flow](/concepts/authorization-code-pkce) — where the redirect URI travels and what the OP checks at each step.
- [Client types](/concepts/client-types) — public and native clients are the ones the loopback port exception applies to.
- [Dynamic Client Registration](/use-cases/dynamic-registration) — runtime registration and how the same validation applies.
- [Design judgments — RFC 8252 loopback handling](/security/design-judgments#dj-4) — the explicit reasoning for the loopback rules.
