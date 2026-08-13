---
title: Install
description: Adding go-oidc-provider to a Go module.
---

# Install

```sh
go get github.com/libraz/go-oidc-provider/op@v1.1.0
```

If you use the SQL, Redis, or DynamoDB adapter sub-modules, pin them to the same tag:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@v1.1.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/redis@v1.1.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.1.0
```

The module language floor is **Go 1.25+** (the `go.mod` directive is `go 1.25.0`). The release is built and tested with the pinned `toolchain go1.26.5`; use that toolchain or newer when you want the same TLS and dependency security baseline as the project CI.

## Modules and sub-modules

| Module path | When to import |
|---|---|
| `github.com/libraz/go-oidc-provider/op` | Always — the public API. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/inmem` | Reference / dev / test store. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/sql` | SQLite / MySQL / Postgres durable store. Sub-module — keeps DB drivers out of your `go.sum` until you opt in. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/redis` | Volatile substores (interactions, consumed JTIs). Sub-module. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb` | DynamoDB store. Experimental sub-module; keeps the AWS SDK out of your `go.sum` until you opt in. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/composite` | Hot/cold splitter. |

::: tip Sub-modules
The SQL, Redis, and DynamoDB adapters are published as Go sub-modules. You only pay the driver or AWS SDK dependency cost in modules that use them.
:::

## Stability

Configurations built with `op.New` and the bundled storage adapters generally upgrade unchanged. Embedders with BYO stores or other extensions should review the current migration guidance in [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) before upgrading. Symbols marked `Experimental:` in godoc remain the ordinary minor-release exemption; the generated [experimental API manifest](https://github.com/libraz/go-oidc-provider/blob/main/api/experimental.txt) is the current list.

## Next

- [Minimal OP](/getting-started/minimal) — 30 lines, runnable with `go run`.
- [Required options](/getting-started/required-options) — what `op.New` must receive to refuse to start in an unsafe configuration.
- [Mount on your router](/getting-started/mount) — how to put the handler on `net/http`, `chi`, or `gin`.
