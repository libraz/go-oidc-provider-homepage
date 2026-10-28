---
title: Pairwise subject (OIDC Core §8.1)
description: Per-sector pseudonymous sub claims — privacy-preserving multi-tenant SaaS, deterministic across processes, mid-life switching forbidden.
pageClass: pg-use-cases-pairwise-subject
---

# Use case — Pairwise subject (OIDC Core §8.1)

By default the OP issues the same `sub` claim to every client about a given user. Two relying parties that compare notes can correlate — they are looking at the same identifier.

OIDC Core §8.1 defines a **pairwise** subject strategy: derive `sub` per-sector so each RP (or each sector of RPs) sees a different opaque identifier for the same user. Same user across two sectors → two different `sub` values → no cross-RP correlation.

The OP supports pairwise via `op.WithPairwiseSubject(salt)`.

::: details Public vs pairwise — what's the difference?
**Public** subject mode means every RP sees the same `sub` for the same user — convenient when you control the RPs and want to join data across them. **Pairwise** mode rewrites `sub` per "sector" (typically per RP host) so the same user looks like a different person to each sector. The trade-off is privacy vs joinability: pairwise prevents cross-RP correlation but also stops you (the operator) from quickly noticing the same user is registered with two RPs.
:::

::: details Sector identifier — what's that?
The "sector" is the unit pairwise groups RPs into. By default it is the host of the RP's redirect URI — `https://app.example.com/cb` and `https://api.example.com/cb` would land in different sectors. RPs that legitimately span hosts (a webapp + a mobile-deeplink callback) publish a `sector_identifier_uri` whose host overrides the default and whose JSON document lists every redirect URI that belongs to the sector. This is how the OP knows two superficially different hosts should see the same `sub`.
:::

::: details UUIDv7 default — what's that?
When pairwise is **not** enabled, the OP's default subject generator mints a fresh UUIDv7 per user (time-ordered random). UUIDv7 is preferred over UUIDv4 because it is sortable by issue time, which makes index locality on the user table much better. Public mode hashes nothing; it just remembers the UUID for each user. Pairwise mode bypasses this entirely and recomputes `sub` deterministically for each (sector, user) pair.
:::

## When you want pairwise

- **Multi-tenant SaaS** where each tenant must not know that user X also exists in tenant Y.
- **Privacy-conscious deployments** where the regulator asks for sector-bound identifiers (eIDAS, several country-specific identity programs).
- **Federation aggregators** where you front many downstream RPs and don't want them to correlate users.

If your RPs are all first-party (you own them all and they share databases anyway), pairwise adds friction without privacy benefit. Use the default UUIDv7 strategy.

## Wiring

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

st := inmem.New()
loginFlow := op.LoginFlow{Primary: op.PrimaryPassword{Store: st.UserPasswords()}}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(st),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(loginFlow),

  op.WithPairwiseSubject(pairwiseSalt), // pairwiseSalt: []byte, ≥ 32 bytes
)
```

Activating the option:

- Adds `pairwise` to discovery's `subject_types_supported` (alongside `public`).
- Permits clients to register `subject_type=pairwise` (via static seeds or DCR).
- Per-client opt-in: clients with `subject_type=public` (or unset → public) keep the default UUIDv7 sub. Pairwise is per-client, not per-OP.
- Gives every client that opts in a pairwise `sub` in the ID Token, at `/userinfo` and in introspection, for every grant type that records a grant (authorization code, device code, CIBA, token exchange). The internal user id is never exposed. A custom grant gets the pairwise `sub` at `/userinfo` only if its handler records the grant.

::: warning Salt requirements
The salt MUST be at least 32 bytes / 256 bits. Embedders SHOULD pull it from a KMS / Vault / Secrets Manager. A salt baked into the source tree or a `.env` file is treated as low-trust. Re-using the salt across deployments is intentional, since pairwise sub values are deterministic across processes that share the salt. **Rotating the salt changes every `sub`.** The library does not detect a changed salt at start-up (the construction-time gate guards the subject *mode*, see below), so treat the salt as immutable for the life of the issuer.
:::

## How sub is derived

The OP computes:

```
sub = base64url-no-pad( SHA-256( salt || ":" || sector || ":" || internal_user_id ) )
```

::: details Salted SHA-256 derivation — what's that?
SHA-256 is a one-way hash: it turns any input into a fixed 256-bit value that cannot be run backwards. Prefixing the input with a secret (the salt) gives the two properties pairwise needs. (1) The same inputs always give the same output, so a restart still computes Alice's `sub` for sector A correctly. (2) Without the salt, an attacker who holds some issued `sub` values and a guess at the internal user id cannot check the guess. The `:` separators keep (sector, user) pairs unambiguous even when a value contains a colon. The OP base64url-encodes the 256-bit output so it fits the JWT `sub` string slot.
:::

::: details Salt — what's that?
A high-entropy secret (≥ 256 bits) shared across every replica of the OP. It is the secret input to the hash above; changing it changes every `sub`. Operators should pull it from KMS / Vault rather than checking it into source, because anyone with the salt can recompute every user's `sub` for every sector.
:::

::: details Subject mode — what's that?
"Public", "pairwise" or "custom" (a generator supplied with `op.WithSubjectGenerator`). The OP records the active mode in its metadata substore (under `store.SubjectModeKey`, next to the `__op_init` sentinel) at first construction, and every later boot must match. Switching strategies on a non-empty store would silently re-key every issued grant, breaking refresh-token rotation and introspection consistency, so a mismatch fails `op.New` with `ErrSubjectModeMismatch`. A store without a metadata substore skips the check and logs a warning.
:::

::: info Reusing the generator outside the OP
`provider.SubjectGenerator()` returns the same generator instance the OP was built with. Use it when an admin report, audit job, or migration needs to derive the same `sub` values without sending a browser through `/auth`.

When `WithPairwiseSubject` is enabled, issuance still decides per client: `subject_type=pairwise` uses pairwise derivation, while `public` or unset uses the default UUIDv7 subject. Out-of-band code that needs the exact issued `sub` must inspect the client's `SubjectType` before calling the generator.
:::

Where `sector` is a lower-cased hostname without port:

1. The host of the client's `sector_identifier_uri` (when registered).
2. **Or** the host of the client's single registered redirect URI (when `sector_identifier_uri` is empty).

A client whose redirect URIs span several hosts and that has no `sector_identifier_uri` has no resolvable sector. Registration (and a static seed at `op.New`) rejects it; a record that reaches the store another way fails at issuance with `server_error`. Operators MUST require `sector_identifier_uri` for clients that span hosts.

<figure class="fig">
  <div class="fig-head">One user, a different subject per sector</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-pairwise-title" viewBox="0 0 960 352" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-pairwise-title">A single internal user id derives a different subject for each RP sector. The sector comes from the client's sector_identifier_uri, and the salt never leaves the OP, so two relying parties cannot correlate the same person across them.</title>
    <!-- inputs -->
    <rect class="fg-box" x="32" y="36" width="224" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="64">One user</text>
    <text class="fg-mxs" x="48" y="88">internal_user_id</text>
    <rect class="fg-box fg-box--sub" x="32" y="164" width="224" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="192">salt</text>
    <text class="fg-s" x="48" y="216">from your KMS or Vault</text>
    <path class="fg-leader" d="M256,72 H280 M256,200 H280 M280,72 V200"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M280,72 H312" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M280,200 H312" marker-end="url(#fg-ac)"/>
    <!-- sector a -->
    <rect class="fg-box fg-box--accent" x="312" y="36" width="288" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="328" y="64">The OP derives a sub</text>
    <text class="fg-mxs" x="328" y="88">sector = a.example.com</text>
    <path class="fg-edge fg-edge--accent" d="M600,72 H640" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="640" y="24" width="288" height="96" rx="8"/>
    <text class="fg-t2" x="656" y="52">RP A</text>
    <text class="fg-mxs" x="656" y="76">sector_identifier_uri</text>
    <text class="fg-mxs fg-accent" x="656" y="100">sub = 7bQ…Xa</text>
    <!-- sector b -->
    <rect class="fg-box fg-box--accent" x="312" y="164" width="288" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="328" y="192">The OP derives a sub</text>
    <text class="fg-mxs" x="328" y="216">sector = b.example.com</text>
    <path class="fg-edge fg-edge--accent" d="M600,200 H640" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="640" y="152" width="288" height="96" rx="8"/>
    <text class="fg-t2" x="656" y="180">RP B</text>
    <text class="fg-mxs" x="656" y="204">sector_identifier_uri</text>
    <text class="fg-mxs fg-accent" x="656" y="228">sub = k9P…Zb</text>
    <!-- formula -->
    <rect class="fg-box fg-box--sub" x="32" y="280" width="624" height="48" rx="8"/>
    <text class="fg-m" x="48" y="310">sub = base64url( SHA-256( salt : sector : internal_user_id ) )</text>
    <rect class="fg-pill fg-pill--ok" x="696" y="288" width="232" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="812" y="309" text-anchor="middle">sub_A ≠ sub_B</text>
  </svg>
  <figcaption class="fig-note">The salt is what makes this one-way. Without it, an RP holding a subject and a guess at the internal id could confirm the guess; with it, the same derivation is unavailable to anyone but the OP, so neither RP can compute the other's subject.</figcaption>
</figure>

### `sector_identifier_uri` resolution

Deriving `sub` needs only the host of `sector_identifier_uri`, a plain URL parse. The fetch happens once, at registration, to prove the RP controls the sector. The OP downloads the document and confirms every redirect URI of the client is listed in it.

- The fetch is HTTPS-only, refuses redirects, rejects RFC 1918, loopback and link-local addresses, and caps the body at 64 KiB and the request at 5 seconds.
- The document must be a single JSON array of strings with no trailing bytes.
- A successful fetch is cached for 24 hours; a failure is cached for 5 seconds so a burst of registrations cannot become a burst of outbound requests.
- If the document's content changes after the cache entry expires, registration fails with `invalid_client_metadata` (`sector_identifier_uri document changed since last fetch`) instead of silently widening the trusted set.

This binds the sector to a published manifest the OP can audit.

## Mid-life switching is rejected

`op.New` fails with `ErrSubjectModeMismatch` if you switch between subject strategies on a populated store. Switching from `public` to `pairwise` (or the reverse) without a migration would silently re-key every issued grant: every refresh-token rotation would re-issue with a new `sub`, and every introspection would return a different identifier than the one in the original token.

The gate also consults the `__op_init` sentinel, which every successful construction writes. A re-used store whose subject-mode marker was wiped (manual cleanup, truncate) therefore still rejects a switch to a non-public mode on the next `op.New`.

The gate compares modes, not salts. If you genuinely need to switch strategy or salt, plan a maintenance window: migrate every issued grant (rebind through your own subject-mapping table), then start the OP under the new strategy. The alternative is to provision a new issuer.

## Per-client opt-in via DCR

With `op.WithPairwiseSubject` enabled, the dynamic-registration mount accepts `"subject_type": "pairwise"` in inbound RFC 7591 metadata. Without the option, registration rejects pairwise with `invalid_client_metadata`.

```sh
curl -s -X POST \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "Tenant A",
    "redirect_uris": ["https://tenant-a.example.com/cb"],
    "subject_type": "pairwise",
    "sector_identifier_uri": "https://tenant-a.example.com/sectors.json"
  }' \
  https://op.example.com/oidc/register
```

For statically provisioned clients, set `SubjectType: "pairwise"` on the `op.PublicClient` / `op.ConfidentialClient` seed. Without `op.WithPairwiseSubject`, `op.New` rejects a static `pairwise` client. The typed seeds have no `sector_identifier_uri` field, so a static pairwise client must use a single redirect host; clients that span hosts register through DCR.

## What pairwise does *not* do

- **Does not anonymise UserInfo**. `sub` is per-sector, but `email` / `name` / claim values are unchanged. RPs can still correlate via email if you let them request `email` scope.
- **Does not protect against active correlation attacks**. Two colluding RPs can compare timing, IP, browser fingerprint, or any other side channel. Pairwise raises the bar — it does not make correlation impossible.

::: details Cross-RP correlation — what's that?
When two RPs separately observe an authenticated user and compare notes, they can ask "are these the same person?". The most direct signal is `sub` — if both RPs see `sub=abc123` for their user, they know it is the same person at the OP. Pairwise removes this signal; each RP sees a different opaque identifier. RPs can still attempt correlation via email, phone, IP address, login timestamp, or browser fingerprint — pairwise only closes the OP-handed-them-the-key channel.
:::
- **Does not work without `sector_identifier_uri`** for multi-host clients. Registration and `op.New` refuse them, so you find out at setup rather than seeing drift in production.

## See it run

[`examples/34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas):

```sh
(cd examples/34-pairwise-saas && GOWORK=off go run -tags example .)
```

Two tenants in distinct sectors observe `A != B` (different sector → different sub) and `A1 == A2` (same sector + same user → identical sub), satisfying both the privacy and determinism properties of OIDC Core §8.1. Files: `op.go` (OP wiring with `WithPairwiseSubject`), `probe.go` (self-verify the two properties).

## Read next

- [Custom subject generator](/reference/options#subject-strategy) — `op.WithSubjectGenerator` for completely custom derivation (not pairwise / not UUIDv7).
- [DCR wiring](/use-cases/dynamic-registration) — how clients self-register with `subject_type=pairwise`.
