---
title: Install
description: Adding go-oidc-provider to a Go module.
---

# Install

```sh
go get github.com/libraz/go-oidc-provider/op@latest
```

The library targets **Go 1.23+** (matches the `go.mod` directive).

## Modules and sub-modules

| Module path | When to import |
|---|---|
| `github.com/libraz/go-oidc-provider/op` | Always — the public API. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/inmem` | Reference / dev / test store. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/sql` | SQLite / MySQL / Postgres durable store. Sub-module — keeps DB drivers out of your `go.sum` until you opt in. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/redis` | Volatile substores (interactions, consumed JTIs). Sub-module. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/composite` | Hot/cold splitter. |

::: tip Sub-modules
The SQL and Redis adapters are published as Go sub-modules. You only pay the
driver dependency cost on the modules that actually use them.
:::

## Pre-v1.0

The library is **pre-v1.0**. Public API may change in any minor release until
`v1.0.0`. Breaking changes are tracked in
[`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md).
APIs whose godoc starts with `Experimental:` may change without a major bump
even after v1.0.

## Next

- [Minimal OP](/getting-started/minimal) — 30 lines, runnable with `go run`.
- [Required options](/getting-started/required-options) — what `op.New` must
  receive to refuse to start in an unsafe configuration.
- [Mount on your router](/getting-started/mount) — how to put the handler on
  `net/http`, `chi`, or `gin`.
