---
title: カスタムアカウント選択 UI
description: prompt=select_account の chooser を差し替えつつ、state、CSRF、セッション切替、CSP 強制、ceremony の origin 検査を OP に保持させます。
pageClass: pg-use-cases-custom-chooser-ui
---

# 使い方 — カスタムアカウント選択 UI

`prompt=select_account` には 2 つの関心事があります。

- **セッションの意味論**: ブラウザが複数の有効アカウントを含む chooser group を持ち、選択されたセッションが次の `sub` を決める
- **描画面**: アカウント一覧を表示し、選択された `SessionID` を POST するページ

[マルチアカウント選択](/ja/use-cases/multi-account) は前者を扱います。このページは後者、つまりブランド付きのサーバ描画のアカウント選択画面を持ちつつ、state、CSRF、最後の `Sessions.Switch` は OP に任せるための `op.WithChooserUI` を扱います。

> **ソース:** [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) は、既定の HTML interaction ドライバで `op.WithChooserUI` を使う例です。JSON ドライバ / SPA 経路は [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) と対比してください。

## 使いどころ

| 目的 | 使うもの |
|---|---|
| 同梱 chooser をそのまま使う | オプション不要。既定 HTML ドライバが描画 |
| chooser の HTML / 文言 / レイアウトだけ変え、サーバ描画に留める | `op.WithChooserUI(op.ChooserUI{Template: tmpl})` |
| chooser を SPA の中で描画する | `op.WithSPAUI` または `interaction.JSONDriver` |
| アカウントのグループ化や切替のロジックを変える | テンプレートではなく session store / authenticator 側 |

`WithChooserUI` は意図的に狭い差し込み口です。差し替えるのはテンプレートだけで、テンプレートが任意の subject を選んだり、セッションを発行したり、OP の状態遷移を迂回したりする経路ではありません。

## テンプレートの契約

テンプレートには `interaction.ChooserTemplateData` が渡されます。主なフィールドは次の通りです。

| フィールド | 用途 |
|---|---|
| `Accounts` | chooser group 内の有効セッション。`SessionID`、subject、表示ラベル、auth time などを含む |
| `StateRef` | そのまま返す不透明な interaction state 参照 |
| `CSRFToken` | POST 時に OP が検証するトークン |
| `SessionIDField` | 選択アカウント用に OP が期待するフォームフィールド名 |
| `SubmitMethod` | 通常は `POST` |
| `SubmitAction` | interaction endpoint URL |
| `AddAccountURL` | 別アカウント追加のために `prompt=login` 経路を開始する URL |

最小形は次のようになります。

```go
tmpl := template.Must(template.New("chooser").Parse(`
{{range .Accounts}}
  <form method="{{$.SubmitMethod}}" action="{{$.SubmitAction}}">
    <input type="hidden" name="state_ref" value="{{$.StateRef}}">
    <input type="hidden" name="csrf_token" value="{{$.CSRFToken}}">
    <input type="hidden" name="{{$.SessionIDField}}" value="{{.SessionID}}">
    <button type="submit">Continue as {{.DisplayName}}</button>
  </form>
{{end}}
<a href="{{.AddAccountURL}}">Sign in to another account</a>
`))

provider, err := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.HTMLDriver{}),
  op.WithChooserUI(op.ChooserUI{Template: tmpl}),
)
```

フィールド名は OP との契約です。`state_ref`、`csrf_token`、動的な `SessionIDField` は送信フォームに残してください。

`op.ChooserUI` にも `ContentSecurityPolicy` field があります。空文字は厳格な既定値（`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`）を使います。独自 policy は構築時に `interaction.NormalizeCSP` で正規化され、`form-action` は禁止、`frame-ancestors` と `base-uri` は指定する場合も厳密に `'none'` でなければなりません。欠けている保護 directive は自動追加され、不正な policy は `interaction.ErrCSPNotPermitted` を包んだ `op.New` エラーになります。テンプレートに必要な asset directive だけを追加し、trust boundary 上の理由がない限り script は無効のままにしてください。

## Flow

<figure class="fig">
  <div class="fig-head">chooser — リクエストから切り替えまで</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-chooser-title" viewBox="0 0 960 386" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-chooser-title">prompt=select_account を伴うリクエストを受けると、OP は chooser group を読み込んで自前のテンプレートに渡します。送信された内容には CSRF トークンと state 参照が含まれ、セッションを切り替える前に両方を検証します。</title>
    <line class="fg-life" x1="150" y1="72" x2="150" y2="372"/>
    <line class="fg-life fg-life--accent" x1="500" y1="72" x2="500" y2="372"/>
    <line class="fg-life" x1="830" y1="72" x2="830" y2="372"/>
    <rect class="fg-box" x="60" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t" x="150" y="44" text-anchor="middle">ブラウザ</text>
    <text class="fg-xs" x="150" y="59" text-anchor="middle">ユーザの手元</text>
    <rect class="fg-box fg-box--accent" x="410" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="44" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="59" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="740" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t" x="830" y="44" text-anchor="middle">chooser テンプレート</text>
    <text class="fg-xs" x="830" y="59" text-anchor="middle">組み込み側の実装</text>
    <circle class="fg-badge" cx="15" cy="104" r="8.5"/>
    <text class="fg-badge-t" x="15" y="107" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,104 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="98" text-anchor="middle">GET /authorize · prompt=select_account</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="142" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="145" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M500,134 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="542" y="146">cookie が指す chooser group を読み込む</text>
    <circle class="fg-badge" cx="15" cy="182" r="8.5"/>
    <text class="fg-badge-t" x="15" y="185" text-anchor="middle">3</text>
    <path class="fg-edge" d="M500,182 H830" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="665" y="176" text-anchor="middle">ChooserTemplateData を描画する</text>
    <circle class="fg-badge" cx="15" cy="222" r="8.5"/>
    <text class="fg-badge-t" x="15" y="225" text-anchor="middle">4</text>
    <path class="fg-edge" d="M830,222 H150" marker-end="url(#fg-a)"/>
    <text class="fg-mxs fg-halo" x="490" y="202" text-anchor="middle">アカウント一覧</text>
    <text class="fg-mxs fg-halo" x="490" y="215" text-anchor="middle">および CSRFToken と StateRef</text>
    <circle class="fg-badge" cx="15" cy="262" r="8.5"/>
    <text class="fg-badge-t" x="15" y="265" text-anchor="middle">5</text>
    <path class="fg-edge" d="M150,262 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="256" text-anchor="middle">POST SubmitAction · session_id</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="300" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="303" text-anchor="middle">6</text>
    <path class="fg-edge fg-edge--accent" d="M500,292 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="296">CSRFToken と StateRef を検証する</text>
    <text class="fg-xs" x="542" y="310">切り替えは、その後で行う</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="338" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="341" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M500,330 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="342">Sessions.Switch(group, session_id)</text>
    <circle class="fg-badge" cx="15" cy="368" r="8.5"/>
    <text class="fg-badge-t" x="15" y="371" text-anchor="middle">8</text>
    <path class="fg-edge fg-edge--accent" d="M500,368 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="362" text-anchor="middle">code 付きで RP へ 302</text>
  </svg>
  <figcaption class="fig-note">自前のテンプレートが持つのはマークアップだけです。送り返す 2 つの不透明な値が、提出された <code>session_id</code> を「このブラウザに今提示されたもの」だけに限定しています。</figcaption>
</figure>

テンプレートは切替そのものを実行しません。選択されたセッション識別子を OP に返すだけです。

## SPA interaction との優先関係

`op.WithSPAUI` を使う場合、chooser の描画は JSON の状態取得を通じて SPA が受け持ちます。`WithSPAUI` と `WithChooserUI` が同時に設定されている場合、SPA 経路が優先され、chooser テンプレートは起動時の警告付きで無視されます。配備ごとに UI の所有者を 1 つに絞ってください。

| UI の所有者 | オプション |
|---|---|
| OP によるサーバ描画 HTML | `op.WithChooserUI` |
| OP がマウントする SPA の入口 | `op.WithSPAUI` |
| 自前ルータが SPA を配信 | `op.WithInteractionDriver(interaction.JSONDriver{})` |

## 本番運用メモ

- テンプレートは起動時に一度だけ parse し、リクエストごとに parse しない。
- CSP は厳しく保つ。テンプレートデータには RP 由来のクライアント表示名などが入り得るため、`html/template` のエスケープに乗せ、インラインスクリプトを避ける。
- `SessionID` は不透明な値として扱う。OP はそれが有効な chooser group に属するかを検証する。
- 「アカウント追加」リンクは提供された `AddAccountURL` を使う。そうすれば次のログインが既存 chooser group に加わる。

## 続きはこちら

- [マルチアカウント選択](/ja/use-cases/multi-account) — chooser group の意味論と `Sessions.Switch`。
- [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) — 同じ prompt を JSON ドライバで扱う経路。
- [カスタム同意 UI](/ja/use-cases/custom-consent-ui) — consent 向けの同等のサーバ描画テンプレート差し込み口。
