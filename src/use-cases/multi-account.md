---
title: Multi-account chooser
description: Two users, one browser. The OP keeps a chooser group and routes prompt=select_account through a UI seam.
---

# Use case — Multi-account chooser

## What is `prompt=select_account`?

OIDC Core 1.0 §3.1.2.1 defines a `prompt` request parameter the RP sends with `/authorize`. Three values matter for this page:

| `prompt=` | What it asks the OP to do |
|---|---|
| `none` | Don't show any UI — just return the active session, or fail. |
| `login` | Force a fresh login even if a session is active. |
| `select_account` | Show an account chooser — the user picks which account to continue with. |

`select_account` is what the "switch account" button on big SaaS products fires. The user has multiple accounts signed in to the same OP browser session (work + personal, or alice + bob); the OP renders a list and lets them choose.

This library implements it as a **chooser group** in the session manager: a group of sessions the same browser is signed into, with APIs to add, switch between, and log out the whole set.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1 (`prompt` parameter), §3.1.2.4 (interaction with consent)
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — fan-out when "log everyone out" fires
:::

::: details Vocabulary refresher
- **`prompt` parameter** — A request hint the RP sends with `/authorize` to tell the OP whether to show UI: `none` (silent — return active session or fail), `login` (force fresh login), `consent` (force consent prompt), `select_account` (show account chooser). Multiple values may be space-separated.
- **Chooser group** — A group of sessions the same browser is signed into. Big SaaS products surface this as the "switch account" menu. The OP keeps the group server-side; cookies tie the browser to the group, not to a single session.
- **`sub` (subject)** — The stable opaque identifier for the user, scoped to the OP-RP pair. Switching accounts in the chooser changes which `sub` ends up in the next `id_token` — same browser, different identity.
:::

> **Sources:** [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) for the JSON-driver chooser flow, and [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) for the HTML template path.

## How it works

```mermaid
sequenceDiagram
  autonumber
  participant U as User browser
  participant OP as OP
  participant RP as RP

  U->>OP: GET /authorize?... (no prompt)
  OP->>OP: no session → run login flow
  U->>OP: log in as alice@acme.com
  OP->>OP: Sessions.Issue → new chooser group
  OP->>U: 302 RP/callback?code=...

  U->>OP: GET /authorize?...&prompt=login
  OP->>OP: active session detected, prompt=login → AddAccount
  U->>OP: log in as alice@personal.com
  OP->>OP: AddAccount appends to existing chooser group
  OP->>U: 302 RP/callback?code=... (now bob's code)

  U->>OP: GET /authorize?...&prompt=select_account
  OP->>U: chooser UI showing both accounts
  U->>OP: POST /interaction/{uid} { state_ref, values: { session_id } }
  OP->>OP: Sessions.Switch
  OP->>U: 302 RP/callback?code=... (selected sub)
```

## Wiring

The library ships a built-in interaction for `prompt=select_account` that emits an `interaction.ChooserPromptData` envelope listing every account in the active chooser group. With the default HTML driver, the bundled template renders the list and the user POSTs back the `SessionID`. Pass `op.WithChooserUI(op.ChooserUI{Template: tmpl})` when you want to keep the server-rendered flow but own that template.

With the JSON driver (`op.WithInteractionDriver(interaction.JSONDriver{})`), the SPA receives the same envelope as JSON and posts back the `SessionID`. If you use `op.WithSPAUI`, the SPA owns the chooser surface through the JSON state envelope even when `WithChooserUI` is also configured; the chooser template is shadowed and `op.New` emits a warning so the ignored template is visible in logs.

The session manager exposes the orchestration:

| Method | When |
|---|---|
| `Sessions.Issue(ctx, subject)` | First login → new chooser group |
| `Sessions.AddAccount(ctx, group, subject)` | Second login in the same browser → joins existing group |
| `Sessions.Switch(ctx, group, sessionID)` | User picked an account in the chooser |
| `Sessions.LogoutAll(ctx, group)` | Sign out everyone |

## Read next

- [SPA / custom interaction](/use-cases/spa-custom-interaction) — drive the chooser from a SPA.
- [Back-Channel Logout](/use-cases/back-channel-logout) — fan-out when the user logs everyone out.
