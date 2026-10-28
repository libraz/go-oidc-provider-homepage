---
title: DynamoDB storage
description: Run go-oidc-provider on DynamoDB with deliberate table definitions, transactional device-code reservations, and read-time expiry checks independent of TTL cleanup.
pageClass: pg-use-cases-dynamodb-store
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
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.4.0
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

The adapter also implements the optional `store.OpaqueAccessTokenChainRevoker` and `store.IssuanceRevocationChecker` interfaces, so a refresh rotation or a single `/revoke` stays scoped to its own chain; [Bring your own store backend](/use-cases/byo-store#per-authorization-state-and-refresh-chains) explains what each one changes.

Use `oidcdynamo.WithTablePrefix("my_op_")` when one AWS account hosts more than one OP. `WithNaming` overrides individual physical table names and rejects unknown logical names at construction time.

## Provision tables deliberately

The adapter creates no tables in `New`. `CreateTables(ctx)` is idempotent and intended for development or tests. Production infrastructure should translate `storage.TableDefinitions()` into CloudFormation, CDK, Terraform, or its own provisioning system; those definitions include each table's key schema, global secondary indexes, and TTL attribute.

```go
if err := storage.CreateTables(ctx); err != nil {
  return err // development and test only
}
```

`CreateTables` also adds any global secondary index an existing table lacks, one `UpdateTable` call at a time. Infrastructure-managed tables must receive the same indexes from `TableDefinitions()` before the new binary starts, because a query against a missing index fails outright.

Each table definition corresponds to a store shape; most substores have one table, while the grant-revocation and revoked-JTI tombstones share one table. The adapter stores the record as JSON plus the key, index, and condition attributes that DynamoDB must query. This keeps record-shape changes out of the table schema.

## Refresh-token table upgrades

The refresh-token table defines `by_grant`, `by_client`, and `by_parent` indexes and no `by_handle` index. Refresh-token `Find` and `Consume` resolve the presented credential by its primary digest, and chain resolution follows the stored parent relationship. `CreateTables` only adds missing indexes to an existing table, so a table can retain an old `by_handle` index. It is unused by the current adapter, but remove it manually through the normal DynamoDB infrastructure procedure (for example, `UpdateTable`) when you want to reclaim its capacity; do not drop and recreate the table for this change. New provisioning and restores must use the current definitions and must not add `by_handle` back.

## Device-code table upgrades

The device-code table does **not** use a `by_user_code` global secondary index. A device record is keyed by the digest of its `device_code`; when it has a `user_code`, `Save` writes a second reservation item under `uc#<user_code>` in the same `TransactWriteItems` call. `FindByUserCode`, `ApproveByUserCode`, and `DenyByUserCode` resolve that reservation with a strongly consistent read. The reservation is the uniqueness constraint: a secondary index can find duplicates but cannot prevent two writers from claiming the same code. `PutUserWithPassword` applies the same pattern to usernames, claiming `username#<username>` and returning `store.ErrAlreadyExists` when another subject holds it.

<figure class="fig">
  <div class="fig-head">Two items, written in one transaction</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-ddb-title" viewBox="0 0 960 352" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-ddb-title">A single Save writes the device record and a user_code reservation item in one TransactWriteItems call. A lookup by user_code reads the reservation with a strongly consistent read, then resolves the device record from it.</title>
    <!-- save -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="320" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="52">Save</text>
    <text class="fg-mxs" x="48" y="76">TransactWriteItems</text>
    <text class="fg-xs" x="48" y="100">both items or neither</text>
    <!-- fan-out -->
    <path class="fg-leader" d="M352,72 H392 M392,60 V188"/>
    <path class="fg-edge fg-edge--accent" d="M392,60 H440" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--accent" d="M392,188 H440" marker-end="url(#fg-ac)"/>
    <!-- device record -->
    <rect class="fg-box" x="440" y="24" width="488" height="72" rx="8"/>
    <text class="fg-m" x="456" y="52">pk = digest(device_code)</text>
    <text class="fg-xs" x="456" y="76">the device record itself</text>
    <!-- reservation -->
    <rect class="fg-box" x="440" y="152" width="488" height="72" rx="8"/>
    <text class="fg-m" x="456" y="180">pk = uc#&lt;user_code&gt;</text>
    <text class="fg-xs" x="456" y="204">the item that makes the code unique</text>
    <!-- resolves -->
    <path class="fg-edge" d="M684,152 V96" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="696" y="128">resolves the record</text>
    <!-- lookup -->
    <rect class="fg-box" x="32" y="256" width="320" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="284">FindByUserCode</text>
    <text class="fg-xs" x="48" y="308">lookup by user_code</text>
    <path class="fg-edge" d="M352,292 H684 V224" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="518" y="282" text-anchor="middle">strongly consistent read</text>
  </svg>
  <figcaption class="fig-note">The reservation item is the only thing enforcing that a short user code is unique. It is written in the same transaction as the record precisely so that a code can never exist without one, or a reservation without a code.</figcaption>
</figure>

An existing table may therefore still contain the old, unused `by_user_code` index. It is safe to leave that index in place while planning capacity changes; if it is no longer wanted, remove it through the deployment's normal DynamoDB infrastructure procedure after the pre-upgrade records have expired. Do not drop or recreate the table as part of this upgrade. Device codes written before the reservation-item layout have no `uc#...` reservation and are intentionally not resolved by `user_code`; they expire naturally within their normal short lifetime. The adapter does not fall back to the old index, because doing so would let a new request claim a code still held by a live pre-upgrade record.

## Transaction size limit

DynamoDB has no interactive transaction. A handle from `BeginTx` buffers its writes, and `Commit` replays them as one `TransactWriteItems`, which accepts at most 100 actions. Ordinary requests stay far below that. A revocation cascade stages one action per record it retires, so a rotation chain or grant with more stored tokens than the limit makes `Commit` return `oidcdynamo.ErrTransactionTooLarge` and write nothing. The same cascade outside a transaction has no limit: it issues one guarded update per record and converges, but cannot be rolled back.

## Expiry and consistency

DynamoDB TTL cleanup is asynchronous. The adapter treats the TTL attribute as storage reclamation only and checks expiry against its clock on every read, so an expired authorization code stays rejected even while DynamoDB has not deleted its item.

Security-sensitive reads use strongly consistent `GetItem` calls. Global secondary indexes cannot be read consistently, so the refresh-token revocation cascades do not rely on them alone: each refresh token is written together with the link a cascade follows to it (a rotation joins its parent's children set, and a chain root joins an item `grant-roots#<grant id>` in the refresh table), and the cascade follows those links with consistent reads. The transactional adapter buffers writes and commits them through `TransactWriteItems`; that is what keeps authorization-code issuance, PAR consumption, and their related protocol records atomic.

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
