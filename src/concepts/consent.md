---
title: Consent
description: Consent prompting, scope narrowing, RAR coverage, first-party skips, and the audit events this library actually emits.
pageClass: pg-concepts-consent
---

# Consent

**Consent** is the user's explicit "yes, this app may have these scopes." OIDC Core 1.0 §3.1.2.4 leaves the timing open; it only requires that the OP obtain an authorization decision before releasing information. This library shows a consent screen the first time a client requests a scope set, and remembers the answer.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4 (consent), §3.1.2.1 (`prompt`)
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §3.3 (scope), §6 (refresh)
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — Token Revocation (§2.1 cascade)
:::

::: tip Mental model
- A **grant** is a record of "user U authorised client C for scopes S", keyed by the pair `(subject, client_id)`.
- The first authorize flow that needs scopes outside any existing grant shows a **consent prompt**.
- Later flows inside the same scope set **skip** the prompt.
- Adding a new scope (a **scope delta**) brings the prompt back, asking only for the delta.
- Revoking a grant deletes the record, so the next authorize flow prompts again.
:::

## When consent is shown

On every authorize flow the OP evaluates the four cases below, in the order the figure shows.

<figure class="fig">
  <div class="fig-head">Consent is shown on any of three triggers, else skipped</div>
  <svg class="fig-svg" role="img" aria-labelledby="consent-decision-title" viewBox="0 0 960 456" xmlns="http://www.w3.org/2000/svg">
    <title id="consent-decision-title">Three gates decide whether consent is shown: an explicit prompt=consent, no existing grant for this subject and client, or a requested scope outside the existing grant. If none of them fires, the existing grant already covers the request and the authorization code is minted without a prompt.</title>
    <!-- gate 1 -->
    <rect class="fg-box" x="32" y="24" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="52">the request carries</text>
    <text class="fg-m" x="48" y="76">prompt=consent</text>
    <path class="fg-edge" d="M464,60 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="50" text-anchor="middle">yes</text>
    <rect class="fg-box" x="560" y="24" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="52">Forced re-prompt</text>
    <text class="fg-xs" x="576" y="76">ask again even if a grant covers it</text>
    <path class="fg-edge" d="M248,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="121">no</text>
    <!-- gate 2 -->
    <rect class="fg-box" x="32" y="136" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="164">no existing grant for</text>
    <text class="fg-m" x="48" y="188">(subject, client_id)</text>
    <path class="fg-edge" d="M464,172 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="162" text-anchor="middle">yes</text>
    <rect class="fg-box" x="560" y="136" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="164">First-time grant</text>
    <text class="fg-xs" x="576" y="188">show consent and record what was agreed</text>
    <path class="fg-edge" d="M248,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="233">no</text>
    <!-- gate 3 -->
    <rect class="fg-box" x="32" y="248" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="276">a requested scope is outside the grant</text>
    <text class="fg-xs" x="48" y="300">the existing grant does not cover it</text>
    <path class="fg-edge" d="M464,284 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="274" text-anchor="middle">yes</text>
    <rect class="fg-box" x="560" y="248" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="276">Scope delta</text>
    <text class="fg-xs" x="576" y="300">consent for the difference only</text>
    <path class="fg-edge" d="M248,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="345">no</text>
    <!-- outcome -->
    <rect class="fg-box fg-box--accent" x="32" y="360" width="896" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="388">The existing grant already covers the request</text>
    <text class="fg-xs" x="48" y="412">no prompt — the OP mints the authorization code and redirects straight back</text>
  </svg>
  <figcaption class="fig-note">Only the third gate looks at scope. That is why adding one scope to an existing integration re-prompts every user: the request no longer fits the grant they gave, and the OP will not widen a grant it was never asked about.</figcaption>
</figure>

| Case | Behaviour |
|---|---|
| **First-time grant** — no prior `Grant` for this `(subject, client_id)` pair. | Prompt. The user sees the full scope list. On submit, the library writes a `Grant` row with the approved scopes. |
| **Scope delta** — a `Grant` exists but the requested scope set adds a scope not previously approved. | Prompt, with the delta highlighted. The user can approve the delta, deny it, or deny everything. On approve, the row is updated. |
| **Forced re-prompt** — the request carries `prompt=consent`. | Prompt regardless of grant state. OIDC §3.1.2.1 mandates this. |
| **Existing grant covers the request** — `Grant` row already covers every requested scope and every requested `authorization_details` element, and `prompt` is absent, `none`, or `login` (never `consent`). | Skipped. The library proceeds straight to authorization-code emission. There is no dedicated "skipped" audit event. |

A grant does not have to come from the consent screen. A device-code, CIBA, or token-exchange redemption records a `store.Grant` for the client it serves, and `/auth` counts that grant as consent: a later request for the same scopes skips the screen.

Skipping consent does not skip authentication rules. Before minting from an existing session, `/auth` evaluates the `LoginFlow` rules and the `Decider` as if the chain had just completed `Primary`. If a `RuleClient` or `RuleScope` step-up applies, the request runs that step first, and `prompt=none` answers `interaction_required` instead. Both the covering-grant path and the first-party skip below go through this check.

::: details `prompt=none`, `prompt=login`, `prompt=consent` — what's the difference?
- `prompt=none` — "if the user is signed in and consent is already in place, complete the flow silently. Otherwise return an error": `login_required`, `consent_required`, or `interaction_required`. Used by SPAs for silent re-auth.
- `prompt=login` — "force the user to re-authenticate, even if a valid session exists." Does not by itself force a consent re-prompt.
- `prompt=consent` — "force the consent screen, even if a grant already covers the scopes." Useful when the RP wants the user to re-confirm before a sensitive operation.

The library applies these per OIDC Core 1.0 §3.1.2.1. Combining `prompt=none` with `prompt=login` is rejected as `invalid_request`.
:::

## Re-checking coverage for the terminal subject

The initial coverage check uses the subject available when authorization starts. `prompt=login`, a stale `max_age`, or an RFC 9470 step-up can run authentication that ends with a different subject; the account chooser can also switch accounts. Before issuing an authorization code, the library rechecks the requested scopes and `authorization_details` against the terminal subject's own grant. If that grant does not cover the request, the earlier subject's grant cannot authorize it: the flow obtains consent for the terminal subject or ends without issuing a code.

## Authentication context on consent-only issuance

When no credential factor runs and the live session still exists, the authorization code and grant preserve that session's `auth_time`, `acr`, and `amr`. Answering the consent prompt does not replace `auth_time`, and an empty factor set does not clear `acr` or `amr`. If the session has expired, was signed out, or switched away and no live context remains, the request is refused with `login_required` rather than receiving an invented authentication context.

## First-party clients

Some embedders run a small set of trusted apps — a flagship web client, an internal admin console, the company mobile app — where the consent screen would only annoy the user. `op.WithFirstPartyClients(ids ...string)` lets the named `client_id` values **skip** the consent prompt, whether or not a `Grant` exists yet. Every listed ID must also be registered through `op.WithStaticClients`, and the skip applies only to statically seeded or admin-created clients, never to dynamically registered ones.

The skip applies only when all of these hold:

- The user already has a session. The skip never invents a subject.
- The request does not carry `prompt=consent`, which always shows the screen.
- The scopes do not include `offline_access`, and the request carries no `authorization_details` and no Grant Management action. Those always get an explicit screen.
- The browser sends `Sec-Fetch-Site: same-origin`, or `same-site` with an `Origin` or `Referer` that matches the `redirect_uri` origin. A cross-site navigation never skips.

Two more notes:

1. **The skip is recorded.** The library writes the `Grant` row anyway and emits `op.AuditConsentGrantedFirstParty`, so the audit trail still answers "what scopes did this user end up authorising?" The only change is that the user did not see the screen.
2. **FAPI 2.0 profiles refuse the option.** Combining `WithFirstPartyClients` with `profile.FAPI2Baseline` or `profile.FAPI2MessageSigning` fails `op.New`.

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

The template receives the client (ID, display name, logo, and the other client metadata), the requested scopes (and any deltas relative to an existing grant), and the CSRF token to embed in the form. Scopes marked `Required` cannot be deselected. `ConsentUI.ContentSecurityPolicy` sets the page's CSP; the default forbids every subresource, so a branded template that loads a stylesheet, logo, or font must declare those origins. On `POST` from the form, the library validates the CSRF, parses the approved scope set, writes the `Grant` row, and continues the authorize flow. A tampered or stale submission is answered with a 4xx, and cancelling the screen redirects back with `access_denied`.

For RFC 9396 `authorization_details`, coverage uses deep equality: a new element or a changed member forces consent, even when the scope set is already covered. The built-in consent contract exposes scope approval; it has no separate per-detail approval or narrowing control. After ordinary consent, the requested details are persisted with the grant.

For SPAs that render consent client-side (e.g. inside a React shell that already drives the login form), use `op.WithSPAUI(...)` when the OP should also mount the shell and static assets. In that mode the browser lands on `LoginMount/{uid}` and the SPA fetches prompt state from `LoginMount/state/{uid}`. If your own router serves the shell, use the lower-level `op.WithInteractionDriver(interaction.JSONDriver{})` path instead; then the state endpoint remains `/interaction/{uid}`.

`WithSPAUI` and `WithConsentUI` are mutually exclusive because they both own the consent rendering surface. The constructor refuses both at once. See the [SPA custom interaction use case](/use-cases/spa-custom-interaction) for the route shapes and trade-off.

## Consent revocation

A user or operator can revoke consent at any time. There are three routes, and they reach different amounts:

| Route | What it retires | Grant record |
|---|---|---|
| **`/revoke`** (RFC 7009) with one token | That token. For a refresh token, its whole rotation chain and the access tokens issued under the grant; the grant's other refresh chains and unredeemed codes keep working. | Kept, so the next authorize flow still skips consent. |
| **Grant Management revoke** (`DELETE` on the grant) | Every access token and refresh token issued under the grant. | Deleted. The next authorize flow finds no covering grant and prompts again. |
| **`Provider.RevokeSubject(ctx, subject)`** | The same, for every grant the subject holds. Meant for disabling or deprovisioning a user. | Deleted. |

The three share one teardown, so JWT access tokens, opaque access tokens, and refresh tokens are retired the same way regardless of the entry point. Tokens issued by device-code, CIBA, and token-exchange redemptions sit under a grant and are reached too. Credentials from a custom grant are not, unless the handler records a grant.

Successful Grant Management revocation emits `grant_management.revoked`. The library does not emit a dedicated `consent.revoked` event for generic grant or token revocation. The end-session cascade ([sessions and logout](/concepts/sessions-and-logout#end-session-cascade)) uses the same teardown but leaves the grant records in place.

## Audit events

The consent flow emits two consent-related audit events through `op.WithAuditLogger`:

| Event | Fires on |
|---|---|
| `op.AuditConsentGranted` | User submitted the consent form and a `Grant` row was written. |
| `op.AuditConsentGrantedFirstParty` | First-party auto-consent applied (no prompt shown). |

`op.AuditConsentGranted` also covers an ordinary reconsent that adds a scope or rich authorization detail; the library does not emit separate `AuditConsentGrantedDelta`, `AuditConsentSkippedExisting`, or `AuditConsentRevoked` events. A successful Grant Management revocation is reported as `op.AuditGrantManagementRevoked`.

Together the emitted consent events let an SOC dashboard distinguish "this user explicitly clicked through consent" from "this client got consent on a silent path that the operator pre-approved" — useful when reviewing why a particular `Grant` row exists.

## Read next

- [Use case: first-party clients](/use-cases/first-party) — operator-side scope catalogue, `op.WithFirstPartyClients`, and the audit posture.
- [Use case: custom consent UI](/use-cases/custom-consent-ui) — wiring `op.ConsentUI`, the template contract, and CSRF handling.
- [Reference: audit events](/reference/audit-events) — every audit event the library emits, with the matching extras.
