---
title: Custom consent UI
description: Customise consent with op.WithConsentUI, locale bundles, or the JSON driver.
---

# Use case — Custom consent UI

## What is "consent" in OIDC?

After the user authenticates, OIDC Core 1.0 §3.1.2.4 expects the OP to ask **the user — not the RP — whether to release the requested scopes** (`profile`, `email`, anything else the RP listed). The user clicks "Approve" or "Deny", and only then does the OP redirect back with a code. This page exists *between* login and the redirect.

The bundled consent page works, but you almost certainly want it branded — your logo, your copy, your privacy / TOS links, your i18n. For small copy changes, locale bundle overlays are enough. For a branded server-rendered page, pass `op.WithConsentUI`. For full client-side rendering, use the JSON driver.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4 (consent prompt)
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.1 (authorization endpoint)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice (CSRF mitigation, etc.)
:::

::: details Vocabulary refresher
- **Consent screen** — The page between login and the redirect-back-with-code where the user approves the scopes a particular RP is requesting. The OP decides what data to ask about; the user decides whether to release it.
- **CSRF token** — A per-session secret embedded in a form so a hostile third-party site cannot trick the browser into submitting "Approve" on the user's behalf. The OP issues and validates the token; SPA / template only echo it back in the POST body or the `X-CSRF-Token` header.
- **Content Security Policy (CSP)** — A response header (`Content-Security-Policy: default-src 'none'; ...`) that tells the browser which resources a page may load. The OP renders the bundled consent page under a strict default policy that blocks `<script>`, inline event handlers, and external assets, so a hostile RP `client_name` cannot escalate into XSS.
:::

## Path 1 — Locale bundle overlay (minor copy / i18n)

If you only need to change the strings (translated copy, brand voice, partial translations), `op.WithLocale` overlays your keys on top of the seed `en` / `ja` bundles at key granularity. The bundled consent page picks up the overlay automatically.

```go
brandJa, _ := op.LocaleBundleFromMap("ja", map[string]string{
  "consent.title":                       "Acme へのアクセス許可",
  "consent.scope.profile.description":   "プロフィール情報の参照",
})

op.New(
  /* required options */
  op.WithLocale(brandJa),
)
```

Bundle keys follow the surface they render — see [Use case: i18n / locale negotiation](/use-cases/i18n) for the catalogue and the resolution chain.

This path keeps the bundled HTML driver, the bundled CSP, and the bundled CSRF / cookie scheme. You only change strings.

## Path 2 — Custom consent template (server-rendered)

When you want branded HTML but still want the OP to own state, CSRF, and consent persistence, pass `op.WithConsentUI` with a parsed `*html/template.Template`. The template receives `interaction.ConsentTemplateData`, including `Client`, `Scopes`, `StateRef`, `CSRFToken`, `ApprovedScopesField`, `SubmitMethod`, and `SubmitAction`.

```go
tmpl := template.Must(template.ParseFiles("consent.html"))

op.New(
  /* required options */
  op.WithConsentUI(op.ConsentUI{Template: tmpl}),
)
```

See [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) for the form field shape.

## Path 3 — JSON driver (full markup control)

If you need to own the markup (custom layout, brand assets, framework-rendered consent), switch to the JSON driver. The OP returns the consent prompt as `{ type: "consent.scope", data: { scopes: [...] }, csrf_token, ... }` JSON; your page or SPA renders it and posts the user's choice back.

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

op.New(
  /* required options */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

The SPA echoes `prompt.csrf_token` into the `X-CSRF-Token` header on submission; the OP compares against the `__Host-oidc_csrf` cookie (double-submit pattern). See [SPA / custom interaction](/use-cases/spa-custom-interaction) for the worked end-to-end flow.

## What you don't have to write either way

| Concern | Owned by the OP |
|---|---|
| CSRF token generation / validation | yes |
| Origin / Referer check on the POST | yes |
| Cookie scope (`__Host-`, `Secure`, `SameSite`) | yes |
| Session lookup / consent persistence | yes |
| Rendering the redirect back to the RP after approval | yes |

The locale bundle path keeps the bundled CSP (`default-src 'none'; style-src 'unsafe-inline'`) and the rendered HTML; the JSON driver path lets your own page set the CSP it needs.

## Read next

- [SPA / custom interaction](/use-cases/spa-custom-interaction) — full SPA wiring on the JSON driver.
- [i18n / locale negotiation](/use-cases/i18n) — the locale bundle overlay path.
- [CORS for SPA](/use-cases/cors-spa) — when your front-end is on another origin.
