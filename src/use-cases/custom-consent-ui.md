---
title: Custom consent UI
description: Customise consent with op.WithConsentUI, locale bundles, or the JSON driver while respecting the provider's CSP policy and ceremony-origin rules.
---

# Use case — Custom consent UI

## What is "consent" in OIDC?

After the user authenticates, OIDC Core 1.0 §3.1.2.4 requires the OP to obtain an authorization decision before it releases information. One permitted way is an interactive dialogue in which **the user, not the RP, approves or denies the requested scopes** (`profile`, `email`, whatever the RP listed). Prior administrative consent or another established condition can also suffice. This page covers the library's interactive consent screen between login and the redirect back to the RP; [Consent](/concepts/consent) explains when the OP shows it and when it remembers an earlier answer.

The bundled consent page works, but you will usually want your own logo, copy, privacy and terms links, and languages. Pick the lightest path that gets you there:

| You want to change | Use | The OP keeps |
|---|---|---|
| Strings only (wording, translation) | Path 1: `op.WithLocale` | bundled HTML, CSP, CSRF |
| The page's markup, server-rendered | Path 2: `op.WithConsentUI` | state, CSRF, consent persistence |
| Everything, rendered in a SPA | Path 3: `interaction.JSONDriver` or `op.WithSPAUI` | state, CSRF, consent persistence |

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4 (authorization decision and consent)
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.1 (authorization endpoint)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice (CSRF mitigation, etc.)
:::

::: details Vocabulary refresher
- **Consent screen**: the page between login and the redirect back with a code, where the user approves the scopes a particular RP requests. The RP decides what to ask for; the user decides whether to release it.
- **CSRF token**: a secret embedded in a form so a hostile site cannot make the browser submit "Approve" on the user's behalf. The OP issues and validates it; your template or SPA only echoes it back in the POST body (`csrf_token`) or the `X-CSRF-Token` header.
- **Content Security Policy (CSP)**: a response header (`Content-Security-Policy: default-src 'none'; ...`) that tells the browser which resources a page may load. The OP serves the bundled consent page under a strict default policy that blocks scripts, inline handlers, and external assets, so a hostile RP `client_name` cannot turn into XSS.
:::

## Path 1 — Locale bundle overlay (minor copy / i18n)

If you only need to change strings (brand voice, translations, partial translations), `op.WithLocale` overlays your keys on the seed `en` and `ja` bundles one key at a time. The bundled consent page picks up the overlay automatically. The consent screen reads `consent.title` and `consent.subtitle` (both take a `{client_name}` placeholder), `consent.button.allow`, and `consent.scope_required`.

```go
brandJa, _ := op.LocaleBundleFromMap("ja", map[string]string{
  "consent.title":    "{client_name} へのアクセス許可",
  "consent.subtitle": "{client_name} が次の情報へのアクセスを求めています。",
})

op.New(
  /* required options */
  op.WithLocale(brandJa),
)
```

The scope lines are not bundle keys. Each row shows the scope name and the `Description` from the `op.Scope` you registered, in its default language; `Scope.I18n` is stored but the consent prompt does not read it. To show translated scope text, look it up by scope name in your own template (Path 2) or SPA (Path 3).

See [i18n / locale negotiation](/use-cases/i18n) for the key catalogue and how the OP picks a locale. This path keeps the bundled HTML driver, CSP, and CSRF and cookie scheme.

## Path 2 — Custom consent template (server-rendered)

When you want branded HTML but still want the OP to own state, CSRF, and consent persistence, pass `op.WithConsentUI` with a parsed `*html/template.Template`. The template receives `interaction.ConsentTemplateData`: `Client` (name, logo, policy and terms URLs), `Scopes` (each with `Name`, `Description`, `Required`), `StateRef`, `CSRFToken`, `ApprovedScopesField`, `SubmitMethod`, and `SubmitAction`.

```go
tmpl := template.Must(template.ParseFiles("consent.html"))

op.New(
  /* required options */
  op.WithConsentUI(op.ConsentUI{Template: tmpl}),
)
```

The form your template renders must POST three values to `SubmitAction`: `state_ref`, `csrf_token`, and a field named `ApprovedScopesField` (`approved_scopes`) holding the approved scope names joined by spaces. A template that approves every requested scope with one button, as [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) does, posts all of them. Per-scope checkboxes need client-side script to build the joined value; the bundled screen has no decline button for the same reason. A required scope cannot be dropped: the OP answers 4xx when the submission omits one.

`op.WithConsentUI` may be called once and cannot be combined with `op.WithSPAUI`; `op.New` fails in either case.

::: warning One fixed language
`ConsentTemplateData` carries no locale and no message bundle, so a custom template renders a single language. If you need several, choose the language in the template yourself, or use the JSON driver, whose prompts carry the resolved `locale`.
:::

### CSP for a custom template

`op.ConsentUI` has a `ContentSecurityPolicy` field. An empty value selects the library default (`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`), which blocks every subresource. A template that loads a stylesheet, logo, or webfont then renders unstyled, and the OP never sees a failure because the browser does the blocking.

A non-empty value is normalized by `interaction.NormalizeCSP` when `op.New` runs. You may add the `style-src`, `img-src`, `font-src`, or `script-src` your template needs, with these exceptions:

- `form-action` is refused, because browsers apply it to redirect targets and it would block the cross-origin redirect that completes a successful consent.
- `frame-ancestors` and `base-uri` must be exactly `'none'` when present; if you omit them, the OP appends them.
- A comma, a control character, or a non-ASCII byte is refused.

A refused policy fails `op.New` with `interaction.ErrCSPNotPermitted`.

Allowing scripts is a trust decision: the page contains the CSRF token and the continuation state, so any script that runs on it can complete the consent without the user. `html/template` escaping protects values such as the RP's display name, but it does not make arbitrary script execution harmless. Branding needs `style-src`, `img-src`, and `font-src`, not `script-src`.

## Path 3 — JSON driver (full markup control)

If you need to own the markup (custom layout, brand assets, framework-rendered consent), switch to the JSON driver. The OP returns the consent prompt as JSON; your page or SPA renders it and posts the user's choice back. `ConsentScopePromptData` has no JSON tags, so its members are capitalised:

```json
{
  "type": "consent.scope",
  "data": {
    "Scopes": [{"Name": "openid", "Description": "...", "Required": true}, {"Name": "email", "Description": "...", "Required": false}],
    "Client": {"ClientID": "demo-spa", "Name": "Demo", "LogoURL": "", "ClientURI": "", "PolicyURI": "", "TosURI": ""}
  },
  "state_ref": "...",
  "csrf_token": "...",
  "locale": "ja"
}
```

The SPA POSTs `{ "state_ref": "...", "values": { "approved_scopes": "openid email" } }` back. A user who declines the whole request sends `DELETE` to the same interaction URL.

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

op.New(
  /* required options */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

The SPA copies `csrf_token` from the prompt into the `X-CSRF-Token` header; the OP compares it with the `__Host-oidc_csrf` cookie (double-submit pattern). [SPA / custom interaction](/use-cases/spa-custom-interaction) walks through the whole flow.

## What you don't have to write either way

| Concern | Owned by the OP |
|---|---|
| CSRF token generation / validation | yes |
| Origin / Referer check on the POST | yes |
| Cookie scope (`__Host-`, `Secure`, `SameSite`) | yes |
| Session lookup / consent persistence | yes |
| Rendering the redirect back to the RP after approval | yes |

Path 1 keeps the bundled CSP and HTML. In Path 2, declare your asset origins in `ConsentUI.ContentSecurityPolicy`; do not try to add `form-action` for the RP redirect. In Path 3, your own page sets the CSP it needs.

The OP checks the POST's `Origin` / `Referer` against the issuer origin and any origin you passed to `op.WithCORSOrigins`. A client's `redirect_uri` origin does not qualify, so a page on another client's origin cannot submit interaction or end-session state.

## Read next

- [SPA / custom interaction](/use-cases/spa-custom-interaction) — full SPA wiring on the JSON driver.
- [i18n / locale negotiation](/use-cases/i18n) — the locale bundle overlay path.
- [CORS for SPA](/use-cases/cors-spa) — when your front-end is on another origin.
