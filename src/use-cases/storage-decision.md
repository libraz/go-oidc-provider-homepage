---
title: Choosing a storage layout
description: Choose SQL, DynamoDB, Redis hot/cold, or a custom store, then apply existing-schema migrations and retention operations safely.
pageClass: pg-use-cases-storage-decision
---

# Use case — Choosing a storage layout

The library never owns your `users` table, your database, or your migration tooling. It reaches storage through small `store.*` substore interfaces, and you decide how to back them. This page is the map: pick your entry point, and it routes you to the concrete guide.

::: tip Mental model
Two questions settle almost everything: **where do the OIDC tables live** (one backend, or split across two), and **do you already have a schema you must fit into**. The substore interfaces are identical in every case — only the backing changes.
:::

## Pick your entry point

| Your situation | Layout | Guide |
|---|---|---|
| **Greenfield** — no schema yet | One SQL backend, adapter-owned tables | [Persistent storage (SQL)](/use-cases/sql-store) |
| **AWS / DynamoDB** — you want an AWS-native durable backend | One DynamoDB table per substore | [DynamoDB storage](/use-cases/dynamodb-store) |
| **Existing database** — you already run a `users` table and migrations | Adapter-owned `oidc_*` tables (renamed to fit), your identity data projected in | [Renaming tables](/use-cases/sql-store#renaming-the-tables) · [BYO user store](/use-cases/byo-userstore) · [BYO store backend](/use-cases/byo-store) (custom columns) |
| **Scale / high churn** — you want volatile state off the durable tier | `composite` split: durable SQL + volatile Redis | [Hot/cold split](/use-cases/hot-cold-redis) |

<figure class="fig">
  <div class="fig-head">Three entry points, by what you already have</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-storage-decision-title" viewBox="0 0 960 392" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-storage-decision-title">Choosing a storage layout. A greenfield deployment takes one SQL adapter. A deployment with an existing users table keeps the OIDC tables on the SQL adapter and supplies its own user store. A deployment that wants the high-churn state off SQL routes both backends through the composite adapter.</title>
    <!-- question -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="896" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="56" y="52">Where does the state live?</text>
    <text class="fg-s" x="56" y="76">the answer follows from what your deployment already runs, not from what the OP prefers</text>
    <!-- branches -->
    <path class="fg-leader" d="M480,96 V120 M168,120 H792"/>
    <path class="fg-edge fg-edge--thin" d="M168,120 V144" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M480,120 V144" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M792,120 V144" marker-end="url(#fg-a)"/>
    <!-- card 1 -->
    <rect class="fg-box" x="32" y="144" width="272" height="224" rx="8"/>
    <text class="fg-t2" x="48" y="172">Greenfield</text>
    <text class="fg-s" x="48" y="196">no schema of your own yet</text>
    <line class="fg-rule" x1="48" y1="216" x2="288" y2="216"/>
    <text class="fg-m fg-accent" x="48" y="244">One SQL adapter</text>
    <text class="fg-s" x="48" y="268">let the adapter own the OIDC</text>
    <text class="fg-s" x="48" y="292">tables, including users</text>
    <rect class="fg-pill fg-pill--ok" x="48" y="316" width="240" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="168" y="337" text-anchor="middle">the least to build</text>
    <!-- card 2 -->
    <rect class="fg-box" x="344" y="144" width="272" height="224" rx="8"/>
    <text class="fg-t2" x="360" y="172">An existing database</text>
    <text class="fg-s" x="360" y="196">a users table already runs</text>
    <line class="fg-rule" x1="360" y1="216" x2="600" y2="216"/>
    <text class="fg-m fg-accent" x="360" y="244">SQL + your own UserStore</text>
    <text class="fg-s" x="360" y="268">protocol state on the adapter,</text>
    <text class="fg-s" x="360" y="292">identity stays where it is</text>
    <rect class="fg-pill" x="360" y="316" width="240" height="32" rx="16"/>
    <text class="fg-s fg-dim" x="480" y="337" text-anchor="middle">no migration of your users</text>
    <!-- card 3 -->
    <rect class="fg-box" x="656" y="144" width="272" height="224" rx="8"/>
    <text class="fg-t2" x="672" y="172">Splitting off the churn</text>
    <text class="fg-s" x="672" y="196">Redis for the hot part</text>
    <line class="fg-rule" x1="672" y1="216" x2="912" y2="216"/>
    <text class="fg-m fg-accent" x="672" y="244">composite</text>
    <text class="fg-s" x="672" y="268">durable substores on SQL,</text>
    <text class="fg-s" x="672" y="292">volatile ones on Redis</text>
    <rect class="fg-pill fg-pill--warn" x="672" y="316" width="240" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="792" y="337" text-anchor="middle">two backends to operate</text>
  </svg>
  <figcaption class="fig-note">These are entry points, not destinations. Starting on the left and moving right later is a configuration change: the substore split is where the routing lives, and nothing above it has to know.</figcaption>
</figure>

The third branch has two traps. Authorization codes and the PAR `request_uri` are short-lived, so they look like volatile state, but they belong on the durable side: every member of `composite.TxClusterKinds` must resolve to a single backend. The consumed-`jti` replay set is short-lived too, but evicting a live marker reopens the replay window, so it stays durable unless the Redis instance never evicts.

## Greenfield

The `sql` adapter ships the entire schema, so you do not design the OIDC tables. `New(db, dialect)` builds the store against SQLite, MySQL 8.0+, or PostgreSQL 14+ via the matching `SQLite()` / `MySQL()` / `Postgres()` dialect, and the adapter owns its own `oidc_*` tables.

- **Development / examples**: call the store's `Migrate(ctx)` to apply the embedded schema to a fresh live connection. It is a convenience for demos and tests, not an upgrade path for existing tables.
- **Production**: call the store's `Schema()` to get the dialect-specific DDL — with any `WithNaming` overrides already applied — and feed that string into your existing migration tooling. The DDL is exposed verbatim so a review can diff the adapter's expectations against your production schema.

For an existing database, apply the additive columns and indexes in [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) before the first request. The [SQL guide](/use-cases/sql-store#sql-migration-before-first-request) lists the added columns (registration `allowed_scopes`, MFA `row_version`, per-authorization state, `chain_id`, `access_revoked_at`), the retention indexes, and the MySQL collation change. `Store.Migrate` refuses to start while a required column is missing. [Storage maintenance](/operations/storage-maintenance) gives the rollout and GC order.

## Existing database

You keep your database and your migrations. Two facts shape how the adapter fits alongside them.

- **The adapter owns fixed-shape tables.** `WithNaming` renames the *physical tables* (`oidc_clients` → whatever your convention is), but the *columns are fixed* — the adapter builds its queries against a known column set. An unknown logical key makes `New` fail, so a typo surfaces at construction time rather than at first query.
- **Your real `users` table stays yours.** The adapter's `oidc_users` table (`subject`, `claims`, `updated_at`, plus optional `username` / `password_hash`) is a projection target, not a replacement. If you already have a rich `users` table, implement a `store.UserStore` — and `store.UserPasswordStore` when you use the built-in password login — that reads *your* columns and returns a `store.User`. You never migrate your user data into the adapter's shape.

So "reuse my existing tables" splits in two: the OIDC **protocol** tables (auth codes, refresh chains, grants, …) are the adapter's — rename them with `WithNaming` and let your migrations create them — while your **identity** data stays behind a bring-your-own `UserStore`.

::: details Which substores are worth bringing your own
Any substore can be BYO, but the one embedders almost always own is the user projection (`UserStore` / `UserPasswordStore`), because the user record is *your* domain. The protocol substores (codes, tokens, grants) rarely benefit from a hand-written backend — use the `sql` adapter for those. See [BYO store backend](/use-cases/byo-store) for a from-scratch implementation and [BYO user store](/use-cases/byo-userstore) for the identity-only case.
:::

## Splitting for scale (hot/cold)

When one backend is no longer the right shape — durable rows don't need the QPS the volatile state generates, and volatile rows don't need durable guarantees — the `composite` adapter routes each substore to a durable or a volatile backend. This is the standard production shape: SQL durable, Redis volatile. Full walkthrough on the [Hot/cold split](/use-cases/hot-cold-redis) page.

## What may go to Redis — the rule

The Redis-or-SQL choice is **not** "is this data short-lived." It follows one invariant: substores that must commit atomically together (`composite.TxClusterKinds`) have to share a single backend, so they stay on the durable tier. Data lifetime only decides the remainder.

| Bucket | Substores | Why |
|---|---|---|
| **Must be durable (SQL)** | `AuthorizationCodeStore`, `RefreshTokenStore`, `GrantStore`, `PushedAuthRequestStore`, `AccessTokenRegistry`, `OpaqueAccessTokenStore`, `GrantRevocationStore` | Members of the atomic-routing cluster — they commit or CAS in one consistency domain. The Redis adapter returns `nil` for these, so `composite` cannot route them off the durable tier. |
| **Good fit for Redis (volatile)** | `InteractionStore` | Short-lived, high-churn, losable in isolation (the user restarts the login), and *outside* the cluster. |
| **Durable, or Redis with `noeviction`** | `ConsumedJTIStore` | Outside the cluster, but an evicted replay marker lets a captured DPoP or `private_key_jwt` proof replay. Redis can host it only on an instance that never evicts, which then cannot use a `volatile-*` or `allkeys-*` policy for the other substores. |
| **Your call** | `SessionStore` | Route to either tier; declare logout-trigger/session-snapshot durability with `WithSessionDurabilityPosture`. BCL targets remain grant-derived, and `bcl.no_sessions_for_subject` records a session-bearing logout with zero eligible RP targets. |

The counter-intuitive member is PAR: its `request_uri` is short-lived and *looks* volatile, but the OP consumes it inside the authorization-code path, so it belongs to the cluster and stays durable. The authoritative per-substore table, the Redis eviction policy per substore, and the exact `op.New` guardrails for a `nil` required backend live on the [Hot/cold split](/use-cases/hot-cold-redis) page.

::: warning Redis safety floor
`oidcredis.New` refuses to start without TLS (`rediss://`) and AUTH. The dev-only escape hatch is `oidcredis.WithDevModeAllowPlaintext`; shipping it in production is a security regression you have to type out by hand.
:::

## Keep the layout healthy

Before launch, apply the schema and verify the writer compatibility boundary. During operation, schedule SQL retention GC, monitor its `GCStats`, and treat DynamoDB TTL as reclamation rather than expiry enforcement. See [storage maintenance](/operations/storage-maintenance), [backup & disaster recovery](/operations/backup), and the backend-specific [SQL](/use-cases/sql-store), [DynamoDB](/use-cases/dynamodb-store), and [BYO store](/use-cases/byo-store) guides.
