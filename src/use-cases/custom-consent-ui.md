---
title: Custom consent UI
description: Replace the built-in consent screen with your own HTML template — branded copy, layout, i18n.
---

# Use case — Custom consent UI

## What is "consent" in OIDC?

After the user authenticates, OIDC Core 1.0 §3.1.2.4 expects the OP to ask **the user — not the RP — whether to release the requested scopes** (`profile`, `email`, anything else the RP listed). The user clicks "Approve" or "Deny", and only then does the OP redirect back with a code. This page exists *between* login and the redirect.

The default consent page works, but you almost certainly want it branded — your logo, your copy, your privacy / TOS links, your i18n.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4 (consent prompt)
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.1 (authorization endpoint)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice (CSRF mitigation, etc.)
:::

::: details Vocabulary refresher
- **Consent screen** — The page between login and the redirect-back-with-code where the user approves the scopes a particular RP is requesting. The OP decides what data to ask about; the user decides whether to release it.
- **CSRF token** — A per-session secret embedded in a form so a hostile third-party site cannot trick the browser into submitting "Approve" on the user's behalf. The OP issues and validates the token; your template's only job is to echo it back in the POST body.
- **Content Security Policy (CSP)** — A response header (`Content-Security-Policy: default-src 'none'; ...`) that tells the browser which resources a page may load. The OP renders the consent page under a strict default policy that blocks `<script>`, inline event handlers, and external assets, so a hostile RP `client_name` cannot escalate into XSS.
:::

> **Source:** [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui)

## The seam

```go
import "html/template"

tmpl := template.Must(template.New("consent").Parse(`
  <!DOCTYPE html>
  <html><body>
    <h1>{{.Client.Name}} wants the following permissions</h1>
    <ul>{{range .Scopes}}<li>{{.Description}}</li>{{end}}</ul>
    <form method="POST">
      <input type="hidden" name="csrf" value="{{.CSRFToken}}">
      <button name="action" value="approve">Approve</button>
      <button name="action" value="deny">Deny</button>
    </form>
  </body></html>
`))

op.New(
  /* required options */
  op.WithConsentUI(op.ConsentUI{Template: tmpl}),
)
```

The library passes a canonical context to your template:

| Field | Type | Purpose |
|---|---|---|
| `Client` | `store.Client` | Display name, logo URI, etc. |
| `Scopes` | `[]op.Scope` | Granted scopes with their human descriptions |
| `CSRFToken` | `string` | **Must** be embedded in the form post body |
| `User` | `op.Identity` | Subject + claim shape |

Everything else — layout, CSS, i18n — is yours.

## What you don't have to write

| Concern | Owned by the OP |
|---|---|
| CSRF token generation / validation | ✅ |
| Origin / Referer check on the POST | ✅ |
| Cookie scope (`__Host-`, `Secure`, `SameSite`) | ✅ |
| Session lookup / consent persistence | ✅ |
| Rendering the redirect back to the RP after approval | ✅ |

You only own the markup between the form open and close.

## CSP-safe

The library's default CSP for the consent page is `default-src 'none'; style-src 'unsafe-inline'`. If you embed `<script>` or external assets, raise the policy explicitly via `op.WithConsentUI(op.ConsentUI{ContentSecurityPolicy: "..."})`.

## When to use this vs. the SPA driver

| Need | Pick |
|---|---|
| Just rebrand the consent page, keep server-rendered HTML | `WithConsentUI` |
| Full SPA — login, consent, logout in your SPA (React, Vue, …) | `WithSPAUI` (see [SPA / custom interaction](/use-cases/spa-custom-interaction)) |
| JSON-only consent endpoint, custom front-end framework | Swap `interaction.JSONDriver{}` |

## Read next

- [SPA / custom interaction](/use-cases/spa-custom-interaction) — full SPA wiring.
- [CORS for SPA](/use-cases/cors-spa) — when your front-end is on another origin.
