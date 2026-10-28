---
title: Minimal OP
description: Smallest runnable OP+RP pair — required OP options, a single password user, and one statically-registered client.
pageClass: pg-use-cases-minimal-op
---

# Use case — Minimal OP

This example gets an [Authorization Code + PKCE](/concepts/authorization-code-pkce) round-trip working with the shortest option list the library accepts. It starts the OP and a paired RP (the application that signs users in through it) in one process, so a browser can drive the whole flow with nothing else installed.

> **Source:** [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal)

## Architecture

<figure class="fig">
  <div class="fig-head">One Go process, nothing else running</div>
  <svg class="fig-svg" role="img" aria-labelledby="minimal-op-arch-title" viewBox="0 0 960 304" xmlns="http://www.w3.org/2000/svg">
    <title id="minimal-op-arch-title">A browser drives the bundled relying party, which speaks OIDC to the provider in the same process. The provider reads and writes an in-memory store and signs with an ephemeral keyset — no database and no key management to set up.</title>
    <!-- browser -->
    <rect class="fg-box fg-box--ext" x="32" y="132" width="144" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="160">Browser</text>
    <text class="fg-s" x="48" y="184">yours</text>
    <path class="fg-edge" d="M176,168 H216" marker-end="url(#fg-a)"/>
    <!-- process -->
    <rect class="fg-frame" x="216" y="24" width="712" height="256" rx="8"/>
    <text class="fg-lbl" x="240" y="52">a single Go process</text>
    <rect class="fg-box" x="240" y="132" width="144" height="72" rx="8"/>
    <text class="fg-t2" x="256" y="160">rpkit RP</text>
    <text class="fg-mxs" x="256" y="184">:9090</text>
    <path class="fg-edge" d="M384,168 H456" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="420" y="158" text-anchor="middle">OIDC</text>
    <rect class="fg-box fg-box--accent" x="456" y="132" width="160" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="472" y="160">op.New(…)</text>
    <text class="fg-mxs" x="472" y="184">:8080</text>
    <path class="fg-leader" d="M616,168 H640 M640,116 V220"/>
    <path class="fg-edge fg-edge--thin" d="M640,116 H672" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M640,220 H672" marker-end="url(#fg-a)"/>
    <!-- throwaway parts -->
    <rect class="fg-box fg-box--sub" x="672" y="80" width="232" height="72" rx="8"/>
    <text class="fg-m" x="688" y="108">inmem.Store</text>
    <text class="fg-s" x="688" y="132">gone on restart</text>
    <rect class="fg-box fg-box--sub" x="672" y="184" width="232" height="72" rx="8"/>
    <text class="fg-m" x="688" y="212">Keyset</text>
    <text class="fg-s" x="688" y="236">ephemeral ECDSA P-256</text>
  </svg>
  <figcaption class="fig-note">Both boxes on the right are deliberately throwaway. There is no database, no key management and no configuration file: everything inside the frame is created at start-up, and restarting loses every session and every key, which is exactly what you want while you are still finding out whether the flow works at all.</figcaption>
</figure>

The store is in-memory and the keys are generated at boot. The example seeds one demo user (`demo` / `demo`) and registers a [public client](/concepts/client-types) whose `redirect_uri` points back at the embedded RP.

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
  // seedUser hashes "demo"/"demo" with op.HashPassword and stores a
  // *store.User through st.PutUserWithPassword; see the example for the body.

  // One Primary step and no rules is the whole of a password-only login.
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

`WithIssuer`, `WithStore`, and `WithKeyset` are enough for `/.well-known/openid-configuration` and `/oidc/jwks` to answer. `WithCookieKeys` and `WithLoginFlow` (or `WithAuthenticators`) are required once the authorization-code grant is enabled, which it is by default, so a runnable OP takes five inputs. `op.LoginFlow` is marked `Experimental:` (see [Install: stability](/getting-started/install#stability)). Anything that involves a user (authorize, token, userinfo) also needs at least one client (`WithStaticClients`). [Getting started: minimal OP](/getting-started/minimal) walks through why each required option exists.

## What the OP exposes

The defaults mount under `/oidc` (override with `op.WithMountPrefix`):

| Path | Purpose |
|---|---|
| `/.well-known/openid-configuration` | [Discovery](/concepts/discovery) (always at the root, OIDC Discovery 1.0 §4) |
| `/oidc/jwks` | Public JWKS for ID Token / JWT access token verification |
| `/oidc/auth` | Authorization endpoint |
| `/oidc/token` | Token endpoint |
| `/oidc/userinfo` | UserInfo (RFC 6749 + OIDC Core §5.3) |
| `/oidc/end_session` | RP-Initiated Logout 1.0 |

The optional endpoints (`/par`, `/introspect`, `/revoke`, `/register` and the like) mount only when their feature or grant is enabled.

## What's missing for a real deployment

| Gap | Fix |
|---|---|
| Single demo user is hard-coded | Enrol users through your own management plane, or project your existing user table ([Bring your own user store](/use-cases/byo-userstore)). |
| Ephemeral keys: ID Tokens become unverifiable after a restart | Load keys from a vault, KMS or file. |
| In-memory store: all state is lost on restart | Switch to `op/storeadapter/sql` or `op/storeadapter/composite` ([Persistent storage](/use-cases/sql-store)). |
| Plain HTTP listener (`http://127.0.0.1`) | Front behind a TLS-terminating ingress; switch issuer to `https://`. |
| Single-factor (password only) | Add `RuleAlways(StepTOTP{...})` — see [MFA / step-up](/use-cases/mfa-step-up). |
| Demo RP code in `examples/internal/rpkit` | Production RPs use `golang.org/x/oauth2` + `github.com/coreos/go-oidc/v3` directly. |

[`examples/02-bundle`](https://github.com/libraz/go-oidc-provider/tree/main/examples/02-bundle) closes some of these gaps; see [Comprehensive bundle](/use-cases/bundle).

## Run it

```sh
git clone https://github.com/libraz/go-oidc-provider.git
cd go-oidc-provider
(cd examples/01-minimal && GOWORK=off go run -tags example .)
```

Then, in a browser:

1. Open `http://127.0.0.1:9090/` (the RP) and choose "Log in via the OP".
2. Sign in as `demo` / `demo`, then approve the consent prompt.
3. The RP lands on `/me` and shows the verified ID Token claims; `iss` is `http://127.0.0.1:8080`.

To see the OP's own metadata, `curl -s http://127.0.0.1:8080/.well-known/openid-configuration | jq`. If the round-trip stalls, restart the process: the keys are ephemeral, so every restart invalidates in-flight sessions.
