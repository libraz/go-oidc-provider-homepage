---
title: mTLS (RFC 8705)
description: Mutual-TLS Client Authentication と Certificate-Bound Access Tokens — 正規クライアントが TLS で提示した証明書にアクセストークンを結び付ける方式。
---

# mTLS — 証明書結び付けアクセストークン

**mTLS**（RFC 8705）は、TLS ハンドシェイク中にクライアントを認証した X.509 証明書にアクセストークンを結び付ける仕組みです。OP は証明書の SHA-256 指紋（thumbprint）を `cnf.x5t#S256` として発行トークンに書き込み、リソースサーバは API 呼び出し時に提示された証明書の指紋を照合します。トークンのバイト列だけが漏れても無価値で、攻撃者は証明書 **と** その秘密鍵も併せて入手しなければ通せません。

mTLS は既に PKI を運用している環境で特に強みを発揮します。たとえば B2B のサービスメッシュ、オープンバンキング、内部 CA が全関係者に証明書を発行しているバックエンド API などです。結び付きが TLS 層に乗っているため、アプリケーションコードはリクエストごとに何かを署名する必要がありません。代償として、TLS 終端（リバースプロキシ、ロードバランサ）が検証済み証明書を OP まで運ぶよう設定する必要があります。

::: warning 実装境界
`feature.MTLS` が接続するのは、証明書結び付けアクセストークン（`cnf.x5t#S256`）とリバースプロキシからの証明書取得です。`tls_client_auth` / `self_signed_tls_client_auth` 用の検証器は内部にありますが、token endpoint のクライアント認証方式としては接続されていません。FAPI 構成では token endpoint クライアント認証に `private_key_jwt` を使い、mTLS は送信者制約レイヤとして使ってください。
:::

::: details このページで触れる仕様
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280) — X.509 PKI 証明書
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

## RFC 上のクライアント認証サブモード 2 種

RFC 8705 は同じ証明書素材を使う 2 つの `token_endpoint_auth_method` を規定しています。違いは **クライアント身元を何に紐付けるか** です。以下は RFC モデルと内部検証器の形を説明するものです。これらは token endpoint の認証方式としては選択できません。

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

RFC モデルでは 2 つのモードはクライアント単位で排他です。token endpoint 側の振り分けが接続されるまでは、FAPI クライアントは `private_key_jwt` で登録し、`feature.MTLS` はトークンバインディングのためだけに有効化してください。

## Confirmation claim — `cnf.x5t#S256`

OP は mTLS 認証されたクライアントにトークンを発行する際、DER エンコードした証明書の SHA-256 ハッシュ値（RFC 8705 §3）を計算し、アクセストークンに `cnf.x5t#S256` として書き込みます。以後このアクセストークンを使うリクエストは **同じ証明書** で TLS 接続を確立する必要があり、リソースサーバは観測した証明書をハッシュして `cnf.x5t#S256` と比較します。

`cnf` 自体は DPoP と共通の仕組み(RFC 7800)ですが、**メンバ名** が異なります — DPoP は `jkt`、mTLS は `x5t#S256`。1 つのトークンはどちらか一方だけを持ち、両方が同居することはありません。

::: details なぜ証明書全体ではなく thumbprint なのか
DPoP の JWK thumbprint と同じ理由です。固定長のハッシュ値は再エンコードを跨いでも安定し、比較も安価で、JWT 内に十分収まる短さです。SHA-256 は RFC 8705 §3 が固定で指定しており、交渉の余地はありません。
:::

## リバースプロキシ構成

<svg class="mtls-proxy-flow" role="img" aria-labelledby="mtls-proxy-trust-title" viewBox="0 0 760 536" width="760" style="max-width:100%;height:auto;margin:1.5rem 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="mtls-proxy-trust-title">リバースプロキシの信頼境界: TLS 終端プロキシがクライアント証明書をヘッダに載せ、OP は信頼済み CIDR 内のリクエストからのみそれを参照し、前送りされた証明書を正本として扱い、実際の TLS ハンドシェイク証明書との不一致は invalid_request で拒否します。</title>
  <text transform="rotate(-90 26 66)" x="26" y="66" text-anchor="middle" class="d-layer" font-size="10">PUBLIC</text>
  <text transform="rotate(-90 26 190)" x="26" y="190" text-anchor="middle" class="d-layer" font-size="10">EDGE</text>
  <text transform="rotate(-90 26 392)" x="26" y="392" text-anchor="middle" class="d-layer" font-size="10">OP TRUST ZONE</text>
  <line x1="80" y1="120" x2="740" y2="120" class="d-faint"/>
  <rect x="260" y="28" width="300" height="64" rx="10"/>
  <text x="410" y="53" text-anchor="middle" class="d-label" font-size="16" font-weight="600">クライアント</text>
  <text x="410" y="77" text-anchor="middle" class="d-sub" font-size="12">X.509 クライアント証明書</text>
  <path d="M410 92 L410 138"/>
  <path d="M405 131 L410 138 L415 131"/>
  <text x="428" y="110" class="d-sub" font-size="11">TLS ハンドシェイク</text>
  <text x="428" y="125" class="d-sub" font-size="10.5">クライアント証明書を提示</text>
  <rect x="210" y="138" width="400" height="92" rx="10"/>
  <text x="410" y="164" text-anchor="middle" class="d-label" font-size="15" font-weight="600">TLS 終端プロキシ</text>
  <text x="410" y="188" text-anchor="middle" class="d-sub" font-size="11">クライアント証明書をヘッダに載せる</text>
  <text x="410" y="210" text-anchor="middle" class="d-mono" font-size="11.5">X-SSL-Cert: &lt;PEM&gt;</text>
  <line x1="80" y1="262" x2="740" y2="262" stroke-width="1.5" stroke-dasharray="6 6"/>
  <text x="88" y="256" class="d-sub" font-size="11">信頼境界</text>
  <path d="M410 230 L410 298"/>
  <path d="M405 291 L410 298 L415 291"/>
  <rect x="260" y="298" width="300" height="64" rx="10"/>
  <text x="410" y="323" text-anchor="middle" class="d-label" font-size="13" font-weight="600">trusted-CIDR ゲート</text>
  <text x="410" y="346" text-anchor="middle" class="d-mono" font-size="11.5">RemoteAddr ∈ trustedCIDRs?</text>
  <path d="M560 330 L634 330"/>
  <path d="M627 325 L634 330 L627 335"/>
  <text x="598" y="322" text-anchor="middle" class="d-sub" font-size="10.5">範囲外</text>
  <rect x="636" y="304" width="112" height="52" rx="8"/>
  <text x="692" y="326" text-anchor="middle" class="d-mono" font-size="10.5">ヘッダを無視</text>
  <text x="692" y="344" text-anchor="middle" class="d-sub" font-size="10.5">fail closed</text>
  <path d="M410 362 L410 408"/>
  <path d="M405 401 L410 408 L415 401"/>
  <text x="396" y="380" text-anchor="end" class="d-sub" font-size="10.5">範囲内</text>
  <text x="396" y="395" text-anchor="end" class="d-sub" font-size="10.5">ヘッダが正本</text>
  <rect x="210" y="408" width="400" height="112" rx="10" class="op-accent"/>
  <text x="410" y="436" text-anchor="middle" class="d-op" font-size="15" font-weight="600">OP — 本ライブラリ</text>
  <text x="410" y="462" text-anchor="middle" class="d-sub" font-size="11">直接 TLS 終端時はハンドシェイク証明書</text>
  <text x="410" y="484" text-anchor="middle" class="d-sub" font-size="11">ヘッダとハンドシェイクの不一致 →</text>
  <text x="410" y="505" text-anchor="middle" class="d-mono" font-size="11.5">invalid_request</text>
</svg>

本番では OP が自前で TLS を終端することはほぼありません。前段の nginx / envoy / AWS ALB / クラウド LB が TLS を復号し、OP には平文 HTTP で渡します。OP に届いた時点でクライアント証明書はすでに接続から失われているため、プロキシが HTTP ヘッダ（`X-SSL-Cert`、`X-Forwarded-Client-Cert` など）で前送りする必要があります。

OP は **どのヘッダから読むか** と **どの IP 範囲がそのヘッダを設定してよいか** の両方を知る必要があります。後者を抜くと、インターネット側の任意のクライアントが偽造ヘッダを送って、認証済みクライアントになりすませてしまいます。

```go
op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"})
```

引数はいずれも必須です(`op/options_fapi_proxy.go`):

- `headerName` が空文字なら設定エラー。ヘッダパスを無効化したい場合はオプション自体を渡さないでください。
- `trustedCIDRs` が空 slice なら構築時に拒否されます。設定ミスで許可リストが黙って広がる経路を塞ぐためです。

OP が自前で TLS を終端しているときは、ライブラリは TLS ハンドシェイクの証明書(`http.Request.TLS.PeerCertificates`)を優先します。ヘッダ経路は、ハンドシェイク証明書が無く **かつ** リクエストの `RemoteAddr` が `trustedCIDRs` のいずれかに含まれるときにのみ参照されます。リバースプロキシを迂回して OP に直接到達した攻撃者は、ヘッダを設定しても証明書を偽造できません — OP は fail closed して、証明書なしのリクエストと同じ応答を返します。

信頼済みプロキシがクライアント証明書ヘッダを前送りした場合、そのヘッダ上の証明書がトークン結び付けの正本です。プロキシヘッダの証明書と実際の TLS ハンドシェイクの証明書が食い違う場合は、プロキシ自身の証明書へ黙って結び付けず `invalid_request` で拒否します。

`op.MTLSProxyConfig(provider)` は記録された設定を返すので、外部に置いた introspection エンドポイントなどで `internal/mtls.Verifier` を自前構築する組み込み側でも、同じ許可リストを再利用できます。

## 実装例

mTLS 送信者制約の最小構成:

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

`op.WithProfile(profile.FAPI2Baseline)` は `[DPoP, MTLS]` に対する `RequiredAnyOf` を課します。どちらも明示しなければ、プロファイルは DPoP を既定メンバーとして選びます。mTLS の送信者制約を使う構成では `feature.MTLS` を明示してください。その場合は mTLS が制約を満たすため DPoP 既定は追加されません。クライアントの token endpoint 認証には `private_key_jwt` を使います。

## 落とし穴

- **TLS 終端が証明書を正しく前送りすること。** プロキシごとにヘッダ名とエンコード（DER / PEM / URL エンコード PEM）が違います。両端で形式と `WithMTLSProxy` のヘッダ名を固定してください。
- **証明書の更新には運用面の調整が必要。** `self_signed_tls_client_auth` の証明書を更新する場合、登録 JWKS も同時に更新しないと新証明書の thumbprint が一致しません。新旧証明書の有効期間が重なる間は、新旧両方の JWK が登録されているように rollover を計画してください。
- **mTLS クライアント認証を token endpoint method として設定しない。** mTLS は送信者制約レイヤです。FAPI 構成のクライアント認証には `private_key_jwt` を使ってください。
- **空の matcher は fail closed。** `tls_client_auth` では `SubjectDN` / `SANDNS` / `SANURI` / `SANIP` / `SANEmail` のうち少なくとも 1 つが必要です。すべて空のまま登録された場合、検証側が `ErrNoMatcherConfigured` で拒否します。
- **多段プロキシでの `RemoteAddr` の意味。** OP の前にプロキシが 2 段ある場合、`RemoteAddr` に乗るのは **直前の** プロキシの IP のみです。その IP が `trustedCIDRs` に入っている必要があります。さらに外側のプロキシはヘッダ許可リストの対象外です（OP が直接見ないため）。

## mTLS が向いているケース

- **既存 PKI を持つバックエンドサービス** — 全サービスが内部 CA 発行のクライアント証明書を既に持っている環境では、新しい鍵管理面を増やさずに mTLS を導入できます。
- **オープンバンキング・B2B サービスメッシュ** — 規制やパートナー要件として、ネットワーク層で mTLS が既に必須になっているケースが多くあります。RFC 8705 はその上にトークン結び付けを乗せるだけです。
- **TLS 終端をすでに運用している運用チーム** — `WithMTLSProxy` の設定は一度きりの作業で、既存の nginx / envoy 設定の隣に自然に収まります。
- **リクエストごとの署名コストを払いたくない制約クライアント** — 結び付きが TLS 層にあるため、アプリ側は API 呼び出しごとに新規署名を作る必要がありません。

## mTLS が向かないケース

- **ブラウザ** — 現在のブラウザはクライアント証明書を提示する手段が乏しく、SPA で mTLS を実用化するのは現実的ではありません。代わりに [DPoP](/ja/concepts/dpop) を使ってください。
- **モバイルアプリ** — 多くのプラットフォームはクライアント証明書をサポートしますが、プロビジョニングと更新の UX が芳しくありません。DPoP のリクエスト毎署名のほうがモバイル鍵ストアと相性が良いことが多いです。
- **PKI が無い環境** — 単にクライアント証明書を発行するためだけに内部 CA を立ち上げるのは重い投資です。これから始めるなら、DPoP のほうが証明書ロジスティクス無しで送信者制約を導入できます。
- **異種混在環境** — SPA とバックエンドが混ざる環境では結局両方を運用することになりがちです。discovery に両方を出し、クライアントごとに使えるほうを選ばせる構成が現実的です。

## 次に読む

- [DPoP (RFC 9449)](/ja/concepts/dpop) — もう一方の送信者制約方式。クライアント保有鍵に結び付けます。
- [送信者制約 — 選定ガイド](/ja/concepts/sender-constraint) — 比較表と使い分けの指針。
- [使い方: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — `private_key_jwt` クライアント認証と送信者制約を含む完全な組み込み例。
- [設計判断](/ja/security/design-judgments) — 仕様間トレードオフの整理。
