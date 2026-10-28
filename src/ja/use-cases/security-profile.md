---
title: セキュリティプロファイルの宣言
description: Provider 構築時に OIDC Core、OAuth 2.1 Baseline、FAPI を明示 — profile は feature を補うが grant は補わない。
pageClass: pg-use-cases-security-profile
---

# ユースケース — セキュリティプロファイルの宣言

`op.WithProfile` は OP のセキュリティ姿勢を明示します。未指定も 1 つの選択です。本ライブラリの OpenID Connect Core 1.0 互換の形では、confidential な認可コードクライアントが PKCE なしで要求できます。OAuth 2.1 / RFC 9700 に従い、すべての認可コードリクエストに PKCE を求めるなら `profile.Baseline` を使います。

```go
provider, err := op.New(
  // issuer、store、keyset、cookie key、client、login flow …
  op.WithProfile(profile.Baseline),
)
```

`profile.Baseline` が変えるのはこの 1 つの規則だけです。PAR を必須にせず、アクセストークンの有効期間やクライアント認証方式を制限せず、送信者制約付きアクセストークンも要求しません。これらは対象とする FAPI プロファイルの要件であり、本ライブラリの `profile.Baseline` が追加する規則ではありません。対象が FAPI なら [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を使ってください。

構築に成功すると、OP は audit logger へ `startup.profile` を 1 回出力します。宣言した profile、feature、grant と、解決後のポリシー（`pkce_required`、`par_required`、`sender_constrained`、`client_auth_methods`、トークンの有効期間など）が入ります。最初の request を受ける前に、配備した姿勢を確認できます。

> **ソース:** [`examples/00-security-profile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/00-security-profile) は、profile 未指定の OP と `profile.Baseline` の OP を並べ、同じ confidential client の PKCE 無し request を送ります。

## 意図して選ぶ

| デプロイの意図 | 設定 |
|---|---|
| 既存の OIDC client との互換性を保つ | profile を宣言しない。PKCE 移行を計画する |
| OAuth 2.1 の姿勢を取る | `op.WithProfile(profile.Baseline)` |
| Financial-grade API のプロファイルを取る | `op.WithProfile(profile.FAPI2Baseline)` または該当する FAPI profile |

本ライブラリでは public / native client は `profile.Baseline` を指定しなくても PKCE 必須です。違いが現れるのは confidential client の互換経路です。

## 各プロファイルの要件

| プロファイル | PKCE | 自動で有効になる feature | 送信者制約付きトークン | 必須の grant | その他の上限 |
|---|---|---|---|---|---|
| `profile.Baseline` | 必須 | なし | 要求しない | なし | なし |
| `profile.FAPI2Baseline` | 必須 | PAR、JAR | DPoP または mTLS（どちらも未設定なら DPoP） | なし | アクセストークンの有効期間は 10 分以内。PAR の `expires_in` は 600 秒未満 |
| `profile.FAPI2MessageSigning` | 必須 | PAR、JAR、JARM | DPoP または mTLS | なし | `FAPI2Baseline` と同じ上限 |
| `profile.FAPICIBA` | 対象外（`/auth` へのリダイレクトがない） | JAR | DPoP または mTLS | `grant.CIBA` | `FAPI2Baseline` と同じ上限 |

出典は `op/profile` の `RequiredFeatures`、`RequiredAnyOf`、`RequiredGrants`、`RequiresPKCE`、`MaxAccessTokenTTL`、`PARLifetimeCeiling` です。

## feature は補われ、grant は補われない

プロファイルは隣り合う 2 つの宣言軸を別々に扱います。この非対称は意図したものです。

<figure class="fig">
  <div class="fig-head">プロファイルは feature を補うが、grant は補わない</div>
  <svg class="fig-svg" role="img" aria-labelledby="profile-supply-title" viewBox="0 0 960 288" xmlns="http://www.w3.org/2000/svg">
    <title id="profile-supply-title">プロファイルを宣言すると、それが必要とする feature flag が有効になります。一方で grant は補われません。プロファイルが要求する grant を配備側が宣言していない場合、黙って有効化するのではなく op.New が失敗します。</title>
    <!-- profile -->
    <rect class="fg-box fg-box--accent" x="340" y="24" width="280" height="48" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="52" text-anchor="middle">op.WithProfile(…)</text>
    <!-- branches -->
    <path class="fg-leader" d="M480,72 V96 M248,96 H712"/>
    <path class="fg-edge fg-edge--thin fg-edge--ok" d="M248,96 V120" marker-end="url(#fg-ao)"/>
    <path class="fg-edge fg-edge--thin fg-edge--danger" d="M712,96 V120" marker-end="url(#fg-ad)"/>
    <!-- features -->
    <rect class="fg-box fg-box--ok" x="32" y="120" width="432" height="144" rx="8"/>
    <text class="fg-t2" x="48" y="148">feature: 補われる</text>
    <text class="fg-mxs" x="48" y="172">feature.PAR · feature.JAR · …</text>
    <text class="fg-s" x="48" y="196">プロファイルが単独で決めてよいポリシー</text>
    <rect class="fg-pill fg-pill--ok" x="48" y="216" width="400" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="248" y="237" text-anchor="middle">未宣言 → プロファイルが有効化する</text>
    <!-- grants -->
    <rect class="fg-box fg-box--danger" x="496" y="120" width="432" height="144" rx="8"/>
    <text class="fg-t2" x="512" y="148">grant: 補われない</text>
    <text class="fg-mxs" x="512" y="172">grant.AuthorizationCode · grant.CIBA · …</text>
    <text class="fg-s" x="512" y="196">必要な協力者を用意できるのは組み込み側だけ</text>
    <rect class="fg-pill fg-pill--danger" x="512" y="216" width="400" height="32" rx="16"/>
    <text class="fg-s fg-danger" x="712" y="237" text-anchor="middle">未宣言 → op.New が失敗する</text>
  </svg>
  <figcaption class="fig-note">この非対称は意図したものです。feature はプロファイルが単独で強制できる規則ですが、grant には認証器やストア、場合によっては通知チャネルが要ります。用意できるのは組み込み側だけなので、黙って有効化すれば、受け付けたリクエストを完了できない OP ができあがります。</figcaption>
</figure>

どちらの場合も、解決後のポリシーは `startup.profile` 監査イベントに記録されます。OP が実際にどの設定で起動したかは、オプションの並びから推測するのではなく監査証跡から読み取れます。

**足りない feature は自動で有効になります。** PAR や JAR のような feature flag は、プロファイルが決めてよいポリシーだからです。`profile.FAPI2Baseline` を宣言すれば、必要な feature はオプションを追加しなくても有効になります。

**足りない grant は `op.New` を失敗させます。** grant を有効化すると、組み込み側にしか用意できない協力者が芋づる式に必要になるため、本ライブラリは配備側が求めていないエンドポイントを勝手に mount しません。実際に問題になるのは `profile.FAPICIBA` です。このプロファイルの主題は `/bc-authorize` のやり取りそのものですが、そのエンドポイントを mount するのは grant の集合です。この検査が無ければ、プロファイルを宣言して JAR と DPoP が有効になった OP が、backchannel authentication request のすべてに 404 を返す、という状態が成立してしまいます。

```go
provider, err := op.New(
  // …
  op.WithProfile(profile.FAPICIBA),
  op.WithCIBA(op.WithCIBAHintResolver(resolver)),
)
```

grant を有効にするのは `op.WithCIBA` です。`grant.CIBA` を grant の集合に加え、`op.WithCIBAHintResolver` などの CIBA option を受け取ります。ストアには CIBA リクエスト用のサブストアも必要です。`op.WithCIBA` なしで `profile.FAPICIBA` を宣言すると `op.New` が失敗します。エラーにはプロファイルが要求する grant と、それを有効にするオプションの両方が出るので、メッセージを読めば直せます。`op.WithGrants` に `grant.CIBA` を並べるだけでは足りません。hint resolver が未設定のまま、次の検査で失敗するからです。`profile.FAPICIBA` 以外のプロファイルは、固有の grant を要求しません。
