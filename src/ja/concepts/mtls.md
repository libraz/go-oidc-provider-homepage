---
title: mTLS (RFC 8705)
description: Mutual-TLS Client Authentication と Certificate-Bound Access Tokens — 正規クライアントが TLS で提示した証明書にアクセストークンを結び付ける方式。
pageClass: pg-concepts-mtls
---

# mTLS — 証明書結び付けアクセストークン

**mTLS**（RFC 8705）は、TLS ハンドシェイク中にクライアントを認証した X.509 証明書にアクセストークンを結び付ける仕組みです。OP は証明書の SHA-256 指紋（thumbprint）を `cnf.x5t#S256` として発行トークンに書き込み、リソースサーバは API 呼び出し時に提示された証明書の指紋を照合します。トークンのバイト列だけが漏れても無価値で、攻撃者は証明書 **と** その秘密鍵も併せて入手しなければ通せません。

mTLS は既に PKI を運用している環境で特に強みを発揮します。たとえば B2B のサービスメッシュ、オープンバンキング、内部 CA が全関係者に証明書を発行しているバックエンド API などです。結び付きが TLS 層に乗っているため、アプリケーションコードはリクエストごとに何かを署名する必要がありません。代償として、TLS 終端（リバースプロキシ、ロードバランサ）が検証済み証明書を OP まで運ぶよう設定する必要があります。

::: warning 実装境界
`feature.MTLS` が接続するのは、証明書結び付けアクセストークン（`cnf.x5t#S256`）と、直接 TLS または信頼済みリバースプロキシのヘッダからの証明書取得です。`tls_client_auth` / `self_signed_tls_client_auth` は token endpoint のクライアント認証方式として広告も振り分けもされません。FAPI のクライアント認証には `private_key_jwt` を使い、mTLS は送信者制約レイヤとして使ってください。
:::

::: details このページで触れる仕様
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280) — X.509 PKI 証明書
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
:::

## 証明書を信頼する方法

RFC 8705 は証明書を使うクライアント認証方式を定義していますが、本ライブラリの公開 mTLS seam は送信者制約の経路です。token endpoint は `tls_client_auth` / `self_signed_tls_client_auth` を広告も振り分けも行いません。非対称クライアント認証を要求する profile では、クライアントを `private_key_jwt` で登録してください。

`feature.MTLS` を有効にすると、OP は直接 TLS ハンドシェイク、または後述する信頼済みプロキシ経路からクライアント証明書を取得し、RFC 8705 の thumbprint を計算して発行トークンに結び付けます。チェーン検証は通常 TLS 終端側の責務です。OP 自身にもチェーン検証をさせる場合は、nil ではない公開 pool を渡します:

```go
import "crypto/x509"

pool := x509.NewCertPool()
pool.AppendCertsFromPEM(caPEM)

op.WithFeature(feature.MTLS),
op.WithMTLSRootCAs(pool),
```

`WithMTLSRootCAs(pool *x509.CertPool)` は任意の公開 option です。nil ではない pool は、ハンドシェイク証明書と `WithMTLSProxy` で選ばれた証明書の両方に適用され、client authentication 用のチェーン検証が必要になります。`nil` は設定エラーです。何も信頼しない場合は空の `x509.NewCertPool()` を渡してください。直接 TLS スタックまたは信頼済みプロキシが外部クライアントのチェーンを検証済みなら、この option は省略します。

## Confirmation claim — `cnf.x5t#S256`

OP は mTLS 認証されたクライアントにトークンを発行する際、DER エンコードした証明書の SHA-256 ハッシュ値（RFC 8705 §3）を計算し、アクセストークンに `cnf.x5t#S256` として書き込みます。以後このアクセストークンを使うリクエストは **同じ証明書** で TLS 接続を確立する必要があり、リソースサーバは観測した証明書をハッシュして `cnf.x5t#S256` と比較します。

`cnf` 自体は DPoP と共通の仕組み（RFC 7800）ですが、**メンバ名** が異なります — DPoP は `jkt`、mTLS は `x5t#S256`。1 つのトークンに両方のメンバを持たせることもできます。両方の結び付きがある場合、利用側 endpoint は conjunction（AND）として検証します。つまり DPoP proof は `jkt` に、提示証明書は `x5t#S256` に一致しなければなりません。本ライブラリは `/userinfo` でこの conjunction を適用し、device-code と CIBA の grant binding でも記録されたすべての方式を要求します。

::: details なぜ証明書全体ではなく thumbprint なのか
DPoP の JWK thumbprint と同じ理由です。固定長のハッシュ値は再エンコードを跨いでも安定し、比較も安価で、JWT 内に十分収まる短さです。SHA-256 は RFC 8705 §3 が固定で指定しており、交渉の余地はありません。
:::

## リバースプロキシ構成

<figure class="fig">
  <div class="fig-head">証明書が信頼境界を越える場所</div>
  <svg class="fig-svg" role="img" aria-labelledby="mtls-proxy-title" viewBox="0 0 960 486" xmlns="http://www.w3.org/2000/svg">
    <title id="mtls-proxy-title">TLS 終端プロキシがハンドシェイクからクライアント証明書を取り出し、ヘッダに載せて前送りします。OP がそのヘッダを読むのは、リクエストが信頼済み CIDR に含まれるアドレスから届いた場合だけです。それ以外ではヘッダを無視し、リクエストは fail closed になります。</title>
    <!-- ゾーン -->
    <rect class="fg-group" x="30" y="30" width="900" height="110" rx="8"/>
    <rect class="fg-group" x="30" y="152" width="900" height="130" rx="8"/>
    <rect class="fg-group" x="30" y="302" width="900" height="172" rx="8"/>
    <text class="fg-lbl" x="46" y="48">public</text>
    <text class="fg-lbl" x="46" y="170">edge</text>
    <text class="fg-lbl fg-accent" x="46" y="320">op trust zone</text>
    <!-- クライアント -->
    <rect class="fg-box" x="330" y="56" width="300" height="68" rx="8"/>
    <text class="fg-t" x="480" y="80" text-anchor="middle">クライアント</text>
    <text class="fg-xs" x="480" y="98" text-anchor="middle">X.509 クライアント証明書を保持する</text>
    <text class="fg-mxs" x="480" y="114" text-anchor="middle">TLS ハンドシェイクで提示する</text>
    <path class="fg-edge" d="M480,128 V178" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="496" y="150">相互 TLS ハンドシェイク</text>
    <!-- プロキシ -->
    <rect class="fg-box" x="330" y="182" width="300" height="82" rx="8"/>
    <text class="fg-t2" x="480" y="206" text-anchor="middle">TLS 終端プロキシ</text>
    <text class="fg-xs" x="480" y="224" text-anchor="middle">TLS を終端し、証明書を取り出す</text>
    <text class="fg-mxs" x="480" y="244" text-anchor="middle">X-SSL-Cert: &lt;PEM&gt;</text>
    <!-- 信頼境界 -->
    <line class="fg-rule fg-rule--dashed fg-rule--strong" x1="30" y1="292" x2="930" y2="292"/>
    <text class="fg-lbl" x="806" y="287">trust boundary</text>
    <path class="fg-edge" d="M480,268 V326" marker-end="url(#fg-a)"/>
    <!-- ゲート -->
    <rect class="fg-box fg-box--accent" x="360" y="330" width="240" height="60" rx="8"/>
    <text class="fg-t2 fg-accent" x="480" y="354" text-anchor="middle">trusted-CIDR ゲート</text>
    <text class="fg-mxs" x="480" y="374" text-anchor="middle">RemoteAddr ∈ trustedCIDRs?</text>
    <!-- 拒否 -->
    <path class="fg-edge fg-edge--danger" d="M356,360 H244" marker-end="url(#fg-ad)"/>
    <text class="fg-xs" x="300" y="353" text-anchor="middle">範囲外</text>
    <rect class="fg-box fg-box--danger" x="46" y="330" width="194" height="60" rx="8"/>
    <text class="fg-t2" x="64" y="354">ヘッダを無視する</text>
    <text class="fg-xs" x="64" y="374">fail closed — 証明書なし扱い</text>
    <!-- 受理 -->
    <path class="fg-edge fg-edge--accent" d="M604,360 H716" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="660" y="353" text-anchor="middle">範囲内</text>
    <rect class="fg-box fg-box--accent" x="720" y="330" width="194" height="60" rx="8"/>
    <text class="fg-t2 fg-accent" x="738" y="354">ヘッダが正本</text>
    <text class="fg-xs" x="738" y="374">前送りされた証明書を使う</text>
    <!-- OP -->
    <path class="fg-edge fg-edge--accent" d="M817,394 V430 H634" marker-end="url(#fg-ac)"/>
    <rect class="fg-box fg-box--accent" x="330" y="404" width="300" height="54" rx="8"/>
    <text class="fg-t fg-accent" x="480" y="426" text-anchor="middle">OP — 本ライブラリ</text>
    <text class="fg-mxs" x="480" y="446" text-anchor="middle">cnf.x5t#S256 が証明書をトークンに結び付ける</text>
    <text class="fg-xs" x="46" y="424">プロキシを挟まず OP が直接 TLS を</text>
    <text class="fg-xs" x="46" y="440">終端する構成では、ハンドシェイクの</text>
    <text class="fg-xs" x="46" y="456">証明書を使い、ヘッダは一切参照しません</text>
  </svg>
  <figcaption class="fig-note">このゲートがセキュリティ上の論拠のすべてです。ヘッダは OP に直接到達できる相手なら誰でも偽造できるため、そのヘッダが載せる証明書は、リクエストが書き込んだプロキシから来たと OP が確認できて初めて意味を持ちます。</figcaption>
</figure>

本番では OP が自前で TLS を終端することはほぼありません。前段の nginx / envoy / AWS ALB / クラウド LB が TLS を復号し、OP には平文 HTTP で渡します。OP に届いた時点でクライアント証明書はすでに接続から失われているため、プロキシが HTTP ヘッダ（`X-SSL-Cert`、`X-Forwarded-Client-Cert` など）で前送りする必要があります。

OP は **どのヘッダから読むか** と **どの IP 範囲がそのヘッダを設定してよいか** の両方を知る必要があります。後者を抜くと、インターネット側の任意のクライアントが偽造ヘッダを送って、認証済みクライアントになりすませてしまいます。

```go
op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"})
```

引数はいずれも必須です（`op/options_fapi_proxy.go`）:

- `headerName` が空文字なら設定エラー。ヘッダパスを無効化したい場合はオプション自体を渡さないでください。
- `trustedCIDRs` が空 slice なら構築時に拒否されます。設定ミスで許可リストが黙って広がる経路を塞ぐためです。

直接経路では `http.Request.TLS.PeerCertificates` を読みます。プロキシ経路はリクエストの `RemoteAddr` が設定済み trusted CIDR 内にある場合だけ参照され、範囲外からのヘッダは無視されて fail closed になります。信頼済みプロキシから来たリクエストでは、前送りされた証明書が正本であり、プロキシから OP までの TLS hop にある証明書より優先されます。プロキシの transport 証明書は OAuth クライアント証明書として扱いません。

`op.MTLSProxy` は公開設定型です。`op.MTLSProxyConfig(provider)` は記録済みの `HeaderName` と fresh な `TrustedProxies` slice を返し、option が無ければ zero value を返します。組み込み側の edge code はこの公開 projection を使ってヘッダ除去ポリシーを OP と揃えられ、internal verifier の import は必要ありません。

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

OP が自前で TLS を終端する環境（テスト、シングルテナント on-prem 等）では、`WithMTLSProxy` 行は省略可能です — ライブラリは `http.Request.TLS.PeerCertificates` から直接証明書を読みます。OP 自身にもチェーン再検証をさせる場合は、CA を追加した `x509.NewCertPool()` と `WithMTLSRootCAs` を渡してください。

`op.WithProfile(profile.FAPI2Baseline)` は `[DPoP, MTLS]` に対する `RequiredAnyOf` を課します。どちらも明示しなければ、プロファイルは DPoP を既定メンバーとして選びます。mTLS の送信者制約を使う構成では `feature.MTLS` を明示してください。その場合は mTLS が制約を満たすため DPoP 既定は追加されません。クライアントの token endpoint 認証には `private_key_jwt` を使います。

## 落とし穴

- **TLS 終端が証明書を正しく前送りすること。** プロキシごとにヘッダ名とエンコード（DER / PEM / URL エンコード PEM）が違います。両端で形式と `WithMTLSProxy` のヘッダ名を固定してください。
- **証明書の更新で binding が変わる。** トークンは発行時の leaf 証明書に結び付いています。証明書を更新したらトークンも再発行してください。新しい証明書では古いトークンの `cnf.x5t#S256` を満たせません。
- **mTLS クライアント認証を token endpoint method として設定しない。** mTLS は送信者制約レイヤです。FAPI 構成のクライアント認証には `private_key_jwt` を使ってください。
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
