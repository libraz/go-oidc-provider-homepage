---
title: 既存ユーザストアの投影
description: アプリケーション所有の users テーブルを移行せずに、OIDC のユーザ読み取り面へ投影する。
---

# 使い方 — 既存ユーザストアの投影

既に users、members、employees、accounts などのテーブルがあり、その形が OP 同梱の `oidc_users` テーブルと一致しない場合でも、そのテーブルを正本として使えます。OP に必要なのは、subject を解決し、許可された claim を返し、パスワードログインを使う場合は `store.UserPasswordStore` の契約に沿ってパスワードハッシュを読める投影です。

> **ソース:** [`examples/24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore)

## 構成

この例はストレージを 2 つの責務に分けます。

| 責務 | バックエンド |
|---|---|
| OAuth / OIDC レコード: clients、authorization codes、refresh tokens、grants、sessions、PAR、IAT、RAT、access tokens | 同梱の `op/storeadapter/sql` schema |
| エンドユーザレコード: subject、email、name、locale、パスワードハッシュ、tenant メタデータ | 組み込み側が所有する `members` テーブル |

`hybridStore` は `*oidcsql.Store` を埋め込み、`Users()` だけを上書きします。Go のメソッド昇格により、それ以外のサブストアは SQL アダプタのまま残り、`/userinfo`、ID トークン組み立て、パスワードログインだけがアプリケーション所有の member 投影を読みます。

```go
type hybridStore struct {
  *oidcsql.Store
  users store.UserPasswordStore
}

func (h *hybridStore) Users() store.UserStore { return h.users }
```

ログインフローも同じ投影をパスワード検証に使います。

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

## 投影の契約

通常、ユーザストアアダプタは次を実装します。

| メソッド | 役割 |
|---|---|
| `FindBySubject(ctx, sub)` | `/userinfo` とトークン組み立て用に、安定した OIDC subject と claim map を読む。 |
| `FindByUsername(ctx, username)` | メールアドレスなどのログイン識別子を、同じ安定 subject に解決する。 |
| `ReadPasswordHash(ctx, subject)` | `op.PrimaryPassword` 用に PHC 形式のパスワードハッシュを返す。未知ユーザやパスワードレスユーザでは `store.ErrNotFound` を返す。 |

カラム名は自由です。この例では `member_id`、`email_address`、`password_phc`、`full_name`、`locale_pref`、`tenant_id` を `store.User.Subject` と `store.User.Claims` へ投影しています。

## claim の開示

`store.User.Claims` に値を入れても、それだけで全 RP に出るわけではありません。OP は scope と claims request によるフィルタを引き続き適用します。この例は member 行から独自の `tenant` claim を読みますが、それを許可する scope がないため demo RP には返りません。

アプリケーション固有 claim を scope 経由で出す場合は [Public / Internal スコープ](/ja/use-cases/scopes)、RP が細かく claim を選ぶ場合は [Claims リクエスト](/ja/use-cases/claims-request) を参照してください。

## composite が必要なケース

このパターンは `Users()` サブストアだけを置き換えます。トランザクションが必要な OAuth レコード群は 1 つの SQL アダプタに残るため、`storeadapter/composite` は不要です。

複数のサブストアを別バックエンドに振り分けたい場合、たとえば永続化が必要な grants / refresh tokens は SQL に置き、interactions / consumed JTIs は Redis に置く場合は [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を使います。

## 実行

```sh
(cd examples/24-byo-userstore && go run -tags example .)
```

この例は OP を `:8080`、ペアの RP を `:9090` で起動します。`demo@example.test` / `demo` でログインすると、RP の `/me` ページで開示された ID トークン claim を確認できます。

## 次に読む

- [SQL ストア](/ja/use-cases/sql-store) — OIDC レコードに使う同梱 SQL アダプタ。
- [MFA / ステップアップ](/ja/use-cases/mfa-step-up) — 組み込みパスワード、TOTP、captcha、ステップアップの接続。
- [カスタム認証器](/ja/use-cases/custom-authenticator) — SMS OTP やハードウェアトークンなど新しい認証要素を足す。
