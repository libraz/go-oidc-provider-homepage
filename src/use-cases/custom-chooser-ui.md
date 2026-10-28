---
title: Custom chooser UI
description: Replace the prompt=select_account chooser while the OP keeps state, CSRF, session switching, CSP enforcement, and ceremony-origin checks.
pageClass: pg-use-cases-custom-chooser-ui
---

# Use case — Custom chooser UI

`prompt=select_account` has two separable concerns:

- the **session semantics**: the browser holds a chooser group with several signed-in accounts, and the account the user picks decides the next `sub`;
- the **rendering surface**: the page that lists those accounts and POSTs the chosen `SessionID`.

[Multi-account chooser](/use-cases/multi-account) covers the first. This page covers the second: use `op.WithChooserUI` for a branded, server-rendered account picker while the OP keeps state, CSRF, and the session switch.

> **Source:** [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) demonstrates `op.WithChooserUI` with the default HTML interaction driver. Compare [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) for the JSON-driver / SPA path.

## When to use it

| Need | Use |
|---|---|
| Keep the bundled chooser | no option; the default HTML driver renders it |
| Change chooser HTML / copy / layout while staying server-rendered | `op.WithChooserUI(op.ChooserUI{Template: tmpl})` |
| Render the chooser inside a SPA | `op.WithSPAUI` or `op.WithInteractionDriver(interaction.JSONDriver{})` |
| Change how accounts are grouped or switched | session-store / authenticator logic, not the template |

`WithChooserUI` is deliberately narrow. It swaps the template only; the template cannot choose arbitrary subjects, mint sessions, or bypass the OP's state machine.

## Template contract

The template receives `interaction.ChooserTemplateData`:

| Field | Purpose |
|---|---|
| `Accounts` | live sessions in the chooser group, most recently used first; each has `SessionID`, `Subject`, `DisplayName` (the user's `name` claim, empty when unknown), and `AuthTime` |
| `StateRef` | opaque interaction state reference that must be echoed back |
| `CSRFToken` | token the OP validates on POST |
| `SessionIDField` | form field name expected by the OP for the chosen account |
| `SubmitMethod` | normally `POST` |
| `SubmitAction` | interaction endpoint URL |
| `AddAccountURL` | `/auth` URL that signs in another account into the same group; empty when the deployment requires PAR |

Minimal shape:

```go
tmpl := template.Must(template.New("chooser").Parse(`
{{range .Accounts}}
  <form method="{{$.SubmitMethod}}" action="{{$.SubmitAction}}">
    <input type="hidden" name="state_ref" value="{{$.StateRef}}">
    <input type="hidden" name="csrf_token" value="{{$.CSRFToken}}">
    <input type="hidden" name="{{$.SessionIDField}}" value="{{.SessionID}}">
    <button type="submit">Continue as {{if .DisplayName}}{{.DisplayName}}{{else}}{{.Subject}}{{end}}</button>
  </form>
{{end}}
{{if .AddAccountURL}}<a href="{{.AddAccountURL}}">Sign in to another account</a>{{end}}
`))

provider, err := op.New(
  /* required options */
  op.WithInteractionDriver(interaction.HTMLDriver{}),
  op.WithChooserUI(op.ChooserUI{Template: tmpl}),
)
```

The field names are part of the OP contract. Keep `state_ref`, `csrf_token`, and the field named by `SessionIDField` (`session_id`) in the submitted form. Render the "add account" link only when `AddAccountURL` is non-empty: under `RequirePAR` (for example FAPI 2.0) a bare query-string `/auth` URL would be refused, so the OP leaves the field empty.

`op.ChooserUI` also has a `ContentSecurityPolicy` field, declared separately from the consent one because the two templates may load from different origins. An empty value uses the strict default (`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`), which blocks stylesheets and images too. A custom policy is normalized by `interaction.NormalizeCSP` when `op.New` runs: `form-action` is forbidden, `frame-ancestors` and `base-uri` must be exactly `'none'` when present, and missing protections are appended. A refused policy fails `op.New` with `interaction.ErrCSPNotPermitted`. Add only the asset directives the template needs, and keep scripts off.

## Flow

<figure class="fig">
  <div class="fig-head">The chooser, from request to switch</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-chooser-title" viewBox="0 0 960 736" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-chooser-title">A request carrying prompt=select_account makes the OP load the chooser group and hand it to your template. The submission comes back with a CSRF token and a state reference, both of which are validated before the session is switched.</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="712"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="712"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="712"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">Browser</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">the user's</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">Chooser template</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">yours</text>
    <!-- request -->
    <path class="fg-edge" d="M192,152 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="118" text-anchor="middle">GET /auth</text>
    <text class="fg-mxs" x="352" y="140" text-anchor="middle">prompt=select_account</text>
    <!-- load group -->
    <path class="fg-edge fg-edge--accent" d="M512,200 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="206">load the chooser group</text>
    <text class="fg-s" x="568" y="228">behind the cookie</text>
    <!-- render -->
    <path class="fg-edge" d="M512,304 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="294" text-anchor="middle">render ChooserTemplateData</text>
    <!-- list -->
    <path class="fg-edge" d="M824,384 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="504" y="350" text-anchor="middle">the account list</text>
    <text class="fg-mxs fg-halo" x="504" y="372" text-anchor="middle">plus CSRFToken and StateRef</text>
    <!-- submit -->
    <path class="fg-edge" d="M192,464 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="430" text-anchor="middle">POST SubmitAction</text>
    <text class="fg-mxs" x="352" y="452" text-anchor="middle">session_id</text>
    <!-- validate -->
    <path class="fg-edge fg-edge--accent" d="M512,512 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="518">validate before switching</text>
    <text class="fg-mxs" x="568" y="540">CSRFToken · StateRef</text>
    <!-- switch -->
    <path class="fg-edge fg-edge--accent" d="M512,584 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="590">switch the session</text>
    <text class="fg-mxs" x="568" y="612">Switch(group, session_id)</text>
    <!-- redirect -->
    <path class="fg-edge fg-edge--accent" d="M512,688 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="678" text-anchor="middle">302 to the RP, with a code</text>
  </svg>
  <figcaption class="fig-note">Your template owns the markup and nothing else. The two opaque values it has to echo back are what stop a submitted <code>session_id</code> from being anything other than one this browser was just offered.</figcaption>
</figure>

The template never performs the switch; it only returns the chosen session identifier. The OP checks that the identifier belongs to the active chooser group and refuses a foreign or expired `session_id` with a 4xx. If the chosen session expired or was signed out in the meantime, the RP receives `login_required`.

If the chosen session cannot serve the request (the request has `prompt=login`, the session is older than `max_age`, or its `acr` does not meet `acr_values`), the OP does not fail the request. It runs the login factors for that account again.

## SPA interaction precedence

`op.WithSPAUI` makes the SPA own the chooser surface through the JSON state envelope. If both `WithSPAUI` and `WithChooserUI` are configured, the SPA wins, the chooser template is ignored, and `op.New` logs a warning. Use one ownership mode per deployment:

| UI owner | Option |
|---|---|
| OP server-rendered HTML | `op.WithChooserUI` |
| SPA shell mounted by the OP | `op.WithSPAUI` |
| Your own router serves the SPA | `op.WithInteractionDriver(interaction.JSONDriver{})` |

## Production notes

- Parse templates once at startup, not per request.
- Keep the CSP strict. The data can contain attacker-influenced labels, so rely on `html/template` escaping and avoid inline scripts.
- Treat `SessionID` as an opaque value. Do not display it or build it from other fields.
- Use `AddAccountURL` as given. It carries private markers that make the next sign-in join the existing group; a hand-built `prompt=login` URL replaces the current account instead of adding one.

## Read next

- [Multi-account chooser](/use-cases/multi-account) — chooser group semantics and `Sessions.Switch`.
- [SPA / custom interaction](/use-cases/spa-custom-interaction) — JSON-driver ownership of the same prompt.
- [Custom consent UI](/use-cases/custom-consent-ui) — the equivalent server-rendered template seam for consent.
