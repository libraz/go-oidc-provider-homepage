---
title: クライアント種別
description: public / confidential / FAPI grade のクライアント分類、本ライブラリが実装する認証メソッド、登録の方法。
---

# クライアント種別

**クライアント** とは、OP にトークンを要求するアプリケーションのことです。クライアントは構造的に **public**（シークレットを保持できない）と **confidential**（保持できる）の 2 つに分かれ、FAPI 2.0 デプロイは confidential のさらに上に高水準の要件を積みます。どのバケットに属するかが token endpoint での認証メソッドを決め、その選択はリフレッシュトークンのポリシー、sender constraint の必須化、consent prompt をスキップできるかどうかに連鎖していきます。

::: tip 30 秒で頭に入れる相関図
- **public client** — SPA、ネイティブアプリ、モバイルアプリ。コードがユーザの手に届くのでシークレットは保持できません。`none` + PKCE を使います。
- **confidential client** — バックエンドサービス、機械間呼び出し。シークレットや秘密鍵を保持できます。`client_secret_*` または `private_key_jwt` を使います。
- **FAPI grade client** — sender-constrained token（DPoP / mTLS）、PAR、非対称鍵認証で強化された confidential client。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §2.1（クライアント種別）、§2.3（クライアント認証）
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) / [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — Assertion ベースのクライアント認証
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §9（クライアント認証）
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — §3.1.3（推奨される auth method）
:::

## Public client

public client とは、ユーザが制御するデバイス上でコードが動くアプリケーションのことです — SPA、モバイルアプリ、ネイティブデスクトップアプリ、CLI など。本質的な特徴は **バイナリやページに同梱されたものは攻撃者の手にも渡る** という点です。長寿命のシークレットを隠しておく場所はありません。

本ライブラリは `TokenEndpointAuthMethod` が `"none"` のクライアントを public として扱います。シークレットの不在を補う構造的な保護は次のとおりです。

- **PKCE が必須**。OP は `S256` のみを受理し、`plain` はプロファイルに関係なく拒否します（[設計判断 #14](/ja/security/design-judgments#dj-14)）。`code_verifier` は「フローを開始したクライアントと終わらせるクライアントが同じである」ことを示すリクエストごとのシークレット — これがなければ、redirect で奪われた認可コードだけでトークンが発行されてしまいます。
- **リフレッシュトークンはローテーションされ、DPoP に bind される**。リフレッシュ交換が成功するたびに前のリフレッシュトークンは無効化され、次のトークンはクライアントが提示した DPoP 鍵に bind されます。public client で漏洩した refresh は、対応する鍵がなければ再利用できません。すでにローテーション済みのトークンが再提示された場合は chain 全体が失効します。詳細は[設計判断 #15](/ja/security/design-judgments#dj-15)。
- **loopback redirect が許容される**。RFC 8252 §7.3 により、CLI は OS が割り当てる ephemeral port を `127.0.0.1` / `[::1]` 上で利用できます。詳細は[Redirect URI](/ja/concepts/redirect-uri)。

public client も ID トークン・リフレッシュトークンの受領、`/userinfo` の呼び出しが可能です — フル機能の RP として扱われ、ただ厳しい環境で動いているだけです。

## Confidential client

confidential client とは、ユーザの手の届かないストレージにシークレットや秘密鍵を保管できるバックエンドサービスのことです — サーバ側の環境変数、シークレットマネージャ、HSM など。本質的な特徴は **クレデンシャルが攻撃者からは簡単には読めない場所にある** ことです。`TokenEndpointAuthMethod` には `"none"` 以外を登録します。

confidential client が得られるもの:

- **token endpoint での認証**。すべての `POST /token` でクレデンシャルを送り、OP は何かを発行する前にそれを検証します。検証メソッドは下表のいずれかです。
- **緩めのリフレッシュトークンポリシー**。他のクライアントと同様にローテーションされますが、chain 自体はデフォルトで DPoP bind されません — 各リフレッシュで発行されるアクセストークンは提示された鍵に bind されますが、refresh chain そのものはリフレッシュごとに鍵を切り替えられます。詳細は[設計判断 #15](/ja/security/design-judgments#dj-15)。
- **first-party 自動同意の対象になり得る**。`op.WithFirstPartyClients(...)` で審査済みの社内クライアントの consent prompt をスキップできます — 対象は静的・admin プロビジョン由来のクライアントのみで、DCR 由来は意図的に除外されます。

## FAPI grade client

FAPI 2.0 Baseline は confidential client の要件を一段引き上げます: PAR が必須、request object が署名される（JAR / Message Signing）、アクセストークンが sender-constrained（DPoP または mTLS）、認証は非対称鍵（`private_key_jwt`、`tls_client_auth`、または `self_signed_tls_client_auth`）。`op.WithProfile(profile.FAPI2Baseline)` を有効にすると、本ライブラリは discovery document の `token_endpoint_auth_methods_supported` を narrow します。詳細は[FAPI 2.0 入門](/ja/concepts/fapi)。

プロトコル上「FAPI クライアント種別」が別物として存在するわけではありません — FAPI grade client は追加要件を満たした confidential client です。本ライブラリは構築時およびリクエスト時にその一致を強制します。

## 認証メソッド

本ライブラリが実装するのは IANA "OAuth Token Endpoint Authentication Methods" レジストリの 6 メソッドです。閉じた集合は `op.AuthMethod` 定数で公開されています。

| メソッド | 事前共有シークレット？ | 非対称？ | FAPI 2.0？ | 主な用途 |
|---|---|---|---|---|
| `none` | — | — | 不可 | public client（SPA、native、CLI）+ PKCE。 |
| `client_secret_basic` | あり | — | 不可 | 共有シークレット保持のバックエンド。HTTP Basic で送る。confidential client の既定。 |
| `client_secret_post` | あり | — | 不可 | 同じシークレットを form body で送る。新規デプロイには非推奨 — Basic が標準的な通信路上の形式。 |
| `private_key_jwt` | — | あり | 可 | バックエンドが自分の秘密鍵で短寿命 JWT assertion に署名し、OP が登録 JWKS で検証。FAPI が推奨するメソッド。 |
| `tls_client_auth` | — | あり（PKI） | 可 | mTLS handshake。OP がクライアントの X.509 証明書を、登録された subject DN または SAN と照合。 |
| `self_signed_tls_client_auth` | — | あり（pin） | 可 | mTLS handshake。OP はクライアント JWKS に登録された JWK サムプリントで証明書を pin します。CA は介在しません。 |

`client_secret_jwt`（HS256 共有シークレット JWT）は **実装していません**。共有シークレット JWT は漏洩シークレットの被害範囲を広げる一方で、`private_key_jwt` が提供しないものを何ひとつ提供しません。本ライブラリはこの攻撃面を増やしません。

::: tip メソッドはクライアントごとに 1 つに絞る
discovery document には OP が受理するすべてのメソッドが列挙されますが、各クライアントが登録するのは正確に 1 つです。1 クライアント上での複数メソッド混在は標準化されておらず、ダウングレード攻撃の研究論文の元ネタになってきました — 本ライブラリは登録メソッドと正確に照合し、フォールバックを拒否します。
:::

## プロビジョニング方法

クライアント（およびその `TokenEndpointAuthMethod`）が OP に届く経路は 2 つあります。

- **静的シード** — `op.WithStaticClients(seeds ...ClientSeed)`。各 `ClientSeed` には `client_id`、`redirect_uris`、`grant_types`、`response_types`、`token_endpoint_auth_method`、クレデンシャル材料（対称メソッドなら `Secret`、非対称なら JWKS、RFC 8707 audience 分離なら `Resources`）を列挙します。本ライブラリは起動時にすべてを検証し、不正なシードでは起動を拒否します。既知のクライアント集団に最適 — 社内ツール、FAPI デプロイ、シングルテナント SaaS など。
- **Dynamic Client Registration（RFC 7591）**。`op.WithDynamicRegistration(...)` で有効化。RP は `POST /register` で実行時に自己登録し、本ライブラリは同じ検証を適用、`client_secret` を保管時にハッシュ化します（plaintext は `POST /register` の応答で 1 回だけ返ります。詳細は[設計判断 #20](/ja/security/design-judgments#dj-20)）。RFC 7592 の管理エンドポイントも公開されます。マーケットプレース、マルチテナント SaaS、OP オペレータがクライアントの集団を事前に把握できない場面に最適。

両経路は同じ OP 上で共存できます — 静的 FAPI クライアントの群れと、パートナー連携用の動的クライアントを同居させる構成は珍しくありません。

::: warning public client も登録は必要
「public client」は「誰でも飛び込んで来られる」という意味ではありません。client_id は何らかの経路 — 静的シードか DCR — で発行されたものであり、OP は知らない client_id を持つリクエストを拒否します。PKCE のみの認証は、OP が **既に知っている** その client_id を対象にしたもので、「無登録モード」ではありません。
:::

## 次に読む

- [scope と claim](/ja/concepts/scopes-and-claims) — 認証を済ませたクライアントが何を要求できるか。
- [送信者制約](/ja/concepts/sender-constraint) — DPoP / mTLS でアクセストークンをクライアントが保持する鍵に bind する。FAPI grade の必須要件。
- [Dynamic Client Registration](/ja/use-cases/dynamic-registration) — 実行時自己登録の経路とライフサイクル全体。
- [FAPI 2.0 入門](/ja/concepts/fapi) — 高保証デプロイ向けにすべてを束ねるプロファイル。
