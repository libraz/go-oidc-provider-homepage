---
title: Install
description: Adding go-oidc-provider to a Go module.
---

# Install

```sh
go get github.com/libraz/go-oidc-provider@v1.4.0
```

If you use the SQL, Redis, or DynamoDB adapter sub-modules, pin them to the same tag:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@v1.4.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/redis@v1.4.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.4.0
```

The module needs **Go 1.26.0 or newer** (the `go.mod` directive is `go 1.26.0`). The release itself is built and tested with the pinned `toolchain go1.27.3`. Use that toolchain or newer if you want the same TLS and dependency security baseline the project CI runs on.

## Packages and sub-modules

| Import path | When to import |
|---|---|
| `github.com/libraz/go-oidc-provider/op` | Always. This is the public API. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/inmem` | Reference, dev and test store. Part of the main module. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/sql` | Durable store on SQLite, MySQL or Postgres. Sub-module, so DB drivers stay out of your `go.sum` until you use it. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/redis` | Volatile substores (sessions, interactions, consumed JTIs), meant to be paired with a durable store through `composite`. Sub-module. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb` | DynamoDB store. Experimental sub-module, so the AWS SDK stays out of your `go.sum` until you use it. |
| `github.com/libraz/go-oidc-provider/op/storeadapter/composite` | Hot/cold splitter. Part of the main module. |

::: tip Sub-modules
The SQL, Redis, and DynamoDB adapters are published as Go sub-modules. You only pay the driver or AWS SDK dependency cost in modules that use them.
:::

## Stability

Configurations built with `op.New` and the bundled storage adapters generally upgrade unchanged. Embedders with BYO stores or other extensions should review the migration guidance in [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) before upgrading.

A deployment on the SQL adapter applies the `ALTER TABLE` statements for its engine from [`MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) before it runs a new release. `Store.Migrate` only creates missing tables and refuses to start when an existing table lacks a column the adapter needs.

Symbols marked `Experimental:` in godoc are exempt from the minor-release compatibility promise. The generated [experimental API manifest](https://github.com/libraz/go-oidc-provider/blob/main/api/experimental.txt) is the current list. It includes `op.LoginFlow` and `op.WithLoginFlow`, which the Quick Start pages use, as well as `op.WithSPAUI`, `op.WithConsentUI`, `op.WithChooserUI` and the whole DynamoDB adapter.

## Next

- [Minimal OP](/getting-started/minimal): an OP you can run with `go run`, in about 30 lines.
- [Required options](/getting-started/required-options): what `op.New` insists on, and what it refuses to start without.
- [Mount on your router](/getting-started/mount): putting the handler on `net/http`, `chi` or `gin`.
