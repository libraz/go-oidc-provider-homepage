---
title: Choosing a storage layout
description: A decision map — greenfield, existing database, or hot/cold split — for where each OIDC substore lives and what may go to Redis.
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
| **Existing database** — you already run a `users` table and migrations | Adapter-owned `oidc_*` tables (renamed to fit), your identity data projected in | [BYO store backend](/use-cases/byo-store) · [BYO user store](/use-cases/byo-userstore) |
| **Scale / high churn** — you want volatile state off the durable tier | `composite` split: durable SQL + volatile Redis | [Hot/cold split](/use-cases/hot-cold-redis) |

<svg class="storage-choice" role="img" aria-labelledby="storage-choice-title" viewBox="0 0 760 430" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="storage-choice-title">Choosing a storage layout. Greenfield takes one SQL adapter; an existing users table keeps the OIDC tables on the SQL adapter and supplies its own UserStore; splitting off high-churn volatile state routes SQL and Redis through composite.</title>
  <defs>
    <marker id="storage-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="250" y="18" width="260" height="52" rx="8"/>
  <text class="h" x="380" y="40" text-anchor="middle">Where does the state live?</text>
  <text class="t sub" x="380" y="58" text-anchor="middle">start from one of three entry points</text>

  <path d="M380 70 V100" marker-end="url(#storage-arrow)"/>
  <rect x="40" y="102" width="210" height="74" rx="8"/>
  <text class="h" x="145" y="130" text-anchor="middle">Greenfield</text>
  <text class="t sub" x="145" y="151" text-anchor="middle">no schema yet</text>

  <rect x="274" y="102" width="212" height="74" rx="8"/>
  <text class="h" x="380" y="130" text-anchor="middle">Existing database</text>
  <text class="t sub" x="380" y="151" text-anchor="middle">a users table already runs</text>

  <rect x="510" y="102" width="210" height="74" rx="8"/>
  <text class="h" x="615" y="130" text-anchor="middle">Split off churn</text>
  <text class="t sub" x="615" y="151" text-anchor="middle">you want Redis</text>

  <path d="M145 176 V218" marker-end="url(#storage-arrow)"/>
  <path d="M380 176 V218" marker-end="url(#storage-arrow)"/>
  <path d="M615 176 V218" marker-end="url(#storage-arrow)"/>

  <rect class="accent" x="40" y="220" width="210" height="92" rx="8"/>
  <text class="h accent-text" x="145" y="248" text-anchor="middle">One SQL adapter</text>
  <text class="t sub" x="145" y="272" text-anchor="middle">let the adapter own</text>
  <text class="t sub" x="145" y="291" text-anchor="middle">the OIDC tables</text>

  <rect class="accent" x="274" y="220" width="212" height="92" rx="8"/>
  <text class="h accent-text" x="380" y="248" text-anchor="middle">SQL + UserStore</text>
  <text class="t sub" x="380" y="272" text-anchor="middle">protocol state on SQL</text>
  <text class="t sub" x="380" y="291" text-anchor="middle">identity in your database</text>

  <rect class="accent" x="510" y="220" width="210" height="92" rx="8"/>
  <text class="h accent-text" x="615" y="248" text-anchor="middle">composite</text>
  <text class="t sub" x="615" y="272" text-anchor="middle">durable on SQL</text>
  <text class="t sub" x="615" y="291" text-anchor="middle">volatile on Redis</text>

  <rect class="soft" x="66" y="350" width="628" height="56" rx="8"/>
  <text class="t" x="380" y="373" text-anchor="middle">Careful: authorization codes and PAR are short-lived but still belong on the durable side</text>
  <text class="m sub" x="380" y="392" text-anchor="middle">composite.TxClusterKinds must resolve to one backend</text>
</svg>

## Greenfield

The `sql` adapter ships the entire schema, so you do not design the OIDC tables. `New(db, dialect)` builds the store against SQLite, MySQL 8.0+, or PostgreSQL 14+ via the matching `SQLite()` / `MySQL()` / `Postgres()` dialect, and the adapter owns its own `oidc_*` tables.

- **Development / examples**: call the store's `Migrate(ctx)` to apply the embedded v1 schema to the live connection. It is a convenience for demos and tests, not a production migration runner.
- **Production**: call the store's `Schema()` to get the dialect-specific DDL — with any `WithNaming` overrides already applied — and feed that string into your existing migration tooling. The DDL is exposed verbatim so a review can diff the adapter's expectations against your production schema.

## Existing database

You keep your database and your migrations. Two facts shape how the adapter fits alongside them.

- **The adapter owns fixed-shape tables.** `WithNaming` renames the *physical tables* (`oidc_clients` → whatever your convention is), but the *columns are fixed* — the adapter builds its queries against a known column set. An unknown logical key makes `New` fail, so a typo surfaces at construction time rather than at first query.
- **Your real `users` table stays yours.** The adapter's `oidc_users` table (`subject`, `claims`, `updated_at`, plus optional `username` / `password_hash`) is a projection target, not a replacement. If you already have a rich `users` table, implement a `store.UserStore` — and `store.UserPasswordStore` when you support the password grant — that reads *your* columns and returns a `store.User`. You never migrate your user data into the adapter's shape.

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
| **Good fit for Redis (volatile)** | `InteractionStore`, `ConsumedJTIStore` | Short-lived, high-churn, losable in isolation, and *outside* the cluster. |
| **Your call** | `SessionStore` | Route to either tier; declare intent with `WithSessionDurabilityPosture` so the back-channel-logout audit signal classifies expected vs unexpected gaps. |

The counter-intuitive member is PAR: its `request_uri` is short-lived and *looks* volatile, but the OP consumes it inside the authorization-code path, so it belongs to the cluster and stays durable. The authoritative per-substore table — and the exact `op.New` guardrails for when a required backend is `nil` — live on the [Hot/cold split](/use-cases/hot-cold-redis) page.

::: warning Redis safety floor
`redis.New` refuses to start without TLS (`rediss://`) and AUTH. The dev-only escape hatch is `redis.WithDevModeAllowPlaintext`; shipping it in production is a security regression you have to type out by hand.
:::
