---
title: 永続化（SQL）
description: database/sql アダプタで SQLite / MySQL / PostgreSQL を使い、追加型のスキーマ migration と定期的な retention GC を運用する。
pageClass: pg-use-cases-sql-store
---

# ユースケース — 永続化（SQL）

## OP は何を保存し、保存先はなぜ重要か

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

Redis アダプタと DynamoDB アダプタも、同じ理由で別モジュールです。

## アーキテクチャ

<figure class="fig">
  <div class="fig-head">アダプタ 1 つ、サブストアごとにテーブル 1 つ</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-sqlstore-title" viewBox="0 0 960 144" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-sqlstore-title">OP は Store インタフェース越しに SQL ストアアダプタを呼び、アダプタが各サブストアを、既に運用しているデータベース内の専用テーブルへ永続化します。</title>
    <!-- provider -->
    <rect class="fg-box" x="32" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m" x="48" y="52">op.Provider</text>
    <text class="fg-s" x="48" y="76">SQL について何も知らない</text>
    <text class="fg-mxs" x="48" y="100">Store インタフェース経由</text>
    <path class="fg-edge" d="M304,72 H344" marker-end="url(#fg-a)"/>
    <!-- adapter -->
    <rect class="fg-box fg-box--accent" x="344" y="24" width="272" height="96" rx="8"/>
    <text class="fg-m fg-accent" x="360" y="52">storeadapter/sql</text>
    <text class="fg-s" x="360" y="76">SQL を話すのはここだけ</text>
    <text class="fg-s" x="360" y="100">サブストアごとにテーブル 1 つ</text>
    <path class="fg-edge fg-edge--accent" d="M616,72 H656" marker-end="url(#fg-ac)"/>
    <!-- database -->
    <rect class="fg-box" x="656" y="24" width="272" height="96" rx="8"/>
    <text class="fg-t2" x="672" y="52">自社の SQL データベース</text>
    <text class="fg-mxs" x="672" y="76">oidc_* tables</text>
    <text class="fg-s" x="672" y="100">既に運用中のスキーマ</text>
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

::: info 必要なときだけ使われるテーブル
`oidc_opaque_access_tokens` に書き込まれるのは、`op.WithAccessTokenFormat(op.AccessTokenFormatOpaque)` または `op.WithAccessTokenFormatPerAudience(...)` が opaque 形式を指定したときだけです。`oidc_grant_revocations` と `oidc_revoked_jtis` は、既定の `RevocationStrategyGrantTombstone` を支えます。どちらのグループも、起点となる grant やリフレッシュの書き込みと同じトランザクションでコミットされるため、カスケードが途中で切れて「失効した grant の隣に、まだ引き換え可能なトークンが残る」状況にはなりません。

自前の `Store` を実装する場合に、どのサブストアを `nil` にできるかは別の規則です。[ストアバックエンドを自前実装する](/ja/use-cases/byo-store) を参照してください。
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

db, err := databasesql.Open("sqlite", "file:op.db?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
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
`Store.Migrate(ctx)` は、アクティブな dialect 用の同梱 `CREATE TABLE IF NOT EXISTS` を実行したあと、テーブルを読み直して必須カラムの欠落を検出すると失敗します。既存テーブルは変更しないので、新しい DB や開発環境向けです。既存環境では、先に [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) の `ALTER` 文を自前の migration ツールで適用してください。適用しないと、`Migrate` は不足カラム名を挙げてエラーで止まります。`Schema()` は現在の DDL を文字列で返すので、レビューや migration ツールへの投入に使えます。スキーマファイルは [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql/schema) に embed されています。
:::

## 既存 DB で最初のリクエストを受ける前に {#sql-migration-before-first-request}

現在のスキーマを使うバイナリを起動する前に、migration を適用します。追加するカラムは次のとおりです。

| テーブル | カラム | 用途 |
|---|---|---|
| `oidc_registration_access_tokens` | `allowed_scopes`（NULL 可） | registration access token の scope 上限。`NULL` は制限なしで、上限を保存する前に作られたトークンも含む |
| `oidc_totp_secrets`、`oidc_email_otps` | `row_version`（`NOT NULL DEFAULT 1`） | アダプタが管理する opaque な compare-and-swap 状態。アプリケーションが増分・再利用・解釈をしてはいけない |
| `oidc_authorization_codes` | `auth_time`、`acr`、`amr`、`authorization_details`、`claims`、`authorization_recorded` | その行を発行した認可の `auth_time`、`acr`、`amr`、authorization details、claims request |
| `oidc_refresh_tokens` | `claims`、`authorization_recorded`、`chain_id` | 同じ認可ごとの状態に加え、行が属するローテーション chain |
| `oidc_opaque_access_tokens` | `authorization_details`、`claims`、`authorization_recorded`、`chain_id` | 同上。introspection と `/userinfo` が共有 grant ではなく発行時の認可を読む |
| `oidc_grant_revocations` | `access_revoked_at` | grant のアクセストークンだけを対象にする tombstone（リフレッシュトークン 1 つの失効に伴うカスケード）の cutoff |

カラムの型はエンジンごとに異なる（SQLite は `TEXT` / `INTEGER`、MySQL と MariaDB は `JSON` / `BIGINT`、PostgreSQL は `JSONB` / `BIGINT`）ので、自分で書かずに `MIGRATIONS.md` からお使いのエンジン用の文をコピーしてください。既定の `authorization_recorded = 0` のまま残った行は、カラムが存在しなかったころと同じく grant から読まれ、空のままの `chain_id` は、ローテーション時に grant 単位の処理へ戻ります。

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

SQLite と PostgreSQL は DDL の `CREATE INDEX IF NOT EXISTS` により `Migrate()` でこれらを追加できます。MySQL と MariaDB は `CREATE TABLE` 内で宣言するため、既存テーブルには `ALTER TABLE ... ADD INDEX` を明示的に適用します。既存の MySQL / MariaDB では、`MIGRATIONS.md` にある `MODIFY ... COLLATE utf8mb4_bin` の文も、`oidc_users.username`、`oidc_users.subject`、`oidc_clients.id`、およびすべての `client_id` と `subject` カラムに適用してください。MySQL の既定の照合順序は大文字小文字とアクセント記号を区別しないため、適用しないと `PutUserWithPassword("Alice", ...)` が既存の `alice` の行を上書きし、`GetClient("MYAPP")` が `myapp` に解決されてしまいます。大文字小文字やアクセントだけが異なる識別子を登録する前に適用してください。既存の値が binary 照合順序で衝突すると `MODIFY` は失敗し、整理すべき行がエラーに示されます。SQLite と PostgreSQL はもともとバイト単位で比較するので、同じ変更は不要です。

既存 DB の更新を新しい `v1.sql` の実行だけに任せたり、テーブルを drop / 再作成したりしないでください。

カラムの性質から、ロールアウトの規則は 2 つあります。

- **MFA テーブル。** `oidc_totp_secrets` と `oidc_email_otps` に、旧 writer と現行 writer を同時に向けないでください。旧 writer は更新から `row_version` を外し、compare-and-swap の手順を迂回します。旧 writer を止め、カラムを追加して検証してから、現行 writer だけを起動します。
- **認可ごとの状態と失効のカラム。** カラムが存在すれば、旧 writer と現行 writer を並行して動かせます。旧バイナリは `authorization_recorded` を 0 のままにし、現行バイナリはその行を grant から解決するためです。差が残るのは 1 点だけです。旧ノードは `access_revoked_at` を読まないので、全ノードが現行バイナリになるまでは、リフレッシュトークン 1 つの失効で grant が失効した JWT アクセストークンが、旧ノードでは検証を通ります。

ロールアウトの全体の順序は [ストレージの保守](/ja/operations/storage-maintenance) にまとめています。

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
db, err := databasesql.Open("mysql",
  "oidc:secret@tcp(mysql:3306)/op?parseTime=true&charset=utf8mb4&loc=UTC")
db.SetMaxOpenConns(50)
db.SetMaxIdleConns(10)
db.SetConnMaxLifetime(30 * time.Minute)
db.SetConnMaxIdleTime(5 * time.Minute)
```

アダプタはプールを調整しないので、上限は組み込み側で決めます。

`charset=utf8mb4` は維持してください。4 バイト UTF-8（絵文字、CJK 拡張）を claim 値で切り詰めずに往復させるためです。

DSN の connection collation は、カラムに明示された `utf8mb4_bin` の定義を置き換えません。既存の MySQL / MariaDB では、[上の migration の節](#sql-migration-before-first-request)の `MODIFY` 文を別途適用してください。

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

`GC` は `oidcsql.GCStats` を返し、期限切れの認可コード、PAR、interaction、session、refresh token ローテーション履歴についてテーブルごとの削除件数を持ちます。refresh sweep は grant 配下の refresh token がすべて有効期限を過ぎるまで履歴を保持し（grant ごとの anti-join なので、大きなテーブルでは最も重い処理です）、row 自体を残す場合でも predecessor 自身の期限を過ぎた sealed retry-response blob を消します。blob の消去は row 件数に加算されません。過去の cutoff は猶予期間を残し、`time.Now()` はその時点ですでに期限切れのものを回収します。アダプタはバックグラウンド GC goroutine も timer も起動しないため、呼び出しのスケジュールと監視は組み込み側が担当します。`GCStats`、所要時間、エラー、各テーブルの残量を記録し、sweep の停止を検知できるようにしてください。access token、opaque token、grant revocation、ConsumedJTI の各サブストアにはポリシー依存の独自 GC があり、device code と CIBA の row は insert 経路で期限切れが排除されます。

## いつ Redis を載せるか

Hot データ（interaction、およびキャッシュ消失後の再ログインを許容するなら session）は生成と陳腐化のサイクルが速く、永続 DB に載せるとテーブルが肥大化します。次ページの [Hot / Cold + Redis](/ja/use-cases/hot-cold-redis) で、永続サブストアを SQL に保ったまま揮発サブストアを Redis にルーティングする方法を示します。
