---
title: 同意
description: 同意 prompt、scope の絞り込み、RAR の既存 grant 判定、first-party skip、実際に発火する audit を整理する。
pageClass: pg-concepts-consent
---

# 同意

**同意（consent）** とは、ユーザが「このアプリにこの scope を渡してよい」と明示する意思表示です。OIDC Core 1.0 §3.1.2.4 はタイミングを条件付きに留めており、OP がエンドユーザから認可情報を取得することだけを要求しています。本ライブラリのデフォルトは、クライアントが scope 集合を最初に要求したときに同意画面を出し、その回答を覚えることです。

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

<figure class="fig">
  <div class="fig-head">同意画面が表示される条件</div>
  <svg class="fig-svg" role="img" aria-labelledby="consent-decision-title" viewBox="0 0 960 404" xmlns="http://www.w3.org/2000/svg">
    <title id="consent-decision-title">同意画面を出すかどうかを 3 つの判定で決める図。prompt=consent の明示、この subject と client_id に対する grant が無い、要求 scope が既存 grant の範囲外、のいずれかで表示します。どれにも当たらなければ既存 grant が要求をカバーしているため、プロンプトなしで認可コードを発行します。</title>
    <!-- 判定 1 -->
    <rect class="fg-box" x="36" y="30" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="58">リクエストが次を含む</text>
    <text class="fg-m" x="56" y="76">prompt=consent</text>
    <path class="fg-edge" d="M434,63 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="56" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--warn" x="530" y="34" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="58">強制的な再確認</text>
    <text class="fg-xs" x="550" y="76">既存 grant が要求をカバーしていても同意画面を表示する</text>
    <path class="fg-edge" d="M233,100 V126" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="118">いいえ</text>
    <!-- 判定 2 -->
    <rect class="fg-box" x="36" y="130" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="158">次の組に対する grant が存在しない</text>
    <text class="fg-m" x="56" y="176">(subject, client_id)</text>
    <path class="fg-edge" d="M434,163 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="156" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--warn" x="530" y="134" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="158">初回の grant</text>
    <text class="fg-xs" x="550" y="176">同意画面を表示し、ユーザが同意した範囲を記録する</text>
    <path class="fg-edge" d="M233,200 V226" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="218">いいえ</text>
    <!-- 判定 3 -->
    <rect class="fg-box" x="36" y="230" width="394" height="66" rx="8"/>
    <text class="fg-s" x="56" y="258">要求 scope に既存 grant の</text>
    <text class="fg-s" x="56" y="276">範囲外のものが含まれる</text>
    <path class="fg-edge" d="M434,263 H526" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="480" y="256" text-anchor="middle">はい</text>
    <rect class="fg-box fg-box--warn" x="530" y="234" width="394" height="58" rx="8"/>
    <text class="fg-t2" x="550" y="258">scope の差分</text>
    <text class="fg-xs" x="550" y="276">全体ではなく差分について同意画面を表示する</text>
    <path class="fg-edge" d="M233,300 V326" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="243" y="318">いいえ</text>
    <!-- 結果 -->
    <rect class="fg-box fg-box--accent" x="36" y="330" width="888" height="58" rx="8"/>
    <text class="fg-t2 fg-accent" x="56" y="354">既存 grant が要求をすでにカバーしている</text>
    <text class="fg-xs" x="56" y="372">プロンプトなしで認可コードを発行し、そのままリダイレクトで返す</text>
  </svg>
  <figcaption class="fig-note">scope を見るのは 3 つ目の判定だけです。運用中の統合に scope をひとつ足すと全ユーザに同意画面が再表示されるのはこのためで、リクエストが既存の grant に収まらなくなり、OP は同意を得ていない範囲へ grant を広げないからです。</figcaption>
</figure>

| ケース | 挙動 |
|---|---|
| **初回 grant** — その `(subject, client_id)` ペアに対する `Grant` が存在しない。 | プロンプト。ユーザは scope の全リストを目にします。送信時、本ライブラリは承認された scope を含む `Grant` 行を書き込みます。 |
| **Scope delta** — `Grant` は存在するが、要求された scope 集合に「過去に承認されていない scope」が含まれる。 | プロンプト。差分が強調表示されます。ユーザは差分のみ承認、差分を拒否、全体を拒否のいずれかを選べます。承認時に行が更新されます。 |
| **強制再プロンプト** — リクエストが `prompt=consent` を持つ。 | grant の状態に関係なくプロンプト。OIDC §3.1.2.1 が要求する挙動です。 |
| **既存 grant が要求をカバー** — `Grant` 行がすべての要求 scope と、要求されたすべての `authorization_details` 要素をカバーしており、`prompt` が `none` または `login`（`consent` ではない）。 | スキップ。本ライブラリは認可コード発行に直接進みます。スキップ専用の監査イベントはありません。 |

::: details `prompt=none`、`prompt=login`、`prompt=consent` の違い
- `prompt=none` — 「ユーザがログイン済みで同意も整っているなら、フローを静かに完了させる。さもなくばエラーを返す」。SPA の静かな再認証で使う。
- `prompt=login` — 「有効なセッションがあっても、ユーザに再認証させる」。これだけでは同意の再プロンプトは強制されない。
- `prompt=consent` — 「grant が scope をカバーしていても、同意画面を強制する」。RP が機微な操作の前にユーザに再確認させたいときに有用。

本ライブラリは OIDC Core 1.0 §3.1.2.1 に沿ってこれらを適用します。`prompt=none` と `prompt=login` の併用は `interaction_required` で拒否します。
:::

## 終端 subject に対する coverage の再確認

最初の coverage 判定は authorize 開始時点で参照できる subject を使います。`prompt=login`、`max_age` の期限切れ、RFC 9470 の step-up では、その後の認証で別の subject に結び付くことがあります。account chooser によるアカウント切替も同様です。認可コードを発行する前に、本ライブラリは要求された scope と `authorization_details` を終端 subject 自身の grant に対してもう一度判定します。その grant が要求をカバーしなければ、最初の subject の grant で認可することはなく、終端 subject に対する同意を取得するか、コードを発行せずにフローを終了します。

## consent-only 発行時の認証コンテキスト

認証 factor を実行せず、live session が残っている場合、認可コードと grant はその session の `auth_time`、`acr`、`amr` を保持します。同意画面への回答時刻で `auth_time` を置き換えたり、空の factor set で `acr` や `amr` を消したりしません。session の期限切れ、別タブでのログアウト、アカウント切替などで live context が残っていない場合は、存在しない認証コンテキストを作らず `login_required` で拒否します。

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

RFC 9396 の `authorization_details` は deep equality でカバー判定します。新しい要素やメンバの変更があれば、scope 集合が既にカバーされていても同意を求めます。組み込みの同意契約が扱うのは scope の承認で、detail ごとの承認・絞り込み UI はありません。通常の同意が完了すると、要求された detail は grant と一緒に永続化されます。

クライアント側で同意を描画する SPA（ログインフォームをすでに扱っている React アプリなど）では、SPA の入口と静的アセットも OP にマウントさせたい場合に `op.WithSPAUI(...)` を使います。このモードではブラウザは `LoginMount/{uid}` に着地し、SPA はプロンプトの状態を `LoginMount/state/{uid}` から取得します。SPA 本体を自前のルータで配信する場合は、低レベルな `op.WithInteractionDriver(interaction.JSONDriver{})` 経路を使います。この場合、状態取得エンドポイントは `/interaction/{uid}` のままです。

`WithSPAUI` と `WithConsentUI` はどちらも同意描画面を所有するため相互排他です。コンストラクタは両方同時には受け付けません。route 形と使い分けは [SPA カスタムインタラクションの使い方](/ja/use-cases/spa-custom-interaction) を参照してください。

## 同意の失効

ユーザ（または管理者）はいつでも grant を失効できます。失効は 2 つの経路を通ります。

1. **`/revoke`（RFC 7009）** — 単一トークン（refresh または access）を無効化します。これは背後の `Grant` 行には触れません — 同じ scope での次の authorize フローはまだ grant を見つけ、同意をスキップします。
2. **Grant の失効** — `Grant` 行の `Revoked` 列を切り替えます。本ライブラリは `Grants` と `AccessTokens` の substore を通じてカスケードします — その grant に連なるすべてのリフレッシュトークン連鎖が無効化され、すべてのアクセストークン shadow row が revoked に切り替わり、JWT AT は OP が応答するすべてのエンドポイント（`/userinfo`、`/introspect`）で inactive になります。ユーザの次の authorize フローはカバーする grant を見つけられず、再び同意画面を出します。

カスケードは `internal/revokeendpoint`、`op/store/grant_revocation.go`、`op/store/cascade.go` にまたがって実装されています。Grant Management による失効が成功すると `grant_management.revoked` を発火します。一方、一般的な grant / token 失効に対して専用の `consent.revoked` イベントは発火しません。end-session カスケード（[セッションとログアウト](/ja/concepts/sessions-and-logout#end-session-カスケード)）も同じ仕組みを再利用します。

## 監査イベント

同意フローは、`op.WithAuditLogger` 経由で 2 つの同意関連監査イベントを発火します。

| イベント | 発火タイミング |
|---|---|
| `op.AuditConsentGranted` | ユーザが同意フォームを送信し、`Grant` 行が書き込まれた。 |
| `op.AuditConsentGrantedFirstParty` | ファーストパーティの自動同意が適用された（プロンプトは出していない）。 |

`op.AuditConsentGranted` は scope や rich authorization detail を追加する通常の再同意も表します。本ライブラリは `AuditConsentGrantedDelta`、`AuditConsentSkippedExisting`、`AuditConsentRevoked` を発火しません。Grant Management による失効の成功は `op.AuditGrantManagementRevoked` で報告されます。

発火する同意イベントを組み合わせると、SOC ダッシュボードで「ユーザが明示的に同意画面をクリックした」と「操作者が事前承認した静かな経路でこのクライアントが同意を得た」を区別できます — 特定の `Grant` 行がなぜ存在するのかを振り返る際に有用です。

## 次に読む

- [使い方: ファーストパーティクライアント](/ja/use-cases/first-party) — 操作者側の scope カタログ、`op.WithFirstPartyClients`、監査の方針。
- [使い方: カスタム同意 UI](/ja/use-cases/custom-consent-ui) — `op.ConsentUI` の設定、テンプレート契約、CSRF の扱い。
- [リファレンス: 監査イベント](/ja/reference/audit-events) — 本ライブラリが発火するすべての監査イベントと付随する extras。
