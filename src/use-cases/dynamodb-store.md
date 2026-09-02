---
title: DynamoDB storage
description: Run go-oidc-provider on DynamoDB with deliberate table definitions, transactional device-code reservations, and read-time expiry checks independent of TTL cleanup.
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
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.2.0
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

Each table definition corresponds to a store shape; most substores have one table, while the grant-revocation and revoked-JTI tombstones share one table. The adapter stores the record as JSON plus the key, index, and condition attributes that DynamoDB must query. This keeps record-shape changes out of the table schema.

## Refresh-token table upgrades

The current refresh-token definition has `by_grant`, `by_client`, and `by_parent` indexes; it no longer defines a `by_handle` global secondary index or writes the handle-only index attribute. Refresh-token `Find` and `Consume` resolve the presented credential by its primary digest, and chain resolution follows the stored parent relationship. `ReconcileIndexes` only adds indexes, so an existing table can retain an old `by_handle` index. It is unused by the current adapter, but remove it manually through the normal DynamoDB infrastructure procedure (for example, `UpdateTable`) when you want to reclaim its capacity; do not drop and recreate the table for this change. New provisioning and restores must use the current definitions and must not add `by_handle` back.

## Device-code table upgrades

The current device-code table does **not** use a `by_user_code` global secondary index. A device record is keyed by the digest of its `device_code`; when it has a `user_code`, `Save` writes a second reservation item under `uc#<user_code>` in the same `TransactWriteItems` call. `FindByUserCode`, `ApproveByUserCode`, and `DenyByUserCode` resolve that reservation with a strongly consistent read. The reservation is the uniqueness constraint: a secondary index can find duplicates but cannot prevent two writers from claiming the same code.

<svg role="img" aria-labelledby="ddb-reservation-title" viewBox="0 0 760 250" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="ddb-reservation-title">The device-code reservation layout: one Save writes both the device record and a user_code reservation item in a single TransactWriteItems call, and a lookup by user_code reads the reservation with a strongly consistent read before resolving the record.</title>

  <rect x="20" y="28" width="190" height="60" rx="8" style="fill:var(--vp-c-brand-soft);stroke:var(--vp-c-brand-2)"/>
  <text x="115" y="54" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">Save</text>
  <text x="115" y="74" text-anchor="middle" font-size="10.5" style="fill:var(--vp-c-text-2)">one TransactWriteItems</text>

  <rect x="420" y="16" width="320" height="58" rx="8" style="fill:var(--vp-c-bg-soft);stroke:var(--vp-c-text-3)"/>
  <text x="440" y="42" font-size="11.5" fill="currentColor" style="font-family:var(--vp-font-family-mono)">pk = digest(device_code)</text>
  <text x="440" y="62" font-size="10.5" style="fill:var(--vp-c-text-2)">the device record</text>

  <rect x="420" y="104" width="320" height="58" rx="8" style="fill:var(--vp-c-bg-soft);stroke:var(--vp-c-text-3)"/>
  <text x="440" y="130" font-size="11.5" fill="currentColor" style="font-family:var(--vp-font-family-mono)">pk = uc#&lt;user_code&gt;</text>
  <text x="440" y="150" font-size="10.5" style="fill:var(--vp-c-text-2)">the uniqueness reservation</text>

  <path d="M210 48 H414" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M408 43 L414 48 L408 53" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M210 70 C312 70 322 133 414 133" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M408 128 L414 133 L408 138" style="stroke:var(--vp-c-brand-2)"/>

  <rect x="20" y="176" width="190" height="60" rx="8" style="fill:var(--vp-c-brand-soft);stroke:var(--vp-c-brand-2)"/>
  <text x="115" y="202" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--vp-c-brand-2);font-family:var(--vp-font-family-mono)">FindByUserCode</text>
  <text x="115" y="222" text-anchor="middle" font-size="10.5" style="fill:var(--vp-c-text-2)">strongly consistent read</text>

  <path d="M210 202 C312 202 330 150 414 148" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M408 143 L414 148 L409 154" style="stroke:var(--vp-c-brand-2)"/>

  <path d="M580 104 V78" style="stroke:var(--vp-c-brand-2)"/>
  <path d="M575 85 L580 78 L585 85" style="stroke:var(--vp-c-brand-2)"/>
  <text x="592" y="96" font-size="10.5" style="fill:var(--vp-c-text-2)">resolves the record</text>
</svg>

An existing table may therefore still contain the old, unused `by_user_code` index. It is safe to leave that index in place while planning capacity changes; if it is no longer wanted, remove it through the deployment's normal DynamoDB infrastructure procedure after the pre-upgrade records have expired. Do not drop or recreate the table as part of this upgrade. Device codes written before the reservation-item layout have no `uc#...` reservation and are intentionally not resolved by `user_code`; they expire naturally within their normal short lifetime. The adapter does not fall back to the old index, because doing so would let a new request claim a code still held by a live pre-upgrade record.

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
