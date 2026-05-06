---
title: 概念を学ぶ
description: 概念ページの推奨される読む順番。各ステップは前のステップで扱った内容のみを前提にしているので、上から順に読めば戻る必要はありません。
---

# 概念を学ぶ

このページは`/ja/concepts/`配下のすべてのページに対する **推奨される読む順番** です。各ページは前のステップで扱った内容のみを前提にしているので、上から順に読めば途中で戻る必要はありません。

::: tip 順番に読む
OAuth と OIDC が初めての方は、ステップ 1 から順に降りていってください。よくつまづくのは仕様が難しいからではなく、「issuer とは」「redirect URI とは」を最初に固める前に、いきなりリフレッシュトークンや DPoP の話に進んでしまうからです。本ページはその順序を整えるためにあります。
:::

::: details すでに知っている場合は飛ばして OK
- OAuth のロール、scope、`code`+ PKCE はすでに把握している → **ステップ 4(トークン)** か **ステップ 6(送信者制約トークン)** から読み始めて構いません。
- 別の OP を運用していて、本ライブラリの運用面だけ知りたい → **ステップ 2(設定の基礎)** で語彙だけ確認したら[運用](/ja/operations/)に飛んでください。
- FAPI 2.0 が目的 → **ステップ 6**(DPoP / mTLS)→ **ステップ 7 → FAPI 2.0 入門** の順で十分ですが、入門ページは送信者制約を理解している前提で書かれています。
:::

## ステップ 1: OAuth / OIDC とは

「OP」「RP」「RS」「JWT」「PKCE」のいずれかが曖昧であれば、ここから始めてください。

- [OAuth 2.0 / OIDC 入門](/ja/concepts/oauth2-oidc-primer) — 3 つのロール、それらが共有する 1 つのフロー、そしてドキュメントの残りで繰り返し出てくる略語の早見表。

## ステップ 2: 設定の基礎

以降のすべてのページが前提にしている語彙です。ここはまだフローやトークンの話ではなく、OP とそのクライアントを識別する文字列・URL・鍵素材の話です。

- [issuer / 発行者](/ja/concepts/issuer) — OP の identity URL、`iss` claim、そしてなぜ正規形がただひとつでなければならないか。
- [redirect URI](/ja/concepts/redirect-uri) — RP が登録する値、なぜ完全一致が現代の標準なのか、本ライブラリがどう検証するか。
- [クライアントの種類](/ja/concepts/client-types) — `confidential` と `public`、それぞれが対応するクライアント認証方式。
- [scope と claim](/ja/concepts/scopes-and-claims) — scope が何を許可し、claim が何を運ぶか、`openid`/`profile`/`email`が user-info 応答にどう対応するか。
- [discovery](/ja/concepts/discovery) — `/.well-known/openid-configuration`、RP がそこから何を読むか、OP が安定させるべき項目は何か。
- [JOSE 入門 (JWS / JWE / JWK / JWKS / kid)](/ja/concepts/jose-basics) — JWS、JWE、JWK、JWKS、`kid`、そしてどのページにも繰り返し現れるアルゴリズム名。

## ステップ 3: 基本フロー

実運用で 9 割を占める 3 つの grant です。記載順に読んでください。リフレッシュトークンは認可コードを前提にしますし、client credentials は認可コードと比較するのが一番分かりやすいです。

- [認可コードフロー + PKCE](/ja/concepts/authorization-code-pkce) — ユーザ向けの既定フロー。PKCE は public client では必須、それ以外でも推奨。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — 長寿命セッションの仕組み、ローテーション、RFC 9700 の reuse-detection ルール。
- [Client Credentials](/ja/concepts/client-credentials) — サービス間通信。ユーザなし、リフレッシュトークンなし、クライアントが自身を認証するだけ。

## ステップ 4: トークン

OP が実際に発行するもの、そしてなぜ「JWT か opaque か」が仕様の選択ではなく運用の選択なのか。

- [ID トークン / アクセストークン](/ja/concepts/tokens) — 2 つのトークン、2 つの audience、2 つの目的。よくある混同源。
- [アクセストークンの形式（JWT と opaque）](/ja/concepts/access-token-format) — JWT アクセストークン (RFC 9068) を選ぶべき場面、opaque を維持すべき場面、introspection のコスト。

## ステップ 5: セッションと同意

トークンが発行された後、ユーザは OP に session を持ち、何に同意したかの記録が残ります。この 2 つのページはほとんどのフローが残す OP 側の状態を扱います。

- [session と logout](/ja/concepts/sessions-and-logout) — OP の session と RP の session、RP-Initiated Logout、Back-Channel Logout。
- [同意](/ja/concepts/consent) — 同意画面が記録するもの、スキップできる条件、本ライブラリでのファーストパーティクライアントのモデル化。

## ステップ 6: 送信者制約トークン

bearer token は既定では「持っている人なら誰でも使える」ことを意味します。送信者制約付きトークンはそれを是正します。まず選び方ガイドを読んでください。実際に DPoP や mTLS が必要かどうかをそこで判断できます。

- [送信者制約 (DPoP / mTLS) — 選び方](/ja/concepts/sender-constraint) — 必要になる場面、2 つの方式の選び方。
- [DPoP](/ja/concepts/dpop) — リクエストごとに署名された JWT による所持証明。Web に馴染む選択肢。
- [mTLS](/ja/concepts/mtls) — クライアントの TLS 証明書による所持証明。インフラ側の負担が大きく、一部の FAPI 配備では必須。

## ステップ 7: 発展トピック

頻度の低いフローやプロファイルです。具体的な必要があるとき — TV のような機器、電話を authenticator にするパターン、サービス間のトークン交換、FAPI を要求する規制 — に限って読んでください。

- [Device Code（RFC 8628）](/ja/concepts/device-code) — 入力が制約されたデバイス: TV、CLI、IoT。
- [CIBA](/ja/concepts/ciba) — リクエストを発する機器に browser がない構成での、電話への push 認証。
- [Token Exchange（RFC 8693）](/ja/concepts/token-exchange) — 別の audience や actor を持つトークンへの交換。
- [FAPI 2.0 入門](/ja/concepts/fapi) — PAR + 送信者制約 + 厳格なクライアント認証をひとつにまとめたプロファイル。Open Banking などの規制対象 API で採用されています。

## ステップ 8: ヘルプ

読む順番では答えが出ない質問のために。

- [FAQ](/ja/faq) — 繰り返し聞かれる質問への短い答え。本ページとほぼ同じ並びで整理しています。
