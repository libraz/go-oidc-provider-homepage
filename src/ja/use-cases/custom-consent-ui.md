---
title: カスタム同意 UI
description: op.WithConsentUI、ロケール bundle、JSON ドライバで、provider の CSP 制約と ceremony の origin ルールを守りながら同意画面をカスタマイズします。
---

# 使い方 — カスタム同意 UI

## OIDC における「同意（consent）」とは

ユーザが認証を済ませたあと、OIDC Core 1.0 §3.1.2.4 は、情報を開示する前に OP が認可判断を得ることを求めています。要求された scope（`profile` / `email` 等）を **RP ではなくユーザ本人が** 許可または拒否する対話 UI は、その方法の 1 つです。仕様は、事前の管理者同意やその他の確立した条件で判断を示す方法も認めています。本ページでは、ログインとリダイレクトの間でライブラリが表示する対話型同意 UI を扱います。

OP 同梱の同意画面でもひと通り動きますが、実運用では独自ブランド（ロゴ・コピー・プライバシー / 利用規約リンク・i18n）に差し替えたくなります。小さな文言差し替えはロケール bundle、サーバ描画の独自 HTML は `op.WithConsentUI`、SPA での完全制御は JSON ドライバが向いています。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4（認可判断と同意）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.1(authorization endpoint)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice(CSRF 緩和等)
:::

::: details 用語の補足
- **同意画面** — OP が対話形式を使う場合に、ログインと redirect-back-with-code の間でユーザが特定の RP の要求 scope を承認する画面です。OP が「何を訊くか」を決め、ユーザが「開示するか」を決めます。
- **CSRF トークン** — セッションに紐づく秘密値で、悪意ある第三者サイトが同意画面の「承認」をユーザのブラウザに肩代わりさせる攻撃を防ぎます。発行と検証は OP の責任で、SPA / テンプレート側の役目は POST 本文または `X-CSRF-Token` ヘッダにそのまま戻すことだけです。
- **Content Security Policy(CSP)** — ページが読み込んでよいリソース種別をブラウザに伝えるレスポンスヘッダ（`Content-Security-Policy: default-src 'none'; ...`）。OP は同梱同意画面を、`<script>`、inline イベントハンドラ、外部アセットを禁じる厳格な既定 CSP で描画するので、悪意ある RP の `client_name` が XSS に化けることはありません。
:::

## 経路 1 — ロケール bundle 上書き（コピー / i18n の調整）

文言だけを変えたいケース（翻訳コピー、ブランドトーン、部分的な訳文）では、`op.WithLocale` で seed の `en` / `ja` bundle にキー単位で重ねるのが最短です。同梱の同意画面は重ねた bundle をそのまま使います。

```go
brandJa, _ := op.LocaleBundleFromMap("ja", map[string]string{
  "consent.title":                       "Acme へのアクセス許可",
  "consent.scope.profile.description":   "プロフィール情報の参照",
})

op.New(
  /* 必須オプション */
  op.WithLocale(brandJa),
)
```

bundle のキーは描画される表示面に追従します。一覧と優先順序の解決ルールは [使い方: i18n / ロケール解決](/ja/use-cases/i18n) を参照してください。

この経路では同梱 HTML ドライバ・同梱 CSP・同梱の CSRF / cookie scheme をそのまま使えます。変えるのは文言だけです。

## 経路 2 — カスタム同意テンプレート（サーバ描画）

ブランド付き HTML を持ちつつ、state・CSRF・同意の永続化は OP に任せたい場合は、parse 済みの `*html/template.Template` を `op.WithConsentUI` で渡します。テンプレートには `interaction.ConsentTemplateData` が渡され、`Client`、`Scopes`、`StateRef`、`CSRFToken`、`ApprovedScopesField`、`SubmitMethod`、`SubmitAction` を参照できます。

```go
tmpl := template.Must(template.ParseFiles("consent.html"))

op.New(
  /* 必須オプション */
  op.WithConsentUI(op.ConsentUI{Template: tmpl}),
)
```

form field の形は [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui) を参照してください。

### カスタムテンプレートの CSP

`op.ConsentUI` には `ContentSecurityPolicy` field があります。空文字なら、ライブラリの既定値（`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`）を使います。この既定値は、ブランド用 asset を読み込むテンプレートには意図的に厳しすぎるため、必要な `style-src`、`img-src`、`font-src`、`script-src` を含む policy を設定できます。`op.New` の構築時に公開 seam の `interaction.NormalizeCSP` で正規化され、`form-action` は禁止、`frame-ancestors` と `base-uri` は指定する場合も厳密に `'none'` でなければなりません。未指定の `frame-ancestors` と `base-uri` は自動追加されます。不正な policy は `interaction.ErrCSPNotPermitted` を包んだ構築エラーになります。

script を許可するのは明示的な信頼の判断です。ページには CSRF token と continuation state が含まれます。`html/template` の escape は RP の表示名などの値を保護しますが、任意の script 実行を無害化するわけではありません。

## 経路 3 — JSON ドライバ（HTML を完全に自前で持つ）

レイアウト・ブランドアセット・フレームワーク描画など、HTML ごと自前で持ちたいケースでは JSON ドライバに切り替えます。OP は同意画面を `{ type: "consent.scope", data: { scopes: [...] }, csrf_token, ... }` という JSON で返し、自前のページ（または SPA）がそれを描画してユーザの選択を POST で送り返します。

```go
import "github.com/libraz/go-oidc-provider/op/interaction"

op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.JSONDriver{}),
)
```

SPA は送信時に `prompt.csrf_token` を `X-CSRF-Token` ヘッダに乗せ、OP は `__Host-oidc_csrf` cookie と照合します（double-submit パターン）。end-to-end の流れは [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) を参照してください。

## どちらの経路でも書かなくていい部分

| 関心事 | OP が持つ |
|---|---|
| CSRF トークンの生成 / 検証 | yes |
| POST の Origin / Referer チェック | yes |
| Cookie の scope(`__Host-`、`Secure`、`SameSite`) | yes |
| セッション参照 / 同意の永続化 | yes |
| 承認後の RP へのリダイレクト | yes |

経路 1 は同梱 CSP（`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`）と描画される HTML をそのまま使います。経路 2 のカスタムテンプレートでは `ConsentUI.ContentSecurityPolicy` を設定してください。RP への cross-origin redirect を許可するために `form-action` を追加してはいけません。成功時の完了 redirect をブラウザが止めます。経路 3 は自前のページが必要な CSP を自分で設定します。

POST の Origin / Referer ceremony check は client の redirect URI から導出されません。issuer origin と `op.WithCORSOrigins` で明示した origin だけを受け付けます。別 origin の redirect URI があるだけでは interaction や end-session state の送信元として認可されません。

## 続きはこちら

- [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) — JSON ドライバ上のフル SPA 構成。
- [i18n / ロケール解決](/ja/use-cases/i18n) — ロケール bundle 上書き経路。
- [SPA 向け CORS](/ja/use-cases/cors-spa) — フロントエンドが別 origin のとき。
