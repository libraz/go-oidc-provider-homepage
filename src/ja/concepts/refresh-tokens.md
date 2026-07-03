---
title: リフレッシュトークン
description: ローテーション、再利用検知、grace 期間、`offline_access` の TTL バケット分離。
---

# リフレッシュトークン

**リフレッシュトークン** は、RP が再認証なしに新しいアクセストークンを得るために交換する長寿命のクレデンシャルです。「ログイン状態の維持」はこの仕組みで実現されます。

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 Authorization Framework（§6 refresh）
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) — OAuth 2.0 Security Best Current Practice（ローテーション・再利用検知）
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §11（`offline_access`）
:::

::: details 用語の補足
- **ローテーション（rotation）** — リフレッシュトークン交換が成功するたび、古いトークンを無効化して新しいトークンを発行します。古→新のペアは、同じログインに連なる **chain** を形成します。
- **再利用検知（reuse detection）** — 既にローテーション済みのリフレッシュトークンが再提示されたら、OP は盗難シグナルとして扱い、chain 全体を無効化します。下の警告セクションを参照。
- **Grace 期間** — ローテーション直後の小さな猶予窓。前のリフレッシュトークンを再提示しても *同じ* 新ペアが返る（idempotent）ので、クライアント側のリトライ競合を吸収できます。
- **`offline_access` scope** — OIDC が定める「ユーザがその場にいなくてもアプリに動き続けてほしい」を表明する scope。デフォルトでは offline TTL バケットの選択に使われ、`op.WithStrictOfflineAccess()` を渡すと発行ゲートにもなります。
:::

## ローテーションのしくみ

`grant_type=refresh_token` が成功するたびに、リフレッシュトークンは **ローテーション** します — 古いトークンは無効化され、新しいトークンが返されます。

<svg class="rr-flow-dg" role="img" aria-labelledby="refresh-rotation-flow-title" viewBox="0 0 760 452" style="width:100%;height:auto;max-width:760px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="refresh-rotation-flow-title">リフレッシュトークンのローテーション: 交換のたびに提示されたトークンを無効化して同じ chain 内で新しいトークンを発行し、ローテーション済みトークンの再提示は再利用として検知され chain 全体を失効させる。</title>
  <style>
    .rr-flow-dg text{stroke:none;fill:currentColor;}
    .rr-flow-dg .d-actor{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;}
    .rr-flow-dg .d-cap{font-family:var(--vp-font-family-mono);font-size:10px;}
    .rr-flow-dg .d-prose{font-family:var(--vp-font-family-base);font-size:12px;font-weight:600;}
    .rr-flow-dg .d-mono{font-family:var(--vp-font-family-mono);font-size:11px;}
    .rr-flow-dg .op-accent{stroke:var(--vp-c-brand-2);}
    .rr-flow-dg .rs-stroke{stroke:var(--vp-c-text-3);}
    .rr-flow-dg .op-fill{fill:var(--vp-c-brand-2);}
    .rr-flow-dg .rs-fill{fill:var(--vp-c-text-3);}
    .rr-flow-dg .life{opacity:0.3;stroke-width:1;}
  </style>
  <line class="life" x1="110" y1="68" x2="110" y2="438"/>
  <line class="life op-accent" x1="380" y1="68" x2="380" y2="438"/>
  <line class="life rs-stroke" x1="650" y1="68" x2="650" y2="438"/>
  <rect x="35" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="305" y="14" width="150" height="30" rx="5"/>
  <rect class="rs-stroke" x="575" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="110" y="33" text-anchor="middle">RP / クライアント</text>
  <text class="d-actor op-fill" x="380" y="33" text-anchor="middle">OP</text>
  <text class="d-actor rs-fill" x="650" y="33" text-anchor="middle">攻撃者</text>
  <text class="d-cap" x="110" y="58" text-anchor="middle">トークンを更新</text>
  <text class="d-cap op-fill" x="380" y="58" text-anchor="middle">本ライブラリ</text>
  <text class="d-cap rs-fill" x="650" y="58" text-anchor="middle">rt1 を盗む</text>

  <path d="M110,100 H380"/>
  <path d="M373,96 L380,100 L373,104"/>
  <text class="d-mono" x="245" y="92" text-anchor="middle">POST /token · grant_type=authorization_code</text>

  <path d="M380,140 H110"/>
  <path d="M117,136 L110,140 L117,144"/>
  <text class="d-mono" x="245" y="132" text-anchor="middle">200 · access_token · refresh_token: rt1</text>

  <text class="d-mono rs-fill" x="245" y="166" text-anchor="middle">access_token 有効期限切れ</text>

  <path d="M110,196 H380"/>
  <path d="M373,192 L380,196 L373,200"/>
  <text class="d-mono" x="245" y="188" text-anchor="middle">grant_type=refresh_token · refresh_token=rt1</text>

  <path class="op-accent" d="M380,211 h16 v12 h-16"/>
  <path class="op-accent" d="M387,215 L380,219 L387,223"/>
  <text class="d-prose op-fill" x="404" y="208">リフレッシュトークンをローテーション</text>
  <text class="d-mono" x="404" y="220">rt1 を無効化 · rt2 を発行（同じ chain）</text>

  <path d="M380,256 H110"/>
  <path d="M117,252 L110,256 L117,260"/>
  <text class="d-mono" x="245" y="248" text-anchor="middle">200 · access_token · refresh_token: rt2</text>

  <path d="M110,292 H380"/>
  <path d="M373,288 L380,292 L373,296"/>
  <text class="d-mono" x="245" y="284" text-anchor="middle">grant_type=refresh_token · refresh_token=rt2</text>

  <path d="M380,328 H110"/>
  <path d="M117,324 L110,328 L117,332"/>
  <text class="d-mono" x="245" y="320" text-anchor="middle">200 · access_token · refresh_token: rt3</text>

  <text class="d-mono rs-fill" x="515" y="354" text-anchor="middle">攻撃者が rt1 を盗む</text>

  <path class="rs-stroke" d="M650,384 H380"/>
  <path class="rs-stroke" d="M387,380 L380,384 L387,388"/>
  <text class="d-mono rs-fill" x="515" y="376" text-anchor="middle">refresh_token=rt1 を再提示（消費済み）</text>

  <path class="op-accent" d="M380,401 h16 v12 h-16"/>
  <path class="op-accent" d="M387,405 L380,409 L387,413"/>
  <text class="d-prose op-fill" x="404" y="398">再利用を検知 → chain 全体を失効</text>
  <text class="d-mono" x="404" y="410">RevokeChain(rt1..rt3) · refresh.replay_detected</text>
</svg>

::: warning 再利用検知は chain 全体を無効化
すでにローテーション済みのリフレッシュトークンが再提示されると、OP は「クレデンシャルが盗まれた」シグナルとして扱い、**chain 全体を失効させます** — 盗まれたトークンも、それを起点に発行された正規のトークンも、両方とも無効になります。両者とも再認証が必要です。

これは意図的な挙動です — OP が出せる「何かがおかしい」という最強のシグナルだからです。
:::

::: details ローテーション / 再利用検知 / chain 失効とは
ブログ記事ではしばしば同じ意味で使われる 3 つの用語ですが、本ライブラリでは別物です。

- **ローテーション** — *正常系* の成功経路。`grant_type=refresh_token` が成功するたびに新しいリフレッシュトークンを返し、前のトークンを無効化します。デフォルトは single-use。
- **再利用検知** — すでにローテーション済みのリフレッシュトークンが再度送られてきた状態。漏洩、マルウェア、混乱したクライアントによる複製のいずれかでしか起こり得ません。本ライブラリは盗難として扱います。
- **Chain 失効**（family revocation とも） — 再利用検知への応答。問題のトークンと同じ系統に属するリフレッシュトークン全部が無効化されます — 正規クライアントが今使っている子孫トークンも含めて。次の正規リフレッシュは失敗し、ユーザは再認証することになり、攻撃者の盗難トークンも死にます。

RFC 9700 §2.2.2 が public client に対して要求する挙動で、本ライブラリではクライアント種別を問わずすべての refresh chain で同じ扱いになります。
:::

## Grace 期間

正規クライアントが競合状態（同じリフレッシュトークンを 2 回フェッチしてしまった、など）に陥ったとき、本来なら再利用検知に引っかかってしまいます。`op.WithRefreshGracePeriod(d)` でローテーション後の猶予期間を調整できます。

```go
op.WithRefreshGracePeriod(2 * time.Second)
```

ローテーション成功から `d` 秒以内であれば、前のトークンを再提示しても *同じ* 新トークンが返されます（idempotent）。`d` 秒経過後の再利用は盗難として扱われます。

::: details 猶予期間（acceptance window）とは — なぜセキュリティホールにならないか
grace 期間は **猶予期間** とも呼ばれます。OP は前のリフレッシュトークンを *まだ現役のように* 受理しますが、返すのは正規クライアントに既に渡したのと *同じ* 冪等な応答だけです。single-use の緩和ではありません — この期間中に OP が *新しい* トークンを発行することはなく、ネットワーク不調由来のリトライを吸収するために *同じ* 新ペアを再生するだけです。猶予期間が終わると、前のトークンは「ローテーション済み → 再利用 → chain 失効」の通常経路に戻ります。0 を渡すと完全無効化（厳密な single-use）にできます。代償は、モバイル回線で稀に偽陽性の chain 失効が起きることです。
:::

::: tip デフォルトは 60 秒
`WithRefreshGracePeriod` を渡さない場合のデフォルト grace 期間は **60 秒**（`refresh.GraceTTLDefault`）です。`op.WithRefreshGracePeriod(0)` で grace を完全無効化（厳密な single-use）、正の値で猶予期間を明示設定できます。負値は構築時に拒否されます。

OFCS のリフレッシュトークン回帰テストはローテーションとリトライの間に約 32 秒待つため、それ以下の grace 期間に縮めると適合性が後退します。

`profile.FAPI2Baseline` と `profile.FAPI2MessageSigning` では、明示設定された非ゼロの grace window は `op.New` で拒否されます。どちらかの profile を有効にする前に、`WithRefreshGracePeriod` を外すか 0 にしてください。`profile.FAPICIBA` にはこの refresh-grace gate は適用されません。
:::

## TTL バケット

| Option | デフォルト | 適用範囲 |
|---|---|---|
| `op.WithRefreshTokenTTL(d)` | 30 日 | 通常のリフレッシュトークン。 |
| `op.WithRefreshTokenOfflineTTL(d)` | `WithRefreshTokenTTL` を継承 | `offline_access` scope で発行されたリフレッシュトークン。 |

バケットを分けることで、`offline_access`（ログイン状態の維持）には長寿命を持たせつつ、通常のリフレッシュトークンは短いローテーション間隔を維持できます。

## 発行の判定

デフォルトでは、リフレッシュトークンが発行されるのは次の **2 つ** が成り立つときだけです。

1. クライアントの `GrantTypes` に `refresh_token` が含まれている。
2. 付与された scope に `openid` が含まれている（本ライブラリでリフレッシュトークンは OIDC の構成要素として扱う）。

どちらか一方でも欠けると、トークンエンドポイント (`/token`) は `access_token` + `id_token` を返して成功扱いとなり、**`refresh_token` フィールドは付きません** —「クライアントが `refresh_token` grant を持っていない」場合と同じ振る舞いです。アクセストークンが切れたら、RP は再度ユーザに認証を求めることになります。

OIDC Core 1.0 §11 のデフォルト(緩やかな)解釈では、`offline_access` は **発行の判定** ではありません。同意プロンプトの UX とリフレッシュトークンの寿命バケット(`WithRefreshTokenTTL` か `WithRefreshTokenOfflineTTL`)を切り替えるだけです。`offline_access` を発行ゲートにしたい場合は `op.WithStrictOfflineAccess()` をオプトインしてください — 次のセクションを参照。

::: details `op.WithStrictOfflineAccess` — OIDC Core §11 の厳格解釈
`op.WithStrictOfflineAccess()` を渡すと、発行とリフレッシュ交換の両方が §11 の厳格解釈に切り替わります — リフレッシュトークンは、付与された scope に `offline_access` が含まれているときに限り発行 / 受理されます。同意プロンプトの内容と発行判定をビット単位で揃えたいときに選んでください。代償として、ログイン状態を維持したい RP はすべて明示的に `offline_access` を要求する必要があります。

このオプションは `op.WithOpenIDScopeOptional` と排他です（`openid` 自体が任意な構成では §11 に意味がないため、両方を同時指定すると `op.New` が拒否します）。
:::

## 認証コンテキストはローテーションをまたいで保持される

リフレッシュトークンは、subject と scope だけでなく、元のログインの認証コンテキストを保持します。リフレッシュ交換が新しい id_token や JWT アクセストークンを発行するとき、OP はリフレッシュ時点ではなく、ユーザが実際に認証したときのコンテキスト — `auth_time`、`acr`、`amr`、付与された `authorization_details` — を再現します。そのため、ログイン時に `acr_values=aal2` を要求した RP は、1 週間バックグラウンドでリフレッシュを続けたあとでも `acr` がその強度を反映したままになり、ステップアップの freshness シグナルがローテーションのたびに知らぬ間にリセットされることもありません。リフレッシュレコードはこれらのフィールド（トークンの `origin` も含む）を永続化するので、保存された chain がそれらを忠実に再現します。

## 保存形式: ハッシュ化・定数時間

リフレッシュトークンのハンドルは opaque な bearer secret であり、所持しているだけで行使できます。OP は提示された値そのものを保存しません — ハッシュを保存し、`Find` / `Consume` では提示された値をハッシュ化して digest を引き、定数時間で比較します。これにより公開ストアの参照はハッシュのみ・タイミング非依存の形に保たれ、ストア漏洩とタイミングサイドチャネルの双方に対して堅牢になります。内部の再利用検出 chain 探索は、公開参照をハッシュのみに保つため、別の `RefreshChainResolver` 経路で保存ハンドルを解決します。[ストアを自前実装](/ja/use-cases/byo-store)する場合は、契約を満たすためにハッシュ化した id を永続化する必要があります。

## 監査ログ

token endpoint は `op.WithAuditLogger` 経由で 2 種類の slog 監査イベントを発行します。

| イベント | 発火タイミング |
|---|---|
| `op.AuditTokenIssued` | `authorization_code` 交換時にリフレッシュトークンを発行したとき。 |
| `op.AuditTokenRefreshed` | `refresh_token` grant でリフレッシュトークンをローテーションしたとき。 |

すでにローテーション済みのトークンが再提示された（再利用検出）ときは、best-effort の chain 失効の前に `refresh.replay_detected` イベントが発行されます。

両方とも `extras` に `offline_access`（boolean）と `ttl_bucket`（`"offline"` または `"default"`）を持つので、SOC ダッシュボードは scope を再読することなく「ログイン状態の維持」chain と通常のローテーションを区別できます。

## 続きはこちら

- [ID トークン / アクセストークン / userinfo](/ja/concepts/tokens) — それぞれのトークンが実際に持つ中身。
- [送信者制約](/ja/concepts/sender-constraint) — アクセストークン（とリフレッシュトークン）をクライアント保有の鍵にバインドする。
