---
title: Multi-account chooser
description: "Two users, one browser: chooser-group switching plus group-wide or current-session logout through the OP UI seam."
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

RP-Initiated Logout uses that group by default: `/end_session` without `logout_scope` destroys every active session in the chooser group. A request with the single-valued `logout_scope=current` destroys only the active session and rebinds the cookie to a surviving sibling. Empty, unknown, or repeated `logout_scope` values return HTTP 400 without changing the group. A mismatched `id_token_hint` still requires confirmation; it cannot be used to skip the chooser's confirmation step.

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

<figure class="fig">
  <div class="fig-head">Three round-trips: sign in, add, switch</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-multiaccount-title" viewBox="0 0 960 612" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-multiaccount-title">Three passes through the authorize endpoint. The first signs a user in and opens a chooser group. The second, with prompt=login, adds a second account to that same group. The third, with prompt=select_account, shows the chooser and switches which session is active.</title>
    <rect class="fg-group" x="30" y="70" width="916" height="168" rx="8"/>
    <rect class="fg-group" x="30" y="246" width="916" height="168" rx="8"/>
    <rect class="fg-group" x="30" y="422" width="916" height="176" rx="8"/>
    <text class="fg-lbl" x="42" y="88">1 · first login</text>
    <text class="fg-lbl" x="42" y="264">2 · add an account</text>
    <text class="fg-lbl" x="42" y="440">3 · switch account</text>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="598"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="598"/>
    <line class="fg-life" x1="840" y1="62" x2="840" y2="598"/>
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">User's browser</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">one cookie jar</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="750" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="840" y="35" text-anchor="middle">RP</text>
    <text class="fg-xs" x="840" y="49" text-anchor="middle">your app</text>
    <path class="fg-edge" d="M150,112 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="106" text-anchor="middle">GET /authorize — no prompt</text>
    <path class="fg-edge fg-edge--accent" d="M500,146 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="542" y="150">no active session → run the login flow</text>
    <text class="fg-mxs" x="542" y="164">sign in as alice@acme.com</text>
    <path class="fg-edge fg-edge--accent" d="M500,192 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="196">Sessions.Issue</text>
    <text class="fg-xs" x="542" y="210">opens a new chooser group</text>
    <path class="fg-edge fg-edge--accent" d="M500,230 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="224" text-anchor="middle">302 → the RP callback, with a code</text>
    <path class="fg-edge" d="M150,288 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="282" text-anchor="middle">GET /authorize?prompt=login</text>
    <path class="fg-edge fg-edge--accent" d="M500,322 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="542" y="326">an active session, but prompt=login was asked for</text>
    <text class="fg-mxs" x="542" y="340">sign in as alice@personal.com</text>
    <path class="fg-edge fg-edge--accent" d="M500,368 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="372">AddAccount</text>
    <text class="fg-xs" x="542" y="386">joins the group that already exists</text>
    <path class="fg-edge fg-edge--accent" d="M500,406 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="400" text-anchor="middle">302 → the RP callback, with a code</text>
    <path class="fg-edge" d="M150,464 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="458" text-anchor="middle">GET /authorize?prompt=select_account</text>
    <path class="fg-edge fg-edge--accent" d="M500,494 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="488" text-anchor="middle">the chooser UI — both accounts</text>
    <path class="fg-edge" d="M150,530 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="510" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-mxs" x="325" y="524" text-anchor="middle">{ state_ref, values: { session_id } }</text>
    <path class="fg-edge fg-edge--accent" d="M500,556 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="560">Sessions.Switch</text>
    <text class="fg-xs" x="542" y="574">changes which session is active</text>
    <path class="fg-edge fg-edge--accent" d="M500,594 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="588" text-anchor="middle">302 → the RP callback, for the selected sub</text>
  </svg>
  <figcaption class="fig-note">All three passes go through the same endpoint with the same cookie. What differs is one parameter, and everything the OP does after reading it follows from the group that cookie already points at.</figcaption>
</figure>

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
