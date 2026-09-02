---
title: Minimal OP
description: Smallest runnable OP+RP pair — required OP options, a single password user, and one statically-registered client.
pageClass: pg-use-cases-minimal-op
---

# Use case — Minimal OP

You want a working Authorization Code + PKCE round-trip end-to-end with the absolute minimum option list. The upstream example brings the OP and a paired RP up in the same process so a browser can drive the full flow without any external setup.

> **Source:** [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal)

## Architecture

<figure class="fig">
  <div class="fig-head">One Go process, nothing else running</div>
  <svg class="fig-svg" role="img" aria-labelledby="minimal-op-arch-title" viewBox="0 0 960 232" xmlns="http://www.w3.org/2000/svg">
    <title id="minimal-op-arch-title">A browser drives the bundled relying party, which speaks OIDC to the provider in the same process. The provider reads and writes an in-memory store and signs with an ephemeral keyset — no database and no key management to set up.</title>
    <rect class="fg-box fg-box--ext" x="36" y="90" width="160" height="60" rx="8"/>
    <text class="fg-t2" x="116" y="114" text-anchor="middle">Browser</text>
    <text class="fg-xs" x="116" y="134" text-anchor="middle">yours</text>
    <path class="fg-edge" d="M200,120 H258" marker-end="url(#fg-a)"/>
    <rect class="fg-frame" x="236" y="40" width="688" height="172" rx="10"/>
    <text class="fg-lbl" x="252" y="62">a single Go process</text>
    <rect class="fg-box" x="266" y="76" width="200" height="70" rx="8"/>
    <text class="fg-t2" x="366" y="104" text-anchor="middle">rpkit RP</text>
    <text class="fg-mxs" x="366" y="124" text-anchor="middle">:9090</text>
    <path class="fg-edge" d="M470,111 H512" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="491" y="104" text-anchor="middle">OIDC</text>
    <rect class="fg-box fg-box--accent" x="516" y="76" width="200" height="70" rx="8"/>
    <text class="fg-m fg-accent" x="616" y="104" text-anchor="middle">op.New(…)</text>
    <text class="fg-mxs" x="616" y="124" text-anchor="middle">:8080</text>
    <path class="fg-edge fg-edge--thin" d="M720,97 H752" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M720,151 H752" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--sub" x="756" y="76" width="148" height="42" rx="6"/>
    <text class="fg-mxs" x="772" y="94">inmem.Store</text>
    <text class="fg-xs" x="772" y="110">gone on restart</text>
    <rect class="fg-box fg-box--sub" x="756" y="130" width="148" height="54" rx="6"/>
    <text class="fg-mxs" x="772" y="148">Keyset</text>
    <text class="fg-xs" x="772" y="164">ephemeral</text>
    <text class="fg-xs" x="772" y="178">ECDSA P-256</text>
    <text class="fg-xs" x="252" y="196">no database, no key management, no configuration file — everything above is created at start-up</text>
  </svg>
  <figcaption class="fig-note">Both boxes on the right are deliberately throwaway. Restarting loses every session and every key, which is exactly what you want while you are still finding out whether the flow works at all.</figcaption>
</figure>

The library is one process. The store is in-memory. Keys are generated at boot. The example seeds one demo user (`demo`/`demo`) and registers a public client whose `redirect_uri` points back at the embedded RP.

## Code (essentials)

```go
package main

import (
  "log"
  "net/http"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

func main() {
  keys := /* devkeys.MustEphemeral("minimal-1") in the example */
  st := inmem.New()
  // seedUser hashes "demo"/"demo" via op.HashPassword and PUTs a
  // *store.User into st.UserPasswords(); see the example for the body.

  // The upstream example uses opkit.DefaultLoginFlow(st.UserPasswords())
  // from examples/internal/opkit — a thin wrapper that constructs the
  // same value below. The public API is the LoginFlow struct shown here;
  // import opkit only if you are reading the example's source, not for
  // production code.
  flow := op.LoginFlow{
    Primary: op.PrimaryPassword{Store: st.UserPasswords()},
  }

  provider, err := op.New(
    op.WithIssuer("http://127.0.0.1:8080"),
    op.WithStore(st),
    op.WithKeyset(keys.Keyset()),
    op.WithCookieKeys(keys.CookieKey),
    op.WithLoginFlow(flow),
    op.WithStaticClients(op.PublicClient{
      ID:           "demo-rp",
      RedirectURIs: []string{"http://127.0.0.1:9090/callback"},
      Scopes:       []string{"openid", "profile"},
    }),
  )
  if err != nil {
    log.Fatalf("op.New: %v", err)
  }

  mux := http.NewServeMux()
  mux.Handle("/", provider)
  log.Fatal(http.ListenAndServe(":8080", mux))
}
```

`WithIssuer`, `WithStore`, and `WithKeyset` on their own let `/oidc/.well-known/openid-configuration` and `/oidc/jwks` answer. `WithCookieKeys` becomes required as soon as the authorization-code grant is enabled, which is the default browser-flow setup. Everything that depends on a user (authorize, token, userinfo) also needs the `WithLoginFlow` + `WithStaticClients` pair. [`getting-started/minimal`](/getting-started/minimal) shows the discovery-only shape if that is what you want.

## What the OP exposes

The defaults mount under `/oidc` (override with `op.WithMountPrefix`):

| Path | Purpose |
|---|---|
| `/.well-known/openid-configuration` | Discovery (always at root, OIDC Discovery 1.0 §4) |
| `/oidc/jwks` | Public JWKS for ID Token / JWT access token verification |
| `/oidc/auth` | Authorization endpoint |
| `/oidc/token` | Token endpoint |
| `/oidc/userinfo` | UserInfo (RFC 6749 + OIDC Core §5.3) |
| `/oidc/end_session` | RP-Initiated Logout 1.0 |

Optional endpoints (`/par`, `/introspect`, `/revoke`, `/register`, `/interaction/*`, `/session/*`) only mount when their corresponding feature is enabled.

## What's missing for a real deployment

| Gap | Fix |
|---|---|
| Single demo user is hard-coded | Enrol users through your own management plane and `store.User` PUTs. |
| Ephemeral keys → ID Tokens become unverifiable on restart | Load from a vault / KMS / file. |
| In-memory store → state lost on restart | Switch to `op/storeadapter/sql` or `op/storeadapter/composite`. |
| Plain HTTP listener (`http://127.0.0.1`) | Front behind a TLS-terminating ingress; switch issuer to `https://`. |
| Single-factor (password only) | Add `RuleAlways(StepTOTP{...})` — see [MFA / step-up](/use-cases/mfa-step-up). |
| Demo RP code in `examples/internal/rpkit` | Production RPs use `golang.org/x/oauth2` + `github.com/coreos/go-oidc/v3` directly. |

[`examples/02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) fills these in for a "comprehensive embedder" reference.

## Run it

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
# in another terminal:
curl -s http://localhost:8080/.well-known/openid-configuration | jq
```
