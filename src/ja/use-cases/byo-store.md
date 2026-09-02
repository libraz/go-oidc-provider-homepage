---
title: ストアバックエンドを自前実装する
description: 自前のテーブルや非 SQL バックエンドで store.Store を実装し、ハッシュ化・トランザクション・等価比較だけの並行性契約を守る。
pageClass: pg-use-cases-byo-store
---

# 使い方 — ストアバックエンドを自前実装する

同梱の [SQL アダプタ](/ja/use-cases/sql-store) は `WithNaming` でテーブル名を差し替えられますが、カラム構成はアダプタが所有します。カラム名まで自由にしたい場合（reshape できない既存スキーマ、暗号化カラム、他システムと共有するテーブル、あるいは SQL ですらないバックエンド）は、`store` のサブストアインターフェースを自分で実装し、その集約を `op.WithStore` に渡します。本ライブラリは物理名を一切観測しません。コードが行をマップする先の `store.*` Go 構造体だけを見ます。

この経路は、SQL アダプタでは永続化境界を表せない場合だけ選んでください。自由度は最大ですが、bearer secret のハッシュ化、sentinel エラー、並行性、トランザクションをすべて自分で守る必要があります。既定カラムで足りるなら SQL アダプタを使い、ユーザ検索だけが独自ならユーザストアだけを差し替える方が単純です。

この分担は、片側が動かせず、もう片側が完全に自由です。各操作が何を意味するかは本ライブラリが固定し、その byte をどう保存するかはバックエンド側が決めます。

| 本ライブラリが固定するもの | 組み込み側が選ぶもの |
|---|---|
| nil 以外が必須のサブストア | すべてのテーブル名とカラム名 |
| `op.New` が検証する拡張インターフェース | SQL / KV / DB を使わない実装 |
| 失敗モードごとの sentinel エラー | 暗号化・シャーディング・テナント分離 |
| 単一勝者の遷移と原子性 | トランザクションの実装方法 |
| bearer secret の保存前ハッシュ化 | ダイジェストの計算方法と pepper |

この 2 列を分ける境界が `op.WithStore` です。

<svg role="img" aria-labelledby="byo-store-seam-title" viewBox="0 0 760 152" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="byo-store-seam-title">op.WithStore の境界。各操作の意味は本ライブラリが持ち、その表現は自前のバックエンドが持つ。境界を越えるのは store.* Go 構造体と sentinel エラーだけ。</title>

  <path class="bs-seam" d="M380 26 V140"/>
  <text class="bs-seam-name" x="380" y="18" text-anchor="middle">op.WithStore</text>

  <rect class="bs-lib" x="20" y="40" width="240" height="84" rx="8"/>
  <text class="bs-lib-title" x="140" y="72" text-anchor="middle">本ライブラリ</text>
  <text class="bs-role" x="140" y="94" text-anchor="middle">意味</text>

  <rect class="bs-app" x="500" y="40" width="240" height="84" rx="8"/>
  <text class="bs-app-title" x="620" y="72" text-anchor="middle">自前のバックエンド</text>
  <text class="bs-role" x="620" y="94" text-anchor="middle">表現</text>

  <path d="M264 70 H496"/>
  <path d="M272 66 L264 70 L272 74"/>
  <path d="M488 66 L496 70 L488 74"/>
  <path d="M496 100 H264"/>
  <path d="M272 96 L264 100 L272 104"/>

  <text class="halo bs-wire" x="380" y="74" text-anchor="middle">store.*</text>
  <text class="halo bs-wire" x="380" y="104" text-anchor="middle">store.Err*</text>
</svg>

この境界を越えるのは `store.*` Go 構造体と sentinel エラーだけです。境界の向こう側にあるもの（名前、エンジン、エンコーディング）は OP からは一切見えません。

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
- **`InteractionStoreCAS`** は、上記の永続化が始まる前に終端インタラクションを不変にします。`CompareAndSwap` は `RawState` が変化していないときだけレコードを置き換え（競合時は `ErrConflict`、不在または期限切れなら `ErrNotFound`）、`DeleteIfUnchanged` は競合が無かった場合にのみ削除します。
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

## 実装すべき並行性の契約

現在の `store` インターフェースは、セキュリティに関わる read-modify-write の規則を明示しています。近い動作で済ませるのではなく、バックエンドの契約として実装してください。

- `store.TOTPRecord.Version` と `store.EmailOTPRecord.Version` は、保存後にストアが発行するゼロでない opaque token です。**等価性だけ**に使い、増分、順序比較、削除 / 再作成後の再利用、JSON 文書への露出をしてはいけません。`Put` は呼び出し側の record を変更せず新しい token を割り当て、`CompareAndSwap` は `next.Version == previous.Version` を要求し、読み出した token を受け取り、`Version` を含む保存済み record 全体をフィールド単位で比較し、どちらの入力も変更せず新しい後継 token を割り当てます。古い、または不正な snapshot には `store.ErrAlreadyConsumed` を返します。
- `store.CIBARequestStore.Approve` は Pending → Approved を原子的に遷移させます。遅延解決型の record にすでに空でない `Subject` があり、別の subject を渡した場合は `store.ErrConflict` を返して record を変更しません。空の subject は 1 回だけ設定できます。不在または期限切れには `store.ErrNotFound`、Pending でない record の承認には `store.ErrConflict` を返します。`Consume` は Approved → Consumed の単回遷移を別に行い、Consumed には `store.ErrAlreadyConsumed`、Pending または Denied には `store.ErrConflict` を返します。
- CIBA は集約の `store.Transactional` クラスタの外にあります。`Approve` と `Consume` は read と write を分けて近似せず、それぞれで原子的な遷移を提供してください。
- `store.InteractionStoreCAS` は `RawState` を byte 単位で比較します。byte 列をそのまま保持し、`CompareAndSwap` / `DeleteIfUnchanged` を原子的に実行してください。JSON の再エンコードや whitespace の正規化で version を変えると、正しい完了処理まで `store.ErrConflict` になります。`RawState` を含む全フィールドが同一の replacement も成功した適用として扱います。affected-row count が 0 だからといって競合と判断してはいけません。
- `store.GrantStore.Save` は既存 grant を更新します。トランザクション中に row を lock するか、serializable isolation を使うか、古い基礎に対して `store.ErrConflict` を返してください。ロックなしの read と無条件の save では、並行する同意更新を黙って失います。

SQL アダプタはこれらの version token を `oidc_totp_secrets.row_version` と `oidc_email_otps.row_version` に保存します。version-aware writer を起動する前に [SQL の migration 順序](/ja/use-cases/sql-store#sql-migration-before-first-request)を確認してください。各 sentinel と遷移の実行可能な基準は [contract suite](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) です。

contract harness の `contract.TOTPFactory` は、`store.TOTPStore` そのものではなく、`Store` フィールドに `store.TOTPStore` を持つ `contract.TOTPBackend` を返します。任意の `Diverge` hook では `Version` を変えずに保存済み record を外部から変更するケースも検証できるため、バックエンドは record 全体の compare-and-swap を強制しなければなりません。

これらの SQL 名は同梱アダプタ固有です。BYO バックエンドは別のカラムや非 SQL の表現を選べますが、registration-token store には `RegistrationAccessToken.AllowedScopes` を保存し、MFA store には最初のリクエスト前から同等の opaque compare-and-swap 状態を用意する必要があります。

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
3. **原子性と single-winner 遷移。** 認可コードの引き換え、リフレッシュトークンのローテーション、PAR の消費は、いずれも複数のレコード種別にまたがります。本ライブラリは各サブストアの `Save` / `Consume` がそれ自体で原子的であることに依拠します。ブラウザの authorization-code フローを支えるバックエンドは、複数サブストアの書き込みが 1 つの下層トランザクションを共有するよう `store.Transactional` を実装しなければなりません（[構築時に要求される capability](#構築時に要求される-capability) を参照）。有効な live record に対する単回または条件付き遷移は、並行する caller のうちちょうど 1 つだけが成功し、他は規定の sentinel を返します。完全な record が変わらない idempotent replacement も成功です。affected-row count が 0 だからといって競合と判断してはいけません。単回 `Consume` / TOTP `Accept` は、nil を返す前に消費または進捗状態を保存し、Email OTP `Consume` は入力の `ConsumedAt` が zero でもゼロでない `ConsumedAt` を保存します。example は同梱アダプタと同じ方式で実装しています — サブストアは `*sql.DB` と `*sql.Tx` の両方が満たす小さな `querier` インターフェースを受け取り、`BeginTx` がクラスタのサブストアを 1 つの `*sql.Tx` にバインドして返します。
4. **認可コードでは期限を消費済み判定より先に確認します。** `AuthorizationCodeStore.Consume` は、期限切れかつ消費済みのコードに `store.ErrNotFound` を返します。期限切れが優先されます。期限内で消費済みなら `store.ErrAlreadyConsumed` を返します（利用できる場合は record も返し、呼び出し側が RFC 6749 §4.1.2 の replay cascade 用に `GrantID` を復元できるようにします）。この `ErrAlreadyConsumed` は replay の証拠として cascade を起動します。期限切れだけの場合は通常の invalid-grant として扱い、cascade を起動しません。正常な consume はゼロでない `ConsumedAt` を返します。
5. **リフレッシュのローテーションでは replay の証拠を維持します。** `RefreshTokenStore.Consume` も期限判定を優先します。期限切れかつ消費済みの row は `store.ErrNotFound`、期限内の replay は record と `store.ErrAlreadyConsumed` を返し、OP が chain root を復元できるようにします。ローテーションの save は、`Revoked` の親に対して redeemable な子を残さず、原子的に `store.ErrAlreadyConsumed` を返さなければなりません。親が見つからない場合は retention で回収済みの可能性があり、revocation の証拠にはならないため、子を保存します。`SaveRotationWithRetry` にも同じ親 record の規則が適用されます。
6. **Session、interaction、device code の record には限定された lifecycle 契約があります。** `SessionStore.Touch` が変更するのは `ExpiresAt` と `UpdatedAt` だけです。他のすべての field と secondary index を維持し、値が変わらない冪等な更新も成功として扱います。期限切れ時刻を持つ `SessionStore.Save` または `InteractionStore.Save` は、期限切れ record 自体を保存しなくてもかまいません。ただし同じ ID の有効な record がある場合は削除または置き換えが必要で、以前の record を有効なまま残してはなりません。`DeviceCodeStore.FindByUserCode` は一致した公開状態の `ID` を空にして返し、user code から redeemable な `device_code` credential が漏れないようにします。
7. **PAR の期限判定は `Find` 側、`Consume` 側ではありません。** `PushedAuthRequestStore.Find` は、ブラウザが `request_uri` を `/authorize` に持ち込んだ時点の presentation-time expiry gate です。`Consume` は単回使用性だけを強制し、提示後に `ExpiresAt` を過ぎたことだけを理由に拒否してはいけません。そうしないと、ログイン / MFA / consent が長引いた正常フローが、OP が要求を受け付けた後の code 発行時点で失敗します。

## どの方式が合うか

| やりたいこと | 採用する方式 |
|---|---|
| 既定のテーブルで、永続化だけしたい | [SQL アダプタ](/ja/use-cases/sql-store) |
| **テーブル名**は独自、カラムは既定でよい | SQL アダプタ + [`WithNaming`](/ja/use-cases/sql-store) |
| 既存の **users** テーブルを残し、OIDC レコードは既定でよい | [ユーザストアを自前実装する](/ja/use-cases/byo-userstore) |
| **テーブル名もカラム名も**すべて独自にしたい、または非 SQL バックエンド | このページ |

## 動かす

```sh
(cd examples/26-byo-store-from-scratch && GOWORK=off go run -tags example .)
```

example は OP を `:8080`、ペアの RP を `:9090` で起動します。`demo@example.test` / `demo` でサインインすると、RP の `/me` ページに払い出された ID Token の claim が表示されます。すべて `vault_*` スキーマから提供されています。

## 続きはこちら

- [永続化（SQL）](/ja/use-cases/sql-store) — 同梱アダプタと `WithNaming` によるテーブル名の差し替え。
- [ユーザストアを自前実装する](/ja/use-cases/byo-userstore) — `Users()` サブストアだけを差し替え、OIDC レコードは同梱アダプタに任せる。
- [Hot / Cold 分離（Redis 揮発）](/ja/use-cases/hot-cold-redis) — composite アダプタでサブストアを別々のバックエンドへ振り分ける。
