---
title: ストアバックエンドを自前実装する
description: store.Store インターフェースを直接実装し、独自のテーブル名・カラム名で OP を支える。
---

# 使い方 — ストアバックエンドを自前実装する

同梱の [SQL アダプタ](/ja/use-cases/sql-store) は `WithNaming` でテーブル名を差し替えられますが、カラム構成はアダプタが所有します。カラム名まで自由にしたい場合（reshape できない既存スキーマ、暗号化カラム、他システムと共有するテーブル、あるいは SQL ですらないバックエンド）は、`store` のサブストアインターフェースを自分で実装し、その集約を `op.WithStore` に渡します。本ライブラリは物理名を一切観測しません。コードが行をマップする先の `store.*` Go 構造体だけを見ます。

この経路は、SQL アダプタでは永続化境界を表せない場合だけ選んでください。自由度は最大ですが、bearer secret のハッシュ化、sentinel エラー、並行性、トランザクションをすべて自分で守る必要があります。既定カラムで足りるなら SQL アダプタを使い、ユーザ検索だけが独自なら user store だけを差し替える方が単純です。

> **ソース:** [`examples/26-byo-store-from-scratch`](https://github.com/libraz/go-oidc-provider/tree/main/examples/26-byo-store-from-scratch) — 手書きの `vault_*` スキーマを持つ SQLite 上に `store.Store` を完全実装し、CI で実際のブラウザログイン往復を通して検証しています。

## 何を実装するか

`store.Store` は小さなサブストアインターフェースの集約です（各インターフェースは 1 レコード種別を所有し、メソッドは 1〜5 個）。認可コードフローの OP では次のサブストアを nil 以外で実装します。

| サブストア | インターフェース | メソッド |
|---|---|---|
| クライアント | `store.ClientStore` | `GetClient`（動的登録をサポートしない限り `ClientRegistry` は不要） |
| 認可コード | `store.AuthorizationCodeStore` | `Save` / `Find` / `Consume` |
| リフレッシュトークン | `store.RefreshTokenStore` | `Save` / `Find` / `Consume` / `RevokeChain` / `RevokeByGrant` |
| grant | `store.GrantStore` | `Save` / `Find` / `FindBySubjectClient` / `ListBySubject` / `Delete` / `HasAny` |
| セッション | `store.SessionStore` | `Save` / `Find` / `Touch` / `Delete` / `ListByChooserGroup` |
| PAR | `store.PushedAuthRequestStore` | `Save` / `Find` / `Consume` |
| インタラクション | `store.InteractionStoreCAS` | `Save` / `Find` / `Delete` / `CompareAndSwap` / `DeleteIfUnchanged` |
| 消費済み JTI | `store.ConsumedJTIStore` | `Mark` / `Has` |
| ユーザ | `store.UserPasswordStore` | `FindBySubject` / `FindByUsername` / `ReadPasswordHash` |
| アクセストークン | `store.AccessTokenRegistry` | `Register` / `Find` / `RevokeByJTI` / `RevokeByGrant` / `GC` |
| メタデータ | `store.MetadataStore` | `Get` / `Set` |

残りのサブストアのアクセサは、対応する機能を有効にしない限り `nil` を返してかまいません — `OpaqueAccessTokens`、`InitialAccessTokens`、`RegistrationAccessTokens`、`DeviceCodes`、`CIBARequests`、`GrantRevocations` です。本ライブラリは `op.New` で `nil` を検出し、それを必要とするオプションを後から panic させるのではなく構築時に拒否します。`GrantRevocations` を省くには、あわせて `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` を指定する必要があります（非 FAPI 配備専用）。既定の grant-tombstone 戦略は構築時にこのサブストアを必須とします。

## 構築時に要求される capability

サブストアそのものとは別に、OP はいくつかの**拡張インターフェース**をランタイムの型アサーションで検出します。ある capability を core のサブストアではなく拡張に置くのは、その capability を必要としない OP も構築できるからです。`/authorize` を一度も mount しない machine-to-machine のバックエンドに、ブラウザフロー用の仕組みまで実装させる理由はありません。バックエンド作者にとって重要なのは、**設定されたフローが壊れる拡張の欠落は `op.New` で検証され、実際のリクエスト中に発覚することはない**という点です。エラーはインターフェース名と、それを必須にした条件の両方を示します。

| 拡張 | 判定対象 | 必須になる条件 |
|---|---|---|
| `store.Transactional` | 集約 `Store` | grant が `/authorize` を mount する |
| `store.InteractionStoreCAS` | `Store.Interactions()` | grant が `/authorize` を mount する |
| `store.GrantClientLister` | `Store.Grants()` | grant が `/authorize` を mount する |
| `store.RefreshRetryResponseStore` | `Store.RefreshTokens()` | `refresh_token` が有効で cookie key が設定されている |
| `store.ClientRegistry` | 集約 `Store` | `op.WithDynamicRegistration` |

現状 `/authorize` を mount するのは `grant.AuthorizationCode` だけなので、`client_credentials`、`device_code`、CIBA だけを支えるストアは上位 3 つのいずれも必要としません。

- **`Transactional`** は `store.Tx` を返し、その `AuthorizationCodes()`、`Grants()`、`RefreshTokens()`、`PushedAuthRequests()`、`AccessTokens()`、`OpaqueAccessTokens()`、`GrantRevocations()` は 1 つの下層トランザクションにバインドされます。認可の完了処理は grant、PAR の消費、認可コードの永続化をまとめて commit するため、署名や永続化の失敗が「`request_uri` だけ消費されてコードは出ていない」状態を作れません。トランザクション内の grant 読み出しは行ロック、serializable 分離、または同等の競合検出を `Save` の前に効かせる必要があります。ロックなしの `SELECT` と無条件の `Save` を 1 トランザクションに束ねただけでは、並行する同意更新は失われます。`Sessions`、`Interactions`、`ConsumedJTIs` は意図的に `Tx` から外してあります。
- **`InteractionStoreCAS`** は、上記の永続化が始まる前に終端インタラクションを不変にします。`CompareAndSwap` は `RawState` が変化していないときだけレコードを置き換え(競合時は `ErrConflict`、不在または期限切れなら `ErrNotFound`)、`DeleteIfUnchanged` は競合が無かった場合にのみ削除します。
- **`GrantClientLister`** は Back-Channel Logout の一斉通知が使う、上限付きの audience ビューです。`ListClientIDsBySubject(ctx, subject, cursor, limit)` は安定した昇順で最大 `limit` 件の client ID を返し、続きがあれば `NextCursor` を添えます。クエリ自体を `limit+1` 行に制限してください。`ListBySubject` を呼んで結果を切り出す実装では、ログアウト通知 1 件あたりのデータベース負荷と client registry 参照を抑えるという目的が失われます。
- **`RefreshRetryResponseStore`** は、封緘済みのトークンレスポンスを消費済みの前任トークンに紐づけて保存します。RFC 9700 の配送猶予期間で chain を分岐させず、同じ後継トークンをそのまま再送するためです。`SaveRotationWithRetry` は後継レコードと封緘済み blob を 1 つの操作で書き込む必要があり、それを原子的にできないバックエンドはこのインターフェースを公開してはなりません。blob は不透明な値として扱い、前任トークンの一方向ハッシュを鍵にし、保持期間は前任トークンの寿命を超えないようにします。

次の拡張は任意で、無くても OP は起動を拒否せず機能を縮退させます:

| 拡張 | 判定対象 | 欠けたときに失われるもの |
|---|---|---|
| `store.StaticClientReconciler` | 集約 `Store` | `WithStaticClients` のレコードがバックエンドと突き合わされない |
| `store.RevokeByClient` | `Store.RefreshTokens()` とアクセストークン系サブストア | 動的登録クライアントの削除時、そのサブストアの一括失効カスケードが飛ばされる |
| `store.RefreshChainResolver` | `Store.RefreshTokens()` | chain の走査が保存ハンドル参照ではなく `Find` 経由になる |

::: tip 推測せず contract で確かめる
[`op/store/contract`](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) は core の契約をバックエンドに対して実行し、未実装の拡張はスキップします。どの capability が実際に揃ったかは、このスイートが教えてくれます。
:::

## カラム名は自由

example は、すべてのテーブルとカラムに意図的に非 OIDC 的な名前を付けてこの点を証明しています。本ライブラリはどれも気にしません。

| ストアのレコード | example のテーブル | example のカラム |
|---|---|---|
| クライアント | `vault_relying_parties` | `relying_party`、リダイレクト / scope のメタデータ |
| ユーザ | `vault_principals` | `principal`（subject）、`login_name`、`secret_phc` |
| 認可コード | `vault_grant_codes` | `code_digest`、`principal`、`relying_party`、`requested_scope`、`issued_epoch`、`expires_epoch`、`consumed_epoch` |
| リフレッシュトークン | `vault_renewal_slips` | `token_secret_digest`、`ledger_id`、`is_void` |
| grant | `vault_consent_ledger` | `ledger_id`、`granted_scope` |
| PAR | `vault_pushed_handles` | `handle_digest` |
| セッション | `vault_browser_seats` | `seat_id`、`chooser_band` |
| アクセストークン | `vault_wire_tokens` | jti、`ledger_id`、`is_revoked` |

`principal` が subject、`relying_party` が client id、`ledger_id` が grant id です。物理スキーマを `store.*` 構造体へマップするのは、サブストア実装だけです。

## 守るべき契約

サブストアの godoc が規範です。コンパイルが通っても、これらを無視するバックエンドはインターフェースを満たしていません。

1. **保存前ハッシュ（hash-on-store）。** `AuthorizationCode.ID`、`RefreshToken.ID`、`PushedAuthRequest.URI` は opaque な bearer secret であり、所持しているだけで引き換えられます。提示された値を保存前にハッシュし（SHA-256、できればサーバ側 pepper で HMAC 化）、ダイジェストのみを保存し、`Find` / `Consume` では提示値をハッシュしてダイジェストを引き、constant-time で比較します。example は自己完結のため pepper なしの SHA-256 を使い、in-memory リファレンスと同じ方針にしています。本番バックエンドは pepper を加えるべきです。
2. **sentinel エラー。** `store.ErrNotFound`、`store.ErrAlreadyExists`、`store.ErrAlreadyConsumed`、`store.ErrConflict`、`store.ErrTxRequired` を、メソッドの godoc が定める箇所で正確に返します（`sql.ErrNoRows` → `ErrNotFound`、2 回目の `Consume` → `ErrAlreadyConsumed`）。呼び出し側は `errors.Is` でこれらを判別します。列挙された失敗モードに別のエラーを返すと、コンパイルが通っても契約違反です。
3. **原子性。** 認可コードの引き換え、リフレッシュトークンのローテーション、PAR の消費は、いずれも複数のレコード種別にまたがります。本ライブラリは各サブストアの `Save` / `Consume` がそれ自体で原子的であることに依拠します。ブラウザの authorization-code フローを支えるバックエンドは、複数サブストアの書き込みが 1 つの下層トランザクションを共有するよう `store.Transactional` を実装しなければなりません([構築時に要求される capability](#構築時に要求される-capability) を参照)。example は同梱アダプタと同じ方式で実装しています — サブストアは `*sql.DB` と `*sql.Tx` の両方が満たす小さな `querier` インターフェースを受け取り、`BeginTx` がクラスタのサブストアを 1 つの `*sql.Tx` にバインドして返します。
4. **PAR の期限判定は `Find` 側、`Consume` 側ではない。** `PushedAuthRequestStore.Find` は、ブラウザが `request_uri` を `/authorize` に持ち込んだ時点の presentation-time expiry gate です。`Consume` は単回使用性だけを強制し、提示後に `ExpiresAt` を過ぎたことだけを理由に拒否してはいけません。そうしないと、ログイン / MFA / consent が長引いた正常フローが、OP が要求を受け付けた後の code 発行時点で失敗します。

## どの方式が合うか

| やりたいこと | 採用する方式 |
|---|---|
| 既定のテーブルで、永続化だけしたい | [SQL アダプタ](/ja/use-cases/sql-store) |
| **テーブル名**は独自、カラムは既定でよい | SQL アダプタ + [`WithNaming`](/ja/use-cases/sql-store) |
| 既存の **users** テーブルを残し、OIDC レコードは既定でよい | [ユーザストアを自前実装する](/ja/use-cases/byo-userstore) |
| **テーブル名もカラム名も**すべて独自にしたい、または非 SQL バックエンド | このページ |

## 動かす

```sh
(cd examples/26-byo-store-from-scratch && go run -tags example .)
```

example は OP を `:8080`、ペアの RP を `:9090` で起動します。`demo@example.test` / `demo` でサインインすると、RP の `/me` ページに払い出された ID Token の claim が表示されます。すべて `vault_*` スキーマから提供されています。

## 次に読む

- [永続化（SQL）](/ja/use-cases/sql-store) — 同梱アダプタと `WithNaming` によるテーブル名の差し替え。
- [ユーザストアを自前実装する](/ja/use-cases/byo-userstore) — `Users()` サブストアだけを差し替え、OIDC レコードは同梱アダプタに任せる。
- [Hot / Cold 分離（Redis 揮発）](/ja/use-cases/hot-cold-redis) — composite アダプタでサブストアを別々のバックエンドへ振り分ける。
