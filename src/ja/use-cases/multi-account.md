---
title: マルチアカウント選択
description: 1 ブラウザに複数ユーザがログイン中の状態を OP が chooser group として保持し、prompt=select_account を UI 差し込み口経由で扱う。
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

<svg class="multi-account-flow" role="img" aria-labelledby="multi-account-chooser-flow-title" viewBox="0 0 720 656" width="720" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="multi-account-chooser-flow-title">3 回の /authorize 往復のシーケンス。初回ログインで chooser group を発行し、prompt=login でアカウントを追加、prompt=select_account でアクティブセッションを切り替える。</title>

  <!-- actors -->
  <rect x="60" y="14" width="120" height="34" rx="6"/>
  <rect x="320" y="14" width="120" height="34" rx="6" class="d-op"/>
  <rect x="560" y="14" width="120" height="34" rx="6"/>
  <text class="d-lbl" text-anchor="middle" x="120" y="35">ユーザブラウザ</text>
  <text class="d-lbl d-acc" text-anchor="middle" x="380" y="35">OP</text>
  <text class="d-lbl" text-anchor="middle" x="620" y="35">RP</text>

  <!-- lifelines -->
  <path class="d-life" d="M120 48 V648"/>
  <path class="d-op" d="M380 48 V648"/>
  <path class="d-life" d="M620 48 V648"/>

  <!-- phase 1 -->
  <text class="d-ph" x="10" y="64">1 · 初回ログイン</text>
  <path d="M120 84 H380"/><path d="M374 80 L380 84 L374 88"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="77"><tspan class="d-mono">GET /authorize</tspan>（prompt なし）</text>
  <rect x="268" y="94" width="224" height="24" rx="5"/>
  <text class="d-lbl" text-anchor="middle" x="380" y="110">有効セッションなし → ログインフロー実行</text>
  <path d="M120 138 H380"/><path d="M374 134 L380 138 L374 142"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="131">ログイン — <tspan class="d-mono">alice@acme.com</tspan></text>
  <rect x="268" y="148" width="224" height="36" rx="5" class="d-op"/>
  <text class="d-mono d-acc" text-anchor="middle" x="380" y="164">Sessions.Issue</text>
  <text class="d-lbl" text-anchor="middle" x="380" y="178">新規 chooser group</text>
  <path d="M380 204 H120"/><path d="M126 200 L120 204 L126 208"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="197"><tspan class="d-mono">302</tspan> → RP callback（code）</text>
  <path d="M120 228 H620"/><path d="M614 224 L620 228 L614 232"/>
  <text class="d-lbl d-mut" text-anchor="middle" x="370" y="221">ブラウザがリダイレクト追従</text>

  <!-- phase 2 -->
  <text class="d-ph" x="10" y="252">2 · アカウント追加</text>
  <path d="M120 274 H380"/><path d="M374 270 L380 274 L374 278"/>
  <text class="d-mono" text-anchor="middle" x="250" y="267">GET /authorize?prompt=login</text>
  <rect x="268" y="284" width="224" height="24" rx="5"/>
  <text class="d-lbl" text-anchor="middle" x="380" y="300">有効セッション + <tspan class="d-mono">prompt=login</tspan></text>
  <path d="M120 328 H380"/><path d="M374 324 L380 328 L374 332"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="321">ログイン — <tspan class="d-mono">alice@personal.com</tspan></text>
  <rect x="268" y="338" width="224" height="36" rx="5" class="d-op"/>
  <text class="d-mono d-acc" text-anchor="middle" x="380" y="354">AddAccount</text>
  <text class="d-lbl" text-anchor="middle" x="380" y="368">既存 group に追加</text>
  <path d="M380 394 H120"/><path d="M126 390 L120 394 L126 398"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="387"><tspan class="d-mono">302</tspan> → RP callback（code）</text>
  <path d="M120 418 H620"/><path d="M614 414 L620 418 L614 422"/>
  <text class="d-lbl d-mut" text-anchor="middle" x="370" y="411">ブラウザがリダイレクト追従</text>

  <!-- phase 3 -->
  <text class="d-ph" x="10" y="442">3 · アカウント切替</text>
  <path d="M120 464 H380"/><path d="M374 460 L380 464 L374 468"/>
  <text class="d-mono" text-anchor="middle" x="250" y="457">GET /authorize?prompt=select_account</text>
  <path d="M380 496 H120"/><path d="M126 492 L120 496 L126 500"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="489">chooser UI — 両アカウント</text>
  <path d="M120 528 H380"/><path d="M374 524 L380 528 L374 532"/>
  <text class="d-mono" text-anchor="middle" x="250" y="521">POST /interaction/{uid}</text>
  <text class="d-mono d-sm d-mut" text-anchor="middle" x="250" y="542">{ state_ref, values: { session_id } }</text>
  <rect x="268" y="552" width="224" height="36" rx="5" class="d-op"/>
  <text class="d-mono d-acc" text-anchor="middle" x="380" y="568">Sessions.Switch</text>
  <text class="d-lbl" text-anchor="middle" x="380" y="582">アクティブセッション切替</text>
  <path d="M380 608 H120"/><path d="M126 604 L120 608 L126 612"/>
  <text class="d-lbl" text-anchor="middle" x="250" y="601"><tspan class="d-mono">302</tspan> → RP callback（選択した sub）</text>
  <path d="M120 632 H620"/><path d="M614 628 L620 632 L614 636"/>
  <text class="d-lbl d-mut" text-anchor="middle" x="370" y="625">ブラウザがリダイレクト追従</text>
</svg>

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
