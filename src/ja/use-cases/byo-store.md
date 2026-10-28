---
title: ストアバックエンドを自前実装する
description: 自前のテーブルや非 SQL バックエンドで store.Store を実装し、ハッシュ化・トランザクション・等価比較だけの並行性契約を守る。
pageClass: pg-use-cases-byo-store
---

# ユースケース — ストアバックエンドを自前実装する

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

<figure class="fig">
  <div class="fig-head">ストアの境界を越えるのは構造体とエラーだけ</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-byostore-title" viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-byostore-title">各ストア操作が何を保証しなければならないかは本ライブラリが持ち、それを実際にどう保存するかは自前のバックエンドが持ちます。境界を越えるのは store パッケージの Go 構造体と sentinel エラーだけです。</title>
    <!-- library -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="896" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="52">ライブラリが持つのは「意味」</text>
    <text class="fg-s" x="48" y="76">「この認可コードを消費する」が何を保証すべきか</text>
    <text class="fg-s" x="48" y="100">どのエラーがどの結果を表すか</text>
    <!-- seam -->
    <path class="fg-rule fg-rule--dashed fg-rule--strong" d="M32,180 H928"/>
    <text class="fg-tab fg-accent" x="32" y="172">op.WithStore</text>
    <!-- structs down, sentinel errors back -->
    <path class="fg-edge" d="M224,120 V240" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl fg-halo" x="236" y="156">store.*</text>
    <path class="fg-edge fg-edge--muted" d="M736,240 V120" marker-end="url(#fg-am)"/>
    <text class="fg-edge-lbl fg-halo" x="748" y="156">store.Err*</text>
    <!-- backend -->
    <rect class="fg-box" x="32" y="240" width="896" height="96" rx="8"/>
    <text class="fg-t2" x="48" y="268">自前のバックエンドが持つのは「表現」</text>
    <text class="fg-s" x="48" y="292">行、item、キー、TTL — 都合のよい形で</text>
    <text class="fg-s" x="48" y="316">既に運用しているデータベースに合わせる</text>
  </svg>
  <figcaption class="fig-note">越えるのはこれだけです。だからアダプタはレビューできます。間違えうる論点はすべて表現の側にあり、そのどれにもインタフェースの契約が答えを与えているからです。</figcaption>
</figure>

この境界を越えるのは `store.*` Go 構造体と sentinel エラーだけです。境界の向こう側にあるもの（名前、エンジン、エンコーディング）は OP からは一切見えません。

> **ソース:** [`examples/26-byo-store-from-scratch`](https://github.com/libraz/go-oidc-provider/tree/main/examples/26-byo-store-from-scratch) — 手書きの `vault_*` スキーマを持つ SQLite 上に `store.Store` を完全実装し、CI で実際のブラウザログイン往復を通して検証しています。

## 何を実装するか

`store.Store` は小さなサブストアインターフェースの集約です（各インターフェースは 1 レコード種別を所有し、メソッドは 1〜6 個）。どれを nil 以外にする必要があるかは、有効にする grant と機能によって決まります。`op.New` が設定と照らし合わせて検査し、足りないものをエラーで名指しします。認可コードフローをフルに提供する OP では、次を実装します。

| サブストア | インターフェース | メソッド | nil 以外が必須になる条件 |
|---|---|---|---|
| クライアント | `store.ClientStore` | `GetClient`（動的登録をサポートしない限り `ClientRegistry` は不要） | 常に |
| ユーザ | `store.UserStore`（`op.PrimaryPassword` を使うなら `store.UserPasswordStore`） | `FindBySubject` / `FindByUsername` / `ReadPasswordHash` | 常に（または [`op.WithUserStore`](/ja/use-cases/byo-userstore) を指定） |
| 消費済み JTI | `store.ConsumedJTIStore` | `Mark` / `Has` | 常に |
| 認可コード | `store.AuthorizationCodeStore` | `Save` / `Find` / `Consume` | `grant.AuthorizationCode` |
| リフレッシュトークン | `store.RefreshTokenStore` | `Save` / `Find` / `Consume` / `RevokeChain` / `RevokeByGrant` | `grant.RefreshToken` |
| grant | `store.GrantStore` | `Save` / `Find` / `FindBySubjectClient` / `ListBySubject` / `Delete` / `HasAny` | `client_credentials` 以外の grant |
| セッション | `store.SessionStore` | `Save` / `Find` / `Touch` / `Delete` / `ListByChooserGroup` | grant が `/auth` を mount する |
| インタラクション | `store.InteractionStoreCAS` | `Save` / `Find` / `Delete` / `CompareAndSwap` / `DeleteIfUnchanged` | grant が `/auth` を mount する |
| PAR | `store.PushedAuthRequestStore` | `Save` / `Find` / `Consume` | `feature.PAR` |
| アクセストークン | `store.AccessTokenRegistry` | `Register` / `Find` / `RevokeByJTI` / `RevokeByGrant` / `GC` | 失効戦略 `RevocationStrategyJTIRegistry` |
| grant 失効 | `store.GrantRevocationStore` | `RevokeGrant` / `RevokeJTI` / `IsRevoked` / `GC` | 既定の戦略 `RevocationStrategyGrantTombstone` |
| メタデータ | `store.MetadataStore` | `Get` / `Set` | 実装を推奨（下記） |

それ以外のアクセサは、対応する機能を有効にしない限り `nil` を返してかまいません。`OpaqueAccessTokens`（opaque 形式のアクセストークンを使うときだけ）、`InitialAccessTokens` と `RegistrationAccessTokens`（動的登録）、`DeviceCodes`、`CIBARequests` です。`op.New` は `nil` を検出し、それを必要とするオプションを後から panic させるのではなく構築時に拒否します。`GrantRevocations` を省くには、あわせて `op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` を指定する必要があります（非 FAPI 配備専用）。

`Metadata` には、`op.New` が起動のたびに確認する subject 発行モード（public か pairwise か）が保存されます。アクセサが `nil` でも起動時の警告が出るだけですが、その場合は既存の grant ストアに対する public と pairwise の切り替えを誰も検出できず、影響を受けるすべてのユーザの `sub` が気付かれずに変わります。実装してください。

## 構築時に要求される capability

サブストアそのものとは別に、OP はいくつかの**拡張インターフェース**をランタイムの型アサーションで検出します。ある capability を core のサブストアではなく拡張に置くのは、その capability を必要としない OP も構築できるからです。`/auth` を一度も mount しない machine-to-machine のバックエンドに、ブラウザフロー用の仕組みまで実装させる理由はありません。バックエンド作者にとって重要なのは、**設定されたフローが壊れる拡張の欠落は `op.New` で検証され、実際のリクエスト中に発覚することはない**という点です。エラーはインターフェース名と、それを必須にした条件の両方を示します。

| 拡張 | 判定対象 | 必須になる条件 |
|---|---|---|
| `store.Transactional` | 集約 `Store` | grant が `/auth` を mount する |
| `store.InteractionStoreCAS` | `Store.Interactions()` | grant が `/auth` を mount する |
| `store.GrantClientLister` | `Store.Grants()` | grant が `/auth` を mount する |
| `store.RefreshRetryResponseStore` | `Store.RefreshTokens()` | `refresh_token` が有効で cookie key が設定されている |
| `store.ClientRegistry` | 集約 `Store` | `op.WithDynamicRegistration` |
| `store.StaticClientReconciler` | 集約 `Store` | `op.WithStaticClients` |

現状 `/auth` を mount するのは `grant.AuthorizationCode` だけなので、`client_credentials`、`device_code`、CIBA だけを支えるストアは上位 3 つのいずれも必要としません。

`store.StaticClientReconciler` は、`op.New` の最後に `op.WithStaticClients` の内容を 1 回の原子的な呼び出しで投入するために使われます。実装がなければ `op.New` はこのオプションを拒否します。

- **`Transactional`** は `store.Tx` を返し、その `AuthorizationCodes()`、`Grants()`、`RefreshTokens()`、`PushedAuthRequests()`、`AccessTokens()`、`OpaqueAccessTokens()`、`GrantRevocations()` は 1 つの下層トランザクションにバインドされます。認可の完了処理は grant、PAR の消費、認可コードの永続化をまとめて commit するため、署名や永続化の失敗が「`request_uri` だけ消費されてコードは出ていない」状態を作れません。トランザクション内の grant 読み出しは行ロック、serializable 分離、または同等の競合検出を `Save` の前に効かせる必要があります。ロックなしの `SELECT` と無条件の `Save` を 1 トランザクションに束ねただけでは、並行する同意更新は失われます。`Sessions`、`Interactions`、`ConsumedJTIs` は意図的に `Tx` から外してあります。
- **`InteractionStoreCAS`** は、上記の永続化が始まる前に終端インタラクションを不変にします。`CompareAndSwap` は `RawState` が変化していないときだけレコードを置き換え（競合時は `ErrConflict`、不在または期限切れなら `ErrNotFound`）、`DeleteIfUnchanged` は競合が無かった場合にのみ削除します。
- **`GrantClientLister`** は Back-Channel Logout の一斉通知が使う、上限付きの audience ビューです。`ListClientIDsBySubject(ctx, subject, cursor, limit)` は安定した昇順で最大 `limit` 件の client ID を返し、続きがあれば `NextCursor` を添えます。クエリ自体を `limit+1` 行に制限してください。`ListBySubject` を呼んで結果を切り出す実装では、ログアウト通知 1 件あたりのデータベース負荷と client registry 参照を抑えるという目的が失われます。
- **`RefreshRetryResponseStore`** は、封緘済みのトークンレスポンスを消費済みの前任トークンに紐づけて保存します。本ライブラリのリフレッシュ再試行の猶予期間中に、連鎖を分岐させず同じ後継トークンを返すためです。RFC 9700 §4.14.2 はローテーションと再利用検知を扱いますが、この猶予期間は規定していません。`SaveRotationWithRetry` は後継レコードと封緘済み blob を 1 つの操作で書き込む必要があり、それを原子的にできないバックエンドはこのインターフェースを公開してはなりません。blob は不透明な値として扱い、前任トークンの一方向ハッシュを鍵にし、保持期間は前任トークンの寿命を超えないようにします。

次の拡張は任意で、無くても OP は起動を拒否せず機能を縮退させます:

| 拡張 | 判定対象 | 欠けたときに失われるもの |
|---|---|---|
| `store.RevokeByClient` | `Store.RefreshTokens()` とアクセストークン系サブストア | 動的登録クライアントの削除時、そのサブストアの一括失効カスケードが飛ばされる |
| `store.RefreshChainResolver` | `Store.RefreshTokens()` | chain の走査が保存ハンドル参照ではなく `Find` 経由になる |
| `store.OpaqueAccessTokenChainRevoker` | `Store.OpaqueAccessTokens()` | リフレッシュのローテーションが、自分の chain だけでなく grant 全体の opaque アクセストークンを失効させる |
| `store.IssuanceRevocationChecker` | `Store.GrantRevocations()` | リフレッシュトークン 1 つの失効が、同じ grant の他のリフレッシュ chain と未引き換えの認可コードの発行まで拒否する |

::: tip 推測せず contract で確かめる
[`op/store/contract`](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) は core の契約をバックエンドに対して実行し、未実装の拡張はスキップします。どの capability が実際に揃ったかは、このスイートが教えてくれます。
:::

## 実装すべき並行性の契約

現在の `store` インターフェースは、セキュリティに関わる read-modify-write の規則を明示しています。近い動作で済ませるのではなく、バックエンドの契約として実装してください。

- `store.TOTPRecord.Version` と `store.EmailOTPRecord.Version` は、保存後にストアが発行するゼロでない opaque token です。**等価性だけ**に使い、増分、順序比較、削除 / 再作成後の再利用、JSON 文書への露出をしてはいけません。`Put` は呼び出し側の record を変更せず新しい token を割り当て、`CompareAndSwap` は `next.Version == previous.Version` を要求し、読み出した token を受け取り、`Version` を含む保存済み record 全体をフィールド単位で比較し、どちらの入力も変更せず新しい後継 token を割り当てます。古い、または不正な snapshot には `store.ErrAlreadyConsumed` を返します。
- `store.CIBARequestStore.Approve` は Pending → Approved を原子的に遷移させます。遅延解決型の record にすでに空でない `Subject` があり、別の subject を渡した場合は `store.ErrConflict` を返して record を変更しません。空の subject は 1 回だけ設定できます。不在または期限切れには `store.ErrNotFound`、Pending でない record の承認には `store.ErrConflict` を返します。`Consume` は Approved → Consumed の単回遷移を別に行い、Consumed には `store.ErrAlreadyConsumed`、Pending または Denied には `store.ErrConflict` を返します。
- CIBA は集約の `store.Transactional` クラスタの外にあります。`Approve` と `Consume` は read と write を分けて近似せず、それぞれで原子的な遷移を提供してください。
- `store.InteractionStoreCAS` は `RawState` を byte 単位で比較します。byte 列をそのまま保持し、`CompareAndSwap` / `DeleteIfUnchanged` を原子的に実行してください。JSON の再エンコードや whitespace の正規化で version を変えると、正しい完了処理まで `store.ErrConflict` になります。`RawState` を含む全フィールドが同一の replacement も成功した適用として扱います。affected-row count が 0 だからといって競合と判断してはいけません。
- `store.GrantRevocationStore.RevokeGrant` は冪等で、tombstone を広げる方向にしか更新しません。並行する呼び出しは、最も新しい `RevokedAt` と `ExpiresAt` に収束させます。行ロック、`GREATEST()`、条件付き書き込みのいずれかを使ってください。呼び出し側が決めた値を読んでから書き戻す方式では、先に読んだ cascade が最後に書き込み、もう一方が失効させたばかりのアクセストークンを復活させてしまいます。
- `store.GrantStore.Save` は既存 grant を更新します。トランザクション中に row を lock するか、serializable isolation を使うか、古い基礎に対して `store.ErrConflict` を返してください。ロックなしの read と無条件の save では、並行する同意更新を黙って失います。

SQL アダプタはこれらの version token を `oidc_totp_secrets.row_version` と `oidc_email_otps.row_version` に保存します。version-aware writer を起動する前に [SQL の migration 順序](/ja/use-cases/sql-store#sql-migration-before-first-request)を確認してください。各 sentinel と遷移の実行可能な基準は [contract suite](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) です。

contract harness の `contract.TOTPFactory` は、`store.TOTPStore` そのものではなく、`Store` フィールドに `store.TOTPStore` を持つ `contract.TOTPBackend` を返します。任意の `Diverge` hook では `Version` を変えずに保存済み record を外部から変更するケースも検証できるため、バックエンドは record 全体の compare-and-swap を強制しなければなりません。

これらの SQL 名は同梱アダプタ固有です。BYO バックエンドは別のカラムや非 SQL の表現を選べますが、registration-token store には `RegistrationAccessToken.AllowedScopes` を保存し、MFA store には最初のリクエスト前から同等の opaque compare-and-swap 状態を用意する必要があります。

## 認可ごとの状態とリフレッシュ chain

grant は 1 人のユーザと 1 つのクライアントの全認可で共有され、新しい認可のたびに書き換えられます。以前の認可コード、リフレッシュ chain、アクセストークンが後の認可の内容を報告しないよう、OP は認可時点の状態を発行するレコードにコピーします。次のフィールドを保存し、そのまま返してください。

| レコード | 往復させるフィールド |
|---|---|
| `store.AuthorizationCode` | `AuthTime`、`ACR`、`AMR`、`AuthorizationDetails`、`Claims`、`AuthorizationRecorded` |
| `store.RefreshToken` | `AuthTime`、`ACR`、`AMR`、`AuthorizationDetails`、`Claims`、`AuthorizationRecorded`、`ChainID` |
| `store.OpaqueAccessToken` | `AuthTime`、`ACR`、`AMR`、`AuthorizationDetails`、`Claims`、`AuthorizationRecorded`、`ChainID` |
| `store.GrantTombstone` | `AccessTokensOnly` |

- **`AuthorizationRecorded`** は、他のフィールドが発行時に書き込まれたことを示す `true` です。`false` で読み戻された行は、grant から解決されます。これらを一切保存しないバックエンドでも動作はしますが、同じユーザとクライアントの後の認可によって、以前のトークンが報告する内容が変わります。フィールドは一括して保存するか、まったく保存しないかのどちらかにしてください。
- **`ChainID`** は chain の根で割り当てられるランダムな非秘密値で、ローテーションのたびに引き継がれます。リフレッシュのローテーションは、自分の `ChainID` を持つ opaque アクセストークンだけを失効させるので、1 台のデバイスでリフレッシュしても、同じクライアント上の他のセッションは終了しません。これを有効にするには `store.OpaqueAccessTokenChainRevoker.RevokeByChain(ctx, grantID, chainID)` を実装します。空の `chainID` は何にも一致しません。
- **`AccessTokensOnly`** は、リフレッシュトークン 1 つを `/revoke` で失効させたときに書く tombstone の印です。grant のアクセストークンは対象にしますが、同じ grant の他のリフレッシュ chain や未引き換えの認可コードは拒否してはいけません。grant 全体の cutoff とは別に保持してください。`IsRevoked` は両方を、`store.IssuanceRevocationChecker.IsIssuanceRevoked` は grant 全体の cutoff だけを参照します。このフィールドを落とすバックエンドは過剰に失効させます。どの tombstone も grant 全体を終了させるからです。

どちらの任意インターフェースも実装しないストアは、grant 全体に作用する動作のままです。1 つの chain の失効やローテーションが、同じ grant 配下のすべての chain に及びます。

## カラム名は自由

example は、すべてのテーブルとカラムに意図的に非 OIDC 的な名前を付けてこの点を証明しています。本ライブラリはどれも気にしません。

| ストアのレコード | example のテーブル | example のカラム |
|---|---|---|
| クライアント | `vault_relying_parties` | `relying_party`、`redirect_targets`、`permitted_scope` |
| ユーザ | `vault_principals` | `principal`（subject）、`login_handle`、`secret_phc` |
| 認可コード | `vault_grant_codes` | `token_secret_digest`、`principal`、`relying_party`、`ledger_id`、`requested_scope`、`expires_epoch`、`consumed_epoch` |
| リフレッシュトークン | `vault_renewal_slips` | `token_secret_digest`、`ledger_id`、`is_void` |
| grant | `vault_consent_ledger` | `ledger_id`、`principal`、`relying_party`、`requested_scope`、`is_revoked` |
| PAR | `vault_pushed_handles` | `handle_digest` |
| セッション | `vault_browser_seats` | `seat_id`、`chooser_band` |
| アクセストークン | `vault_wire_tokens` | `ticket_id`（jti）、`ledger_id`、`is_void` |

`principal` が subject、`relying_party` が client id、`ledger_id` が grant id です。物理スキーマを `store.*` 構造体へマップするのは、サブストア実装だけです。

## 守るべき契約

サブストアの godoc が規範です。コンパイルが通っても、これらを無視するバックエンドはインターフェースを満たしていません。

1. **保存前ハッシュ（hash-on-store）。** `AuthorizationCode.ID`、`RefreshToken.ID`、`PushedAuthRequest.URI` は opaque な bearer secret であり、所持しているだけで引き換えられます。提示された値を保存前にハッシュし（SHA-256、できればサーバ側 pepper で HMAC 化）、ダイジェストのみを保存し、`Find` / `Consume` では提示値をハッシュしてダイジェストを引き、constant-time で比較します。example は自己完結のため pepper なしの SHA-256 を使い、in-memory リファレンスと同じ方針にしています。本番バックエンドは pepper を加えるべきです。
2. **sentinel エラー。** `store.ErrNotFound`、`store.ErrAlreadyExists`、`store.ErrAlreadyConsumed`、`store.ErrConflict`、`store.ErrTxRequired` を、メソッドの godoc が定める箇所で正確に返します（`sql.ErrNoRows` → `ErrNotFound`、2 回目の `Consume` → `ErrAlreadyConsumed`）。呼び出し側は `errors.Is` でこれらを判別します。列挙された失敗モードに別のエラーを返すと、コンパイルが通っても契約違反です。
3. **原子性と single-winner 遷移。** 認可コードの引き換え、リフレッシュトークンのローテーション、PAR の消費は、いずれも複数のレコード種別にまたがります。本ライブラリは各サブストアの `Save` / `Consume` がそれ自体で原子的であることに依拠します。ブラウザの authorization-code フローを支えるバックエンドは、複数サブストアの書き込みが 1 つの下層トランザクションを共有するよう `store.Transactional` を実装しなければなりません（[構築時に要求される capability](#構築時に要求される-capability) を参照）。有効な live record に対する単回または条件付き遷移は、並行する caller のうちちょうど 1 つだけが成功し、他は規定の sentinel を返します。完全な record が変わらない idempotent replacement も成功です。affected-row count が 0 だからといって競合と判断してはいけません。単回 `Consume` / TOTP `Accept` は、nil を返す前に消費または進捗状態を保存し、Email OTP `Consume` は入力の `ConsumedAt` が zero でもゼロでない `ConsumedAt` を保存します。example は同梱アダプタと同じ方式で実装しています — サブストアは `*sql.DB` と `*sql.Tx` の両方が満たす小さな `querier` インターフェースを受け取り、`BeginTx` がクラスタのサブストアを 1 つの `*sql.Tx` にバインドして返します。
4. **認可コードでは期限を消費済み判定より先に確認します。** `AuthorizationCodeStore.Consume` は、期限切れかつ消費済みのコードに `store.ErrNotFound` を返します。期限切れが優先されます。期限内で消費済みなら `store.ErrAlreadyConsumed` を返します（利用できる場合は record も返し、呼び出し側が RFC 6749 §4.1.2 の replay cascade 用に `GrantID` を復元できるようにします）。この `ErrAlreadyConsumed` は replay の証拠として cascade を起動します。期限切れだけの場合は通常の invalid-grant として扱い、cascade を起動しません。正常な consume はゼロでない `ConsumedAt` を返します。
5. **リフレッシュのローテーションでは replay の証拠を維持します。** `RefreshTokenStore.Consume` も期限判定を優先します。期限切れかつ消費済みの row は `store.ErrNotFound`、期限内の replay は record と `store.ErrAlreadyConsumed` を返し、OP が chain root を復元できるようにします。ローテーションの save は、`Revoked` の親に対して redeemable な子を残さず、原子的に `store.ErrAlreadyConsumed` を返さなければなりません。親が見つからない場合は retention で回収済みの可能性があり、revocation の証拠にはならないため、子を保存します。`SaveRotationWithRetry` にも同じ親 record の規則が適用されます。
6. **Session、interaction、device code の record には限定された lifecycle 契約があります。** `SessionStore.Touch` が変更するのは `ExpiresAt` と `UpdatedAt` だけです。他のすべての field と secondary index を維持し、値が変わらない冪等な更新も成功として扱います。期限切れ時刻を持つ `SessionStore.Save` または `InteractionStore.Save` は、期限切れ record 自体を保存しなくてもかまいません。ただし同じ ID の有効な record がある場合は削除または置き換えが必要で、以前の record を有効なまま残してはなりません。`DeviceCodeStore.FindByUserCode` は一致した公開状態の `ID` を空にして返し、user code から redeemable な `device_code` credential が漏れないようにします。
7. **PAR の期限判定は `Find` 側、`Consume` 側ではありません。** `PushedAuthRequestStore.Find` は、ブラウザが `request_uri` を `/auth` に持ち込んだ時点の presentation-time expiry gate です。`Consume` は単回使用性だけを強制し、提示後に `ExpiresAt` を過ぎたことだけを理由に拒否してはいけません。そうしないと、ログイン / MFA / consent が長引いた正常フローが、OP が要求を受け付けた後の code 発行時点で失敗します。

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
