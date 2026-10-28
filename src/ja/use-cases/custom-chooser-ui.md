---
title: カスタムアカウント選択 UI
description: prompt=select_account の chooser を差し替えつつ、state、CSRF、セッション切替、CSP 強制、ceremony の origin 検査を OP に保持させます。
pageClass: pg-use-cases-custom-chooser-ui
---

# ユースケース — カスタムアカウント選択 UI

`prompt=select_account` には 2 つの関心事があります。

- **セッションの意味論**: ブラウザが chooser group（サインイン済みの複数アカウント）を持ち、ユーザが選んだアカウントが次の `sub` を決める。
- **描画面**: アカウントの一覧を表示し、選ばれた `SessionID` を POST するページ。

[マルチアカウント選択](/ja/use-cases/multi-account) は前者を扱います。このページは後者を扱います。ブランド付きでサーバ描画のアカウント選択画面を持ちつつ、state、CSRF、セッションの切り替えは OP に任せるには、`op.WithChooserUI` を使います。

> **ソース:** [`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) は、既定の HTML interaction ドライバで `op.WithChooserUI` を使う例です。JSON ドライバ / SPA 経路は [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) と対比してください。

## 使いどころ

| 目的 | 使うもの |
|---|---|
| 同梱 chooser をそのまま使う | オプション不要。既定 HTML ドライバが描画 |
| chooser の HTML / 文言 / レイアウトだけ変え、サーバ描画に留める | `op.WithChooserUI(op.ChooserUI{Template: tmpl})` |
| chooser を SPA の中で描画する | `op.WithSPAUI` または `op.WithInteractionDriver(interaction.JSONDriver{})` |
| アカウントのグループ化や切替のロジックを変える | テンプレートではなく session store / authenticator 側 |

`WithChooserUI` は意図的に狭い差し込み口です。差し替えるのはテンプレートだけで、テンプレートが任意の subject を選んだり、セッションを発行したり、OP の状態遷移を迂回したりすることはできません。

## テンプレートの契約

テンプレートには `interaction.ChooserTemplateData` が渡されます。

| フィールド | 用途 |
|---|---|
| `Accounts` | chooser group 内の有効なセッション（最後に使った順）。各要素は `SessionID`、`Subject`、`DisplayName`（ユーザの `name` claim。不明なら空）、`AuthTime` を持つ |
| `StateRef` | そのまま返す不透明な interaction state 参照 |
| `CSRFToken` | POST 時に OP が検証するトークン |
| `SessionIDField` | 選択アカウント用に OP が期待するフォームフィールド名 |
| `SubmitMethod` | 通常は `POST` |
| `SubmitAction` | interaction endpoint URL |
| `AddAccountURL` | 同じ group に別のアカウントをサインインさせる `/auth` の URL。PAR が必須の配備では空 |

最小形は次のようになります。

```go
tmpl := template.Must(template.New("chooser").Parse(`
{{range .Accounts}}
  <form method="{{$.SubmitMethod}}" action="{{$.SubmitAction}}">
    <input type="hidden" name="state_ref" value="{{$.StateRef}}">
    <input type="hidden" name="csrf_token" value="{{$.CSRFToken}}">
    <input type="hidden" name="{{$.SessionIDField}}" value="{{.SessionID}}">
    <button type="submit">Continue as {{if .DisplayName}}{{.DisplayName}}{{else}}{{.Subject}}{{end}}</button>
  </form>
{{end}}
{{if .AddAccountURL}}<a href="{{.AddAccountURL}}">Sign in to another account</a>{{end}}
`))

provider, err := op.New(
  /* 必須オプション */
  op.WithInteractionDriver(interaction.HTMLDriver{}),
  op.WithChooserUI(op.ChooserUI{Template: tmpl}),
)
```

フィールド名は OP との契約です。`state_ref`、`csrf_token`、`SessionIDField` が指す名前（`session_id`）のフィールドは、送信フォームに残してください。「アカウント追加」のリンクは、`AddAccountURL` が空でないときだけ表示します。`RequirePAR`（たとえば FAPI 2.0）の配備では、クエリ文字列だけの `/auth` URL は拒否されるため、OP はこのフィールドを空にします。

`op.ChooserUI` にも `ContentSecurityPolicy` フィールドがあります。同意画面のものとは別に宣言するのは、2 つのテンプレートが別々の origin から読み込む場合があるためです。空文字は厳格な既定値（`default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'`）を使い、スタイルシートや画像も読み込めません。独自のポリシーは `op.New` の実行時に `interaction.NormalizeCSP` で正規化されます。`form-action` は拒否され、`frame-ancestors` と `base-uri` は指定する場合は厳密に `'none'` でなければなりません。欠けている保護の directive は自動で追加されます。拒否されたポリシーは、`interaction.ErrCSPNotPermitted` で `op.New` を失敗させます。テンプレートに必要なアセットの directive だけを追加し、script は無効のままにしてください。

## 流れ

<figure class="fig">
  <div class="fig-head">chooser — リクエストから切り替えまで</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-chooser-title" viewBox="0 0 960 736" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-chooser-title">prompt=select_account を伴うリクエストを受けると、OP は chooser group を読み込んで自前のテンプレートに渡します。送信された内容には CSRF トークンと state 参照が含まれ、セッションを切り替える前に両方を検証します。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="712"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="712"/>
    <line class="fg-life" x1="824" y1="88" x2="824" y2="712"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">ブラウザ</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">ユーザの手元</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="824" y="50" text-anchor="middle">chooser テンプレート</text>
    <text class="fg-xs" x="824" y="72" text-anchor="middle">組み込み側の実装</text>
    <!-- request -->
    <path class="fg-edge" d="M192,152 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="118" text-anchor="middle">GET /auth</text>
    <text class="fg-mxs" x="352" y="140" text-anchor="middle">prompt=select_account</text>
    <!-- load group -->
    <path class="fg-edge fg-edge--accent" d="M512,200 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="206">cookie が指す</text>
    <text class="fg-s" x="568" y="228">chooser group を読む</text>
    <!-- render -->
    <path class="fg-edge" d="M512,304 H824" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="668" y="294" text-anchor="middle">ChooserTemplateData を描画</text>
    <!-- list -->
    <path class="fg-edge" d="M824,384 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s fg-halo" x="504" y="350" text-anchor="middle">アカウント一覧</text>
    <text class="fg-mxs fg-halo" x="504" y="372" text-anchor="middle">および CSRFToken と StateRef</text>
    <!-- submit -->
    <path class="fg-edge" d="M192,464 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="430" text-anchor="middle">POST SubmitAction</text>
    <text class="fg-mxs" x="352" y="452" text-anchor="middle">session_id</text>
    <!-- validate -->
    <path class="fg-edge fg-edge--accent" d="M512,512 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="518">切り替え前に検証する</text>
    <text class="fg-mxs" x="568" y="540">CSRFToken · StateRef</text>
    <!-- switch -->
    <path class="fg-edge fg-edge--accent" d="M512,584 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="590">セッションを切り替える</text>
    <text class="fg-mxs" x="568" y="612">Switch(group, session_id)</text>
    <!-- redirect -->
    <path class="fg-edge fg-edge--accent" d="M512,688 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="352" y="678" text-anchor="middle">code 付きで RP へ 302</text>
  </svg>
  <figcaption class="fig-note">自前のテンプレートが持つのはマークアップだけです。送り返す 2 つの不透明な値が、提出された <code>session_id</code> を「このブラウザに今提示されたもの」だけに限定しています。</figcaption>
</figure>

テンプレートは切り替えそのものを実行しません。選ばれたセッションの識別子を返すだけです。OP はその識別子が有効な chooser group に属することを確認し、他の group のものや期限切れの `session_id` は 4xx で拒否します。選ばれたセッションが、その間に期限切れになったりサインアウトされたりしていた場合、RP は `login_required` を受け取ります。

選ばれたセッションでリクエストを処理できない場合（リクエストに `prompt=login` がある、セッションが `max_age` より古い、`acr` が `acr_values` を満たさない）、OP はリクエストを失敗させません。そのアカウントのログイン認証要素を、もう一度実行します。

## SPA interaction との優先関係

`op.WithSPAUI` を使う場合、chooser の描画は JSON の状態エンドポイントを通じて SPA が受け持ちます。`WithSPAUI` と `WithChooserUI` が同時に設定されている場合は SPA が優先され、chooser テンプレートは無視されて `op.New` が警告をログに出します。配備ごとに UI の所有者を 1 つに絞ってください。

| UI の所有者 | オプション |
|---|---|
| OP によるサーバ描画 HTML | `op.WithChooserUI` |
| OP がマウントする SPA の入口 | `op.WithSPAUI` |
| 自前ルータが SPA を配信 | `op.WithInteractionDriver(interaction.JSONDriver{})` |

## 本番運用メモ

- テンプレートは、リクエストごとではなく起動時に一度だけ parse する。
- CSP は厳しく保つ。データには攻撃者が影響し得る表示名が入るので、`html/template` のエスケープに任せ、inline script を避ける。
- `SessionID` は不透明な値として扱う。表示したり、他のフィールドから組み立てたりしない。
- `AddAccountURL` は渡されたとおりに使う。次のサインインを既存の group に加えるための内部マーカーが付いており、手で組み立てた `prompt=login` の URL は、アカウントを追加せず現在のアカウントを置き換える。

## 続きはこちら

- [マルチアカウント選択](/ja/use-cases/multi-account) — chooser group の意味論と `Sessions.Switch`。
- [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) — 同じ prompt を JSON ドライバで扱う経路。
- [カスタム同意 UI](/ja/use-cases/custom-consent-ui) — consent 向けの同等のサーバ描画テンプレート差し込み口。
