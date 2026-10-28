---
title: カスタム同意 UI
description: op.WithConsentUI、ロケール bundle、JSON ドライバで、provider の CSP 制約と ceremony の origin ルールを守りながら同意画面をカスタマイズします。
---

# ユースケース — カスタム同意 UI

## OIDC における「同意（consent）」とは

ユーザが認証を済ませたあと、OIDC Core 1.0 §3.1.2.4 は、情報を開示する前に OP が認可の判断を得ることを求めています。方法の 1 つが、要求された scope（`profile`、`email` など RP が挙げたもの）を **RP ではなくユーザ本人が** 許可または拒否する対話画面です。事前の管理者同意など、確立した別の条件で判断を示す方法も認められています。このページでは、ログインと RP へのリダイレクトの間でライブラリが表示する同意画面を扱います。OP がいつ同意画面を出し、いつ以前の答えを記憶しているかは [同意](/ja/concepts/consent) にあります。

同梱の同意画面でも動きますが、実運用ではロゴ、文言、プライバシーポリシーや利用規約へのリンク、対応言語を自社のものに差し替えたくなります。必要な範囲に合わせて、いちばん軽い経路を選んでください。

| 変えたいもの | 使うもの | OP が持ち続けるもの |
|---|---|---|
| 文言だけ（言い回し、翻訳） | 経路 1: `op.WithLocale` | 同梱の HTML、CSP、CSRF |
| ページのマークアップ（サーバ描画） | 経路 2: `op.WithConsentUI` | state、CSRF、同意の永続化 |
| すべて（SPA で描画） | 経路 3: `interaction.JSONDriver` または `op.WithSPAUI` | state、CSRF、同意の永続化 |

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4（認可判断と同意）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.1（認可エンドポイント）
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice（CSRF 緩和など）
:::

::: details 用語の補足
- **同意画面**: ログインと「code を付けた RP への戻り」の間に表示され、ユーザが特定の RP の要求する scope を承認する画面です。RP が何を求めるかを決め、ユーザが開示するかどうかを決めます。
- **CSRF トークン**: フォームに埋め込む秘密値で、悪意あるサイトがユーザのブラウザに同意画面の「承認」を送らせる攻撃を防ぎます。発行と検証は OP の責任で、テンプレートや SPA の役目は、POST 本文（`csrf_token`）または `X-CSRF-Token` ヘッダにそのまま戻すことだけです。
- **Content Security Policy（CSP）**: ページが読み込んでよいリソースの種類をブラウザに伝えるレスポンスヘッダ（`Content-Security-Policy: default-src 'none'; ...`）です。OP は同梱の同意画面を、script、inline のイベントハンドラ、外部アセットを禁じる厳格な既定のポリシーで配信するので、悪意ある RP の `client_name` が XSS に化けることはありません。
:::

## 経路 1 — ロケール bundle の上書き（文言と翻訳の調整）

文言だけを変えたい場合（ブランドの言い回し、翻訳、部分的な訳文）は、`op.WithLocale` で seed の `en` / `ja` bundle にキー単位で重ねるのが最短です。同梱の同意画面は、重ねた bundle をそのまま使います。同意画面が読むのは、`consent.title` と `consent.subtitle`（どちらも `{client_name}` プレースホルダを使えます）、`consent.button.allow`、`consent.scope_required` です。

```go
brandJa, _ := op.LocaleBundleFromMap("ja", map[string]string{
  "consent.title":    "{client_name} へのアクセス許可",
  "consent.subtitle": "{client_name} が次の情報へのアクセスを求めています。",
})

op.New(
  /* 必須オプション */
  op.WithLocale(brandJa),
)
```

scope の行は bundle のキーではありません。各行には、登録した `op.Scope` の scope 名と `Description` が、既定の言語のまま表示されます。`Scope.I18n` は保持されますが、同意の prompt はこれを読みません。scope の説明を翻訳して見せたい場合は、自前のテンプレート（経路 2）か SPA（経路 3）で、scope 名をキーにして引いてください。

キーの一覧と OP がロケールを選ぶ手順は [i18n / ロケール解決](/ja/use-cases/i18n) にあります。この経路では、同梱の HTML ドライバ、CSP、CSRF と cookie の仕組みをそのまま使えます。

## 経路 2 — カスタム同意テンプレート（サーバ描画）

ブランド付きの HTML を使いつつ、state、CSRF、同意の永続化は OP に任せたい場合は、parse 済みの `*html/template.Template` を `op.WithConsentUI` で渡します。テンプレートには `interaction.ConsentTemplateData` が渡されます。参照できるのは `Client`（名前、ロゴ、ポリシーと利用規約の URL）、`Scopes`（各 scope の `Name`、`Description`、`Required`）、`StateRef`、`CSRFToken`、`ApprovedScopesField`、`SubmitMethod`、`SubmitAction` です。

```go
tmpl := template.Must(template.ParseFiles("consent.html"))

op.New(
  /* 必須オプション */
  op.WithConsentUI(op.ConsentUI{Template: tmpl}),
)
```

テンプレートが描画するフォームは、`SubmitAction` に 3 つの値を POST しなければなりません。`state_ref`、`csrf_token`、そして `ApprovedScopesField`（`approved_scopes`）という名前のフィールドで、承認した scope 名をスペースで連結した値を入れます。[`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) のように、1 つのボタンで要求されたすべての scope を承認するテンプレートは、すべての scope 名を送ります。scope ごとのチェックボックスにするなら、連結した値を組み立てるクライアント側のスクリプトが必要です。同梱の画面に拒否ボタンがないのも同じ理由です。必須の scope は外せません。送信にそれが含まれていなければ、OP は 4xx で応答します。

`op.WithConsentUI` は 1 回だけ呼べます。`op.WithSPAUI` と同時には使えず、どちらの場合も `op.New` が失敗します。

::: warning 言語は 1 つに固定される
`ConsentTemplateData` にはロケールもメッセージ bundle も入っていないため、カスタムテンプレートは単一の言語でしか描画できません。複数の言語が要るなら、言語の選択をテンプレート側で行うか、解決済みの `locale` を prompt に載せる JSON ドライバを使ってください。
:::

### カスタムテンプレートの CSP

`op.ConsentUI` には `ContentSecurityPolicy` フィールドがあります。空文字なら、ライブラリの既定値（`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`）を使います。この既定値はサブリソースをすべて禁じます。スタイルシート、ロゴ、Web フォントを読み込むテンプレートはスタイルの当たらない見た目になりますが、ブロックするのはブラウザなので、OP 側には失敗が見えません。

空でない値は、`op.New` の実行時に `interaction.NormalizeCSP` で正規化されます。テンプレートが必要とする `style-src`、`img-src`、`font-src`、`script-src` は追加できます。例外は次のとおりです。

- `form-action` は拒否されます。ブラウザは `form-action` をリダイレクト先にも適用するため、同意の成功時に行われる cross-origin のリダイレクトが止まってしまうからです。
- `frame-ancestors` と `base-uri` は、指定する場合は厳密に `'none'` でなければなりません。省略すれば OP が追加します。
- カンマ、制御文字、非 ASCII のバイトは拒否されます。

拒否されたポリシーは、`interaction.ErrCSPNotPermitted` で `op.New` を失敗させます。

script の許可は、信頼の判断です。ページには CSRF トークンと continuation state が含まれるため、そのページで動く script は、ユーザなしで同意を完了できます。`html/template` のエスケープは RP の表示名などの値を守りますが、任意の script 実行を無害にはしません。ブランド付けに必要なのは `style-src`、`img-src`、`font-src` で、`script-src` ではありません。

## 経路 3 — JSON ドライバ（マークアップを完全に自前で持つ）

レイアウト、ブランドアセット、フレームワークによる描画など、マークアップごと自前で持ちたい場合は、JSON ドライバに切り替えます。OP は同意の prompt を JSON で返し、自前のページまたは SPA がそれを描画して、ユーザの選択を POST で送り返します。`ConsentScopePromptData` には JSON タグがないため、メンバー名は大文字で始まります。

```json
{
  "type": "consent.scope",
  "data": {
    "Scopes": [{"Name": "openid", "Description": "...", "Required": true}, {"Name": "email", "Description": "...", "Required": false}],
    "Client": {"ClientID": "demo-spa", "Name": "Demo", "LogoURL": "", "ClientURI": "", "PolicyURI": "", "TosURI": ""}
  },
  "state_ref": "...",
  "csrf_token": "...",
  "locale": "ja"
}
```

SPA は `{ "state_ref": "...", "values": { "approved_scopes": "openid email" } }` を POST で返します。リクエスト全体を拒否する場合は、同じ interaction の URL に `DELETE` を送ります。

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

SPA は prompt の `csrf_token` を `X-CSRF-Token` ヘッダにコピーして送ります。OP はそれを `__Host-oidc_csrf` cookie と照合します（double-submit パターン）。全体の流れは [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) で説明しています。

## どの経路でも書かなくていい部分

| 関心事 | OP が持つ |
|---|---|
| CSRF トークンの生成と検証 | yes |
| POST の Origin / Referer チェック | yes |
| Cookie の scope（`__Host-`、`Secure`、`SameSite`） | yes |
| セッションの参照と同意の永続化 | yes |
| 承認後の RP へのリダイレクト | yes |

経路 1 は、同梱の CSP と HTML をそのまま使います。経路 2 では、`ConsentUI.ContentSecurityPolicy` にアセットの origin を宣言します。RP へのリダイレクトのために `form-action` を足してはいけません。経路 3 では、自前のページが必要な CSP を自分で設定します。

OP は、POST の `Origin` / `Referer` を、issuer の origin と `op.WithCORSOrigins` で渡した origin に対して照合します。クライアントの `redirect_uri` の origin は対象に含まれないため、別のクライアントの origin にあるページが interaction や end-session の state を送信することはできません。

## 続きはこちら

- [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) — JSON ドライバ上のフル SPA 構成。
- [i18n / ロケール解決](/ja/use-cases/i18n) — ロケール bundle の上書き経路。
- [SPA 向け CORS](/ja/use-cases/cors-spa) — フロントエンドが別 origin のとき。
