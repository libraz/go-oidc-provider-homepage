---
title: FAPI 2.0 入門
description: FAPI とは何か、なぜ存在するか、各要件が何を防いでいるか — はじめての方向け。
pageClass: pg-concepts-fapi
---

# FAPI 2.0 入門

**FAPI**（Financial-grade API）は、OpenID Foundation が策定する OAuth 2.0 ベースの高セキュリティプロファイル群です。FAPI 2.0 Security Profile は、認証済み利用者の識別子を返す配備で OpenID Connect を使いますが、すべてのユースケースで OIDC を要求するわけではありません。

もともとは Open Banking 向けに作られました。英国、豪州、ブラジルなどの Open Banking / Open Finance では、FAPI または地域向けプロファイルが銀行とフィンテック間のセキュリティ標準に使われています。最近は医療、政府デジタル ID など、「RFC に従っています」だけでは監査が通らない領域にも採用が広がっています。

::: details Open Banking とは何か
「Open Banking」は、利用者が銀行のパスワードを渡さずに、サードパーティアプリへ **口座データの参照や支払開始の権限を委譲** できるようにする規制枠組みです。代表例は英国の PSD2 由来 Open Banking（2018）、ブラジルの Open Finance（2020）、豪州の Consumer Data Right（2020）です。これらの制度では、FAPI や関連プロファイルが異なる版・組み合わせで採用されています。規制対象でなければ FAPI を準拠目的で使う必要はありません。ただし、CVE 級の脆弱性を避けたい場面では、同じプロファイルを既定の出発点に据える価値があります。
:::

::: details このページで触れる仕様
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — Final（旧 Baseline 仕様）
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-message-signing-2_0.html) — Final
- [FAPI 2.0 Attacker Model](https://openid.net/specs/fapi-attacker-model-2_0-final.html) — Final
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [JARM](https://openid.net/specs/oauth-v2-jarm.html) — JWT-Secured Authorization Response Mode
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

## なぜ「OIDC + ベストプラクティス」ではなくプロファイルなのか

OAuth 2.0 と関連仕様では、多くの選択肢が実装や配備に委ねられています:

- 認可要求を平文のクエリ文字列で送れる
- 高セキュリティの配備には広すぎる署名アルゴリズムを公開できる
- クライアント認証に `client_secret_basic`（長寿命の共有秘密）を使える

これらの選択肢を不適切に組み合わせると、深刻な実装脆弱性につながることがあります。

**プロファイル** は、配備でセキュリティ上重要な選択肢を固定する契約です。FAPI 2.0 はその必須要件を固定し、基盤仕様が任意として残す選択肢は明示的に残します。これにより適合確認をチェックリストとして扱えます。

## FAPI 1.0 と FAPI 2.0

FAPI 1.0（"Read-Only" / "Read-Write" の 2 区分）への参照を見かけることもあります。FAPI 2.0 はその後継で、形式的に分析された攻撃者モデルと、汎用の Security Profile を備えています。Message Signing は非否認性の方式を追加する別の FAPI 2.0 プロファイルです:

| | FAPI 1.0（依然現役） | FAPI 2.0 |
|---|---|---|
| 区分 | Read-Only / Read-Write | Security Profile / Message Signing |
| authorize 要求の経路 | 任意の `request` JWT | **PAR 必須** |
| 送信者制約 | mTLS または holder-of-key | **DPoP または mTLS 必須** |
| `response_type` | `code id_token`（hybrid）も許可 | `code` のみ |
| アルゴリズムリスト | クライアントメタデータで交渉 | 固定の許可リスト |

::: details FAPI 1.0 の Read-Only と Read-Write の違い
FAPI 1.0 には区分が 2 つありました。**Read-Only** はデータ取得だけを行う使い方向け（残高参照アプリなど）、**Read-Write** は状態変更を伴う使い方向け（決済を起票するアプリなど）で、要求署名・応答署名・holder-of-key などの追加要件がありました。FAPI 2.0 は汎用のセキュリティ基盤として Security Profile を置き、非否認性が必要な配備向けに Message Signing を別に定義しています。Message Signing は Security Profile を置き換えるものではなく、拡張するものです。
:::

`go-oidc-provider` は FAPI 2.0 を対象にしており、FAPI 1.0 は対象外です。

## Security Profile と Message Signing

FAPI 2.0 には、全体の基盤となる Security Profile と、独立した Message Signing プロファイルがあります。Go ライブラリでは前者を表す識別子に、旧称に由来する `profile.FAPI2Baseline` を使います。

<figure class="fig">
  <div class="fig-head">FAPI は層ごとに基盤仕様の選択肢を絞り込む</div>
  <svg class="fig-svg" role="img" aria-labelledby="fapi-layers-title" viewBox="0 0 960 376" xmlns="http://www.w3.org/2000/svg">
    <title id="fapi-layers-title">FAPI 2.0 のプロファイル。基盤仕様は選択肢を広く残しており、Security Profile が高セキュリティの最低ラインを固定し、Message Signing が署名付き認可リクエスト、署名付き認可レスポンス、署名付き introspection レスポンスを個別に追加します。</title>
    <!-- FAPI 2.0 Message Signing -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="640" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="52">FAPI 2.0 Message Signing</text>
    <text class="fg-xs" x="48" y="76">Security Profile に JAR・JARM・署名付き introspection を追加</text>
    <text class="fg-mxs" x="48" y="100">op.WithProfile(profile.FAPI2MessageSigning)</text>
    <path class="fg-leader" d="M672,48 H736"/>
    <rect class="fg-pill" x="736" y="32" width="192" height="32" rx="16"/>
    <text class="fg-s" x="832" y="53" text-anchor="middle">監査証跡</text>
    <path class="fg-leader" d="M672,96 H736"/>
    <rect class="fg-pill" x="736" y="80" width="192" height="32" rx="16"/>
    <text class="fg-s" x="832" y="101" text-anchor="middle">非否認性</text>
    <!-- FAPI 2.0 Security Profile -->
    <rect class="fg-box" x="32" y="152" width="640" height="96" rx="8"/>
    <text class="fg-t" x="48" y="180">FAPI 2.0 Security Profile</text>
    <text class="fg-xs" x="48" y="204">PAR · PKCE S256 · confidential client · DPoP または mTLS</text>
    <text class="fg-mxs" x="48" y="228">op.WithProfile(profile.FAPI2Baseline)</text>
    <path class="fg-leader" d="M672,200 H736"/>
    <rect class="fg-pill" x="736" y="184" width="192" height="32" rx="16"/>
    <text class="fg-s" x="832" y="205" text-anchor="middle">最低安全要件</text>
    <!-- OAuth 2.0 + OpenID Connect -->
    <rect class="fg-box fg-box--muted" x="32" y="280" width="640" height="72" rx="8"/>
    <text class="fg-t" x="48" y="308">OAuth 2.0 + OpenID Connect</text>
    <text class="fg-xs" x="48" y="332">選択肢が多く、組み合わせ次第で危険なものもある</text>
    <path class="fg-leader" d="M672,316 H736"/>
    <rect class="fg-pill" x="736" y="300" width="192" height="32" rx="16"/>
    <text class="fg-s" x="832" y="321" text-anchor="middle">通信路</text>
  </svg>
  <figcaption class="fig-note">Security Profile は基盤仕様の高セキュリティ要件を固定し、Message Signing は選択した OAuth メッセージに署名を追加します。すべての API リクエストとレスポンスを JWS で包む仕様ではありません。</figcaption>
</figure>

FAPI は別のプロトコルではありません。OAuth 2.0 と関連仕様を高セキュリティの配備で使う方法を固定するプロファイルです。図で基盤仕様の横ではなく上に積んでいるのはそのためです。

::: tip Security Profile — 必須要件の最低ライン
FAPI 2.0 Security Profile は、confidential client、DPoP **または** mTLS による送信者制約付きアクセストークン、PAR、`S256` の PKCE、`response_type=code`、認可レスポンスの `iss` パラメータ、TLS 保護されたエンドポイントを要求します。トークンエンドポイントのクライアント認証には mTLS または `private_key_jwt` を使います。JWT アルゴリズムは `PS256`、`ES256`、`EdDSA` で、JAR や ES256 限定を要求する仕様ではありません。
:::

::: tip Message Signing — 後から否認できない証拠
Message Signing は Security Profile を継承し、PAR に送る JAR 署名付きプッシュ認可リクエストオブジェクト、JARM による署名付き認可レスポンス、RFC 9701 による署名付き introspection レスポンスという 3 つの方式を定義します。これらは個別に適合性テストできます。DPoP nonce や、すべてのリソース API リクエスト / レスポンスへの署名を要求するものではありません。本ライブラリの `profile.FAPI2MessageSigning` は PAR、JAR、JARM を自動有効化します。`feature.Introspect` も有効にして `/introspect` をマウントした場合は、そのエンドポイントの成功レスポンスを署名付きに強制します。DPoP が有効な場合、ライブラリの validator は `WithDPoPNonceSource` も要求します。これはライブラリの制約であり、Message Signing の要件ではありません。プロファイル自体が introspection エンドポイントをマウントするわけではありません。

地域の Open Banking / Open Insurance の制度が Message Signing を求める場合もあります。FAPI 仕様とは別に、対象制度の最新のセキュリティ標準を確認してください。
:::

::: details message signing は何を得る仕組みか
FAPI 2.0 の「Message Signing」は、選択した OAuth メッセージ（PAR に送る JAR 署名付きプッシュ認可リクエストオブジェクト、JARM による認可レスポンス、署名付き introspection レスポンス）に署名して非否認性を補う仕組みです。PAR 利用時のブラウザのフロントチャネル要求は `request_uri` と `client_id` だけを運び、非否認性のために別途署名する認可リクエストではありません。受信者は公開鍵で署名を検証します。Security Profile がすべての API 通信を署名する仕様という意味ではなく、Message Signing もすべてのリソース API リクエスト / レスポンスを JWS で包む仕様ではありません。
:::

::: details JWS とは何か
**JWS** は "JSON Web Signature"（RFC 7515）です。ペイロードに任意のバイト列を持てる署名付き表現です。署名付き JWT は JSON の claim をペイロードにした JWS で、JWT には暗号化された JWE もあります。FAPI が「署名付き認可リクエスト」「署名付き認可レスポンス」と言うときは、対応するプロトコルオブジェクトを署名付き JWT / JWS で運ぶことを指します。
:::

## 各略号が実際に何をしているか

::: details PAR — Pushed Authorization Request (RFC 9126)
古典的な OAuth では、RP が `/auth?...` の URL を組み立て、すべてのパラメータをクエリ文字列に乗せてブラウザにリダイレクトさせます。間に挟まる主体（ブラウザ拡張、中継プロキシ、Referer 漏洩、サーバログなど）はパラメータを見られます。

PAR では、RP がまずパラメータを OP の `/par` エンドポイントへ **サーバ間で直接 POST** します（クライアント認証付き）。OP は短寿命の `request_uri`（例: `urn:ietf:params:oauth:request_uri:abc...`）を返します。ブラウザは `/auth?request_uri=urn:...&client_id=...` にリダイレクトされ、OP は内部で元のパラメータを引き当てます。

結果: 機微なパラメータがブラウザを通らない。
:::

::: details `request_uri` とは何か
authorize パラメータをサーバ側にいったん預けた「預かり票」への参照です。PAR は URN 形式の `request_uri`（OP が約 60 秒間だけ保持する 1 回限りの行を指す）を返します。ブラウザはその URN と `client_id` だけを `/auth` に渡し、OP が内部で預かり済みのパラメータと結びつけます。`request_uri` という仕組み自体は PAR より先に存在しており、RFC 9101 では HTTPS URL 上の `request` JWT を取りに行く用途にも使われます。PAR はそれを「OP 自身が保持する」「1 回交換したら消える」用途に特化させたものです。
:::

::: details JAR — JWT-Secured Authorization Request (RFC 9101)
PAR は「パラメータが OP に機密で届く」ことを保証します。JAR は **「正規の RP から来た」ことを OP が暗号学的に検証できる** ようにします — パラメータは RP の秘密鍵で署名された JWT として渡され、OP は登録済みの公開鍵で署名を検証します。

PAR + JAR の組み合わせで、authorize 要求の **サーバ間配送** と **発信元の暗号学的な確認** の両方が手に入ります。
:::

::: details JARM — JWT-Secured Authorization Response Mode
JARM は認可 **レスポンス**（`code`、`state`、`iss`、エラーなど）を OP が署名付き JWT として返す方式です。RP は処理前に署名と claim を検証します。FAPI 2.0 Message Signing では、署名付き認可レスポンス方式を実装する場合に JARM を使います。本ライブラリの `profile.FAPI2MessageSigning` は JARM を必須にします。
:::

::: details DPoP / mTLS — 送信者制約
発行されたアクセストークンを、正規クライアントが保有する鍵に結びつけます。トークンが漏れても鍵がなければ使えません。仕組みは [送信者制約](/ja/concepts/sender-constraint) を参照。
:::

::: details FAPI の JWT アルゴリズム — なぜ RS256 ではないのか
FAPI 2.0 Security Profile は JWT の処理に `PS256`、`ES256`、`EdDSA`（Ed25519）を要求し、`none` を禁じています。そのため `RS256` はプロファイルの許可リストに含まれません。`go-oidc-provider` は OP 発行 JWT を ES256 で署名する、より狭い実装方針を採用し、クライアントが署名するオブジェクトでは `PS256`、`ES256`、`EdDSA` を受け付けます。Final Security Profile が ES256 だけを要求しているわけではありません。
:::

::: details アルゴリズム許可リスト — なぜ「交渉」ではなく「固定」なのか
FAPI 2.0 Security Profile は JWT のアルゴリズムを `PS256`、`ES256`、`EdDSA` に固定し、`none` を禁じています。Discovery 文書で受け付けるアルゴリズムを広告できても、**サーバ側は許可リスト外を受理してはいけません**。本ライブラリも各 JOSE 処理で独自の許可リストを適用します。OP 発行 JWT を ES256 に限定するのはライブラリの実装方針です。
:::

::: details `private_key_jwt` — FAPI クライアント認証
Confidential クライアントは token endpoint に対して自身の身元を証明する必要があります。FAPI 2.0 Security Profile が許可する方式は mTLS と `private_key_jwt` です。mTLS には RFC 8705 §2.1.1 の `tls_client_auth` と §2.2 の `self_signed_tls_client_auth` があります。

| 方式 | 出典 | 提示するもの | OP 側の検証 |
|---|---|---|---|
| **`private_key_jwt`** | OIDC Core §9 | 登録済みの秘密鍵で署名した短い JWT（`iss`、`sub` = 自分の `client_id`、`aud` = Final FAPI プロファイルでは認可サーバの issuer 識別子を文字列で指定、`exp`、`jti`）を `client_assertion` として `/token` 要求に乗せる | 登録済み JWKS で署名検証 |
| **`tls_client_auth`** | RFC 8705 §2.1.1 | TLS ハンドシェイクで提示する X.509 証明書 | 構成済みのトラストアンカーに対してチェーン検証し、登録済みの subject DN / SAN と突き合わせ |
| **`self_signed_tls_client_auth`** | RFC 8705 §2.2 | 自己署名の X.509 証明書 | CA チェーンは辿らず、証明書の公開鍵を登録済み JWKS と突き合わせ |

いずれも `client_secret_basic` の落とし穴（長寿命の共有秘密が一度漏れると、交換するまで侵害され続ける）を回避します。

実装メモ: 本ライブラリの FAPI プロファイルでは、token endpoint のクライアント認証経路として `private_key_jwt` を使います。mTLS verifier は内部にあり、mTLS によるトークンの結びつけは接続済みですが、`tls_client_auth` / `self_signed_tls_client_auth` は token endpoint の認証方式として振り分けされません。これはライブラリの制限であり、Final Security Profile の制限ではありません。

Final Security Profile は `aud` を issuer 識別子の文字列に限定します。本ライブラリの verifier は相互運用性のため token endpoint URL と JSON 配列形式も受理するため、これらを使う配備は追加の強制層なしに Final Security Profile への適合を主張できません。
:::

## FAPI 2.0 と RFC の対応表

FAPI は **プロファイル** であり、OAuth や OIDC を作り直しているわけではありません。既存仕様の使い方を高セキュリティ向けに絞り込みます。下表では、Final Security Profile、個別に適合性テストできる Message Signing の方式、ライブラリ固有の設定を分けています。

| Spec / RFC | FAPI 2.0 Security Profile | FAPI 2.0 Message Signing | FAPI-CIBA |
|---|---|---|---|
| **OAuth 2.0 (RFC 6749)** | 必須 | 継承 | プロファイル依存 |
| **OIDC Core 1.0** | 認証済み利用者の識別子を返す場合に必要 | 継承 | プロファイル依存 |
| **PKCE — `S256` のみ（RFC 7636）** | 認可コードで必須 | 継承 | 対象外（CIBA はフロントチャネルなし）|
| **PAR (RFC 9126)** | 必須 | 継承 | 対象外（CIBA は `/bc-authorize` に POST）|
| **JAR (RFC 9101)** — 署名付き request object | 任意 | 署名付き認可リクエスト方式 | プロファイル依存 |
| **JARM** — 署名付き認可レスポンス | 任意 | 署名付き認可レスポンス方式 | 対象外（CIBA はフロントチャネルなし）|
| **署名付き introspection レスポンス（RFC 9701）** | 任意 | 署名付き introspection レスポンス方式 | プロファイル依存 |
| **DPoP (RFC 9449) または mTLS (RFC 8705)** | いずれか必須 | 継承 | プロファイル依存 |
| **Resource Indicators (RFC 8707)** | 任意 | 継承 | プロファイル依存 |
| **認可レスポンスの `iss` パラメータ（RFC 9207）** | 必須 | 継承 | 対象外（CIBA はフロントチャネルなし）|
| **OAuth 2.0 Security BCP (RFC 9700)** | プロファイルに従う | 継承 | プロファイル依存 |
| **Token endpoint クライアント認証** | mTLS または `private_key_jwt` | 継承 | プロファイル依存 |
| **`client_secret_basic` / `_post` / `_jwt`** | 不可 | 継承 | プロファイル依存 |
| **JWT 署名 alg** | `PS256`、`ES256`、`EdDSA`。`none` は禁止 | 継承 | プロファイル依存 |
| **PAR 内の `redirect_uri`** | 必須 | 継承 | 対象外（リダイレクトなし）|
| **リフレッシュトークンのローテーション** | 例外的な状況を除き禁止 | 継承 | プロファイル依存 |
| **送信者制約付きアクセストークン** | 必須 | 継承 | プロファイル依存 |
| **ライブラリでの有効化オプション** | `op.WithProfile(profile.FAPI2Baseline)` | `op.WithProfile(profile.FAPI2MessageSigning)` | `op.WithProfile(profile.FAPICIBA)` |

いくつかの行について補足します。

**なぜ DPoP か mTLS のどちらかで十分なのか。** どちらも、発行されたアクセストークンを正規クライアントが保有する鍵に結びつける仕組みです。トークンが漏れても鍵がなければ使えません。選択は運用上の判断であり、既存 PKI / プロキシ構成に合う方式を選びます。仕組みの詳細は [送信者制約](/ja/concepts/sender-constraint) を参照してください。Final Security Profile はいずれか 1 つを要求します。本ライブラリでは、どちらも明示しない場合に DPoP を既定として選びます。

**なぜ JAR と JARM は別の方式なのか。** Message Signing は、署名付き認可リクエスト、署名付き認可レスポンス、署名付き introspection レスポンスを別々の方式として定義します。配備に必要な方式だけを選べます。`profile.FAPI2MessageSigning` はライブラリ設定として PAR、JAR、JARM を自動有効化します。別途 `feature.Introspect` を有効にして `/introspect` をマウントした場合は、成功レスポンスを署名付き RFC 9701 形式に強制します。DPoP が有効な場合、ライブラリのプロファイルは DPoP nonce source も要求しますが、Final Message Signing 仕様の要件ではありません。

**本ライブラリと Final Security Profile の違い。** `profile.FAPI2Baseline` はライブラリ設定として PAR と JAR を自動有効化し、token endpoint のクライアント認証を `private_key_jwt` に限定し、OP 発行 JWT を ES256 に限定し、`redirect_uri` の完全一致を強制します。これらは Final Security Profile の追加要件ではありません。本ライブラリの通常のリフレッシュ処理はリフレッシュトークンをローテーションしますが、Final Security Profile は通常のローテーションを禁止し、例外的な状況だけを許可します。適合性を主張する前に、実行時の設定を確認してください。

### 続きはこちら

- [RFC 対応一覧](/ja/compliance/rfc-matrix) — FAPI に限定しない、ライブラリ全体の RFC 別実装状況。
- [ユースケース: FAPI 2.0 Security Profile](/ja/use-cases/fapi2-baseline) — `private_key_jwt` クライアントと DPoP を組み合わせた構成例。
- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — バインディングの仕組みを詳しく。
- [CIBA](/ja/concepts/ciba) — FAPI-CIBA が制約しているバックチャネル処理。

## `go-oidc-provider` での 1 行有効化

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/profile"
)

op.New(
  /* 必須オプション */
  op.WithProfile(profile.FAPI2Baseline),
)
```

`WithProfile` は次をまとめて行います:

1. ライブラリ設定として `feature.PAR` / `feature.JAR` を自動有効化します。JAR は Final Security Profile では任意です。
2. `token_endpoint_auth_methods_supported` をライブラリの FAPI 許可リストに絞り込みます。token endpoint のクライアント認証経路には `private_key_jwt` を使い、mTLS は送信者制約付きアクセストークンに使います。
3. 送信者制約 feature として、明示された `feature.MTLS` を尊重し、未指定なら `feature.DPoP` を既定として選びます。
4. OP 発行 ID トークンを `ES256` にロックし、P-256 でない OP 署名鍵を拒否します。これはライブラリの方針であり、Final Security Profile は `PS256`、`ES256`、`EdDSA` を許可します。
5. `redirect_uri` の完全一致をライブラリの方針として強制します。

本ライブラリのリフレッシュ処理は通常の利用でもリフレッシュトークンをローテーションします。Final Security Profile は通常のローテーションを禁止するため、この設定だけでは Final への適合を示せません。

プロファイルと矛盾するオプションを後から重ねると、`op.New` は OP を生成する前に検出した矛盾を理由に起動を拒否します。主な制約を、対象ごとにまとめます。

| 設定 | FAPI 2.0 / FAPI-CIBA プロファイル下での扱い |
|---|---|
| token endpoint のクライアント認証 | `private_key_jwt` のみ。動的登録でそれ以外の `token_endpoint_auth_method` を指定すると `invalid_client_metadata` で拒否される |
| クライアントが署名する入力（assertion、request object）のアルゴリズム | `PS256`、`ES256`、`EdDSA`。`RS256` は実行時、discovery、登録のいずれでも拒否される |
| `op.WithAccessTokenTTL` | 10 分以内 |
| `op.WithPARLifetime` | 600 秒未満 |
| `/par` と `/bc-authorize` の request object、および FAPI プロファイル下の `/auth` | 署名なしの query / form パラメータとマージされず、置き換える。認可パラメータはすべて署名済みオブジェクトの中に入れる必要がある |
| アクセストークンの失効戦略 | `RevocationStrategyNone` は拒否される |
| `op.WithFirstPartyClients`、`op.WithOpenIDScopeOptional` | FAPI 2.0 プロファイル下では拒否される |
| DPoP nonce source | `FAPI2MessageSigning` と `FAPICIBA` で DPoP を使う場合は `op.WithDPoPNonceSource` が必須 |
| `profile.FAPICIBA` | `grant.CIBA` を有効にしておく必要がある（自動では有効化されない）。CIBA の既定・最大有効期間は 10 分以内 |
| レスポンス | すべてのレスポンスに `x-fapi-interaction-id` が付く。リクエストに値があればそれを、なければ生成した値を返す |

ライブラリの Message Signing プロファイルを選ぶ場合は、`profile.FAPI2Baseline` を `profile.FAPI2MessageSigning` に差し替えます。DPoP を使う場合は `WithDPoPNonceSource` も構成してください。適合性テストは両プランを検査します（[OFCS 適合状況](/ja/compliance/ofcs)）。

## 続きはこちら

- [送信者制約（DPoP / mTLS）](/ja/concepts/sender-constraint) — バインディングの仕組みを詳しく。
- [ユースケース: FAPI 2.0 Security Profile](/ja/use-cases/fapi2-baseline) — `private_key_jwt` クライアントと DPoP を組み合わせた構成例。
- [認可コード + PKCE](/ja/concepts/authorization-code-pkce) — FAPI 2.0 が前提にしている処理。
