---
title: リフレッシュトークン
description: ローテーション、再利用検知、猶予期間、`offline_access` の TTL バケット分離。
pageClass: pg-concepts-refresh-tokens
---

# リフレッシュトークン

**リフレッシュトークン** は、RP が再認証なしに新しいアクセストークンを得るために交換する長寿命の資格情報です。「ログイン状態の維持」はこの仕組みで実現されます。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework（§6 refresh）
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice（ローテーション・再利用検知）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §11（`offline_access`）
:::

::: details 用語の補足
- **ローテーション（rotation）** — リフレッシュトークン交換が成功するたび、古いトークンを無効化して新しいトークンを発行します。古→新のペアは、同じログインに連なる **連鎖** を形成します。
- **再利用検知（reuse detection）** — 既にローテーション済みのリフレッシュトークンが再提示されたら、OP は盗難シグナルとして扱い、連鎖全体を無効化します。下の警告セクションを参照。
- **猶予期間** — ローテーション直後の短い期間です。再試行では系列をもう一度ローテーションせず、同じ後継リフレッシュトークンを返します。送信者制約付きの場合、アクセストークンは再発行されることがあります。
- **`offline_access` scope** — OIDC が定める「ユーザがその場にいなくてもアプリに動き続けてほしい」を表明する scope。既定では offline TTL バケットの選択に使われ、`op.WithStrictOfflineAccess()` を渡すと発行条件にもなります。
:::

## ローテーションのしくみ

`grant_type=refresh_token` が成功するたびに、リフレッシュトークンは **ローテーション** します — 古いトークンは無効化され、新しいトークンが返されます。

<figure class="fig">
  <div class="fig-head">ローテーションと、消費済みトークンが戻ってきたとき</div>
  <svg class="fig-svg" role="img" aria-labelledby="rt-rotation-title" viewBox="0 0 960 566" xmlns="http://www.w3.org/2000/svg">
    <title id="rt-rotation-title">リフレッシュトークンのローテーションを示した図。交換のたびに提示されたトークンを無効化し、同じ連鎖内で新しいトークンを発行します。ローテーション済みのトークンが再提示されると OP は再利用として検知し、正規クライアントが保持しているトークンを含めて連鎖全体を失効させます。</title>
    <!-- 段階の帯 -->
    <rect class="fg-group" x="30" y="70" width="916" height="300" rx="8"/>
    <rect class="fg-group" x="30" y="378" width="916" height="172" rx="8"/>
    <text class="fg-lbl" x="42" y="88">通常の更新</text>
    <text class="fg-lbl fg-danger" x="42" y="396">盗まれたトークンが戻ってくる</text>
    <!-- ライフライン -->
    <line class="fg-life" x1="150" y1="62" x2="150" y2="550"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="550"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="550"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">RP / クライアント</text>
    <text class="fg-xs" x="150" y="49" text-anchor="middle">トークンを更新する</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box fg-box--danger" x="740" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">攻撃者</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">rt1 の複製を持つ</text>
    <!-- 初回発行 -->
    <path class="fg-edge" d="M150,110 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="104" text-anchor="middle">POST /token · grant_type=authorization_code</text>
    <path class="fg-edge fg-edge--accent" d="M500,140 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="134" text-anchor="middle">200 · access_token · refresh_token: rt1</text>
    <!-- 有効期限切れ -->
    <path class="fg-edge fg-edge--muted" d="M150,166 h28 v14 h-28" marker-end="url(#fg-am)"/>
    <text class="fg-xs" x="190" y="178">アクセストークンの有効期限が切れる</text>
    <!-- 1 回目のローテーション -->
    <path class="fg-edge" d="M150,212 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="206" text-anchor="middle">grant_type=refresh_token · refresh_token=rt1</text>
    <path class="fg-edge fg-edge--accent" d="M500,244 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="542" y="248">ローテーション</text>
    <text class="fg-mxs" x="542" y="261">rt1 を無効化 · 同じ連鎖で rt2 を発行</text>
    <path class="fg-edge fg-edge--accent" d="M500,290 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="284" text-anchor="middle">200 · access_token · refresh_token: rt2</text>
    <!-- 2 回目のローテーション -->
    <path class="fg-edge" d="M150,322 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="316" text-anchor="middle">grant_type=refresh_token · refresh_token=rt2</text>
    <path class="fg-edge fg-edge--accent" d="M500,354 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="348" text-anchor="middle">200 · access_token · refresh_token: rt3</text>
    <!-- 盗難 -->
    <path class="fg-edge fg-edge--muted" d="M150,424 H830" marker-end="url(#fg-am)"/>
    <text class="fg-xs fg-halo" x="490" y="418" text-anchor="middle">rt1 が以前に漏洩し、攻撃者が複製を保持している</text>
    <!-- 再提示 -->
    <path class="fg-edge fg-edge--danger" d="M830,456 H500" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs" x="665" y="450" text-anchor="middle">refresh_token=rt1 を再提示 — すでに消費済み</text>
    <path class="fg-edge fg-edge--danger" d="M500,484 h30 v16 h-30" marker-end="url(#fg-ad)"/>
    <text class="fg-s fg-danger" x="542" y="488">再利用を検知</text>
    <text class="fg-mxs" x="542" y="501">RevokeChain(rt1…rt3) · refresh.replay_detected</text>
    <path class="fg-edge fg-edge--danger" d="M500,536 H150" marker-end="url(#fg-ad)"/>
    <text class="fg-mxs" x="325" y="530" text-anchor="middle">400 invalid_grant — rt3 も失効している</text>
  </svg>
  <figcaption class="fig-note">最後の矢印がこの設計の要点です。正規のクライアントも手元の有効なトークンを失います。再利用が起きたということは 2 人の保持者のどちらかが攻撃者だということで、OP にはどちらかを判別できません。そこで連鎖を打ち切り、双方に再認証を求めます。</figcaption>
</figure>

::: warning 再利用検知は連鎖全体を無効化
すでにローテーション済みのリフレッシュトークンが再提示されると、OP は「資格情報が盗まれた」シグナルとして扱い、**連鎖全体を失効させます** — 盗まれたトークンも、それを起点に発行された正規のトークンも、両方とも無効になります。両者とも再認証が必要です。

これは意図的な挙動です — OP が出せる「何かがおかしい」という最強のシグナルだからです。
:::

::: details ローテーション / 再利用検知 / 連鎖失効とは
ブログ記事ではしばしば同じ意味で使われる 3 つの用語ですが、本ライブラリでは別物です。

- **ローテーション** — *正常系* の成功経路。`grant_type=refresh_token` が成功するたびに新しいリフレッシュトークンを返し、前のトークンを無効化します。既定は single-use。
- **再利用検知** — すでにローテーション済みのリフレッシュトークンが再度送られてきた状態。漏洩、マルウェア、混乱したクライアントによる複製のいずれかでしか起こり得ません。本ライブラリは盗難として扱います。
- **連鎖失効**（family revocation とも） — 再利用検知への応答。問題のトークンと同じ系統に属するリフレッシュトークン全部が無効化されます — 正規クライアントが今使っている子孫トークンも含めて。次の正規リフレッシュは失敗し、ユーザは再認証することになり、攻撃者の盗難トークンも死にます。

RFC 9700 §4.14.2 は、public クライアントのリフレッシュトークンについて、送信者制約またはローテーションによる再利用検知を要求します。ローテーションで再利用を検知した場合は、現在有効なリフレッシュトークンを失効させると説明しています。本ライブラリは、クライアント種別を問わず同じ系列全体を無効にします。
:::

## 猶予期間

正規クライアントが競合状態（同じリフレッシュトークンを 2 回フェッチしてしまった、など）に陥ったとき、本来なら再利用検知に引っかかってしまいます。`op.WithRefreshGracePeriod(d)` でローテーション後の猶予期間を調整できます。

```go
op.WithRefreshGracePeriod(2 * time.Second)
```

ローテーション成功から `d` 秒以内なら、正当な再試行で同じ後継リフレッシュトークンを回収できます。送信者制約付きのリクエストでは、OP が再試行時に提示された鍵または証明書へ結び付けたアクセストークンを新たに発行することがあります。`d` 秒を過ぎた再提示は再利用として扱います。

::: details 猶予期間中の再試行
OP は猶予期間中にリフレッシュトークンの系列を再度ローテーションせず、保存済みの後継リフレッシュトークンを返します。Bearer の応答はそのまま再送できます。DPoP または mTLS を使う場合は、同じ後継リフレッシュトークンと ID トークンを保ち、再試行で提示された送信者制約に合わせてアクセストークンを再発行します。保存済みの再試行用応答がない場合は、後継トークンを失効させずに `invalid_grant` を返します。猶予期間後に古いトークンを提示すると、再利用検知と系列の失効が起きます。期間を 0 にすると再試行を受け付けず、応答の取りこぼしを再利用と判定する可能性が高まります。
:::

::: tip 既定は 60 秒
`WithRefreshGracePeriod` を渡さない場合の猶予期間は **60 秒**（`refresh.GraceTTLDefault`）です。`op.WithRefreshGracePeriod(0)` で猶予期間を完全無効化（厳密な single-use）し、0 以上の値で猶予期間を明示設定できます。負値は構築時に拒否されます。

OFCS のリフレッシュトークン回帰テストはローテーションとリトライの間に約 32 秒待つため、それ以下の猶予期間に縮めると適合性が後退します。

`profile.FAPI2Baseline` と `profile.FAPI2MessageSigning` では、0 秒から既定の **60 秒まで（60 秒を含む）** の明示設定が許容されます。60 秒を超える猶予期間だけが `op.New` で拒否され、オプションを省略した場合は既定値が使われます。この上限はライブラリの設定であり、現行 FAPI 仕様への適合条件ではありません。Security Profile §5.3.2.1(9) は、例外的な状況を除く通常のリフレッシュトークンローテーションを禁止しています。`profile.FAPICIBA` にはこのリフレッシュ猶予の上限検査は適用されず、より長い猶予期間も設定できます。

```go
// NG: FAPI Baseline では 60 秒を超える猶予窓は指定できない
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithRefreshGracePeriod(61*time.Second),
)

// OK: FAPI Baseline では 60 秒（既定値）も許容される
op.New(
  op.WithProfile(profile.FAPI2Baseline),
  op.WithRefreshGracePeriod(60*time.Second),
)
```
:::

## ローテーション時に現在のクライアント登録 scope を再検証する

リフレッシュトークンは連鎖の開始時に付与された scope を記録しますが、ローテーションが後から変更されたクライアント登録を迂回することはありません。提示されたトークンを消費する前に、OP は要求された scope とトークンに束縛された scope の積集合を実効 scope として求めます（要求を省略した場合は束縛済み scope を再利用します）。その実効 scope と現在のクライアントの `Scopes` 登録との積集合が実効 scope と一致するかを再検証し、scope ごとの `AllowedClients` ポリシーも検証します。発行対象の scope が現在の登録に含まれなくなっていれば `/token` は `invalid_scope` を返し、提示されたトークンは未消費のまま残ります。これにより、クライアント登録を狭めても、既存の連鎖が削除済み scope を発行し続けることはありません。

## TTL バケット

| Option | デフォルト | 適用範囲 |
|---|---|---|
| `op.WithRefreshTokenTTL(d)` | 30 日 | 通常のリフレッシュトークン。 |
| `op.WithRefreshTokenOfflineTTL(d)` | `WithRefreshTokenTTL` を継承 | `offline_access` scope で発行されたリフレッシュトークン。 |

バケットを分けることで、`offline_access`（ログイン状態の維持）には長寿命を持たせつつ、通常のリフレッシュトークンは短いローテーション間隔を維持できます。

## 発行の判定

既定では、リフレッシュトークンの発行には次の 3 条件が必要です。

1. OP が `refresh_token` グラントを有効にしている。
2. クライアントの `GrantTypes` に `refresh_token` が含まれている。
3. 付与された scope に `openid` が含まれている。

条件を満たさない場合でも、認可コードの交換はアクセストークンを返して成功できますが、リフレッシュトークンは付きません。ID トークンが返るのは、付与された scope に `openid` が含まれる場合だけです。`op.WithOpenIDScopeOptional()` を使う OAuth 専用の構成では `openid` 条件が外れ、`op.WithStrictOfflineAccess()` を使う構成では `offline_access` 条件が加わります。この 2 つのオプションは併用できません。

OIDC Core 1.0 §11 の既定（緩やかな）解釈では、`offline_access` は **発行の判定** ではありません。同意画面の内容とリフレッシュトークンの寿命バケット（`WithRefreshTokenTTL` か `WithRefreshTokenOfflineTTL`）を切り替えるだけです。`offline_access` を発行条件にしたい場合は `op.WithStrictOfflineAccess()` を明示してください — 次のセクションを参照。

::: details `op.WithStrictOfflineAccess` — OIDC Core §11 の厳格解釈
`op.WithStrictOfflineAccess()` を渡すと、発行とリフレッシュ交換の両方が §11 の厳格解釈に切り替わります — リフレッシュトークンは、付与された scope に `offline_access` が含まれているときに限り発行 / 受理されます。同意画面の内容と発行判定をビット単位で揃えたいときに選んでください。代償として、ログイン状態を維持したい RP はすべて明示的に `offline_access` を要求する必要があります。

このオプションは `op.WithOpenIDScopeOptional` と排他です（`openid` 自体が任意な構成では §11 に意味がないため、両方を同時指定すると `op.New` が拒否します）。
:::

## 認証コンテキストはローテーションをまたいで保持される

リフレッシュトークンは、subject と scope だけでなく、元のログインの認証コンテキストを保持します。リフレッシュ交換が新しい id_token や JWT アクセストークンを発行するとき、OP はリフレッシュ時点ではなく、ユーザが実際に認証したときのコンテキスト — `auth_time`、`acr`、`amr`、付与された `authorization_details` — を再現します。そのため、ログイン時に `acr_values=aal2` を要求した RP は、1 週間バックグラウンドでリフレッシュを続けたあとでも `acr` がその強度を反映したままになり、ステップアップの鮮度シグナルがローテーションのたびに知らぬ間にリセットされることもありません。リフレッシュレコードはこれらのフィールド（トークンの `origin` も含む）を永続化するので、保存された連鎖がそれらを忠実に再現します。

## 保存形式: ハッシュ化・定数時間

リフレッシュトークンのハンドルは opaque な bearer secret であり、所持しているだけで行使できます。OP は提示された値そのものを保存しません — ハッシュを保存し、`Find` / `Consume` では提示された値をハッシュ化して digest を引き、定数時間で比較します。これにより公開ストアの参照はハッシュのみ・タイミング非依存の形に保たれ、ストア漏洩とタイミングサイドチャネルの双方に対して堅牢になります。内部の再利用検出では、公開参照をハッシュのみに保つため、別の `RefreshChainResolver` 経路で保存ハンドルを解決します。[ストアを自前実装](/ja/use-cases/byo-store)する場合は、契約を満たすためにハッシュ化した id を永続化する必要があります。

## 監査ログ

token endpoint は `op.WithAuditLogger` 経由で 2 種類の slog 監査イベントを発行します。

| イベント | 発火タイミング |
|---|---|
| `op.AuditTokenIssued` | `authorization_code` 交換時にリフレッシュトークンを発行したとき。 |
| `op.AuditTokenRefreshed` | `refresh_token` grant でリフレッシュトークンをローテーションしたとき。 |

すでにローテーション済みのトークンが再提示された（再利用検出）ときは、連鎖失効を試みる前に `refresh.replay_detected` イベントが発行されます。

両方とも `extras` に `offline_access`（boolean）と `ttl_bucket`（`"offline"` または `"default"`）を持つので、SOC ダッシュボードは scope を再読することなく「ログイン状態の維持」の連鎖と通常のローテーションを区別できます。

## 続きはこちら

- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — それぞれのトークンが実際に持つ中身。
- [送信者制約](/ja/concepts/sender-constraint) — アクセストークン（とリフレッシュトークン）をクライアント保有の鍵に結び付ける。
