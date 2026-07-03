---
title: カスタムアカウントチューザ UI
description: prompt=select_account のサーバ描画テンプレートを差し替えつつ、state、CSRF、セッション切替は OP に保持させる。
---

# ユースケース — カスタムアカウントチューザ UI

`prompt=select_account` には 2 つの関心事があります。

- **セッションの意味論**: ブラウザが複数の有効アカウントを含む chooser group を持ち、選択されたセッションが次の `sub` を決める
- **描画面**: アカウント一覧を表示し、選択された `SessionID` を POST するページ

[マルチアカウントチューザ](/ja/use-cases/multi-account) は前者を扱います。このページは後者、つまりブランド付きのサーバ描画のアカウント選択画面を持ちつつ、state、CSRF、最後の `Sessions.Switch` は OP に任せるための `op.WithChooserUI` を扱います。

> **ソース:** [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) は、デフォルトの HTML interaction ドライバで `op.WithChooserUI` を使う例です。JSON ドライバ / SPA 経路は [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) と対比してください。

## 使いどころ

| 目的 | 使うもの |
|---|---|
| 同梱 chooser をそのまま使う | オプション不要。デフォルト HTML ドライバが描画 |
| chooser の HTML / 文言 / レイアウトだけ変え、サーバ描画に留める | `op.WithChooserUI(op.ChooserUI{Template: tmpl})` |
| chooser を SPA の中で描画する | `op.WithSPAUI` または `interaction.JSONDriver` |
| アカウントのグループ化や切替のロジックを変える | テンプレートではなく session store / authenticator 側 |

`WithChooserUI` は意図的に狭い差し込み口です。差し替えるのはテンプレートだけで、テンプレートが任意の subject を選んだり、セッションを発行したり、OP の state machine を迂回したりする経路ではありません。

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

## Flow

<svg role="img" aria-labelledby="chooser-flow-title" viewBox="0 0 720 425" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;height:auto;display:block;margin:1.5rem auto;">
<title id="chooser-flow-title">カスタムチューザ UI のフロー: ブラウザが prompt=select_account を要求し、OP が chooser group を読み込んでテンプレートを描画し、送信を検証してからセッションを切り替え RP にリダイレクトする流れ。</title>
<style>
.ccui-actor{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;stroke:none;fill:currentColor}
.ccui-lbl{font-family:var(--vp-font-family-base);font-size:12.5px;stroke:none;fill:currentColor}
.ccui-mono{font-family:var(--vp-font-family-mono);font-size:12px;stroke:none;fill:currentColor}
.ccui-num{font-family:var(--vp-font-family-mono);font-size:11px;font-weight:600;stroke:none}
.ccui-op{stroke:var(--vp-c-brand-2)}
.ccui-sec{stroke:var(--vp-c-text-3)}
.ccui-opf{fill:var(--vp-c-brand-2)}
.ccui-secf{fill:var(--vp-c-text-3)}
</style>
<rect x="30" y="14" width="120" height="36" rx="6"/>
<rect x="300" y="14" width="120" height="36" rx="6" class="ccui-op"/>
<rect x="558" y="14" width="144" height="36" rx="6" class="ccui-sec"/>
<text class="ccui-actor" x="90" y="37" text-anchor="middle">ブラウザ</text>
<text class="ccui-actor ccui-opf" x="360" y="37" text-anchor="middle">OP</text>
<text class="ccui-actor ccui-secf" x="630" y="37" text-anchor="middle">chooser テンプレート</text>
<line x1="90" y1="50" x2="90" y2="405"/>
<line x1="360" y1="50" x2="360" y2="405" class="ccui-op"/>
<line x1="630" y1="50" x2="630" y2="405" class="ccui-sec"/>
<line x1="90" y1="88" x2="360" y2="88"/>
<polyline points="352,83 360,88 352,93"/>
<circle class="ccui-op" cx="102" cy="74" r="8"/>
<text class="ccui-num ccui-opf" x="102" y="78" text-anchor="middle">1</text>
<text class="ccui-mono" x="225" y="80" text-anchor="middle">GET /authorize · prompt=select_account</text>
<path d="M360,120 H406 V140 H366"/>
<polyline points="368,135 360,140 368,145"/>
<circle class="ccui-op" cx="372" cy="108" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="112" text-anchor="middle">2</text>
<text class="ccui-lbl" x="414" y="134" text-anchor="start">chooser group を読み込む</text>
<line x1="360" y1="176" x2="630" y2="176"/>
<polyline points="622,171 630,176 622,181"/>
<circle class="ccui-op" cx="372" cy="162" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="166" text-anchor="middle">3</text>
<text class="ccui-lbl" x="495" y="168" text-anchor="middle"><tspan class="ccui-mono">ChooserTemplateData</tspan> を描画</text>
<line x1="630" y1="216" x2="90" y2="216" stroke-dasharray="5 4"/>
<polyline points="98,211 90,216 98,221"/>
<circle class="ccui-op" cx="618" cy="202" r="8"/>
<text class="ccui-num ccui-opf" x="618" y="206" text-anchor="middle">4</text>
<text class="ccui-lbl" x="360" y="208" text-anchor="middle">アカウント一覧 + <tspan class="ccui-mono">CSRFToken</tspan> + <tspan class="ccui-mono">StateRef</tspan></text>
<line x1="90" y1="260" x2="360" y2="260"/>
<polyline points="352,255 360,260 352,265"/>
<circle class="ccui-op" cx="102" cy="246" r="8"/>
<text class="ccui-num ccui-opf" x="102" y="250" text-anchor="middle">5</text>
<text class="ccui-mono" x="225" y="252" text-anchor="middle">POST SubmitAction · session_id</text>
<path d="M360,292 H406 V312 H366"/>
<polyline points="368,307 360,312 368,317"/>
<circle class="ccui-op" cx="372" cy="280" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="284" text-anchor="middle">6</text>
<text class="ccui-lbl" x="414" y="306" text-anchor="start"><tspan class="ccui-mono">CSRFToken</tspan> + <tspan class="ccui-mono">StateRef</tspan> を検証</text>
<path d="M360,336 H406 V356 H366"/>
<polyline points="368,351 360,356 368,361"/>
<circle class="ccui-op" cx="372" cy="324" r="8"/>
<text class="ccui-num ccui-opf" x="372" y="328" text-anchor="middle">7</text>
<text class="ccui-mono" x="414" y="350" text-anchor="start">Sessions.Switch(group, session_id)</text>
<line x1="360" y1="392" x2="90" y2="392" stroke-dasharray="5 4"/>
<polyline points="98,387 90,392 98,397"/>
<circle class="ccui-op" cx="348" cy="378" r="8"/>
<text class="ccui-num ccui-opf" x="348" y="382" text-anchor="middle">8</text>
<text class="ccui-lbl" x="225" y="384" text-anchor="middle"><tspan class="ccui-mono">code</tspan> 付きで RP に 302</text>
</svg>

テンプレートは切替そのものを実行しません。選択されたセッション識別子を OP に返すだけです。

## SPA interaction との優先関係

`op.WithSPAUI` を使う場合、chooser の描画は JSON の状態取得を通じて SPA が受け持ちます。`WithSPAUI` と `WithChooserUI` が同時に設定されている場合、SPA 経路が優先され、chooser テンプレートは起動時の警告付きで無視されます。デプロイごとに UI の所有者を 1 つに絞ってください。

| UI の所有者 | オプション |
|---|---|
| OP によるサーバ描画 HTML | `op.WithChooserUI` |
| OP がマウントする SPA の入口 | `op.WithSPAUI` |
| 自前ルータが SPA を配信 | `op.WithInteractionDriver(interaction.JSONDriver{})` |

## 本番運用メモ

- テンプレートは起動時に一度だけ parse し、リクエストごとに parse しない。
- CSP は厳しく保つ。テンプレートデータには RP 由来の client 表示名などが入り得るため、`html/template` のエスケープに乗せ、インラインスクリプトを避ける。
- `SessionID` は不透明な値として扱う。OP はそれが有効な chooser group に属するかを検証する。
- 「アカウント追加」リンクは提供された `AddAccountURL` を使う。そうすれば次のログインが既存 chooser group に加わる。

## 続きはこちら

- [マルチアカウントチューザ](/ja/use-cases/multi-account) — chooser group の意味論と `Sessions.Switch`。
- [SPA / カスタム interaction](/ja/use-cases/spa-custom-interaction) — 同じ prompt を JSON ドライバで扱う経路。
- [カスタム同意 UI](/ja/use-cases/custom-consent-ui) — consent 向けの同等のサーバ描画テンプレート差し込み口。
