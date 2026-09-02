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

<svg role="img" aria-labelledby="profile-axes-title" viewBox="0 0 760 260" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="profile-axes-title">宣言したプロファイルは必要な feature flag を補うが、grant は補わない。プロファイルが要求する grant を配備側が宣言していない場合は op.New が失敗する。</title>

  <rect class="sp-option" x="260" y="16" width="240" height="44" rx="8"/>
  <text class="sp-option-name" x="380" y="43" text-anchor="middle">op.WithProfile(…)</text>

  <path d="M380 60 V82"/>
  <path d="M192 82 H568"/>
  <path d="M192 82 V108"/>
  <path d="M188 102 L192 111 L196 102"/>
  <path d="M568 82 V108"/>
  <path d="M564 102 L568 111 L572 102"/>

  <rect x="24" y="114" width="336" height="130" rx="8"/>
  <text class="sp-axis" x="192" y="140" text-anchor="middle">feature</text>
  <text class="sp-axis-example" x="192" y="162" text-anchor="middle">feature.PAR, feature.JAR, feature.JARM, …</text>
  <path class="sp-divider" d="M44 178 H340"/>
  <text class="sp-claim" x="192" y="202" text-anchor="middle">プロファイルが決めてよいポリシー</text>
  <text class="sp-outcome" x="192" y="226" text-anchor="middle">未宣言 → プロファイルが有効化</text>

  <rect x="400" y="114" width="336" height="130" rx="8"/>
  <text class="sp-axis" x="568" y="140" text-anchor="middle">grant</text>
  <text class="sp-axis-example" x="568" y="162" text-anchor="middle">grant.AuthorizationCode, grant.CIBA, …</text>
  <path class="sp-divider" d="M420 178 H716"/>
  <text class="sp-claim" x="568" y="202" text-anchor="middle">協力者を用意できるのは組み込み側だけ</text>
  <text class="sp-outcome" x="568" y="226" text-anchor="middle">未宣言 → op.New が失敗</text>
</svg>

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
