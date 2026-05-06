---
title: Learn the concepts
description: A recommended reading order for the concept pages. Each step builds on what came before, so you can read top-to-bottom without backtracking.
---

# Learn the concepts

This page is the **recommended reading order** for everything under `/concepts/`. The pages are arranged so each one only assumes what the earlier steps have already covered. If you read top-to-bottom you should not need to backtrack.

::: tip Read in order
If you are new to OAuth and OIDC, start at Step 1 and walk down. It is easy to get lost not because the standards are hard, but because docs jump straight into refresh tokens or DPoP without first nailing down what an "issuer" or a "redirect URI" actually is. We try to fix that here.
:::

::: details Skip ahead if you already know X
- Already comfortable with OAuth roles, scopes, and `code` + PKCE? Jump to **Step 4 (Tokens)** or **Step 6 (Sender-constrained tokens)**.
- Already running an OP elsewhere and just want to understand the operational surface this library exposes? Skim **Step 2 (Setup primitives)** for vocabulary, then go to [Operations](/operations/).
- Specifically here for FAPI 2.0? You can read **Step 6** (DPoP / mTLS) and then **Step 7 → FAPI 2.0 primer** without the rest, but the primer assumes you already understand sender constraint.
:::

## Step 1 — What is OAuth / OIDC?

Start here if any of "OP", "RP", "RS", "JWT", "PKCE" feel unclear.

- [OAuth 2.0 / OIDC primer](/concepts/oauth2-oidc-primer) — the three roles, the one flow they always share, and an acronym cheat sheet for the rest of the docs.

## Step 2 — Setup primitives

The vocabulary every later page assumes. None of these are about flows or tokens yet — they are about the strings, URLs, and key material that identify an OP and its clients.

- [issuer](/concepts/issuer) — the OP's identity URL, the `iss` claim, and why exactly one canonical form matters.
- [Redirect URI](/concepts/redirect-uri) — what an RP registers, why exact-match is the modern rule, and how this library validates it.
- [Client types](/concepts/client-types) — `confidential` vs `public`, and which client authentication methods each supports.
- [Scopes and claims](/concepts/scopes-and-claims) — what a scope grants, what a claim carries, and how `openid` / `profile` / `email` map to the user-info response.
- [Discovery](/concepts/discovery) — `/.well-known/openid-configuration`, what RPs read from it, and what the OP must keep stable.
- [JOSE basics](/concepts/jose-basics) — JWS, JWE, JWK, JWKS, `kid`, and the algorithm names you will see repeated everywhere.

## Step 3 — Common flows

The three grants you will use 90 % of the time. Read in the listed order; refresh tokens reference authorization code, and client credentials is easiest to compare against authorization code.

- [Authorization Code + PKCE](/concepts/authorization-code-pkce) — the default user-facing flow. PKCE is mandatory for public clients and recommended for everyone.
- [Refresh tokens](/concepts/refresh-tokens) — how long-lived sessions work, rotation, and the reuse-detection rule from RFC 9700.
- [Client Credentials](/concepts/client-credentials) — service-to-service. No user, no refresh token, just a client authenticating to itself.

## Step 4 — Tokens

What the OP actually emits, and why "JWT vs opaque" is a deployment choice rather than a spec choice.

- [ID Token vs access token](/concepts/tokens) — two tokens, two audiences, two purposes. A common source of bugs.
- [Access token format (JWT vs opaque)](/concepts/access-token-format) — when to ship JWT access tokens (RFC 9068), when to keep them opaque, and what introspection costs.

## Step 5 — Sessions and consent

Once tokens are issued, the user has a session at the OP and a record of what they consented to. These two pages cover the OP-side state most flows leave behind.

- [Sessions and logout](/concepts/sessions-and-logout) — the OP session vs the RP session, RP-Initiated Logout, and Back-Channel Logout.
- [Consent](/concepts/consent) — what the consent screen records, when it can be skipped, and how this library models first-party clients.

## Step 6 — Sender-constrained tokens

Bearer tokens by default mean "whoever holds it can use it". Sender-constrained tokens fix that. Read the selection guide first; it tells you whether you actually need DPoP or mTLS for your deployment.

- [Sender constraint (DPoP / mTLS) — selection guide](/concepts/sender-constraint) — when you need it, and how to choose between the two.
- [DPoP](/concepts/dpop) — proof-of-possession via a per-request signed JWT. The web-friendly choice.
- [mTLS](/concepts/mtls) — proof-of-possession via the client's TLS certificate. The infrastructure-heavy choice; mandatory in some FAPI deployments.

## Step 7 — Advanced topics

Less common flows and profiles. Read these only when you have a concrete reason — for example a TV-style device, a phone-as-authenticator pattern, an inter-service token swap, or a regulator that names FAPI.

- [Device Code (RFC 8628)](/concepts/device-code) — input-constrained devices: TVs, CLIs, IoT.
- [CIBA](/concepts/ciba) — push-to-phone authentication where the user has no browser on the device making the request.
- [Token Exchange (RFC 8693)](/concepts/token-exchange) — swapping one token for another with different audience or actor.
- [FAPI 2.0 primer](/concepts/fapi) — the profile that pins PAR + sender constraint + strict client auth into one set, used by open banking and equivalent regulated APIs.

## Step 8 — Help

When the reading order is not the answer to your question.

- [FAQ](/faq) — short answers to recurring questions, organized roughly the same way as this index.
