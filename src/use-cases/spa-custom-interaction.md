---
title: SPA / custom interaction
description: Drive login, consent, and logout from any SPA — React, Vue, Svelte, Angular, or your own. SPA-safe error rendering ships out of the box.
pageClass: pg-use-cases-spa-custom-interaction
---

# Use case — SPA / custom interaction

::: info `op.WithSPAUI` and the lower-level JSON driver
Use `op.WithSPAUI` when you want the OP to mount the SPA shell, static asset tree, and JSON state surface together. Use `op.WithInteractionDriver(interaction.JSONDriver{})` when your own router serves the shell and you only want the OP to expose prompt JSON. This page explains the lower-level JSON-driver contract; [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) shows the OP-mounted SPA shape.
:::

## What is the "interaction" layer?

Between the RP's `/authorize` redirect and the OP's redirect-back-with- code, the OP runs an **interaction** — login, optional MFA step-up, optional consent prompt, optional account chooser. OIDC Core 1.0 §3.1 specifies what data crosses the wire (the request parameters and the final response) but is silent on **how the OP renders these intermediate pages**. Each OP picks its own UX.

This library models the UX as a pluggable `interaction.Driver`. The default driver renders server-side HTML; the JSON driver returns the same prompts as JSON (so a SPA can render them); custom drivers can talk to whatever front-end you ship.

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1 (authorization endpoint), §3.1.2.4 (consent)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — `/end_session`
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE (Proof Key for Code Exchange)
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1 (browser-side public clients)
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §5.2 (error response JSON envelope)
:::

::: details Vocabulary refresher
- **Interaction layer** — Everything between the RP's `/authorize` redirect and the OP's redirect-back-with-code: login, optional MFA step-up, optional consent, optional account chooser. The wire-protocol parameters are spec-defined; *how* the OP renders these intermediate pages is not. Each OP picks its own UX, and that's the seam this page exposes.
- **JSON driver** — The library's pluggable interaction backend that returns prompts as JSON instead of HTML. The state machine still lives in the OP — the SPA fetches `{ type: "login" | "consent.scope" | ... }` and posts answers back. The OP decides what to render next.
- **CSP (Content Security Policy)** — A response header (`Content-Security-Policy: default-src 'none'; ...`) that tells the browser which resources a page is allowed to load. The OP's error page renders under a strict policy that blocks `<script>`, inline event handlers, and arbitrary URL schemes — so a hostile `error_description` cannot escalate into XSS.
:::

> **Sources:** - [`examples/16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction) — minimal swap to the JSON driver. - [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) — OP-mounted SPA wiring through `op.WithSPAUI`. - [`examples/17-spa-composite-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-spa-composite-store) — the production-shaped combination: SPA interaction, MySQL for durable state, and Redis for sessions, interactions, and consumed JTIs. The SPA bundle is hand-rolled vanilla HTML/CSS/JS so it runs without a build step, but the seam is framework-neutral; React / Vue / Svelte / Angular drop in identically.

## Architecture

With the lower-level JSON driver, the OP exposes the interaction state machine at `/interaction/{uid}` and every prompt comes back as JSON; your own router serves the SPA shell + static assets at whatever path you pick. With `op.WithSPAUI`, the OP mounts a SPA-friendly tree instead: `LoginMount/{uid}` for the shell, `LoginMount/state/{uid}` for prompt JSON, and `LoginMount/assets/{path...}` for bundled assets when `StaticDir` is set.

| Method | Path | Role |
|---|---|---|
| `GET` | `/interaction/{uid}` (JSON driver) | Current prompt as JSON |
| `POST` | `/interaction/{uid}` (JSON driver) | User submission for the current prompt |
| `DELETE` | `/interaction/{uid}` (JSON driver) | Cancel the in-flight interaction |
| `GET` | _your route_ | SPA shell (serves your bundle's `index.html`) |
| `GET` | _your route_ | Static asset fan-out (your bundle) |

For `op.WithSPAUI(op.SPAUI{LoginMount: "/login", StaticDir: "./web/static"})`, the same state contract moves to `/login/state/{uid}` while `/login/{uid}` serves the SPA shell.

In the lower-level JSON-driver shape, `/authorize` redirects to `/interaction/{uid}`. Everything between the redirect and the redirect-back-with-code stays on the SPA.

<svg role="img" aria-labelledby="spa-interaction-seq-title" viewBox="0 0 760 518" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="spa-interaction-seq-title">Sequence of the JSON-driver SPA interaction: the browser loads the SPA shell, fetches each prompt from the OP as JSON, posts answers back, and follows the terminal redirect envelope.</title>

  <line class="life" x1="120" y1="56" x2="120" y2="505"/>
  <line class="life" x1="385" y1="56" x2="385" y2="505"/>
  <line class="life op-accent" x1="650" y1="56" x2="650" y2="505"/>

  <rect x="45" y="16" width="150" height="40" rx="5"/>
  <text class="actor" x="120" y="41" text-anchor="middle">User browser</text>
  <rect x="310" y="16" width="150" height="40" rx="5"/>
  <text class="actor" x="385" y="34" text-anchor="middle">SPA bundle</text>
  <text class="sub" x="385" y="48" text-anchor="middle">your code · your router</text>
  <rect class="op-accent" x="575" y="16" width="150" height="40" rx="5"/>
  <text class="actor op-text" x="650" y="41" text-anchor="middle">OP</text>

  <circle class="badge" cx="22" cy="88" r="9"/><text class="num" x="22" y="91.5" text-anchor="middle">1</text>
  <line x1="120" y1="88" x2="650" y2="88"/>
  <path d="M642,84 L650,88 L642,92"/>
  <text class="mono" x="385" y="82" text-anchor="middle">GET /authorize?...</text>

  <circle class="badge" cx="22" cy="121" r="9"/><text class="num" x="22" y="124.5" text-anchor="middle">2</text>
  <rect class="note" x="553" y="109" width="194" height="24" rx="4"/>
  <text class="lbl" x="650" y="124.5" text-anchor="middle">create interaction uid + cookie</text>

  <circle class="badge" cx="22" cy="154" r="9"/><text class="num" x="22" y="157.5" text-anchor="middle">3</text>
  <line x1="650" y1="154" x2="120" y2="154"/>
  <path d="M128,150 L120,154 L128,158"/>
  <text x="385" y="148" text-anchor="middle"><tspan class="mono">302 → /login/{uid}</tspan><tspan class="lbl"> (your route)</tspan></text>

  <circle class="badge" cx="22" cy="187" r="9"/><text class="num" x="22" y="190.5" text-anchor="middle">4</text>
  <line x1="120" y1="187" x2="385" y2="187"/>
  <path d="M377,183 L385,187 L377,191"/>
  <text class="mono" x="252" y="181" text-anchor="middle">GET /login/{uid}</text>

  <circle class="badge" cx="22" cy="220" r="9"/><text class="num" x="22" y="223.5" text-anchor="middle">5</text>
  <line x1="385" y1="220" x2="120" y2="220"/>
  <path d="M128,216 L120,220 L128,224"/>
  <text x="252" y="214" text-anchor="middle"><tspan class="mono">200 index.html</tspan><tspan class="lbl"> (SPA shell)</tspan></text>

  <circle class="badge" cx="22" cy="253" r="9"/><text class="num" x="22" y="256.5" text-anchor="middle">6</text>
  <line x1="120" y1="253" x2="650" y2="253"/>
  <path d="M642,249 L650,253 L642,257"/>
  <text class="mono" x="385" y="247" text-anchor="middle">GET /interaction/{uid} · Accept: application/json</text>

  <circle class="badge" cx="22" cy="286" r="9"/><text class="num" x="22" y="289.5" text-anchor="middle">7</text>
  <line x1="650" y1="286" x2="120" y2="286"/>
  <path d="M128,282 L120,286 L128,290"/>
  <text class="mono" x="385" y="280" text-anchor="middle">200 { type:"login", inputs, state_ref, csrf_token }</text>

  <circle class="badge" cx="22" cy="319" r="9"/><text class="num" x="22" y="322.5" text-anchor="middle">8</text>
  <rect class="note" x="42" y="307" width="156" height="24" rx="4"/>
  <text class="lbl" x="120" y="322.5" text-anchor="middle">SPA renders login form</text>

  <circle class="badge" cx="22" cy="352" r="9"/><text class="num" x="22" y="355.5" text-anchor="middle">9</text>
  <line x1="120" y1="352" x2="650" y2="352"/>
  <path d="M642,348 L650,352 L642,356"/>
  <text class="mono" x="385" y="346" text-anchor="middle">POST /interaction/{uid} · { state_ref, values }</text>

  <circle class="badge" cx="22" cy="385" r="9"/><text class="num" x="22" y="388.5" text-anchor="middle">10</text>
  <line x1="650" y1="385" x2="120" y2="385"/>
  <path d="M128,381 L120,385 L128,389"/>
  <text x="385" y="379" text-anchor="middle"><tspan class="mono">200 { type:"consent.scope", … }</tspan><tspan class="lbl"> or </tspan><tspan class="mono">{ type:"redirect", … }</tspan></text>

  <circle class="badge" cx="22" cy="418" r="9"/><text class="num" x="22" y="421.5" text-anchor="middle">11</text>
  <line x1="120" y1="418" x2="650" y2="418"/>
  <path d="M642,414 L650,418 L642,422"/>
  <text x="385" y="412" text-anchor="middle"><tspan class="mono">POST /interaction/{uid}</tspan><tspan class="lbl"> (consent values)</tspan></text>

  <circle class="badge" cx="22" cy="451" r="9"/><text class="num" x="22" y="454.5" text-anchor="middle">12</text>
  <line x1="650" y1="451" x2="120" y2="451"/>
  <path d="M128,447 L120,451 L128,455"/>
  <text class="mono" x="385" y="445" text-anchor="middle">200 { type:"redirect", location:"/auth?…&amp;code=…" }</text>

  <circle class="badge" cx="22" cy="484" r="9"/><text class="num" x="22" y="487.5" text-anchor="middle">13</text>
  <line x1="120" y1="484" x2="385" y2="484"/>
  <path d="M377,480 L385,484 L377,488"/>
  <text class="mono" x="252" y="478" text-anchor="middle">window.location.href = location</text>
</svg>

The state machine lives on the OP. The SPA fetches the next prompt, posts back the user's answer, and the OP decides what to render next.

## Code

### Swap to the JSON driver (smallest possible change)

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

provider, err := op.New(
  /* required options */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

Now every interaction page returns JSON. Your SPA polls the prompts and posts answers back.

### SPA wiring (framework-neutral)

```go
import (
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/interaction"
)

provider, err := op.New(
  /* required options */
  op.WithInteractionDriver(interaction.JSONDriver{}),
  op.WithCORSOrigins("https://app.example.com"),
)

mux := http.NewServeMux()
// SPA shell + static assets on your own routes.
mux.Handle("GET /login/", http.StripPrefix("/login/", http.FileServer(http.Dir("./web/dist"))))
// OP owns /interaction/{uid} and the rest of the protocol surface.
mux.Handle("/", provider)
```

The OP returns the prompt JSON at `/interaction/{uid}`; your SPA bundle at `/login/...` consumes it via `fetch`. Pick the framework that fits your stack — the Go side is the same either way.

::: info Routing redirect targets to the SPA
With the lower-level JSON driver, `/authorize` redirects to `/interaction/{uid}`. To send the user to your SPA shell first (so the bundle loads, then the shell calls `/interaction/{uid}` with `Accept: application/json`), serve the SPA shell at the path your SPA expects (e.g. `/login/{uid}`) and let it fetch from `/interaction/{uid}` directly. With `op.WithSPAUI`, the OP performs that shell redirect for you and the state endpoint is `LoginMount/state/{uid}`.
:::

::: info `op.WithSPAUI`
`op.SPAUI` carries `LoginMount`, `ConsentMount`, `LogoutMount`, and `StaticDir` so the OP can auto-mount the SPA shell, static asset tree, and prompt JSON under one option. The JSON state endpoint is `LoginMount/state/{uid}`; pass `interaction.JSONDriver` directly only when your own router owns the shell and should fetch from `/interaction/{uid}`.
:::

### Frontend snippet

::: code-group

```jsx [React]
import { useEffect, useState } from "react";

// FieldKind iota in op/interaction:
//   0=text, 1=password, 2=otp, 3=email, 4=hidden.
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

export function Interaction({ uid }) {
  const stateURL = `/interaction/${uid}`;
  const [prompt, setPrompt] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    fetch(stateURL, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then(setPrompt);
  }, [uid]);

  async function onSubmit(e) {
    e.preventDefault();
    const r = await fetch(stateURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": prompt.csrf_token ?? "",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ state_ref: prompt.state_ref, values }),
    });
    const next = await r.json();
    if (next.type === "redirect" && next.location) {
      window.location.href = next.location;
    } else {
      setPrompt(next);
      setValues({});
    }
  }

  if (!prompt) return null;
  return (
    <form onSubmit={onSubmit}>
      {prompt.inputs?.map((f) => (
        <label key={f.Name}>
          <span>{f.Label || f.Name}</span>
          <input
            name={f.Name}
            type={inputTypeFor(f.Kind)}
            required={f.Required}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.Name]: e.target.value }))
            }
          />
        </label>
      ))}
      <button type="submit">Continue</button>
    </form>
  );
}
```

```vue [Vue 3]
<script setup>
import { ref, reactive, onMounted } from "vue";

const props = defineProps({ uid: String });
const stateURL = `/interaction/${props.uid}`;
const prompt = ref(null);
const values = reactive({});

// FieldKind iota in op/interaction:
//   0=text, 1=password, 2=otp, 3=email, 4=hidden.
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

onMounted(async () => {
  const r = await fetch(stateURL, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  prompt.value = await r.json();
});

async function onSubmit() {
  const r = await fetch(stateURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": prompt.value.csrf_token ?? "",
      Accept: "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      state_ref: prompt.value.state_ref,
      values,
    }),
  });
  const next = await r.json();
  if (next.type === "redirect" && next.location) {
    window.location.href = next.location;
  } else {
    prompt.value = next;
    for (const k of Object.keys(values)) delete values[k];
  }
}
</script>

<template>
  <form v-if="prompt" @submit.prevent="onSubmit">
    <label v-for="f in prompt.inputs" :key="f.Name">
      <span>{{ f.Label || f.Name }}</span>
      <input
        :name="f.Name"
        :type="inputTypeFor(f.Kind)"
        :required="f.Required"
        v-model="values[f.Name]"
      />
    </label>
    <button type="submit">Continue</button>
  </form>
</template>
```

:::

Both tabs follow the same flow: GET the prompt at `/interaction/{uid}`, render the declared `inputs`, POST `{state_ref, values}` back. The OP either returns the next prompt or a terminal `{type: "redirect", location: "..."}` envelope the SPA follows with `window.location.href`. The wire shape comes straight from `op/interaction`:

- `Prompt` — `type`, `data`, `inputs`, `state_ref`, `csrf_token`, plus the locale envelope (`locale`, `ui_locales_hint`, `locales_available` — see [i18n / locale negotiation](/use-cases/i18n#reading-the-resolved-locale)). All lower_snake_case JSON tags.
- `FieldSpec` — capitalised field names (`Name`, `Kind`, `Label`, `Required`, `MaxLen`, `MinLen`, `Pattern`) because it has no JSON tags. `Kind` is the integer enum above.
- Terminal redirect envelope — `{"type":"redirect","location":"<URL>"}`. The OP rewrites the orchestrator's terminal 302 into this shape so the SPA can navigate at the document level (a cross-origin `fetch` cannot follow the RP-callback redirect on its own).

The contract is identical across frameworks — only the rendering idiom differs.

::: tip Consent step
When `prompt.type === "consent.scope"` the OP omits `inputs` and moves the scope catalogue into `prompt.data.scopes`. The SPA renders that list (with `s.required` styled as non-toggleable) and submits `{ approved_scopes: "openid profile" }` (a space-joined subset). See [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login)'s `web/static/assets/main.js` for a worked switch on `prompt.type`.
:::

::: info Why send `X-CSRF-Token`?
The OP issues a `__Host-oidc_csrf` cookie at session start and echoes the same value into every prompt envelope as `csrf_token`. The SPA's only job is to copy `prompt.csrf_token` into the `X-CSRF-Token` header on submission — the OP compares the header against the cookie (double-submit cookie pattern). The SPA never generates, validates, or stores the token, and the cookie stays `HttpOnly`.
:::

## SPA-safe error rendering

The OP's error pages emit a stable anchor with `data-*` attributes so the SPA host can read them with one `document.querySelector`:

```html
<div id="op-error"
     data-code="invalid_request_uri"
     data-description="request_uri has expired"
     data-state="abc">
  <h1>Authorization error</h1>
  ...
</div>
```

::: info CSP-safe by construction
The error page renders under `default-src 'none'; style-src 'unsafe-inline'`: no `<script>`, no inline event handlers, no inline images, no `javascript:` URLs. Hostile values in `error_description` / `state` are HTML-escaped before reflection.
:::

The OP also negotiates by `Accept` header:
- `Accept: text/html` (browser navigation) → HTML page with `data-*`.
- `Accept: application/json` (XHR / fetch) → RFC 6749 §5.2 JSON envelope.
- Absent or `*/*` → JSON envelope (the safe default for XHR / curl).

This means your SPA's `fetch()` calls keep getting JSON, and a user who mis-types the URL into the address bar gets a renderable error page with machine-readable attributes the SPA can pick up if it loads.

## CORS

If the SPA is served from a different origin than the OP, you'll need to allow it explicitly:

```go
op.WithCORSOrigins(
  "https://app.example.com",
  "https://staging-app.example.com",
)
```

Per-RP, the library also auto-allowlists each registered `redirect_uri`'s origin (so a static client setup doesn't need duplicate CORS config). See [Use case: CORS for SPA](/use-cases/cors-spa).

## Custom consent UI without going full-SPA

If you only need to rebrand the consent strings (translated copy, brand voice), `op.WithLocale` overlays your keys on top of the seed bundles at key granularity — the bundled HTML driver picks the overlay up automatically and you keep the bundled CSP / CSRF scheme. See [Custom consent UI](/use-cases/custom-consent-ui) and [i18n / locale negotiation](/use-cases/i18n).

`op.WithConsentUI` is the server-rendered path when you want to own the consent template without taking over the whole interaction transport. The JSON driver above remains the SPA path for full client-side rendering.
