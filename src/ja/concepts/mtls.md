---
title: mTLS (RFC 8705)
description: Mutual-TLS Client Authentication と Certificate-Bound Access Tokens — 正規クライアントが TLS で提示した証明書に access token をバインドする方式。
---

# mTLS — Mutual-TLS Client Authentication

**mTLS**(RFC 8705)は、TLS ハンドシェイク中にクライアントを認証した X.509 証明書に access token をバインドする仕組みです。OP は証明書の SHA-256 thumbprint を `cnf.x5t#S256` として発行 token に書き込み、リソースサーバは API 呼び出し時に提示された証明書の thumbprint を照合します。token のバイト列だけが漏れても無価値で、攻撃者は証明書 **と** その秘密鍵も併せて入手しなければ通せません。

mTLS は既に PKI を運用している環境で特に強みを発揮します — B2B のサービスメッシュ、オープンバンキング、内部 CA が全関係者に証明書を発行しているバックエンド API などです。バインドが TLS 層に乗っているため、アプリケーションコードはリクエストごとに何かを署名する必要がありません。代償として、TLS 終端(リバースプロキシ、ロードバランサ)が検証済み証明書を OP まで運ぶよう設定する必要があります。

::: details このページで触れる仕様
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280) — X.509 PKI 証明書
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

## サブモード 2 種

RFC 8705 はバインド機構を共有する 2 つの `token_endpoint_auth_method` を規定しています。違いは **クライアント身元をどう anchor するか** です。

### `tls_client_auth` — PKI チェーン (RFC 8705 §2.1)

クライアントは OP が信頼する CA が発行した証明書を提示します。OP はトラストアンカーに対してチェーン検証を行い、その後にクライアントの登録メタデータと突き合わせます。本ライブラリは以下のうち **少なくとも 1 つ** の pin フィールドで照合します(`internal/mtls/auth.go` の `ClientMatcher` を参照):

| Pin | 証明書の参照元 |
|---|---|
| `SubjectDN` | `Subject` の RFC 4514 文字列形式 |
| `SANDNS` | `DNSNames` 内の DNS 名 |
| `SANURI` | `URIs` 内の URI |
| `SANIP` | `IPAddresses` 内の IP literal |
| `SANEmail` | `EmailAddresses` 内の rfc822Name |

少なくとも 1 つの非空 pin が必須です。matcher が完全に空のまま登録されると `ErrNoMatcherConfigured` で fail closed します — 任意のチェーン有効証明書を黙認すれば §2.1 の契約が崩れるためです。Subject DN の比較は `pkix.Name` を経由した DER ラウンドトリップで行うため、RFC 4514 の属性順序差は吸収されます。残ったケースは文字列フォールバックで補います。

### `self_signed_tls_client_auth` — JWK thumbprint (RFC 8705 §2.2)

クライアントは公開 JWK(または JWKS URI)を登録します。OP は CA チェーンを **歩かず**、証明書の公開鍵をハッシュして登録 JWKS と照合します。このモードを使えば、PKI を運用せずに mTLS を導入できます — 各クライアントが自分の証明書を自己署名する形になります。

2 つのモードはクライアント単位で排他です。登録時に混在させれば拒否されます。OP はクライアントに保存された `token_endpoint_auth_method` を見て検証ロジックを選びます。

## Confirmation claim — `cnf.x5t#S256`

OP は mTLS 認証されたクライアントに token を発行する際、DER エンコードした証明書の SHA-256 digest(RFC 8705 §3)を計算し、access token に `cnf.x5t#S256` として書き込みます。以後この access token を使うリクエストは **同じ証明書** で TLS 接続を確立する必要があり、リソースサーバは観測した証明書をハッシュして `cnf.x5t#S256` と比較します。

`cnf` 自体は DPoP と共通の仕組み(RFC 7800)ですが、**メンバ名** が異なります — DPoP は `jkt`、mTLS は `x5t#S256`。1 つの token はどちらか一方だけを持ち、両方が同居することはありません。

::: details なぜ証明書全体ではなく thumbprint なのか
DPoP の JWK thumbprint と同じ理由です。固定長の digest は再エンコードを跨いでも安定し、比較も安価で、JWT 内に十分収まる短さです。SHA-256 は RFC 8705 §3 が固定で指定しており、ネゴシエーションの余地はありません。
:::

## リバースプロキシ構成

本番では OP が自前で TLS を終端することはほぼありません。前段の nginx / envoy / AWS ALB / クラウド LB が TLS を復号し、OP には平文 HTTP で渡します。OP に届いた時点でクライアント証明書はすでに接続から失われているため、proxy が HTTP ヘッダ(`X-SSL-Cert`、`X-Forwarded-Client-Cert` など)で前送りする必要があります。

OP は **どのヘッダから読むか** と **どの IP 範囲がそのヘッダを設定してよいか** の両方を知る必要があります。後者を抜くと、インターネット側の任意のクライアントが偽造ヘッダを送って、認証済みクライアントになりすませてしまいます。

```go
op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"})
```

引数はいずれも必須です(`op/options_fapi_proxy.go`):

- `headerName` が空文字なら設定エラー。ヘッダパスを無効化したい場合はオプション自体を渡さないでください。
- `trustedCIDRs` が空 slice なら構築時に拒否されます — 設定ミスで allow-list が黙って広がる経路を塞ぐためです。

OP が自前で TLS を終端しているときは、ライブラリは TLS ハンドシェイクの証明書(`http.Request.TLS.PeerCertificates`)を優先します。ヘッダ経路は、ハンドシェイク証明書が無く **かつ** リクエストの `RemoteAddr` が `trustedCIDRs` のいずれかに含まれるときにのみ参照されます。リバースプロキシを迂回して OP に直接到達した攻撃者は、ヘッダを設定しても証明書を偽造できません — OP は fail closed して、証明書なしのリクエストと同じ応答を返します。

`op.MTLSProxyConfig(provider)` は記録された設定を返すので、out-of-band な introspection エンドポイント等で `internal/mtls.Verifier` を自前構築する組み込み側でも、同じ allow-list を再利用できます。

## 実装例

mTLS のみの最小構成:

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

op.New(
  /* 必須オプション */
  op.WithFeature(feature.MTLS),
  op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"}),
)
```

OP が自前で TLS を終端する環境(テスト、シングルテナント on-prem 等)では、`WithMTLSProxy` 行は省略可能です — ライブラリは `http.Request.TLS.PeerCertificates` から直接証明書を読みます。

`op.WithProfile(profile.FAPI2Baseline)` は `feature.MTLS` を **自動有効化しません**。プロファイルは `[DPoP, MTLS]` に対する `RequiredAnyOf` だけを課し、組み込み側がいずれか(あるいは両方)を選びます。両方を有効化すれば discovery に両方のバインド方式が出るので、クライアントがリクエストごとに選べるようになります。

## 落とし穴

- **TLS 終端が証明書を正しく前送りすること。** proxy ごとにヘッダ名とエンコード(DER / PEM / URL エンコード PEM)が違います。両端で形式と `WithMTLSProxy` のヘッダ名を固定してください。
- **証明書の更新には運用面の調整が必要。** `self_signed_tls_client_auth` の証明書を更新する場合、登録 JWKS も同時に更新しないと新証明書の thumbprint が一致しません。新旧証明書の有効期間が重なる間は、新旧両方の JWK が登録されているように rollover を計画してください。
- **同じクライアントでモードを混在させない。** `tls_client_auth` で登録したクライアントが、自己署名証明書を提示したときに `self_signed_tls_client_auth` にフォールスルーすることはありません。どちらかに統一する必要があります。
- **空の matcher は fail closed。** `tls_client_auth` では `SubjectDN` / `SANDNS` / `SANURI` / `SANIP` / `SANEmail` のうち少なくとも 1 つが必要です。すべて空のまま登録された場合、検証側が `ErrNoMatcherConfigured` で拒否します。
- **多段プロキシでの `RemoteAddr` の意味。** OP の前に proxy が 2 段ある場合、`RemoteAddr` に乗るのは **直前の** proxy の IP のみです — その IP が `trustedCIDRs` に入っている必要があります。さらに外側の proxy はヘッダ allow-list の対象外です(OP が直接見ないため)。

## mTLS が向いているケース

- **既存 PKI を持つバックエンドサービス** — 全サービスが内部 CA 発行のクライアント証明書を既に持っている環境では、新しい鍵管理面を増やさずに mTLS を導入できます。
- **オープンバンキング・B2B サービスメッシュ** — 規制やパートナー要件として、ネットワーク層で mTLS が既に必須になっているケースが多くあります。RFC 8705 はその上にトークンバインドを乗せるだけです。
- **TLS 終端をすでに運用している運用チーム** — `WithMTLSProxy` の設定は一度きりの作業で、既存の nginx / envoy 設定の隣に自然に収まります。
- **リクエストごとの署名コストを払いたくない制約クライアント** — バインドが TLS 層にあるため、アプリ側は API 呼び出しごとに新規署名を作る必要がありません。

## mTLS が向かないケース

- **ブラウザ** — 現在のブラウザはクライアント証明書を提示する手段が乏しく、SPA で mTLS を実用化するのは現実的ではありません。代わりに [DPoP](/concepts/dpop) を使ってください。
- **モバイルアプリ** — 多くのプラットフォームはクライアント証明書をサポートしますが、プロビジョニングと更新の UX が芳しくありません。DPoP のリクエスト毎署名のほうがモバイル鍵ストアと相性が良いことが多いです。
- **PKI が無い環境** — 単にクライアント証明書を発行するためだけに内部 CA を立ち上げるのは重い投資です。これから始めるなら、DPoP のほうが証明書ロジスティクス無しで送信者制約を導入できます。
- **異種混在環境** — SPA とバックエンドが混ざる環境では結局両方を運用することになりがちです。discovery に両方を出し、クライアントごとに使えるほうを選ばせる構成が現実的です。

## 次に読む

- [DPoP (RFC 9449)](/concepts/dpop) — もう一方の送信者制約方式。クライアント保有鍵にバインドします。
- [送信者制約 — 選定ガイド](/concepts/sender-constraint) — 比較表と使い分けの指針。
- [ユースケース: FAPI 2.0 Baseline](/use-cases/fapi2-baseline) — mTLS クライアント認証を含む完全な組み込み例。
- [設計判断](/security/design-judgments) — 仕様間トレードオフの整理。
