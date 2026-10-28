---
title: インストール
description: Go モジュールに go-oidc-provider を追加する。
---

# インストール

```sh
go get github.com/libraz/go-oidc-provider@v1.4.0
```

SQL / Redis / DynamoDB のストアアダプタサブモジュールを使う場合は、同じタグに揃えてください:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@v1.4.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/redis@v1.4.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.4.0
```

本モジュールは **Go 1.26.0 以上**を要求します（`go.mod` は `go 1.26.0` を宣言）。リリースは `toolchain go1.27.3` に固定してビルド・テストしています。プロジェクト CI と同じ TLS / 依存関係のセキュリティ基準に揃えたい場合は、この toolchain 以上を使ってください。

## パッケージとサブモジュール

| import パス | import するタイミング |
|---|---|
| `github.com/libraz/go-oidc-provider/op` | 常に。公開 API です。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/inmem` | 参考実装、開発、テスト用のストア。メインモジュールに含まれます。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/sql` | SQLite / MySQL / Postgres 用の永続ストア。サブモジュールなので、使うまで DB ドライバは `go.sum` に入りません。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/redis` | 揮発性サブストア（セッション、interaction、消費済み JTI）。`composite` 経由で永続ストアと組み合わせます。サブモジュール。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb` | DynamoDB 用ストア。Experimental なサブモジュールで、使うまで AWS SDK は `go.sum` に入りません。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/composite` | Hot / Cold 分離。永続サブストアと揮発サブストアを別々のバックエンドに振り分けます。メインモジュールに含まれます。 |

::: tip サブモジュール
SQL、Redis、DynamoDB adapter は Go サブモジュールとして公開しています。実際に使うモジュールだけが driver や AWS SDK の依存を持ちます。
:::

## 安定性

`op.New` と同梱のストレージアダプタだけで構成している場合は、通常そのまま更新できます。独自のストアやその他の拡張を組み込んでいる場合は、更新前に [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) の移行案内を確認してください。

SQL アダプタを使っている場合は、新しいリリースを動かす前に、使用するエンジン向けの `ALTER TABLE` を [`MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) から適用してください。`Store.Migrate` は足りないテーブルを作るだけで、既存テーブルに必要な列がなければ起動を拒否します。

godoc が `Experimental:` で始まる symbol は、マイナーリリース間の互換性保証の対象外です。現在の一覧は生成済みの [experimental API manifest](https://github.com/libraz/go-oidc-provider/blob/main/api/experimental.txt) にあります。クイックスタートで使う `op.LoginFlow` と `op.WithLoginFlow`、`op.WithSPAUI`、`op.WithConsentUI`、`op.WithChooserUI`、DynamoDB アダプタ全体がこの一覧に入っています。

## 次へ

- [最小構成 OP](/ja/getting-started/minimal): `go run` で動く OP を約 30 行で書きます。
- [必須オプション](/ja/getting-started/required-options): `op.New` が必ず求めるものと、欠けると起動を拒否するもの。
- [ルータへのマウント](/ja/getting-started/mount): `net/http`、`chi`、`gin` への載せ方。
