---
title: Minimal OP
description: Smallest runnable OP+RP pair — four required options, a single password user, and one statically-registered client.
---

# Use case — Minimal OP

You want a working Authorization Code + PKCE round-trip end-to-end with the absolute minimum option list. The upstream example brings the OP and a paired RP up in the same process so a browser can drive the full flow without any external setup.

> **Source:** [`examples/01-minimal/main.go`](https://github.com/libraz/go-oidc-provider/tree/main/examples/01-minimal)

## Architecture

<style scoped>
.d-label{font-family:var(--vp-font-family-base);font-size:13px;fill:var(--vp-c-text-1);}
.d-sub{font-family:var(--vp-font-family-base);font-size:11px;fill:var(--vp-c-text-2);}
.d-mono{font-family:var(--vp-font-family-mono);font-size:11.5px;fill:var(--vp-c-text-1);}
.d-mono-2{font-family:var(--vp-font-family-mono);font-size:11px;fill:var(--vp-c-text-2);}
.d-mono-sm{font-family:var(--vp-font-family-mono);font-size:9.5px;fill:var(--vp-c-text-2);}
.op-accent{stroke:var(--vp-c-brand-2);}
</style>

<svg role="img" aria-labelledby="minimal-op-arch-title" viewBox="0 12 720 266" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;height:auto;margin:1.5rem auto;display:block;">
  <title id="minimal-op-arch-title">A single Go process: a browser drives the rpkit RP, which speaks OIDC to op.New; the OP reads and writes the in-memory store and signs with an ephemeral keyset.</title>
  <rect x="150" y="28" width="560" height="246" rx="10" stroke-opacity="0.4"/>
  <text class="d-sub" x="166" y="49">Single process</text>
  <rect x="16" y="122" width="104" height="56" rx="6"/>
  <text class="d-label" x="68" y="154" text-anchor="middle">Browser</text>
  <rect x="180" y="118" width="118" height="64" rx="6"/>
  <text class="d-label" x="239" y="146" text-anchor="middle">rpkit RP</text>
  <text class="d-mono-2" x="239" y="164" text-anchor="middle">:9090</text>
  <rect class="op-accent" x="360" y="110" width="150" height="80" rx="6"/>
  <text class="d-mono" x="435" y="146" text-anchor="middle">op.New(…)</text>
  <text class="d-mono-2" x="435" y="164" text-anchor="middle">:8080</text>
  <rect x="560" y="44" width="140" height="48" rx="6" stroke-dasharray="5 4"/>
  <text class="d-mono" x="630" y="72" text-anchor="middle">inmem.Store</text>
  <rect x="560" y="190" width="140" height="64" rx="6"/>
  <text class="d-label" x="630" y="216" text-anchor="middle">Keyset</text>
  <text class="d-mono-sm" x="630" y="234" text-anchor="middle">ephemeral ECDSA P-256</text>
  <path d="M120,150 H180"/>
  <polyline points="172,145 180,150 172,155"/>
  <path d="M298,150 H360"/>
  <polyline points="352,145 360,150 352,155"/>
  <path d="M510,138 H540 V68 H560"/>
  <polyline points="552,63 560,68 552,73"/>
  <polyline points="518,133 510,138 518,143"/>
  <path d="M510,162 H540 V222 H560"/>
  <polyline points="552,217 560,222 552,227"/>
</svg>

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

The four required options (`WithIssuer`, `WithStore`, `WithKeyset`, `WithCookieKeys`) on their own would let `/oidc/.well-known/openid-configuration` and `/oidc/jwks` answer; everything that depends on a user (authorize, token, userinfo) needs the `WithLoginFlow` + `WithStaticClients` pair. [`getting-started/minimal`](/getting-started/minimal) shows the four-option discovery-only shape if that is what you want.

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
(cd examples/01-minimal && go run -tags example .)
# in another terminal:
curl -s http://localhost:8080/.well-known/openid-configuration | jq
```
