---
title: Token Exchange (RFC 8693)
description: How a service swaps one token for another — delegation, impersonation, and the act chain in plain English.
pageClass: pg-concepts-token-exchange
---

# Token Exchange (RFC 8693)

A modern microservice graph almost always needs to **call other services on behalf of the user**. The frontend gets a token. Service A receives that token, then needs to call Service B. Should Service A reuse the user's token? Mint a new one? Combine the two? RFC 8693 defines the wire shape for that exchange.

The design fundamentally distinguishes two intents:

- **Impersonation** — Service A presents the user's token to Service B, **as if it were the user**. Service B sees `sub=alice`. Audit trails downstream see Alice acting alone.
- **Delegation** — Service A asks the OP for a new token whose `sub` is still Alice but whose **`act` claim** carries `{sub: service-a}`, recording that Alice's authority is being exercised through Service A. Service B sees `sub=alice, act={sub: service-a}` and can apply policy that depends on the chain ("Service A may withdraw Alice's funds, but only if the request originated from Alice").

Modern threat models prefer delegation — the audit chain is intact, revocation can target the intermediary, and least-privilege tightens around the actor rather than spreading from the subject.

::: details Specs referenced on this page
- [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693) — OAuth 2.0 Token Exchange
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators (used for `audience` / `resource`)
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim — re-binds the issued token to the calling actor's DPoP / mTLS key
:::

::: details Vocabulary refresher
- **subject_token** — the token whose holder's identity should populate `sub` on the new token. Usually the user's access token forwarded from upstream.
- **actor_token** — the token identifying the caller (the service performing the exchange). When present, the new token gains an `act` claim wrapping the actor's `sub` / `client_id`.
- **`act` claim** (RFC 8693 §4.1) — a nested object recording who is acting on behalf of `sub`. It can chain (`act.act.act…`) so a four-hop call records all four intermediaries.
- **`cnf` rebinding** — the issued token's `cnf` (RFC 7800 confirmation) is set to the *calling* actor's verified DPoP / mTLS proof, **not** the subject's. The token is sender-bound to the service performing the exchange.
:::

## Impersonation vs Delegation, side by side

<figure class="fig">
  <div class="fig-head">Forwarding, impersonation, delegation</div>
  <svg class="fig-svg" role="img" aria-labelledby="tx-modes-title" viewBox="0 0 960 606" xmlns="http://www.w3.org/2000/svg">
    <title id="tx-modes-title">Three ways an intermediary service can call a downstream service on the user's behalf. Forwarding the original token fails because the audience is wrong. An impersonation exchange produces a token that names only the user. A delegation exchange produces a token that names the user and records the intermediary in an act claim.</title>
    <!-- bands -->
    <rect class="fg-group" x="30" y="70" width="916" height="126" rx="8"/>
    <rect class="fg-group" x="30" y="206" width="916" height="180" rx="8"/>
    <rect class="fg-group" x="30" y="396" width="916" height="196" rx="8"/>
    <text class="fg-lbl fg-danger" x="42" y="88">plain forwarding — no exchange</text>
    <text class="fg-lbl" x="42" y="224">impersonation exchange</text>
    <text class="fg-lbl fg-accent" x="42" y="414">delegation exchange</text>
    <!-- lifelines -->
    <line class="fg-life" x1="110" y1="62" x2="110" y2="592"/>
    <line class="fg-life" x1="370" y1="62" x2="370" y2="592"/>
    <line class="fg-life fg-life--accent" x1="620" y1="62" x2="620" y2="592"/>
    <line class="fg-life" x1="860" y1="62" x2="860" y2="592"/>
    <!-- actors -->
    <rect class="fg-box" x="35" y="16" width="150" height="42" rx="6"/>
    <text class="fg-t" x="110" y="35" text-anchor="middle">Frontend</text>
    <text class="fg-xs" x="110" y="49" text-anchor="middle">browser</text>
    <rect class="fg-box" x="295" y="16" width="150" height="42" rx="6"/>
    <text class="fg-t" x="370" y="35" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="370" y="49" text-anchor="middle">intermediary</text>
    <rect class="fg-box fg-box--accent" x="540" y="16" width="160" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="620" y="35" text-anchor="middle">OP</text>
    <text class="fg-xs" x="620" y="49" text-anchor="middle">authorization server</text>
    <rect class="fg-box" x="785" y="16" width="150" height="42" rx="6"/>
    <text class="fg-t" x="860" y="35" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="860" y="49" text-anchor="middle">the resource</text>
    <!-- forwarding -->
    <path class="fg-edge" d="M110,112 H370" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="240" y="106" text-anchor="middle">Bearer sub=alice · aud=service-a</text>
    <path class="fg-edge fg-edge--danger" d="M370,152 H860" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs fg-halo" x="615" y="146" text-anchor="middle">the same token, forwarded unchanged</text>
    <path class="fg-edge fg-edge--danger" d="M860,172 h-28 v16 h28" marker-end="url(#fg-ad)"/>
    <text class="fg-xs fg-danger" x="820" y="184" text-anchor="end">aud is service-a, not me → 401</text>
    <!-- impersonation -->
    <path class="fg-edge" d="M110,250 H370" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="240" y="244" text-anchor="middle">Bearer sub=alice</text>
    <path class="fg-edge" d="M370,290 H620" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="495" y="270" text-anchor="middle">grant_type=…:token-exchange</text>
    <text class="fg-mxs" x="495" y="283" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M620,320 H370" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="495" y="314" text-anchor="middle">sub=alice · aud=service-b</text>
    <path class="fg-edge" d="M370,356 H860" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="615" y="350" text-anchor="middle">Bearer sub=alice</text>
    <text class="fg-xs fg-warn" x="860" y="378" text-anchor="end">as far as B can tell, alice acted alone</text>
    <!-- delegation -->
    <path class="fg-edge" d="M110,440 H370" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="240" y="434" text-anchor="middle">Bearer sub=alice</text>
    <path class="fg-edge" d="M370,482 H620" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="495" y="462" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <text class="fg-mxs" x="495" y="475" text-anchor="middle">actor_token=&lt;service-a&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M620,514 H370" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="495" y="508" text-anchor="middle">sub=alice · act={ sub: service-a }</text>
    <path class="fg-edge" d="M370,552 H860" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="615" y="546" text-anchor="middle">Bearer sub=alice · act={ sub: service-a }</text>
    <text class="fg-xs fg-ok" x="860" y="576" text-anchor="end">B sees alice via service-a — its policy decides</text>
  </svg>
  <figcaption class="fig-note">The only structural difference between the second and third case is <code>actor_token</code>. It costs one parameter and it is the difference between an audit log that says "alice did this" and one that says "alice did this, through service A".</figcaption>
</figure>

The difference shows up in audit trails (Service B knows who actually originated the call) and in policy (Service B can require an actor when the operation is sensitive).

## What the OP enforces

The library's RFC 8693 handler is opinionated about a few things the spec leaves to deployment policy:

- **`act` chain is built on the OP side**, not handed in by the caller. Whenever `actor_token` differs from `subject_token`, the OP populates `act` from the actor's verified credentials. A caller cannot fabricate an `act` claim.
- **Audience is normalised and allow-listed.** RFC 8707 `audience` / `resource` parameters are normalised before policy evaluation; when both are omitted, the subject token's audience supplies the default. The client must be authorised for every resulting audience.
- **Scope is intersected**, not unioned. The issued token's scope is the intersection of (requested scope, `subject_token`'s scope, calling client's allow-list). RFC 8693 §3.1 permits scope reduction; the OP forbids inflation.
- **TTL is capped** by the minimum of (handler request, `subject_token` remaining lifetime, OP global ceiling). A long-lived token cannot be laundered into a longer one.
- **`cnf` is rebound to the calling actor.** If Service A presents a DPoP proof on the exchange request, the issued token's `cnf.jkt` matches Service A's DPoP key — not the user's, not the subject_token's. Service B verifies the DPoP proof against the new token's `cnf`.

These rules are enforced **before** the embedder-supplied [`TokenExchangePolicy`](https://github.com/libraz/go-oidc-provider/blob/main/op/tokenexchange.go) is consulted. The policy can narrow further (deny audiences, deny actor combos) but cannot widen — the OP-computed defaults are a floor.

### Resource and audience normalisation

The OP applies one comparison form to URI-shaped `resource` and `audience` values across token exchange and the other resource-indicator surfaces. A URI value must be absolute and include both a scheme and a host. The OP lowercases the scheme and host, removes the default port (`80` for `http` and `443` for `https`), and removes trailing slashes from the path; path case is preserved. Query text and non-default ports are preserved verbatim. Fragments and userinfo are rejected, so values such as `https://trusted@example.com/api` or `https://api.example.com/api#v1` never match an allow-list entry.

For example, `https://API.Example.com:443/v1/?tenant=acme` compares as `https://api.example.com/v1?tenant=acme`. A request that omits both `audience` and `resource` inherits the subject token's audience after the same normalisation. Logical audience labels that are not URI-shaped, including URNs, remain byte-exact; the OP does not lowercase or otherwise rewrite them.

## When you actually need it

You probably **do not** need token exchange when:

- Both services are owned by the same team and trust each other implicitly. Use the user's token directly with a multi-`aud` audience set.
- The downstream service does not need to know about the upstream actor. Pass the user's token through (with the right `aud`).

You probably **do** need it when:

- The downstream service applies policy that depends on **who is in the call chain** — "the wire-transfer service trusts the mobile app, but not the SMS bot, even when both invoke it as Alice".
- A third-party service is in the chain and your audit obligation requires recording the cross-org actor.
- Sender-binding (DPoP / mTLS) needs to follow the **calling service**, not the user.

## See it run

[`examples/33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation) ships a frontend → service-a → service-b chain. The frontend obtains a user token, service-a exchanges it for a delegated token (with `act={sub: service-a}`), service-b's RS-side verifier walks `act.sub` and accepts only delegated tokens.

```sh
(cd examples/33-token-exchange-delegation && GOWORK=off go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring + `TokenExchangePolicy`, `service_a.go` for the intermediary, `service_b.go` for the resource server, `probe.go` for self-verification).

## Read next

- [Use case: token-exchange wiring](/use-cases/token-exchange) — `op.RegisterTokenExchange`, the `TokenExchangePolicy` contract, configuring audiences, refresh-issuance opt-in via `op.PtrBool(true)`.
- [Custom Grant wiring](/use-cases/custom-grant) — token exchange is the in-tree example of a "custom grant_type" the OP routes; embedders writing their own URN follow the same shape via `op.WithCustomGrant`.
