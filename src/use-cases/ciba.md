---
title: CIBA poll mode — wiring
description: Enable Client-Initiated Backchannel Authentication — /bc-authorize, HintResolver, FAPI-CIBA profile, embedder-owned authentication device.
---

# Use case — CIBA (Client-Initiated Backchannel Authentication)

For the conceptual background — what CIBA is, how it differs from device flow, why `binding_message` matters — read the [CIBA primer](/concepts/ciba) first. This page covers the wiring.

::: details Poll / ping / push delivery — what's the difference?
CIBA defines three ways for the OP to tell the consumption device "the user approved". **Poll** = the consumption device hits `/token` repeatedly until the answer arrives (same shape as device-code). **Ping** = the OP sends a notification webhook to a client-registered endpoint and the client then polls `/token`. **Push** = the OP sends the issued token directly to the client's webhook. v0.9.1 implements poll only — discovery advertises the supported list so a client cannot negotiate the others.
:::

::: details `auth_req_id` — what's that?
The opaque identifier `/bc-authorize` returns to the consumption device. It is the CIBA equivalent of `device_code` — the device keeps it private and submits it on every `/token` poll. Unlike device-code there is no separate user-visible code; the user's authentication device gets the prompt directly via push notification, so the consumption device only needs the polling handle.
:::

::: details `binding_message` — what's that?
A short human-readable string the consumption device sends in `/bc-authorize` and the OP forwards to the authentication device's prompt. The cashier's POS shows "Approve $80.00 at Acme Coffee, terminal #14"; the user's phone shows the same string in the approve dialog. This is the only signal the user has that the prompt is genuinely for the transaction in front of them — without it, a phisher who triggered an unrelated CIBA request could trick a user into approving on a vague "Approve sign-in?" dialog. Treat it as required even though the spec says optional.
:::

::: warning Poll mode only in v0.9.1
The library implements **poll** delivery. Push and ping delivery modes are deferred to v2+; discovery advertises `backchannel_token_delivery_modes_supported: ["poll"]` exclusively so a client cannot negotiate them. If your design needs push or ping, the OP in this release is not the right choice.
:::

## Enabling CIBA

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()), // ships a CIBARequestStore substore
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithCIBA(
    op.WithCIBAHintResolver(myHintResolver),
    op.WithCIBAPollInterval(5 * time.Second),       // optional; default 5s
    op.WithCIBADefaultExpiresIn(10 * time.Minute),  // optional; default 10min
    op.WithCIBAMaxExpiresIn(15 * time.Minute),      // optional cap on `requested_expiry`
    op.WithCIBAMaxPollViolations(8),                // optional; raise above the 5-strike default
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

The CIBA substore (`store.CIBARequestStore`) is required: the in-memory adapter ships one; SQL / Redis adapters land in v0.9.2. `op.New` enforces this whether the grant is activated via `op.WithCIBA(...)` or via `op.WithGrants(grant.CIBA, ...)` — both code paths require `Store.CIBARequests()` and a `HintResolver` to be wired before construction succeeds.

## Implementing `HintResolver`

CIBA requires the OP to know **which user** to push to before any approval can happen. `op.WithCIBAHintResolver(...)` is mandatory — calling `WithCIBA` without it fails at `op.New`:

::: details `login_hint` vs `id_token_hint` vs `login_hint_token` — what's the difference?
CIBA gives the consumption device three shapes for naming the user. **`login_hint`** is a free-form string the embedder interprets — email, account number, loyalty card. **`id_token_hint`** is a previously issued ID token; the OP validates its signature, issuer, audience, and expiry before handing the value to your resolver. **`login_hint_token`** is a signed JWT minted by some upstream system you trust (a federation IdP, a corporate directory) — your resolver verifies its signature against the registered key and reads `sub`. The OP routes inbound requests to the right `HintKind` so your resolver only needs one branch per shape.
:::

::: details `HintResolver` — what's that?
The interface the OP calls once per `/bc-authorize` to translate "the embedder's idea of who this is" into a stable internal `sub`. The OP cannot guess this — every embedder has its own user table. `Resolve(ctx, kind, value)` returns the subject string (or `op.ErrUnknownCIBAUser` for unknown / `login_required` for transient lookup errors). It runs on the request hot path, so cache lookups against remote stores.
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
        // value is a previously issued ID token; the OP has already validated
        // its signature + iss + aud + exp before calling Resolve. Pull sub.
        return claimsSubject(value), nil
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
`Resolve` is called once per `/bc-authorize` POST. Cache the lookup if your backing store is remote — every push notification waits on this call.
:::

For one-off / functional use, `op.HintResolverFunc` adapts a plain function into a `HintResolver`.

## The authentication-device callback

The OP does not own the channel that pushes the prompt to the user's phone — that's a cooperation between the embedder's notification service and the user's app. The library's surface is the substore: when the user's app reports back, the embedder's callback handler calls `CIBARequestStore.Approve` (or `Deny`) directly **on the same `*inmem.Store` (or other adapter) the embedder passed to `op.WithStore`** — there is no `provider.Store()` accessor; the OP does not re-export the store, the embedder is expected to retain the reference.

```go
// st is the same store passed to op.WithStore(st). The embedder retains
// the reference; there is no provider.Store() accessor.
func handleApproval(w http.ResponseWriter, r *http.Request, st *inmem.Store) {
    authReqID := r.FormValue("auth_req_id")
    decision  := r.FormValue("decision") // "approve" or "deny"
    sub       := mustExtractSubFromAppSession(r)

    switch decision {
    case "approve":
        // authTime is the wall-clock when the user authenticated on the
        // authentication device. Token endpoint stamps id_token.auth_time
        // from it (omit-on-zero); clients that registered RequireAuthTime
        // enforce the gate against this value.
        if err := st.CIBARequests().Approve(r.Context(), authReqID, sub, time.Now()); err != nil {
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

The next `/token` poll from the consumption device will succeed (or return `access_denied`).

## binding_message

Pass `binding_message` from the consumption device on every `/bc-authorize` post. The OP forwards it through the substore record so the authentication-device push can render the same string the cashier sees:

```sh
curl -s -u pos-terminal:<secret> \
  -d 'scope=openid profile' \
  -d 'login_hint=alice' \
  -d 'binding_message=Approve $80.00 at Acme Coffee, terminal #14' \
  https://op.example.com/oidc/bc-authorize
```

This is the user's only defense against a CIBA phishing flow. Treat it as required in the embedder UX even though the spec marks it optional.

## RFC 8707 `resource=`

Consumption devices may pin the issued access token to a resource server by sending `resource=<absolute URI>` on `/bc-authorize`. The endpoint enforces the same gate as `/authorize` and `/token`:

- The value MUST be an absolute URI (RFC 8707 §2). Relative URIs are rejected with `400 invalid_target`.
- The canonical form (lowercase scheme + host, trailing slash stripped) MUST appear in the client's registered `Resources` allowlist; a request that names a resource the client was never registered for is refused with `400 invalid_target`.
- Multiple non-empty `resource=` values are rejected with `400 invalid_target`. The CIBA issuance pipeline encodes a single audience entry today; multi-aud support is deferred.

::: warning Pre-v0.9.x silently accepted unregistered resources on `/bc-authorize`
Earlier releases checked only that `resource=` parsed as an absolute URI. Embedders relying on the lenient behaviour MUST extend the client's `Resources` allowlist to include the value, or stop sending `resource=`.
:::

## `amr` and `acr` in the CIBA id_token

The id_token issued at the end of a CIBA flow stamps `acr` from `ACRValues[0]` (when non-empty) so RPs can read the requested authentication context class. **`amr` is not populated** in v0.9.x — earlier builds copied the requested `acr_values` slice into `amr`, which mis-stated which authentication methods the user's device actually satisfied. OIDC Core §2 defines `acr` and `amr` as distinct concepts with no defined synonymy, and the v0.9.x CIBARequest substore does not yet surface a real authentication-method signal.

If your RP currently reads `amr` from a CIBA id_token, expect an empty / absent claim until a substore extension lands that supplies real method strings.

## FAPI-CIBA profile

`op.WithProfile(profile.FAPICIBA)` graduates from placeholder to enforced in v0.9.1. Activating it pins:

- `RequiredFeatures` = `[JAR]` — `/bc-authorize` requests must be JWT-Secured (RFC 9101).
- `RequiredAnyOf` = `[[DPoP, MTLS]]` — sender constraint is mandatory; DPoP is selected by default unless the deployment explicitly enables mTLS.
- `MaxAccessTokenTTL` = 10 min.
- Client authentication = `private_key_jwt` / `tls_client_auth` / `self_signed_tls_client_auth` (the FAPI 2.0 set; `client_secret_basic` rejected).
- `RequiresAccessTokenRevocation` = true.
- JAR enforcement on `/bc-authorize`: `iss` / `aud` / `exp` / `nbf` / `iat` / `jti` are all required; the request-object lifetime is capped at 60 minutes (FAPI 2.0 Message Signing §5.6). FAPI 2.0 Baseline and Message Signing keep `jti` optional (the v0.9.x relaxation that admits jti-less request objects under FAPI applies to those two profiles only); FAPI-CIBA opts back into the strict shape.
- `requested_expiry > 600s` is a hard `invalid_request` (FAPI-CIBA-ID1 §5 / FAPI 2.0 §3.1.9 ten-minute cap). Vanilla CIBA keeps the silent-clamp posture.
- Every JAR failure at `/bc-authorize` (signature mismatch, unsupported alg, missing required claim, fetch failure on `request_uri`, …) maps to `400 invalid_request` per CIBA Core §13. The vanilla `/authorize` JAR pipeline keeps its richer error vocabulary; CIBA collapses it because the spec leaves no room for a finer breakdown on the back-channel surface.

When `op.WithACRValuesSupported(...)` is non-empty, the endpoint validates each requested `acr_values` entry against the published list. Empty list keeps the legacy permissive posture.

## Polling responses

Same shape as the device-code grant:

| Wire response | Meaning |
|---|---|
| `400 authorization_pending` | User has not approved yet. Poll again after the negotiated interval. |
| `400 slow_down` | Polled too fast. Honour the elevated interval (server persists it). |
| `400 access_denied` | User denied, admin revoked, or the poll-abuse cap (`WithCIBAMaxPollViolations`, default 5) tripped. Stop polling. |
| `400 expired_token` | `auth_req_id` outlived its lifetime (TTL elapse only — RFC 6749 §5.2 / CIBA Core §11). Stop polling. |
| `400 invalid_grant` | `auth_req_id` was already redeemed. The grant is gone; do not retry with the same handle. |
| `200 { access_token, ... }` | Approved. |

The OP tracks "polled before the negotiated interval elapsed" as a strike against the `auth_req_id`. Once the strike count reaches the cap (default 5), the request is locked out — every subsequent poll returns `400 access_denied` and the `ciba.poll_abuse.lockout` audit event fires. `op.WithCIBAMaxPollViolations(n uint8)` raises or lowers the cap when a profile or conformance harness demands more headroom; `n=0` falls back to the library default, `n=255` effectively disables the lockout for diagnostic builds.

::: info Duplicate single-valued parameters at `/bc-authorize`
A request that repeats `client_id`, `login_hint`, `id_token_hint`, `login_hint_token`, `binding_message`, `requested_expiry`, `acr_values`, `scope`, `user_code`, or `client_assertion` is refused with `400 invalid_request` per CIBA Core §13. Only RFC 8707 `resource=` may legitimately appear more than once. The token endpoint, `/end_session`, and `/revoke` apply the same rule to their respective single-valued parameters.
:::


## See it run

[`examples/32-ciba-pos`](https://github.com/libraz/go-oidc-provider/tree/main/examples/32-ciba-pos):

```sh
go run -tags example ./examples/32-ciba-pos
```

A POS terminal posts to `/bc-authorize`; a goroutine standing in for the staff phone calls `CIBARequestStore.Approve` directly; the POS polls until the OP issues the token. End-to-end ≈ 5 seconds. Files: `op.go` (OP wiring + `HintResolver`), `rp.go` (POS-side polling), `device.go` (simulated phone approval).

## Read next

- [CIBA primer](/concepts/ciba) — the conceptual background.
- [Device Code wiring](/use-cases/device-code) — when the user's surface includes a screen with a typed code.
- [FAPI 2.0 baseline](/use-cases/fapi2-baseline) — the parent profile FAPI-CIBA inherits from.
