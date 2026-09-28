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

For listed client IDs, `/authorize` redirects back to the RP **immediately** after the login chain succeeds — no consent screen. A third-party client (not listed) still sees the consent prompt as normal. If a first-party client sends `prompt=consent`, the explicit prompt request wins and the skip is not applied.

## Audit

The library still emits `op.AuditConsentGrantedFirstParty` for every skip, so the audit trail records "consent was implicit, the client is on the first-party list" rather than "consent silently happened". SOC dashboards split first-party from third-party grants on the event type.

## Mutual exclusion

`op.WithFirstPartyClients` is **incompatible** with active FAPI 2.0 profiles. This is a library policy: the profile constraints reject first-party auto-consent, even though OIDC Core permits an authorization decision established by prior or administrative consent. The constructor rejects the combination at build time so the trust-boundary decision is explicit.

## Production caveat

::: danger Trust extension
Listing a client in `WithFirstPartyClients` is a deliberate trust extension. Production embedders MUST gate the list on a registry of clients owned by the embedder's organisation — typically a column on the client table consulted at boot, not a hard-coded slice. If a third-party client somehow gets onto the list, you've removed the user's veto.
:::

## Read next

- [Tokens primer](/concepts/tokens) — what an `id_token` carries when consent was implicit.
- [Custom consent UI](/use-cases/custom-consent-ui) — when you want a branded consent screen, not skip it.
