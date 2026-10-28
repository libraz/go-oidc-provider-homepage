---
title: DynamoDB ストア
description: DynamoDB のテーブル定義を意図して用意し、トランザクション予約 item と TTL に依存しない read 時の失効確認で go-oidc-provider を運用する。
pageClass: pg-use-cases-dynamodb-store
---

# ユースケース — DynamoDB ストア

OIDC の永続プロトコル状態と揮発プロトコル状態を AWS DynamoDB に置きたい場合は、DynamoDB adapter を使います。すべての `store.Store` サブストアと `store.Transactional` を実装しているため、ブラウザ認可コードフローを DynamoDB 単体で動かせます。

::: warning Experimental API
`op/storeadapter/dynamodb` は公開済みのサブモジュールですが、コンストラクタと option は `Experimental:` マーカー付きです。バージョンを固定し、マイナーバージョンを上げる前にリリースノートを確認してください。
:::

> **ソース:** [`examples/18-dynamodb-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/18-dynamodb-store)

## インストールとストアの構築

adapter は別モジュールです。DynamoDB を使わないアプリケーションに AWS SDK の依存は入りません。

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.4.0
```

AWS の認証情報解決とリージョン選択はアプリケーション側の責任です。設定済み SDK client を adapter に渡します。

```go
import (
  "context"

  awsconfig "github.com/aws/aws-sdk-go-v2/config"
  awsdynamodb "github.com/aws/aws-sdk-go-v2/service/dynamodb"
  oidcdynamo "github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb"
)

ctx := context.Background()
cfg, err := awsconfig.LoadDefaultConfig(ctx)
if err != nil { /* 設定エラーを処理 */ }

storage, err := oidcdynamo.New(awsdynamodb.NewFromConfig(cfg))
if err != nil { /* 構築エラーを処理 */ }

// 通常どおり issuer、keyset、login option とともに storage を op.New に渡す。
```

この adapter は、任意インターフェースの `store.OpaqueAccessTokenChainRevoker` と `store.IssuanceRevocationChecker` も実装しています。リフレッシュのローテーションや `/revoke` 1 回の影響が、自分の chain の範囲に収まります。それぞれが何を変えるかは、[ストアバックエンドを自前実装する](/ja/use-cases/byo-store#認可ごとの状態とリフレッシュ-chain) を参照してください。

1 つの AWS アカウントで複数の OP を動かす場合は `oidcdynamo.WithTablePrefix("my_op_")` を使います。`WithNaming` は個々の物理テーブル名を上書きし、未知の論理名は構築時に拒否します。

## テーブルは意図してプロビジョニングする

adapter は `New` の中でテーブルを作りません。`CreateTables(ctx)` は冪等で、開発とテスト向けです。本番のインフラは `storage.TableDefinitions()` を CloudFormation、CDK、Terraform、または独自のプロビジョニングへ変換してください。定義には各テーブルの key schema、global secondary index、TTL 属性が含まれます。

```go
if err := storage.CreateTables(ctx); err != nil {
  return err // 開発とテストのみ
}
```

`CreateTables` は、既存テーブルに足りない global secondary index も `UpdateTable` を 1 回ずつ呼んで追加します。インフラ側で管理しているテーブルには、新しいバイナリを起動する前に、`TableDefinitions()` と同じ index を用意してください。存在しない index へのクエリは即座に失敗するためです。

テーブル定義はストアの形ごとに分かれており、ほとんどのサブストアは 1 つのテーブルを使います。grant revocation と revoked JTI の tombstone は 1 つのテーブルを共有します。adapter はレコードを JSON として保存し、DynamoDB が問い合わせる key、index、condition 属性だけを別に持ちます。この構成ではレコード形状を変えてもテーブル migration は不要です。

## リフレッシュトークンテーブルの更新

リフレッシュトークンのテーブルには `by_grant`、`by_client`、`by_parent` インデックスがあり、`by_handle` インデックスはありません。リフレッシュトークンの `Find` と `Consume` は提示された credential を primary digest で解決し、chain の走査は保存された parent 関係をたどります。`CreateTables` は既存テーブルに足りない index を追加するだけなので、古い `by_handle` が残ることがあります。この index は adapter が使いませんが、容量を回収したい場合は通常の DynamoDB インフラ手順（たとえば `UpdateTable`）で明示的に削除してください。この変更のためにテーブルを drop / 再作成する必要はありません。新規プロビジョニングと restore は `TableDefinitions()` の定義を使い、`by_handle` を復活させないでください。

## デバイスコードテーブルの更新

デバイスコードテーブルは `by_user_code` グローバルセカンダリインデックスを使いません。デバイスレコードは `device_code` のダイジェストをキーにし、`user_code` を持つ場合は `Save` が `uc#<user_code>` という予約 item を同じ `TransactWriteItems` で書き込みます。`FindByUserCode`、`ApproveByUserCode`、`DenyByUserCode` はこの予約 item を strongly consistent read で解決します。予約 item が一意性制約です。セカンダリインデックスは重複を検索できても、2 つの writer が同じコードを同時に取得することまでは防げません。`PutUserWithPassword` もユーザ名に同じ方式を使い、`username#<username>` を予約して、別の subject がすでに保持していれば `store.ErrAlreadyExists` を返します。

<figure class="fig">
  <div class="fig-head">2 つの item を 1 回のトランザクションで書く</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-ddb-title" viewBox="0 0 960 352" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-ddb-title">1 回の Save が、デバイスレコードと user_code の予約 item を同じ TransactWriteItems で書き込みます。user_code による参照は、まず予約 item を strongly consistent read で読み、そこからデバイスレコードを解決します。</title>
    <!-- save -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="320" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="52">Save</text>
    <text class="fg-mxs" x="48" y="76">TransactWriteItems</text>
    <text class="fg-xs" x="48" y="100">両方書くか、どちらも書かないか</text>
    <!-- fan-out -->
    <path class="fg-leader" d="M352,72 H392 M392,60 V188"/>
    <path class="fg-edge fg-edge--accent" d="M392,60 H440" marker-end="url(#fg-ac)"/>
    <path class="fg-edge fg-edge--accent" d="M392,188 H440" marker-end="url(#fg-ac)"/>
    <!-- device record -->
    <rect class="fg-box" x="440" y="24" width="488" height="72" rx="8"/>
    <text class="fg-m" x="456" y="52">pk = digest(device_code)</text>
    <text class="fg-xs" x="456" y="76">デバイスレコード本体</text>
    <!-- reservation -->
    <rect class="fg-box" x="440" y="152" width="488" height="72" rx="8"/>
    <text class="fg-m" x="456" y="180">pk = uc#&lt;user_code&gt;</text>
    <text class="fg-xs" x="456" y="204">user_code の一意性を担保する item</text>
    <!-- resolves -->
    <path class="fg-edge" d="M684,152 V96" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="696" y="128">レコードを解決する</text>
    <!-- lookup -->
    <rect class="fg-box" x="32" y="256" width="320" height="72" rx="8"/>
    <text class="fg-t2" x="48" y="284">FindByUserCode</text>
    <text class="fg-xs" x="48" y="308">user_code で引く</text>
    <path class="fg-edge" d="M352,292 H684 V224" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="518" y="282" text-anchor="middle">strongly consistent read</text>
  </svg>
  <figcaption class="fig-note">短い user_code の一意性を担保しているのは、この予約 item だけです。レコードと同じトランザクションで書くのは、コードだけが存在する状態も、予約だけが残る状態も作らないためです。</figcaption>
</figure>

既存テーブルには、以前の未使用な `by_user_code` インデックスが残っていることがあります。容量を見直すまで残しても安全です。不要になった時点で、通常の DynamoDB インフラ手順を使って削除してください。更新のためにテーブルを drop したり作り直したりする必要はありません。予約 item 方式より前に発行したデバイスコードには `uc#...` 予約がないため、意図的に `user_code` では解決されず、通常の短い有効期間を経て自然に期限切れになります。古いインデックスへのフォールバックはありません。そうすると、まだ有効な更新前レコードが保持する `user_code` を新しいリクエストが取得できてしまうためです。

## トランザクションのサイズ上限

DynamoDB には対話的なトランザクションがありません。`BeginTx` が返すハンドルは書き込みをバッファし、`Commit` が 1 回の `TransactWriteItems`（最大 100 アクション）として実行します。通常のリクエストは上限をはるかに下回ります。一方、失効のカスケードは回収するレコードごとに 1 アクションを積むため、保存済みトークンが上限を超える rotation chain や grant では、`Commit` が `oidcdynamo.ErrTransactionTooLarge` を返し、何も書き込みません。トランザクションの外で行うカスケードに上限はありません。レコードごとに保護された更新を 1 件ずつ発行して収束しますが、取り消すことはできません。

## 失効と整合性

DynamoDB の TTL による削除は非同期です。adapter は TTL 属性をストレージ回収にだけ使い、すべての read で自身の clock に対して失効を確認します。そのため、DynamoDB が item をまだ削除していなくても、失効した認可コードは拒否されます。

セキュリティ判断に使う read は strongly consistent `GetItem` を使います。global secondary index は強整合で読めないため、リフレッシュトークンの失効カスケードは index だけに頼りません。各リフレッシュトークンは、カスケードが辿るリンクと一緒に書き込まれます（ローテーションは親の子集合に加わり、chain の根はリフレッシュテーブル内の `grant-roots#<grant id>` item に加わります）。カスケードは、そのリンクを強整合 read で辿ります。transactional adapter は write をバッファし、`TransactWriteItems` で commit します。これにより認可コード発行、PAR 消費、関連するプロトコルレコードを原子的に扱えます。

## 認証 factor store

DynamoDB adapter は `TOTPs()`、`Passkeys()`、`RecoveryCodes()`、`EmailOTPs()`、`AuthnLockouts()` も公開します。これらは `store.Store` の外にあり、対応する login-flow `Step` に直接渡してください。accessor 名は in-memory と SQL adapter と同じなので、バックエンドを変更しても login-flow の組み込み方は変わりません。

## ローカルで example を動かす

example は DynamoDB Local、ポート 8080 の OP、ポート 9090 の RP を起動します。emulator は Compose network 内に留まります。

```sh
docker compose -f examples/18-dynamodb-store/compose.yaml up -d --build
open http://127.0.0.1:9090/
docker compose -f examples/18-dynamodb-store/compose.yaml down -v
```

AWS では、example の endpoint override 用認証情報をコピーしないでください。`LoadDefaultConfig` にデプロイ先の通常のリージョンと credential chain を使わせます。

## 次に読む

- [ストレージ構成の選び方](/ja/use-cases/storage-decision) — SQL、DynamoDB、Hot / Cold 分離を選ぶ。
- [既存ユーザストアの投影](/ja/use-cases/byo-userstore) — アプリケーション所有の users テーブルを使い続ける。
- [MFA / ステップアップ](/ja/use-cases/mfa-step-up) — 認証 factor store を login flow に接続する。
