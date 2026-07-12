---
title: Choosing a storage layout
description: A decision map — greenfield, existing database, or hot/cold split — for where each OIDC substore lives and what may go to Redis.
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
| **Existing database** — you already run a `users` table and migrations | Adapter-owned `oidc_*` tables (renamed to fit), your identity data projected in | [BYO store backend](/use-cases/byo-store) · [BYO user store](/use-cases/byo-userstore) |
| **Scale / high churn** — you want volatile state off the durable tier | `composite` split: durable SQL + volatile Redis | [Hot/cold split](/use-cases/hot-cold-redis) |

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
