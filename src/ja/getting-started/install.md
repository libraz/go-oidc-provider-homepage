---
title: インストール
description: Go モジュールに go-oidc-provider を追加する。
---

# インストール

```sh
go get github.com/libraz/go-oidc-provider/op@v1.2.0
```

SQL / Redis / DynamoDB のストアアダプタサブモジュールを使う場合は、同じタグに揃えてください:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@v1.2.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/redis@v1.2.0
go get github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb@v1.2.0
```

本モジュールは **Go 1.26.0 以上**を要求します（`go.mod` は `go 1.26.0` を宣言）。リリースは `toolchain go1.27.1` に固定してビルド・テストしています。プロジェクト CI と同じ TLS / 依存関係のセキュリティ基準に揃えたい場合は、この toolchain 以上を使ってください。

## モジュールとサブモジュール

| Module path | import するタイミング |
|---|---|
| `github.com/libraz/go-oidc-provider/op` | 常に — 公開 API。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/inmem` | 参考実装 / 開発 / テスト用 store。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/sql` | SQLite / MySQL / Postgres 用の永続 store。サブモジュールなので、利用するまで DB driver は `go.sum` に入りません。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/redis` | 揮発性サブストア（interaction、消費済み JTI）。サブモジュール。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb` | DynamoDB store。Experimental なサブモジュールで、利用するまで AWS SDK は `go.sum` に入りません。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/composite` | Hot / Cold 分離。永続サブストアと揮発サブストアを別々のバックエンドに振り分ける。 |

::: tip サブモジュール
SQL、Redis、DynamoDB adapter は Go サブモジュールとして公開しています。実際に使うモジュールだけが driver や AWS SDK の依存を持ちます。
:::

## 安定性

`op.New` と同梱ストレージアダプタだけで構成した場合は、通常そのまま更新できます。独自のストアやその他の拡張を組み込んでいる場合は、更新前に [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) の移行案内を確認してください。godoc が `Experimental:` で始まる symbol は通常のマイナーリリース例外で、変更される可能性があります。現在の一覧は生成済みの [experimental API manifest](https://github.com/libraz/go-oidc-provider/blob/main/api/experimental.txt) にあります。

## 次へ

- [最小構成 OP](/ja/getting-started/minimal) — 30 行、`go run` で動く。
- [必須オプション](/ja/getting-started/required-options) — `op.New` が安全でない構成で起動を拒否する条件。
- [ルータへのマウント](/ja/getting-started/mount) — `net/http`、`chi`、`gin` での使い方。
