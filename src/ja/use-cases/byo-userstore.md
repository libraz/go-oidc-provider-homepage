---
title: 既存ユーザストアの投影
description: アプリケーション所有の users テーブルを移行せずに、OIDC のユーザ読み取り面へ投影する。
pageClass: pg-use-cases-byo-userstore
---

# 使い方 — 既存ユーザストアの投影

既に users、members、employees、accounts などのテーブルがあり、その形が OP 同梱の `oidc_users` テーブルと一致しない場合でも、そのテーブルを正本として使えます。OP に必要なのは、subject を解決し、許可された claim を返し、パスワードログインを使う場合は `store.UserPasswordStore` の契約に沿ってパスワードハッシュを読める投影です。

境界は OAuth レコードとエンドユーザレコードの間にあります。前者は本ライブラリが持ち、後者は組み込み側が持ちます。OP はこの境界をまたいで 3 つの読み取りメソッドを呼びます。

<svg role="img" aria-labelledby="byo-userstore-seam-title" viewBox="0 0 760 280" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="byo-userstore-seam-title">2 つの責務の境界: 本ライブラリは OAuth / OIDC レコードを同梱ストアで持ち、組み込み側はエンドユーザの行を持ち、OP は FindBySubject、FindByUsername、ReadPasswordHash で境界をまたいで読む。</title>

  <path class="bu-seam" d="M380 26 V268"/>
  <text class="bu-call" x="380" y="16" text-anchor="middle">op.WithUserStore</text>

  <rect class="bu-lib" x="20" y="28" width="280" height="88" rx="8"/>
  <text class="bu-lib-title" x="160" y="56" text-anchor="middle">ライブラリが持つ</text>
  <text class="bu-note" x="160" y="80" text-anchor="middle">clients · codes · refresh tokens · grants</text>
  <text class="bu-note" x="160" y="100" text-anchor="middle">sessions · PAR · IAT · RAT · access tokens</text>

  <rect class="bu-app" x="460" y="28" width="280" height="88" rx="8"/>
  <text class="bu-app-title" x="600" y="56" text-anchor="middle">組み込み側が持つ</text>
  <text class="bu-note" x="600" y="80" text-anchor="middle">members: member_id · email_address</text>
  <text class="bu-note" x="600" y="100" text-anchor="middle">password_phc · full_name · locale_pref</text>

  <text class="bu-note" x="300" y="156" text-anchor="end">ID トークンと /userinfo の claim</text>
  <path class="bu-flow" d="M310 152 H450"/>
  <path class="bu-flow" d="M444 147 L450 152 L444 157"/>
  <text class="bu-call" x="380" y="142" text-anchor="middle">FindBySubject</text>
  <text class="bu-note" x="460" y="156">member の行を読む</text>

  <text class="bu-note" x="300" y="202" text-anchor="end">ログイン識別子から subject へ</text>
  <path class="bu-flow" d="M310 198 H450"/>
  <path class="bu-flow" d="M444 193 L450 198 L444 203"/>
  <text class="bu-call" x="380" y="188" text-anchor="middle">FindByUsername</text>
  <text class="bu-note" x="460" y="202">email_address で照合</text>

  <text class="bu-note" x="300" y="248" text-anchor="end">op.PrimaryPassword</text>
  <path class="bu-flow" d="M310 244 H450"/>
  <path class="bu-flow" d="M444 239 L450 244 L444 249"/>
  <text class="bu-call" x="380" y="234" text-anchor="middle">ReadPasswordHash</text>
  <text class="bu-note" x="460" y="248">password_phc を返す</text>
</svg>

> **ソース:** [`examples/24-byo-userstore`](https://github.com/libraz/go-oidc-provider/tree/main/examples/24-byo-userstore)

## 構成

この例はストレージを 2 つの責務に分けます。

| 責務 | バックエンド |
|---|---|
| OAuth / OIDC レコード: clients、authorization codes、refresh tokens、grants、sessions、PAR、IAT、RAT、access tokens | 同梱の `op/storeadapter/sql` schema |
| エンドユーザレコード: subject、email、name、locale、パスワードハッシュ、tenant メタデータ | 組み込み側が所有する `members` テーブル |

`op.WithUserStore` は SQL store をラップせず、`/userinfo` と ID トークンの claim 読み取りをアプリケーション所有の投影へ向けます。ログインフローも同じ投影をパスワード検証に使います。

```go
members := &MemberUserStore{db: db}

flow := op.LoginFlow{
  Primary: op.PrimaryPassword{Store: members},
}

provider, err := op.New(
  op.WithStore(durable),
  op.WithUserStore(members),
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

## アプリケーション側の再認証

パスワード変更や二要素目の登録を行うアカウント管理画面では、変更前にユーザを再認証してください。保存済みハッシュを `ReadPasswordHash` で読み、`op.VerifyPassword(hash, plain)` に渡します。アプリケーション側で PHC 形式を parse しないでください。このヘルパは有効な PHC Argon2id ハッシュを受け付けます。パスワードが違う場合、レコードが壊れている場合、検証器の上限外のパラメータの場合は、いずれも `false` を返します。

```go
hash, err := members.ReadPasswordHash(ctx, subject)
if err != nil || !op.VerifyPassword(hash, submittedPassword) {
    // 未知、壊れたハッシュ、誤ったパスワードで同じ汎用応答を返す。
    return ErrReauthenticationFailed
}
```

`op.VerifyPassword` が行うのは比較だけです。OP の総当たり対策は OP の認証フローにだけ適用され、組み込み側が所有するパスワード変更や factor 登録の endpoint には適用されません。呼び出し側で rate limit または lockout を実装してください。

## claim の開示

`store.User.Claims` に値を入れても、それだけで全 RP に出るわけではありません。OP は scope と claims request によるフィルタを引き続き適用します。この例は member 行から独自の `tenant` claim を読みますが、それを許可する scope がないため demo RP には返りません。

アプリケーション固有 claim を scope 経由で出す場合は [Public / Internal スコープ](/ja/use-cases/scopes)、RP が細かく claim を選ぶ場合は [Claims リクエスト](/ja/use-cases/claims-request) を参照してください。

## composite が必要なケース

このパターンはエンドユーザ claim の読み取り元だけを差し替えます。トランザクションが必要な OAuth レコード群は 1 つの SQL アダプタに残るため、`storeadapter/composite` は不要です。`WithUserStore` なら adapter の任意 capability を隠してしまう wrapper も不要です。

複数のサブストアを別バックエンドに振り分けたい場合、たとえば永続化が必要な grants / refresh tokens は SQL に置き、interactions / consumed JTIs は Redis に置く場合は [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を使います。

## 実行

```sh
(cd examples/24-byo-userstore && GOWORK=off go run -tags example .)
```

この例は OP を `:8080`、ペアの RP を `:9090` で起動します。`demo@example.test` / `demo` でログインすると、RP の `/me` ページで開示された ID トークン claim を確認できます。

## 続きはこちら

- [SQL ストア](/ja/use-cases/sql-store) — OIDC レコードに使う同梱 SQL アダプタ。
- [MFA / ステップアップ](/ja/use-cases/mfa-step-up) — 組み込みパスワード、TOTP、captcha、ステップアップの接続。
- [カスタム認証器](/ja/use-cases/custom-authenticator) — SMS OTP やハードウェアトークンなど新しい認証要素を足す。
