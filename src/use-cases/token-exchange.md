---
title: Token Exchange (RFC 8693) — wiring
description: Enable the RFC 8693 token-exchange grant — TokenExchangePolicy, act chain, audience normalisation, cnf rebinding.
pageClass: pg-use-cases-token-exchange
---

# Use case — Token Exchange (RFC 8693)

Token exchange (RFC 8693) lets a client trade a token it holds for a new one with a different audience, a narrower scope, or a recorded delegation. The usual case: a front-end service holds Alice's access token and needs a token to call a downstream service on her behalf. For the concepts, including impersonation vs delegation and why `cnf` is rebound, read the [Token Exchange primer](/concepts/token-exchange) first. This page covers the wiring.

::: details `subject_token` vs `actor_token` — what's the difference?
**`subject_token`** is the token for the user (or service) the new token is issued **on behalf of**; the issued token's `sub` comes from it. **`actor_token`** is optional and names the party that acts for the subject. In "service-a calls service-b on alice's behalf", alice's access token is the `subject_token`, and service-a's own access token may be the `actor_token`. Without an `actor_token`, the authenticated calling client is the actor. A request whose `actor_token` resolves to the same subject as the `subject_token` is rejected with `400 invalid_request`.
:::

::: details `act` chain — what's that?
RFC 8693 §4.1 defines the `act` claim as a record of "who acted on whose behalf". On the issued token, `act.sub` names the actor. If the `subject_token` already carried an `act`, it is nested inside the new entry, which produces a chain (`alice → service-a → service-b`). A resource server walks `act` to check the whole chain: "transfers may be initiated by alice via service-a, but not by bob via service-a". The OP refuses a chain deeper than five levels, before your policy runs.
:::

<figure class="fig">
  <div class="fig-head">Two tokens in, one token out</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-tx-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-tx-title">Token exchange end to end. Service A presents Alice's token as the subject and its own token as the actor. The OP validates both, intersects the scopes, canonicalises the audience, rebuilds the act chain and the confirmation claim, and runs the policy before issuing a token addressed to Service B.</title>
    <!-- subject token -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="52">subject_token</text>
    <text class="fg-s" x="48" y="76">Alice's access token</text>
    <text class="fg-mxs" x="48" y="100">scope=profile write</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <!-- actor token -->
    <rect class="fg-box" x="32" y="160" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="188">actor_token</text>
    <text class="fg-s" x="48" y="212">service-a's own token</text>
    <text class="fg-mxs" x="48" y="236">sub=service-a</text>
    <path class="fg-edge" d="M304,208 H344" marker-end="url(#fg-a)"/>
    <!-- OP /token -->
    <rect class="fg-frame fg-frame--accent" x="344" y="24" width="304" height="256" rx="8"/>
    <text class="fg-m fg-accent" x="368" y="52">OP /token</text>
    <text class="fg-mxs" x="368" y="76">grant_type=…:token-exchange</text>
    <!-- step 1 -->
    <circle class="fg-badge" cx="380" cy="116" r="12"/>
    <text class="fg-badge-t" x="380" y="121.5" text-anchor="middle">1</text>
    <text class="fg-s" x="404" y="121.5">validate both tokens</text>
    <!-- step 2 -->
    <circle class="fg-badge" cx="380" cy="148" r="12"/>
    <text class="fg-badge-t" x="380" y="153.5" text-anchor="middle">2</text>
    <text class="fg-s" x="404" y="153.5">intersect the scopes</text>
    <!-- step 3 -->
    <circle class="fg-badge" cx="380" cy="180" r="12"/>
    <text class="fg-badge-t" x="380" y="185.5" text-anchor="middle">3</text>
    <text class="fg-s" x="404" y="185.5">canonicalise the audience</text>
    <!-- step 4 -->
    <circle class="fg-badge" cx="380" cy="212" r="12"/>
    <text class="fg-badge-t" x="380" y="217.5" text-anchor="middle">4</text>
    <text class="fg-s" x="404" y="217.5">rebuild act and cnf</text>
    <!-- step 5 -->
    <circle class="fg-badge" cx="380" cy="244" r="12"/>
    <text class="fg-badge-t" x="380" y="249.5" text-anchor="middle">5</text>
    <text class="fg-s" x="404" y="249.5">run Policy.Allow</text>
    <rect class="fg-pill fg-pill--warn" x="344" y="312" width="304" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="496" y="333" text-anchor="middle">any step may refuse</text>
    <path class="fg-edge fg-edge--accent" d="M648,72 H688" marker-end="url(#fg-ac)"/>
    <!-- issued token -->
    <rect class="fg-box fg-box--accent" x="688" y="24" width="240" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="704" y="52">The issued token</text>
    <text class="fg-mxs" x="704" y="76">aud=service-b</text>
    <text class="fg-mxs" x="704" y="100">act.sub=service-a</text>
    <path class="fg-edge" d="M808,120 V160" marker-end="url(#fg-a)"/>
    <!-- service-b -->
    <rect class="fg-box" x="688" y="160" width="240" height="96" rx="8"/>
    <text class="fg-m" x="704" y="188">service-b</text>
    <text class="fg-s" x="704" y="212">verifies act and cnf,</text>
    <text class="fg-s" x="704" y="236">then decides access</text>
  </svg>
  <figcaption class="fig-note">The exchange only narrows — scopes intersect, the audience is one service, the actor is recorded — so no request returns more authority than the subject token carried. Step 5 is where your policy lives; the OP never decides on its own whether service A may act for Alice against service B.</figcaption>
</figure>

The issued token's `cnf` comes from the DPoP or mTLS proof presented on this exchange request, never from `subject_token.cnf`. A `subject_token` or `actor_token` that is itself sender-bound must be presented with the same proof, or the exchange fails with `invalid_grant`.

## Enabling the grant

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  // Token exchange is an extension grant, so WithGrants only chooses the
  // built-in grants this OP also serves. RefreshToken is listed because
  // the policy below may opt into refresh issuance.
  op.WithGrants(grant.ClientCredentials, grant.RefreshToken),
  op.RegisterTokenExchange(myPolicy),

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "service-a",
    Secret:     serviceASecret,
    AuthMethod: op.AuthClientSecretBasic,
    // The client must list the token-exchange URN.
    GrantTypes: []string{op.TokenExchangeGrantType},
    Scopes:     []string{"profile", "write:transfer"},
    // Every audience the client may exchange for must be registered.
    Resources:  []string{"https://api.b.example.com"},
  }),
)
```

`op.RegisterTokenExchange(...)` does three things:

1. Registers the RFC 8693 URN (`urn:ietf:params:oauth:grant-type:token-exchange`) at `/token`.
2. Wires the built-in handler that resolves `subject_token` / `actor_token`, normalises audiences, intersects scope, builds the `act` chain, rebinds `cnf`, and clamps TTL.
3. Stores your `TokenExchangePolicy` for per-request admission.

::: warning Policy is required, deny by default
A nil `TokenExchangePolicy` fails at `op.New` (`op.ErrTokenExchangePolicyNil`). The grant has no safe default — every exchange must be evaluated by deployment policy. Calling `RegisterTokenExchange` twice fails with `op.ErrTokenExchangeDuplicate`.
:::

## Implementing `TokenExchangePolicy`

The policy interface is small but decisive. It receives a resolved `TokenExchangeRequest` (tokens verified, audience normalised, scope intersected) and returns either a `*TokenExchangeDecision` (with optional narrowing overrides) or an error.

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
| `GrantedTTL` | When positive, narrows the issued access-token lifetime below the provider-computed cap. A larger value is truncated to the cap and recorded as `token_exchange.ttl_capped`. Zero or negative keeps the computed lifetime. |
| `IssueIDToken` | `*bool` override. The default is true when `subject_token` was an id_token and false otherwise. An explicit false suppresses the ID Token even when `openid` remains in the granted scope. |
| `IssueRefreshToken` | `*bool` override. The default (nil) issues no refresh token. To opt in, set `op.PtrBool(true)`; the pointer shape keeps "unset" distinct from "false". |
| `ExtraClaims` | Merged into the access token and, when one is issued, the id_token. Reserved names (`iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid / act / cnf`) are dropped silently, so the policy cannot rewrite the `act` chain, hijack `sub`, or forge `cnf`. A name the OP manages on the access token (`client_id`, `scope`, `jti`, ...) fails the exchange with `server_error`. |

The OP applies the subset rule again after the decision. A policy that returns a broader scope or audience is rejected with `invalid_scope` / `invalid_target` and an audit event; no widened token is minted. An empty granted scope is `invalid_scope` too.

### Error semantics

| Return | Wire response |
|---|---|
| `(nil, nil)` | Provider defaults; exchange admitted. |
| `(*Decision, nil)` | Decision applied (may narrow); exchange admitted. |
| `(_, *op.Error)` | Returned verbatim — pick the spec error code (`invalid_grant`, `invalid_target`, `invalid_scope`, `unauthorized_client`). |
| `(_, any other error)` | Collapses to `invalid_grant`; original cause is logged but not exposed. |

## What the OP enforces *before* your policy runs

The policy can narrow the result but never widen it:

- **Token checks**: `subject_token_type` and `actor_token_type` must be one of `urn:ietf:params:oauth:token-type:access_token`, `:jwt`, or `:id_token`. The tokens must be issued by this OP, unexpired (within the clock leeway the other endpoints use), and not revoked. An id_token must have the calling client in its audience, and its scope is read from the stored consent, so withdrawn consent closes the exchange. An id_token issued to a pairwise client cannot be exchanged. `requested_token_type`, when sent, must be `access_token`. The issued token is always a JWT access token.
- **`act` chain**: the OP builds `act` itself; the caller cannot supply one. The table below shows the three cases.
- **Resource/audience normalisation**: URI-shaped values must be absolute with a scheme and host. RFC 8707 §2 lowercases the scheme and host, removes the default port (`http:80` / `https:443`), and strips one trailing slash; fragments and userinfo are rejected, while query text is preserved. Opaque labels and URNs are compared verbatim. The `audience` and `resource` parameters are merged; when both are absent, the `subject_token`'s audience is used. For example, `https://api.example.com:443/v1/` becomes `https://api.example.com/v1`. Every requested audience must be in the client's `Resources`, or the exchange is `invalid_target`.
- **Scope**: the requested scope (default: the `subject_token`'s) is first cut down to the client's registered `Scopes`, then must be a subset of the `subject_token`'s scope, or the exchange is `invalid_scope`. An empty result is `invalid_scope` too.
- **TTL ceiling**: the minimum of `GrantedTTL`, the `subject_token`'s remaining lifetime, and the OP's global access-token lifetime.
- **`cnf` rebinding**: the issued token's `cnf` (DPoP `jkt` or mTLS `x5t#S256`) comes from the proof presented on this request.
- **Grant lineage**: when the `subject_token` was issued under a stored grant, the exchanged tokens are issued under that same grant. Revoking the grant (`RevokeSubject`, Grant Management revoke, `/end_session`) or deleting the user revokes them, and a refresh token obtained through exchange stops rotating once its subject is deleted. A `subject_token` with no grant (for example one from `client_credentials`) yields tokens with no grant.

| Case | `act` on the issued token |
|---|---|
| `actor_token` present | `{ "sub": <actor's sub> }`, with the `subject_token`'s earlier `act` nested inside |
| No `actor_token`, calling client differs from the `subject_token`'s client | `{ "sub": <calling client_id> }`, with any earlier `act` nested inside |
| No `actor_token`, calling client is the one the `subject_token` was issued to (self-exchange) | No new entry; any earlier `act` is kept as is, and `token_exchange.self_exchange` is recorded |

::: details Scope intersection — what's that?
The issued token's scope cannot exceed three different ceilings simultaneously: (a) what the request asked for, (b) what the subject_token already had, (c) what the calling client is allowed in its registration. The OP intersects all three; an empty result is `invalid_scope`. This is what makes token-exchange safe — service-a cannot magically gain `admin:write` from a user token that only had `profile`.
:::

::: details TTL ceiling — what's that?
The issued token's lifetime is the minimum of three values: any `GrantedTTL` your policy returned, the remaining lifetime of the `subject_token` (an exchange cannot extend the user's session past where it would have ended anyway), and the OP's global access-token lifetime. A value over the ceiling is truncated and recorded as `token_exchange.ttl_capped` instead of being rejected, so a slightly-too-large policy value does not fail the exchange.
:::

::: details `cnf` rebinding — what's that?
A sender-bound token carries `cnf`, which names the key whose holder may use it. The exchanged token is for the party calling `/token`, so the OP stamps `cnf` from the proof on the exchange request instead of copying the `subject_token`'s. A bound `subject_token` is accepted only when the request carries the matching proof, so a stolen bound token cannot be exchanged by someone without the key; an unbound (bearer) `subject_token` can be exchanged into a bound one. See [Sender constraint](/concepts/sender-constraint) for why this matters.
:::

::: details Self-exchange — what's that?
When the client that holds the `subject_token` is also the one requesting the exchange (`subject_token.client_id == req.Client.ID`) and sends no `actor_token`, no delegation happened: the client is narrowing its own token. `act` should record real delegation, so the OP adds no entry rather than one saying "service-a acted on behalf of itself".
:::

## A worked exchange request

Service A authenticates as itself and presents Alice's access token. With no `actor_token`, the OP records service-a (the calling client) as the actor:

```sh
curl -s \
  -u service-a:<secret> \
  -H 'DPoP: <proof signed by service-a's key>' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  -d "subject_token=$ALICES_ACCESS_TOKEN" \
  -d 'subject_token_type=urn:ietf:params:oauth:token-type:access_token' \
  -d 'audience=https://api.b.example.com' \
  -d 'scope=write:transfer' \
  https://op.example.com/oidc/token
```

The response also carries `issued_token_type=urn:ietf:params:oauth:token-type:access_token`, and the access token decodes to:

```json
{
  "sub": "alice",
  "act": { "sub": "service-a" },
  "aud": "https://api.b.example.com",
  "scope": "write:transfer",
  "cnf": { "jkt": "<thumbprint of the DPoP key on this request>" },
  "iss": "https://op.example.com",
  "exp": ...
}
```

Service B verifies the DPoP proof against `cnf.jkt`, reads `act.sub`, and applies its own delegation rules ("transfers may be initiated by alice via service-a, but not by bob via service-a").

When the acting party is a different principal than the authenticated client, add `actor_token` and `actor_token_type` (same three type URNs). `act.sub` is then the actor token's `sub`. The `DPoP` header (which needs `feature.DPoP` enabled) is only needed for a DPoP-bound result; without it the token is a bearer token, unless the active profile requires sender constraint.

## Refresh tokens — opt in only

By default, a token-exchange request does **not** issue a refresh token. RFC 8693 §2.2.1 makes the response parameter OPTIONAL because chained delegations should not silently extend their reach past the subject_token's lifetime.

To opt in, the policy returns `IssueRefreshToken: op.PtrBool(true)`. The pointer shape prevents an accidental opt-in from a struct's zero value. The decision only states intent. The OP issues the refresh token when the provider serves `refresh_token`, the client is registered for that grant, and the response has a non-empty subject and scope and at most one audience. If a condition fails, the access-token response still succeeds without a refresh token, and `custom_grant.refresh_dropped` records the reason. Otherwise the OP creates the refresh token in its own refresh-token store, under the issued access token's grant and with the same DPoP / mTLS binding. `token_exchange.refresh_issued` is recorded only when the refresh token is actually issued.

## Audit signal pairing

Every exchange attempt emits `token_exchange.requested` at handler entry, before parsing and validation. A successful exchange then emits `token_exchange.granted` once issuance has succeeded; if issuance fails afterwards, `custom_grant.failed` is recorded instead. A rejection emits `requested` plus one of the failure-class events, including for structurally unusable requests:

- `policy_denied` / `policy_error` — your policy returned an error
- `scope_inflation_blocked` — the request or the policy asked for scope beyond what the `subject_token` carries
- `audience_blocked` — the request or the policy asked for an audience outside the allowed set
- `empty_scope_rejected` — nothing was left of the scope
- `ttl_capped` — the issued TTL was clipped (informational, not a denial)
- `act_chain_too_deep` — the nested `act` chain exceeded five levels
- `actor_equals_subject` — the actor resolves to the same subject as the `subject_token`
- `subject_token_invalid` / `subject_token_external` / `actor_token_external` — a token failed verification or came from another issuer
- `subject_token_registry_error` — a registry lookup faulted (transient outage); the wire response stays `invalid_grant`
- `self_exchange` — informational, see the `act` table above

See the [audit event catalog](/reference/audit-events#token-exchange-rfc-8693) for the full list.

## See it run

[`examples/33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation):

```sh
(cd examples/33-token-exchange-delegation && GOWORK=off go run -tags example .)
```

A front end obtains Alice's access token with the authorization code flow. Service-a exchanges it for a token addressed to service-b (`act={sub: service-a}`, no `actor_token`), and service-b's verifier reads `act.sub` and rejects tokens that lack the chain. Files: `op.go` (OP wiring + `TokenExchangePolicy`), `service_a.go` (intermediary), `service_b.go` (resource server), `probe.go` (self-verify).

## Read next

- [Token Exchange primer](/concepts/token-exchange) — impersonation vs delegation, the conceptual background.
- [Custom Grant wiring](/use-cases/custom-grant) — the URN-routing seam token exchange uses; handlers for other URNs follow the same shape.
- [Sender constraint](/concepts/sender-constraint) — why `cnf` rebinding to the actor is the right default.
