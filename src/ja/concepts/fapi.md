---
title: FAPI 2.0 入門
description: FAPI とは何か、なぜ存在するか、各要件が何を防いでいるか — はじめての方向け。
---

# FAPI 2.0 入門

**FAPI**（Financial-grade API）は OpenID Foundation が策定する OAuth 2.0 + OIDC のセキュリティプロファイル群です。基盤となる仕様が許している任意性のうち、本番環境で攻撃に使われてきたものを **取り除いた** 内容になっています。

もともとは Open Banking 向け — 英国・豪州・ブラジルの規制当局が銀行とフィンテック間の OAuth に FAPI 相当を要求しています。最近は医療、政府デジタル ID など、「RFC に従っています」だけでは監査が通らない領域にも採用が広がっています。

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
| アルゴリズムリスト | metadata でネゴ | 固定 allow-list |

`go-oidc-provider` は FAPI 2.0 を対象にしており、FAPI 1.0 は対象外です。

## Baseline と Message Signing

FAPI 2.0 は 2 段構成です。

::: tip Baseline — 必須要件の最低ライン
Pushed Authorization Requests（PAR）、PKCE、DPoP **または** mTLS、ES256 / PS256 署名、`redirect_uri` の完全一致、`private_key_jwt` / mTLS でのクライアント認証。**いずれの FAPI 2.0 deployment にも求められる最低水準** です。
:::

::: tip Message Signing — 非否認性
Baseline に加えて: **JAR**（authorize 要求自体を署名 JWT にする）、**JARM**（authorize 応答も署名する）、**DPoP nonce** 必須、RS 側の応答署名。すべての要求・応答が暗号学的に発信元へ紐づくため、**非否認性**（nonrepudiation）が確保されます。

UK Open Banking と Brazil Open Insurance は Message Signing を必須化しています。
:::

## 各略号が実際に何をしているか

::: details PAR — Pushed Authorization Request (RFC 9126)
古典的な OAuth フローでは、RP が `/authorize?...` の URL を組み立て、すべてのパラメータをクエリ文字列に乗せてブラウザにリダイレクトさせます。間に挟まる主体（ブラウザ拡張、中継 proxy、Referer 漏洩、サーバログなど）はパラメータを見られます。

PAR は、RP がまずパラメータを OP の `/par` エンドポイントに **server-to-server で直接 POST**（クライアント認証付き）します。OP は短寿命の `request_uri`（例: `urn:ietf:params:oauth:request_uri:abc...`）を返します。ブラウザは `/authorize?request_uri=urn:...&client_id=...` にリダイレクトされ、OP は内部で元のパラメータを引き当てます。

結果: 機微なパラメータがブラウザを通らない。
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
発行された access token を、正規クライアントが保有する鍵にバインドします。トークンが漏れても鍵がなければ使えません。仕組みは [送信者制約](/ja/concepts/sender-constraint) を参照。
:::

::: details ES256 / PS256 — なぜ RS256 ではないのか
RS256（RSA-SHA256、PKCS#1 v1.5 パディング）は padding-oracle 攻撃や鍵混同攻撃に対して構造的に脆弱です。OIDC Core では今も許容されていますが、FAPI 2.0 では禁じられています。PS256（RSA-PSS）と ES256（P-256 上の ECDSA）が安全な代替です。`go-oidc-provider` は FAPI プロファイル下で ES256 / EdDSA / PS256 を受理し、RS256 はサーフェスから外します。
:::

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

1. `feature.PAR` / `feature.JAR` / `feature.DPoP` を自動有効化。
2. `token_endpoint_auth_methods_supported` を FAPI allow-list（`private_key_jwt`、`tls_client_auth`、`self_signed_tls_client_auth`）と交差。
3. ID Token 署名 alg を `ES256` / `PS256` にロック、`RS256` での新規発行を拒否。
4. `redirect_uri` の完全一致を強制。

プロファイルと矛盾するオプションを後から重ねると `op.New` が起動を拒否します — partial-FAPI な構成がレビューを抜けて本番に出ることはありません。

Message Signing にしたい場合は `profile.FAPI2Baseline` を `profile.FAPI2MessageSigning` に差し替えるだけ。Conformance suite は両プランを検査します（[OFCS 適合状況](/ja/compliance/ofcs)）。

## 続きはこちら

- [送信者制約 (DPoP / mTLS)](/ja/concepts/sender-constraint) — バインディングの仕組みを詳しく。
- [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — `private_key_jwt` クライアントと DPoP を組み合わせた完全な構成例。
- [認可コード + PKCE](/ja/concepts/authorization-code-pkce) — FAPI 2.0 が乗っているフロー。
