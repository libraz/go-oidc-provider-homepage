---
title: セキュリティプロファイルの宣言
description: Provider 構築時に OIDC Core、OAuth 2.1 Baseline、FAPI を明示 — profile は feature を補うが grant は補わない。
pageClass: pg-use-cases-security-profile
---

# 使い方 — セキュリティプロファイルの宣言

`op.WithProfile` は OP のセキュリティ姿勢を明示します。未指定も 1 つの選択です。OpenID Connect Core 1.0 互換の形では、confidential authorization-code client が PKCE 無しで要求できます。OAuth 2.1 / RFC 9700 に従い、すべての authorization-code request に PKCE を求めるなら `profile.Baseline` を使います。

```go
provider, err := op.New(
  // issuer、store、keyset、cookie key、client、login flow …
  op.WithProfile(profile.Baseline),
)
```

`profile.Baseline` が変えるのはこの 1 つの規則だけです。PAR を必須にせず、token lifetime や client authentication method を制限せず、送信者制約付き token も要求しません。これらは FAPI の要件です。対象が FAPI なら [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) を使ってください。

構築に成功すると、OP は audit logger へ `startup.profile` を 1 回出力します。宣言した profile、feature、grant と、`pkce_required` を含む解決後のポリシーが入ります。最初の request を受ける前に、配備した姿勢を確認できます。

> **ソース:** [`examples/00-security-profile`](https://github.com/libraz/go-oidc-provider/tree/main/examples/00-security-profile) は、profile 未指定の OP と `profile.Baseline` の OP を並べ、同じ confidential client の PKCE 無し request を送ります。

## 意図して選ぶ

| デプロイの意図 | 設定 |
|---|---|
| 既存の OIDC client との互換性を保つ | profile を宣言しない。PKCE 移行を計画する |
| OAuth 2.1 の姿勢を取る | `op.WithProfile(profile.Baseline)` |
| Financial-grade API のプロファイルを取る | `op.WithProfile(profile.FAPI2Baseline)` または該当する FAPI profile |

public / native client は `profile.Baseline` を指定しなくても PKCE 必須です。違いが現れるのは confidential client の互換経路です。

## feature は補われ、grant は補われない

プロファイルは隣り合う 2 つの宣言軸を別々に扱います。この非対称は意図したものです。

<figure class="fig">
  <div class="fig-head">プロファイルは feature を補うが、grant は補わない</div>
  <svg class="fig-svg" role="img" aria-labelledby="profile-supply-title" viewBox="0 0 960 236" xmlns="http://www.w3.org/2000/svg">
    <title id="profile-supply-title">プロファイルを宣言すると、それが必要とする feature flag が有効になります。一方で grant は補われません。プロファイルが要求する grant を配備側が宣言していない場合、黙って有効化するのではなく op.New が失敗します。</title>
    <rect class="fg-box fg-box--accent" x="340" y="24" width="280" height="44" rx="8"/>
    <text class="fg-m fg-accent" x="480" y="52" text-anchor="middle">op.WithProfile(…)</text>
    <path class="fg-leader" d="M480,72 V88 M253,88 H707"/>
    <path class="fg-edge fg-edge--ok" d="M253,88 V106" marker-end="url(#fg-ao)"/>
    <path class="fg-edge fg-edge--danger" d="M707,88 V106" marker-end="url(#fg-ad)"/>
    <rect class="fg-box fg-box--ok" x="36" y="110" width="434" height="108" rx="8"/>
    <text class="fg-t2" x="56" y="138">feature — 補われる</text>
    <text class="fg-mxs" x="56" y="160">feature.PAR · feature.JAR · feature.JARM · …</text>
    <line class="fg-rule" x1="56" y1="172" x2="450" y2="172"/>
    <text class="fg-xs" x="56" y="192">プロファイルが単独で決めてよいポリシー</text>
    <text class="fg-xs fg-ok" x="56" y="208">未宣言 → プロファイルが有効化する</text>
    <rect class="fg-box fg-box--danger" x="490" y="110" width="434" height="108" rx="8"/>
    <text class="fg-t2" x="510" y="138">grant — 補われない</text>
    <text class="fg-mxs" x="510" y="160">grant.AuthorizationCode · grant.CIBA · …</text>
    <line class="fg-rule" x1="510" y1="172" x2="904" y2="172"/>
    <text class="fg-xs" x="510" y="192">必要な協力者を用意できるのは組み込み側だけ</text>
    <text class="fg-xs fg-danger" x="510" y="208">未宣言 → op.New が失敗する</text>
  </svg>
  <figcaption class="fig-note">この非対称は意図したものです。feature はプロファイルが単独で強制できる規則ですが、grant には認証器やストア、場合によっては通知チャネルが要ります。用意できるのは組み込み側だけなので、黙って有効化すれば、受け付けたリクエストを完了できない OP ができあがります。</figcaption>
</figure>

どちらの場合も、解決後のポリシーは `startup.profile` 監査イベントに記録されます。OP が実際にどの設定で起動したかは、オプションの並びから推測するのではなく監査証跡から読み取れます。

**足りない feature は自動で有効になります。** PAR や JAR のような feature flag は、プロファイルが決めてよいポリシーだからです。`profile.FAPI2Baseline` を宣言すれば、必要な feature はオプションを追加しなくても有効になります。

**足りない grant は `op.New` を失敗させます。** grant を有効化すると、組み込み側にしか用意できない協力者が芋づる式に必要になるため、本ライブラリは配備側が求めていないエンドポイントを勝手に mount しません。実際に問題になるのは `profile.FAPICIBA` です。このプロファイルの主題は `/bc-authorize` のやり取りそのものですが、そのエンドポイントを mount するのは grant の集合です。この検査が無ければ、プロファイルを宣言して JAR と DPoP が有効になった OP が、backchannel authentication request のすべてに 404 を返す、という状態が成立してしまいます。

```go
provider, err := op.New(
  // …
  op.WithGrants(grant.CIBA),
  op.WithProfile(profile.FAPICIBA),
  op.WithCIBA(op.WithCIBAHintResolver(resolver)),
)
```

エラーはプロファイルが要求する grant と、それを有効化するオプションの両方を示すので、メッセージだけを見て修正できます。`WithCIBA` には `op.WithCIBAHintResolver` などの CIBA option を渡します。`op.WithGrants(grant.CIBA)` の明示的な宣言を置き換えるものではありません。`profile.FAPICIBA` 以外のプロファイルは、固有の grant を要求しません。
