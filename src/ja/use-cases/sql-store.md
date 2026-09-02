---
title: 永続化（SQL）
description: database/sql アダプタで SQLite / MySQL / PostgreSQL を使い、追加型のスキーマ migration と定期的な retention GC を運用する。
pageClass: pg-use-cases-sql-store
---

# 使い方 — 永続化（SQL）

## OP は何を保存するのか、どこに保存するかが効くのか

OP が保持する行のうち、OAuth / OIDC 仕様が **再起動越しに保持** することを要求するもの:

- **リフレッシュトークンチェーン**（RFC 6749 §6, RFC 9700 §4.14）— 失えば全ユーザのセッションが切れる。
- **登録クライアント**（DCR が ON なら OIDC Dynamic Client Registration 1.0 / RFC 7591、OFF なら静的シード）— 失えば全 RP が動かなくなる。
- **セッション**（OIDC RP-Initiated Logout 1.0）— ブラウザのログイン状態と RP-Initiated Logout の状態を再起動後も保持する。
- **同意グラント**（OIDC Core 1.0 §3.1.2.4）— 失えば再起動のたびに全ユーザに再同意を強いることになる。
- **監査 / introspection / revocation の shadow 行** — [Tokens](/ja/concepts/tokens) で説明したアクセストークン registry。

既定の `inmem` ストアは再起動で全てを失う点で、テスト・デモには十分ですが本番には不向きです。ライブラリは [`op/storeadapter/sql`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql) を同梱しており、`database/sql` アダプタで **SQLite / MySQL 8.0+ / PostgreSQL 14+** を対象にします。

> **ソース:**
> - [`examples/06-sql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/06-sql-store) — SQLite クイックスタート（CGO 不要）。
> - [`examples/07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) — 本番形プールを持つ MySQL。OP と in-process RP を組み合わせ、docker-compose スタックとして同梱。

## なぜサブモジュール

SQL アダプタは **別 Go モジュール** として公開されているので、明示的に追加するまで driver 依存（SQL driver、migration ライブラリ）は `go.sum` に混入しません:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@latest
```

Redis アダプタも同様です。

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">アダプタ 1 つ、サブストアごとにテーブル 1 つ</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-sqlstore-title" viewBox="0 0 960 126" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-sqlstore-title">OP は Store インタフェース越しに SQL ストアアダプタを呼び、アダプタが各サブストアを、既に運用しているデータベース内の専用テーブルへ永続化します。</title>
    <rect class="fg-box" x="36" y="34" width="260" height="70" rx="8"/>
    <text class="fg-t2" x="56" y="62">op.Provider</text>
    <text class="fg-xs" x="56" y="84">SQL について何も知らない</text>
    <path class="fg-edge" d="M300,66 H346" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="323" y="59" text-anchor="middle">Store</text>
    <rect class="fg-box fg-box--accent" x="350" y="34" width="260" height="70" rx="8"/>
    <text class="fg-m fg-accent" x="370" y="62">storeadapter/sql</text>
    <text class="fg-xs" x="370" y="84">SQL を話すのはここだけ</text>
    <path class="fg-edge fg-edge--accent" d="M614,66 H660" marker-end="url(#fg-ac)"/>
    <rect class="fg-box" x="664" y="34" width="260" height="70" rx="8"/>
    <text class="fg-t2" x="684" y="62">自社の SQL データベース</text>
    <text class="fg-mxs" x="684" y="84">oidc_* テーブル</text>
  </svg>
  <figcaption class="fig-note">テーブル名に <code>oidc_</code> の接頭辞を付けているのは、既存のスキーマにそのまま同居させても衝突しないようにするためです。その上の層はスキーマの存在を知りません。</figcaption>
</figure>

サブストアはそれぞれ 1 つのテーブルに対応します。プロトコル処理が最もよく触るのは次のテーブルです。

| テーブル | 保持する内容 |
|---|---|
| `oidc_clients` | 登録済みクライアントのメタデータ。`ClientStore` の実体 |
| `oidc_authorization_codes` | `/token` での引き換えを待っている認可コード |
| `oidc_refresh_tokens` | リフレッシュトークンの chain とローテーション状態 |
| `oidc_grants` | 認可コードやリフレッシュトークンがぶら下がる grant。クライアント / subject / scope |
| `oidc_access_tokens` | 発行済みアクセストークンの JTI レジストリ。`RevocationStrategyJTIRegistry` のときだけ書き込まれる |
| `oidc_opaque_access_tokens` | opaque 形式のアクセストークン。opaque を設定したときだけ書き込まれる |
| `oidc_grant_revocations` | 既定の `RevocationStrategyGrantTombstone` が使う grant の tombstone |
| `oidc_revoked_jtis` | 個別に失効させたトークン識別子。上の tombstone と対になる |
| `oidc_sessions` | ブラウザのログインセッションと chooser group |
| `oidc_consumed_jtis` | request object / client assertion / DPoP proof の消費済み `jti` 集合 |

このほかにも、ユーザ、interaction、PAR レコード、デバイスフローと CIBA の要求、動的登録用トークン、認証器サブストアのテーブルをアダプタが所有します。DDL 全体は `Schema()` が dialect ごとに返します。

::: info 新しいサブストア
SQL アダプタは以下のテーブルを同梱します:

- **`oidc_opaque_access_tokens`** — opaque アクセストークンサブストアの裏側。`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` または `op.WithAccessTokenFormatPerAudience(...)` を有効にしたときだけ書き込まれます。
- **`oidc_grant_revocations`** + **`oidc_revoked_jtis`** — 既定の `RevocationStrategyGrantTombstone` を支えるテーブル。

どちらもトランザクションクラスタの一部で、起点となる grant / refresh の書き込みと同時にコミットされます — カスケードが途中で切れて「失効した grant の隣に、まだ引き換え可能なトークンが残る」状況にはなりません。

同梱アダプタを使わずカスタムの `Store` 実装をシップする場合は、`OpaqueAccessTokens()` と `GrantRevocations()` の実装が **必須** です。`OpaqueAccessTokens()` は `WithAccessTokenFormat(op.AccessTokenFormatOpaque)` も `WithAccessTokenFormatPerAudience` も opaque audience を指さない限り `nil` を返してかまいません。`GrantRevocations()` を `nil` にできるのは、`op.WithAccessTokenRevocationStrategy(op.RevocationStrategyNone)` を明示している場合だけです（非 FAPI 配備専用） — 既定の `RevocationStrategyGrantTombstone` は構築時にこのサブストアを必須とします。それ以外は `op.New` が構成エラーを返します。
:::

## コード

```go
import (
  "context"
  databasesql "database/sql"
  _ "modernc.org/sqlite" // または MySQL / Postgres driver

  "github.com/libraz/go-oidc-provider/op"
  oidcsql "github.com/libraz/go-oidc-provider/op/storeadapter/sql"
)

db, err := databasesql.Open("sqlite", "file:op.db?_journal=WAL&_busy_timeout=5000")
if err != nil { /* ... */ }

storage, err := oidcsql.New(db, oidcsql.SQLite()) // または oidcsql.MySQL() / oidcsql.Postgres()
if err != nil { /* ... */ }

if err := storage.Migrate(context.Background()); err != nil {
  /* ... */
}

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(storage),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),
  op.WithLoginFlow(op.LoginFlow{
    Primary: op.PrimaryPassword{Store: storage.UserPasswords()},
  }),
)
```

::: tip マイグレーション
`*sql.Store.Migrate(ctx)` はアクティブな dialect 用の同梱スキーマを適用しますが、`CREATE TABLE IF NOT EXISTS` は既存テーブルを変更しません。新しい DB や開発環境には適していますが、既存環境では `Migrate` だけに頼らず、[`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) の追加変更を通常の migration ツールで適用してください。SQLite と PostgreSQL は `Migrate` で独立したインデックス定義を再適用できますが、不足している互換性カラムと MySQL / MariaDB の username 照合順序変更には明示的な `ALTER` が必要です。`Schema()` は現在の DDL を文字列で返すので、レビューや migration ツールへの投入に利用できます。スキーマファイルは [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql/schema) に embed されています。
:::

## 既存 DB で最初のリクエストを受ける前に {#sql-migration-before-first-request}

現在の MFA と動的登録の契約を使うバイナリを起動する前に、migration を適用します。追加するものは `oidc_registration_access_tokens.allowed_scopes`（NULL 可）、`oidc_totp_secrets.row_version`、`oidc_email_otps.row_version`（いずれも `NOT NULL DEFAULT 1`）です。SQLite では `TEXT` / `INTEGER`、MySQL または MariaDB では `JSON` / `BIGINT`、PostgreSQL では `JSONB` / `BIGINT` を使います。`allowed_scopes = NULL` は、scope 上限を保存する前に作られた RAT を含め、制限なしの登録 access token 上限を表します。`row_version` はアダプタが管理する opaque な compare-and-swap 状態なので、アプリケーションが増分したり再利用したり意味を割り当てたりしてはいけません。

現在の retention とクライアント削除のクエリには、次の正確なインデックスも必要です（`WithNaming` で物理名を変えている場合は物理名に読み替えます）。

| インデックス | テーブルとカラム | 用途 |
|---|---|---|
| `idx_oidc_grants_client_subject` | `oidc_grants(client_id, subject, updated_at)` | クライアント削除時の subject 列挙 |
| `idx_oidc_grants_client` | `oidc_grants(client_id)` | クライアント単位の cascade |
| `idx_oidc_authorization_codes_expires` | `oidc_authorization_codes(expires_at)` | 期限切れ認可コードの sweep |
| `idx_oidc_refresh_tokens_expires` | `oidc_refresh_tokens(expires_at)` | refresh 履歴の sweep |
| `idx_oidc_refresh_tokens_client` | `oidc_refresh_tokens(client_id)` | クライアント削除の cascade |
| `idx_oidc_access_tokens_expires` | `oidc_access_tokens(expires_at)` | access token の retention query |
| `idx_oidc_access_tokens_client` | `oidc_access_tokens(client_id)` | クライアント削除の cascade |
| `idx_oidc_opaque_access_tokens_client` | `oidc_opaque_access_tokens(client_id)` | クライアント削除の cascade |
| `idx_oidc_sessions_expires` | `oidc_sessions(expires_at)` | session の sweep |
| `idx_oidc_par_records_expires` | `oidc_par_records(expires_at)` | PAR の sweep |
| `idx_oidc_interactions_expires` | `oidc_interactions(expires_at)` | interaction の sweep |
| `idx_oidc_consumed_jtis_expires` | `oidc_consumed_jtis(expires_at)` | replay marker の retention query |

SQLite と PostgreSQL は DDL の `CREATE INDEX IF NOT EXISTS` により `Migrate()` でこれらを追加できます。MySQL と MariaDB は `CREATE TABLE` 内で宣言するため、既存テーブルには `ALTER TABLE ... ADD INDEX` を明示的に適用します。既存の MySQL / MariaDB では `ALTER TABLE oidc_users MODIFY username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;` も適用してください。大文字小文字だけが異なる既存 username の衝突を先に解消してから、この `ALTER TABLE` と index の変更を適用します。SQLite と PostgreSQL に同じ照合順序変更は必要ありません。既存 DB の更新を新しい `v1.sql` の実行だけに任せたり、テーブルを drop / 再作成したりしないでください。MFA については旧 writer を停止してからカラムを追加・検証し、opaque version protocol に参加する writer だけを起動します。ロールアウト順序は [ストレージの保守](/ja/operations/storage-maintenance) にまとめています。

## テーブル名を差し替える

同梱テーブルの名前は `oidc_clients`、`oidc_refresh_tokens` のように `oidc_` 接頭辞で固定されています。既に `clients` テーブルを持つ DB に OP を組み込みたい場合や、社内規約が `oidc_` 接頭辞を許さない場合は、`oidcsql.WithNaming` で OP 内部レコードの物理テーブル名を任意に差し替えられます。アダプタは物理名を SQL 標準の識別子文法で検証し、同梱 DDL を書き換え、すべてのクエリを差し替え後のテーブルに対して組み立てます。そのため `Schema()` / `Migrate()` と実行時クエリは常に一致します。

```go
storage, err := oidcsql.New(db, oidcsql.Postgres(), oidcsql.WithNaming(map[string]string{
  "clients":             "auth_clients",
  "refresh_tokens":      "auth_refresh_tokens",
  "authorization_codes": "auth_codes",
  // ...必要なだけ差し替え可能。指定しない種別は oidc_ 既定のまま。
}))
```

map のキーは物理名ではなく論理的なレコード種別です。`oidcsql.New` が受け付けるのは次の 23 個です。

| 区分 | 論理キー |
|---|---|
| クライアントと grant | `clients`、`grants`、`authorization_codes`、`refresh_tokens` |
| アクセストークン | `access_tokens`、`opaque_access_tokens` |
| 失効 | `grant_revocations`、`revoked_jtis` |
| ブラウザ側の状態 | `sessions`、`interactions` |
| PAR と再利用検出マーカ | `par_records`、`consumed_jtis` |
| ユーザ | `users` |
| 動的登録 | `initial_access_tokens`、`registration_access_tokens` |
| OP メタデータ | `op_metadata` |
| デバイスフローと CIBA | `device_codes`、`ciba_requests` |
| 認証器の factor | `totp_secrets`、`passkeys`、`recovery_codes`、`email_otps`、`authn_lockouts` |

未知のキーを渡すと `oidcsql.New` が即座にエラーを返すので、タイポは最初のクエリではなく構築時に検出できます。

解決後の物理テーブル名はすべて相互に異なる必要があります。2 つの論理ストアが同じテーブルへ map される場合や、override が未指定の既定テーブル名と衝突する場合、`oidcsql.New` は構築時に失敗します。スキーマ書き換えは exact-name ベースなので、`clients` の override が `client_secrets` のような部分文字列を誤って書き換えることもありません。

> **ソース:** [`examples/25-byo-table-names`](https://github.com/libraz/go-oidc-provider/tree/main/examples/25-byo-table-names) は 23 テーブルすべてを `auth_` 接頭辞へ差し替え、`sqlite_master` から読み戻して書き換えが効いたことを確認しています。

::: warning 差し替えられるのはテーブル名のみ、カラム名は不可
`WithNaming` が書き換えるのはテーブル名だけです。カラム構成はアダプタが所有しており固定です。カラム名まで自由にしたい場合（reshape できない既存スキーマ、暗号化カラム、共有テーブルなど）は、同梱アダプタを使わず `store` インターフェースを自分で実装してください。[ストアバックエンドを自前実装する](/ja/use-cases/byo-store) を参照。
:::

## MySQL プールサイズ

[`examples/07-mysql-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/07-mysql-store) は本番形の DSN を示します:

```go
db, err := stdsql.Open("mysql",
  "oidc:secret@tcp(mysql:3306)/op?parseTime=true&charset=utf8mb4&collation=utf8mb4_0900_ai_ci")
db.SetMaxOpenConns(64)
db.SetMaxIdleConns(8)
db.SetConnMaxLifetime(30 * time.Minute)
```

`charset=utf8mb4` は必須です — 4 バイト UTF-8（絵文字、CJK 拡張）を claim 値で切り詰めずに往復させるためです。

DSN の connection collation は `oidc_users.username` に明示された定義を置き換えません。既存の MySQL / MariaDB では `ALTER TABLE oidc_users MODIFY username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;` を別途適用します。この変更は、大文字小文字を区別しない既存 username の衝突があると失敗するため、先に衝突を解消してください。

## ユーザ名 + password による認証情報

SQL アダプタは `store.UserPasswordStore`（inmem リファレンスアダプタと同じインターフェース）を実装するので、組み込みの [`op.PrimaryPassword`](/ja/use-cases/mfa-step-up) Step を SQL バックエンドに対してそのまま組み込めます。glue コードは不要です:

```go
flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: storage.UserPasswords()},
}

provider, err := op.New(
  /* ... */
  op.WithLoginFlow(flow),
)
```

スキーマは `oidc_users` に 2 つのカラムを追加します。ユーザ名検索用の一意インデックス（`FindByUsername` が利用）と、PHC 形式のハッシュを保持する `password_hash` カラム（`ReadPasswordHash` が読み出す）です。

ハッシュ符号化は組み込み側の責務です — 補助の writer `*sql.Store.PutUserWithPassword(ctx, user, username, hash)` は `op.HashPassword`（argon2id、ライブラリ既定値）が返したハッシュを受け取り、`PutUser` と同じ upsert を経由します:

```go
hash, _ := op.HashPassword("demo")
_ = storage.PutUserWithPassword(ctx, &store.User{
  Subject: "demo-user",
  Claims:  map[string]any{"name": "Demo User"},
}, "demo", hash)
```

ユーザ名を空文字、ハッシュを `nil` にして渡すと認証情報を消去できます — passkey 専用に移行したユーザを扱うときに便利です。

`ReadPasswordHash` は subject が未知の場合と、行は存在するが password を持たない場合の両方で `store.ErrNotFound` を返すので、`LoginFlow` 側はどちらの場合も user enumeration 攻撃に対して安全な応答を返せます。

## Contract test ハーネス

`inmem` を検査する同じ contract test suite (`op/store/contract`) が、SQL アダプタに対しても `go test -tags=testcontainers` で testcontainers-go 経由の実 MySQL / Postgres を起動して実行されます。「SQL アダプタは `Store` interface を実装する」というライブラリの主張は、モックではなく実エンジンに対して検証されたものです。

固定しているイメージ（`mysql:8.4`、`postgres:16-alpine`）は、`examples/07-mysql-store` および `examples/09-redis-volatile` の docker-compose スタックが使うエンジンマトリクスと揃えてあるので、アダプタレベルと example レベルの統合検証で同じ組み合わせを共有できます。

## retention GC をスケジュールする

SQL アダプタは、期限切れの行をすべてリクエスト経路で削除するわけではありません。アプリケーションの cron、leader election した worker、または別の保守スケジューラから `(*oidcsql.Store).GC(ctx, cutoff)` を呼び出します。

```go
cutoff := time.Now().UTC().Add(-15 * time.Minute) // 短い調査用猶予を残す
stats, err := storage.GC(ctx, cutoff)
if err != nil {
  return err
}
log.Printf("oidc GC removed %d rows", stats.Total())
```

`GC` は `oidcsql.GCStats` を返し、期限切れの認可コード、PAR、interaction、session、refresh token ローテーション履歴についてテーブルごとの削除件数を持ちます。refresh sweep は grant 配下の refresh token がすべて有効期限を過ぎるまで履歴を保持し、row 自体を残す場合でも predecessor 自身の期限を過ぎた sealed retry-response blob を消します。blob の消去は row 件数に加算されません。過去の cutoff は猶予期間を残し、`time.Now()` はその時点ですでに期限切れのものを回収します。アダプタはバックグラウンド GC goroutine も timer も起動しないため、呼び出しのスケジュールと監視は組み込み側が担当します。`GCStats`、所要時間、エラー、各テーブルの残量を記録し、sweep の停止を検知できるようにしてください。access token、opaque token、grant revocation、ConsumedJTI の各サブストアにはポリシー依存の独自 GC があり、device code と CIBA の row は insert 経路で期限切れが排除されます。

## いつ Redis を載せるか

Hot データ（interaction、消費済み JTI）は生成と陳腐化のサイクルが速く、永続 DB に載せるとテーブルが肥大化します。次ページの [Hot / Cold + Redis](/ja/use-cases/hot-cold-redis) で、永続サブストアを SQL に保ったまま揮発サブストアを Redis にルーティングする方法を示します。
