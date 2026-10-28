---
title: Multi-account chooser
description: "Two users, one browser: chooser-group switching plus group-wide or current-session logout through the OP UI seam."
pageClass: pg-use-cases-multi-account
---

# Use case — Multi-account chooser

## What is `prompt=select_account`?

OIDC Core 1.0 §3.1.2.1 defines a `prompt` request parameter that the RP sends with `/auth`. Three values matter here:

| `prompt=` | What it asks the OP to do |
|---|---|
| `none` | Show no UI: answer from the active session, or fail. |
| `login` | Force a fresh login even if a session is active. |
| `select_account` | Show an account chooser — the user picks which account to continue with. |

`select_account` is what the "switch account" button on large SaaS products sends. The user has several accounts signed in to the same browser (work and personal, or alice and bob); the OP lists them and lets the user choose. The chooser appears only when the browser already has an active session; without one the request goes straight to login.

The library implements this as a **chooser group**: the set of sessions one browser is signed into, kept by the OP's session manager, which can add an account to the group, switch the active one, and sign out the whole set.

RP-Initiated Logout works on that group. `/end_session` without `logout_scope` destroys every session in the chooser group. `logout_scope=current` (the only accepted value, sent once) destroys only the active session and points the cookie at a surviving sibling. An empty, unknown, or repeated `logout_scope` returns HTTP 400 and leaves the group untouched. An `id_token_hint` that does not match the session still requires the user's confirmation; it cannot be used to skip it.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1 (`prompt` parameter), §3.1.2.4 (interaction with consent)
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — fan-out when "log everyone out" fires
:::

::: details Vocabulary refresher
- **`prompt` parameter**: a hint the RP sends with `/auth` about whether to show UI: `none` (silent: answer from the active session or fail), `login` (force a fresh login), `consent` (force the consent prompt), `select_account` (show the account chooser). Several values may be space-separated.
- **Chooser group**: the sessions one browser is signed into, which large SaaS products show as the "switch account" menu. The OP stores the group server-side; the cookie ties the browser to the group, not to a single session.
- **`sub` (subject)**: the stable identifier of the user, scoped to the OP and RP pair. Switching accounts in the chooser changes the `sub` in the next `id_token`: same browser, different identity.
:::

> **Sources:** [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) for the JSON-driver chooser flow, and [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) for the HTML template path.

## How it works

<figure class="fig">
  <div class="fig-head">Three round-trips: sign in, add, switch</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-multiaccount-title" viewBox="0 0 960 1056" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-multiaccount-title">Three passes through the authorize endpoint. The first signs a user in and opens a chooser group. The second, started from the chooser's add-account link, adds a second account to that same group. The third, with prompt=select_account, shows the chooser and switches which session is active.</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="272" rx="8"/>
    <rect class="fg-group" x="32" y="392" width="896" height="280" rx="8"/>
    <rect class="fg-group" x="32" y="688" width="896" height="368" rx="8"/>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="1032"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="1032"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">User's browser</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">one cookie jar</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- 1 first login -->
    <text class="fg-lbl fg-halo" x="56" y="132">1 · first login</text>
    <path class="fg-edge" d="M192,184 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="174" text-anchor="middle">GET /auth · no prompt</text>
    <path class="fg-edge fg-edge--accent" d="M512,216 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="222">no active session → login flow</text>
    <text class="fg-mxs" x="568" y="244">sign in as alice@acme.com</text>
    <path class="fg-edge fg-edge--accent" d="M512,280 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="568" y="286">Sessions.Issue</text>
    <text class="fg-s" x="568" y="308">opens a new chooser group</text>
    <path class="fg-edge fg-edge--accent" d="M512,352 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="342" text-anchor="middle">302 → RP callback + code</text>
    <!-- 2 add an account -->
    <text class="fg-lbl fg-halo" x="56" y="420">2 · add an account</text>
    <path class="fg-edge" d="M192,480 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="446" text-anchor="middle">GET AddAccountURL</text>
    <text class="fg-mxs" x="352" y="468" text-anchor="middle">prompt=login + markers</text>
    <path class="fg-edge fg-edge--accent" d="M512,512 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="518">prompt=login forces a fresh sign-in</text>
    <text class="fg-mxs" x="568" y="540">sign in as alice@personal.com</text>
    <path class="fg-edge fg-edge--accent" d="M512,576 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="568" y="582">AddAccount</text>
    <text class="fg-s" x="568" y="604">joins the existing group</text>
    <path class="fg-edge fg-edge--accent" d="M512,648 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="638" text-anchor="middle">302 → RP callback + code</text>
    <!-- 3 switch -->
    <text class="fg-lbl fg-halo" x="56" y="716">3 · switch account</text>
    <path class="fg-edge" d="M192,776 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="742" text-anchor="middle">GET /auth</text>
    <text class="fg-mxs" x="352" y="764" text-anchor="middle">prompt=select_account</text>
    <path class="fg-edge fg-edge--accent" d="M512,832 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="822" text-anchor="middle">chooser UI · both accounts</text>
    <path class="fg-edge" d="M192,904 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="870" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-mxs" x="352" y="892" text-anchor="middle">state_ref, values.session_id</text>
    <path class="fg-edge fg-edge--accent" d="M512,936 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="568" y="942">Sessions.Switch</text>
    <text class="fg-s" x="568" y="964">changes the active session</text>
    <path class="fg-edge fg-edge--accent" d="M512,1008 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="998" text-anchor="middle">302 → RP callback, new sub</text>
  </svg>
  <figcaption class="fig-note">All three passes use the same endpoint and the same cookie. The second pass is not a bare <code>prompt=login</code>: that would replace the current account. It uses the add-account link the chooser hands out, whose private markers tell the OP to join the group the cookie points at.</figcaption>
</figure>

## Wiring

The library ships a built-in interaction for `prompt=select_account`. It emits an `interaction.ChooserPromptData` listing every account in the active chooser group plus an `AddAccountURL`. With the default HTML driver the bundled template renders the list and the user POSTs back the chosen `SessionID`. Pass `op.WithChooserUI(op.ChooserUI{Template: tmpl})` to keep that server-rendered flow with your own template.

With the JSON driver (`op.WithInteractionDriver(interaction.JSONDriver{})`), the SPA receives the same data as JSON and posts back the `SessionID`. Under `op.WithSPAUI` the SPA owns the chooser even if `WithChooserUI` is also set; the template is ignored and `op.New` logs a warning.

Adding an account needs the `AddAccountURL` from the prompt, not a hand-built URL. It is the original `/auth` request with `prompt=login` plus private markers naming the chooser group, and the OP honours the markers only while the browser still presents that group's cookie. A bare `prompt=login` replaces the current account. Under `RequirePAR` (for example FAPI 2.0) the OP leaves `AddAccountURL` empty, because a query-string `/auth` URL would be refused; hide the "add account" link in that case.

The session manager is internal; application code does not call it. It performs four operations as the OP handles `/auth` and the chooser interaction:

| Operation | When |
|---|---|
| Open a new chooser group | first login in a browser |
| Add an account to the group | a sign-in started from `AddAccountURL` |
| Switch the active session | the user picked an account in the chooser |
| End the whole group | sign out everyone (`/end_session` without `logout_scope`) |

The only session interface you implement is `store.SessionStore` (`Save`, `Find`, `Touch`, `Delete`, `ListByChooserGroup`), when you supply your own session backend.

After a pick, the usual request checks still apply. If the chosen session is stale for the request's `max_age`, does not meet its `acr_values`, or the request carries `prompt=login`, that account is asked to authenticate again instead of the request failing.

## Read next

- [Custom chooser UI](/use-cases/custom-chooser-ui) — keep the chooser server-rendered but replace the account picker template.
- [SPA / custom interaction](/use-cases/spa-custom-interaction) — drive the chooser from a SPA.
- [Back-Channel Logout](/use-cases/back-channel-logout) — fan-out when the user logs everyone out.
