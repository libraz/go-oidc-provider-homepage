---
title: Multi-account chooser
description: Two users, one browser. The OP keeps a chooser group and routes prompt=select_account through a UI seam.
pageClass: pg-use-cases-multi-account
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

This library implements it as a **chooser group** inside the OP's internal session manager: a group of sessions the same browser is signed into, with internal orchestration to add, switch between, and log out the whole set.

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

<svg class="multi-account-flow" role="img" aria-labelledby="multi-account-chooser-flow-title" viewBox="0 0 720 656" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="multi-account-chooser-flow-title">Sequence of three /authorize round-trips: first login issues a chooser group, prompt=login adds an account, prompt=select_account switches the active session.</title>

  <!-- actors -->
  <rect x="60" y="14" width="120" height="34" rx="6"/>
  <rect x="320" y="14" width="120" height="34" rx="6" class="d-op"/>
  <rect x="560" y="14" width="120" height="34" rx="6"/>
  <text class="d-lbl" text-anchor="middle" x="120" y="35">User browser</text>
  <text class="d-lbl d-acc" text-anchor="middle" x="380" y="35">OP</text>
  <text class="d-lbl" text-anchor="middle" x="620" y="35">RP</text>

  <!-- lifelines -->
  <path class="d-life" d="M120 48 V648"/>
  <path class="d-op" d="M380 48 V648"/>
  <path class="d-life" d="M620 48 V648"/>

  <!-- phase 1 -->
  <text class="d-ph" x="10" y="64">1 · FIRST LOGIN</text>
  <path d="M120 84 H380"/><path d="M374 80 L380 84 L374 88"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="77"><tspan class="d-mono">GET /authorize</tspan> (no prompt)</text>
  <rect x="268" y="94" width="224" height="24" rx="5"/>
  <text class="d-lbl" text-anchor="middle" x="380" y="110">no active session → run login flow</text>
  <path d="M120 138 H380"/><path d="M374 134 L380 138 L374 142"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="131">sign in — <tspan class="d-mono">alice@acme.com</tspan></text>
  <rect x="268" y="148" width="224" height="36" rx="5" class="d-op"/>
  <text class="d-mono d-acc" text-anchor="middle" x="380" y="164">Sessions.Issue</text>
  <text class="d-lbl" text-anchor="middle" x="380" y="178">new chooser group</text>
  <path d="M380 204 H120"/><path d="M126 200 L120 204 L126 208"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="197"><tspan class="d-mono">302</tspan> → RP callback (code)</text>
  <path d="M120 228 H620"/><path d="M614 224 L620 228 L614 232"/>
  <text class="d-lbl d-mut" text-anchor="middle" x="370" y="221">browser follows redirect</text>

  <!-- phase 2 -->
  <text class="d-ph" x="10" y="252">2 · ADD ACCOUNT</text>
  <path d="M120 274 H380"/><path d="M374 270 L380 274 L374 278"/>
  <text class="d-mono" text-anchor="middle" x="250" y="267">GET /authorize?prompt=login</text>
  <rect x="268" y="284" width="224" height="24" rx="5"/>
  <text class="d-lbl" text-anchor="middle" x="380" y="300">active session + <tspan class="d-mono">prompt=login</tspan></text>
  <path d="M120 328 H380"/><path d="M374 324 L380 328 L374 332"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="321">sign in — <tspan class="d-mono">alice@personal.com</tspan></text>
  <rect x="268" y="338" width="224" height="36" rx="5" class="d-op"/>
  <text class="d-mono d-acc" text-anchor="middle" x="380" y="354">AddAccount</text>
  <text class="d-lbl" text-anchor="middle" x="380" y="368">joins existing group</text>
  <path d="M380 394 H120"/><path d="M126 390 L120 394 L126 398"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="387"><tspan class="d-mono">302</tspan> → RP callback (code)</text>
  <path d="M120 418 H620"/><path d="M614 414 L620 418 L614 422"/>
  <text class="d-lbl d-mut" text-anchor="middle" x="370" y="411">browser follows redirect</text>

  <!-- phase 3 -->
  <text class="d-ph" x="10" y="442">3 · SWITCH ACCOUNT</text>
  <path d="M120 464 H380"/><path d="M374 460 L380 464 L374 468"/>
  <text class="d-mono" text-anchor="middle" x="250" y="457">GET /authorize?prompt=select_account</text>
  <path d="M380 496 H120"/><path d="M126 492 L120 496 L126 500"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="489">chooser UI — both accounts</text>
  <path d="M120 528 H380"/><path d="M374 524 L380 528 L374 532"/>
  <text class="d-mono" text-anchor="middle" x="250" y="521">POST /interaction/{uid}</text>
  <text class="d-mono d-sm d-mut" text-anchor="middle" x="250" y="542">{ state_ref, values: { session_id } }</text>
  <rect x="268" y="552" width="224" height="36" rx="5" class="d-op"/>
  <text class="d-mono d-acc" text-anchor="middle" x="380" y="568">Sessions.Switch</text>
  <text class="d-lbl" text-anchor="middle" x="380" y="582">switch active session</text>
  <path d="M380 608 H120"/><path d="M126 604 L120 608 L126 612"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="601"><tspan class="d-mono">302</tspan> → RP callback (selected sub)</text>
  <path d="M120 632 H620"/><path d="M614 628 L620 632 L614 636"/>
  <text class="d-lbl d-mut" text-anchor="middle" x="370" y="625">browser follows redirect</text>
</svg>

## Wiring

The library ships a built-in interaction for `prompt=select_account` that emits an `interaction.ChooserPromptData` envelope listing every account in the active chooser group. With the default HTML driver, the bundled template renders the list and the user POSTs back the `SessionID`. Pass `op.WithChooserUI(op.ChooserUI{Template: tmpl})` when you want to keep the server-rendered flow but own that template.

With the JSON driver (`op.WithInteractionDriver(interaction.JSONDriver{})`), the SPA receives the same envelope as JSON and posts back the `SessionID`. If you use `op.WithSPAUI`, the SPA owns the chooser surface through the JSON state envelope even when `WithChooserUI` is also configured; the chooser template is shadowed and `op.New` emits a warning so the ignored template is visible in logs.

This is orchestrated internally by the OP's session manager (`internal/sessions.Manager`) — an internal type, not something embedders import or call directly:

| Internal step | When |
|---|---|
| Issue a new chooser group | First login → new chooser group |
| Add an account to the group | Second login in the same browser → joins existing group |
| Switch the active session in the group | User picked an account in the chooser |
| Log out the whole group | Sign out everyone |

The embedder-facing surface for session state is the `store.SessionStore` interface (`Save` / `Find` / `Touch` / `Delete` / `ListByChooserGroup`), which a custom store backend implements; the chooser orchestration itself runs inside the OP as part of handling `/authorize` and the chooser interaction, not as an API application code calls.

## Read next

- [Custom chooser UI](/use-cases/custom-chooser-ui) — keep the chooser server-rendered but replace the account picker template.
- [SPA / custom interaction](/use-cases/spa-custom-interaction) — drive the chooser from a SPA.
- [Back-Channel Logout](/use-cases/back-channel-logout) — fan-out when the user logs everyone out.
