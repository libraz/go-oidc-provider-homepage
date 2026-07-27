---
title: 同意
description: 同意画面が表示されるタイミング、スキップされる条件、ファーストパーティクライアントが何を変えるか、監査トレイルが何を記録するか。
pageClass: pg-concepts-consent
---

# 同意

**同意（consent）** とは、ユーザが「このアプリにこの scope を渡してよい」と明示する意思表示です。OIDC Core 1.0 §3.1.2.4 はタイミングを条件付き（"OP MUST obtain authorization information from the End-User"）に留めていますが、本ライブラリのデフォルトは「クライアントが scope 集合を最初に要求したときに同意画面を出し、その回答を覚える」です。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4（同意）、§3.1.2.1（`prompt`）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §3.3（scope）、§6（refresh）
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — トークン失効
:::

::: tip メンタルモデル
- **grant** とは「ユーザ U が時刻 T に scope 集合 S をクライアント C に認めた」という記録の行。
- 既存の grant でカバーされない scope を要する authorize フローの最初の 1 回で **同意画面** が表示される。
- 同じ scope 集合内に収まる以降のフローは、プロンプトを **スキップ** する。
- 新しい scope の追加（**scope delta**）は、その差分だけを尋ねるプロンプトを再度呼び出す。
- grant を失効させると行が消え、次の authorize フローでは再びプロンプトが出る。
:::

## 同意画面が表示されるタイミング

本ライブラリは authorize フローのたびに次の 4 つを評価します。

<svg id="consent-shown-decision" role="img" aria-labelledby="consent-shown-decision-title" viewBox="0 0 700 384" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="consent-shown-decision-title">grant の状態に対する判定木: prompt=consent、grant が無い、要求 scope が既存 grant の範囲外、のいずれかで同意画面を表示し、それ以外は既存 grant が要求をカバーするためプロンプトなしで認可コードを発行する。</title>
  <rect x="24" y="28" width="270" height="48" rx="8"/>
  <rect x="24" y="120" width="270" height="48" rx="8"/>
  <rect x="24" y="212" width="270" height="48" rx="8"/>
  <rect x="24" y="304" width="270" height="48" rx="8" class="accent"/>
  <rect x="470" y="28" width="210" height="48" rx="8"/>
  <rect x="470" y="120" width="210" height="48" rx="8"/>
  <rect x="470" y="212" width="210" height="48" rx="8"/>
  <text class="lbl" x="159" y="47" text-anchor="middle">リクエストが</text>
  <text x="159" y="64" text-anchor="middle"><tspan class="mono">prompt=consent</tspan><tspan class="lbl"> を含む?</tspan></text>
  <text x="159" y="139" text-anchor="middle"><tspan class="mono">(subject, client_id)</tspan><tspan class="lbl"> の</tspan></text>
  <text class="lbl" x="159" y="156" text-anchor="middle">既存 grant が無い?</text>
  <text class="lbl" x="159" y="231" text-anchor="middle">要求 scope が既存</text>
  <text class="lbl" x="159" y="248" text-anchor="middle">grant の範囲外?</text>
  <text class="lbl" x="159" y="323" text-anchor="middle">既存 grant が要求をカバー</text>
  <text class="sub" x="159" y="340" text-anchor="middle">&#8594; スキップして認可コードを発行</text>
  <text class="lbl" x="575" y="47" text-anchor="middle">強制再プロンプト</text>
  <text class="sub" x="575" y="64" text-anchor="middle">&#8594; 同意画面を表示</text>
  <text class="lbl" x="575" y="139" text-anchor="middle">初回 grant</text>
  <text class="sub" x="575" y="156" text-anchor="middle">&#8594; 同意画面を表示</text>
  <text class="lbl" x="575" y="231" text-anchor="middle">Scope delta</text>
  <text class="sub" x="575" y="248" text-anchor="middle">&#8594; 同意画面を表示</text>
  <path d="M294 52 H464"/>
  <path d="M464 48 L470 52 L464 56"/>
  <path d="M294 144 H464"/>
  <path d="M464 140 L470 144 L464 148"/>
  <path d="M294 236 H464"/>
  <path d="M464 232 L470 236 L464 240"/>
  <path d="M159 76 V114"/>
  <path d="M155 114 L159 120 L163 114"/>
  <path d="M159 168 V206"/>
  <path d="M155 206 L159 212 L163 206"/>
  <path d="M159 260 V298"/>
  <path d="M155 298 L159 304 L163 298"/>
  <text class="edge" x="382" y="46" text-anchor="middle">はい</text>
  <text class="edge" x="382" y="138" text-anchor="middle">はい</text>
  <text class="edge" x="382" y="230" text-anchor="middle">はい</text>
  <text class="edge" x="170" y="101">いいえ</text>
  <text class="edge" x="170" y="193">いいえ</text>
  <text class="edge" x="170" y="285">いいえ</text>
</svg>

| ケース | 挙動 |
|---|---|
| **初回 grant** — その `(subject, client_id)` ペアに対する `Grant` が存在しない。 | プロンプト。ユーザは scope の全リストを目にします。送信時、本ライブラリは承認された scope を含む `Grant` 行を書き込みます。 |
| **Scope delta** — `Grant` は存在するが、要求された scope 集合に「過去に承認されていない scope」が含まれる。 | プロンプト。差分が強調表示されます。ユーザは差分のみ承認、差分を拒否、全体を拒否のいずれかを選べます。承認時に行が更新されます。 |
| **強制再プロンプト** — リクエストが `prompt=consent` を持つ。 | grant の状態に関係なくプロンプト。OIDC §3.1.2.1 が要求する挙動です。 |
| **既存 grant が要求をカバー** — `Grant` 行がすべての要求 scope をカバーしており、`prompt` が `none` または `login`（`consent` ではない）。 | スキップ。本ライブラリは認可コード発行に直接進み、`op.AuditConsentSkippedExisting` を発火します。 |

::: details `prompt=none`、`prompt=login`、`prompt=consent` の違い
- `prompt=none` — 「ユーザがログイン済みで同意も整っているなら、フローを静かに完了させる。さもなくばエラーを返す」。SPA の静かな再認証で使う。
- `prompt=login` — 「有効なセッションがあっても、ユーザに再認証させる」。これだけでは同意の再プロンプトは強制されない。
- `prompt=consent` — 「grant が scope をカバーしていても、同意画面を強制する」。RP が機微な操作の前にユーザに再確認させたいときに有用。

本ライブラリは OIDC Core 1.0 §3.1.2.1 に沿ってこれらを適用します。`prompt=none` と `prompt=login` の併用は `interaction_required` で拒否します。
:::

## ファーストパーティクライアント

組み込み側によっては、信頼された少数のアプリ — 主力 web クライアント、社内管理コンソール、自社モバイルアプリ — を運用しており、配備時点で操作者が scope カタログを事前承認しているため、同意画面はユーザを煩わせるだけ、ということがあります。こうしたクライアント向けに `op.WithFirstPartyClients(ids ...string)` は、指定した `client_id` 値について、`Grant` 行の有無に関わらず同意画面を **スキップ** します。要求 scope が操作者の事前承認カタログに含まれている場合に限ります。

重要な注意 2 点。

1. **スキップは記録される。** 本ライブラリは `Grant` 行を通常通り書き込み、`op.AuditConsentGrantedFirstParty` を発火します — 「このユーザは結局どの scope を承認したのか」という監査の問いには答えられます。変わるのは「ユーザが画面を見たかどうか」だけです。
2. **`prompt=consent` はスキップを上書きする。** ファーストパーティクライアントが明示的に `prompt=consent` を要求した場合、同意画面は表示されます。スキップは静かな既定経路のための仕組みであって、上書きの選択肢は残します。

完全な設定（操作者側の scope カタログを含む）は [ファーストパーティの使い方](/ja/use-cases/first-party) を参照。

::: warning ファーストパーティは操作者が宣言するもので、ユーザが宣言するものではない
ユーザは同意フローで「これはファーストパーティアプリです」とは見せられません。信頼の根拠は、操作者が `op.WithFirstPartyClients(...)` に `client_id` を列挙していることです。コードパスをエンドツーエンドで管理していないクライアントを列挙してはなりません — そうするとスキップが「告知のない scope 付与」に変わってしまいます。
:::

## 同意 UI の呼び出し方

プロンプトが必要になると、本ライブラリは組み込み側の `op.ConsentUI` テンプレート（`op.WithConsentUI(...)` で登録）に制御を渡します。テンプレートが HTML をレンダリングし、本ライブラリが state、CSRF、`__Host-oidc_csrf` の double-submit cookie、永続化を担当します。

```go
op.WithConsentUI(op.ConsentUI{
    Template: myConsentTemplate, // *template.Template
})
```

テンプレートには、要求 scope（既存 grant に対する delta があればそれも）、`client_id`、クライアントメタデータの任意のクライアントロゴ / 表示名、フォームに埋め込む CSRF トークンが渡されます。フォームの `POST` を受けて、本ライブラリは CSRF を検証し、承認された scope 集合を解析し、`Grant` 行を書き込み、authorize フローを継続します。

クライアント側で同意を描画する SPA（ログインフォームをすでに扱っている React アプリなど）では、SPA の入口と静的アセットも OP にマウントさせたい場合に `op.WithSPAUI(...)` を使います。このモードではブラウザは `LoginMount/{uid}` に着地し、SPA はプロンプトの状態を `LoginMount/state/{uid}` から取得します。SPA 本体を自前のルータで配信する場合は、低レベルな `op.WithInteractionDriver(interaction.JSONDriver{})` 経路を使います。この場合、状態取得エンドポイントは `/interaction/{uid}` のままです。

`WithSPAUI` と `WithConsentUI` はどちらも同意描画面を所有するため相互排他です。コンストラクタは両方同時には受け付けません。route 形と使い分けは [SPA カスタムインタラクションの使い方](/ja/use-cases/spa-custom-interaction) を参照してください。

## 同意の失効

ユーザ（または管理者）はいつでも grant を失効できます。失効は 2 つの経路を通ります。

1. **`/revoke`（RFC 7009）** — 単一トークン（refresh または access）を無効化します。これは背後の `Grant` 行には触れません — 同じ scope での次の authorize フローはまだ grant を見つけ、同意をスキップします。
2. **Grant の失効** — `Grant` 行の `Revoked` 列を切り替えます。本ライブラリは `Grants` と `AccessTokens` の substore を通じてカスケードします — その grant に連なるすべてのリフレッシュトークン連鎖が無効化され、すべてのアクセストークン shadow row が revoked に切り替わり、JWT AT は OP が応答するすべてのエンドポイント（`/userinfo`、`/introspect`）で inactive になります。ユーザの次の authorize フローはカバーする grant を見つけられず、再び同意画面を出します。

カスケードは `internal/revokeendpoint`、`op/store/grant_revocation.go`、`op/store/cascade.go` にまたがって実装されています。各経路はそれぞれの監査イベントを発火するので、ダッシュボードが何が起きたかを再構成できます。end-session カスケード（[セッションとログアウト](/ja/concepts/sessions-and-logout#end-session-カスケード)）も同じ仕組みを再利用します。

## 監査イベント

token endpoint と同意フローは、`op.WithAuditLogger` 経由で 5 つの同意関連監査イベントを発火します。

| イベント | 発火タイミング |
|---|---|
| `op.AuditConsentGranted` | ユーザが同意フォームを送信し、`Grant` 行が書き込まれた。 |
| `op.AuditConsentGrantedFirstParty` | ファーストパーティの自動同意が適用された（プロンプトは出していない）。 |
| `op.AuditConsentGrantedDelta` | 既存 grant がある状態で、ユーザが scope delta を承認した。 |
| `op.AuditConsentSkippedExisting` | 既存 grant が要求をカバーしており、プロンプトをスキップした。 |
| `op.AuditConsentRevoked` | grant が `Revoked` に切り替わった。 |

これらを組み合わせると、SOC ダッシュボードで「ユーザが明示的に同意画面をクリックした」と「操作者が事前承認した静かな経路でこのクライアントが同意を得た」を区別できます — 特定の `Grant` 行がなぜ存在するのかを振り返る際に有用です。

## 次に読む

- [使い方: ファーストパーティクライアント](/ja/use-cases/first-party) — 操作者側の scope カタログ、`op.WithFirstPartyClients`、監査ポスチャ。
- [使い方: カスタム同意 UI](/ja/use-cases/custom-consent-ui) — `op.ConsentUI` の設定、テンプレート契約、CSRF の扱い。
- [リファレンス: 監査イベント](/ja/reference/audit-events) — 本ライブラリが発火するすべての監査イベントと付随する extras。
