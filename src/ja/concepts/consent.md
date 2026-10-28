---
title: 同意
description: 同意 prompt、scope の絞り込み、RAR の既存 grant 判定、first-party skip、実際に発火する audit を整理する。
pageClass: pg-concepts-consent
---

# 同意

**同意（consent）** とは、ユーザが「このアプリにこの scope を渡してよい」と明示する意思表示です。OIDC Core 1.0 §3.1.2.4 はタイミングを定めておらず、情報を渡す前に OP が認可の判断を得ることだけを要求しています。本ライブラリは、クライアントが scope 集合を初めて要求したときに同意画面を出し、その回答を覚えます。

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1.2.4（同意）、§3.1.2.1（`prompt`）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §3.3（scope）、§6（refresh）
- [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — トークン失効（§2.1 のカスケード）
:::

::: tip メンタルモデル
- **grant** とは「ユーザ U がクライアント C に scope 集合 S を認めた」という記録で、`(subject, client_id)` の組で引く。
- 既存の grant でカバーされない scope を要する authorize フローの最初の 1 回で **同意画面** が表示される。
- 同じ scope 集合内に収まる以降のフローは、プロンプトを **スキップ** する。
- 新しい scope の追加（**scope delta**）は、その差分だけを尋ねるプロンプトを再度呼び出す。
- grant を失効させると記録が削除され、次の authorize フローでは再びプロンプトが出る。
:::

## 同意画面が表示されるタイミング

OP は authorize フローのたびに、図の順で次の 4 つのケースを評価します。

<figure class="fig">
  <div class="fig-head">同意画面は 3 つの条件のどれかで表示される</div>
  <svg class="fig-svg" role="img" aria-labelledby="consent-decision-title" viewBox="0 0 960 456" xmlns="http://www.w3.org/2000/svg">
    <title id="consent-decision-title">同意画面を出すかどうかを 3 つの判定で決める図。prompt=consent の明示、この subject と client_id に対する grant が無い、要求 scope が既存 grant の範囲外、のいずれかで表示します。どれにも当たらなければ既存 grant が要求をカバーしているため、プロンプトなしで認可コードを発行します。</title>
    <!-- gate 1 -->
    <rect class="fg-box" x="32" y="24" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="52">リクエストが次を含む</text>
    <text class="fg-m" x="48" y="76">prompt=consent</text>
    <path class="fg-edge" d="M464,60 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="50" text-anchor="middle">はい</text>
    <rect class="fg-box" x="560" y="24" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="52">強制的な再確認</text>
    <text class="fg-xs" x="576" y="76">grant があっても同意画面を出す</text>
    <path class="fg-edge" d="M248,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="121">いいえ</text>
    <!-- gate 2 -->
    <rect class="fg-box" x="32" y="136" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="164">次の組に対する grant が存在しない</text>
    <text class="fg-m" x="48" y="188">(subject, client_id)</text>
    <path class="fg-edge" d="M464,172 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="162" text-anchor="middle">はい</text>
    <rect class="fg-box" x="560" y="136" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="164">初回の grant</text>
    <text class="fg-xs" x="576" y="188">同意画面を表示し、同意範囲を記録する</text>
    <path class="fg-edge" d="M248,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="233">いいえ</text>
    <!-- gate 3 -->
    <rect class="fg-box" x="32" y="248" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="276">要求 scope が既存 grant の範囲外</text>
    <text class="fg-xs" x="48" y="300">既存 grant ではカバーできない</text>
    <path class="fg-edge" d="M464,284 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="274" text-anchor="middle">はい</text>
    <rect class="fg-box" x="560" y="248" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="276">scope の差分</text>
    <text class="fg-xs" x="576" y="300">全体ではなく差分だけ同意を求める</text>
    <path class="fg-edge" d="M248,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="345">いいえ</text>
    <!-- outcome -->
    <rect class="fg-box fg-box--accent" x="32" y="360" width="896" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="388">既存 grant が要求をすでにカバーしている</text>
    <text class="fg-xs" x="48" y="412">プロンプトなしで認可コードを発行し、そのままリダイレクトで返す</text>
  </svg>
  <figcaption class="fig-note">scope を見るのは 3 つ目の判定だけです。運用中の統合に scope をひとつ足すと全ユーザに同意画面が再表示されるのはこのためで、リクエストが既存の grant に収まらなくなり、OP は同意を得ていない範囲へ grant を広げないからです。</figcaption>
</figure>

| ケース | 挙動 |
|---|---|
| **初回 grant** — その `(subject, client_id)` ペアに対する `Grant` が存在しない。 | プロンプト。ユーザは scope の全リストを目にします。送信時、本ライブラリは承認された scope を含む `Grant` 行を書き込みます。 |
| **Scope delta** — `Grant` は存在するが、要求された scope 集合に「過去に承認されていない scope」が含まれる。 | プロンプト。差分が強調表示されます。ユーザは差分のみ承認、差分を拒否、全体を拒否のいずれかを選べます。承認時に行が更新されます。 |
| **強制再プロンプト** — リクエストが `prompt=consent` を持つ。 | grant の状態に関係なくプロンプト。OIDC §3.1.2.1 が要求する挙動です。 |
| **既存 grant が要求をカバー** — `Grant` 行がすべての要求 scope と、要求されたすべての `authorization_details` 要素をカバーしており、`prompt` が省略、`none`、または `login`（`consent` ではない）。 | スキップ。本ライブラリは認可コード発行に直接進みます。スキップ専用の監査イベントはありません。 |

grant は同意画面から作られるものに限りません。device code、CIBA、token exchange の引き換えでも、対象クライアントに対する `store.Grant` が記録されます。`/auth` はこの grant も同意として扱うため、同じ scope を求める後続の要求では同意画面が出ません。

同意をスキップしても、認証ルールはスキップされません。既存セッションからコードを発行する前に、`/auth` は `LoginFlow` のルールと `Decider` を、チェーンが `Primary` を完了した直後であるかのように評価します。`RuleClient` や `RuleScope` による step-up が該当すれば、その step を先に実行します。`prompt=none` の場合は代わりに `interaction_required` を返します。この判定は、grant がカバーしている経路と、後述のファーストパーティのスキップの両方に適用されます。

::: details `prompt=none`、`prompt=login`、`prompt=consent` の違い
- `prompt=none` — 「ユーザがログイン済みで同意も整っているなら、フローを静かに完了させる。さもなくばエラー（`login_required`、`consent_required`、`interaction_required`）を返す」。SPA の静かな再認証で使う。
- `prompt=login` — 「有効なセッションがあっても、ユーザに再認証させる」。これだけでは同意の再プロンプトは強制されない。
- `prompt=consent` — 「grant が scope をカバーしていても、同意画面を強制する」。RP が機微な操作の前にユーザに再確認させたいときに有用。

本ライブラリは OIDC Core 1.0 §3.1.2.1 に沿ってこれらを適用します。`prompt=none` と `prompt=login` の併用は `invalid_request` で拒否します。
:::

## 終端 subject に対する coverage の再確認

最初の coverage 判定は authorize 開始時点で参照できる subject を使います。`prompt=login`、`max_age` の期限切れ、RFC 9470 の step-up では、その後の認証で別の subject に結び付くことがあります。account chooser によるアカウント切替も同様です。認可コードを発行する前に、本ライブラリは要求された scope と `authorization_details` を終端 subject 自身の grant に対してもう一度判定します。その grant が要求をカバーしなければ、最初の subject の grant で認可することはなく、終端 subject に対する同意を取得するか、コードを発行せずにフローを終了します。

## consent-only 発行時の認証コンテキスト

認証 factor を実行せず、live session が残っている場合、認可コードと grant はその session の `auth_time`、`acr`、`amr` を保持します。同意画面への回答時刻で `auth_time` を置き換えたり、空の factor set で `acr` や `amr` を消したりしません。session の期限切れ、別タブでのログアウト、アカウント切替などで live context が残っていない場合は、存在しない認証コンテキストを作らず `login_required` で拒否します。

## ファーストパーティクライアント

組み込み側によっては、主力 web クライアント、社内管理コンソール、自社モバイルアプリのような信頼された少数のアプリを運用しており、同意画面がユーザの手間にしかならないことがあります。`op.WithFirstPartyClients(ids ...string)` は、指定した `client_id` について、`Grant` の有無にかかわらず同意画面を **スキップ** します。列挙した ID は `op.WithStaticClients` でも登録されている必要があります。スキップの対象は静的に seed したクライアントと管理者が作成したクライアントだけで、動的登録されたクライアントには適用されません。

スキップが働くのは、次の条件がすべて満たされるときだけです。

- ユーザにすでにセッションがある。スキップが subject を新たに作ることはありません。
- 要求が `prompt=consent` を持たない。`prompt=consent` は常に画面を出します。
- scope に `offline_access` を含まず、`authorization_details` も Grant Management の操作も含まない。これらは常に明示的な画面を出します。
- ブラウザが `Sec-Fetch-Site: same-origin` を送る、または `same-site` で `Origin` か `Referer` が `redirect_uri` の origin と一致する。cross-site のナビゲーションではスキップしません。

あわせて 2 点あります。

1. **スキップは記録される。** 本ライブラリは `Grant` 行を通常通り書き込み、`op.AuditConsentGrantedFirstParty` を発火します。「このユーザは結局どの scope を承認したのか」という監査の問いには答えられます。変わるのは、ユーザが画面を見たかどうかだけです。
2. **FAPI 2.0 プロファイルでは使えない。** `WithFirstPartyClients` を `profile.FAPI2Baseline` や `profile.FAPI2MessageSigning` と併用すると、`op.New` が失敗します。

完全な設定（操作者側の scope カタログを含む）は [ファーストパーティ同意スキップ](/ja/use-cases/first-party) を参照。

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

テンプレートには、クライアント（ID、表示名、ロゴなどのクライアントメタデータ）、要求 scope（既存 grant に対する delta があればそれも）、フォームに埋め込む CSRF トークンが渡されます。`Required` が付いた scope はユーザが外せません。`ConsentUI.ContentSecurityPolicy` は同意ページの CSP を指定します。既定ではすべてのサブリソースを禁止するため、スタイルシート、ロゴ、フォントを読み込むテンプレートは、その origin を宣言してください。フォームの `POST` を受けて、本ライブラリは CSRF を検証し、承認された scope 集合を解析し、`Grant` 行を書き込み、authorize フローを継続します。改竄された送信や古い送信には 4xx を返し、画面をキャンセルすると `access_denied` でリダイレクトします。

RFC 9396 の `authorization_details` は deep equality でカバー判定します。新しい要素やメンバの変更があれば、scope 集合が既にカバーされていても同意を求めます。組み込みの同意契約が扱うのは scope の承認で、detail ごとの承認・絞り込み UI はありません。通常の同意が完了すると、要求された detail は grant と一緒に永続化されます。

クライアント側で同意を描画する SPA（ログインフォームをすでに扱っている React アプリなど）では、SPA の入口と静的アセットも OP にマウントさせたい場合に `op.WithSPAUI(...)` を使います。このモードではブラウザは `LoginMount/{uid}` に着地し、SPA はプロンプトの状態を `LoginMount/state/{uid}` から取得します。SPA 本体を自前のルータで配信する場合は、低レベルな `op.WithInteractionDriver(interaction.JSONDriver{})` 経路を使います。この場合、状態取得エンドポイントは `/interaction/{uid}` のままです。

`WithSPAUI` と `WithConsentUI` はどちらも同意描画面を所有するため相互排他です。コンストラクタは両方同時には受け付けません。route 形と使い分けは [SPA のカスタム対話画面](/ja/use-cases/spa-custom-interaction) を参照してください。

## 同意の失効

ユーザまたは運用者は、いつでも同意を失効させられます。経路は 3 つあり、影響の範囲が異なります。

| 経路 | 失効させるもの | grant の記録 |
|---|---|---|
| トークン 1 つを指定した **`/revoke`**（RFC 7009） | そのトークン。リフレッシュトークンなら、そのローテーション連鎖全体と、grant に紐づくアクセストークン。grant の別のリフレッシュ連鎖と未引き換えのコードは有効なまま。 | 残る。次の authorize フローは引き続き同意をスキップする。 |
| **Grant Management の失効**（grant に対する `DELETE`） | grant に紐づくすべてのアクセストークンとリフレッシュトークン。 | 削除される。次の authorize フローはカバーする grant を見つけられず、再び同意を求める。 |
| **`Provider.RevokeSubject(ctx, subject)`** | subject が持つすべての grant について、上と同じ。ユーザの無効化やプロビジョニング解除向け。 | 削除される。 |

3 つは同じ失効処理を共有するため、JWT アクセストークン、opaque アクセストークン、リフレッシュトークンは入口によらず同じ方法で失効します。device code、CIBA、token exchange の引き換えで発行されたトークンは grant の配下にあるため、これらの経路でも失効します。カスタム grant が発行した認証情報は、ハンドラが grant を記録しない限り対象外です。

Grant Management による失効が成功すると `grant_management.revoked` を発火します。一般的な grant / トークン失効に対して専用の `consent.revoked` イベントは発火しません。end-session カスケード（[セッションとログアウト](/ja/concepts/sessions-and-logout#end-session-カスケード)）も同じ失効処理を使いますが、grant の記録は残します。

## 監査イベント

同意フローは、`op.WithAuditLogger` 経由で 2 つの同意関連監査イベントを発火します。

| イベント | 発火タイミング |
|---|---|
| `op.AuditConsentGranted` | ユーザが同意フォームを送信し、`Grant` 行が書き込まれた。 |
| `op.AuditConsentGrantedFirstParty` | ファーストパーティの自動同意が適用された（プロンプトは出していない）。 |

`op.AuditConsentGranted` は scope や rich authorization detail を追加する通常の再同意も表します。本ライブラリは `AuditConsentGrantedDelta`、`AuditConsentSkippedExisting`、`AuditConsentRevoked` を発火しません。Grant Management による失効の成功は `op.AuditGrantManagementRevoked` で報告されます。

発火する同意イベントを組み合わせると、SOC ダッシュボードで「ユーザが明示的に同意画面をクリックした」と「操作者が事前承認した静かな経路でこのクライアントが同意を得た」を区別できます — 特定の `Grant` 行がなぜ存在するのかを振り返る際に有用です。

## 次に読む

- [ユースケース: ファーストパーティクライアント](/ja/use-cases/first-party) — 操作者側の scope カタログ、`op.WithFirstPartyClients`、監査の方針。
- [ユースケース: カスタム同意 UI](/ja/use-cases/custom-consent-ui) — `op.ConsentUI` の設定、テンプレート契約、CSRF の扱い。
- [リファレンス: 監査イベント](/ja/reference/audit-events) — 本ライブラリが発火するすべての監査イベントと付随する extras。
