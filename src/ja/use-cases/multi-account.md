---
title: マルチアカウント選択
description: 1 ブラウザの複数ユーザを chooser group として保持し、group 全体／current セッション単位のログアウトと prompt=select_account を扱う。
pageClass: pg-use-cases-multi-account
---

# 使い方 — マルチアカウント選択

## `prompt=select_account` とは

OIDC Core 1.0 §3.1.2.1 では、RP が `/authorize` に `prompt` 要求パラメータを乗せられます。本ページに関係するのは次の 3 値:

| `prompt=` | OP に依頼する内容 |
|---|---|
| `none` | UI を一切出さない — 既存セッションを返すか失敗するか |
| `login` | 既存セッションがあっても再ログインを強制 |
| `select_account` | アカウント選択 UI を表示 — ユーザが続行するアカウントを選ぶ |

`select_account` は、大手 SaaS の「アカウント切り替え」ボタンの裏側で使われる仕様です。1 つのブラウザで同じ OP に複数アカウント（仕事 + 個人、alice + bob 等）でサインインしているとき、OP が一覧を出してユーザに選ばせます。

本ライブラリではこれを OP 内部のセッションマネージャが持つ **chooser group**（同一ブラウザで同時に有効なセッション群）として実装し、追加・切替・全ログアウトを内部で処理します。

RP-Initiated Logout はデフォルトでこの group を対象にします。`logout_scope` なしの `/end_session` は chooser group の有効なセッションをすべて破棄します。単一値の `logout_scope=current` を指定するとアクティブセッションだけを破棄し、兄弟が残れば cookie をそのセッションへ再バインドします。空値、未知の値、重複した `logout_scope` は group を変更せず HTTP 400 になります。一致しない `id_token_hint` では確認画面を省略できません。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.1（`prompt` パラメータ）、§3.1.2.4（同意との相互作用）
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) — 「全員ログアウト」発火時の 一斉通知
:::

::: details 用語の補足
- **`prompt` パラメータ** — RP が `/authorize` に乗せて、OP に UI の出し方を指示するヒントです。`none`（UI を出さず、既存セッションを返すか失敗）、`login`（再ログイン強制）、`consent`（同意画面強制）、`select_account`（アカウント選択 UI）の 4 種があり、空白区切りで複数指定できます。
- **Chooser group** — 同一ブラウザで同時にサインイン中のセッション群。大手 SaaS では「アカウント切り替え」メニューとして表面化します。OP がサーバ側で group を保持し、cookie はブラウザを単一セッションではなく group に紐づけます。
- **`sub`（subject）** — OP-RP ペアごとにスコープされる、ユーザの安定不透明識別子です。chooser でアカウントを切り替えると、次の `id_token` に乗る `sub` が変わります — 同じブラウザ、別の identity ということになります。
:::

> **ソース:** [`examples/13-multi-account`](https://github.com/libraz/go-oidc-provider/tree/main/examples/13-multi-account) は JSON ドライバで chooser を扱う例、[`examples/12-custom-chooser-ui`](https://github.com/libraz/go-oidc-provider/tree/main/examples/12-custom-chooser-ui) は HTML テンプレート差し替え経路の例です。

## 動作

<figure class="fig">
  <div class="fig-head">3 回の往復 — ログイン、追加、切り替え</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-multiaccount-title" viewBox="0 0 960 612" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-multiaccount-title">authorize エンドポイントを 3 回通る流れ。1 回目でログインして chooser group を開き、2 回目は prompt=login で同じ group に 2 つ目のアカウントを追加し、3 回目は prompt=select_account で chooser を表示してアクティブなセッションを切り替えます。</title>
    <rect class="fg-group" x="30" y="70" width="916" height="168" rx="8"/>
    <rect class="fg-group" x="30" y="246" width="916" height="168" rx="8"/>
    <rect class="fg-group" x="30" y="422" width="916" height="176" rx="8"/>
    <text class="fg-lbl" x="42" y="88">1 · 初回ログイン</text>
    <text class="fg-lbl" x="42" y="264">2 · アカウントを追加する</text>
    <text class="fg-lbl" x="42" y="440">3 · アカウントを切り替える</text>
    <line class="fg-life" x1="150" y1="62" x2="150" y2="598"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="598"/>
    <line class="fg-life" x1="840" y1="62" x2="840" y2="598"/>
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">ユーザのブラウザ</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">cookie は 1 セット</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="750" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="840" y="35" text-anchor="middle">RP</text>
    <text class="fg-xs" x="840" y="49" text-anchor="middle">組み込み側のアプリ</text>
    <path class="fg-edge" d="M150,112 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="106" text-anchor="middle">GET /authorize — prompt なし</text>
    <path class="fg-edge fg-edge--accent" d="M500,146 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="542" y="150">有効なセッションが無い → ログインフローを実行する</text>
    <text class="fg-mxs" x="542" y="164">alice@acme.com としてログイン</text>
    <path class="fg-edge fg-edge--accent" d="M500,192 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="196">Sessions.Issue</text>
    <text class="fg-xs" x="542" y="210">新しい chooser group を開く</text>
    <path class="fg-edge fg-edge--accent" d="M500,230 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="224" text-anchor="middle">302 → RP の callback へ、code 付きで</text>
    <path class="fg-edge" d="M150,288 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="282" text-anchor="middle">GET /authorize?prompt=login</text>
    <path class="fg-edge fg-edge--accent" d="M500,322 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="542" y="326">有効なセッションはあるが prompt=login が指定された</text>
    <text class="fg-mxs" x="542" y="340">alice@personal.com としてログイン</text>
    <path class="fg-edge fg-edge--accent" d="M500,368 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="372">AddAccount</text>
    <text class="fg-xs" x="542" y="386">既存の group に加える</text>
    <path class="fg-edge fg-edge--accent" d="M500,406 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="400" text-anchor="middle">302 → RP の callback へ、code 付きで</text>
    <path class="fg-edge" d="M150,464 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="458" text-anchor="middle">GET /authorize?prompt=select_account</text>
    <path class="fg-edge fg-edge--accent" d="M500,494 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="488" text-anchor="middle">chooser UI — 両方のアカウントが並ぶ</text>
    <path class="fg-edge" d="M150,530 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="510" text-anchor="middle">POST /interaction/{uid}</text>
    <text class="fg-mxs" x="325" y="524" text-anchor="middle">{ state_ref, values: { session_id } }</text>
    <path class="fg-edge fg-edge--accent" d="M500,556 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="542" y="560">Sessions.Switch</text>
    <text class="fg-xs" x="542" y="574">どのセッションをアクティブにするか切り替える</text>
    <path class="fg-edge fg-edge--accent" d="M500,594 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="588" text-anchor="middle">302 → 選択した sub で RP の callback へ</text>
  </svg>
  <figcaption class="fig-note">3 回とも同じエンドポイントを、同じ cookie で通っています。違うのはパラメータ 1 つだけで、それを読んだ後の OP の動きは、その cookie が既に指している group から決まります。</figcaption>
</figure>

## 実装

`prompt=select_account` 用の interaction は組み込みです。アクティブなアカウント選択グループの全アカウントを並べた `interaction.ChooserPromptData` 応答を返します。同梱 HTML ドライバでは組み込みテンプレートが一覧を描画し、ユーザは `SessionID` を POST で送り返します。サーバ描画の流れを保ちつつテンプレートだけ持ちたい場合は、`op.WithChooserUI(op.ChooserUI{Template: tmpl})` を渡します。

JSON ドライバ（`op.WithInteractionDriver(interaction.JSONDriver{})`）では、SPA 側が同じ情報を JSON として受け取り、`SessionID` を POST で送り返します。`op.WithSPAUI` を使う場合、`WithChooserUI` が同時指定されていてもアカウント選択画面の描画は SPA が受け持ちます。このとき chooser テンプレートは使われず、`op.New` がその旨の警告を出します。

これは OP 内部のセッションマネージャ（`internal/sessions.Manager`）が行う処理です。`internal/` 配下の非公開型のため、組み込み側が import して直接呼び出すことはできません。

| 内部処理 | タイミング |
|---|---|
| 新規 chooser group の発行 | 初回ログイン → 新 chooser group |
| group へのアカウント追加 | 同ブラウザで 2 人目 → 既存 group に追加 |
| group 内のアクティブセッション切替 | chooser でアカウントを選択 |
| group 全体のログアウト | 全員ログアウト |

組み込み側から触れられるセッション状態の公開面は `store.SessionStore` インターフェース（`Save` / `Find` / `Touch` / `Delete` / `ListByChooserGroup`）で、カスタムストアバックエンドはこれを実装します。chooser の一連処理そのものは `/authorize` と chooser interaction の処理の中で OP が内部的に行うものであり、アプリケーションコードから呼び出す API ではありません。

## 続きはこちら

- [カスタムアカウント選択 UI](/ja/use-cases/custom-chooser-ui) — chooser をサーバ描画のまま保ち、アカウント選択テンプレートだけ差し替える。
- [SPA / 対話画面のカスタマイズ](/ja/use-cases/spa-custom-interaction) — アカウント選択を SPA から扱う。
- [Back-Channel Logout](/ja/use-cases/back-channel-logout) — 全員ログアウト時の 一斉通知。
