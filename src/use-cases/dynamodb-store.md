---
title: DynamoDB storage
description: Run go-oidc-provider on DynamoDB, provision one table per substore, and keep expiry enforcement independent of DynamoDB TTL cleanup.
---

# Use case — DynamoDB storage

Use the DynamoDB adapter when the OP's durable and volatile protocol state should live in AWS DynamoDB. It implements every `store.Store` substore and `store.Transactional`, so a browser authorization-code flow can run on DynamoDB alone.

::: warning Experimental API
`op/storeadapter/dynamodb` is a published sub-module, but its constructor and options are marked `Experimental:`. Keep it version-pinned and review its release notes before a minor-version upgrade.
:::

> **Source:** [`examples/18-dynamodb-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/18-dynamodb-store)

## Install and construct the store

The adapter is a separate module so applications that do not use DynamoDB do not pull the AWS SDK into their dependency graph.

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.0.0
```

The application owns AWS credential resolution and region selection. Give the configured SDK client to the adapter:

```go
import (
  "context"

  awsconfig "github.com/aws/aws-sdk-go-v2/config"
  awsdynamodb "github.com/aws/aws-sdk-go-v2/service/dynamodb"
  oidcdynamo "github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb"
)

ctx := context.Background()
cfg, err := awsconfig.LoadDefaultConfig(ctx)
if err != nil { /* handle configuration error */ }

storage, err := oidcdynamo.New(awsdynamodb.NewFromConfig(cfg))
if err != nil { /* handle construction error */ }

// Pass storage to op.New with the usual issuer, keyset, and login options.
```

Use `oidcdynamo.WithTablePrefix("my_op_")` when one AWS account hosts more than one OP. `WithNaming` overrides individual physical table names and rejects unknown logical names at construction time.

## Provision tables deliberately

The adapter creates no tables in `New`. `CreateTables(ctx)` is idempotent and intended for development or tests. Production infrastructure should translate `storage.TableDefinitions()` into CloudFormation, CDK, Terraform, or its own provisioning system; those definitions include each table's key schema, global secondary indexes, and TTL attribute.

```go
if err := storage.CreateTables(ctx); err != nil {
  return err // development and test only
}
```

Each substore has its own table. The adapter stores the record as JSON plus the key, index, and condition attributes that DynamoDB must query. This keeps record-shape changes out of the table schema.

## Expiry and consistency

DynamoDB TTL cleanup is asynchronous. The adapter treats the TTL attribute as storage reclamation only and checks expiry against its clock on every read, so an expired authorization code stays rejected even while DynamoDB has not deleted its item.

Security-sensitive reads use strongly consistent `GetItem` calls. The transactional adapter buffers writes and commits them through `TransactWriteItems`; that is what keeps authorization-code issuance, PAR consumption, and their related protocol records atomic.

## Authentication-factor stores

The DynamoDB adapter also exposes `TOTPs()`, `Passkeys()`, `RecoveryCodes()`, `EmailOTPs()`, and `AuthnLockouts()`. These stores sit outside `store.Store`; pass them directly to the matching login-flow `Step`. Their accessor names match the in-memory and SQL adapters, so the login-flow wiring can remain the same when moving the backend.

## Run the example locally

The example starts DynamoDB Local, an OP on port 8080, and an RP on port 9090. The emulator remains on the Compose network.

```sh
docker compose -f examples/18-dynamodb-store/compose.yaml up -d --build
open http://127.0.0.1:9090/
docker compose -f examples/18-dynamodb-store/compose.yaml down -v
```

For AWS, do not copy the example's endpoint-override credentials. Let `LoadDefaultConfig` use the deployment's normal region and credential chain.

## Read next

- [Choosing a storage layout](/use-cases/storage-decision) — decide between SQL, DynamoDB, and a hot/cold split.
- [Bring your own user store](/use-cases/byo-userstore) — retain your application-owned users table.
- [MFA / step-up](/use-cases/mfa-step-up) — wire authentication-factor stores into a login flow.
