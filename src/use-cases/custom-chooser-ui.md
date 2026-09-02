---
title: Custom chooser UI
description: Replace the prompt=select_account chooser while the OP keeps state, CSRF, session switching, CSP enforcement, and ceremony-origin checks.
pageClass: pg-use-cases-custom-chooser-ui
---

# Use case — Custom chooser UI

`prompt=select_account` has two separable concerns:

- the **session semantics**: the browser has a chooser group with more than one active account, and the selected session determines the next `sub`
- the **rendering surface**: the page that lists those accounts and POSTs the selected `SessionID`

[Multi-account chooser](/use-cases/multi-account) covers the first concern. This page covers the second: use `op.WithChooserUI` when you want a branded server-rendered account picker but still want the OP to own state, CSRF, and the final `Sessions.Switch`.

> **Source:** [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) demonstrates `op.WithChooserUI` with the default HTML interaction driver. Compare [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) for the JSON-driver / SPA path.

## When to use it

| Need | Use |
|---|---|
| Keep the bundled chooser | no option; the default HTML driver renders it |
| Change chooser HTML / copy / layout while staying server-rendered | `op.WithChooserUI(op.ChooserUI{Template: tmpl})` |
| Render the chooser inside a SPA | `op.WithSPAUI` or `interaction.JSONDriver` |
| Change how accounts are grouped or switched | session-store / authenticator logic, not the template |

`WithChooserUI` is intentionally narrow. It swaps the template only; it does not let the template choose arbitrary subjects, mint sessions, or bypass the OP's state machine.

## Template contract

The template receives `interaction.ChooserTemplateData`. The important fields are:

| Field | Purpose |
|---|---|
| `Accounts` | active sessions in the chooser group, including `SessionID`, subject, display label, and auth time |
| `StateRef` | opaque interaction state reference that must be echoed back |
| `CSRFToken` | token the OP validates on POST |
| `SessionIDField` | form field name expected by the OP for the chosen account |
| `SubmitMethod` | normally `POST` |
| `SubmitAction` | interaction endpoint URL |
| `AddAccountURL` | URL that starts a `prompt=login` path to add another account |

Minimal shape:

```go
tmpl := template.Must(template.New("chooser").Parse(`
{{range .Accounts}}
  <form method="{{$.SubmitMethod}}" action="{{$.SubmitAction}}">
    <input type="hidden" name="state_ref" value="{{$.StateRef}}">
    <input type="hidden" name="csrf_token" value="{{$.CSRFToken}}">
    <input type="hidden" name="{{$.SessionIDField}}" value="{{.SessionID}}">
    <button type="submit">Continue as {{.DisplayName}}</button>
  </form>
{{end}}
<a href="{{.AddAccountURL}}">Sign in to another account</a>
`))

provider, err := op.New(
  /* required options */
  op.WithInteractionDriver(interaction.HTMLDriver{}),
  op.WithChooserUI(op.ChooserUI{Template: tmpl}),
)
```

The field names are part of the OP contract. Keep `state_ref`, `csrf_token`, and the dynamic `SessionIDField` in the submitted form.

`op.ChooserUI` also has a `ContentSecurityPolicy` field. An empty value uses the strict default (`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`). A custom policy is normalized by `interaction.NormalizeCSP` at construction: `form-action` is forbidden, while `frame-ancestors` and `base-uri` must be exactly `'none'` when present; missing protections are appended. A rejected policy fails `op.New` with `interaction.ErrCSPNotPermitted`. Add only the asset directives the template needs, and keep scripts disabled unless the template's trust boundary explicitly requires them.

## Flow

<figure class="fig">
  <div class="fig-head">The chooser, from request to switch</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-chooser-title" viewBox="0 0 960 386" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-chooser-title">A request carrying prompt=select_account makes the OP load the chooser group and hand it to your template. The submission comes back with a CSRF token and a state reference, both of which are validated before the session is switched.</title>
    <line class="fg-life" x1="150" y1="72" x2="150" y2="372"/>
    <line class="fg-life fg-life--accent" x1="500" y1="72" x2="500" y2="372"/>
    <line class="fg-life" x1="830" y1="72" x2="830" y2="372"/>
    <rect class="fg-box" x="60" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t" x="150" y="44" text-anchor="middle">Browser</text>
    <text class="fg-xs" x="150" y="59" text-anchor="middle">the user's</text>
    <rect class="fg-box fg-box--accent" x="410" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="44" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="59" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="740" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t" x="830" y="44" text-anchor="middle">Chooser template</text>
    <text class="fg-xs" x="830" y="59" text-anchor="middle">yours</text>
    <circle class="fg-badge" cx="15" cy="104" r="8.5"/>
    <text class="fg-badge-t" x="15" y="107" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,104 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="98" text-anchor="middle">GET /authorize · prompt=select_account</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="142" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="145" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,134 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="542" y="146">load the chooser group behind the cookie</text>
    <circle class="fg-badge" cx="15" cy="182" r="8.5"/>
    <text class="fg-badge-t" x="15" y="185" text-anchor="middle">3</text>
    <path class="fg-edge" d="M500,182 H830" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="176" text-anchor="middle">render ChooserTemplateData</text>
    <circle class="fg-badge" cx="15" cy="222" r="8.5"/>
    <text class="fg-badge-t" x="15" y="225" text-anchor="middle">4</text>
    <path class="fg-edge" d="M830,222 H150" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="490" y="202" text-anchor="middle">the account list</text>
    <text class="fg-mxs fg-halo" x="490" y="215" text-anchor="middle">plus CSRFToken and StateRef</text>
    <circle class="fg-badge" cx="15" cy="262" r="8.5"/>
    <text class="fg-badge-t" x="15" y="265" text-anchor="middle">5</text>
    <path class="fg-edge" d="M150,262 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="256" text-anchor="middle">POST SubmitAction · session_id</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="300" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="303" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--accent" d="M500,292 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="296">validate CSRFToken and StateRef</text>
    <text class="fg-xs" x="542" y="310">before anything is switched</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="338" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="341" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M500,330 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="342">Sessions.Switch(group, session_id)</text>
    <circle class="fg-badge" cx="15" cy="368" r="8.5"/>
    <text class="fg-badge-t" x="15" y="371" text-anchor="middle">8</text>
    <path class="fg-edge fg-edge--accent" d="M500,368 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="362" text-anchor="middle">302 to the RP, with a code</text>
  </svg>
  <figcaption class="fig-note">Your template owns the markup and nothing else. The two opaque values it has to echo back are what stop a submitted <code>session_id</code> from being anything other than one this browser was just offered.</figcaption>
</figure>

The template never performs the switch. It only returns the selected session identifier to the OP.

## SPA interaction precedence

`op.WithSPAUI` makes the SPA own the chooser surface through the JSON state envelope. If both `WithSPAUI` and `WithChooserUI` are configured, the SPA path wins and the chooser template is ignored with a startup warning. Use one ownership mode per deployment:

| UI owner | Option |
|---|---|
| OP server-rendered HTML | `op.WithChooserUI` |
| SPA shell mounted by the OP | `op.WithSPAUI` |
| Your own router serves the SPA | `op.WithInteractionDriver(interaction.JSONDriver{})` |

## Production notes

- Parse templates once at startup; do not parse per request.
- Keep CSP strict. The template data can include RP-provided labels such as client display names, so rely on `html/template` escaping and avoid inline scripts.
- Treat `SessionID` as an opaque value. The OP checks that it belongs to the active chooser group.
- The "add account" link should follow the provided `AddAccountURL` so the next login joins the existing chooser group.

## Read next

- [Multi-account chooser](/use-cases/multi-account) — chooser group semantics and `Sessions.Switch`.
- [SPA / custom interaction](/use-cases/spa-custom-interaction) — JSON-driver ownership of the same prompt.
- [Custom consent UI](/use-cases/custom-consent-ui) — the equivalent server-rendered template seam for consent.
