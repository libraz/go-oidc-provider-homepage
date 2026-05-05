---
title: Client onboarding patterns
description: Five ways to register, update, and remove RPs against your OP — when each fits, code seams, and what the library deliberately does not ship.
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
