---
title: カスタム同意 UI
description: ビルトインの同意画面を独自 HTML テンプレートに差し替える — ブランド・コピー・レイアウト・i18n を自分のものに。
---

# ユースケース — カスタム同意 UI

## OIDC における「同意 (consent)」とは

ユーザが認証を済ませたあと、OIDC Core 1.0 §3.1.2.4 は **OP が RP ではなくユーザ本人に対して** 「要求された scope（`profile` / `email` 等）の開示を許可するか」を問うことを期待しています。ユーザが「許可」「拒否」を選び、許可されたときだけ OP は code を付けて RP にリダイレクトを返す — 同意画面はログインとリダイレクトの **間** に挟まる UI です。

OP 同梱の同意画面でもひと通り動きますが、ほぼ確実に独自ブランド（ロゴ・コピー・プライバシー / 利用規約リンク・i18n）に差し替えたくなります。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4（同意プロンプト）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework, §3.1（authorization endpoint）
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice（CSRF 緩和等）
:::

::: details 用語の補足
- **同意画面** — ログインと redirect-back-with-code の間で、ユーザが特定の RP の要求 scope を承認する画面。OP が「何を訊くか」を決め、ユーザが「開示するか」を決めます。
- **CSRF トークン** — セッションに紐づく秘密値で、悪意ある第三者サイトが同意画面の「承認」をユーザのブラウザに肩代わりさせる攻撃を防ぐためにフォームに埋め込みます。発行と検証は OP の責任で、テンプレート側の役目は POST 本文にそのまま戻して送信することだけです。
- **Content Security Policy（CSP）** — ページが読み込んでよいリソース種別をブラウザに伝えるレスポンスヘッダ（`Content-Security-Policy: default-src 'none'; ...`）。OP は同意画面を `<script>`、inline イベントハンドラ、外部アセットを禁じる厳格なデフォルト CSP で描画するので、悪意ある RP の `client_name` が XSS に化けることはありません。
:::

> **ソース:** [`examples/11-custom-consent-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/11-custom-consent-ui)

## 差し込み口

```go
import "html/template"

tmpl := template.Must(template.New("consent").Parse(`
  <!DOCTYPE html>
  <html><body>
    <h1>{{.Client.Name}} が次の権限を求めています</h1>
    <ul>{{range .Scopes}}<li>{{.Description}}</li>{{end}}</ul>
    <form method="POST">
      <input type="hidden" name="csrf" value="{{.CSRFToken}}">
      <button name="action" value="approve">承認</button>
      <button name="action" value="deny">拒否</button>
    </form>
  </body></html>
`))

op.New(
  /* 必須オプション */
  op.WithConsentUI(op.ConsentUI{Template: tmpl}),
)
```

ライブラリは正規のコンテキストをテンプレートに渡します:

| フィールド | 型 | 用途 |
|---|---|---|
| `Client` | `store.Client` | 表示名、logo URI 等 |
| `Scopes` | `[]op.Scope` | 付与 scope と人間向け説明 |
| `CSRFToken` | `string` | フォーム POST 本文に **必ず** 埋め込む |
| `User` | `op.Identity` | subject + claim |

レイアウト、CSS、i18n は組み込み側の責務です。

## 書かなくていい部分

| 関心事 | OP が持つ |
|---|---|
| CSRF トークンの生成 / 検証 | ✅ |
| POST の Origin / Referer チェック | ✅ |
| Cookie の scope（`__Host-`、`Secure`、`SameSite`） | ✅ |
| セッション参照 / 同意の永続化 | ✅ |
| 承認後の RP へのリダイレクト | ✅ |

利用者が書くのは form の中身だけです。

## CSP セーフ

ライブラリのデフォルト CSP は `default-src 'none'; style-src 'unsafe-inline'`。`<script>` や外部アセットを埋め込むなら、`op.WithConsentUI(op.ConsentUI{ContentSecurityPolicy: "..."})` で明示的に CSP を上げてください。

## どちらを選ぶか

| 必要 | 選択 |
|---|---|
| 同意画面のリブランドだけ、SSR HTML のまま | `WithConsentUI` |
| ログイン・同意・ログアウトすべて SPA（React / Vue / …）で | `WithSPAUI`（[SPA / カスタム interaction](/ja/use-cases/spa-custom-interaction)） |
| JSON のみ、独自フロントエンドフレームワーク | `interaction.JSONDriver{}` に差し替え |

## 続きはこちら

- [SPA / カスタム interaction](/ja/use-cases/spa-custom-interaction) — フル SPA 実装。
- [SPA 向け CORS](/ja/use-cases/cors-spa) — フロントエンドが別 origin のとき。
