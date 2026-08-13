---
title: DynamoDB ストア
description: DynamoDB のテーブル定義を意図して用意し、トランザクション予約 item と TTL に依存しない read 時の失効確認で go-oidc-provider を運用する。
---

# 使い方 — DynamoDB ストア

OIDC の永続プロトコル状態と揮発プロトコル状態を AWS DynamoDB に置きたい場合は、DynamoDB adapter を使います。すべての `store.Store` サブストアと `store.Transactional` を実装しているため、ブラウザ認可コードフローを DynamoDB 単体で動かせます。

::: warning Experimental API
`op/storeadapter/dynamodb` は公開済みのサブモジュールですが、コンストラクタと option は `Experimental:` マーカー付きです。バージョンを固定し、マイナーバージョンを上げる前にリリースノートを確認してください。
:::

> **ソース:** [`examples/18-dynamodb-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/18-dynamodb-store)

## インストールとストアの構築

adapter は別モジュールです。DynamoDB を使わないアプリケーションに AWS SDK の依存は入りません。

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.1.0
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

1 つの AWS アカウントで複数の OP を動かす場合は `oidcdynamo.WithTablePrefix("my_op_")` を使います。`WithNaming` は個々の物理テーブル名を上書きし、未知の論理名は構築時に拒否します。

## テーブルは意図してプロビジョニングする

adapter は `New` の中でテーブルを作りません。`CreateTables(ctx)` は冪等で、開発とテスト向けです。本番のインフラは `storage.TableDefinitions()` を CloudFormation、CDK、Terraform、または独自のプロビジョニングへ変換してください。定義には各テーブルの key schema、global secondary index、TTL 属性が含まれます。

```go
if err := storage.CreateTables(ctx); err != nil {
  return err // 開発とテストのみ
}
```

テーブル定義はストアの形ごとに分かれており、ほとんどのサブストアは 1 つのテーブルを使います。grant revocation と revoked JTI の tombstone は 1 つのテーブルを共有します。adapter はレコードを JSON として保存し、DynamoDB が問い合わせる key、index、condition 属性だけを別に持ちます。この構成ではレコード形状を変えてもテーブル migration は不要です。

## デバイスコードテーブルの更新

現在のデバイスコードテーブルは `by_user_code` グローバルセカンダリインデックスを使いません。デバイスレコードは `device_code` のダイジェストをキーにし、`user_code` を持つ場合は `Save` が `uc#<user_code>` という予約 item を同じ `TransactWriteItems` で書き込みます。`FindByUserCode`、`ApproveByUserCode`、`DenyByUserCode` はこの予約 item を strongly consistent read で解決します。予約 item が一意性制約です。セカンダリインデックスは重複を検索できても、2 つの writer が同じコードを同時に取得することまでは防げません。

既存テーブルには、以前の未使用な `by_user_code` インデックスが残っていることがあります。容量を見直すまで残しても安全です。不要になった時点で、通常の DynamoDB インフラ手順を使って削除してください。更新のためにテーブルを drop したり作り直したりする必要はありません。予約 item 方式より前に発行したデバイスコードには `uc#...` 予約がないため、意図的に `user_code` では解決されず、通常の短い有効期間を経て自然に期限切れになります。古いインデックスへのフォールバックはありません。そうすると、まだ有効な更新前レコードが保持する `user_code` を新しいリクエストが取得できてしまうためです。

## 失効と整合性

DynamoDB の TTL による削除は非同期です。adapter は TTL 属性をストレージ回収にだけ使い、すべての read で自身の clock に対して失効を確認します。そのため、DynamoDB が item をまだ削除していなくても、失効した認可コードは拒否されます。

セキュリティ判断に使う read は strongly consistent `GetItem` を使います。transactional adapter は write をバッファし、`TransactWriteItems` で commit します。これにより認可コード発行、PAR 消費、関連するプロトコルレコードを原子的に扱えます。

## 認証 factor store

DynamoDB adapter は `TOTPs()`、`Passkeys()`、`RecoveryCodes()`、`EmailOTPs()`、`AuthnLockouts()` も公開します。これらは `store.Store` の外にあり、対応する login-flow `Step` に直接渡します。accessor 名は in-memory と SQL adapter と同じなので、バックエンドを変更しても login-flow の配線は変わりません。

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
