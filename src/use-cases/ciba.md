---
title: CIBA poll mode — wiring
description: Enable CIBA poll mode — /bc-authorize, verified HintResolver subjects, FAPI-CIBA constraints, and embedder-owned authentication-device approval.
pageClass: pg-use-cases-ciba
---

# Use case — CIBA (Client-Initiated Backchannel Authentication)

CIBA lets a client start an authentication for a user it already knows (a cashier's terminal, a call-centre console) while the user approves on their own device, typically a phone app. For the concepts, including how CIBA differs from device flow and why `binding_message` matters, read the [CIBA primer](/concepts/ciba) first. This page covers the wiring.

<figure class="fig">
  <div class="fig-head">The user approves on a phone, not at the terminal</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-ciba-title" viewBox="0 0 960 448" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-ciba-title">The consumption device asks the OP to start an authorization, your notification service reaches the registered phone, the user approves there, and the consumption device polls the token endpoint until a decision lands.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="424"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="424"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="424"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Consumption device</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">POS · shared terminal</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">CIBARequestStore</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Auth device</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">user's phone app</text>
    <!-- terminal asks the OP to start -->
    <path class="fg-edge" d="M192,144 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="134" text-anchor="middle">POST /bc-authorize</text>
    <!-- your notification service reaches the phone -->
    <path class="fg-edge fg-edge--muted" d="M512,208 H824" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="668" y="198" text-anchor="middle">your notification service</text>
    <!-- user approves or denies out of band -->
    <path class="fg-edge" d="M824,272 H512" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="668" y="262" text-anchor="middle">user approves or denies</text>
    <!-- terminal polls until decided -->
    <path class="fg-edge" d="M192,352 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="318" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="352" y="340" text-anchor="middle">repeats until decided</text>
    <!-- tokens once approved -->
    <path class="fg-edge fg-edge--accent" d="M512,424 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="414" text-anchor="middle">tokens once approved</text>
  </svg>
  <figcaption class="fig-note">The notification hop is the piece you have to build. The library holds the request and answers the polling; getting a prompt onto that phone is your notification service's job, not the OP's.</figcaption>
</figure>

::: details Poll delivery — what is implemented?
CIBA defines poll, ping, and push delivery modes. This library implements **poll** only: the consumption device calls `/token` repeatedly until the answer arrives. Discovery advertises only `poll`, so a client cannot negotiate an unsupported mode.
:::

::: details `auth_req_id` — what's that?
The opaque identifier `/bc-authorize` returns to the consumption device. It is the CIBA counterpart of `device_code`: the device keeps it private and submits it on every `/token` poll. Unlike device flow there is no user-visible code, because your notification service delivers the prompt out of band and the consumption device only needs the polling handle.
:::

::: details `binding_message` — what's that?
A short human-readable string the consumption device sends in `/bc-authorize` and the OP stores with the request, for your notification service to show on the authentication device. The cashier's POS shows "Approve $80.00 at Acme Coffee, terminal #14"; the user's phone shows the same string in the approve dialog. It is the user's only evidence that the prompt belongs to the transaction in front of them. Without it, someone who triggers an unrelated CIBA request could get a user to approve a vague "Approve sign-in?" dialog. Treat it as required even though the spec says optional.
:::

::: warning Poll mode only
The library implements **poll** delivery only. Discovery advertises `backchannel_token_delivery_modes_supported: ["poll"]` and nothing else. A client that sends `client_notification_token` or `user_code` gets `400 invalid_request`.
:::

## Enabling CIBA

```go
import (
  "context"
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/grant"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // ships a CIBARequestStore substore
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  // Naming grant.CIBA replaces the default {authorization_code,
  // refresh_token} pair: the consumption device never opens a browser.
  op.WithGrants(grant.CIBA),
  op.WithCIBA(
    op.WithCIBAHintResolver(myHintResolver),
    op.WithCIBAPollInterval(5 * time.Second),       // optional; default 5s
    op.WithCIBADefaultExpiresIn(10 * time.Minute),  // optional; default 10min
    op.WithCIBAMaxExpiresIn(15 * time.Minute),      // optional cap on `requested_expiry`
    op.WithCIBAMaxPollViolations(8),                // optional; the default is 5
  ),

  op.WithStaticClients(op.ConfidentialClient{
    ID:         "pos-terminal",
    Secret:     posSecret,
    AuthMethod: op.AuthClientSecretBasic, // upgrade to private_key_jwt for FAPI-CIBA
    GrantTypes: []string{"urn:openid:params:grant-type:ciba"},
    Scopes:     []string{"openid", "profile"},
  }),
)
```

`op.WithCIBA(...)` does three things:

1. Mounts `/bc-authorize` at the configured endpoint path.
2. Registers the CIBA URN (`urn:openid:params:grant-type:ciba`) at `/token`.
3. Advertises `backchannel_authentication_endpoint`, `backchannel_token_delivery_modes_supported: ["poll"]`, and `backchannel_user_code_parameter_supported: false` in discovery. When JAR is also enabled, discovery adds `backchannel_authentication_request_signing_alg_values_supported`.

The CIBA substore (`store.CIBARequestStore`) is required. The in-memory, SQL, and DynamoDB adapters each ship one; the SQL adapter persists to the `oidc_ciba_requests` table on sqlite, mysql, and postgres. The Redis adapter returns `nil` for this substore, so on a Redis-based deployment route `CIBARequests` to a durable tier (SQL or in-memory) through the composite adapter. `op.New` requires both `Store.CIBARequests()` and a `HintResolver`, whether the grant is activated with `op.WithCIBA(...)` or with `op.WithGrants(grant.CIBA, ...)`.

`op.New` also refuses a negative `WithCIBADefaultExpiresIn` or `WithCIBAPollInterval`, a `WithCIBADefaultExpiresIn` above `WithCIBAMaxExpiresIn`, and, under `profile.FAPICIBA`, a default or maximum expiry above 10 minutes. A zero value means "use the library default" (600 seconds and 5 seconds).

## Implementing `HintResolver`

CIBA requires the OP to know **which user** the embedder's approval service should address before any approval can happen. `op.WithCIBAHintResolver(...)` is mandatory — calling `WithCIBA` without it fails at `op.New`:

::: details `login_hint` vs `id_token_hint` vs `login_hint_token` — what's the difference?
CIBA gives the consumption device three shapes for naming the user. **`login_hint`** is a free-form string the embedder interprets — email, account number, loyalty card. **`id_token_hint`** is a previously issued ID token. The OP verifies its signature against the OP keyset, its issuer, its `typ` header (a logout token or access token is refused), and that its audience is the authenticated client, then passes only the verified `sub` to your resolver. The OP does not enforce the hint token's expiry, because a terminal legitimately holds ID tokens from sessions that ended long ago. A pairwise client is rejected before the resolver because its `sub` is a per-sector pseudonym; use `login_hint` or `login_hint_token` for that client. **`login_hint_token`** is a signed JWT minted by some upstream system you trust (a federation IdP, a corporate directory) — your resolver verifies its signature, issuer, and audience according to that system's contract and maps it to a subject. The resolver must never parse the raw `id_token_hint` JWT.
:::

::: details `HintResolver` — what's that?
The interface the OP calls once per `/bc-authorize` to turn your identifier for a person into a stable internal `sub`. Every deployment has its own user table, so the OP cannot do this itself. `Resolve(ctx, kind, value)` returns the subject string, `op.ErrUnknownCIBAUser` for an unknown user (wire code `unknown_user_id`), or any other error for a failed lookup (wire code `login_required`). An empty subject also becomes `login_required`.
:::

```go
type myHintResolver struct{ /* db handle */ }

func (r *myHintResolver) Resolve(ctx context.Context, kind op.HintKind, value string) (string, error) {
    switch kind {
    case op.HintLoginHint:
        // value = "alice@example.com", account number, loyalty card, ...
        sub, err := r.lookupBy(ctx, value)
        if errors.Is(err, sql.ErrNoRows) {
            return "", op.ErrUnknownCIBAUser // → wire response: unknown_user_id
        }
        if err != nil {
            return "", err // → wire response: login_required
        }
        return sub, nil
    case op.HintIDTokenHint:
        // value is the subject from an OP-verified id_token_hint, not a JWT.
        // The OP checked signature + iss + aud, but intentionally not exp.
        return lookupSubject(ctx, value)
    case op.HintLoginHintToken:
        // value is a signed JWT issued by another upstream system you trust.
        // Verify its signature against your registered key and read its
        // `sub` claim.
        return r.verifyLoginHintToken(ctx, value)
    }
    return "", op.ErrUnknownCIBAUser
}
```

::: warning Resolver is on the request hot path
`Resolve` is called once per `/bc-authorize` POST. Cache the lookup if your backing store is remote — the approval-notification path waits on this call.
:::

`op.HintResolverFunc` adapts a plain function into a `HintResolver`.

## The authentication-device callback

The OP does not own the channel that delivers the prompt to the user's phone; that is between your notification service and the user's app. The library's surface is the substore: when the user's app reports back, your callback handler calls `CIBARequestStore.Approve` (or `Deny`) **on the same store (`*inmem.Store` or another adapter) that you passed to `op.WithStore`**. The OP does not re-export its store, so keep your own reference.

```go
// st is the same store passed to op.WithStore(st). The embedder retains
// the reference; there is no provider.Store() accessor.
func handleApproval(w http.ResponseWriter, r *http.Request, st *inmem.Store) {
    authReqID := r.FormValue("auth_req_id")
    decision  := r.FormValue("decision") // "approve" or "deny"
    sub       := mustExtractSubFromAppSession(r)

    switch decision {
    case "approve":
        // acr is the Authentication Context Class Reference the
        // authentication device actually satisfied. The token endpoint
        // stamps it verbatim onto id_token.acr; it is independent of the
        // acr_values the consumption device requested at /bc-authorize,
        // and may be left "" when the deployment has no ACR vocabulary.
        // authTime is the wall-clock when the user authenticated on the
        // authentication device. Token endpoint stamps id_token.auth_time
        // from it (omit-on-zero); clients that registered RequireAuthTime
        // enforce the gate against this value.
        acr := "" // or the ACR the authentication device satisfied
        if err := st.CIBARequests().Approve(r.Context(), authReqID, sub, acr, time.Now()); err != nil {
            http.Error(w, "approve failed", 500)
            return
        }
    case "deny":
        if err := st.CIBARequests().Deny(r.Context(), authReqID, "user_denied"); err != nil {
            http.Error(w, "deny failed", 500)
            return
        }
    }
    w.WriteHeader(204)
}
```

The next `/token` poll from the consumption device succeeds, or returns `access_denied` after a deny. The subject you pass to `Approve` must be the one the `HintResolver` returned, and it must still exist in the user store: the token endpoint checks it on every redemption.

## binding_message

The consumption device sends `binding_message` on every `/bc-authorize` request. The OP stores it on the request record (`CIBARequest.BindingMessage`), so your notification service can show the authentication device the same string the cashier sees:

```sh
curl -s -u pos-terminal:<secret> \
  -d 'scope=openid profile' \
  -d 'login_hint=alice' \
  -d 'binding_message=Approve $80.00 at Acme Coffee, terminal #14' \
  https://op.example.com/oidc/bc-authorize
```

The OP trims the value, rejects one longer than 50 characters or containing a control character with `400 invalid_binding_message`, and stores the raw text rather than an HTML-escaped copy. Escape it when you render it in the authentication-device UI. Do not pre-escape before sending it to `/bc-authorize`, or transaction text containing `&`, `<`, `>`, `"`, or `'` stops matching what the cashier saw.

`scope` is required and must include `openid`. `/bc-authorize` splits it on any Unicode whitespace to tolerate lenient clients, but do not depend on tabs or newlines, because `/auth` and `/par` accept only the space-separated form (under an `/oidc` mount, `/oidc/auth`).

A successful request returns `auth_req_id`, `expires_in`, and `interval`. Exactly one of `login_hint`, `id_token_hint`, and `login_hint_token` must be present.

## RFC 8707 `resource=`

Consumption devices may pin the issued access token to a resource server by sending `resource=<absolute URI>` on `/bc-authorize`. The endpoint applies the same rules as `/auth` and `/token`:

- The value MUST be an absolute URI (RFC 8707 §2). Relative URIs are rejected with `400 invalid_target`.
- The canonical form (lowercase scheme and host, trailing slash stripped) MUST appear in the client's registered `Resources` allowlist. A resource the client was never registered for is refused with `400 invalid_target`.
- Multiple non-empty `resource=` values are rejected with `400 invalid_target`, because a CIBA request carries a single audience and the OP will not silently drop the others.

Register every resource server URI a consumption device may request in the client's `Resources` first.

## Sender-constrained CIBA records

When DPoP or mTLS is used, `/bc-authorize` records the DPoP key thumbprint and/or the mTLS certificate thumbprint. At `/token`, the OP checks every binding on the record again before issuing a token. A request with both bindings needs both a matching DPoP proof and a matching mTLS certificate; one is not enough. A missing or mismatched proof makes the `auth_req_id` unredeemable (`400 invalid_grant`). On success, the token's `cnf` carries every binding the OP rechecked.

## `amr` and `acr` in the CIBA id_token

The id_token issued at the end of a CIBA flow carries the `acr` that the authentication device actually satisfied, which is the `acr` argument your callback passes to `CIBARequestStore.Approve`. It is not taken from the requested `acr_values`, and it is empty when the callback passes `""` (the expected choice for a deployment with no comparable ACR vocabulary). **`amr` is never populated**, because the CIBA request record carries no verified authentication-method signal; OIDC Core §2 treats `acr` and `amr` as separate claims. An RP that reads `amr` from a CIBA id_token should treat it as absent.

A redeemed request also records a consent grant for that client and subject. The tokens then resolve their subject at introspection and `/userinfo` (the pairwise value for a pairwise client), and a later `/auth` request for the same scopes can skip the consent screen.

## FAPI-CIBA profile

`op.WithProfile(profile.FAPICIBA)` pins:

- `RequiredFeatures` = `[JAR]` — `/bc-authorize` requests must be JWT-Secured (RFC 9101).
- `RequiredGrants` = `[CIBA]` — `op.New` fails if the CIBA grant is not enabled; the profile does not enable it for you.
- `RequiredAnyOf` = `[[DPoP, MTLS]]` — sender constraint is mandatory; DPoP is selected by default unless the deployment explicitly enables mTLS.
- `MaxAccessTokenTTL` = 10 min.
- Client authentication = `private_key_jwt` (`client_secret_basic` rejected). mTLS may satisfy the sender-constraint requirement when `feature.MTLS` is configured, but not the `/token` client-auth method.
- `RequiresAccessTokenRevocation` = true.
- JAR enforcement on `/bc-authorize`: `iss` / `aud` / `exp` / `nbf` / `iat` / `jti` are all required; the library's `MaxRequestObjectAge` also caps the request object's `iat` age at 60 minutes. That is a library verification bound. Separately, FAPI-CIBA-ID1 §5.2.2 item 9 limits the signed authentication request's `nbf`/`exp` lifetime to 60 minutes; this is not FAPI 2.0 Message Signing Final §5.6, whose text covers ID-token signing. FAPI 2.0 Baseline and Message Signing keep `jti` optional; FAPI-CIBA opts into the stricter shape.
- `requested_expiry > 600s` is a hard `invalid_request` under this library's FAPI-CIBA setting. The 10-minute ceiling comes from the historical FAPI-CIBA-ID1 profile and this library's constraints, not a section of the final FAPI 2.0 Security Profile. Vanilla CIBA keeps the silent-clamp posture.
- Every client-attributable JAR failure at `/bc-authorize` (signature mismatch, unsupported alg, missing required claim, fetch failure on `request_uri`, …) maps to `400 invalid_request` per CIBA Core §13, which has no finer code than `/auth`'s `invalid_request_object`. A fault on the OP's side of fetching the client's keys (JWKS overloaded or temporarily failing) is `503 server_error` instead.

When `op.WithACRValuesSupported(...)` is non-empty, the endpoint checks each requested `acr_values` entry against the published list and answers `400 invalid_request` for an unknown one. With an empty list, any value is accepted as is.

## Polling responses

Same shape as the device-code grant:

| Wire response | Meaning |
|---|---|
| `400 authorization_pending` | User has not approved yet. Poll again after the negotiated interval. |
| `400 slow_down` | Polled too fast. Honour the raised interval (the server stores it). |
| `400 access_denied` | The user denied, an admin revoked the request, or the poll-abuse cap (`WithCIBAMaxPollViolations`, default 5) tripped. Stop polling. |
| `400 expired_token` | `auth_req_id` outlived its lifetime (TTL elapse only — RFC 6749 §5.2 / CIBA Core §11). Stop polling. |
| `400 invalid_grant` | `auth_req_id` was already redeemed, or a DPoP / mTLS binding on the request is missing or does not match. Do not retry with the same handle. |
| `200 { access_token, ... }` | Approved. |

The OP counts each poll made before the negotiated interval has elapsed as a strike against the `auth_req_id`. When the strikes reach the cap (default 5), the request is locked out: every later poll returns `400 access_denied`, and the `ciba.poll_abuse.lockout` audit event is recorded. `op.WithCIBAMaxPollViolations(n uint8)` changes the cap; `n=0` means the library default, and `n=255` effectively disables the lockout, which suits only diagnostic builds.

::: info Duplicate single-valued parameters at `/bc-authorize`
A request that repeats `client_id`, `login_hint`, `id_token_hint`, `login_hint_token`, `binding_message`, `requested_expiry`, `acr_values`, `scope`, `user_code`, or `client_assertion` is refused with `400 invalid_request` per CIBA Core §13. Only `resource=` (RFC 8707) may appear more than once. The token endpoint, `/end_session`, and `/revoke` apply the same rule to their own single-valued parameters.
:::


## See it run

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos):

```sh
(cd examples/32-ciba-pos && GOWORK=off go run -tags example .)
```

A POS terminal posts to `/bc-authorize`, a goroutine standing in for the staff phone calls `CIBARequestStore.Approve` directly, and the POS polls until the OP issues the token. It takes about five seconds. Files: `op.go` (OP wiring + `HintResolver`), `rp.go` (POS-side polling), `device.go` (simulated phone approval).

## Read next

- [CIBA primer](/concepts/ciba) — the conceptual background.
- [Device Code wiring](/use-cases/device-code) — when the user's surface includes a screen with a typed code.
- [FAPI 2.0 baseline](/use-cases/fapi2-baseline) — the parent profile FAPI-CIBA inherits from.
