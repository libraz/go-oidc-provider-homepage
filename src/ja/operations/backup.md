---
title: バックアップ / DR
description: 永続 OIDC 状態・スキーマ・鍵をバックアップし、サブストアごとの RPO に沿って復旧を訓練する。
outline: 2
pageClass: pg-operations-backup
---

# バックアップ / DR

OP 自体はステートレスです。復旧方針は完全に `store.Store` の性質で決まります。どのサブストアが永続で、どれが揮発か、そしてサブストアごとにどこまでのデータ損失を許容できるかを整理します。この許容量が RPO（recovery point objective、復元後に欠けていてよい最新データの古さ）です。

<figure class="fig">
  <div class="fig-head">何を復元し、何を復元しないか</div>
  <svg class="fig-svg" role="img" aria-labelledby="backup-policy-title" viewBox="0 0 960 480" xmlns="http://www.w3.org/2000/svg">
    <title id="backup-policy-title">バックアップ方針を 4 行で示した図。OP プロセス自体は何も保持しません。永続サブストアはバックアップして復元します。短命な状態は破棄し、再試行によって作り直されます。消費済み JTI の集合は復元しません。復元すると replay の窓が再び開くためです。</title>
    <text class="fg-lbl" x="32" y="40">対象</text>
    <text class="fg-lbl" x="472" y="40">扱い方</text>
    <path class="fg-rule fg-rule--strong" d="M32,52 H928"/>
    <!-- process -->
    <rect class="fg-box" x="32" y="72" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="100">OP プロセス</text>
    <text class="fg-s" x="48" y="124">自前の状態を持たない</text>
    <path class="fg-edge fg-edge--thin" d="M424,108 H472" marker-end="url(#fg-a)"/>
    <rect class="fg-box fg-box--muted" x="472" y="72" width="456" height="72" rx="8"/>
    <text class="fg-t" x="488" y="100">バックアップ対象なし</text>
    <text class="fg-s" x="488" y="124">別のインスタンスを立てれば等価</text>
    <!-- durable -->
    <rect class="fg-box" x="32" y="176" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="204">永続サブストア</text>
    <text class="fg-mxs" x="48" y="228">Clients · Grants · MFA 登録情報</text>
    <path class="fg-edge fg-edge--accent fg-edge--thin" d="M424,212 H472" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="472" y="176" width="456" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="488" y="204">バックアップする — RPO を決める</text>
    <text class="fg-s" x="488" y="228">失うと同意履歴とクライアント登録が失われる</text>
    <!-- short-lived -->
    <rect class="fg-box" x="32" y="280" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="308">短命な状態</text>
    <text class="fg-mxs" x="48" y="332">PAR リクエスト · 認可コード · interaction</text>
    <path class="fg-edge fg-edge--thin" d="M424,316 H472" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="472" y="280" width="456" height="72" rx="8"/>
    <text class="fg-t" x="488" y="308">破棄する</text>
    <text class="fg-s" x="488" y="332">クライアントが再試行すればフローが作り直す</text>
    <!-- never -->
    <rect class="fg-box" x="32" y="384" width="392" height="72" rx="8"/>
    <text class="fg-t" x="48" y="412">replay 防御用の集合</text>
    <text class="fg-mxs" x="48" y="436">ConsumedJTIs</text>
    <path class="fg-edge fg-edge--danger fg-edge--thin" d="M424,420 H472" marker-end="url(#fg-ad)"/>
    <rect class="fg-box fg-box--danger" x="472" y="384" width="456" height="72" rx="8"/>
    <text class="fg-t fg-danger" x="488" y="412">復元しない</text>
    <text class="fg-s" x="488" y="436">巻き戻すと、閉じたはずの窓がすべて開き直す</text>
  </svg>
  <figcaption class="fig-note">意外に思われるのは最後の行です。消費済み JTI の集合は「どの proof が既に使われたか」の記録であり、古い複製を戻すことは、それらを未使用だと宣言することにあたります。</figcaption>
</figure>

## バックアップ優先度

| サブストア | 優先度 | RPO 目標 | 理由 |
|---|---|---|---|
| `Clients` | **最優先** | 数時間 | RP との関係そのもの。喪失すると RP に連絡してシークレット再発行が必要 |
| `Users`(既存テーブル) | **最優先** | 数分 | アカウント喪失は不可逆 |
| `Grants` | **最優先** | 数時間 | consent レコード。喪失するとアクティブユーザ全員に再 consent を強制 |
| `RefreshTokens` | 高 | 数時間 | アクティブセッション。喪失するとアクティブユーザ全員に再ログインを強制 |
| `GrantRevocations` | **最優先** | 数分 | 失効の tombstone。失効より古いバックアップから戻すと、失効した grant が有効に戻る |
| `AccessTokens`、`OpaqueAccessTokens` | 中 | 低優先 | アクセストークン TTL(既定 5 分)で自然に回復 |
| `IATs`(DCR Initial Access Token) | 中 | 数時間 | out-of-band 発行。喪失すると再発行が必要 |
| `RATs`(DCR Registration Access Token) | 中 | 数時間 | RP が自分のメタデータを読み書きするのに必要 |
| `AuthorizationCodes` | 低 | n/a | one-shot で寿命 60 秒。復元しないこと |
| `PARs` | 低 | n/a | one-shot で寿命は既定 60 秒（`WithPARLifetime`）。復元しないこと |
| `Sessions` | 組み込み側の選択 | — | `WithSessionDurabilityPosture` の方針次第 |
| `Interactions` | 低 | n/a | 試行ごとの状態。ユーザが自分でリトライする |
| `ConsumedJTIs` | **復元してはならない** | — | `jti` の集合を復元すると replay 防御が巻き戻る |
| `Passkeys`、`TOTPs`、`EmailOTPs`、`Recovery` | **最優先** | 数分 | MFA factor のレコード。喪失するとユーザがロックアウトされる |
| `Metadata` | 高 | 数時間 | 起動時に OP が確認する subject の発行モード（public / pairwise / custom）。小さく、一度書いたら変わらず、TTL を持たない |
| `AuthnLockouts`（`WithAuthnLockoutStore`） | 中 | 数時間 | 24 時間のローリングウィンドウでの失敗回数。古いコピーから戻しても、試行回数の枠がリセットされるだけ |

「復元してはならない」行は強調に値します。replay 防御用のサブストアは意図的に append-only な書き込みログとして運用しているもので、バックアップから戻すと、バックアップ取得点から現在までの replay の窓が再び開きます。取得後にすでに使われた proof（DPoP proof、`private_key_jwt` のアサーション、request object）が、もう一度受理されてしまうためです。データではなくシーケンスカウンタとして扱ってください。

## 復旧時に捨ててよいもの

再試行で作り直されるので、バックアップから戻す必要がありません。

- **DPoP server-nonce の状態** — nonce は短命です。古い nonce を提示したクライアントには、新しい値を添えた `use_dpop_nonce` のチャレンジが返り、クライアントが再試行します。
- **JAR / DPoP `jti` consumed set** — 復元してはいけません。上記を参照してください。
- **PARs と認可コード** — どちらも寿命は既定で 60 秒で、復元が終わる頃にはすでに期限切れです。
- **RP 側の discovery cache** — JWKS ローテーション中に `kid` がずれた RP が自分で revalidate しに来ます。

## バックエンドごとのバックアップ機構

### SQL アダプタ（`storeadapter/sql`）

DB 標準のバックアップツールがそのまま使えます。選択肢は 2 つです:

- **論理（mysqldump / pg_dump）** — 時点整合の snapshot。snapshot 取得中に書き込みを短時間止められるならこちら。
- **物理（binlog / WAL streaming）** — 連続レプリケーション。RPO を分単位以下にしたいならこちら。

ライブラリはモードに口を出しません。DB 運用チームがすでに運用しているものを選んでください。

スキーマはソースリポジトリの [`op/storeadapter/sql/schema/`](https://github.com/libraz/go-oidc-provider/tree/main/op/storeadapter/sql) 配下にあります。

### 既存 SQL スキーマで開始する前に

アダプタをアップグレードする前に DB をバックアップし、新しい形のバイナリを起動する前に追加型のスキーマ変更を適用します。`Store.Migrate` は新しい DB や開発環境向けです。`CREATE TABLE IF NOT EXISTS` は既存テーブルを変更せず、必須カラムが無ければ失敗します。プロトコルテーブルを drop / 再作成して済ませないでください。作業の順序、カラムとインデックスの全一覧、MySQL / MariaDB の照合順序の変更は [ストレージの保守](/ja/operations/storage-maintenance#作業の順序) にあります。dialect ごとの statement は [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) を使い、この migration の記録をバックアップ / 復旧 runbook と一緒に保管してください。

### SQL の retention GC をスケジュールする

SQL アダプタはバックグラウンドの GC goroutine を起動しません。バックアップの健全性を記録する保守基盤から、`(*oidcsql.Store).GC(ctx, cutoff)` とサブストアごとの sweep をスケジュールします。コードと各 sweep の対象は [ストレージの保守](/ja/operations/storage-maintenance#retention-gc-をスケジュールする) にあります。過去の cutoff は猶予期間を残すので、ここでは役に立ちます。障害の直前に期限切れになった row が、調査用に読める状態で残ります。

### DynamoDB adapter (`storeadapter/dynamodb`)

DynamoDB の永続テーブルは、アカウントの point-in-time recovery または on-demand backup 方針でバックアップし、プロビジョニングに使ったテーブル定義と TTL 設定も記録します。refresh token のテーブル定義には `by_handle` global secondary index がありません。index の reconcile 処理は追加だけを行うため、既存テーブルには古い `by_handle` が残ることがあります。通常の DynamoDB インフラ手順（たとえば `UpdateTable`）で削除できます。書き込みにこの index は不要なので、復元や再プロビジョニングで復活させないでください。

### Redis アダプタ（`storeadapter/redis`）

同梱の Redis アダプタが実装するのは、揮発サブストアと、永続を要する小さなレコード 1 つです。

- `Sessions`（どちらの配置にしたかは `WithSessionDurabilityPosture` で宣言します）
- `Interactions`
- `ConsumedJTIs`（replay 防御の集合）。前の 2 つと違って追い出してはいけません。`noeviction` のインスタンスで動かすか、composite store 経由で永続バックエンドに振り分けてください。
- `Metadata`。subject の発行モードを持つ、TTL なしの hash です。失われても自然には復旧しない、Redis 上で唯一のキーです。純粋な揮発インスタンスではなく、永続化されたインスタンス（または永続バックエンド）に置いてください。

DPoP の server-nonce source は組み込み側が実装する別の差し込み口で、アダプタの Redis サブストアではありません。

標準の選択肢は RDB snapshot と AOF persistence です。

- **AOF off、RDB off** — 純揮発。再起動で session が失われます。`Sessions` と `Interactions` には妥当な方針なので、`WithSessionDurabilityPosture` を合わせてください。`ConsumedJTIs` と `Metadata` には向きません。
- **RDB のみ** — 定期 snapshot。再起動は越えますが、直近の活動は失われます。
- **AOF + fsync everysec** — SQL に近い耐久性。揮発サブストアではあまり割に合いません。

### 自前ストアを書いている場合

自前 `store.Store` を書いた場合、[`op/store/contract`](https://github.com/libraz/go-oidc-provider/tree/main/op/store/contract) の contract test suite が、同梱アダプタと同じ期待値に対して実装を検証します。contract はバックアップ形式までは規定しません。そこは組み込み側の選択です。

## 復旧手順

### durable backend の全損

1. バックアップから durable backend を復元します。
2. 復元したストアに対して OP を起動します。
3. 署名鍵の鍵素材と JWKS 公開を、DB の復元とは別に復元・確認します。DB の復元だけでは発行済み JWT の署名は無効になりません。対応する公開鍵を利用できる限り、JWT は `exp` まで暗号学的に検証できます。復元された grant / 失効状態によって OP がその token を受理するかは変わり得るため、署名検証とサーバ側状態を分けて確認します。バックアップ後に鍵ローテーションを行っていた場合は、意図した鍵束と JWKS を整合する形で戻します。DB の復元だけでは鍵ローテーションは巻き戻りません。
4. バックアップ取得後に永続化された状態（復元したストアが持つ grant / token 失効変更を含む）が巻き戻っていることを確認します。バックアップ取得点より後に行った失効やユーザの無効化は、手元の記録から再適用してください。復元したストアは、それらの grant を有効なものとして扱います。
5. バックアップ取得点以降に確立された session は再ログインが必要になる、とユーザに通知します。

### 揮発バックエンド（Redis）の全損

1. 新しい Redis を立てます。
2. OP レプリカを再起動します。
3. アクティブな session は消えるので、ユーザには再ログインしてもらいます。
4. インスタンスが `ConsumedJTIs` を持っていた場合、喪失前に使われた proof は、期限が切れるまでもう一度受理されます。DPoP proof とクライアントアサーションは短命なので窓は短く、それでもこのサブストアを `noeviction` か永続インスタンスで動かす理由になります。`Metadata` を持っていた場合は、OP を起動する前にレコードを復元してください。空のレコードに対して起動すると、OP は設定で指定されたモードをそのまま記録し、既存の grant を発行したときのモードからの切り替えを検出できなくなります。
5. Redis の喪失だけで `bcl.no_sessions_for_subject` が増えるわけではありません。`/end_session` は通知前に session を snapshot し、このイベントは session を伴う logout 通知の grant 由来 eligible RP target が 0 件のときだけ発生します。snapshot 前に eviction が起きた場合は back-channel 通知もイベントも発生しません。zero-target イベントがあれば logout の snapshot と grant の状態を調べてください。

### 部分損失（1 サブストアだけ破損）

1. 該当サブストアへの書き込みを停止します。
2. そのサブストアだけ復元します。
3. 書き込みを再開します。

トランザクショナルクラスタ不変条件により、認可コード / リフレッシュトークン / grants / PAR / アクセストークン / grant revocation は同じバックエンドを共有しています。クラスタ内の部分復元は SQL レベルの操作（テーブル単位の binlog 復元や PITR）になります。揮発サブストアは独立しているので、`Sessions` を失っても `RefreshTokens` には影響しません。

## Cookie 鍵の損失

cookie 鍵を失う（HSM 破壊、secret manager 抹消など）と、運用中のすべての暗号化済み cookie が無効になります:

- 有効だったブラウザ session はすべて失われます。OP が cookie を開けなくなり、ブラウザを未ログインとして扱うので、ユーザは再ログインになります。
- 進行中の consent / interaction フローも失われます。ユーザは最初からやり直しです。
- リフレッシュトークンには影響しません。cookie 鍵が封緘するのはブラウザの cookie（session、interaction、CSRF）で、リフレッシュトークンは封緘していません。

cookie 鍵そのものの復旧経路はありません。署名鍵と同じく、独自にバックアップ / レプリケーションを持つサービス（KMS、Vault）に保管する、HSM 級の秘密として扱ってください。

## 署名鍵の損失

署名鍵を失うと:

- 新しい token は、新しい `op.Keyset` を割り当てるまで発行できません。
- 署名用の秘密鍵を失っても既存 JWT が直ちに無効になるわけではありません。対応する公開 JWK をすでにキャッシュしている RP は `exp` まで検証できます。公開 JWK だけでは OP 自身の検証経路に同じ `op.Keyset` を再構成できないため、署名者を復旧するか、鍵を意図的に置き換えた上で旧 token の扱いを決めます。
- リフレッシュトークンは opaque でストアに保存されているため残りますが、新しい署名を必要とするトークン応答は、署名者を設定するまですべて失敗します。

緩和策: 署名秘密鍵を、独自にバックアップ / レプリケーションを持つサービス（KMS、Vault）に置き、唯一のコピーをプロセスメモリに置かないでください。ライブラリは `crypto.Signer` を満たすものなら何でも受け取れます。[JWKS § HSM / KMS 連携](/ja/operations/jwks#hsm-kms-連携) を参照。

## 訓練

本番投入前に復旧訓練を 1 回:

1. `t0` でバックアップを取得し、その時点で使っていた署名鍵の鍵素材を訓練中も利用できるようにします。
2. `t0 + 1 分` で署名済み JWT アクセストークンを 100 個発行し、対応する公開 JWK と一緒に保持します。
3. `t0` より後に永続状態を変更します（たとえばテスト用クライアントを作成する、grant を失効させるなど）。変更内容を記録します。
4. バックアップを復元します。
5. 保持していた JWT の署名が意図した鍵束で引き続き検証できることを確認します。DB の復元は暗号学的な連続性を壊しません。
6. `t0` 後の永続状態の変更が巻き戻っていることを確認し、設定している失効の挙動は別に確認します。
7. 新規ログインとトークン発行が動くことを確認します。

30 分の訓練 1 回が、書面の runbook より多くの問題を検出します。
