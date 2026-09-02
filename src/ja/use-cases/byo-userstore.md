---
title: 既存ユーザストアの投影
description: アプリケーション所有の users テーブルを移行せずに、OIDC のユーザ読み取り面へ投影する。
pageClass: pg-use-cases-byo-userstore
---

# 使い方 — 既存ユーザストアの投影

既に users、members、employees、accounts などのテーブルがあり、その形が OP 同梱の `oidc_users` テーブルと一致しない場合でも、そのテーブルを正本として使えます。OP に必要なのは、subject を解決し、許可された claim を返し、パスワードログインを使う場合は `store.UserPasswordStore` の契約に沿ってパスワードハッシュを読める投影です。

境界は OAuth レコードとエンドユーザレコードの間にあります。前者は本ライブラリが持ち、後者は組み込み側が持ちます。OP はこの境界をまたいで 3 つの読み取りメソッドを呼びます。

<figure class="fig">
  <div class="fig-head">プロトコルのレコードはこちら、人のデータは向こう</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-byouserstore-title" viewBox="0 0 960 286" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-byouserstore-title">本ライブラリは OAuth / OIDC のレコードを自身のストアで持ち、組み込み側はエンドユーザの行を今ある場所のまま持ちます。OP が境界をまたぐのは 3 つの読み取り呼び出しだけです。</title>
    <text class="fg-lbl fg-accent" x="480" y="18" text-anchor="middle">op.WithUserStore</text>
    <line class="fg-rule fg-rule--dashed fg-rule--strong" x1="480" y1="26" x2="480" y2="270"/>
    <rect class="fg-box" x="36" y="34" width="404" height="106" rx="8"/>
    <text class="fg-t2" x="56" y="60">ライブラリが持つ</text>
    <text class="fg-mxs" x="56" y="84">clients · 認可コード · refresh token · grants</text>
    <text class="fg-mxs" x="56" y="104">sessions · PAR · IAT · RAT · access token</text>
    <text class="fg-xs" x="56" y="128">プロトコルが要求するから存在する情報のすべて</text>
    <rect class="fg-box" x="520" y="34" width="404" height="106" rx="8"/>
    <text class="fg-t2" x="540" y="60">組み込み側が持つ</text>
    <text class="fg-mxs" x="540" y="84">members: member_id · email_address</text>
    <text class="fg-mxs" x="540" y="104">password_phc · full_name · locale_pref</text>
    <text class="fg-xs" x="540" y="128">OIDC を入れる前から製品にあった行</text>
    <text class="fg-lbl" x="36" y="172">境界を越える 3 つの呼び出し</text>
    <rect class="fg-box fg-box--accent" x="36" y="182" width="888" height="34" rx="6"/>
    <text class="fg-m fg-accent" x="56" y="204">FindBySubject</text>
    <text class="fg-xs" x="240" y="204">subject に対応する member の行を読む — ID トークンと /userinfo の claim の出どころ</text>
    <rect class="fg-box fg-box--accent" x="36" y="220" width="888" height="26" rx="6"/>
    <text class="fg-m fg-accent" x="56" y="238">FindByUsername</text>
    <text class="fg-xs" x="240" y="238">ログイン識別子を subject に変換する — ここでは email_address と照合する</text>
    <rect class="fg-box fg-box--accent" x="36" y="250" width="888" height="26" rx="6"/>
    <text class="fg-m fg-accent" x="56" y="268">ReadPasswordHash</text>
    <text class="fg-xs" x="240" y="268">op.PrimaryPassword が検証するために password_phc を返す — ハッシュは組み込み側から出ない</text>
  </svg>
  <figcaption class="fig-note">3 つとも読み取りです。ライブラリが member の行を書き込むことも、作り出すこともありません。スキーマの形を指定することもなく、必要なのはこの 3 つの問いに答えられることだけです。</figcaption>
</figure>

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
