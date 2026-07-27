---
title: go-oidc-provider とは
description: OIDC OP を自作するか、既製の IdP を Go サービスに組み合わせるか。それぞれの難しさと、このライブラリの立ち位置。
pageClass: pg-why
---

# go-oidc-provider とは

<div class="why-callout">

::: info このライブラリが生まれた理由
本ライブラリは個人開発の OSS です。作者が他言語の OIDC Provider ライブラリを組み込む中で感じた不便さを、Go 向けに作り直したものです。たとえば「本来はオプション 1 つで切り替えたい機能が散らばっている」「古い既定値のままだと重大な脆弱性につながる」といった問題です。

二段階認証、パスキー、リスクベース認証、SPA 連携、FAPI 2.0、多言語化などは、後付けではなく最初から扱います。一方で、Implicit flow、ROPC、`alg=none` などの古く危険な仕様は、公開オプションとしても用意しません。詳細は以下の各節と [使い方](/ja/use-cases/) を参照してください。
:::

</div>

Go でサービスを書いていると、自前で OpenID Connect Provider を立てる必要が出ることがあります。つまり、ID トークンとアクセストークンを発行し、`/authorize` と `/token` を公開し、発見用 JSON（discovery 文書）を配信する立場になるということです。選択肢は大きく 3 つあります。

| 選択肢 | 得られるもの | 引き受けるもの |
|---|---|---|
| **1. 自作する**<br>（`go-jose` + JWT ライブラリ） | 挙動を細かく制御できる | 脆弱性リスクを自分で抱える。例: 署名アルゴリズム混同、redirect URI の部分一致、PKCE ダウングレード、リフレッシュトークン再利用、cookie の適用範囲ミス、同意 POST の CSRF |
| **2. 既製の IdP を前段に置く** | 運用機能が豊富 | ユーザテーブル、画面テンプレート、アップグレードの都合を IdP 側に合わせる必要がある。自分の Go サービスが、外部プロダクトの組み込み先になりやすい。 |
| **3. `go-oidc-provider`** | プロトコルの責務はライブラリが持つ | ユーザアカウント・ストレージ・UI は自分で持ち込む |

このページでは選択肢 3 を、選択肢 1 や 2 でつまずきやすい点と比べながら説明します。

<svg class="why-split" role="img" aria-labelledby="why-responsibility-title" viewBox="0 0 760 336" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="why-responsibility-title">go-oidc-provider の責務分担。ライブラリは OIDC と OAuth のプロトコル処理を担当し、組み込み側はユーザ、画面、保存先、HTTP ルーティングを担当する。</title>
  <defs>
    <marker id="why-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="24" y="28" width="246" height="88" rx="8"/>
  <text class="p" x="147" y="58" text-anchor="middle" font-size="15.5" font-weight="700">組み込み側</text>
  <text class="p sub" x="147" y="82" text-anchor="middle" font-size="11.5">ユーザ / UI / 保存先</text>
  <text class="m sub" x="147" y="100" text-anchor="middle" font-size="10.5">Authenticator · Store · Templates</text>
  <rect class="op" x="310" y="28" width="246" height="88" rx="8"/>
  <text class="p opf" x="433" y="58" text-anchor="middle" font-size="15.5" font-weight="700">go-oidc-provider</text>
  <text class="p sub" x="433" y="82" text-anchor="middle" font-size="11.5">OIDC / OAuth の手続き</text>
  <text class="m sub" x="433" y="100" text-anchor="middle" font-size="10.5">/authorize · /token · JWKS</text>
  <rect x="596" y="28" width="140" height="88" rx="8"/>
  <text class="p" x="666" y="58" text-anchor="middle" font-size="15.5" font-weight="700">RP / API</text>
  <text class="p sub" x="666" y="82" text-anchor="middle" font-size="11.5">利用アプリ</text>
  <text class="p sub" x="666" y="100" text-anchor="middle" font-size="10.5">トークンを検証</text>
  <path d="M270 72 H306" marker-end="url(#why-arrow)"/>
  <path d="M556 72 H592" marker-end="url(#why-arrow)"/>
  <rect class="soft" x="54" y="168" width="650" height="126" rx="8"/>
  <text class="p" x="92" y="196" font-size="13.5" font-weight="700">境界の考え方</text>
  <circle cx="98" cy="225" r="4" fill="currentColor"/>
  <text class="p" x="116" y="230" font-size="11.5">ライブラリ: トークン発行、署名、PKCE、CSRF、同意・ログアウトのプロトコル処理</text>
  <circle cx="98" cy="252" r="4" fill="currentColor"/>
  <text class="p" x="116" y="257" font-size="11.5">組み込み側: ユーザ検索、パスワード検証、画面、保存先、ルーターへのマウント</text>
  <circle cx="98" cy="279" r="4" fill="currentColor"/>
  <text class="p" x="116" y="284" font-size="11.5">危険な古い方式は公開せず、FAPI などのまとまった設定はプロファイルで固定</text>
</svg>

## つまずきやすい点への答え

### 「FAPI 2.0 をスイッチひとつで有効化したい」

PAR を有効化し、後から JAR が必要だと気づき、さらに discovery がまだ `client_secret_basic` を広告していることに気づき、最後にテスト用の経路だけ ID トークンを FAPI 外の alg で署名している。FAPI では、この種の設定ずれが高くつきます。

::: details FAPI 2.0 が要求するもの
FAPI 2.0 Baseline は **PAR**（RFC 9126）、**PKCE**（RFC 7636）、**送信者制約付きトークン**（DPoP RFC 9449 もしくは mTLS RFC 8705）、OP 発行物の **ES256** 署名、`redirect_uri` の **完全一致** を必須にしています。Message Signing ではさらに、**JAR**（RFC 9101）と **JARM** で authorize 要求 / 応答に署名します。手で組むと、関連オプションが 6〜7 個、discovery の整合を保つべき箇所が 3 か所あります。
:::

`op.WithProfile(profile.FAPI2Baseline)` がプロファイル側の処理をまとめて行います。PAR + JAR の自動有効化、mTLS が明示されていない場合の DPoP 既定選択、`token_endpoint_auth_methods_supported` の FAPI 許可リストへの絞り込み、OP 発行 JWT の ES256 固定まで一度に設定します。

```go
op.New(
  /* 必須オプション */
  op.WithProfile(profile.FAPI2Baseline),
  op.WithDPoPNonceSource(nonces),
)
```

::: tip 衝突は起動時に検出
プロファイルと矛盾するオプションを後から重ねるとコンストラクタが起動を拒否するので、不完全な FAPI 構成が本番に出ることはありません。
:::

### 「ユーザテーブルを奪われたくない」

既製の IdP では、ユーザの保存までプロダクト境界に含まれがちです。ユーザを取り込む、同期する、相手のプロフィール定義に合わせる、ログイン画面も相手の流儀に寄せる。既に Go サービス側にアカウントモデルがある場合、この形は扱いづらくなります。

`op.WithStore(s store.Store)` は `store.AuthorizationCodeStore` / `store.SessionStore` / `store.UserStore` などの小さな保存先インターフェースに接続するだけです。ライブラリは `users` テーブルを直接読み書きしません。プロトコル状態は adapter に置いたまま、既存テーブルから claim を読むにはアプリケーション側の `store.UserStore` を `op.WithUserStore(...)` に渡します。

```go
op.New(
  /* 必須オプション */
  op.WithStore(myStore),                 // プロトコル状態
  op.WithUserStore(applicationUsers),    // 既存 users テーブルから claim を読む
  op.WithLoginFlow(passwordLoginFlow),   // 同じレコードで認証
)
```

参照アダプタは `inmem`、`sql`（SQLite / MySQL / Postgres）、`redis`（揮発サブストア）、`dynamodb`（サブストアごとに 1 テーブル、Experimental）、`composite`（hot / cold スプリッタ）です。DynamoDB のプロビジョニング方式は [DynamoDB ストア](/ja/use-cases/dynamodb-store) を参照してください。

### 「同意 POST の Cookie / CSRF が地雷原」

難しいのは cookie ライブラリを選ぶことではありません。OAuth の session cookie を盗まれにくく、再利用されにくくするためのブラウザ規則を押さえ、login / consent / logout で同じ方針を保つことです。

::: warning ひとつ取りこぼすだけで CVE リスクに直結
`__Host-` prefix、Domain なし、Path=`/`、Secure、AES-256-GCM、double-submit CSRF、Origin / Referer チェック、適切な `SameSite` — どれかひとつ取りこぼすと、それだけで CVE 級の脆弱性に直結します。
:::

ライブラリ側で次が組み込み済みです。

- `__Host-` cookie prefix（Domain なし、Path=`/`、Secure）
- AES-256-GCM での暗号化（cookie 鍵を `op.WithCookieKeys` で渡す）
- 同意・ログアウト POST に対する double-submit CSRF と Origin / Referer チェック
- セッション cookie に `SameSite=Lax`、互換性が取れる箇所では `Strict`

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

### 「ログイン UI を SPA から扱いたい」

次に出すべき画面は、プロトコル処理側が決めるべきです。一方で、その画面をどう見せるかはフロントエンドが決めるべきです。この 2 つは分けて考える必要があります。

`op.WithSPAUI(op.SPAUI{...})` を使うと、標準の HTML 画面を、JSON で状態を受け渡しする SPA 向けの対話に差し替えられます。SPA の入口と静的ファイルも OP 側で公開できます。SPA（React / Vue / Svelte / Angular など）は `/interaction/{uid}` で次に表示すべき状態を取得し、署名済みレスポンスを返します。ライブラリは状態遷移を担当し、表示は SPA が担当します。

```go
op.New(
  /* 必須オプション */
  op.WithLoginFlow(flow),
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "./web/static",
  }),
)
```

::: info UI マウントオプション
`op.WithSPAUI` / `WithConsentUI` / `WithChooserUI` は、OP 側で SPA の入口を公開する構成、独自の同意テンプレート、独自のアカウント選択テンプレートを扱うためのオプションです。より細かく制御したい場合は `interaction.JSONDriver` を使い、SPA の配信を自前のルーターで行えます。実例は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) を参照してください。
:::

::: info SPA-safe なエラー描画
エラーページは CSP `default-src 'none'; style-src 'unsafe-inline'` の下で `<div id="op-error" data-code="..." data-description="...">` を出力します。SPA 側は HTML を解析せず、`document.querySelector('#op-error')` で機械可読な値を拾えます。
:::

### 「『RFC に従っています』ではなく実適合の証拠が欲しい」

セキュリティレビューで問題になるのは、RFC 名を挙げられないことよりも、任意仕様のどの分岐を実装し、どれを拒否し、適合性テストが実際にどの経路を検証したのかを示せないことです。

各リリースは OpenID Foundation の Conformance Suite に対して回帰検査されます。v1.0.0 のリリース snapshot（SHA `3ccc6bc`）は 9 plan 全体を対象にし、**209 PASSED**、**39 REVIEW**、**15 SKIPPED**、**6 FAILED**、**終端結果なし 2** でした。strict release verifier は blocker 0 と判定しています。failure と未判定はすべてレビュー済み・期限付き exclusion と照合されており、raw の全内訳と理由は [OFCS 適合状況](/ja/compliance/ofcs) で公開しています。

::: tip REVIEW / SKIPPED の読み方
`REVIEW` は OFCS の「人間レビューが必要」判定で、エラーページで止まる挙動はそれが正しい姿です（[詳細](/ja/compliance/ofcs)）。`SKIPPED` は OP が設計上拒否しているケースです（例: `alg=none` の request object）。raw の `FAILED` と未判定を黙って受け入れることはなく、release verifier を通すにはレビュー済みかつ期限内の exclusion と一致しなければなりません。
:::

### 「リフレッシュトークンのローテーションを観測可能にしたい」

モバイルアプリが同じリフレッシュ要求を再試行しただけなら、猶予期間内は同じ結果を返したい。一方で、古いリフレッシュトークンが後から現れたなら、連鎖全体を失効させ、なぜ起きたかを監査ログで説明したい。この 2 つは同時に必要です。

リフレッシュトークンは既定でローテーションします。再利用が検知された場合は連鎖全体を無効化します。

- `op.WithRefreshGracePeriod` — 再試行が競合するクライアント向けにローテーション直後の猶予期間を広げる。`FAPI2Baseline` と `FAPI2MessageSigning` では、明示設定された非ゼロ window が拒否されます。
- `op.WithRefreshTokenOfflineTTL` — `offline_access` 付きリフレッシュトークン（ログイン状態の維持）の寿命を、通常のローテーションから分離する。

`token.issued` / `token.refreshed` 監査イベントは `extras` に `offline_access` フラグを載せるので、SOC ダッシュボードで連鎖を分けて可視化できます。

```go
op.New(
  /* 必須オプション */
  op.WithRefreshGracePeriod(60*time.Second),
  op.WithRefreshTokenOfflineTTL(90*24*time.Hour),
  op.WithAuditLogger(auditLogger),
)
```

### 「メトリクスは欲しいけれど、頼んでもいない `/metrics` ルートはいらない」

ライブラリが観測用のルートを勝手にマウントすると、利用者側のルーター、認証境界、パス規約、SRE ミドルウェアと衝突しがちです。このライブラリはプロトコル上の信号だけを出し、それをどこで公開するかは組み込み側に委ねます。

`op.WithPrometheus(reg)` は絞り込んだ業務系カウンタを利用者のレジストリに登録します。ライブラリは `/metrics` を **公開しません**。それはルーター側の仕事だからです。

同じ分離方針はトレーシング（外側で `otelhttp` をラップする）にも、HTTP リクエスト所要時間ヒストグラム（外側でミドルウェアをラップする）にも適用されます。

```go
reg := prometheus.NewRegistry()
provider, _ := op.New(
  /* 必須オプション */
  op.WithPrometheus(reg),
)

router.Handle("/oidc/", provider)
router.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
```

## このライブラリではないもの

::: warning 意図的にスコープ外
- **IdP ではありません。** ユーザを保存することも、パスワードをハッシュすることも、メールを送信することもありません。ユーザモデルと `op.Authenticator` は呼び出し側の責任です。TOTP 用のステップは同梱していますが、パスワード検証は呼び出し側の実装です。
- **汎用 OAuth 2.0 フレームワークではありません。** OpenID Connect Core 1.0 と FAPI 2.0 系列を主な対象にしています。OAuth 2.0 単体の構成は `op.WithOpenIDScopeOptional` で表現できますが、設計は OIDC 寄りに寄せています。
- **UI キットではありません。** 標準の HTML driver は無設定でも OP を起動できるよう同梱しているだけで、本番運用する組み込み側は独自テンプレートか SPA を持ち込む前提です。
:::

## 次に読むもの

- [OAuth 2.0 / OIDC 入門](/ja/concepts/oauth2-oidc-primer) — 「client_credentials」や「authorization_code + PKCE」が初耳なら、まずここから。
- [クイックスタート](/ja/getting-started/install) — 30 行で最小 OP を立ち上げます。
- [使い方](/ja/use-cases/) — `examples/` の build tag 付きファイルにリンクした、本番に近い構成例です。
