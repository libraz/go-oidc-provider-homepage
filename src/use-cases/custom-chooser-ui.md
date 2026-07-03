---
title: Custom chooser UI
description: Replace the server-rendered prompt=select_account chooser template while the OP keeps state, CSRF, and session switching.
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

## Flow

<style scoped>
.ccui-actor{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;stroke:none;fill:currentColor}
.ccui-lbl{font-family:var(--vp-font-family-base);font-size:12.5px;stroke:none;fill:currentColor}
.ccui-mono{font-family:var(--vp-font-family-mono);font-size:12px;stroke:none;fill:currentColor}
.ccui-num{font-family:var(--vp-font-family-mono);font-size:11px;font-weight:600;stroke:none}
.ccui-op{stroke:var(--vp-c-brand-2)}
.ccui-sec{stroke:var(--vp-c-text-3)}
.ccui-opf{fill:var(--vp-c-brand-2)}
.ccui-secf{fill:var(--vp-c-text-3)}
</style>

<svg role="img" aria-labelledby="chooser-flow-title" viewBox="0 0 720 425" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;height:auto;display:block;margin:1.5rem auto;">
<title id="chooser-flow-title">Custom chooser UI flow: the browser requests prompt=select_account, the OP loads the chooser group and renders the template, then validates the submission before switching the session and redirecting to the RP.</title>
<rect x="30" y="14" width="120" height="36" rx="6"/>
<rect x="300" y="14" width="120" height="36" rx="6" class="ccui-op"/>
<rect x="558" y="14" width="144" height="36" rx="6" class="ccui-sec"/>
<text class="ccui-actor" x="90" y="37" text-anchor="middle">Browser</text>
<text class="ccui-actor ccui-opf" x="360" y="37" text-anchor="middle">OP</text>
<text class="ccui-actor ccui-secf" x="630" y="37" text-anchor="middle">Chooser template</text>
<line x1="90" y1="50" x2="90" y2="405"/>
<line x1="360" y1="50" x2="360" y2="405" class="ccui-op"/>
<line x1="630" y1="50" x2="630" y2="405" class="ccui-sec"/>
<line x1="90" y1="88" x2="360" y2="88"/>
<polyline points="352,83 360,88 352,93"/>
<circle class="ccui-op" cx="102" cy="74" r="8"/>
<text class="ccui-num ccui-opf" x="102" y="78" text-anchor="middle">1</text>
<text class="ccui-mono" x="225" y="80" text-anchor="middle">GET /authorize · prompt=select_account</text>
<path d="M360,120 H406 V140 H366"/>
<polyline points="368,135 360,140 368,145"/>
<circle class="ccui-op" cx="372" cy="108" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="112" text-anchor="middle">2</text>
<text class="ccui-lbl" x="414" y="134" text-anchor="start">load chooser group</text>
<line x1="360" y1="176" x2="630" y2="176"/>
<polyline points="622,171 630,176 622,181"/>
<circle class="ccui-op" cx="372" cy="162" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="166" text-anchor="middle">3</text>
<text class="ccui-lbl" x="495" y="168" text-anchor="middle">render <tspan class="ccui-mono">ChooserTemplateData</tspan></text>
<line x1="630" y1="216" x2="90" y2="216" stroke-dasharray="5 4"/>
<polyline points="98,211 90,216 98,221"/>
<circle class="ccui-op" cx="618" cy="202" r="8"/>
<text class="ccui-num ccui-opf" x="618" y="206" text-anchor="middle">4</text>
<text class="ccui-lbl" x="360" y="208" text-anchor="middle">account list + <tspan class="ccui-mono">CSRFToken</tspan> + <tspan class="ccui-mono">StateRef</tspan></text>
<line x1="90" y1="260" x2="360" y2="260"/>
<polyline points="352,255 360,260 352,265"/>
<circle class="ccui-op" cx="102" cy="246" r="8"/>
<text class="ccui-num ccui-opf" x="102" y="250" text-anchor="middle">5</text>
<text class="ccui-mono" x="225" y="252" text-anchor="middle">POST SubmitAction · session_id</text>
<path d="M360,292 H406 V312 H366"/>
<polyline points="368,307 360,312 368,317"/>
<circle class="ccui-op" cx="372" cy="280" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="284" text-anchor="middle">6</text>
<text class="ccui-lbl" x="414" y="306" text-anchor="start">validate <tspan class="ccui-mono">CSRFToken</tspan> + <tspan class="ccui-mono">StateRef</tspan></text>
<path d="M360,336 H406 V356 H366"/>
<polyline points="368,351 360,356 368,361"/>
<circle class="ccui-op" cx="372" cy="324" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="328" text-anchor="middle">7</text>
<text class="ccui-mono" x="414" y="350" text-anchor="start">Sessions.Switch(group, session_id)</text>
<line x1="360" y1="392" x2="90" y2="392" stroke-dasharray="5 4"/>
<polyline points="98,387 90,392 98,397"/>
<circle class="ccui-op" cx="348" cy="378" r="8"/>
<text class="ccui-num ccui-opf" x="348" y="382" text-anchor="middle">8</text>
<text class="ccui-lbl" x="225" y="384" text-anchor="middle">302 to RP with <tspan class="ccui-mono">code</tspan></text>
</svg>

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
