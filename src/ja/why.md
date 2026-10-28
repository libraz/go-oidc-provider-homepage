---
title: go-oidc-provider とは
description: OIDC OP を自作するか、既製の IdP を Go サービスに組み合わせるか。それぞれの難しさと、このライブラリの立ち位置。
pageClass: pg-why
---

# go-oidc-provider とは

<div class="why-callout">

::: info このライブラリが生まれた理由
本ライブラリは個人開発の OSS です。作者が他言語の OIDC Provider ライブラリを組み込む中で感じた不便さを、Go 向けに作り直したものです。たとえば「本来はオプション 1 つで切り替えたい機能が散らばっている」「古い既定値のままだと重大な脆弱性につながる」といった問題です。

二段階認証、パスキー、リスクベース認証、SPA 連携、FAPI 2.0、多言語化などは、後付けではなく最初から扱います。一方で、Implicit flow、ROPC、`alg=none` などの古く危険な仕様は、公開オプションとしても用意しません。詳細は以下の各節と [ユースケース](/ja/use-cases/) を参照してください。
:::

</div>

Go でサービスを書いていると、自前で OpenID Connect Provider を立てる必要が出ることがあります。ID トークンとアクセストークンを発行し、認可エンドポイントとトークンエンドポイントを公開し、discovery 文書を配信する立場になる、ということです。選択肢は大きく 3 つあります。

| 選択肢 | 得られるもの | 引き受けるもの |
|---|---|---|
| **1. 自作する**<br>（`go-jose` + JWT ライブラリ） | 挙動を細かく制御できる | 脆弱性リスクを自分で抱える。例: 署名アルゴリズム混同、redirect URI の部分一致、PKCE ダウングレード、リフレッシュトークン再利用、cookie の適用範囲ミス、同意 POST の CSRF |
| **2. 既製の IdP を前段に置く** | 運用機能が豊富 | ユーザテーブル、画面テンプレート、アップグレードの都合を IdP 側に合わせる必要がある。自分の Go サービスが、外部プロダクトの組み込み先になりやすい。 |
| **3. `go-oidc-provider`** | プロトコルの責務はライブラリが持つ | ユーザアカウント・ストレージ・UI は自分で持ち込む |

以降では、選択肢 1 や 2 でつまずきやすい点と、このライブラリがそれぞれにどう答えるかを見ていきます。

<figure class="fig">
  <div class="fig-head">どこを誰が持つか</div>
  <svg class="fig-svg" role="img" aria-labelledby="why-split-title" viewBox="0 0 960 176" xmlns="http://www.w3.org/2000/svg">
    <title id="why-split-title">責務の分担を示した図。組み込み側がユーザ・画面・保存先を持ち、ライブラリが OIDC と OAuth の手続きを担い、利用側のアプリはトークンを検証するだけです。</title>
    <!-- column labels -->
    <text class="fg-lbl" x="32" y="40">組み込み側が持つ</text>
    <text class="fg-lbl fg-accent" x="344" y="40">ライブラリが持つ</text>
    <text class="fg-lbl" x="656" y="40">利用側が持つ</text>
    <!-- your application -->
    <rect class="fg-box" x="32" y="56" width="272" height="96" rx="8"/>
    <text class="fg-t" x="48" y="84">組み込み側のアプリ</text>
    <text class="fg-s" x="48" y="108">ユーザ · 画面 · 保存先</text>
    <text class="fg-mxs" x="48" y="132">Authenticator · Store</text>
    <path class="fg-edge" d="M304,104 H344" marker-end="url(#fg-a)"/>
    <!-- the library -->
    <rect class="fg-box fg-box--accent" x="344" y="56" width="272" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="360" y="84">go-oidc-provider</text>
    <text class="fg-s" x="360" y="108">OIDC / OAuth の手続き</text>
    <text class="fg-mxs" x="360" y="132">/auth · /token · /jwks</text>
    <path class="fg-edge" d="M616,104 H656" marker-end="url(#fg-a)"/>
    <!-- the consuming application -->
    <rect class="fg-box" x="656" y="56" width="272" height="96" rx="8"/>
    <text class="fg-t" x="672" y="84">RP / API</text>
    <text class="fg-s" x="672" y="108">利用するアプリケーション</text>
    <text class="fg-s" x="672" y="132">渡されたトークンを検証する</text>
  </svg>
  <figcaption class="fig-note">本ライブラリはユーザテーブルもログイン画面もデータベースも要求しません。要求するのはインタフェースです。移行を強いる製品と、組み込むライブラリの違いはここにあります。</figcaption>
</figure>

境界の引き方は次の 3 点です。

- **ライブラリの担当**: トークン発行、署名、PKCE、CSRF、同意とログアウトの手続き。
- **組み込み側の担当**: ユーザ検索、パスワード検証、画面、保存先、ルータへのマウント。
- **危険な古い方式はどちらの側からも有効化できません。** 公開オプションとして用意しておらず、FAPI などのまとまった設定はプロファイルで固定されます。

## つまずきやすい点への答え

| つまずく点 | ライブラリの答え | 該当節 |
|---|---|---|
| FAPI 2.0 の設定が複数箇所でずれる | `op.WithProfile(profile.FAPI2Baseline)` | [スイッチひとつ](#fapi) |
| ユーザテーブルを動かせない | `op.WithUserStore` と自前のストア | [ユーザテーブル](#users-table) |
| cookie と CSRF の細部 | 32 バイト鍵 1 つで決まる固定の方式 | [cookie](#cookies) |
| SPA でのログイン UI | `op.WithSPAUI` または JSON driver | [SPA](#spa) |
| 「RFC に従っています」は証拠にならない | リリースごとの適合性テストの実行 | [適合性](#conformance) |
| リフレッシュトークンの盗難と再試行の集中 | 猶予期間付きのローテーションと再利用検知 | [ローテーション](#rotation) |
| 頼んでいない `/metrics` ルート | ルートは作らず、利用者のレジストリにカウンタを登録 | [メトリクス](#metrics) |

### 「FAPI 2.0 をスイッチひとつで有効化したい」 {#fapi}

まず PAR を有効化し、後から JAR も必要だと気づき、さらに discovery がまだ `client_secret_basic` を広告していることに気づき、最後にテスト用の経路だけ ID トークンがプロファイルの許可リスト外の alg で署名されていた、という順で発覚しがちです。FAPI では、この種の設定ずれが高くつきます。

::: details FAPI 2.0 が要求するもの
FAPI 2.0 Security Profile（Final）が要求するのは **PAR**（RFC 9126）、**S256 の PKCE**（RFC 7636）、DPoP（RFC 9449）または mTLS（RFC 8705）による**送信者制約付きトークン**です。本ライブラリはポリシーとして `redirect_uri` の完全一致も適用しますが、FAPI 2.0 §5.5 は完全一致する値の事前登録を要求していません。JAR と OP 発行 JWT の ES256 固定は、本ライブラリの `profile.FAPI2Baseline` が採用する設定で、FAPI Security Profile 自体の必須要件ではありません。本ライブラリでは Message Signing が署名付き認可応答の **JARM** を追加します。プロファイルを使うことで、discovery と実装の設定も揃います。
:::

`op.WithProfile(profile.FAPI2Baseline)` が本ライブラリのプロファイル方針をまとめて適用します。PAR + JAR の有効化、mTLS が明示されていない場合の DPoP 既定選択、`token_endpoint_auth_methods_supported` のプロファイル許可リストへの絞り込み、OP 発行 JWT の ES256 固定まで一度に設定します。

```go
op.New(
  /* 必須オプション */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithProfile(profile.FAPI2Baseline),
  op.WithDPoPNonceSource(nonces),
)
```

::: tip 衝突は起動時に検出
コンストラクタは、起動時に検出できるオプションの矛盾や必要な依存設定の不足を拒否します。ただし、現行の FAPI 2.0 Final 仕様の全要件への適合を保証するものではありません。[RFC 対応表](/ja/compliance/rfc-matrix) を確認してください。
:::

### 「ユーザテーブルを奪われたくない」 {#users-table}

既製の IdP では、ユーザの保存までプロダクト境界に含まれがちです。ユーザを取り込む、同期する、相手のプロフィール定義に合わせる、ログイン画面も相手の流儀に寄せる。既に Go サービス側にアカウントモデルがある場合、この形は扱いづらくなります。

`op.WithStore(s store.Store)` は `store.AuthorizationCodeStore` / `store.SessionStore` / `store.UserStore` などの小さな保存先インターフェースに接続するだけです。ライブラリは `users` テーブルを直接読み書きしません。プロトコル状態は adapter に置いたまま、既存テーブルから claim を読むにはアプリケーション側の `store.UserStore` を `op.WithUserStore(...)` に渡します。

```go
op.New(
  /* 必須オプション */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(passwordLoginFlow),
  op.WithStore(myStore),                 // プロトコル状態
  op.WithUserStore(applicationUsers),    // 既存 users テーブルから claim を読む
)
```

参照アダプタは `inmem`、`sql`（SQLite / MySQL / Postgres）、`redis`（揮発サブストア）、`dynamodb`（サブストアごとに 1 テーブル、Experimental）、`composite`（hot / cold スプリッタ）です。DynamoDB のプロビジョニング方式は [DynamoDB ストア](/ja/use-cases/dynamodb-store) を参照してください。

### 「同意 POST の Cookie / CSRF が地雷原」 {#cookies}

難しいのは cookie ライブラリを選ぶことではありません。OAuth の session cookie を盗まれにくく、再利用されにくくするためのブラウザ規則を押さえ、ログイン・同意・ログアウトのすべてで同じ規則を適用しきることです。

::: warning ひとつ取りこぼすだけで CVE リスクに直結
`__Host-` prefix、Domain なし、Path=`/`、Secure、AES-256-GCM、double-submit CSRF、Origin / Referer チェック、適切な `SameSite` — どれかひとつ取りこぼすと、それだけで CVE 級の脆弱性に直結します。
:::

ライブラリ側で次が組み込み済みです。

- `__Host-` cookie prefix（Domain なし、Path=`/`、Secure）
- AES-256-GCM での暗号化（cookie 鍵を `op.WithCookieKeys` で渡す）
- 同意・ログアウト POST に対する double-submit CSRF と Origin / Referer チェック
- セッション cookie は `SameSite=Lax`、CSRF cookie は `SameSite=Strict`

これらを自前で書く必要はありません。32 バイト鍵を生成して `WithCookieKeys` に渡せば、cookie の構成は正しい状態で立ち上がります。

```go
cookieKey := make([]byte, 32)
if _, err := rand.Read(cookieKey); err != nil {
  return err
}

op.New(
  /* 必須オプション */
  op.WithCookieKeys(cookieKey),
)
```

### 「ログイン UI を SPA から扱いたい」 {#spa}

次に出す画面を決めるのはプロトコル処理側の仕事で、その画面をどう見せるかはフロントエンドの仕事です。この 2 つは分けて考える必要があります。

`op.WithSPAUI(op.SPAUI{...})` を使うと、標準の HTML 画面を、JSON で状態を受け渡しする SPA 向けの対話に差し替えられます。SPA の入口と静的ファイルも OP 側で公開できます。SPA（React / Vue / Svelte / Angular など）は `LoginMount/state/{uid}` から次に表示すべき状態を JSON で取得し、入力結果を POST で返します。状態遷移はライブラリが担当し、表示は SPA が担当します。

```go
op.New(
  /* 必須オプション */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(flow),
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "../internal/webui/static",
  }),
)
```

::: info UI マウントオプション
`op.WithSPAUI` / `WithConsentUI` / `WithChooserUI` は、OP 側で SPA の入口を公開する構成、独自の同意テンプレート、独自のアカウント選択テンプレートを扱うためのオプションです。より細かく制御したい場合は `interaction.JSONDriver` を使い、SPA の配信を自前のルータで行えます。実例は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) を参照してください。
:::

::: info SPA-safe なエラー描画
エラーページは CSP `default-src 'none'; style-src 'unsafe-inline'` の下で `<div id="op-error" data-code="..." data-description="...">` を出力します。SPA 側は HTML を解析せず、`document.querySelector('#op-error')` で機械可読な値を拾えます。
:::

### 「『RFC に従っています』ではなく実適合の証拠が欲しい」 {#conformance}

セキュリティレビューが止まる理由は、RFC 名を挙げられないことではありません。任意仕様のどの分岐を実装し、どれを拒否したのか、そして適合性テストが実際にどの経路を検証したのかを示せないことです。

各リリースは OpenID Foundation の Conformance Suite に対して回帰検査されます。最新リリース run の raw 内訳、レビュー理由、blocker 判定は [OFCS 適合状況](/ja/compliance/ofcs) にまとめています。

::: tip REVIEW / SKIPPED の読み方
`REVIEW` は OFCS の「人間レビューが必要」判定で、エラーページで止まる挙動はそれが正しい姿です（[詳細](/ja/compliance/ofcs)）。`SKIPPED` は OP が設計上拒否しているケースです（例: `alg=none` の request object）。raw の `FAILED` と未判定を黙って受け入れることはなく、release verifier を通すにはレビュー済みかつ期限内の exclusion と一致しなければなりません。
:::

### 「リフレッシュトークンのローテーションを観測可能にしたい」 {#rotation}

モバイルアプリが同じリフレッシュ要求を再試行しただけなら、猶予期間内は同じ結果を返すのが望ましい挙動です。一方、古いリフレッシュトークンが後から現れた場合は、連鎖全体を失効させ、その理由を監査ログに残す必要があります。この 2 つを同時に満たすことが目標になります。

リフレッシュトークンは既定でローテーションします。ローテーション済みのトークンが猶予期間を過ぎて提示されると、OP は盗難とみなし（RFC 9700 §2.2.2）、そのリフレッシュ連鎖と、その grant で発行済みのアクセストークンをすべて失効させます。`/revoke` で単一のリフレッシュトークンを失効させる場合はもっと狭く、そのトークンの連鎖だけを止めるので、ユーザの他の端末のリフレッシュトークンは有効なままです。ローテーションはライブラリのポリシーです。現行の FAPI 2.0 Security Profile §5.3.2.1(9) は例外的な状況を除く通常のローテーションを禁止しているため、この既定動作だけで Final 仕様への適合は示せません。

- `op.WithRefreshGracePeriod` — 再試行が競合するクライアント向けにローテーション直後の猶予期間を広げる。本ライブラリの `profile.FAPI2Baseline` と `profile.FAPI2MessageSigning` では 0 秒から 60 秒まで（60 秒を含む）の明示設定が許容され、60 秒を超える値だけが拒否されます。
- リフレッシュのローテーションでは、提示トークンを消費する前に実効 scope をクライアントの現在の登録と再照合するため、登録を狭めると既存の連鎖にも反映されます。
- `op.WithRefreshTokenOfflineTTL` — `offline_access` 付きリフレッシュトークン（ログイン状態の維持）の寿命を、通常のローテーションから分離する。

`token.issued` / `token.refreshed` 監査イベントは `extras` に `offline_access` フラグを載せるので、SOC ダッシュボードで連鎖を分けて可視化できます。

```go
op.New(
  /* 必須オプション */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithRefreshGracePeriod(60*time.Second),
  op.WithRefreshTokenOfflineTTL(90*24*time.Hour),
  op.WithAuditLogger(auditLogger),
)
```

### 「メトリクスは欲しいけれど、頼んでもいない `/metrics` ルートはいらない」 {#metrics}

ライブラリが観測用のルートを勝手にマウントすると、利用者側のルータ、認証境界、パス規約、SRE ミドルウェアと衝突しがちです。このライブラリはプロトコル上の信号だけを出し、それをどこで公開するかは組み込み側に委ねます。

`op.WithPrometheus(reg)` は絞り込んだ業務系カウンタを利用者のレジストリに登録します。ライブラリは `/metrics` を **公開しません**。それはルータ側の仕事だからです。

同じ分離方針はトレーシング（外側で `otelhttp` をラップする）にも、HTTP リクエスト所要時間ヒストグラム（外側でミドルウェアをラップする）にも適用されます。

```go
reg := prometheus.NewRegistry()
provider, _ := op.New(
  /* 必須オプション */
  op.WithCookieKeys(cookieKey),
  op.WithLoginFlow(loginFlow),
  op.WithPrometheus(reg),
)

router.Handle("/oidc/", provider)
router.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
```

## このライブラリではないもの

::: warning 意図的にスコープ外
- **IdP ではありません。** ユーザを保存することも、パスワードをハッシュすることも、メールを送信することもありません。ユーザモデルと `op.Authenticator` は組み込み側の責務です。TOTP 用のステップは同梱していますが、パスワード検証は組み込み側の実装です。
- **汎用 OAuth 2.0 フレームワークではありません。** OpenID Connect Core 1.0 と FAPI 2.0 系列を主な対象にしています。OAuth 2.0 単体の構成は `op.WithOpenIDScopeOptional` で表現できますが、設計は OIDC 寄りに寄せています。
- **UI キットではありません。** 標準の HTML driver は無設定でも OP を起動できるよう同梱しているだけで、本番運用する組み込み側は独自テンプレートか SPA を持ち込む前提です。
:::

## 次に読むもの

- [OAuth 2.0 / OIDC 入門](/ja/concepts/oauth2-oidc-primer) — 「client_credentials」や「authorization_code + PKCE」が初耳なら、まずここから。
- [クイックスタート](/ja/getting-started/install) — 30 行で最小 OP を立ち上げます。
- [ユースケース](/ja/use-cases/) — `examples/` の build tag 付きファイルにリンクした、本番に近い構成例です。
