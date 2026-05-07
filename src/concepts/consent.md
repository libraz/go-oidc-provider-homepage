---
title: Consent
description: When the consent screen is shown, when it is skipped, what first-party clients change, and what the audit trail records.
---

# Consent

**Consent** is the user's explicit "yes, this app may have these scopes." OIDC Core 1.0 §3.1.2.4 leaves the timing conditional ("the OP MUST obtain authorization information from the End-User"), but the default in this library is to show a consent screen the first time a client requests a scope set, and to remember the answer.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4 (consent), §3.1.2.1 (`prompt`)
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §3.3 (scope), §6 (refresh)
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — Token Revocation
:::

::: tip Mental model
- A **grant** is a row recording "user U authorised client C for scopes S at time T."
- The first authorize flow that needs scopes outside any existing grant produces a **consent prompt**.
- Subsequent flows inside the same scope set **skip** the prompt.
- Adding a new scope (a **scope delta**) brings the prompt back, asking only for the delta.
- Revoking a grant clears the row and forces the next authorize flow to prompt again.
:::

## When consent is shown

The library evaluates four cases on every authorize flow.

| Case | Behaviour |
|---|---|
| **First-time grant** — no prior `Grant` for this `(subject, client_id)` pair. | Prompt. The user sees the full scope list. On submit, the library writes a `Grant` row with the approved scopes. |
| **Scope delta** — a `Grant` exists but the requested scope set adds a scope not previously approved. | Prompt, with the delta highlighted. The user can approve the delta, deny it, or deny everything. On approve, the row is updated. |
| **Forced re-prompt** — the request carries `prompt=consent`. | Prompt regardless of grant state. OIDC §3.1.2.1 mandates this. |
| **Existing grant covers the request** — `Grant` row already covers every requested scope and `prompt` is `none` or `login` (not `consent`). | Skipped. The library proceeds straight to authorization-code emission and emits `op.AuditConsentSkippedExisting`. |

::: details `prompt=none`, `prompt=login`, `prompt=consent` — what's the difference?
- `prompt=none` — "if the user is signed in and consent is already in place, complete the flow silently. Otherwise return an error." Used by SPAs for silent re-auth.
- `prompt=login` — "force the user to re-authenticate, even if a valid session exists." Does not by itself force a consent re-prompt.
- `prompt=consent` — "force the consent screen, even if a grant already covers the scopes." Useful when the RP wants the user to re-confirm before a sensitive operation.

The library applies these per OIDC Core 1.0 §3.1.2.1. Combining `prompt=none` with `prompt=login` is rejected as `interaction_required`.
:::

## First-party clients

Some embedders run a small set of trusted apps — a flagship web client, an internal admin console, the company mobile app — where the operator has pre-approved the scope catalogue at deployment time and the consent screen would only annoy the user. For these clients, `op.WithFirstPartyClients(ids ...string)` lets named `client_id` values **skip** the consent prompt, regardless of whether a `Grant` row exists, as long as the requested scopes are in the operator's pre-approved catalogue.

Two important notes:

1. **The skip is recorded.** The library writes the `Grant` row anyway and emits `op.AuditConsentGrantedFirstParty` so the audit trail still answers "what scopes did this user end up authorising?" — the only thing that changed is that the user did not see the screen.
2. **`prompt=consent` overrides the skip.** A first-party client that explicitly requests `prompt=consent` still gets the prompt. The skip is for the silent default path; the override stays available.

See the [first-party use case](/use-cases/first-party) for the complete wiring including the operator-side scope catalogue.

::: warning First-party is operator-asserted, not user-asserted
The user does not see "this is a first-party app" in the consent flow. The trust comes from the operator listing the `client_id` in `op.WithFirstPartyClients(...)`. Do not list a client whose code path you do not control end-to-end — that turns the skip into an unannounced scope grant.
:::

## How the library invokes consent UI

When a prompt is needed, the library hands control to the embedder-supplied `op.ConsentUI` template (registered via `op.WithConsentUI(...)`). The template renders HTML; the library handles state, CSRF, the `__Host-oidc_csrf` double-submit cookie, and persistence.

```go
op.WithConsentUI(op.ConsentUI{
    Template: myConsentTemplate, // *template.Template
})
```

The template receives the requested scopes (and any deltas relative to an existing grant), the `client_id`, the optional client logo / display name from the client metadata, and the CSRF token to embed in the form. On `POST` from the form, the library validates the CSRF, parses the approved scope set, writes the `Grant` row, and continues the authorize flow.

For SPAs that render consent client-side (e.g. inside a React shell that already drives the login form), use `op.WithSPAUI(...)` when the OP should also mount the shell and static assets. In that mode the browser lands on `LoginMount/{uid}` and the SPA fetches prompt state from `LoginMount/state/{uid}`. If your own router serves the shell, use the lower-level `op.WithInteractionDriver(interaction.JSONDriver{})` path instead; then the state endpoint remains `/interaction/{uid}`.

`WithSPAUI` and `WithConsentUI` are mutually exclusive because they both own the consent rendering surface. The constructor refuses both at once. See the [SPA custom interaction use case](/use-cases/spa-custom-interaction) for the route shapes and trade-off.

## Consent revocation

A user (or admin) can revoke a grant at any time. Revocation flows through two paths:

1. **`/revoke` (RFC 7009)** — invalidates a single token (refresh or access). This does not touch the underlying `Grant` row; the next authorize flow with the same scopes still finds the grant and skips consent.
2. **Grant revocation** — flips the `Grant` row's `Revoked` column. The library cascades through the `Grants` and `AccessTokens` substores: every refresh token in the grant's chain is invalidated, every access token shadow row flips to revoked, and JWT ATs become inactive at every OP-served boundary (`/userinfo`, `/introspect`). The user's next authorize flow finds no covering grant and re-prompts.

The cascade is implemented across `internal/revokeendpoint`, `op/store/grant_revocation.go`, and `op/store/cascade.go`. Each leg emits its own audit event so dashboards can reconstruct what happened. The end-session cascade ([sessions and logout](/concepts/sessions-and-logout#end-session-cascade)) reuses the same machinery.

## Audit events

The token endpoint and consent flow emit five consent-related audit events through `op.WithAuditLogger`:

| Event | Fires on |
|---|---|
| `op.AuditConsentGranted` | User submitted the consent form and a `Grant` row was written. |
| `op.AuditConsentGrantedFirstParty` | First-party auto-consent applied (no prompt shown). |
| `op.AuditConsentGrantedDelta` | Existing grant existed; the user approved a scope delta. |
| `op.AuditConsentSkippedExisting` | Existing grant covered the request; the prompt was skipped. |
| `op.AuditConsentRevoked` | Grant flipped to `Revoked`. |

Together they let an SOC dashboard distinguish "this user explicitly clicked through consent" from "this client got consent on a silent path that the operator pre-approved" — useful when reviewing why a particular `Grant` row exists.

## Read next

- [Use case: first-party clients](/use-cases/first-party) — operator-side scope catalogue, `op.WithFirstPartyClients`, and the audit posture.
- [Use case: custom consent UI](/use-cases/custom-consent-ui) — wiring `op.ConsentUI`, the template contract, and CSRF handling.
- [Reference: audit events](/reference/audit-events) — every audit event the library emits, with the matching extras.
