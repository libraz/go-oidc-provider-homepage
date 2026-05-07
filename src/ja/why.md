---
title: go-oidc-provider とは
description: OIDC OP を自作するか、既製の重量級 IdP を Go サービスに組み合わせるか — それぞれのペインポイントと、このライブラリの立ち位置。
---

# go-oidc-provider とは

<div class="why-callout">

::: info このライブラリが生まれた理由
本ライブラリは個人開発の OSS です。作者がこれまで **他言語の OSS ライブラリで OIDC Provider を組み込んできた中で蓄積したペインポイント** — 「ここはスイッチひとつで切り替えられるべきなのに、そうなっていない」「廃れた既定値のままだと深刻なセキュリティホールになる」といった経験 — を、Go ライブラリとして再設計したものです。

組み込みやすくあるべき機能（二段階認証・パスキー・リスクベース認証・SPA 駆動・FAPI 2.0・i18n ほか）は **第一級として扱い**、廃れた危険な仕様（Implicit flow / ROPC / `alg=none` など）は **公開オプションすら持たない** 方針です。詳細は以下のセクションと [ユースケース](/ja/use-cases/) を参照してください。
:::

</div>

Go でサービスを書いていて、自前で OpenID Connect Provider を立てる必要に迫られる — つまり ID トークン・アクセストークンを発行し、`/authorize` と `/token` をホストし、discovery document に署名する立場になります。そういうときの選択肢は次の 3 つです。

| 選択肢 | 得られるもの | 引き受けるもの |
|---|---|---|
| **1. 自作する**<br>（`go-jose` + JWT ライブラリ） | サーフェスを完全にコントロールできる | あらゆる CVE リスクを自分で抱え込む — alg 混同、redirect URI 部分一致、PKCE ダウングレード、リフレッシュトークン再利用、cookie scope、同意 POST の CSRF、… |
| **2. 既製の重量級 IdP を前段に置く** | 運用機能が豊富 | ユーザテーブル・テンプレート・アップグレードのリズムを IdP 側に握られる。**自分の Go サービスは「相手プロダクトの組み込み先」に格下げされる。** |
| **3. `go-oidc-provider`** | プロトコルの責務はライブラリが持つ | ユーザアカウント・ストレージ・UI は自分で持ち込む |

このページでは選択肢 3 を、選択肢 1 や 2 でハマりがちなペインポイントを順に挙げながら説明します。

## ペインポイント → 解決策

### 「FAPI 2.0 をスイッチひとつで有効化したい」

PAR を動かし、後から JAR を思い出し、さらに discovery がまだ `client_secret_basic` を広告していることに気づき、最後にテスト用の経路だけ ID トークンを FAPI 外の alg で署名している — FAPI ではこの種のドリフトが高くつきます。

::: details FAPI 2.0 が要求するもの
FAPI 2.0 Baseline は **PAR**（RFC 9126）、**PKCE**（RFC 7636）、**送信者制約付きトークン**（DPoP RFC 9449 もしくは mTLS RFC 8705）、OP 発行物の **ES256** 署名、`redirect_uri` の **完全一致** を必須にしています。Message Signing はそれに加えて、**JAR**（RFC 9101）と **JARM** で authorize 要求 / 応答の非否認性を要求します。手で組むと、関連オプションが 6〜7 個、discovery の整合を保つべき箇所が 3 か所あります。
:::

`op.WithProfile(profile.FAPI2Baseline)` がプロファイル側の処理をまとめて行います — PAR + JAR の自動有効化、mTLS が明示されていない場合の DPoP 既定選択、`token_endpoint_auth_methods_supported` を FAPI allow-list との交差で絞り込み、OP 発行 JWT の署名を ES256 に保つところまで一括です。

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

重量級 IdP では、ユーザ保存がプロダクト境界に含まれがちです。ユーザを import する、同期する、相手の profile schema に合わせる、ログイン画面も相手の流儀に寄せる。既に Go サービス側にアカウントモデルがある場合、この形は相性がよくありません。

`op.WithStore(s store.Store)` は `store.AuthCodeStore` / `store.SessionStore` / `store.UserStore` などの小さなサブストア interface に接続するだけです。ライブラリは `users` テーブルを直接読み書きせず、すべて呼び出し側の Store 実装が担います。

```go
op.New(
  /* 必須オプション */
  op.WithStore(myStore),                // protocol state
  op.WithAuthenticators(passwordAuth),  // ユーザ検索は自前
)
```

参照アダプタは `inmem`、`sql`（SQLite / MySQL / Postgres）、`redis`（揮発サブストア）、`composite`（hot / cold スプリッタ）。DynamoDB は予定。

### 「同意 POST の Cookie / CSRF が地雷原」

難しいのは cookie ライブラリを選ぶことではありません。OAuth の session cookie を盗まれにくく、再利用されにくくするためのブラウザ規則をすべて覚え、login / consent / logout で同じ方針を保つことです。

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

### 「ログイン UI を SPA から駆動したい」

次に出すべき prompt はプロトコルエンジンが決めるべきです。一方で、その prompt をどう見せるかはフロントエンドが決めるべきです。この 2 つは別の仕事です。

`op.WithInteractionDriver(interaction.JSONDriver{})` でデフォルトの HTML driver を JSON 駆動に差し替えられます。SPA（React / Vue / Svelte / Angular など、フレームワーク不問）は `/interaction/{uid}` でプロンプトを取得し、署名済みレスポンスを返します。SPA shell は自前のルーターでマウントし、JSON state は OP に任せる構成です。

```go
op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)

router.Handle("/", spaAssets)
router.Handle("/oidc/", provider)
```

::: info UI マウントオプション
`op.WithSPAUI` / `WithConsentUI` / `WithChooserUI` は、OP-mounted SPA shell、独自同意 template、独自アカウント chooser template のための実行可能な経路です。低レベルに制御したい場合は `interaction.JSONDriver` を使い、SPA shell を自前 router から配信できます。
:::

::: info SPA-safe なエラー描画
エラーページは CSP `default-src 'none'; style-src 'unsafe-inline'` の下で `<div id="op-error" data-code="..." data-description="...">` を出力します。SPA ホストはマークアップを parse することなく `document.querySelector('#op-error')` で機械可読に拾えます。
:::

### 「『RFC に従っています』ではなく実適合の証拠が欲しい」

セキュリティレビューで問題になるのは、RFC 名を挙げられないことよりも、どの optional branch を実装し、どれを拒否し、conformance suite が実際に何を踏んだのかを示せないことです。

各リリースは OpenID Foundation の Conformance Suite に対して回帰検査されます。最新ベースライン（sha `ab23d3c`）:

| Plan | PASSED | REVIEW | SKIPPED | FAILED |
|---|---:|---:|---:|---:|
| oidcc-basic-certification-test-plan | 30 | 3 | 2 | **0** |
| fapi2-security-profile-id2-test-plan | 48 | 9 | 1 | **0** |
| fapi2-message-signing-id1-test-plan | 60 | 9 | 2 | **0** |
| **合計（3 plan、164 module）** | **138** | **21** | **5** | **0** |

::: tip REVIEW / SKIPPED の読み方
`REVIEW` は OFCS の「人間レビューが必要」判定で、エラーページで止まる挙動はそれが正しい姿です（[詳細](/ja/compliance/ofcs)）。`SKIPPED` は OP が設計上拒否しているケースです（例: `alg=none` の request object）。
:::

### 「リフレッシュトークンのローテーションを観測可能にしたい」

モバイルアプリが同じ refresh request をリトライしただけなら、grace window 内では冪等に同じ結果を返したい。一方で、古い refresh token が後から現れたなら、chain 全体を失効させ、なぜ起きたかを監査ログで説明したい。この 2 つは同時に必要です。

リフレッシュトークンはデフォルトでローテーションします。再利用が検知された場合は chain 全体を無効化します。

- `op.WithRefreshGracePeriod` — リトライが競合するクライアント向けに、ローテーション直後の猶予期間を広げる。
- `op.WithRefreshTokenOfflineTTL` — `offline_access` 付きリフレッシュトークン（ログイン状態の維持）の寿命を、通常のローテーションから分離する。

`token.issued` / `token.refreshed` 監査イベントは `extras` に `offline_access` フラグを乗せるので、SOC ダッシュボードで chain を分けて可視化できます。

```go
op.New(
  /* 必須オプション */
  op.WithRefreshGracePeriod(60*time.Second),
  op.WithRefreshTokenOfflineTTL(90*24*time.Hour),
  op.WithAuditLogger(auditLogger),
)
```

### 「メトリクスは欲しいけれど、頼んでもいない `/metrics` ルートはいらない」

ライブラリが observability route を勝手に mount すると、利用者側の router、認証境界、path 規約、SRE middleware と衝突しがちです。このライブラリはプロトコル上の signal だけを出し、それをどこで公開するかは組み込み側に委ねます。

`op.WithPrometheus(reg)` は絞り込んだ業務系カウンタを利用者の registry に登録します。ライブラリは `/metrics` を **マウントしません** — それはルーター側の仕事だからです。

同じ分離方針はトレーシング(外側で `otelhttp` をラップする)にも、HTTP リクエスト所要時間ヒストグラム(外側でミドルウェアをラップする)にも適用されます。

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
- [ユースケース](/ja/use-cases/) — `examples/` の build tag 付きファイルにリンクした、本番に近い構成例です。
