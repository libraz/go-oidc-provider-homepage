---
title: インストール
description: Go モジュールに go-oidc-provider を追加する。
---

# インストール

```sh
go get github.com/libraz/go-oidc-provider/op@latest
```

SQL / Redis のストアアダプタサブモジュールを使う場合は、同じタグに揃えてください:

```sh
go get github.com/libraz/go-oidc-provider/op/storeadapter/sql@latest
go get github.com/libraz/go-oidc-provider/op/storeadapter/redis@latest
```

モジュールの言語バージョン下限は **Go 1.25+** です（`go.mod` の directive は `go 1.25.0`）。このリリースは `toolchain go1.26.5` に固定してビルド・テストしています。プロジェクト CI と同じ TLS / 依存関係のセキュリティ baseline に揃える場合は、この toolchain 以上を使ってください。

## モジュールとサブモジュール

| Module path | import するタイミング |
|---|---|
| `github.com/libraz/go-oidc-provider/op` | 常に — 公開 API。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/inmem` | 参考実装 / 開発 / テスト用 store。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/sql` | SQLite / MySQL / Postgres 用の永続 store。サブモジュールなので、利用するまで DB driver は `go.sum` に入りません。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/redis` | 揮発性サブストア（interaction、消費済み JTI）。サブモジュール。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/dynamodb` | DynamoDB store。Experimental なサブモジュールで、利用するまで AWS SDK は `go.sum` に入りません。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/composite` | Hot/cold splitter。 |

::: tip サブモジュール
SQL、Redis、DynamoDB adapter は Go サブモジュールとして公開しています。実際に使うモジュールだけが driver や AWS SDK の依存を持ちます。
:::

## 安定性

ライブラリは **v1.0.0** です。公開 API は Semantic Versioning に従うため、破壊的変更にはメジャーリリースが必要です。godoc が `Experimental:` で始まる symbol は例外で、マイナーリリースでも変更される可能性があります。現在は login-flow と interaction UI の seam、Grant Management、DynamoDB adapter が該当します。完全な一覧は生成済みの [experimental API manifest](https://github.com/libraz/go-oidc-provider/blob/main/api/experimental.txt) です。そこにない API は stable です。リリースの詳細は [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) を参照してください。

## 次へ

- [最小構成 OP](/ja/getting-started/minimal) — 30 行、`go run` で動く。
- [必須オプション](/ja/getting-started/required-options) — `op.New` が安全でない構成で起動を拒否する条件。
- [ルーターへの組み込み](/ja/getting-started/mount) — `net/http`、`chi`、`gin` での使い方。
