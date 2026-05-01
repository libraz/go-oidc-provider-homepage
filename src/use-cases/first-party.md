---
title: First-party consent skip
description: Skip the consent prompt for clients you own — the OIDC §3.1.2.4 "first-party" relationship.
---

# Use case — First-party consent skip

## What is "first-party"?

OIDC and OAuth 2.0 are designed for the **third-party** case: an external RP (some SaaS) wants access to the user's data held by your OP, so the user is asked, "Do you authorise SaaS-X to read your email on your behalf?". OIDC Core 1.0 §3.1.2.4 mandates this consent prompt to make the delegation explicit.

**First-party** clients are RPs you (the OP operator) own — your own mobile app, your own SPA, your own internal dashboard. The user is already in your trust boundary; asking "do you authorise Acme Corp to read your data" inside Acme Corp's own login flow is busywork.

OAuth 2.0 has long left this exemption to the operator's discretion; the upcoming **OAuth 2.0 for First-Party Applications** draft formalises the pattern. This library exposes it as a per-client allow-list.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4 (consent prompt)
- [OAuth 2.0 for First-Party Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-first-party-apps/) — IETF draft formalising the pattern
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — §5.3.2.4 (consent required regardless of trust relationship)
:::

::: details Vocabulary refresher
- **Third-party vs first-party** — *Third-party* RPs are external apps requesting access to the user's data held by your OP — the consent prompt is the user's veto on that delegation. *First-party* RPs are clients you (the OP operator) own — your own SPA, your own mobile app — the user is already inside your trust boundary, so prompting "do you authorise Acme Corp to read your data" inside Acme Corp's own login flow is just busywork.
- **Consent prompt** — The OIDC-defined screen between login and the redirect-back-with-code where the user explicitly authorises a list of scopes for a particular RP. Skipping it for first-party RPs trades a UX win for an explicit trust-boundary decision: an attacker who manages to get their RP onto the first-party list bypasses the user's veto entirely.
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

For listed client IDs, `/authorize` redirects back to the RP **immediately** after the login chain succeeds — no consent screen. A third-party client (not listed) still sees the consent prompt as normal.

## Audit

The library still emits `op.AuditConsentGrantedFirstParty` for every skip, so the audit trail records "consent was implicit, the client is on the first-party list" rather than "consent silently happened". SOC dashboards split first-party from third-party grants on the event type.

## Mutual exclusion

`op.WithFirstPartyClients` is **incompatible** with active FAPI 2.0 profiles. FAPI 2.0 §5.3.2.4 mandates explicit consent regardless of trust relationship. The constructor rejects the combination at build time — this is a deliberate trust-boundary decision, not an oversight.

## Production caveat

::: danger Trust extension
Listing a client in `WithFirstPartyClients` is a deliberate trust extension. Production embedders MUST gate the list on a registry of clients owned by the embedder's organisation — typically a column on the client table consulted at boot, not a hard-coded slice. If a third-party client somehow gets onto the list, you've removed the user's veto.
:::

## Read next

- [Tokens primer](/concepts/tokens) — what an `id_token` carries when consent was implicit.
- [Custom consent UI](/use-cases/custom-consent-ui) — when you want a branded consent screen, not skip it.
