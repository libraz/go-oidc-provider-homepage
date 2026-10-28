---
title: 既存ユーザストアの投影
description: アプリケーション所有の users テーブルを移行せずに、OIDC のユーザ読み取り面へ投影する。
pageClass: pg-use-cases-byo-userstore
---

# ユースケース — 既存ユーザストアの投影

既に users、members、employees、accounts などのテーブルがあり、その形が OP 同梱の `oidc_users` テーブルと一致しない場合でも、そのテーブルを正本として使えます。OP に必要なのは、subject を解決し、許可された claim を返し、パスワードログインを使う場合は `store.UserPasswordStore` の契約に沿ってパスワードハッシュを読める投影です。

境界は OAuth レコードとエンドユーザレコードの間にあります。前者は本ライブラリが持ち、後者は組み込み側が持ちます。OP はこの境界をまたいで 3 つの読み取りメソッドを呼びます。

<figure class="fig">
  <div class="fig-head">プロトコルのレコードはこちら、人のデータは向こう</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-byouserstore-title" viewBox="0 0 960 352" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-byouserstore-title">本ライブラリは OAuth / OIDC のレコードを自身のストアで持ち、組み込み側はエンドユーザの行を今ある場所のまま持ちます。OP が境界をまたぐのは 3 つの読み取り呼び出しだけです。</title>
    <!-- library side -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="432" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="52">プロトコルのレコードはライブラリが持つ</text>
    <text class="fg-m" x="48" y="76">clients · codes · grants · sessions</text>
    <text class="fg-m" x="48" y="100">refresh/access token · PAR · IAT · RAT</text>
    <!-- seam -->
    <path class="fg-rule fg-rule--dashed fg-rule--strong" d="M480,24 V120"/>
    <!-- your side -->
    <rect class="fg-box" x="496" y="24" width="432" height="96" rx="8"/>
    <text class="fg-t2" x="512" y="52">エンドユーザの行は組み込み側が持つ</text>
    <text class="fg-m" x="512" y="76">members: member_id · email_address</text>
    <text class="fg-m" x="512" y="100">password_phc · full_name · locale_pref</text>
    <!-- three reads -->
    <text class="fg-lbl" x="32" y="168">境界を越える 3 つの読み取り</text>
    <text class="fg-tab fg-accent" x="928" y="168" text-anchor="end">op.WithUserStore</text>
    <rect class="fg-box fg-box--accent" x="32" y="184" width="896" height="144" rx="8"/>
    <path class="fg-rule" d="M32,232 H928 M32,280 H928"/>
    <text class="fg-m fg-accent" x="48" y="214">FindBySubject</text>
    <text class="fg-s" x="256" y="214">subject の member 行を読む — ID トークンと /userinfo の claim の出どころ</text>
    <text class="fg-m fg-accent" x="48" y="262">FindByUsername</text>
    <text class="fg-s" x="256" y="262">ログイン識別子を subject に変換する — ここでは email_address と照合する</text>
    <text class="fg-m fg-accent" x="48" y="310">ReadPasswordHash</text>
    <text class="fg-s" x="256" y="310">op.PrimaryPassword が検証できるよう password_phc を返す</text>
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

`store.UserStore` に属するのは `FindBySubject` だけで、残り 2 つは組み込みパスワードステップが必要とする `store.UserPasswordStore` のメソッドです。パスキーのみの構成なら `store.UserStore` だけを実装すれば足ります。

カラム名は自由です。この例では `member_id`、`email_address`、`password_phc`、`full_name`、`locale_pref`、`tenant_id` を `store.User.Subject` と `store.User.Claims` へ投影しています。

`op.WithUserStore` と `op.PrimaryPassword` には同じ値を渡してください。両者を別々に渡せるのは、ステップが claim の取得元とは別のものに対して認証する構成もありうるからです。ただし食い違いに気付かずに別々の値を渡すと何も失敗しません。ログインは成功し、一方のレコードから subject が解決され、ID トークンと `/userinfo` は別のレコードから組み立てられます。2 つの値が異なると `op.New` は警告をログに出します。

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

複数のサブストアを別バックエンドに振り分けたい場合、たとえば永続化が必要な grants / refresh tokens は SQL に置き、interactions / sessions は Redis に置く場合は [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) を使います。

## 実行

```sh
(cd examples/24-byo-userstore && GOWORK=off go run -tags example .)
```

この例は OP を `:8080`、ペアの RP を `:9090` で起動します。`demo@example.test` / `demo` でログインすると、RP の `/me` ページで開示された ID トークン claim を確認できます。

## 続きはこちら

- [SQL ストア](/ja/use-cases/sql-store) — OIDC レコードに使う同梱 SQL アダプタ。
- [MFA / ステップアップ](/ja/use-cases/mfa-step-up) — 組み込みパスワード、TOTP、captcha、ステップアップの接続。
- [カスタム認証器](/ja/use-cases/custom-authenticator) — SMS OTP やハードウェアトークンなど新しい認証要素を足す。
