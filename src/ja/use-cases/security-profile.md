---
title: セキュリティプロファイルの宣言
description: Provider 構築時に、プレーンな OIDC Core 互換、OAuth 2.1 Baseline、FAPI のいずれを採るか明示する。
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

**足りない feature は自動で有効になります。** PAR や JAR のような feature flag は、プロファイルが決めてよいポリシーだからです。`profile.FAPI2Baseline` を宣言すれば、必要な feature はオプションを追加しなくても有効になります。

**足りない grant は `op.New` を失敗させます。** grant を有効化すると、組み込み側にしか用意できない協力者が芋づる式に必要になるため、本ライブラリは配備側が求めていないエンドポイントを勝手に mount しません。実際に問題になるのは `profile.FAPICIBA` です。このプロファイルの主題は `/bc-authorize` のやり取りそのものですが、そのエンドポイントを mount するのは grant の集合です。この検査が無ければ、プロファイルを宣言して JAR と DPoP が有効になった OP が、backchannel authentication request のすべてに 404 を返す、という状態が成立してしまいます。

```go
provider, err := op.New(
  // …
  op.WithProfile(profile.FAPICIBA),
  op.WithCIBA(cibaOpts...),  // これを省くと op.New が失敗し、必要なオプション名を示す
)
```

エラーはプロファイルが要求する grant と、それを有効化するオプションの両方を示すので、メッセージだけを見て修正できます。`profile.FAPICIBA` 以外のプロファイルは、固有の grant を要求しません。
