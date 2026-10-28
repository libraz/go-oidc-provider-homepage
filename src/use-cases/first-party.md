---
title: First-party consent skip
description: Explains how this library skips interactive consent for clients you own while OIDC Core §3.1.2.4 governs the authorization decision.
---

# Use case — First-party consent skip

## What is "first-party"?

OIDC and OAuth 2.0 are designed for the **third-party** case: an external RP (some SaaS) wants access to the user's data held by your OP, so the user is asked, "Do you authorise SaaS-X to read your email on your behalf?" OIDC Core 1.0 §3.1.2.4 requires the OP to obtain an authorization decision before releasing information. An interactive dialogue is one way to obtain that decision; prior administrative consent or another established processing condition can also suffice.

**First-party** clients are RPs you (the OP operator) own — your own mobile app, your own SPA, your own internal dashboard. The user is already in your trust boundary; asking "do you authorise Acme Corp to read your data" inside Acme Corp's own login flow is busywork.

OAuth 2.0 has long left this exemption to the operator's discretion; the upcoming **OAuth 2.0 for First-Party Applications** draft formalises the pattern. This library exposes it as a per-client allow-list.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4 (authorization decision and consent)
- [OAuth 2.0 for First-Party Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-first-party-apps/) — IETF draft formalising the pattern
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — §5.3.2.2 (consent information guidance; the library applies a stricter first-party exclusion)
:::

::: details Vocabulary refresher
- **Third-party vs first-party** — the axis is ownership of the RP: an app someone else runs against your OP, versus one you ship yourself. Nothing about the protocol changes; what changes is whether the user's veto over the delegation is meaningful.
- **Consent decision** — The authorization decision made before the OP releases information. An interactive consent screen is one possible way to obtain it; a prior administrative decision can also establish it. Skipping the screen for first-party RPs trades a UX win for an explicit trust-boundary decision: an attacker who manages to get their RP onto the first-party list bypasses the user's veto entirely.
:::

> **Source:** [`examples/40-first-party-skip-consent`](https://github.com/libraz/go-oidc-provider/tree/main/examples/40-first-party-skip-consent)

## Wiring

```go
op.New(
  /* required options */
  op.WithFirstPartyClients("first-party-app", "internal-dashboard"),
  op.WithStaticClients(op.PublicClient{
    ID:           "first-party-app",
    RedirectURIs: []string{"https://app.example.com/callback"},
    Scopes:       []string{"openid", "profile", "email"},
    GrantTypes:   []string{"authorization_code", "refresh_token"},
  }),
)
```

`op.New` checks the list at construction. Every ID must also be registered through `WithStaticClients`, otherwise it fails with `unknown client_id`. Clients created by [Dynamic Client Registration](/use-cases/dynamic-registration) are never first-party, whatever the list says.

For a listed client, `/auth` creates the consent grant on the user's behalf and issues the code with no consent screen. A client that is not listed still sees the consent prompt. With `prompt=none`, a listed client gets a code where an unlisted one would get `consent_required`.

### When the skip applies

The skip is deliberately narrow. It applies only when all of these hold; otherwise the user sees the normal consent screen.

| Condition | Why |
|---|---|
| The client is on the list | The operator's decision. |
| The user already has a session | The skip never invents a subject to bind the grant to. |
| The request does not carry `prompt=consent` | An explicit prompt from the RP wins over the OP's posture. |
| The scope does not include `offline_access` | A long-lived refresh grant is always confirmed by the user. |
| The request carries no `authorization_details` and no Grant Management action | Rich authorization requests and grant changes always get an explicit ceremony. |
| The browser reports a same-origin request, or a same-site one whose `Origin` or `Referer` matches the origin of the `redirect_uri` | `Sec-Fetch-Site` guards against a cross-site page triggering the auto-grant. A cross-site navigation, or a client that sends no Fetch Metadata headers, gets the consent screen. |

The skip replaces only the consent screen. `LoginFlow` rules and the `Decider` are still evaluated before the code is issued, so a rule that guards the client or a scope can demand a step-up (or answer `interaction_required` under `prompt=none`), and interactions registered with `op.TriggerBeforeToken` still run.

## Audit

Every skip emits `op.AuditConsentGrantedFirstParty`, so the audit trail records "consent was implicit, the client is on the first-party list" instead of an unexplained grant. Dashboards can tell first-party grants from third-party ones by the event type.

## Mutual exclusion

`op.WithFirstPartyClients` cannot be combined with a FAPI 2.0 profile. This is a library policy: the profiles reject first-party auto-consent, even though OIDC Core permits an authorization decision established by prior or administrative consent. `op.New` rejects the combination, so the trust-boundary decision is explicit.

## Production caveat

::: danger Trust extension
Listing a client in `WithFirstPartyClients` is a deliberate trust extension. Production embedders MUST build the list from a registry of clients owned by the embedder's organisation, typically a column on the client table read at boot, not a hard-coded slice. If a third-party client gets onto the list, the user's veto is gone.
:::

## Read next

- [Tokens primer](/concepts/tokens) — what an `id_token` carries when consent was implicit.
- [Custom consent UI](/use-cases/custom-consent-ui) — when you want a branded consent screen, not skip it.
