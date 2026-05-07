---
title: Pairwise subject (OIDC Core §8.1)
description: Per-sector pseudonymous sub claims — privacy-preserving multi-tenant SaaS, deterministic across processes, mid-life switching forbidden.
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
When pairwise is **not** enabled, the OP's default subject generator mints a fresh UUIDv7 per user (time-ordered random). UUIDv7 is preferred over UUIDv4 because it is sortable by issue time, which makes index locality on the user table much better. Public mode does not use HMAC; it just remembers the UUID for each user. Pairwise mode bypasses this entirely and recomputes `sub` deterministically for each (sector, user) pair.
:::

## When you want pairwise

- **Multi-tenant SaaS** where each tenant must not know that user X also exists in tenant Y.
- **Privacy-conscious deployments** where the regulator asks for sector-bound identifiers (eIDAS, several country-specific identity programs).
- **Federation aggregators** where you front many downstream RPs and don't want them to correlate users.

If your RPs are all first-party (you own them all and they share databases anyway), pairwise adds friction without privacy benefit. Use the default UUIDv7 strategy.

## Wiring

```go
import "github.com/libraz/go-oidc-provider/op"

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(store),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.WithPairwiseSubject(pairwiseSalt), // pairwiseSalt: []byte, ≥ 32 bytes
)
```

Activating the option:

- Adds `pairwise` to discovery's `subject_types_supported` (alongside `public`).
- Permits clients to register `subject_type=pairwise` (via static seeds or DCR).
- Per-client opt-in: clients with `subject_type=public` (or unset → public) keep the default UUIDv7 sub. Pairwise is per-client, not per-OP.

::: warning Salt requirements
The salt MUST be at least 32 bytes / 256 bits. Embedders SHOULD pull it from a KMS / Vault / Secrets Manager. A salt baked into the source tree or a `.env` file is treated as low-trust. Re-using the salt across deployments is intentional — pairwise sub values are deterministic across processes that share the salt — but **rotating the salt invalidates every previously-issued sub**. The library refuses to boot when grants exist that were issued under a different salt (enforced by the construction-time subject-mode immutability gate).
:::

## How sub is derived

The OP computes:

```
sub = base64url( HMAC-SHA256(salt, sector_identifier || internal_user_id) )
```

::: details HMAC-SHA256 derivation — what's that?
HMAC is a keyed hash — it takes a secret key (here, the salt) and an input (here, sector + user id) and produces a fixed-size output. SHA-256 is the underlying hash. Two properties matter for pairwise: (1) the same inputs always produce the same output, so a process restart still computes Alice's `sub` for sector A correctly; (2) without the salt, an attacker cannot recompute `sub` from the user id even if they observe many issued sub values. The OP base64url-encodes the 256-bit output so it fits the JWT `sub` string slot.
:::

::: details Salt — what's that?
A high-entropy secret (≥ 256 bits) shared across every replica of the OP. It is the keying material for the HMAC; rotating it invalidates every previously-issued `sub`, which is why the library refuses to start when grants exist that were issued under a different salt. Operators should pull it from KMS / Vault rather than checking it into source — anyone with the salt can recompute every user's `sub` for every sector.
:::

::: details Subject mode — what's that?
"Public" or "pairwise". The OP records the active subject mode in its metadata substore (the `__op_init` sentinel) at first construction. Every subsequent boot must match — switching strategies on a non-empty store would silently re-key every issued grant, breaking refresh-token rotation and JWT introspection consistency. Mid-life switching is treated as a hard configuration error.
:::

Where `sector_identifier` is:

1. The host of the client's `sector_identifier_uri` (when registered).
2. **Or** the host of the client's single registered redirect URI host (when the URI is empty).

A client with multiple redirect-URI hosts and no `sector_identifier_uri` produces an unresolvable sector — the issuance fails with `server_error`. Operators MUST require `sector_identifier_uri` for clients that fan out across hosts.

### `sector_identifier_uri` resolution

When a client registers a `sector_identifier_uri`, the OP fetches it (HTTPS-only, RFC 1918 / loopback / link-local rejected, redirect targets re-validated, body-size + timeout caps, 24-hour success cache) and confirms every redirect URI on the client is listed in the document. This binds the sector to a published manifest the OP can audit.

## Mid-life switching is rejected

The library refuses to boot if you switch between subject strategies on a non-empty grant store. Switching from `public` to `pairwise` (or vice versa) without a salt-aware migration would silently re-key every issued grant — every refresh-token rotation would re-issue with a new `sub`, every JWT introspection would return a different identifier than the one in the original token.

The construction-time subject-mode immutability gate consults the metadata substore for an `__op_init` sentinel (written on every successful construction) so a re-used store whose subject-mode marker was wiped (manual cleanup, truncate) still rejects a non-public switch on the next `op.New` call.

If you genuinely need to migrate, plan a maintenance window where you migrate every issued grant (rebind via your own subject-mapping table), then start the OP under the new strategy.

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

For statically-provisioned clients, set the field on the `Client` record directly via the `op.PublicClient` / `op.ConfidentialClient` seed.

## What pairwise does *not* do

- **Does not anonymise UserInfo**. `sub` is per-sector, but `email` / `name` / claim values are unchanged. RPs can still correlate via email if you let them request `email` scope.
- **Does not protect against active correlation attacks**. Two colluding RPs can compare timing, IP, browser fingerprint, or any other side channel. Pairwise raises the bar — it does not make correlation impossible.

::: details Cross-RP correlation — what's that?
When two RPs separately observe an authenticated user and compare notes, they can ask "are these the same person?". The most direct signal is `sub` — if both RPs see `sub=abc123` for their user, they know it is the same person at the OP. Pairwise removes this signal; each RP sees a different opaque identifier. RPs can still attempt correlation via email, phone, IP address, login timestamp, or browser fingerprint — pairwise only closes the OP-handed-them-the-key channel.
:::
- **Does not work without `sector_identifier_uri`** for multi-host clients. The OP refuses issuance, so you find out at boot rather than seeing drift in production.

## See it run

[`examples/34-pairwise-saas`](https://github.com/libraz/go-oidc-provider/tree/main/examples/34-pairwise-saas):

```sh
go run -tags example ./examples/34-pairwise-saas
```

Two tenants in distinct sectors observe `A != B` (different sector → different sub) and `A1 == A2` (same sector + same user → identical sub), satisfying both the privacy and determinism properties of OIDC Core §8.1. Files: `op.go` (OP wiring with `WithPairwiseSubject`), `probe.go` (self-verify the two properties).

## Read next

- [Custom subject generator](/reference/options#subject-strategy) — `op.WithSubjectGenerator` for completely custom derivation (not pairwise / not UUIDv7).
- [DCR wiring](/use-cases/dynamic-registration) — how clients self-register with `subject_type=pairwise`.
