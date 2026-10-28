---
title: mTLS (RFC 8705)
description: Mutual-TLS Client Authentication と Certificate-Bound Access Tokens — 正規クライアントが TLS で提示した証明書にアクセストークンを結び付ける方式。
pageClass: pg-concepts-mtls
---

# mTLS — 証明書結び付けアクセストークン

**mTLS**（RFC 8705）は、TLS ハンドシェイク中にクライアントを認証した X.509 証明書にアクセストークンを結び付ける仕組みです。OP は証明書の SHA-256 指紋（thumbprint）を `cnf.x5t#S256` として発行トークンに書き込み、リソースサーバは API 呼び出し時に提示された証明書の指紋を照合します。トークンのバイト列だけが漏れても無価値で、攻撃者は証明書 **と** その秘密鍵も併せて入手しなければ通せません。

mTLS は既に PKI を運用している環境で特に強みを発揮します。たとえば B2B のサービスメッシュ、オープンバンキング、内部 CA が全関係者に証明書を発行しているバックエンド API などです。結び付きが TLS 層に乗っているため、アプリケーションコードはリクエストごとに何かを署名する必要がありません。代償として、TLS 終端（リバースプロキシ、ロードバランサ）が検証済み証明書を OP まで運ぶよう設定する必要があります。

::: warning 実装境界
`feature.MTLS` が接続するのは、証明書結び付けアクセストークン（`cnf.x5t#S256`）と、直接 TLS または信頼済みリバースプロキシのヘッダからの証明書取得です。Final の FAPI 2.0 Security Profile は token endpoint のクライアント認証に mTLS または `private_key_jwt` を許可します。本ライブラリでは `tls_client_auth` / `self_signed_tls_client_auth` は token endpoint の認証方式として広告も振り分けもされないため、その経路には `private_key_jwt` を使い、mTLS は送信者制約レイヤとして使ってください。
:::

::: details このページで触れる仕様
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280) — X.509 PKI 証明書
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — Final
:::

## 証明書を信頼する方法

RFC 8705 は証明書を使うクライアント認証方式を定義していますが、本ライブラリの公開 mTLS seam は送信者制約の経路です。Final の FAPI 2.0 Security Profile は token endpoint の認証に mTLS または `private_key_jwt` を許可します。本ライブラリの token endpoint は `tls_client_auth` / `self_signed_tls_client_auth` を広告も振り分けも行わないため、本ライブラリで非対称クライアント認証を使うときは `private_key_jwt` で登録してください。

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

結び付けが行われるのは、token リクエストが証明書を提示したときだけです。提示がなければ通常の bearer トークンになります。ただし `profile.FAPI2Baseline`、`profile.FAPI2MessageSigning`、`profile.FAPICIBA` は `400 invalid_request` で拒否します。リフレッシュトークンも全クライアント種別で同じように結び付きます。連鎖は証明書の thumbprint を覚えていて、リフレッシュのたびに同じ証明書を提示しなければ `invalid_grant` で失敗します。mTLS は連鎖の途中で bearer から結び付きへ切り替わることはなく、結び付きは発行時に固定されます。

`/userinfo` では、証明書に結び付いたトークンに対して証明書がない、または別のものだった場合、`401` と `invalid_token` で拒否します。応答からは理由を区別できません。OP の introspection 応答は結び付きを `cnf` で報告し、`token_type` は `Bearer` のままです。

`cnf` 自体は DPoP と共通の仕組み（RFC 7800）ですが、**メンバ名** が異なります — DPoP は `jkt`、mTLS は `x5t#S256`。1 つのトークンに両方のメンバを持たせることもできます。両方の結び付きがある場合、利用側 endpoint は conjunction（AND）として検証します。つまり DPoP proof は `jkt` に、提示証明書は `x5t#S256` に一致しなければなりません。本ライブラリは `/userinfo` でこの conjunction を適用し、device-code と CIBA の grant binding でも記録されたすべての方式を要求します。

::: details なぜ証明書全体ではなく thumbprint なのか
DPoP の JWK thumbprint と同じ理由です。固定長のハッシュ値は再エンコードを跨いでも安定し、比較も安価で、JWT 内に十分収まる短さです。SHA-256 は RFC 8705 §3 が固定で指定しており、交渉の余地はありません。
:::

## リバースプロキシ構成

<figure class="fig">
  <div class="fig-head">転送された証明書は、プロキシ経由のときだけ信頼する</div>
  <svg class="fig-svg" role="img" aria-labelledby="mtls-proxy-title" viewBox="0 0 960 624" xmlns="http://www.w3.org/2000/svg">
    <title id="mtls-proxy-title">TLS 終端プロキシがハンドシェイクからクライアント証明書を取り出し、ヘッダに載せて前送りします。OP がそのヘッダを読むのは、リクエストが信頼済み CIDR に含まれるアドレスから届いた場合だけです。それ以外ではヘッダを無視し、リクエストは fail closed になります。</title>
    <!-- client -->
    <rect class="fg-box" x="312" y="24" width="336" height="72" rx="8"/>
    <text class="fg-t2" x="328" y="52">クライアント</text>
    <text class="fg-xs" x="328" y="76">X.509 クライアント証明書を保持する</text>
    <path class="fg-edge" d="M480,96 V152" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="492" y="129">相互 TLS ハンドシェイク</text>
    <!-- proxy -->
    <rect class="fg-box" x="312" y="152" width="336" height="96" rx="8"/>
    <text class="fg-t2" x="328" y="180">TLS 終端プロキシ</text>
    <text class="fg-xs" x="328" y="204">TLS を終端し、証明書を取り出す</text>
    <text class="fg-mxs" x="328" y="228">X-SSL-Cert: &lt;PEM&gt;</text>
    <path class="fg-edge" d="M480,248 V344" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="492" y="277">転送されたリクエスト</text>
    <!-- trust boundary -->
    <rect class="fg-frame" x="32" y="296" width="896" height="304" rx="8"/>
    <text class="fg-lbl fg-accent" x="56" y="324">op trust zone</text>
    <rect class="fg-box fg-box--accent" x="312" y="344" width="336" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="328" y="372">trusted-CIDR ゲート</text>
    <text class="fg-mxs" x="328" y="396">RemoteAddr ∈ trustedCIDRs?</text>
    <path class="fg-leader" d="M480,416 V440 M256,440 H704"/>
    <path class="fg-edge fg-edge--thin fg-edge--danger" d="M256,440 V480" marker-end="url(#fg-ad)"/>
    <text class="fg-s" x="268" y="465">範囲外</text>
    <path class="fg-edge fg-edge--thin fg-edge--accent" d="M704,440 V480" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="716" y="465">範囲内</text>
    <!-- out of range -->
    <rect class="fg-box fg-box--danger" x="56" y="480" width="400" height="96" rx="8"/>
    <text class="fg-t2" x="72" y="508">ヘッダを無視する</text>
    <text class="fg-xs" x="72" y="532">証明書なしとして扱う</text>
    <text class="fg-xs" x="72" y="556">fail closed</text>
    <!-- in range -->
    <rect class="fg-box fg-box--accent" x="504" y="480" width="400" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="520" y="508">ヘッダが正本</text>
    <text class="fg-xs" x="520" y="532">前送りされた証明書を使う</text>
    <text class="fg-mxs" x="520" y="556">cnf.x5t#S256 でトークンに結び付ける</text>
  </svg>
  <figcaption class="fig-note">このゲートがセキュリティ上の論拠のすべてです。ヘッダは OP に直接到達できる相手なら誰でも偽造できるため、載っている証明書は、ヘッダを書き込んだプロキシからのリクエストだと確認できて初めて意味を持ちます。プロキシを挟まない構成では、OP はハンドシェイクの証明書を使い、ヘッダは一切参照しません。</figcaption>
</figure>

本番では OP が自前で TLS を終端しない構成が多くあります。前段の nginx / envoy / AWS ALB / クラウド LB が TLS を復号し、OP には平文 HTTP で渡します。OP に届いた時点でクライアント証明書はすでに接続から失われているため、プロキシが `X-SSL-Cert` のような HTTP ヘッダで前送りする必要があります。

OP は **どのヘッダから読むか** と **どの IP 範囲がそのヘッダを設定してよいか** の両方を知る必要があります。後者を抜くと、インターネット側の任意のクライアントが偽造ヘッダを送って、認証済みクライアントになりすませてしまいます。

```go
op.WithMTLSProxy("X-SSL-Cert", []string{"10.0.0.0/8"})
```

引数はいずれも必須です（`op/options_fapi_proxy.go`）:

- `headerName` が空文字なら設定エラー。ヘッダパスを無効化したい場合はオプション自体を渡さないでください。
- `trustedCIDRs` が空 slice なら構築時に拒否されます。設定ミスで許可リストが黙って広がる経路を塞ぐためです。

`WithMTLSProxy` と `WithMTLSRootCAs` が効くのは `feature.MTLS` と併用したときだけです。feature がなければ、検証はされても無視されます。前送りされた証明書は読まれず、トークンにも `cnf.x5t#S256` は付きません。`op.New` は失敗にせず、設定が部分的であることを警告ログに出すので、起動ログを確認してください。

ヘッダには、`CERTIFICATE` の PEM ブロックをちょうど 1 つ載せた単一のフィールドが必要です。フィールドの重複、証明書チェーン、末尾の余分なデータは不正な証明書（`invalid_request`）として拒否します。複数の hop が別々の leaf を選ぶことを防ぐためです。信頼済みプロキシからのリクエストにヘッダがなければ、プロキシ自身の transport 証明書が接続上にあっても、証明書の提示なしとして扱います。

直接経路では `http.Request.TLS.PeerCertificates` を読みます。証明書が届くには、Go の HTTP サーバでクライアント証明書を要求する設定（`tls.Config.ClientAuth`）が必要です。プロキシ経路はリクエストの `RemoteAddr` が設定済み trusted CIDR 内にある場合だけ参照され、範囲外からのヘッダは無視されて fail closed になります。信頼済みプロキシから来たリクエストでは、前送りされた証明書が正本であり、プロキシから OP までの TLS hop にある証明書より優先されます。プロキシの transport 証明書は OAuth クライアント証明書として扱いません。

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

`op.WithProfile(profile.FAPI2Baseline)` は `[DPoP, MTLS]` に対する `RequiredAnyOf` を課します。どちらも明示しなければ、プロファイルは DPoP を既定メンバーとして選びます。mTLS の送信者制約を使う構成では `feature.MTLS` を明示してください。その場合は mTLS が制約を満たすため DPoP 既定は追加されません。本ライブラリのクライアントの token endpoint 認証には `private_key_jwt` を使いますが、Final Security Profile は mTLS も許可しています。

## 落とし穴

- **TLS 終端が証明書を正しく前送りすること。** プロキシごとにヘッダ名とエンコードが違います。OP が受け付けるのは、生のまま、またはパーセントエンコードした単一の PEM 証明書（nginx の `$ssl_client_escaped_cert` など）です。DER や、Envoy の `x-forwarded-client-cert` のような複数フィールドの構造化された値は受け付けません。`WithMTLSProxy` のヘッダ名を固定し、プロキシ側で外部から届いた同名ヘッダを取り除いてください。
- **証明書の更新で binding が変わる。** トークンは発行時の leaf 証明書に結び付き、リフレッシュトークンの連鎖も同じです。クライアントの証明書がローテーションすると、古いアクセストークンはリソースサーバで通らなくなり、新しい証明書でのリフレッシュも `invalid_grant` で失敗します。クライアントは認可からやり直す必要があるので、証明書の有効期間はリフレッシュトークンの寿命と合わせて決めてください。
- **未対応の mTLS クライアント認証方式を token endpoint に設定しない。** Final Security Profile は token endpoint の mTLS を許可しますが、本ライブラリの token endpoint が振り分けるのは `private_key_jwt` です。mTLS は送信者制約レイヤとして利用できます。
- **多段プロキシでの `RemoteAddr` の意味。** OP の前にプロキシが 2 段ある場合、`RemoteAddr` に乗るのは **直前の** プロキシの IP のみです。その IP が `trustedCIDRs` に入っている必要があります。さらに外側のプロキシはヘッダ許可リストの対象外です（OP が直接見ないため）。

## mTLS が向いているケース

- **既存 PKI を持つバックエンドサービス** — 全サービスが内部 CA 発行のクライアント証明書を既に持っている環境では、新しい鍵管理面を増やさずに mTLS を導入できます。
- **オープンバンキング・B2B サービスメッシュ** — 制度やパートナー標準によってネットワーク層の mTLS が求められる場合があります。RFC 8705 はその上にトークン結び付けを乗せます。
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
- [ユースケース: FAPI 2.0 Security Profile](/ja/use-cases/fapi2-baseline) — `private_key_jwt` クライアント認証と送信者制約を含む完全な組み込み例。
- [設計判断](/ja/security/design-judgments) — 仕様間トレードオフの整理。
