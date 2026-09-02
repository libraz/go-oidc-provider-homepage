---
title: バックアップ / DR
description: 永続 OIDC 状態・スキーマ・鍵をバックアップし、サブストアごとの RPO に沿って復旧を訓練する。
outline: 2
pageClass: pg-operations-backup
---

# バックアップ / DR

OP 自体はステートレスです。復旧方針は完全に `store.Store` の性質に依存します。「何が永続で、何が揮発で、サブストアごとの RPO（recovery point objective）はどこか」を整理する作業です。

<svg role="img" aria-labelledby="backup-split-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="backup-split-title">バックアップ方針: OP 本体はステートレスで、永続サブストアは復元対象、短命状態は捨てて再作成、replay 防御用集合は復元しない。</title>
<rect class="bkp-main" x="38" y="112" width="152" height="74" rx="8"/>
  <text class="bkp-text" x="114" y="142" text-anchor="middle">OP プロセス</text>
  <text class="bkp-sub" x="114" y="164" text-anchor="middle">ステートレス</text>

  <rect class="bkp-box" x="300" y="34" width="178" height="62" rx="8"/>
  <text class="bkp-text" x="389" y="64" text-anchor="middle">永続サブストア</text>
  <text class="bkp-sub" x="389" y="82" text-anchor="middle">Clients / Grants / MFA</text>

  <rect class="bkp-box" x="300" y="119" width="178" height="62" rx="8"/>
  <text class="bkp-text" x="389" y="149" text-anchor="middle">短命状態</text>
  <text class="bkp-sub" x="389" y="167" text-anchor="middle">PAR / code / interaction</text>

  <rect class="bkp-box" x="300" y="204" width="178" height="62" rx="8"/>
  <text class="bkp-text" x="389" y="234" text-anchor="middle">復元禁止</text>
  <text class="bkp-sub" x="389" y="252" text-anchor="middle">ConsumedJTIs</text>

  <rect class="bkp-box" x="578" y="34" width="144" height="62" rx="8"/>
  <text class="bkp-text" x="650" y="64" text-anchor="middle">バックアップ</text>
  <text class="bkp-sub" x="650" y="82" text-anchor="middle">RPO を設定</text>

  <rect class="bkp-box" x="578" y="119" width="144" height="62" rx="8"/>
  <text class="bkp-text" x="650" y="149" text-anchor="middle">再試行</text>
  <text class="bkp-sub" x="650" y="167" text-anchor="middle">自然に回復</text>

  <rect class="bkp-box" x="578" y="204" width="144" height="62" rx="8"/>
  <text class="bkp-text" x="650" y="234" text-anchor="middle">破棄</text>
  <text class="bkp-sub" x="650" y="252" text-anchor="middle">巻き戻さない</text>

  <path class="bkp-flow" d="M190 150 C238 132 260 66 296 66"/>
  <path class="bkp-flow" d="M288 62 L297 66 L288 70"/>
  <path class="bkp-flow" d="M190 150 H296"/>
  <path class="bkp-flow" d="M288 146 L297 150 L288 154"/>
  <path class="bkp-flow" d="M190 150 C238 168 260 234 296 234"/>
  <path class="bkp-flow" d="M288 230 L297 234 L288 238"/>
  <path class="bkp-flow" d="M478 65 H574"/>
  <path class="bkp-flow" d="M566 61 L575 65 L566 69"/>
  <path class="bkp-flow" d="M478 150 H574"/>
  <path class="bkp-flow" d="M566 146 L575 150 L566 154"/>
  <path class="bkp-flow" d="M478 235 H574"/>
  <path class="bkp-flow" d="M566 231 L575 235 L566 239"/>
</svg>

## バックアップ優先度

| サブストア | 優先度 | RPO 目標 | 理由 |
|---|---|---|---|
| `Clients` | **最優先** | 数時間 | RP との関係そのもの。喪失すると RP に連絡してシークレット再発行が必要 |
| `Users`(既存テーブル) | **最優先** | 数分 | アカウント喪失は不可逆 |
| `Grants` | **最優先** | 数時間 | consent レコード。喪失するとアクティブユーザ全員に再 consent を強制 |
| `RefreshTokens` | 高 | 数時間 | アクティブセッション。喪失するとアクティブユーザ全員に再ログインを強制 |
| `AccessTokens` | 中 | 低優先 | アクセストークン TTL(既定 5 分)で自然に回復 |
| `IATs`(DCR Initial Access Token) | 中 | 数時間 | out-of-band 発行。喪失すると再発行が必要 |
| `RATs`(DCR Registration Access Token) | 中 | 数時間 | RP が自分のメタデータを読み書きするのに必要 |
| `AuthorizationCodes` | 低 | n/a | one-shot で寿命 60 秒以下。復元しないこと |
| `PARs` | 低 | n/a | one-shot で寿命 90 秒以下。復元しないこと |
| `Sessions` | 組み込み側の選択 | — | `WithSessionDurabilityPosture` の方針次第 |
| `Interactions` | 低 | n/a | 試行ごとの状態。ユーザが自分でリトライする |
| `ConsumedJTIs` | **復元してはならない** | — | `jti` の集合を復元すると replay 防御が巻き戻る |
| `Passkeys`、`TOTPs`、`EmailOTPs`、`Recovery` | **最優先** | 数分 | MFA factor のレコード。喪失するとユーザがロックアウトされる |

「復元してはならない」行は強調に値します。replay 防御用のサブストアは意図的に append-only な書き込みログとして運用しているもので、バックアップから戻すと、バックアップ取得点から現在までの replay ウィンドウを再び開いてしまいます。データではなくシーケンスカウンタとして扱ってください。

## 復旧時に捨ててよいもの

OP が上流の状態から再構築するので、バックアップから戻す必要がありません:

- **DPoP server-nonce cache** — 復旧後の最初のリクエストで再生成されます。
- **JAR / DPoP `jti` consumed set** — 上記と同じく、復元するとむしろ有害です。
- **PARs と認可コード** — TTL は最長でも 90 秒で、復旧時にはどのみち期限切れです。
- **RP 側の discovery cache** — JWKS ローテーション中に `kid` がずれた RP が自分で revalidate しに来ます。

## バックエンドごとのバックアップ機構

### SQL アダプタ（`storeadapter/sql`）

DB 標準のバックアップツールがそのまま使えます。選択肢は 2 つです:

- **論理（mysqldump / pg_dump）** — 時点整合の snapshot。snapshot 取得中に書き込みを短時間止められるならこちら。
- **物理（binlog / WAL streaming）** — 連続レプリケーション。RPO を分単位以下にしたいならこちら。

ライブラリはモードに口を出しません。DB 運用チームがすでに運用しているものを選んでください。

スキーマはソースリポジトリの [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql) 配下にあります。

### 既存 SQL スキーマで開始する前に

既存 DB に対して現在の SQL アダプタを使うバイナリを起動する前に、スキーマをバックアップし、追加変更を適用します。`Store.Migrate` は新しい DB や開発環境には便利ですが、`CREATE TABLE IF NOT EXISTS` は既存テーブルを変更しません。最初に古い MFA writer を停止し、カラムの存在と値を検証してから、現在の opaque compare-and-swap 契約に参加する writer だけを起動してください。プロトコルテーブルを drop / 再作成して済ませないでください。

次のカラムを migration guide にある dialect 別の型で追加します。

- `oidc_registration_access_tokens.allowed_scopes` — SQLite は NULL 可の `TEXT`、MySQL / MariaDB は `JSON`、PostgreSQL は `JSONB`。`NULL` は、このフィールドが無かった時期に作られた token を含め、RAT の上限が無制限であることを表します。
- `oidc_totp_secrets.row_version` — SQLite は `INTEGER NOT NULL DEFAULT 1`、MySQL / MariaDB と PostgreSQL は `BIGINT NOT NULL DEFAULT 1`。
- `oidc_email_otps.row_version` — `oidc_totp_secrets.row_version` と同じ `INTEGER` / `BIGINT` の定義。

現在の retention とクライアント削除には、決まったインデックスの一式が必要です。名前の一覧は [ストレージの保守](/ja/operations/storage-maintenance#sql-に追加する形)に、各インデックスの用途を添えた同じ一覧は [SQL ストア](/ja/use-cases/sql-store#sql-migration-before-first-request)にあります。`WithNaming` を使う場合は物理テーブル名を読み替えてください。

SQLite と PostgreSQL は `Migrate()` でインデックスを追加できます。MySQL と MariaDB の既存テーブルには `ALTER TABLE ... ADD INDEX` が必要です。既存の MySQL / MariaDB では `ALTER TABLE oidc_users MODIFY username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;` も適用してください。大文字小文字を区別しない username の衝突を、この変更の前に解消します。SQLite と PostgreSQL に同じ照合順序変更は必要ありません。dialect ごとの文は [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) を使い、この migration の記録をバックアップ / 復旧 runbook と一緒に保管してください。

### SQL の retention GC をスケジュールする

SQL アダプタはバックグラウンド GC goroutine を起動しません。バックアップの健全性を記録する保守基盤から、`(*oidcsql.Store).GC(ctx, cutoff)` をスケジュールします。

```go
cutoff := time.Now().UTC().Add(-15 * time.Minute) // 短い復旧用の猶予を残す
stats, err := storage.GC(ctx, cutoff)
if err != nil {
  return err
}
log.Printf("oidc GC removed %d rows", stats.Total())
```

返る `oidcsql.GCStats` は、期限切れの認可コード、PAR、interaction、session、refresh token ローテーション履歴の件数を持ちます。grant に有効な refresh token が残る間は履歴を保持し、期限切れの sealed retry-response blob は row 自体が残る場合でも条件を満たせば消去しますが、その blob 消去は row 件数に含めません。過去の cutoff は猶予期間を残し、`time.Now()` はすでに期限切れのものを回収します。件数、所要時間、エラー、テーブルサイズを監視し、一時的な失敗の後は再実行してください。access token、opaque token、grant revocation、ConsumedJTI の各ストアには独自の GC 方針があり、device code と CIBA の row は insert 時に期限切れを排除します。

### DynamoDB adapter (`storeadapter/dynamodb`)

DynamoDB の永続テーブルは、アカウントの point-in-time recovery または on-demand backup 方針でバックアップし、プロビジョニングに使ったテーブル定義と TTL 設定も記録します。現在の refresh token 定義には `by_handle` global secondary index がありません。index の reconcile 処理は追加だけを行うため、既存テーブルには古い `by_handle` が残ることがあります。不要なら通常の DynamoDB インフラ手順（たとえば `UpdateTable`）で明示的に削除します。新しい書き込みにこの index は不要なので、復元や再プロビジョニングで復活させないでください。

### Redis アダプタ（`storeadapter/redis`）

同梱アダプタは **揮発サブストアのみ**を Redis に置きます:

- `Sessions`(`WithSessionDurabilityPosture` で方針を注釈する選択)
- `Interactions`
- `ConsumedJTIs`
- DPoP nonce cache(自前実装した場合)

これらに対しては RDB snapshot と AOF persistence が標準の Redis の選択肢です:

- **AOF off、RDB off** — 純揮発。再起動で session が追い出されます。正当な方針なので `WithSessionDurabilityPosture` を合わせてください。
- **RDB のみ** — 定期 snapshot。再起動は越えますが、直近の活動は失われます。session を「数分単位の損失は許容、再起動は越えたい」という使い方で選ぶ形です。
- **AOF + fsync everysec** — SQL に近い耐久性。揮発サブストアではあまり選ばれません。

### 自前ストアを書いている場合

自前 `store.Store` を書いた場合、[`op/store/contract`](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) の contract test suite が、同梱アダプタと同じ期待値に対して実装を検証します。contract はバックアップ形式までは規定しません。そこは組み込み側の選択です。

## 復旧手順

### durable backend の全損

1. バックアップから durable backend を復元します。
2. 復元したストアに対して OP を起動します。
3. **必要なら**無効化を fan-out します:
   - バックアップが `WithAccessTokenTTL` より古ければ、発行済みのアクセストークンはすべて期限切れになっているので、何もする必要はありません。
   - バックアップが JWKS cache window より古ければ、RP 側が退役済み鍵で検証を試みる可能性があります。心配なら各 RP から手動で JWKS を refresh(`curl` 等)してもらいます。
4. バックアップ取得点以降に確立された session は再ログインが必要になる、とユーザに通知します。

### 揮発バックエンド（Redis）の全損

1. 新しい Redis を立てます。
2. OP レプリカを再起動します。
3. アクティブな session は消えるので、ユーザには再ログインしてもらいます。
4. Redis の喪失だけで `bcl.no_sessions_for_subject` が増えるわけではありません。`/end_session` は通知前に session を snapshot し、このイベントは session を伴う logout 通知の grant 由来 eligible RP target が 0 件のときだけ発生します。snapshot 前に eviction が起きた場合は back-channel 通知もイベントも発生しません。zero-target イベントがあれば logout の snapshot と grant の状態を調べてください。

### 部分損失（1 サブストアだけ破損）

1. 該当サブストアへの書き込みを停止します。
2. そのサブストアだけ復元します。
3. 書き込みを再開します。

トランザクショナルクラスタ不変条件により、認可コード / リフレッシュトークン / grants / PAR / アクセストークン / grant revocation は同じバックエンドを共有しています。クラスタ内の部分復元は SQL レベルの操作（テーブル単位の binlog 復元や PITR）になります。揮発サブストアは独立しているので、`Sessions` を失っても `RefreshTokens` には影響しません。

## Cookie 鍵の損失

cookie 鍵を失う（HSM 破壊、secret manager 抹消など）と、運用中のすべての暗号化済み cookie が無効になります:

- 有効だったブラウザ session はすべて失われ、ユーザは再ログインになります。
- 進行中の consent / interaction フローも失われます。ユーザは最初からやり直しです。
- リフレッシュトークンには影響しません。cookie 鍵は **session** cookie を封緘するための鍵で、リフレッシュトークンは封緘していません。

cookie 鍵そのものの復旧経路はありません。署名鍵と同じく、独自にバックアップ / レプリケーションを持つサービス（KMS、Vault）に保管する、HSM 級の秘密として扱ってください。

## 署名鍵の損失

署名鍵を失うと:

- 新しい token は、新しい `op.Keyset` を割り当てるまで発行できません。
- 既存の token は、RP がキャッシュしている JWKS から公開鍵を回収できる限り `/jwks` 越しに検証可能です。OP 自身も自分が発行した token を検証するので、鍵の喪失は OP の検証パスに対しても致命的です。
- リフレッシュトークンは opaque 値としては発行可能ですが、紐付くアクセストークンは署名できません。

緩和策: 署名秘密鍵を、独自にバックアップ / レプリケーションを持つサービス（KMS、Vault）に置き、唯一のコピーをプロセスメモリに置かないでください。ライブラリは `crypto.Signer` を満たすものなら何でも受け取れます。[JWKS § HSM / KMS 連携](/ja/operations/jwks#hsm-kms-連携) を参照。

## 訓練

本番投入前に復旧訓練を 1 回:

1. `t0` でバックアップを取得します。
2. `t0 + 1 分` で 100 個の token を発行します。
3. バックアップを復元します。
4. 発行した 100 個の token が検証不能になっていることを確認します（これが正解 — chain が巻き戻っているためです）。
5. 新規ログイン + token 発行が動くことを確認します。

30 分の訓練 1 回が、書面の runbook より多くの問題を検出します。
