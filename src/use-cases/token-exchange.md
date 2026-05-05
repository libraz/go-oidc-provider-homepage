---
title: Token Exchange (RFC 8693) — wiring
description: Enable the RFC 8693 token-exchange grant — TokenExchangePolicy, act chain, audience normalisation, cnf rebinding.
---

# Use case — Token Exchange (RFC 8693)

For the conceptual background — impersonation vs delegation, what `act` records, why `cnf` is rebound — read the [Token Exchange primer](/concepts/token-exchange) first. This page covers the wiring.

::: details `subject_token` vs `actor_token` — what's the difference?
**`subject_token`** is the token representing the user (or service) the new token will be issued **on behalf of** — `sub` of the issued token comes from here. **`actor_token`** is the token representing the caller making the exchange — the service that is acting **on behalf of** the subject. In a "service-a calls service-b on alice's behalf" chain, alice's access token is the subject_token, service-a's own access token is the actor_token. Self-exchange (subject == actor) is detected and the OP omits the `act` claim because no real delegation happened.
:::

::: details `act` chain — what's that?
RFC 8693 §4.1 defines the `act` claim as a record of "who acted on whose behalf". On the issued token, `act.sub` is the actor's subject; if the actor was itself the result of a previous exchange, its `act` is nested inside, producing a chain (`alice → service-a → service-b`). Resource servers walk `act` to check whole-chain authorisation: "transfers may be initiated by alice via service-a, but not by bob via service-a". The OP enforces a depth ceiling so a malicious chain cannot grow unboundedly.
:::

## Enabling the grant

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.RegisterTokenExchange(myPolicy),
  // ...
)
```

`op.RegisterTokenExchange(...)` does three things:

1. Registers the RFC 8693 URN (`urn:ietf:params:oauth:grant-type:token-exchange`) at `/token`.
2. Wires the in-tree handler that resolves `subject_token` / `actor_token`, normalises audiences, intersects scope, builds the `act` chain, rebinds `cnf`, and clamps TTL.
3. Stores the embedder-supplied `TokenExchangePolicy` for per-request admission.

::: warning Policy is required, deny by default
A nil `TokenExchangePolicy` fails at `op.New` (`op.ErrTokenExchangePolicyNil`). The grant has no safe default — every exchange must be evaluated by deployment policy. Calling `RegisterTokenExchange` twice fails with `op.ErrTokenExchangeDuplicate`.
:::

## Implementing `TokenExchangePolicy`

The policy interface is small but load-bearing. It receives a fully-resolved `TokenExchangeRequest` (subject and actor already verified, audience normalised, scope intersected) and returns either a `*TokenExchangeDecision` (with optional narrowing overrides) or an error.

```go
type myPolicy struct{ /* dependencies */ }

func (p *myPolicy) Allow(ctx context.Context, req op.TokenExchangeRequest) (*op.TokenExchangeDecision, error) {
    // Deny unknown audiences.
    for _, aud := range req.RequestedAudience {
        if !p.audienceAllowed(req.Client.ID, aud) {
            return nil, &op.Error{Code: "invalid_target", Description: "audience not allowed for this client"}
        }
    }

    // Refuse delegation from unbound subject tokens onto sender-bound audiences.
    if req.Actor != nil && req.SubjectToken.Confirmation == nil && p.audienceRequiresProof(req.RequestedAudience) {
        return nil, &op.Error{Code: "invalid_grant", Description: "downstream requires sender-bound subject"}
    }

    // Optionally opt into refresh-token issuance for long-lived service chains.
    if req.Actor != nil && p.actorEligibleForRefresh(req.Actor) {
        return &op.TokenExchangeDecision{
            IssueRefreshToken: op.PtrBool(true),
        }, nil
    }
    return nil, nil // accept with provider defaults
}
```

### Decision rules

| Field | Behaviour |
|---|---|
| `GrantedScope` | When non-empty, **replaces** the provider-computed set. MUST be a subset of `req.RequestedScope`; broader values yield `invalid_scope`. |
| `GrantedAudience` | When non-empty, replaces the provider-computed set. MUST be a subset of `req.RequestedAudience`; broader values yield `invalid_target`. |
| `GrantedTTL` | When non-zero, narrows the issued access-token lifetime below the provider-computed cap. A value greater than the cap is silently truncated with an audit warning. Negative is rejected. |
| `IssueIDToken` | `*bool` override. Default = true when `subject_token` was an id_token, false otherwise. |
| `IssueRefreshToken` | `*bool` override. Default = nil = no refresh token. To opt in, set `op.PtrBool(true)` — the pointer shape exists so embedders cannot conflate "unset" with "false". |
| `ExtraClaims` | Merged into the id_token. Reserved-claim filter applies: `iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid / act / cnf` are dropped silently so the policy cannot rewrite the act chain, hijack `sub`, or forge `cnf`. |

### Error semantics

| Return | Wire response |
|---|---|
| `(nil, nil)` | Provider defaults; exchange admitted. |
| `(*Decision, nil)` | Decision applied (may narrow); exchange admitted. |
| `(_, *op.Error)` | Returned verbatim — pick the spec error code (`invalid_grant`, `invalid_target`, `invalid_scope`, `unauthorized_client`). |
| `(_, any other error)` | Collapses to `invalid_grant`; original cause is logged but not exposed. |

## What the OP enforces *before* your policy runs

These are not negotiable — the policy can narrow but never widen:

- **`act` chain construction**: whenever the actor differs from the subject, the OP populates the issued token's `act` claim from the actor's verified credentials. The caller cannot fabricate an `act`.
- **Audience normalisation**: RFC 8707 §2 lowercase-scheme + lowercase-host + trailing-slash strip. Default-fill from `subject_token.audience` when the request omits the parameter.
- **Scope intersection**: requested ∩ subject_token.scope ∩ client allow-list. Empty result = `invalid_scope`.
- **TTL ceiling**: min(`GrantedTTL`, `subject_token` remaining, OP global cap).
- **`cnf` rebinding**: the issued token's `cnf` (DPoP `jkt` or mTLS `x5t#S256`) is the **calling** actor's verified proof, not the subject's.
- **Self-exchange detection**: when `subject_token.client_id` == `req.Client.ID`, no `act` entry is added (no real delegation happened).

::: details Scope intersection — what's that?
The issued token's scope cannot exceed three different ceilings simultaneously: (a) what the request asked for, (b) what the subject_token already had, (c) what the calling client is allowed in its registration. The OP intersects all three; an empty result is `invalid_scope`. This is what makes token-exchange safe — service-a cannot magically gain `admin:write` from a user token that only had `profile`.
:::

::: details TTL ceiling — what's that?
The issued token's lifetime is the minimum of three values: any `GrantedTTL` your policy returned, the remaining lifetime of the subject_token (you cannot extend the user's session past where it would have ended anyway), and the OP's global access-token TTL cap. Going over the ceiling is silently truncated with an audit warning rather than rejected, so a slightly-too-large policy value doesn't fail closed.
:::

::: details `cnf` rebinding — what's that?
The subject_token may have been bound to alice's DPoP key. The exchanged token is going to service-a — it should be bound to service-a's key, not alice's, otherwise service-a can't actually use it. The OP "rebinds" `cnf` by replacing the subject_token's confirmation with the calling actor's verified DPoP / mTLS proof. See [Sender constraint](/concepts/sender-constraint) for why this matters.
:::

::: details Self-exchange — what's that?
When the same client both held the subject_token and is now requesting the exchange (`subject_token.client_id == req.Client.ID`), no real delegation happened — the client is just narrowing its own token. RFC 8693 says `act` should record actual delegation events, so the OP omits it in the self-exchange case to avoid producing a chain entry that says "service-a acted on behalf of itself".
:::

## A worked exchange request

```sh
curl -s \
  -u service-a:<secret> \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  -d "subject_token=$ALICES_ACCESS_TOKEN" \
  -d 'subject_token_type=urn:ietf:params:oauth:token-type:access_token' \
  -d "actor_token=$SERVICE_A_TOKEN" \
  -d 'actor_token_type=urn:ietf:params:oauth:token-type:access_token' \
  -d 'audience=https://api.b.example.com' \
  -d 'scope=write:transfer' \
  https://op.example.com/oidc/token
```

The issued access token decodes to:

```json
{
  "sub": "alice",
  "act": { "sub": "service-a", "client_id": "service-a" },
  "aud": ["https://api.b.example.com"],
  "scope": "write:transfer",
  "cnf": { "jkt": "<service-a's DPoP thumbprint>" },
  "iss": "https://op.example.com",
  "exp": ...
}
```

Service B verifies the DPoP proof against `cnf.jkt`, sees `act.sub`, and applies whatever delegation policy it has ("transfers may be initiated by alice via service-a, but not by bob via service-a").

## Refresh tokens — opt in only

By default, a token-exchange request does **not** issue a refresh token. RFC 8693 §2.2.1 makes the response parameter OPTIONAL because chained delegations should not silently extend their reach past the subject_token's lifetime.

To opt in, the policy returns `IssueRefreshToken: op.PtrBool(true)`. The pointer shape (rather than a plain bool) prevents accidental opt-in from struct zero values. Issuance fires the `token_exchange.refresh_issued` audit event for SOC visibility.

## Audit signal pairing

Every successful exchange emits two audit events: `token_exchange.requested` (entered the handler) + `token_exchange.granted` (issued). Rejections emit `requested` plus one of the failure-class events:

- `policy_denied` / `policy_error` — your policy returned an error
- `scope_inflation_blocked` — request asked for scope outside the intersection
- `audience_blocked` — request asked for an audience outside the policy's allow-list
- `ttl_capped` — issued TTL was clipped (warning, not denial)
- `act_chain_too_deep` — nested act chain exceeded the depth limit
- `subject_token_invalid` — subject_token verification failed
- `subject_token_registry_error` — registry lookup faulted (transient outage); wire stays `invalid_grant`

See the [audit event catalog](/reference/audit-events#token-exchange-rfc-8693) for the full list.

## See it run

[`examples/32-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-token-exchange-delegation):

```sh
go run -tags example ./examples/32-token-exchange-delegation
```

Frontend → service-a → service-b chain. Service-a exchanges Alice's token for a delegated token (`act={sub: service-a}`); service-b's RS-side verifier walks `act.sub` and rejects tokens missing the chain. Files: `op.go` (OP wiring + `TokenExchangePolicy`), `service_a.go` (intermediary), `service_b.go` (resource server), `probe.go` (self-verify).

## Read next

- [Token Exchange primer](/concepts/token-exchange) — impersonation vs delegation, the conceptual background.
- [Custom Grant wiring](/use-cases/custom-grant) — the URN-routing seam token-exchange uses; embedders writing other URNs follow the same shape.
- [Sender constraint](/concepts/sender-constraint) — why `cnf` rebinding to the actor is the right default.
