---
title: 既存ユーザーストアの投影
description: アプリケーション所有の users テーブルを移行せずに、OIDC のユーザー読み取り面へ投影する。
---

# ユースケース — 既存ユーザーストアの投影

既に users、members、employees、accounts などのテーブルがあり、その形が OP 同梱の `oidc_users` テーブルと一致しない場合でも、そのテーブルを source of truth のままにできます。OP に必要なのは、subject を解決し、許可された claim を返し、password login を使う場合は `store.UserPasswordStore` contract 経由で password hash を読める投影です。

> **Source:** [`examples/24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore)

## 構成

example はストレージを 2 つの責務に分けます。

| 責務 | バックエンド |
|---|---|
| OAuth / OIDC レコード: clients、authorization codes、refresh tokens、grants、sessions、PAR、IAT、RAT、access tokens | 同梱の `op/storeadapter/sql` schema |
| エンドユーザーレコード: subject、email、name、locale、password hash、tenant metadata | embedder 所有の `members` table |

`hybridStore` は `*oidcsql.Store` を embed し、`Users()` だけを上書きします。Go の method promotion により、それ以外の substore は SQL adapter のまま残り、`/userinfo`、ID Token 組み立て、password login だけがアプリケーション所有の member 投影を読みます。

```go
type hybridStore struct {
  *oidcsql.Store
  users store.UserPasswordStore
}

func (h *hybridStore) Users() store.UserStore { return h.users }
```

login flow も同じ投影を password verification に使います。

```go
members := &MemberUserStore{db: db}
storage := &hybridStore{Store: durable, users: members}

flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: members},
}

provider, err := op.New(
  op.WithStore(storage),
  op.WithLoginFlow(flow),
  // required options...
)
```

## 投影 contract

通常、ユーザーストア adapter は次を実装します。

| Method | 役割 |
|---|---|
| `FindBySubject(ctx, sub)` | `/userinfo` と token 組み立て用に、安定した OIDC subject と claim map を読む。 |
| `FindByUsername(ctx, username)` | email address などの login identifier を、同じ安定 subject に解決する。 |
| `ReadPasswordHash(ctx, subject)` | `op.PrimaryPassword` 用に PHC encoded password hash を返す。未知ユーザーや passwordless user では `store.ErrNotFound` を返す。 |

カラム名は自由です。example では `member_id`、`email_address`、`password_phc`、`full_name`、`locale_pref`、`tenant_id` を `store.User.Subject` と `store.User.Claims` へ投影しています。

## claim release

`store.User.Claims` に値を入れても、それだけで全 RP に出るわけではありません。OP は scope と claims request による filtering を引き続き適用します。example は member row から custom `tenant` claim を読みますが、それを許可する scope がないため demo RP には返りません。

アプリケーション固有 claim を scope 経由で出す場合は [Public / Internal スコープ](/ja/use-cases/scopes)、RP が細かく claim を選ぶ場合は [Claims リクエスト](/ja/use-cases/claims-request) を参照してください。

## composite が必要なケース

この pattern は `Users()` substore だけを置き換えます。transactional な OAuth cluster は 1 つの SQL adapter に残るため、`storeadapter/composite` は不要です。

複数の substore を別 backend に振り分けたい場合、たとえば durable な grants / refresh tokens は SQL に置き、interactions / consumed JTIs は Redis に置く場合は [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を使います。

## 実行

```sh
go run -tags example ./examples/24-byo-userstore
```

example は OP を `:8080`、ペアの RP を `:9090` で起動します。`demo@example.test` / `demo` でログインすると、RP の `/me` ページで release された ID Token claim を確認できます。

## 次に読む

- [SQL ストア](/ja/use-cases/sql-store) — OIDC レコードに使う同梱 SQL adapter。
- [MFA / ステップアップ](/ja/use-cases/mfa-step-up) — built-in password、TOTP、captcha、step-up の wiring。
- [カスタム authenticator](/ja/use-cases/custom-authenticator) — SMS OTP や hardware token など新しい credential factor を足す。
