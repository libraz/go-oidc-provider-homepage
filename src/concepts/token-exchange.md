---
title: Token Exchange (RFC 8693)
description: How a service swaps one token for another — delegation, impersonation, and the act chain in plain English.
pageClass: pg-concepts-token-exchange
---

# Token Exchange (RFC 8693)

A modern microservice graph almost always needs to **call other services on behalf of the user**. The frontend gets a token. Service A receives that token, then needs to call Service B. Should Service A reuse the user's token? Mint a new one? Combine the two? RFC 8693 defines the wire shape for that exchange.

The spec distinguishes two intents:

- **Impersonation** — Service A obtains a token that names only the user and uses it **as if it were the user**. Service B sees `sub=alice`, and downstream audit trails see Alice acting alone.
- **Delegation** — Service A obtains a token whose `sub` is still Alice but whose **`act` claim** carries `{sub: service-a}`, recording that Alice's authority is being exercised through Service A. Service B sees `sub=alice, act={sub: service-a}` and can apply policy that depends on the chain ("Service A may withdraw Alice's funds, but only if the request originated from Alice").

Modern threat models prefer delegation: the audit chain stays intact, revocation can target the intermediary, and least privilege tightens around the actor instead of spreading from the subject. **This library always records the party that performed the exchange.** The only exchange that produces a token without `act` is a self-exchange, where the calling client is the client the `subject_token` was issued to (for example narrowing its own token to another audience).

::: details Specs referenced on this page
- [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693) — OAuth 2.0 Token Exchange
- [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) — Resource Indicators (used for `audience` / `resource`)
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim — re-binds the issued token to the calling actor's DPoP / mTLS key
:::

::: details Vocabulary refresher
- **subject_token** — the token whose holder's identity should populate `sub` on the new token. Usually the user's access token forwarded from upstream. Access tokens (JWT or opaque), JWTs and ID tokens are accepted, identified by `subject_token_type`.
- **actor_token** — an optional second token identifying the actor. When present, the new token's `act.sub` is the `sub` of this verified token. It must not resolve to the same subject as the `subject_token`.
- **`act` claim** (RFC 8693 §4.1) — a nested object recording who is acting on behalf of `sub`. It nests (`act.act.act…`), so a multi-hop call records every intermediary. The library allows at most five levels.
- **`cnf` binding** — if the request carries a verified DPoP proof or mTLS certificate, the issued token's `cnf` (RFC 7800 confirmation) is set from it. A `subject_token` that is itself sender-constrained is accepted only when the request presents the same key.
:::

## Forwarding, exchange, and exchange with an actor

<figure class="fig">
  <div class="fig-head">Only an exchange changes the audience; forwarding fails</div>
  <svg class="fig-svg" role="img" aria-labelledby="tx-modes-title" viewBox="0 0 960 984" xmlns="http://www.w3.org/2000/svg">
    <title id="tx-modes-title">Three ways an intermediary service can call a downstream service on the user's behalf. Forwarding the original token fails because the audience is wrong. An exchange without actor_token produces a token that names the user and records the calling client in an act claim. An exchange with actor_token records the actor_token's subject in the act claim instead.</title>
    <!-- case bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="182" rx="8"/>
    <text class="fg-lbl fg-danger fg-halo" x="56" y="132">Forwarding</text>
    <rect class="fg-group" x="32" y="310" width="896" height="310" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="338">Exchange without actor_token</text>
    <rect class="fg-group" x="32" y="644" width="896" height="310" rx="8"/>
    <text class="fg-lbl fg-halo" x="56" y="672">Exchange with actor_token</text>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="960"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="960"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="960"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Service A</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">intermediary</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">authorization server</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Service B</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">the resource</text>
    <!-- forwarding -->
    <path class="fg-edge fg-edge--danger" d="M192,206 H824" marker-end="url(#fg-ad)"/>
    <text class="fg-m fg-halo" x="508" y="172" text-anchor="middle">Authorization: Bearer &lt;token&gt;</text>
    <text class="fg-mxs fg-halo" x="508" y="194" text-anchor="middle">sub=alice · aud=service-a</text>
    <path class="fg-edge fg-edge--danger" d="M824,262 H192" marker-end="url(#fg-ad)"/>
    <text class="fg-edge-lbl fg-danger fg-halo" x="508" y="252" text-anchor="middle">401 · aud is service-a, not service-b</text>
    <!-- exchange -->
    <path class="fg-edge" d="M192,412 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="378" text-anchor="middle">grant_type=…:token-exchange</text>
    <text class="fg-mxs" x="352" y="400" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M512,484 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="450" text-anchor="middle">sub=alice · aud=service-b</text>
    <text class="fg-mxs" x="352" y="472" text-anchor="middle">act={ sub: service-a }</text>
    <path class="fg-edge" d="M192,548 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="538" text-anchor="middle">Bearer sub=alice · act={ sub: service-a }</text>
    <rect class="fg-pill fg-pill--ok" x="536" y="564" width="272" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="672" y="585" text-anchor="middle">act.sub = calling client_id</text>
    <!-- exchange with actor_token -->
    <path class="fg-edge" d="M192,746 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="712" text-anchor="middle">subject_token=&lt;alice&gt;</text>
    <text class="fg-mxs" x="352" y="734" text-anchor="middle">actor_token=&lt;service-a&gt;</text>
    <path class="fg-edge fg-edge--accent" d="M512,818 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="352" y="784" text-anchor="middle">sub=alice · aud=service-b</text>
    <text class="fg-mxs" x="352" y="806" text-anchor="middle">act={ sub: service-a }</text>
    <path class="fg-edge" d="M192,882 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="508" y="872" text-anchor="middle">Bearer sub=alice · act={ sub: service-a }</text>
    <rect class="fg-pill fg-pill--ok" x="536" y="898" width="272" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="672" y="919" text-anchor="middle">act.sub = actor_token's sub</text>
  </svg>
  <figcaption class="fig-note">Forwarding fails on the audience. Both exchanges yield a token that says "alice, through service A"; they differ only in where the actor name comes from: the authenticated calling client, or the verified <code>actor_token</code>.</figcaption>
</figure>

Service B can see who originated the call in its audit trail, and can require an `act` entry from a named service when the operation is sensitive.

## What the OP enforces

The library's RFC 8693 handler is opinionated about a few things the spec leaves to deployment policy:

- **The `act` chain is built on the OP side**, never handed in by the caller. The table below shows what goes into it. A caller cannot fabricate an `act` claim, and a policy's `ExtraClaims` cannot overwrite it.
- **Audience is normalised and allow-listed.** RFC 8707 `audience` / `resource` parameters are normalised before policy evaluation; when both are omitted, the `subject_token`'s audience supplies the default. Every resulting audience must appear in the calling client's registered `Resources`; a client with none cannot be issued any audience (`invalid_target`).
- **Scope can only shrink.** A request that omits `scope` gets the `subject_token`'s scope; requested scopes the calling client is not registered for are dropped, and anything beyond the `subject_token`'s scope is refused with `invalid_scope`. An empty result is also `invalid_scope`.
- **TTL is capped** at the smaller of the policy's `GrantedTTL` (or the OP's access-token ceiling when unset) and the `subject_token`'s remaining lifetime. A long-lived token cannot be laundered into a longer one. The expiry check on the `subject_token` honours the OP's clock leeway.
- **Only access tokens come back.** `requested_token_type` may be absent or the access-token URN. A refresh token is issued only when the policy opts in with `IssueRefreshToken: op.PtrBool(true)`; an ID token only when the `subject_token` was one (or the policy forces it).
- **`cnf` follows the request's proof.** If Service A presents a DPoP proof on the exchange request, the issued token's `cnf.jkt` is Service A's key. When the `subject_token` is already bound, the same key must be presented, so a stolen bound token cannot be exchanged.

These rules are enforced **before** the embedder-supplied [`TokenExchangePolicy`](https://github.com/libraz/go-oidc-provider/blob/main/op/tokenexchange.go) is consulted. The policy can narrow further (deny audiences, deny actor combinations) but cannot widen; a decision that grants more scope or audience than was requested is rejected.

| Request | `act` on the issued token |
|---|---|
| `actor_token` present | `{ sub: <actor_token's sub>, act: <the subject_token's earlier chain> }` |
| No `actor_token`, calling client differs from the client the `subject_token` was issued to | `{ sub: <calling client_id>, act: <earlier chain> }` |
| No `actor_token`, same client (self-exchange) | the earlier chain unchanged, none if there was none |

A chain deeper than five levels is refused with `invalid_grant` before the policy runs. Exchanged tokens join the grant the `subject_token` was issued under, so revoking that grant (`RevokeSubject`, grant management, `/end_session` teardown) also revokes them, and a refresh token obtained through the exchange stops rotating once the subject is deleted or deprovisioned. A `subject_token` with no grant behind it, such as a `client_credentials` token, has no such lineage. An ID token issued to a pairwise client cannot be exchanged.

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

[`examples/33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation) ships a frontend → service-a → service-b chain. The frontend obtains a user token through the authorization code flow, service-a exchanges it without an `actor_token` for a token with `act={sub: service-a}` and `aud=service-b`, and service-b's resource-server-side verifier walks `act.sub` and accepts only tokens that carry it. `service-a` is registered with the token-exchange URN in `GrantTypes` and both audiences in `Resources`, as the exchange requires.

```sh
(cd examples/33-token-exchange-delegation && GOWORK=off go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring + `TokenExchangePolicy`, `service_a.go` for the intermediary, `service_b.go` for the resource server, `probe.go` for self-verification).

## Read next

- [Use case: token-exchange wiring](/use-cases/token-exchange) — `op.RegisterTokenExchange`, the `TokenExchangePolicy` contract, configuring audiences, refresh-issuance opt-in via `op.PtrBool(true)`.
- [Custom Grant wiring](/use-cases/custom-grant) — token exchange is the in-tree example of a "custom grant_type" the OP routes; embedders writing their own URN follow the same shape via `op.WithCustomGrant`.
