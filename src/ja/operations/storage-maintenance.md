---
title: ストレージの保守
description: SQL スキーマ変更の順序、retention GC のスケジュール、OP の再起動を支えるストレージ監視をまとめます。
outline: 2
---

# ストレージの保守

OP を安全に再起動できるのは、スキーマ、writer、retention job が同じストレージ契約に従っている場合です。既存環境をアップグレードするときのチェックリストとして、このページを使ってください。SQL アダプタを中心に説明し、DynamoDB と自前ストアで必要な作業も補足します。

::: info スキーマ変更の手順がある理由
`Store.Migrate` が実行するのは `CREATE TABLE IF NOT EXISTS` で、既存テーブルは変更されません。カラムが増えるリリースでは、以前のリリースで作った DB に明示的な `ALTER TABLE` が必要です。`Migrate` は実行後にテーブルを読み直し、必須カラムが無ければ失敗します。`ALTER` を忘れても、後からクエリエラーとして現れるのではなく起動時に止まります。`Migrate` を呼ばない構成では、不足したカラムに触れた最初のリクエストが失敗します。
:::

## 作業の順序

現在のストレージ形状を必要とするバイナリへトラフィックを流す前に、次の順序で作業します。

1. **古い MFA writer を停止します。** TOTP または Email OTP のレコードを書き込む worker を drain します。`row_version` カラムを使う writer と古い writer を同時に動かしてはいけません。古い statement は opaque version protocol に参加しないため、世代を検証せず上書きできます。後述の認可状態と chain のカラムにこの制約はなく、古いバイナリと新しいバイナリが並行して書き込めます。
2. **バックアップを取得し、migration を記録します。** スキーマのバックアップ、適用した正確な statement、検証結果をデプロイ記録と一緒に保管します。[バックアップ / DR](/ja/operations/backup) にある復旧手順で永続ストアと署名鍵を復元できることも確認します。
3. **追加型のスキーマ変更を適用します。** [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) の dialect 別 statement を通常の migration ツールで実行します。`Store.Migrate` は新しい DB や開発環境で不足するオブジェクトを作りますが、`CREATE TABLE IF NOT EXISTS` は既存テーブルを変更しません。新しい形を作るためにプロトコルテーブルを drop / 再作成しないでください。
4. **writer を起動する前に検証します。** 追加したすべてのカラム、retention とクライアント削除に必要なすべてのインデックス、MySQL / MariaDB の照合順序、migration ツールの記録済み状態を確認します。MySQL と MariaDB の既存テーブルには `ALTER TABLE ... ADD INDEX` と照合順序の変更が必要です。新しい `CREATE TABLE` 定義を実行するだけでは更新されません。
5. **version-aware writer を起動し、smoke test を実行します。** TOTP または Email OTP の書き込みと条件付き更新を 1 回確認し、ストアを使うプロトコル経路も検証します。この確認が通ってから OP の replica を起動します。
6. **retention のスケジュールを有効にします。** 1 つの scheduler または leader election した worker から GC job を実行し、トラフィックを戻す間に件数と遅延を監視します。

### SQL に追加する形

既存 SQL DB で最初のリクエストを受ける前に、次のカラムを追加します。dialect ごとの正確な statement と型は [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) にあります。

| テーブル | カラム | 保持する内容 |
|---|---|---|
| `oidc_registration_access_tokens` | `allowed_scopes` | registration access token の scope 上限。NULL 可で、`NULL` は無制限を表します |
| `oidc_totp_secrets`、`oidc_email_otps` | `row_version` | opaque な compare-and-swap 用 token。`NOT NULL DEFAULT 1` |
| `oidc_authorization_codes` | `auth_time`、`acr`、`amr`、`authorization_details`、`claims`、`authorization_recorded` | その認可コードを発行した認可の認証結果と `claims` リクエスト |
| `oidc_refresh_tokens` | `claims`、`authorization_recorded`、`chain_id` | 同じ認可単位の状態と、row が属するローテーション chain |
| `oidc_opaque_access_tokens` | `authorization_details`、`claims`、`authorization_recorded`、`chain_id` | 同じ認可単位の状態と、トークンを発行した refresh chain |
| `oidc_grant_revocations` | `access_revoked_at` | grant のアクセストークンだけを対象にした tombstone の cutoff |

既存の MySQL / MariaDB では、`oidc_users.username` とすべての `client_id` / `subject` カラムを `utf8mb4_bin` にする `MODIFY` 文も必要です。大文字小文字やアクセント違いだけの識別子が別の row として扱われるようになります。そのような識別子を発行する前に適用してください。`MODIFY` は、バイナリ照合順序で既存の値が衝突すると失敗するため、先にその row を解消します。SQLite と PostgreSQL は、もともとこれらのカラムをバイト単位で比較します。

新しいカラムには、ロールアウトに影響する性質が 2 つあります。

- **既定値は「記録なし」を意味します。** `authorization_recorded = 0` や空の `chain_id` の row は grant から解決されます。カラムが無かった時期に書かれた row と同じ扱いです。そのため古いバイナリと新しいバイナリが同じテーブルへ並行して書き込めます。
- **古いノードは新しい tombstone を見ません。** 古いバイナリは `access_revoked_at` を読みません。すべてのノードが新しいバイナリになるまで、単一の refresh token の失効で grant が失効した JWT アクセストークンは、古いノードでは検証を通り続けます。

`row_version` はアダプタが管理する opaque な等価比較用 token です。アプリケーションが増分したり、順序を比較したり、削除 / 再作成後に再利用したり、意味を割り当てたりしてはいけません。既存 row は `1` で始まり、条件付き遷移が成功すると新しい token が割り当てられます。

現在の retention とクライアント削除に使うインデックスは次のとおりです。

| インデックス | テーブルとカラム |
|---|---|
| `idx_oidc_grants_client_subject` | `oidc_grants(client_id, subject, updated_at)` |
| `idx_oidc_grants_client` | `oidc_grants(client_id)` |
| `idx_oidc_authorization_codes_expires` | `oidc_authorization_codes(expires_at)` |
| `idx_oidc_refresh_tokens_expires` | `oidc_refresh_tokens(expires_at)` |
| `idx_oidc_refresh_tokens_client` | `oidc_refresh_tokens(client_id)` |
| `idx_oidc_access_tokens_expires` | `oidc_access_tokens(expires_at)` |
| `idx_oidc_access_tokens_client` | `oidc_access_tokens(client_id)` |
| `idx_oidc_opaque_access_tokens_client` | `oidc_opaque_access_tokens(client_id)` |
| `idx_oidc_sessions_expires` | `oidc_sessions(expires_at)` |
| `idx_oidc_par_records_expires` | `oidc_par_records(expires_at)` |
| `idx_oidc_interactions_expires` | `oidc_interactions(expires_at)` |
| `idx_oidc_consumed_jtis_expires` | `oidc_consumed_jtis(expires_at)` |

SQLite と PostgreSQL は DDL が独立した `CREATE INDEX IF NOT EXISTS` を出すため、`Migrate()` でこれらのインデックスを追加できます。MySQL と MariaDB は同じインデックスを `CREATE TABLE` の中で宣言するので、既存テーブルには `ALTER TABLE ... ADD INDEX` を明示的に適用しないと反映されません。`WithNaming` で物理テーブル名を変えている場合は、その名前で migration を書き、論理的なインデックスの対象は変えないでください。dialect の注意点を含む同じ一覧は [SQL ストア](/ja/use-cases/sql-store#sql-migration-before-first-request) にもあります。

## retention GC をスケジュールする

SQL アダプタは `(*oidcsql.Store).GC(ctx, cutoff) (oidcsql.GCStats, error)` を公開します。バックグラウンド goroutine や timer は起動しないため、組み込み側がスケジュールします。ここでの `storage` は、`op.WithStore` に渡した `*oidcsql.Store` です。

```go
cutoff := time.Now().UTC().Add(-15 * time.Minute) // 短い猶予期間を残す
stats, err := storage.GC(ctx, cutoff)
if err != nil {
  return err
}
log.Printf("oidc GC removed %d rows", stats.Total())
```

ただし、この 1 回の呼び出しが retention のすべてではありません。独自の `GC` メソッドを持つサブストアもあれば、sweep なしで自ら期限切れになるレコードもあります。

| 掃除する主体 | 対象のサブストア | 補足 |
|---|---|---|
| `(*Store).GC(ctx, cutoff)` | 認可コード、Pushed Authorization Request (PAR)、interaction、session、refresh token のローテーション履歴 | 1 回の呼び出しに cutoff は 1 つ。サブストアごとの件数は `GCStats` で返ります |
| サブストア自身の `GC` メソッド | access token、opaque access token、grant revocation、ConsumedJTI | それぞれ独立したメソッドと cutoff を持ちます |
| どこも掃除しない（レコードが自ら退場する） | device code、CIBA request | SQL アダプタは insert 時に期限切れの row を削除します。DynamoDB は TTL 属性を使い、TTL の削除待ちでも read 時に失効を確認します |

それ以外の sweep はサブストアごとに 1 回の呼び出しです。前の 3 つは `store` インターフェースのメソッドです。ConsumedJTI の sweep はアダプタの具象型のメソッドなので、型アサーションで取り出します。

```go
for _, gc := range []func(context.Context, time.Time) (int, error){
    storage.AccessTokens().GC,
    storage.OpaqueAccessTokens().GC,
    storage.GrantRevocations().GC,
} {
    if _, err := gc(ctx, cutoff); err != nil {
        return err
    }
}
if j, ok := storage.ConsumedJTIs().(interface {
    GC(context.Context, time.Time) (int64, error)
}); ok {
    if _, err := j.GC(ctx, cutoff); err != nil {
        return err
    }
}
```

どれも `expires_at` が cutoff より厳密に前の row を削除します。grant revocation の tombstone は、対象のアクセストークンより後の期限で書かれます。現在時刻で sweep しても、有効なトークンの失効が取り消されることはありません。

`(*Store).GC` は `expires_at` が cutoff より厳密に前の row を削除します。例外はローテーション履歴で、その grant に有効な refresh token が残る間は保持します。predecessor が期限切れになれば、アダプタは row 自体を残す場合でも sealed retry-response blob を消します。この blob の消去は row 件数に含めません。猶予期間は cutoff で決めます。過去の cutoff は猶予を残し、`time.Now()` を渡すとすでに期限切れのものをすべて回収します。

refresh token の sweep は最も重い処理です。範囲スキャンではなく、候補の row ごとに grant を確認するためです。大きなテーブルでは、負荷の低い時間帯に実行してください。途中のテーブルで失敗した場合、`GC` はそこまでの件数をエラーと一緒に返し、sweep を繰り返しても安全です。

DB の容量に対して期限切れ row の増加が収まる頻度で job を実行します。scheduler は各ストアにちょうど 1 つ — cron、leader election した worker、または同等の仕組みを割り当ててください。`GCStats`、所要時間、エラー、テーブル残量を記録し、sweep の失敗や backlog の増加を検知します。sweep を落としても失われるのは安全性ではなくテーブル容量です。認可コード、PAR レコード、interaction、session、refresh token は `expires_at` を過ぎていれば、sweep が届いているかどうかに関係なく read 時に拒否されます。

## job や migration が失敗したとき

スキーマの検証が済んでいない状態で新しい writer を起動しないでください。migration ツールの状態を確認し、追加したカラム、必要なすべてのインデックス、MySQL / MariaDB の照合順序を調べ、dialect ごとの rollback または retry 手順に従います。version-aware path の準備が終わるまで古い MFA writer を停止したままにしてください。古い writer と新しい writer の混在はサポートしません。

GC は retention の処理であり、バックアップではありません。永続ストアのバックアップと migration の記録を GC のスケジュールとは別に保管します。一時的な GC エラーの後は DB の問題を直して同じ cutoff 方針で再実行し、次の `GCStats` とテーブル残量が想定どおり動いたことを確認します。

## DynamoDB と自前ストア

DynamoDB の item には固定のカラム集合がないため、`ALTER` の手順はありません。アダプタは chain 単位の失効を実装していますが、`AuthorizationRecorded` が示す認可単位のフィールドは保存しないため、それらの値は grant から解決されます。テーブルと TTL の設定は [DynamoDB ストア](/ja/use-cases/dynamodb-store) のとおりに用意してください。

自前ストアは、新しいフィールドを任意で取り込めます。`store.RefreshToken` と `store.OpaqueAccessToken` には `ChainID`、`store.GrantTombstone` には `AccessTokensOnly` があり、認可コード、refresh token、opaque access token には `AuthorizationRecorded` が印を付ける認可単位のフィールドがあります。これらを使うオプションのインターフェースが 2 つあります。`store.OpaqueAccessTokenChainRevoker` は 1 つの chain の opaque access token だけを失効させ、`store.IssuanceRevocationChecker` は access token だけを対象にした tombstone が refresh と認可コードの引き換えを妨げないようにします。どちらも実装せず、フィールドも保存しないストアは、grant 全体に及ぶ挙動のままです。1 つの refresh token を失効させたり、1 台のデバイスの chain をローテーションしたりすると、同じクライアントにおけるそのユーザの他のセッションにも影響します。[ストアバックエンドを自前実装する](/ja/use-cases/byo-store) を参照してください。

## 残りのストレージ構成を選ぶ

- [ストレージ構成の選び方](/ja/use-cases/storage-decision) — SQL、DynamoDB、Hot / Cold 分離、自前の境界を選びます。
- [バックアップ / DR](/ja/operations/backup) — 復元するもの、捨てるもの、復旧訓練を決めます。
- [永続化（SQL）](/ja/use-cases/sql-store) — SQL スキーマを適用し、`GC` をスケジュールします。
- [DynamoDB ストア](/ja/use-cases/dynamodb-store) — テーブル、デバイスコードのトランザクション予約、TTL と read 時の失効確認を扱います。
- [ストアバックエンドを自前実装する](/ja/use-cases/byo-store) — 自前バックエンドのハッシュ化、トランザクション、並行性契約を実装します。
