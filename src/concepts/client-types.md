---
title: Client types
description: Public vs confidential vs FAPI-grade clients, the authentication methods this library implements, and how to register them.
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

Public clients are applications whose code runs on a device the user controls — a single-page app, a mobile app, a native desktop app, a CLI. The defining property is that **anything shipped with the binary or page is in the attacker's hands too**. There is no place to hide a long-lived secret.

The library treats a client as public when its `TokenEndpointAuthMethod` is `"none"`. The structural protections that compensate for the missing secret are:

- **PKCE is required.** The OP rejects `S256` PKCE only (`plain` is refused regardless of profile, see [Design judgments #14](/security/design-judgments#dj-14)). The `code_verifier` is the per-request secret that proves "the same client that started the flow is the one finishing it"; without it, an authorization code intercepted on the redirect is enough to mint tokens.
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

FAPI 2.0 Baseline raises the bar on a confidential client: PAR is required, the request object is signed (JAR / Message Signing), the access token is sender-constrained (DPoP or mTLS), and the auth method is asymmetric (`private_key_jwt`, `tls_client_auth`, or `self_signed_tls_client_auth`). The library narrows the discovery document's `token_endpoint_auth_methods_supported` accordingly when `op.WithProfile(profile.FAPI2Baseline)` is active — see [FAPI 2.0 primer](/concepts/fapi).

There is no separate "FAPI client type" in the protocol; a FAPI-grade client is a confidential client that has met the additional requirements. The library enforces that match at construction and at request time.

## Authentication methods

The library implements six methods, all from the IANA "OAuth Token Endpoint Authentication Methods" registry. The closed set is exposed as `op.AuthMethod` constants.

| Method | Pre-shared secret? | Asymmetric? | FAPI 2.0? | Typical use |
|---|---|---|---|---|
| `none` | — | — | No | Public clients (SPA, native, CLI) with PKCE. |
| `client_secret_basic` | yes | — | No | Backend services with a shared secret, sent as HTTP Basic. The default for confidential clients. |
| `client_secret_post` | yes | — | No | Same secret in the form body. Discouraged for new deployments — Basic is the canonical wire format. |
| `private_key_jwt` | — | yes | Yes | Backend signs a short-lived JWT assertion with its own private key; OP verifies against the registered JWKS. The FAPI-preferred method. |
| `tls_client_auth` | — | yes (PKI) | Yes | mTLS handshake; the OP matches the client's X.509 certificate against a registered subject DN or SAN. |
| `self_signed_tls_client_auth` | — | yes (pinned) | Yes | mTLS handshake; the OP pins the certificate by JWK thumbprint registered in the client's JWKS. No CA involvement. |

`client_secret_jwt` (HS256-shared-secret JWT) is **not** implemented. A shared-secret JWT broadens the blast radius of a leaked secret without offering anything `private_key_jwt` does not, so the library refuses to grow the surface.

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
