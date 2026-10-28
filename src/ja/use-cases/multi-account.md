---
title: マルチアカウント選択
description: 1 ブラウザの複数ユーザを chooser group として保持し、group 全体／current セッション単位のログアウトと prompt=select_account を扱う。
pageClass: pg-use-cases-multi-account
---

# ユースケース — マルチアカウント選択

## `prompt=select_account` とは

OIDC Core 1.0 §3.1.2.1 では、RP が `/auth` に `prompt` 要求パラメータを付けられます。このページに関係するのは次の 3 つの値です。

| `prompt=` | OP に依頼する内容 |
|---|---|
| `none` | UI を出さない。既存のセッションで応答するか、失敗する |
| `login` | 有効なセッションがあっても、再ログインを強制する |
| `select_account` | アカウント選択 UI を表示し、ユーザが続行するアカウントを選ぶ |

`select_account` は、大手 SaaS の「アカウント切り替え」ボタンが送る値です。1 つのブラウザで、同じ OP に複数のアカウント（仕事用と個人用、alice と bob など）でサインインしているとき、OP が一覧を出してユーザに選ばせます。chooser が出るのは、ブラウザにすでに有効なセッションがある場合だけで、なければリクエストはそのままログインに進みます。

ライブラリはこれを **chooser group** として実装しています。1 つのブラウザがサインインしているセッションの集まりを OP のセッションマネージャが保持し、アカウントの追加、有効なセッションの切り替え、全体のサインアウトを行います。

RP-Initiated Logout はこの group を対象にします。`logout_scope` なしの `/end_session` は、chooser group のすべてのセッションを破棄します。`logout_scope=current`（受け付ける値はこれだけで、1 回だけ指定します）は有効なセッションだけを破棄し、cookie を残ったセッションに向け直します。空値、未知の値、重複した `logout_scope` は HTTP 400 になり、group は変更されません。セッションと一致しない `id_token_hint` では、ユーザの確認が必要で、確認を省略することはできません。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1（`prompt` パラメータ）、§3.1.2.4（同意との相互作用）
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — 「全員ログアウト」が発火したときの一斉通知
:::

::: details 用語の補足
- **`prompt` パラメータ**: RP が `/auth` に付けて、OP に UI の出し方を伝えるヒントです。`none`（UI を出さず、既存のセッションで応答するか失敗する）、`login`（再ログインを強制）、`consent`（同意画面を強制）、`select_account`（アカウント選択 UI）の 4 種類があり、スペース区切りで複数指定できます。
- **chooser group**: 同じブラウザで同時にサインインしているセッションの集まりです。大手 SaaS の「アカウント切り替え」メニューに当たります。OP がサーバ側で group を保持し、cookie はブラウザを個々のセッションではなく group に結び付けます。
- **`sub`（subject）**: OP と RP の組ごとに決まる、ユーザの安定した不透明な識別子です。chooser でアカウントを切り替えると、次の `id_token` の `sub` が変わります。同じブラウザで、別の ID になります。
:::

> **ソース:** [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) は JSON ドライバで chooser を扱う例、[`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) は HTML テンプレート差し替え経路の例です。

## 動作

<figure class="fig">
  <div class="fig-head">3 回の往復 — ログイン、追加、切り替え</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-multiaccount-title" viewBox="0 0 960 1056" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-multiaccount-title">authorize エンドポイントを 3 回通る流れ。1 回目でログインして chooser group を開き、2 回目は chooser の「アカウント追加」リンクから同じ group に 2 つ目のアカウントを追加し、3 回目は prompt=select_account で chooser を表示してアクティブなセッションを切り替えます。</title>
    <!-- phase bands -->
    <rect class="fg-group" x="32" y="104" width="896" height="272" rx="8"/>
    <rect class="fg-group" x="32" y="392" width="896" height="280" rx="8"/>
    <rect class="fg-group" x="32" y="688" width="896" height="368" rx="8"/>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="1032"/>
    <line class="fg-life fg-life--accent" x1="512" y1="88" x2="512" y2="1032"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">ユーザのブラウザ</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">cookie は 1 セット</text>
    <rect class="fg-box fg-box--accent" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="512" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="512" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- 1 first login -->
    <text class="fg-lbl fg-halo" x="56" y="132">1 · 初回ログイン</text>
    <path class="fg-edge" d="M192,184 H512" marker-end="url(#fg-a)"/>
    <text class="fg-edge-lbl" x="352" y="174" text-anchor="middle">GET /auth · prompt なし</text>
    <path class="fg-edge fg-edge--accent" d="M512,216 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="222">有効なセッションなし → ログインフロー</text>
    <text class="fg-mxs" x="568" y="244">alice@acme.com としてログイン</text>
    <path class="fg-edge fg-edge--accent" d="M512,280 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="568" y="286">Sessions.Issue</text>
    <text class="fg-s" x="568" y="308">新しい chooser group を開く</text>
    <path class="fg-edge fg-edge--accent" d="M512,352 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="342" text-anchor="middle">302 → RP の callback(code 付き)</text>
    <!-- 2 add an account -->
    <text class="fg-lbl fg-halo" x="56" y="420">2 · アカウントを追加する</text>
    <path class="fg-edge" d="M192,480 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="446" text-anchor="middle">GET AddAccountURL</text>
    <text class="fg-mxs" x="352" y="468" text-anchor="middle">prompt=login + markers</text>
    <path class="fg-edge fg-edge--accent" d="M512,512 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="568" y="518">prompt=login で再ログインを強制する</text>
    <text class="fg-mxs" x="568" y="540">alice@personal.com としてログイン</text>
    <path class="fg-edge fg-edge--accent" d="M512,576 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="568" y="582">AddAccount</text>
    <text class="fg-s" x="568" y="604">既存の group に加える</text>
    <path class="fg-edge fg-edge--accent" d="M512,648 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="638" text-anchor="middle">302 → RP の callback(code 付き)</text>
    <!-- 3 switch -->
    <text class="fg-lbl fg-halo" x="56" y="716">3 · アカウントを切り替える</text>
    <path class="fg-edge" d="M192,776 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="742" text-anchor="middle">GET /auth</text>
    <text class="fg-mxs" x="352" y="764" text-anchor="middle">prompt=select_account</text>
    <path class="fg-edge fg-edge--accent" d="M512,832 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="822" text-anchor="middle">chooser UI(両アカウント)</text>
    <path class="fg-edge" d="M192,904 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="870" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-mxs" x="352" y="892" text-anchor="middle">state_ref, values.session_id</text>
    <path class="fg-edge fg-edge--accent" d="M512,936 h40 v24 h-40" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="568" y="942">Sessions.Switch</text>
    <text class="fg-s" x="568" y="964">アクティブなセッションを切り替える</text>
    <path class="fg-edge fg-edge--accent" d="M512,1008 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-edge-lbl" x="352" y="998" text-anchor="middle">302 → RP の callback(選んだ sub)</text>
  </svg>
  <figcaption class="fig-note">3 回とも同じエンドポイントを同じ cookie で通ります。2 回目は素の <code>prompt=login</code> ではありません。それでは現在のアカウントが置き換わってしまいます。chooser が渡す「アカウント追加」リンクを使い、その内部マーカーで、cookie が指す group に加わるよう OP に伝えます。</figcaption>
</figure>

## 実装

`prompt=select_account` 用の interaction は組み込みです。有効な chooser group の全アカウントと `AddAccountURL` を並べた `interaction.ChooserPromptData` を返します。既定の HTML ドライバでは、同梱のテンプレートが一覧を描画し、ユーザは選んだ `SessionID` を POST で送り返します。サーバ描画の流れを保ったままテンプレートだけを自前にしたいときは、`op.WithChooserUI(op.ChooserUI{Template: tmpl})` を渡します。

JSON ドライバ（`op.WithInteractionDriver(interaction.JSONDriver{})`）では、SPA が同じデータを JSON で受け取り、`SessionID` を POST で送り返します。`op.WithSPAUI` を使う場合は、`WithChooserUI` が同時に指定されていても chooser は SPA が受け持ちます。このときテンプレートは無視され、`op.New` が警告をログに出します。

アカウントを追加するには、手で組み立てた URL ではなく、prompt の `AddAccountURL` を使います。元の `/auth` リクエストに `prompt=login` と chooser group を示す内部マーカーを付けたもので、OP は、ブラウザがその group の cookie をまだ持っている間だけマーカーを有効にします。素の `prompt=login` は現在のアカウントを置き換えます。`RequirePAR`（たとえば FAPI 2.0）の配備では、クエリ文字列の `/auth` URL は拒否されるため、OP は `AddAccountURL` を空にします。その場合は「アカウント追加」リンクを隠してください。

セッションマネージャは内部の型で、アプリケーションコードから呼び出すことはありません。`/auth` と chooser interaction を処理する中で、OP が次の 4 つの操作を行います。

| 操作 | タイミング |
|---|---|
| 新しい chooser group を開く | そのブラウザでの最初のログイン |
| group にアカウントを追加する | `AddAccountURL` から始めたサインイン |
| 有効なセッションを切り替える | chooser でユーザがアカウントを選んだとき |
| group 全体を終了する | 全員のサインアウト（`logout_scope` なしの `/end_session`） |

組み込み側が実装するセッション用の interface は `store.SessionStore`（`Save`、`Find`、`Touch`、`Delete`、`ListByChooserGroup`）だけで、自前のセッションバックエンドを使う場合にだけ必要です。

選択の後も、通常のリクエスト検査は適用されます。選ばれたセッションが、リクエストの `max_age` に対して古い、`acr_values` を満たさない、またはリクエストに `prompt=login` が付いている場合は、リクエストを失敗させず、そのアカウントに再認証を求めます。

## 続きはこちら

- [カスタムアカウント選択 UI](/ja/use-cases/custom-chooser-ui) — chooser をサーバ描画のまま保ち、アカウント選択テンプレートだけ差し替える。
- [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) — アカウント選択を SPA から扱う。
- [Back-Channel Logout](/ja/use-cases/back-channel-logout) — 全員ログアウト時の一斉通知。
