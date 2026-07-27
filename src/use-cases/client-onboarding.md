---
title: Client onboarding patterns
description: Five ways to register, update, and remove RPs against your OP — when each fits, code seams, and what the library deliberately does not ship.
pageClass: pg-use-cases-client-onboarding
---

# Use case — Client onboarding patterns

"Creating an OAuth/OIDC client" has at least five operational shapes, and only one of them is specified by an IETF / OIDF document. This page is the map: when each pattern fits, the library seam it lands on, and the security envelope that comes with it. The standardised path is [Dynamic Client Registration](/use-cases/dynamic-registration); the other four are operator design space, and the boundary between "library responsibility" and "embedder responsibility" is sharper than it looks.

::: details Specs referenced on this page
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration Protocol
- [RFC 7592](https://datatracker.ietf.org/doc/html/rfc7592) — Dynamic Client Registration Management
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) §10.1 (client authentication) / §10.6 (CSRF) — security framing
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps (redirect URI shape rules)
:::

## At a glance — five patterns

<svg id="onbo-spectrum" role="img" aria-labelledby="onbo-spectrum-title" viewBox="0 0 716 236" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
<title id="onbo-spectrum-title">The five client-onboarding patterns placed on a trust spectrum from fully operator-controlled (static registration) to no trust on the wire (out-of-band CLI); the middle two patterns are gated by a token carried on the wire.</title>
<g>
<rect class="card" x="14" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="34" cy="30" r="11"/>
<text class="lbl" x="34" y="34" text-anchor="middle" font-size="10.5" font-weight="700">1</text>
<text class="lbl" x="24" y="58" font-size="10.5" font-weight="600">Static</text>
<text class="lbl" x="24" y="72" font-size="10.5" font-weight="600">registration</text>
<line class="divider" x1="24" y1="82" x2="132" y2="82"/>
<text class="lbl muted" x="24" y="96" font-size="7" letter-spacing=".1em">TRUST GATE</text>
<text class="lbl" x="24" y="110" font-size="9">Operator</text>
<text class="lbl" x="24" y="123" font-size="9">config</text>
<rect class="seam" x="24" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="78" y="145" text-anchor="middle" font-size="7.5">WithStaticClients</text>
</g>
<g>
<rect class="card" x="154" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="174" cy="30" r="11"/>
<text class="lbl" x="174" y="34" text-anchor="middle" font-size="10.5" font-weight="700">2</text>
<text class="lbl" x="164" y="58" font-size="10.5" font-weight="600">IaC /</text>
<text class="lbl" x="164" y="72" font-size="10.5" font-weight="600">GitOps</text>
<line class="divider" x1="164" y1="82" x2="272" y2="82"/>
<text class="lbl muted" x="164" y="96" font-size="7" letter-spacing=".1em">TRUST GATE</text>
<text class="lbl" x="164" y="110" font-size="9">Operator's</text>
<text class="lbl" x="164" y="123" font-size="9">CI pipeline</text>
<rect class="seam store" x="164" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="218" y="145" text-anchor="middle" font-size="7.5">store.ClientRegistry</text>
</g>
<g>
<rect class="card op-accent" x="294" y="10" width="128" height="162" rx="8"/>
<circle class="badge op-accent" cx="314" cy="30" r="11"/>
<text class="lbl op-fill" x="314" y="34" text-anchor="middle" font-size="10.5" font-weight="700">3</text>
<text class="lbl op-fill" x="304" y="58" font-size="10.5" font-weight="600">Standardised</text>
<text class="lbl op-fill" x="304" y="72" font-size="10.5" font-weight="600">DCR</text>
<line class="divider" x1="304" y1="82" x2="412" y2="82"/>
<text class="lbl muted" x="304" y="96" font-size="7" letter-spacing=".1em">TRUST GATE</text>
<text class="lbl" x="304" y="110" font-size="9">Minted IAT,</text>
<text class="lbl" x="304" y="123" font-size="9">per-client RAT</text>
<rect class="seam op-accent" x="304" y="132" width="108" height="20" rx="4"/>
<text class="mono op-fill" x="358" y="145" text-anchor="middle" font-size="7.5">/register</text>
</g>
<g>
<rect class="card" x="434" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="454" cy="30" r="11"/>
<text class="lbl" x="454" y="34" text-anchor="middle" font-size="10.5" font-weight="700">4</text>
<text class="lbl" x="444" y="58" font-size="10.5" font-weight="600">Scope-protected</text>
<text class="lbl" x="444" y="72" font-size="10.5" font-weight="600">admin API</text>
<line class="divider" x1="444" y1="82" x2="552" y2="82"/>
<text class="lbl muted" x="444" y="96" font-size="7" letter-spacing=".1em">TRUST GATE</text>
<text class="lbl" x="444" y="110" font-size="9">Management AT</text>
<text class="lbl" x="444" y="123" font-size="9">(scope + claim)</text>
<rect class="seam store" x="444" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="498" y="145" text-anchor="middle" font-size="7.5">store.ClientRegistry</text>
</g>
<g>
<rect class="card" x="574" y="10" width="128" height="162" rx="8"/>
<circle class="badge" cx="594" cy="30" r="11"/>
<text class="lbl" x="594" y="34" text-anchor="middle" font-size="10.5" font-weight="700">5</text>
<text class="lbl" x="584" y="58" font-size="10.5" font-weight="600">Out-of-band</text>
<text class="lbl" x="584" y="72" font-size="10.5" font-weight="600">CLI</text>
<line class="divider" x1="584" y1="82" x2="692" y2="82"/>
<text class="lbl muted" x="584" y="96" font-size="7" letter-spacing=".1em">TRUST GATE</text>
<text class="lbl" x="584" y="110" font-size="9">None —</text>
<text class="lbl" x="584" y="123" font-size="9">off the wire</text>
<rect class="seam store" x="584" y="132" width="108" height="20" rx="4"/>
<text class="mono" x="638" y="145" text-anchor="middle" font-size="7.5">RegisterClient</text>
</g>
<line class="hair" x1="78" y1="172" x2="78" y2="194"/>
<line class="hair" x1="218" y1="172" x2="218" y2="194"/>
<line class="hair" x1="358" y1="172" x2="358" y2="194"/>
<line class="hair" x1="498" y1="172" x2="498" y2="194"/>
<line class="hair" x1="638" y1="172" x2="638" y2="194"/>
<line class="axis" x1="24" y1="194" x2="692" y2="194"/>
<path class="axis" d="M32 189 L24 194 L32 199"/>
<path class="axis" d="M684 189 L692 194 L684 199"/>
<line class="band" x1="358" y1="194" x2="498" y2="194"/>
<text class="lbl muted" x="24" y="212" font-size="8.5">Fully operator</text>
<text class="lbl muted" x="24" y="224" font-size="8.5">controlled</text>
<text class="lbl muted" x="692" y="212" text-anchor="end" font-size="8.5">No trust</text>
<text class="lbl muted" x="692" y="224" text-anchor="end" font-size="8.5">on the wire</text>
<text class="lbl muted" x="428" y="214" text-anchor="middle" font-size="8.5">trust carried on the wire</text>
</svg>

| Pattern | Trust gate | Who writes the metadata | Best fit |
|---|---|---|---|
| Static registration | Operator config | Operator at deploy time | Fixed roster of internal apps |
| IaC / GitOps provisioning | Operator's CI pipeline | Pipeline writes via `store.ClientRegistry` | RP definitions live in source control |
| Standardised DCR (RFC 7591 + 7592) | Operator-minted IAT, per-client RAT | RP itself, via `/register` | Multi-tenant SaaS, developer self-serve |
| Scope-protected admin API | Management client AT (scope + claim define boundary) | Embedder's own HTTP handler → `store.ClientRegistry` | Central control-plane / IDM GUI |
| Out-of-band CLI / admin tool | Out-of-band auth (none on the wire) | Admin binary writes the store directly | SRE batch import, recovery |

If you only care about standardised flows, stop after row 3. Rows 4 and 5 are vendor design space — the library exposes the seams but does not ship the surface, because the security envelope is application-specific.

## 1. Static registration

The simplest shape, and the one most embedders start with. `op.WithStaticClients` accepts a variadic list of `op.ClientSeed` builders; each builder projects onto a `store.Client` record at construction time, and the records are pinned with `Source: ClientSourceStatic` so they are eligible for first-party auto-consent.

```go
pubJWKS, err := op.LoadPublicJWKS("conformance/keys/fapi-client.jwks.json")
if err != nil { /* ... */ }

provider, err := op.New(
  /* required options */
  op.WithStaticClients(
    op.ConfidentialClient{
      ID:           "billing-app",
      Secret:       "rotate-me",
      AuthMethod:   op.AuthClientSecretBasic,
      RedirectURIs: []string{"https://billing.example.com/callback"},
      Scopes:       []string{"openid", "profile"},
      GrantTypes:   []string{"authorization_code", "refresh_token"},
    },
    op.PublicClient{
      ID:           "billing-spa",
      RedirectURIs: []string{"https://app.example.com/callback"},
      Scopes:       []string{"openid", "profile"},
    },
    op.PrivateKeyJWTClient{
      ID:           "fapi-rp",
      JWKS:         pubJWKS,
      RedirectURIs: []string{"https://rp.example.com/callback"},
      Scopes:       []string{"openid"},
    },
  ),
)
```

The seed projection enforces the same redirect-URI shape rules at `op.New` time that DCR enforces at `POST /register`, so a malformed seed fails the constructor instead of leaking through to runtime. `ConfidentialClient.Secret` is hashed via `op.HashClientSecret` (argon2id) before the record reaches the store; the plaintext never persists.

Against a persistent backend the seeds are applied as **one atomic, idempotent batch** through `store.StaticClientReconciler`: missing records are inserted, records already equivalent are left alone, and a record that diverges from a stored one — or collides with a dynamically registered client — fails with `ErrConflict`. The reconciliation runs after every other fallible build step, so a boot that fails for an unrelated reason never leaves half the roster written. Restarting an OP with an unchanged seed list is therefore a no-op rather than a rewrite.

This is the right pattern when the RP roster is short, owned by the same team that runs the OP, and changes through the same deployment pipeline as any other config.

## 2. IaC / GitOps provisioning

When the RP roster lives in source control — a Terraform / Pulumi module, a Kustomize overlay, a Helm values file — you want a provisioning binary that reads the manifest and writes the OP store directly. The library exposes the write path through `store.ClientRegistry`; any backend that supports DCR satisfies it.

```go
storage, err := oidcsql.New(db, oidcsql.Postgres())
if err != nil { /* ... */ }

registry, ok := storage.Clients().(store.ClientRegistry)
if !ok {
  return fmt.Errorf("backend does not support client writes")
}

for _, plan := range desired {
  hash, err := op.HashClientSecret(plan.Secret)
  if err != nil { /* ... */ }
  c := &store.Client{
    ID:                      plan.ID,
    RedirectURIs:            plan.RedirectURIs,
    Scopes:                  plan.Scopes,
    GrantTypes:              plan.GrantTypes,
    ResponseTypes:           []string{"code"},
    TokenEndpointAuthMethod: op.AuthClientSecretBasic.String(),
    SecretHash:              hash,
    Source:                  store.ClientSourceAdmin,
  }
  if err := registry.RegisterClient(ctx, c); errors.Is(err, store.ErrAlreadyExists) {
    err = registry.UpdateClient(ctx, c)
  }
  if err != nil { /* ... */ }
}
```

`store.ClientSourceAdmin` is the right discriminator here: it leaves the record eligible for first-party auto-consent (same as `ClientSourceStatic`) but is distinguishable in audit-log analysis from records the OP itself created via `/register`. The provisioning binary is responsible for shape validation before the write — `RegisterClient` is a raw store write and does not run the registration handler's rule set. If the OP holds a long-running in-memory client cache, plan for invalidation (a SIGHUP-driven reload, a small admin endpoint your binary calls, or the natural cache expiry your backend exposes).

Treat the secret material in the manifest the way you treat any other deploy-time credential: encrypted state, narrow read scope on the CI principal, no echo in CI logs.

## 3. Standardised DCR (RFC 7591 + 7592)

When the RP is on the other side of an organisational boundary — a tenant in a multi-tenant SaaS, a partner in an integration marketplace, a developer signing up to your platform — you want a JSON API the RP can call itself. RFC 7591 / RFC 7592 specify exactly that surface, and `op.WithDynamicRegistration` mounts it.

```go
provider, err := op.New(
  /* required options */
  op.WithDynamicRegistration(op.RegistrationOption{
    AllowedGrantTypes:    []string{"authorization_code", "refresh_token"},
    AllowedResponseTypes: []string{"code"},
  }),
)

iat, err := provider.IssueInitialAccessToken(ctx, op.InitialAccessTokenSpec{
  TTL:     1 * time.Hour,
  MaxUses: 1,
})
```

Hand `iat.Value` to the RP out-of-band. Keep the TTL short and `MaxUses: 1` so a leaked IAT cannot be replayed. The RP receives a `registration_access_token` (RAT) in the 201 response and uses it for RFC 7592 read / update / delete operations on its own registration only — RFC 7592 §2 is explicit that a RAT for client A must not authorise operations on client B. See [Dynamic Client Registration](/use-cases/dynamic-registration) for the full surface, including the safety-floor rules the validator enforces and the metadata fields that round-trip.

## 4. Scope-protected admin API

This is the pattern most vendor SaaS providers ship as "the admin API", and the one the library deliberately does not ship. The shape is well-known: a privileged "management client" obtains an access token bearing scopes such as `client.read` / `client.write` (and optionally a `tenant=acme` claim), and the embedder's own HTTP handler verifies the AT, decodes the scope and tenant boundary, and calls `store.ClientRegistry`.

```go
// 1. Static seed for the management client.
op.WithStaticClients(
  op.ConfidentialClient{
    ID:         "control-plane",
    Secret:     "rotate-me",
    AuthMethod: op.AuthClientSecretBasic,
    GrantTypes: []string{"client_credentials"},
    Scopes:     []string{"client.read", "client.write"},
  },
)

// 2. Embedder-owned admin handler (sketch).
func adminCreateClient(registry store.ClientRegistry) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
    intro, err := postIntrospect(r.Context(), bearer) // your HTTP call to /introspect
    if err != nil || !intro.Active || !hasScope(intro.Scope, "client.write") {
      http.Error(w, "forbidden", http.StatusForbidden)
      return
    }
    var c store.Client
    if err := json.NewDecoder(r.Body).Decode(&c); err != nil { /* 400 */ }
    if err := embedderValidate(&c, intro); err != nil { /* 400 */ } // see warnings below
    c.Source = store.ClientSourceAdmin
    if err := registry.RegisterClient(r.Context(), &c); err != nil { /* map error */ }
    // emit your own audit event here — the library's AuditDCR* events do not fire on this path.
    w.WriteHeader(http.StatusCreated)
  }
}
```

The library mounts no such handler. Whether it lives on the public OP host, a separate admin host, or only inside the cluster network is a deployment choice; none of those choices is the security boundary. The boundary is the access token your handler validates before touching the store, which means you are signing up to enforce the rules below.

::: warning Security envelope of pattern 4
- **Compromise of a management AT equals takeover of every client in its scope.** Keep the AT TTL short, and require sender-constraint (DPoP or mTLS) on the management client so a stolen bearer cannot be replayed off-host.
- **Privilege-escalation guard.** The handler MUST refuse metadata that would create or upgrade a client into grant types, scopes, or FAPI capabilities the calling AT does not itself possess. `store.ClientRegistry` is a raw write — it does not perform this check, and skipping it is the canonical way these APIs become CVE-bearing.
- **Tenant boundary.** If you have multi-tenancy, it is enforced only by your handler reading the calling AT's tenant claim and filtering reads / scoping writes accordingly. The library has no tenant concept.
- **Audit logging.** Every CRUD operation MUST be logged with the calling `client_id` and the target `client_id`. The library's `op.AuditDCR*` events fire only for `/register` (the path the OP itself owns); your admin API is invisible to that catalogue.
- **Validate `redirect_uris` (and friends) yourself.** `RegisterClient` does not run the RFC 8252 / OIDC Registration §2 rules that DCR's handler runs. Mirror the rule list from [Dynamic Client Registration → Safety floors](/use-cases/dynamic-registration#safety-floors-that-are-not-negotiable) and [What registration enforces today](/use-cases/dynamic-registration#what-registration-enforces-today): redirect-URI shape per `application_type`, `jwks` / `jwks_uri` exclusivity, https-only URI fields, `sector_identifier_uri` containment.
- **Never echo `client_secret` in audit logs.** Hash before logging; treat the plaintext the way RFC 7591 §3.2.1 treats it — one-shot material returned exactly once.
- **Rate-limit the endpoint.** JWKS fetches and `sector_identifier_uri` validation cost real I/O, and an unbounded admin endpoint is a useful DoS amplifier.
:::

## 5. Out-of-band CLI / admin tool

When pattern 4 is too much surface — an SRE batch import, a recovery flow, a local migration script — a binary that opens the store directly and calls `RegisterClient` is the lowest-overhead option.

```go
storage, err := oidcsql.New(db, oidcsql.Postgres())
if err != nil { /* ... */ }
registry := storage.Clients().(store.ClientRegistry)

c := &store.Client{
  ID:                      "support-tool",
  RedirectURIs:            []string{"https://support.example.com/callback"},
  GrantTypes:              []string{"authorization_code", "refresh_token"},
  ResponseTypes:           []string{"code"},
  TokenEndpointAuthMethod: op.AuthNone.String(),
  PublicClient:            true,
  Source:                  store.ClientSourceAdmin,
}
if err := registry.RegisterClient(ctx, c); err != nil { /* ... */ }
```

This bypasses every library-side handler — the validation that lives next to `/register` does not run, because the request never traverses the HTTP surface. The binary therefore has to mirror the same shape rules locally before the write: redirect-URI form per `application_type`, `jwks` / `jwks_uri` exclusivity, https-only URI fields, no fragments, no wildcard hosts. Audit is the operator's responsibility (the binary's own log, the OS audit subsystem, or a structured event written to the same sink the OP uses). If the OP holds an in-memory client cache, plan for invalidation the same way pattern 2 does.

## What the library deliberately does NOT ship

- **No scope-protected admin endpoint at `/admin/clients` or similar.** Vendor SaaS providers tend to ship one; this library does not. There is no IETF / OIDF spec for that surface, and the security envelope (privilege escalation, tenant boundaries, audit) is application-specific. A generic implementation would push embedders to under-customise the security layer.
- **`software_statement` (RFC 7591 §2.3) is not accepted.** A registration request that includes the field is rejected with `invalid_software_statement`. Federation / signed-statement trust chains are out of scope today.
- **OpenID Federation 1.0 trust chains** are not implemented.
- **No programmatic `Provider.IntrospectAccessToken(ctx, token)` method.** Embedders verifying ATs from their own admin handler call `/introspect` over HTTP and parse the JSON response. For JWT-format ATs the embedder *can* verify against the OP's JWKS in-process, but doing so loses revocation visibility — `/introspect` is the recommended path for admin operations where the cost of a misuse is high enough that the extra round-trip is cheap insurance.

## Read next

- [Dynamic Client Registration](/use-cases/dynamic-registration) — RFC 7591 / 7592 detail, including the safety-floor rules pattern 4 and pattern 5 must mirror.
- [Public / internal scopes](/use-cases/scopes) — designing the scope vocabulary your management client uses.
- [Design judgments](/security/design-judgments) — why specific defaults (e.g. `software_statement` rejection) are deliberate.
