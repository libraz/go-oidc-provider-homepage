---
title: FAPI 2.0 入門
description: FAPI とは何か、なぜ存在するか、各要件が何を防いでいるか — はじめての方向け。
---

# FAPI 2.0 入門

**FAPI**（Financial-grade API）は OpenID Foundation が策定する OAuth 2.0 + OIDC のセキュリティプロファイル群です。基盤となる仕様が許している任意性のうち、本番環境で攻撃に使われてきたものを **取り除いた** 内容になっています。

もともとは Open Banking 向け — 英国・豪州・ブラジルの規制当局が銀行とフィンテック間の OAuth に FAPI 相当を要求しています。最近は医療、政府デジタル ID など、「RFC に従っています」だけでは監査が通らない領域にも採用が広がっています。

::: details Open Banking とは何か
「Open Banking」は、利用者がサードパーティアプリに対して、銀行のパスワードを渡すのではなく **代理で口座データを読む / 支払を起票する権限を委任** できる規制枠組みです。代表例は英国の PSD2 由来 Open Banking（2018）、ブラジルの Open Finance（2020）、豪州の Consumer Data Right（2020）で、いずれも技術契約として FAPI を採用しています。規制対象でなければ FAPI を「準拠のため」に必要とすることはありませんが、CVE 級の脆弱性を抱えたくない場面では、同じプロファイルを既定の出発点に据える価値があります。
:::

::: details このページで触れる仕様
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — Final
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html)
- [FAPI 2.0 Attacker Model](https://openid.net/specs/fapi-2_0-attacker-model.html)
- [RFC 9126](https://datatracker.ietf.org/doc/html/rfc9126) — Pushed Authorization Requests (PAR)
- [RFC 9101](https://datatracker.ietf.org/doc/html/rfc9101) — JWT-Secured Authorization Request (JAR)
- [JARM](https://openid.net/specs/oauth-v2-jarm.html) — JWT-Secured Authorization Response Mode
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication
- [RFC 7518](https://datatracker.ietf.org/doc/html/rfc7518) — JOSE algorithms
:::

## なぜ「OIDC + ベストプラクティス」ではなくプロファイルなのか

OIDC と OAuth 2.0 では多くの選択肢が任意のままです:

- authorize 要求はクエリ文字列のまま流せる
- `redirect_uri` は部分一致でもよい
- 署名アルゴリズムに `RS256`、`none`、`HS256` を含められる
- クライアント認証に `client_secret_basic`（長寿命の共有秘密）を使える

これらの「任意性」はそれぞれ過去に CVE 級の脆弱性を生み出してきました。

**プロファイル** は「この deployment では選択肢を固定する」という契約です。FAPI 2.0 は安全な部分集合を選び、それ以外を禁じます。これにより適合確認が「議論」ではなく「チェックリスト」になります。

## FAPI 1.0 と FAPI 2.0

FAPI 1.0（"Read-Only" / "Read-Write" の 2 バンド）への参照を見かけることもあります。FAPI 2.0 はその後継 — シンプルで、形式検証された脅威モデルを持ち、認証取得もしやすくなっています:

| | FAPI 1.0（依然現役） | FAPI 2.0 |
|---|---|---|
| バンド | Read-Only / Read-Write | Baseline / Message Signing |
| authorize 要求の経路 | 任意の `request` JWT | **PAR 必須** |
| 送信者制約 | mTLS または holder-of-key | **DPoP または mTLS 必須** |
| `response_type` | `code id_token`（hybrid）も許可 | `code` のみ |
| アルゴリズムリスト | クライアントメタデータでネゴシエート | 固定の許可リスト |

::: details FAPI 1.0 の Read-Only と Read-Write の違い
FAPI 1.0 にはバンドが 2 つありました。**Read-Only** はデータ取得だけを行うユースケース向け（残高参照アプリなど）、**Read-Write** は状態変更を伴うユースケース向け（決済を起票するアプリなど）で、要求署名・応答署名・holder-of-key などの追加要件がありました。FAPI 2.0 はこの分割を廃止しています — サードパーティが介在する時点で脅威モデルが同じであることが分かったためです。代わりに **Baseline と Message Signing** で選び分け、後者はセキュリティ境界を増やすのではなく **非否認性** を加える、という整理になりました。
:::

`go-oidc-provider` は FAPI 2.0 を対象にしており、FAPI 1.0 は対象外です。

## Baseline と Message Signing

FAPI 2.0 は 2 段構成です。

::: tip Baseline — 必須要件の最低ライン
Pushed Authorization Requests（PAR）、PKCE、DPoP **または** mTLS、OP 発行物の ES256 署名、FAPI-safe なクライアント側署名アルゴリズム、`redirect_uri` の完全一致、`private_key_jwt` / mTLS でのクライアント認証。**いずれの FAPI 2.0 deployment にも求められる最低水準** です。
:::

::: tip Message Signing — 非否認性
Baseline に加えて: **JAR**（authorize 要求自体を署名 JWT にする）、**JARM**（authorize 応答も署名する）、**DPoP nonce** 必須、RS 側の応答署名。すべての要求・応答が暗号学的に発信元へ紐づくため、**非否認性**（nonrepudiation）が確保されます。

UK Open Banking と Brazil Open Insurance は Message Signing を必須化しています。
:::

::: details message signing は何を得る仕組みか
「message signing」とは、業務上の各メッセージ（authorize 要求、authorize 応答、API 要求と応答）を、送信者が JWS でラップしてから送ることです。受信者は送信者が公開した鍵で署名検証します。これにより **非否認性** が成立し、後日になっても「そんなものは送っていない」と言い逃れる余地がなくなります — 署名そのものが署名者を名指しているからです。Baseline は **通信路** の安全性を担保し、Message Signing はそこに **監査証跡** の層を上乗せします。資金が動く / 取り消し不能な操作を伴う取引では、Message Signing が欲しくなります。
:::

::: details JWS とは何か
**JWS** は "JSON Web Signature"（RFC 7515）。JWT の土台となる「署名付きデータ塊」の構造です。JWT は payload が標準 claim の JSON object になっている JWS、と捉えるのが正確です。FAPI が「署名付き authorize 要求」「署名付き応答」と言うときは、payload が要求 / 応答オブジェクトの JWS のことを指します。署名アルゴリズム（`ES256`、`PS256`）も JWS 層の概念です。
:::

## 各略号が実際に何をしているか

::: details PAR — Pushed Authorization Request (RFC 9126)
古典的な OAuth フローでは、RP が `/authorize?...` の URL を組み立て、すべてのパラメータをクエリ文字列に乗せてブラウザにリダイレクトさせます。間に挟まる主体（ブラウザ拡張、中継 proxy、Referer 漏洩、サーバログなど）はパラメータを見られます。

PAR は、RP がまずパラメータを OP の `/par` エンドポイントに **server-to-server で直接 POST**（クライアント認証付き）します。OP は短寿命の `request_uri`（例: `urn:ietf:params:oauth:request_uri:abc...`）を返します。ブラウザは `/authorize?request_uri=urn:...&client_id=...` にリダイレクトされ、OP は内部で元のパラメータを引き当てます。

結果: 機微なパラメータがブラウザを通らない。
:::

::: details `request_uri` とは何か
authorize パラメータをサーバ側にいったん預けた「預かり票」への参照です。PAR は URN 形式の `request_uri`（OP が約 60 秒間だけ保持する 1 回限りの行を指す）を返します。ブラウザはその URN と `client_id` だけを `/authorize` に渡し、OP が内部で預かり済みのパラメータと結びつけます。`request_uri` という仕組み自体は PAR より先に存在しており（RFC 9101 では HTTPS URL に置いた inline `request` JWT を取りに行くのにも使われます）、PAR はそれを「OP 自身がホストする」「1 回交換したら消える」用途に特化させたものです。
:::

::: details JAR — JWT-Secured Authorization Request (RFC 9101)
PAR は「パラメータが OP に機密で届く」ことを保証します。JAR は **「正規の RP から来た」ことを OP が暗号学的に検証できる** ようにします — パラメータは RP の秘密鍵で署名された JWT として渡され、OP は登録済みの公開鍵で署名を検証します。

PAR + JAR の組み合わせで、authorize 要求の **server-to-server 配送** と **発信元の暗号学的認証** の両方が手に入ります。
:::

::: details JARM — JWT-Secured Authorization Response Mode
JAR の応答版です。OP は authorize **応答**（`code`、`state`、`iss` など）を JWT に署名して返し、RP が署名を検証します。これにより「OP が確かにこの code を私に発行した」という非否認性が得られます。

FAPI 2.0 Message Signing で必須。
:::

::: details DPoP / mTLS — 送信者制約
発行されたアクセストークンを、正規クライアントが保有する鍵にバインドします。トークンが漏れても鍵がなければ使えません。仕組みは [送信者制約](/ja/concepts/sender-constraint) を参照。
:::

::: details ES256 / PS256 — なぜ RS256 ではないのか
RS256（RSA-SHA256、PKCS#1 v1.5 パディング）は padding-oracle 攻撃や鍵混同攻撃に対して構造的に脆弱です。OIDC Core では今も許容されていますが、FAPI 2.0 では禁じられています。PS256（RSA-PSS）と ES256（P-256 上の ECDSA）が安全な代替です。`go-oidc-provider` は OP 発行 JWT を ES256 のみで署名し、FAPI 下のクライアント署名オブジェクトでは絞り込まれた allow-list（`PS256`、`ES256`、`EdDSA`）を使います。RS256 は FAPI のサーフェスから外れます。
:::

::: details アルゴリズム allow-list — なぜ「ネゴ」ではなく「リスト」なのか
古典的な OAuth では「クライアントと OP が対応アルゴリズムを互いに広告して交渉で 1 つに決める」やり方が一般的でした。問題は、片方が弱いアルゴリズム（`none`、`HS256`、PKCS#1 v1.5 の RS256）を広告した時点で、偽造トークンを通してしまう経路ができてしまう点です。FAPI は集合をあらかじめ固定します。OP の discovery document には対応アルゴリズムが載りますが（クライアントが選ぶための情報源として）、**サーバ側はリスト外を受理しません**。ヘッダに何が書かれていようと無関係です。本ライブラリも、各 alg ノブを「allow-list を広告し、サーバ側で強制」のパターンで扱います。
:::

::: details `private_key_jwt` / `tls_client_auth` / `self_signed_tls_client_auth` — クライアント認証の 3 方式
Confidential クライアントは token endpoint に対して自身の身元を証明する必要があります。FAPI 2.0 は非対称鍵を使う 3 方式に絞っています。

| 方式 | 出典 | 提示するもの | OP 側の検証 |
|---|---|---|---|
| **`private_key_jwt`** | OIDC Core §9 | 登録済みの秘密鍵で署名した短い JWT(`iss`、`sub` = 自分の `client_id`、`aud` = token endpoint、`exp`、`jti`)を `client_assertion` として `/token` 要求に乗せる | 登録済み JWKS で署名検証 |
| **`tls_client_auth`** | RFC 8705 §2.1.1 | TLS ハンドシェイクで提示する X.509 証明書 | 構成済みのトラストアンカーに対してチェーン検証し、登録済みの subject DN / SAN と突き合わせ |
| **`self_signed_tls_client_auth`** | RFC 8705 §2.2 | 自己署名の X.509 証明書 | CA チェーンは辿らず、証明書の公開鍵を登録済み JWKS と突き合わせ |

いずれも `client_secret_basic` の落とし穴(長寿命の共有秘密が一度漏れると、気付かれないまま破綻が続く)を回避します。既存の身元基盤に合うものを選んでください — FAPI プロファイルはどれも受理します。
:::

## FAPI 2.0 と RFC の対応表

FAPI は **プロファイル** であり、OAuth や OIDC を作り直しているわけではありません。既存の RFC のうち「実装すべきもの」「捨ててよいオプション」「禁じる選択肢」を絞り込むのが役目です。下表は FAPI 2.0 の各バンドが要求 / 任意 / 禁止としている RFC の一覧で、「FAPI が `X` を要求しているのは分かったが、`X` 自体は何の仕様か」という疑問に行単位で答えます。

| Spec / RFC | FAPI 2.0 Baseline | FAPI 2.0 Message Signing | FAPI-CIBA |
|---|---|---|---|
| **OAuth 2.0 (RFC 6749)** | 必須 | 必須 | 必須 |
| **OIDC Core 1.0** | 必須 | 必須 | 必須 |
| **PKCE — `S256` のみ (RFC 7636)** | 必須 | 必須 | 対象外（CIBA はフロントチャネルなし）|
| **PAR (RFC 9126)** | 必須 | 必須 | 対象外（CIBA は `/bc-authorize` に POST）|
| **JAR (RFC 9101)** — 署名付き request object | 必須（`PS256`、`ES256`、`EdDSA`）| 必須（`PS256`、`ES256`、`EdDSA`）| 必須 |
| **JARM** — 署名付き authorize 応答 | 任意 | 必須 | 対象外（CIBA はフロントチャネルなし）|
| **DPoP (RFC 9449) または mTLS (RFC 8705)** | いずれか必須 | いずれか必須 | いずれか必須 |
| **Resource Indicators (RFC 8707)** | 任意 | 任意 | 任意 |
| **authorize 応答の `iss` パラメータ (RFC 9207)** | 必須 | 必須 | 対象外（CIBA はフロントチャネルなし）|
| **OAuth 2.0 Security BCP (RFC 9700)** | 必須 | 必須 | 必須 |
| **Token endpoint クライアント認証** | `private_key_jwt` / `tls_client_auth` / `self_signed_tls_client_auth` | 同左 | 同左 |
| **`client_secret_basic` / `_post` / `_jwt`** | 禁止 | 禁止 | 禁止 |
| **ID トークン署名 alg** | `ES256` | 同左 | 同左 |
| **`alg=none`** | 禁止 | 禁止 | 禁止 |
| **`RS256`（旧来の RSA-PKCS1v15）**| 禁止 | 禁止 | 禁止 |
| **`HS256` などの HMAC 系 alg** | 禁止 | 禁止 | 禁止 |
| **`redirect_uri` 完全一致** | 必須 | 必須 | 対象外（リダイレクトなし）|
| **リフレッシュトークンのローテーション + 再利用検出 (RFC 9700 §4.14)** | 必須 | 必須 | 必須 |
| **送信者制約付きアクセストークン (RFC 7800 `cnf`)** | 必須 | 必須 | 必須 |
| **サーバ側でのアクセストークン失効 (FAPI 2.0 SP §5.3.2.2)** | 必須 | 必須 | 必須 |
| **ライブラリでの有効化オプション** | `op.WithProfile(profile.FAPI2Baseline)` | `op.WithProfile(profile.FAPI2MessageSigning)` | `op.WithProfile(profile.FAPICIBA)` |

いくつかの行については本文で補足しておきます。

**なぜ DPoP **か** mTLS のどちらか、で十分なのか。** いずれも発行されたアクセストークンを、正規クライアントが保有する鍵にバインドする仕組みで、トークンが漏れても鍵がなければ使えません。選択は安全性ではなく運用上の都合で決まります — 既存 PKI / proxy 構成にどちらが馴染むかで選んでください。仕組みの詳細は [送信者制約](/ja/concepts/sender-constraint) を参照。FAPI プロファイルは「どちらか 1 つが有効であること」を要求します。どちらも明示されていない場合、`op.New` は mTLS 終端の前提が不要な DPoP を既定メンバーとして選びます。`feature.MTLS` を明示した場合は、その選択が尊重され DPoP 既定は追加されません。

**なぜ JARM は Message Signing で必須、Baseline では任意なのか。** Message Signing の主目的は「**応答** の署名」であり、要求の署名だけではありません。完全な非否認性（nonrepudiation）を提供するのがこのバンドの役割で、authorize 応答はその契約の半分を占めています。Baseline は PAR で通信路の安全性を担保すれば足り、応答署名は 2 つ目のバンドで追加される、という整理になります。

**本ライブラリにおける「禁止」の意味。** プロファイルゲートはリクエスト時ではなく `op.New` の段階で発火します — Baseline プロファイルの OP は `client_secret_basic` クライアントを登録できず、ID トークン署名 alg として `ES256` 以外を広告できず、構成が受理される前に 1 つもトークンを発行しません。alg 禁止を支える closed enum 設計は設計判断 [#11](/ja/security/design-judgments#dj-11) に、DPoP / mTLS の disjunction を全ハンドラに対して一様に解決する `*config` ヘルパー方式は [#7](/ja/security/design-judgments#dj-7) に記録されています。

### 続きはこちら

- [RFC 対応一覧](/ja/compliance/rfc-matrix) — FAPI に限定しない、ライブラリ全体の RFC 別実装状況。
- [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — `private_key_jwt` クライアントと DPoP を組み合わせた完全な構成例。
- [送信者制約 (DPoP / mTLS)](/ja/concepts/sender-constraint) — バインディングの仕組みを詳しく。
- [CIBA](/ja/concepts/ciba) — FAPI-CIBA が制約しているバックチャネルフロー。

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

1. `feature.PAR` / `feature.JAR` を自動有効化。
2. `token_endpoint_auth_methods_supported` を FAPI allow-list（`private_key_jwt`、`tls_client_auth`、`self_signed_tls_client_auth`）と交差。
3. 送信者制約 feature として、明示された `feature.MTLS` を尊重し、未指定なら `feature.DPoP` を既定として選ぶ。
4. OP 発行 ID トークンを `ES256` にロックし、P-256 でない OP 署名鍵を拒否。
5. `redirect_uri` の完全一致を強制。

プロファイルと矛盾するオプションを後から重ねると `op.New` が起動を拒否します — partial-FAPI な構成がレビューを抜けて本番に出ることはありません。

Message Signing にしたい場合は `profile.FAPI2Baseline` を `profile.FAPI2MessageSigning` に差し替えるだけ。Conformance suite は両プランを検査します（[OFCS 適合状況](/ja/compliance/ofcs)）。

## 続きはこちら

- [送信者制約 (DPoP / mTLS)](/ja/concepts/sender-constraint) — バインディングの仕組みを詳しく。
- [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — `private_key_jwt` クライアントと DPoP を組み合わせた完全な構成例。
- [認可コード + PKCE](/ja/concepts/authorization-code-pkce) — FAPI 2.0 が乗っているフロー。
