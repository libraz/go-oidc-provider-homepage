---
title: Client types
description: Public vs confidential vs FAPI-grade clients, the authentication methods this library implements, and how to register them.
pageClass: pg-concepts-client-types
---

# Client types

A **client** is the application that asks the OP for tokens. Clients fall into two structural buckets — **public** (cannot keep a secret) and **confidential** (can) — and FAPI 2.0 deployments raise the bar on top of confidential. The bucket the client lives in determines which authentication method it uses at the token endpoint, and that choice cascades into refresh-token policy, sender-constraint requirements, and what the consent prompt can short-circuit.

::: tip Mental model in 30 seconds
- **Public clients** — SPAs, native apps, mobile apps. Code shipped to users; secrets are not safe. Use `none` + PKCE.
- **Confidential clients** — backends, services, machine-to-machine callers. Can hold a secret or a private key. Use `client_secret_*` or `private_key_jwt`.
- **FAPI-grade clients** — confidential clients hardened with sender-constrained tokens (DPoP / mTLS), PAR, and asymmetric authentication.
:::

::: details Specs referenced on this page
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §2.1 (client types), §2.3 (client authentication)
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) / [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — Assertion-based client authentication
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §9 (client authentication)
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — §3.1.3 (preferred auth methods)
:::

## Public clients

Public clients are applications whose code runs on a device the user controls. Typical examples are single-page apps, mobile apps, native desktop apps, and CLIs. The defining property is that **anything shipped with the binary or page is in the attacker's hands too**. There is no place to hide a long-lived secret.

### When to use one

Use a public client for apps that log a human in on the user's device.

- A browser SPA redirects to `/authorize`, then exchanges code + PKCE at `/token` from JavaScript.
- A mobile or desktop app receives the authorization code through a custom URI scheme, claimed `https`, or loopback redirect.
- A CLI opens a local loopback listener, sends the user through browser login, and receives the authorization code locally.

Use a confidential client for server-side RPs and service-to-service callers where a backend can keep a shared secret, private key, or certificate out of user-reachable storage.

### Why the type exists

The category exists so clients are handled according to whether they can keep a credential secret. If an SPA or mobile app is required to use a `client_secret`, the developer has nowhere better to put it than a JavaScript bundle, app binary, or local config file. That value is delivered to every user, including attackers, so the protocol cannot treat it as a secret.

OAuth / OIDC therefore names public clients explicitly. Instead of pretending a long-lived shared secret is still authentication, the protocol protects them with a registered `client_id`, exact redirect-URI matching, per-request PKCE, refresh-token rotation, and DPoP where appropriate. A public client is not an "untrusted client"; it is a client protected by different mechanisms because it cannot keep a secret.

The library treats a client as public when its `TokenEndpointAuthMethod` is `"none"`. The structural protections that compensate for the missing secret are:

- **PKCE is required.** The OP accepts only `S256` PKCE (`plain` is refused regardless of profile; see [Design judgments #14](/security/design-judgments#dj-14)). The `code_verifier` is the per-request secret that proves "the same client that started the flow is the one finishing it"; without it, an authorization code intercepted on the redirect is enough to mint tokens.
- **Refresh tokens are rotated and DPoP-bound.** Every successful refresh exchange retires the previous refresh token and binds the next one to the DPoP key the client presented. A leaked refresh on a public client cannot be reused without the matching key, and a reuse of an already-rotated token revokes the entire chain. See [Design judgments #15](/security/design-judgments#dj-15).
- **Loopback redirects are admitted.** RFC 8252 §7.3 lets native clients vary the port on `127.0.0.1` / `[::1]` so a CLI can use an OS-assigned ephemeral port; see [Redirect URI](/concepts/redirect-uri).

Public clients can still receive ID Tokens, refresh tokens, and call `/userinfo` — they are full-featured RPs, just operating in a stricter environment.

## Confidential clients

Confidential clients are backend services that can keep a secret or a private key out of user-reachable storage. The defining property is that **the credential lives somewhere the attacker cannot trivially read** — a server-side environment variable, a secrets manager, an HSM. They register a `TokenEndpointAuthMethod` other than `"none"`.

A confidential client gets:

- **Authentication at the token endpoint.** Every `POST /token` carries credentials; the OP verifies them before issuing anything. The verifier is one of the methods listed below.
- **Looser refresh-token policy.** Refresh tokens are rotated like every other client, but the chain is **not** DPoP-bound by default — the access tokens minted on each refresh are still bound to whatever key was presented, but the refresh chain itself can rotate keys. See [Design judgments #15](/security/design-judgments#dj-15).
- **Eligibility for first-party auto-consent.** `op.WithFirstPartyClients(...)` lets the consent prompt be skipped for vetted internal clients; only static and admin-provisioned clients are eligible (DCR-registered clients are excluded by design).

## FAPI-grade clients

FAPI 2.0 Baseline raises the bar on a confidential client: PAR is required, the request object is signed (JAR / Message Signing), the access token is sender-constrained (DPoP or mTLS), and the token-endpoint auth method is asymmetric. This library uses `private_key_jwt` for token-endpoint client authentication; mTLS is available as the sender-constraint layer, while `tls_client_auth` / `self_signed_tls_client_auth` are not dispatched at `/token` — see [FAPI 2.0 primer](/concepts/fapi).

There is no separate "FAPI client type" in the protocol; a FAPI-grade client is a confidential client that has met the additional requirements. The library enforces that match at construction and at request time.

## Authentication methods

The library implements six methods, all from the IANA "OAuth Token Endpoint Authentication Methods" registry. The closed set is exposed as `op.AuthMethod` constants.

The decision tree traces each client shape down to the `token_endpoint_auth_method` value it registers — a public client lands on `none`, a confidential client on a `client_secret_*` method, and a FAPI-grade client on an asymmetric method.

<figure class="fig">
  <div class="fig-head">Client shape decides the authentication method</div>
  <svg class="fig-svg" role="img" aria-labelledby="authmethod-decision-title" viewBox="0 0 960 322" xmlns="http://www.w3.org/2000/svg">
    <title id="authmethod-decision-title">Three client shapes and the token endpoint authentication method each one ends up with: a public client authenticates with none plus PKCE, a confidential client with a client secret, and a FAPI-grade client with private_key_jwt plus a sender constraint.</title>
    <text class="fg-lbl" x="40" y="28">client shape</text>
    <text class="fg-lbl" x="564" y="28">token_endpoint_auth_method</text>
    <!-- public -->
    <rect class="fg-box" x="36" y="40" width="344" height="72" rx="8"/>
    <text class="fg-t" x="56" y="70">Public client</text>
    <text class="fg-xs" x="56" y="90">SPA · native app · CLI</text>
    <path class="fg-edge" d="M384,76 H556" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="470" y="69" text-anchor="middle">no secret it can keep</text>
    <rect class="fg-box" x="560" y="40" width="364" height="72" rx="8"/>
    <text class="fg-m" x="580" y="70">none</text>
    <text class="fg-xs" x="580" y="90">with PKCE (S256) — never optional</text>
    <!-- confidential -->
    <rect class="fg-box" x="36" y="128" width="344" height="72" rx="8"/>
    <text class="fg-t" x="56" y="158">Confidential client</text>
    <text class="fg-xs" x="56" y="178">backend web app · service</text>
    <path class="fg-edge" d="M384,164 H556" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="470" y="157" text-anchor="middle">holds a client secret</text>
    <rect class="fg-box" x="560" y="128" width="364" height="72" rx="8"/>
    <text class="fg-m" x="580" y="155">client_secret_basic</text>
    <text class="fg-m" x="580" y="173">client_secret_post</text>
    <text class="fg-xs" x="580" y="191">pick one and register it</text>
    <!-- FAPI -->
    <rect class="fg-box fg-box--accent" x="36" y="216" width="344" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="56" y="246">FAPI-grade client</text>
    <text class="fg-xs" x="56" y="266">sender-constrained · high assurance</text>
    <path class="fg-edge fg-edge--accent" d="M384,252 H556" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="470" y="245" text-anchor="middle">FAPI 2.0 profile</text>
    <rect class="fg-box fg-box--accent" x="560" y="216" width="364" height="72" rx="8"/>
    <text class="fg-m" x="580" y="246">private_key_jwt</text>
    <text class="fg-xs" x="580" y="266">plus a DPoP or mTLS sender constraint</text>
  </svg>
  <figcaption class="fig-note">The shape is not a label you choose — it follows from where the code runs. Anything that ships to a browser or a device cannot keep a secret, so it is a public client whatever the registration says.</figcaption>
</figure>

| Method | Pre-shared secret? | Asymmetric? | FAPI 2.0? | Typical use |
|---|---|---|---|---|
| `none` | — | — | No | Public clients (SPA, native, CLI) with PKCE. |
| `client_secret_basic` | yes | — | No | Backend services with a shared secret, sent as HTTP Basic. The default for confidential clients. |
| `client_secret_post` | yes | — | No | Same secret in the form body. Discouraged for new deployments — Basic is the canonical wire format. |
| `private_key_jwt` | — | yes | Yes | Backend signs a short-lived JWT assertion with its own private key; OP verifies against the registered JWKS. The FAPI-preferred method. |
| `tls_client_auth` | — | yes (PKI) | RFC verifier only | RFC 8705 verifier exists internally, but this is not dispatched as a `/token` client-auth method. |
| `self_signed_tls_client_auth` | — | yes (pinned) | RFC verifier only | RFC 8705 verifier exists internally, but this is not dispatched as a `/token` client-auth method. |

`client_secret_jwt` (HS256-shared-secret JWT) is **not** implemented. A shared-secret JWT broadens the blast radius of a leaked secret without offering anything `private_key_jwt` does not, so the library refuses to grow the surface.

For `private_key_jwt` clients registered with `jwks_uri`, an assertion signed with an unknown `kid` triggers one throttled, cache-bypassing JWKS refetch before verification fails. Legitimate RP key rotation recovers immediately; random unknown `kid` values cannot amplify outbound fetches.

::: tip Pick one method per client and stick to it
The discovery document lists every method the OP is configured to accept, but each client registers exactly one. Mixing methods on a single client is not standardised and has been the source of downgrade-attack research papers — the library matches the registered method exactly and refuses fallbacks.
:::

## Provisioning options

There are two ways for a client (and its `TokenEndpointAuthMethod`) to reach the OP:

- **Static seeds** via `op.WithStaticClients(seeds ...ClientSeed)`. Each `ClientSeed` lists `client_id`, `redirect_uris`, `grant_types`, `response_types`, `token_endpoint_auth_method`, and the credential material (`Secret` for symmetric methods, JWKS for asymmetric, `Resources` for RFC 8707 audience separation). The library validates everything at boot and refuses to start on malformed seeds. Best for known fleets — internal tools, FAPI deployments, single-tenant SaaS.
- **Dynamic Client Registration (RFC 7591)** via `op.WithDynamicRegistration(...)`. RPs self-register at runtime by `POST /register` with their metadata; the OP applies the same validation, hashes any returned `client_secret` at rest (the plaintext is returned exactly once on `POST /register`, see [Design judgments #20](/security/design-judgments#dj-20)), and exposes RFC 7592 management endpoints. Best for marketplaces, multi-tenant SaaS, or anywhere the OP operator does not pre-know the client population.

The two paths can coexist on the same OP — a fleet of static FAPI clients alongside dynamic clients for partner integrations is a common shape.

::: warning Public clients are still registered
"Public client" does not mean "anyone can show up". The client_id was issued by some path — static seed or DCR — and the OP refuses requests that name an unknown client_id. The PKCE-only authentication is for the **same** client_id the OP already knows about; it is not a "no registration" mode.
:::

## Read next

- [Scopes and claims](/concepts/scopes-and-claims) — what a client can ask for once it has authenticated.
- [Sender constraint](/concepts/sender-constraint) — DPoP and mTLS bind the access token to a key the client holds; the FAPI-grade requirement.
- [Dynamic Client Registration](/use-cases/dynamic-registration) — the runtime self-registration path and its full lifecycle.
- [FAPI 2.0 primer](/concepts/fapi) — the profile that pins everything together for high-assurance deployments.
