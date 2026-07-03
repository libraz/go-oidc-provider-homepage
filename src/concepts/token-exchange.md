---
title: Token Exchange (RFC 8693)
description: How a service swaps one token for another — delegation, impersonation, and the act chain in plain English.
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

<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="tx-imp-del-title" viewBox="0 0 760 588" width="760" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="tx-imp-del-title">Three ways Service A can call Service B on Alice's behalf — plain forwarding is rejected, impersonation drops the actor, delegation records the act chain.</title>
  <style>
    .tx-lbl{font-family:var(--vp-font-family-base);font-size:12.5px;font-weight:600;fill:currentColor}
    .tx-sub{font-family:var(--vp-font-family-base);font-size:8.5px;fill:currentColor;opacity:.55}
    .tx-band{font-family:var(--vp-font-family-base);font-size:11px;font-weight:600;letter-spacing:.03em;fill:currentColor}
    .tx-mono{font-family:var(--vp-font-family-mono);font-size:10px;fill:currentColor}
    .tx-note{font-family:var(--vp-font-family-base);font-size:10px;fill:currentColor;opacity:.85}
    .tx-acc{stroke:var(--vp-c-brand-2)}
    .tx-acc-f{fill:var(--vp-c-brand-2)}
    .tx-rs{stroke:#7c6ba6}
    .tx-rs-f{fill:#7c6ba6}
    .dark .tx-rs{stroke:#b3a4d6}
    .dark .tx-rs-f{fill:#b3a4d6}
  </style>
  <!-- actor headers -->
  <rect x="34" y="16" width="104" height="40" rx="6"/>
  <text class="tx-lbl" x="86" y="33" text-anchor="middle">Frontend</text>
  <text class="tx-sub" x="86" y="46" text-anchor="middle">browser</text>
  <rect x="230" y="16" width="104" height="40" rx="6"/>
  <text class="tx-lbl" x="282" y="33" text-anchor="middle">Service A</text>
  <text class="tx-sub" x="282" y="46" text-anchor="middle">intermediary</text>
  <rect class="tx-acc" x="426" y="16" width="104" height="40" rx="6"/>
  <text class="tx-lbl tx-acc-f" x="478" y="33" text-anchor="middle">OP</text>
  <text class="tx-sub" x="478" y="46" text-anchor="middle">authz server</text>
  <rect class="tx-rs" x="622" y="16" width="104" height="40" rx="6"/>
  <text class="tx-lbl tx-rs-f" x="674" y="33" text-anchor="middle">Service B</text>
  <text class="tx-sub" x="674" y="46" text-anchor="middle">resource</text>
  <!-- lifelines -->
  <line x1="86" y1="56" x2="86" y2="574" stroke-width="1.5" stroke-opacity=".28"/>
  <line x1="282" y1="56" x2="282" y2="574" stroke-width="1.5" stroke-opacity=".28"/>
  <line class="tx-acc" x1="478" y1="56" x2="478" y2="574" stroke-width="1.5" stroke-opacity=".3"/>
  <line class="tx-rs" x1="674" y1="56" x2="674" y2="574" stroke-width="1.5" stroke-opacity=".3"/>
  <!-- band separators -->
  <line x1="30" y1="66" x2="730" y2="66" stroke-width="1" stroke-opacity=".12"/>
  <line x1="30" y1="190" x2="730" y2="190" stroke-width="1" stroke-opacity=".12"/>
  <line x1="30" y1="384" x2="730" y2="384" stroke-width="1" stroke-opacity=".12"/>
  <!-- ===== Band 1: plain forwarding ===== -->
  <text class="tx-band" x="30" y="82">Plain forwarding — no exchange</text>
  <line x1="86" y1="108" x2="282" y2="108"/>
  <polyline points="276,104 282,108 276,112"/>
  <text class="tx-mono" x="184" y="100" text-anchor="middle">Bearer sub=alice, aud=service-a</text>
  <line x1="282" y1="142" x2="674" y2="142"/>
  <polyline points="668,138 674,142 668,146"/>
  <text class="tx-mono" x="478" y="134" text-anchor="middle">Bearer sub=alice, aud=service-a</text>
  <path d="M674,166 h12 v8 h-12"/>
  <polyline points="679,171 674,174 679,177"/>
  <text class="tx-note" x="666" y="173" text-anchor="end">aud is service-a, not me → reject</text>
  <!-- ===== Band 2: impersonation ===== -->
  <text class="tx-band" x="30" y="206">Impersonation exchange</text>
  <line x1="86" y1="232" x2="282" y2="232"/>
  <polyline points="276,228 282,232 276,236"/>
  <text class="tx-mono" x="184" y="224" text-anchor="middle">Bearer sub=alice</text>
  <line x1="282" y1="268" x2="478" y2="268"/>
  <polyline points="472,264 478,268 472,272"/>
  <text class="tx-mono" x="380" y="252" text-anchor="middle">grant_type=token-exchange</text>
  <text class="tx-mono" x="380" y="262" text-anchor="middle">subject_token=&lt;alice&gt;</text>
  <line x1="282" y1="302" x2="478" y2="302"/>
  <polyline points="288,298 282,302 288,306"/>
  <text class="tx-mono" x="380" y="294" text-anchor="middle">sub=alice, aud=service-b</text>
  <line x1="282" y1="336" x2="674" y2="336"/>
  <polyline points="668,332 674,336 668,340"/>
  <text class="tx-mono" x="478" y="328" text-anchor="middle">Bearer sub=alice</text>
  <path d="M674,360 h12 v8 h-12"/>
  <polyline points="679,365 674,368 679,371"/>
  <text class="tx-note" x="666" y="367" text-anchor="end">alice acted alone — no record of A</text>
  <!-- ===== Band 3: delegation ===== -->
  <text class="tx-band" x="30" y="400">Delegation exchange</text>
  <line x1="86" y1="426" x2="282" y2="426"/>
  <polyline points="276,422 282,426 276,430"/>
  <text class="tx-mono" x="184" y="418" text-anchor="middle">Bearer sub=alice</text>
  <line x1="282" y1="462" x2="478" y2="462"/>
  <polyline points="472,458 478,462 472,466"/>
  <text class="tx-mono" x="380" y="446" text-anchor="middle">subject_token=&lt;alice&gt;</text>
  <text class="tx-mono" x="380" y="456" text-anchor="middle">+ actor_token=&lt;A&gt;</text>
  <line x1="282" y1="496" x2="478" y2="496"/>
  <polyline points="288,492 282,496 288,500"/>
  <text class="tx-mono" x="380" y="488" text-anchor="middle">sub=alice, act={sub: service-a}</text>
  <line x1="282" y1="530" x2="674" y2="530"/>
  <polyline points="668,526 674,530 668,534"/>
  <text class="tx-mono" x="478" y="522" text-anchor="middle">Bearer sub=alice, act={sub: service-a}</text>
  <path d="M674,554 h12 v8 h-12"/>
  <polyline points="679,559 674,562 679,565"/>
  <text class="tx-note" x="666" y="561" text-anchor="end">alice via service-a → policy decides</text>
</svg>

The difference shows up in audit trails (Service B knows who actually originated the call) and in policy (Service B can require an actor when the operation is sensitive).

## What the OP enforces

The library's RFC 8693 handler is opinionated about a few things the spec leaves to deployment policy:

- **`act` chain is built on the OP side**, not handed in by the caller. Whenever `actor_token` differs from `subject_token`, the OP populates `act` from the actor's verified credentials. A caller cannot fabricate an `act` claim.
- **Audience must be explicit and allow-listed.** RFC 8707 audiences (the `audience` / `resource` parameters) are normalised, and the policy decides which audiences this client may target.
- **Scope is intersected**, not unioned. The issued token's scope is the intersection of (requested scope, `subject_token`'s scope, calling client's allow-list). RFC 8693 §3.1 permits scope reduction; the OP forbids inflation.
- **TTL is capped** by the minimum of (handler request, `subject_token` remaining lifetime, OP global ceiling). A long-lived token cannot be laundered into a longer one.
- **`cnf` is rebound to the calling actor.** If Service A presents a DPoP proof on the exchange request, the issued token's `cnf.jkt` matches Service A's DPoP key — not the user's, not the subject_token's. Service B verifies the DPoP proof against the new token's `cnf`.

These rules are enforced **before** the embedder-supplied [`TokenExchangePolicy`](https://github.com/libraz/go-oidc-provider/blob/main/op/tokenexchange.go) is consulted. The policy can narrow further (deny audiences, deny actor combos) but cannot widen — the OP-computed defaults are a floor.

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
(cd examples/33-token-exchange-delegation && go run -tags example .)
```

The example is split into role-tagged files (`op.go` for the OP wiring + `TokenExchangePolicy`, `service_a.go` for the intermediary, `service_b.go` for the resource server, `probe.go` for self-verification).

## Read next

- [Use case: token-exchange wiring](/use-cases/token-exchange) — `op.RegisterTokenExchange`, the `TokenExchangePolicy` contract, configuring audiences, refresh-issuance opt-in via `op.PtrBool(true)`.
- [Custom Grant wiring](/use-cases/custom-grant) — token exchange is the in-tree example of a "custom grant_type" the OP routes; embedders writing their own URN follow the same shape via `op.WithCustomGrant`.
