---
title: インストール
description: Go モジュールに go-oidc-provider を追加する。
---

# インストール

```sh
go get github.com/libraz/go-oidc-provider/op@latest
```

ライブラリは **Go 1.25+** を対象にしています（`go.mod` の directive と一致）。`op/storeadapter/sql` と `op/storeadapter/redis` のストアアダプタサブモジュールは testcontainers ベースの結合テストのために以前から Go 1.25 を要求していたため、ルートモジュールも同じ最低ラインに揃えた形です。

## モジュールとサブモジュール

| Module path | import するタイミング |
|---|---|
| `github.com/libraz/go-oidc-provider/op` | 常に — 公開 API。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/inmem` | リファレンス / 開発 / テスト用 store。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/sql` | SQLite / MySQL / Postgres durable store。サブモジュール — 利用するまで DB driver が `go.sum` に入りません。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/redis` | 揮発性サブストア（interaction、消費済み JTI）。サブモジュール。 |
| `github.com/libraz/go-oidc-provider/op/storeadapter/composite` | Hot/cold splitter。 |

::: tip サブモジュール
SQL と Redis adapter は Go サブモジュールとして公開しています。実際にそれを使うモジュールでだけ driver 依存のコストを払えば済みます。
:::

## Pre-v1.0

ライブラリは **pre-v1.0** です。`v1.0.0` までは公開 API がマイナーリリースで変わる可能性があります。破壊的変更は [`CHANGELOG.md`](https://github.com/libraz/go-oidc-provider/blob/main/CHANGELOG.md) で追跡されます。godoc が `Experimental:` で始まる API は v1.0 以降もメジャー上げ無しで変わり得ます。

## 次へ

- [最小構成 OP](/ja/getting-started/minimal) — 30 行、`go run` で動く。
- [必須オプション](/ja/getting-started/required-options) — `op.New` が安全でない構成で起動を拒否する条件。
- [ルーターへのマウント](/ja/getting-started/mount) — `net/http`、`chi`、`gin` への置き方。
