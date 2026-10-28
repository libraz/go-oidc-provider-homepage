---
title: SPA / custom interaction
description: Drive login and consent from a SPA through the JSON state endpoint; terminal envelopes, CSP, and ceremony-origin rules are explicit.
pageClass: pg-use-cases-spa-custom-interaction
---

# Use case — SPA / custom interaction

## What is the "interaction" layer?

Between the RP's `/auth` redirect and the OP's redirect back with a code, the OP runs an **interaction**: login, optional MFA step-up, optional consent, optional account chooser. OIDC Core 1.0 §3.1 specifies what crosses the wire (the request parameters and the final response) but says nothing about **how the OP renders these intermediate pages**. Each OP chooses its own UX.

The library models that UX as a pluggable `interaction.Driver`. The default driver renders server-side HTML. The JSON driver returns the same prompts as JSON so a SPA can render them. A custom driver can talk to whatever front end you ship. The state machine stays in the OP in every case: the front end fetches the next prompt, posts the user's answer, and the OP decides what comes next.

::: info Which option do I use?
| Goal | Use |
|---|---|
| A SPA (React, Vue, Svelte, ...) that handles the whole login | `op.WithSPAUI(op.SPAUI{LoginMount: "/login"})`. The OP mounts the state endpoint `/login/state/{uid}`; with `StaticDir` set it also serves the shell and assets. The OP converts the final redirect into a JSON envelope the SPA can follow. |
| A non-browser client, or a driver that renders something other than HTML | `op.WithInteractionDriver(...)`, for example `interaction.JSONDriver{}`. The state endpoint is `/interaction/{uid}`, and the final response is the plain `302` to the RP, which `fetch()` cannot follow. |

This page covers the SPA path. [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) shows it end to end; despite the name, its bundle is plain HTML, CSS, and JS.
:::

::: details Specs referenced on this page
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1 (authorization endpoint), §3.1.2.4 (consent)
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — `/end_session`
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE (Proof Key for Code Exchange)
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1 (browser-side public clients)
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §5.2 (error response JSON envelope)
:::

::: details Vocabulary refresher
- **Interaction layer**: everything between the RP's `/auth` redirect and the OP's redirect back with the code. The wire parameters are fixed by the spec; how the intermediate pages look is not, and that is the seam this page exposes.
- **JSON driver**: the driver that returns prompts as JSON instead of HTML. The front end fetches `{ type: "auth.password" | "consent.scope" | ... }`, renders it, and posts the answer back.
- **CSP (Content Security Policy)**: a response header (`Content-Security-Policy: default-src 'none'; ...`) that tells the browser which resources a page may load. The OP's own HTML pages carry a strict policy, so a hostile `error_description` cannot become XSS.
:::

> **Sources:** [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) is the OP-mounted SPA wiring through `op.WithSPAUI`. [`examples/16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction) wraps `JSONDriver` in a custom driver. [`examples/17-spa-composite-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-spa-composite-store) is the production-shaped combination: SPA interaction, MySQL for durable state, and Redis for sessions, interactions, and consumed JTIs. The bundle there is hand-rolled so it runs without a build step; the seam is framework-neutral.

## Architecture

With `op.WithSPAUI`, `/auth` redirects the browser to `LoginMount/{uid}`. The SPA then talks to the OP at `LoginMount/state/{uid}`:

| Method | Path | Role |
|---|---|---|
| `GET` | `LoginMount/{uid}` | SPA shell (`index.html`), served by the OP when `StaticDir` is set, otherwise by your own route |
| `GET` | `LoginMount/assets/{path...}` | bundled assets, served when `StaticDir` is set |
| `GET` | `LoginMount/state/{uid}` | current prompt as JSON |
| `POST` | `LoginMount/state/{uid}` | the user's submission for the current prompt |
| `DELETE` | `LoginMount/state/{uid}` | cancel the in-flight interaction |

`LoginMount` is the only routing field of `op.SPAUI`. `ConsentMount` and `LogoutMount` are deprecated and inert: consent goes through the same state route, and the logout confirmation stays on the normal `/end_session` flow.

<figure class="fig">
  <div class="fig-head">The SPA asks for each screen as JSON</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-spa-title" viewBox="0 0 960 920" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-spa-title">The authorize endpoint redirects the browser to the SPA shell at the login mount. From there the SPA fetches each interaction state from the OP as JSON, posts the answers back, and finally follows a redirect envelope to the RP.</title>
    <line class="fg-life" x1="192" y1="88" x2="192" y2="896"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="896"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="896"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">User's browser</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">follows redirects</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">SPA bundle</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">your code · your UI</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- authorize request -->
    <path class="fg-edge" d="M192,136 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="126" text-anchor="middle">GET /auth?…</text>
    <!-- redirect to shell -->
    <path class="fg-edge fg-edge--accent" d="M824,208 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m fg-halo" x="508" y="174" text-anchor="middle">302 → /login/{uid}</text>
    <text class="fg-xs fg-halo" x="508" y="196" text-anchor="middle">uid created · cookie set</text>
    <!-- fetch shell -->
    <path class="fg-edge" d="M192,272 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="262" text-anchor="middle">GET /login/{uid}</text>
    <!-- shell returned -->
    <path class="fg-edge fg-edge--muted" d="M512,328 H192" marker-end="url(#fg-am)"/>
    <text class="fg-m" x="352" y="318" text-anchor="middle">200 index.html</text>
    <!-- fetch state -->
    <path class="fg-edge" d="M512,400 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="366" text-anchor="middle">GET /login/state/{uid}</text>
    <text class="fg-mxs" x="668" y="388" text-anchor="middle">Accept: application/json</text>
    <!-- prompt -->
    <path class="fg-edge fg-edge--accent" d="M824,472 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="668" y="438" text-anchor="middle">200 { type:"auth.password" }</text>
    <text class="fg-mxs" x="668" y="460" text-anchor="middle">inputs · state_ref · …</text>
    <!-- render the form -->
    <path class="fg-edge fg-edge--muted" d="M512,504 h40 v24 h-40" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="568" y="510">renders the form, your way</text>
    <!-- submit credentials -->
    <path class="fg-edge" d="M512,592 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="558" text-anchor="middle">POST /login/state/{uid}</text>
    <text class="fg-mxs" x="668" y="580" text-anchor="middle">{ state_ref, values }</text>
    <!-- consent prompt -->
    <path class="fg-edge fg-edge--accent" d="M824,664 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="668" y="630" text-anchor="middle">200 { type:"consent.scope" }</text>
    <text class="fg-xs" x="668" y="652" text-anchor="middle">or a redirect envelope</text>
    <!-- submit scopes -->
    <path class="fg-edge" d="M512,736 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="702" text-anchor="middle">POST /login/state/{uid}</text>
    <text class="fg-mxs" x="668" y="724" text-anchor="middle">approved_scopes</text>
    <!-- redirect envelope -->
    <path class="fg-edge fg-edge--accent" d="M824,808 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="668" y="774" text-anchor="middle">200 { type:"redirect", … }</text>
    <text class="fg-mxs" x="668" y="796" text-anchor="middle">location=https://rp/cb?code=…</text>
    <!-- navigate -->
    <path class="fg-edge" d="M512,872 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="352" y="862" text-anchor="middle">send the browser to location</text>
  </svg>
  <figcaption class="fig-note">After the shell loads, the OP only ever answers in JSON. It describes what each screen has to ask for; how it looks, and which framework draws it, is entirely on your side of the boundary.</figcaption>
</figure>

## Code

### Mount the SPA

```go
provider, err := op.New(
  /* required options */
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "./web/dist", // optional: the OP serves the shell and assets
  }),
)
if err != nil {
  log.Fatal(err)
}
http.ListenAndServe(":8080", provider)
```

When `StaticDir` is empty, the OP serves only the state route and redirects to `LoginMount/{uid}`; you serve that shell yourself:

```go
mux := http.NewServeMux()
mux.Handle("GET /login/{uid}", spaShell) // returns your index.html
mux.Handle("/", provider)                // the OP owns /login/state/{uid} and the protocol endpoints
```

Without `op.WithSPAUI` the default driver is the HTML driver. Passing `op.WithInteractionDriver(interaction.JSONDriver{})` alone moves the same JSON contract to `/interaction/{uid}`, but the terminal response there is a `302` that a `fetch()` call cannot read, so a browser SPA should use `op.WithSPAUI`.

### Frontend snippet

::: code-group

```jsx [React]
import { useEffect, useState } from "react";

// FieldKind values: 0=text, 1=password, 2=otp code, 3=email, 4=hidden.
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

// The final authorization response arrives as an envelope, not a redirect.
function deliver(next) {
  if (next.type === "redirect") {
    window.location.href = next.location;
    return true;
  }
  if (next.type === "form_post") {
    const form = document.createElement("form");
    form.method = "post";
    form.action = next.action;
    for (const [name, value] of Object.entries(next.fields)) {
      const input = document.createElement("input");
      Object.assign(input, { type: "hidden", name, value });
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return true;
  }
  return false;
}

export function Interaction({ uid }) {
  const stateURL = `/login/state/${uid}`;
  const [prompt, setPrompt] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    fetch(stateURL, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
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
    if (!r.ok) return; // check the status before parsing: the body may not be JSON
    const next = await r.json();
    if (!deliver(next)) {
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
const stateURL = `/login/state/${props.uid}`;
const prompt = ref(null);
const values = reactive({});

// FieldKind values: 0=text, 1=password, 2=otp code, 3=email, 4=hidden.
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

// The final authorization response arrives as an envelope, not a redirect.
function deliver(next) {
  if (next.type === "redirect") {
    window.location.href = next.location;
    return true;
  }
  if (next.type === "form_post") {
    const form = document.createElement("form");
    form.method = "post";
    form.action = next.action;
    for (const [name, value] of Object.entries(next.fields)) {
      const input = document.createElement("input");
      Object.assign(input, { type: "hidden", name, value });
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return true;
  }
  return false;
}

onMounted(async () => {
  const r = await fetch(stateURL, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (r.ok) prompt.value = await r.json();
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
  if (!r.ok) return; // check the status before parsing: the body may not be JSON
  const next = await r.json();
  if (!deliver(next)) {
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

Both tabs follow the same loop: GET the prompt, render its `inputs`, POST `{ state_ref, values }`, and repeat until the response is a terminal envelope. They render only generic `inputs`; a real front end also branches on `prompt.type`, because consent, the chooser, captcha, and passkey prompts carry their content in `data`.

The wire shapes come straight from `op/interaction`:

- **Prompt**: `type`, `data`, `inputs`, `state_ref`, `csrf_token`, plus the locale fields `locale`, `ui_locales_hint`, and `locales_available` (see [i18n / locale negotiation](/use-cases/i18n#reading-the-resolved-locale)). These have lower_snake_case JSON tags. The built-in types are `auth.password`, `auth.totp`, `auth.email_otp.send`, `auth.email_otp.verify`, `auth.passkey`, `auth.recovery_code`, `captcha`, `consent.scope`, and `interaction.chooser`; your own prompts use an organisation prefix.
- **`FieldSpec` and `data`**: the Go structs have no JSON tags, so their members arrive capitalised (`Name`, `Kind`, `Label`, `Required`, `MaxLen`, `MinLen`, `Pattern`; `Scopes`, `Client`, `Accounts`, `AddAccountURL`). `Kind` is the integer enum shown above.
- **Status first**: `200` carries a prompt or a terminal envelope; `204` means the interaction was cancelled and there was no `redirect_uri` to notify; anything else is an error whose body is normally `{"error", "error_description"}` but may be `text/plain`. Check `r.ok` before calling `r.json()`.
- **Terminal envelopes**: the final authorization response cannot be a redirect, because `fetch()` cannot follow a cross-origin redirect or run an auto-submitting HTML page. The OP sends one of two envelopes for the SPA to deliver at document level.

| `type` | Shape | The SPA does | Response modes |
|---|---|---|---|
| `redirect` | `{"type":"redirect","location":"<url>"}` | `window.location.href = location` | `query`, and JARM `query.jwt` / `fragment.jwt` |
| `form_post` | `{"type":"form_post","action":"<redirect_uri>","fields":{...}}` | build a hidden form and submit it | `form_post`, and JARM `form_post.jwt` |

A front end that skips the `form_post` case strands the flow: the RP never receives a response.

::: tip Consent step
For `prompt.type === "consent.scope"`, read the scopes from `prompt.data.Scopes` (each has `Name`, `Description`, `Required`) and the client from `prompt.data.Client`. The prompt also declares one text input, `approved_scopes`; the SPA submits `{ approved_scopes: "openid profile" }`, the approved scope names joined by spaces. Approving a subset is allowed; omitting a required scope is refused with a 4xx. To decline the whole request, send `DELETE` to the state URL. See [Custom consent UI](/use-cases/custom-consent-ui).
:::

::: info Why send `X-CSRF-Token`?
The OP sets an `HttpOnly` `__Host-oidc_csrf` cookie and copies the same value into each prompt as `csrf_token`. Because script cannot read the cookie, the prompt is the only way the SPA gets the value. The SPA's job is to copy `prompt.csrf_token` into the `X-CSRF-Token` header on each POST; the OP compares header and cookie (double-submit pattern). The SPA never generates or stores the token.
:::

## Error rendering

How the OP reports a failure before it can trust a redirect target (an unregistered `client_id`, a malformed request) depends on the driver. The JSON driver always answers with the RFC 6749 §5.2 envelope, `{"error": "...", "error_description": "...", "state": "..."}`. The HTML driver does too, unless the request prefers `Accept: text/html`; then it answers with a page that exposes the same fields as `data-*` attributes on one element:

```html
<div id="op-error"
     data-code="invalid_request_uri"
     data-description="request_uri has expired"
     data-state="abc">
  <h1>Authorization error</h1>
  ...
</div>
```

The page contains no script, style, or image, and every value is HTML-escaped, including the attacker-controlled `state`. It is served under the HTML driver's default policy, `default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`.

## CORS and cookies

When the SPA shell is served from the OP's origin, as in the snippets above, no CORS setup is needed and `credentials: "same-origin"` is correct.

When the SPA lives on another origin, add that origin with `op.WithCORSOrigins`. The ceremony (state route, `/end_session` confirmation) accepts only the issuer origin and origins you pass to `op.WithCORSOrigins`; a client's `redirect_uri` origin does not count for it. The origin must also be same-site with the issuer. A genuinely cross-site origin may pass the preflight, but the browser withholds the `__Host-` ceremony cookies (`__Host-oidc_interaction` is `SameSite=Lax`; `__Host-oidc_csrf` and `__Host-oidc_logout_csrf` are `SameSite=Strict`), and the state route answers `404`. Put the login UI on an issuer-sibling host such as `login.example.com` beside `op.example.com`, call the OP by its absolute URL, and use `credentials: "include"`. [CORS for SPA](/use-cases/cors-spa) covers the API side.

## Custom consent UI without a full SPA

To change only the consent wording, overlay keys with `op.WithLocale`; the bundled HTML driver picks them up and you keep its CSP and CSRF handling. To own the consent markup while the OP keeps the transport, use `op.WithConsentUI`, which cannot be combined with `op.WithSPAUI`. See [Custom consent UI](/use-cases/custom-consent-ui) and [i18n / locale negotiation](/use-cases/i18n).
