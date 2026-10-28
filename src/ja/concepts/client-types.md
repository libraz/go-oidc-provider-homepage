---
title: クライアント種別
description: public / confidential / FAPI grade のクライアント分類、本ライブラリが実装する認証メソッド、登録の方法。
pageClass: pg-concepts-client-types
---

# クライアント種別

**クライアント** とは、OP にトークンを要求するアプリケーションのことです。クライアントは **public**（シークレットを保持できない）と **confidential**（保持できる）の 2 つに分かれ、FAPI 2.0 構成は confidential の上にさらに高い要件を積みます。どちらに属するかで token endpoint での認証メソッドが決まり、その選択がリフレッシュトークンのポリシー、送信者制約の要否、同意画面をスキップできるかどうかに影響します。

::: tip 30 秒でつかむ要点
- **public client**: SPA、ネイティブアプリ、モバイルアプリ。コードがユーザの手に届くので、中に入れたシークレットは秘密になりません。`none` + PKCE を使います。
- **confidential client**: バックエンドサービス、機械間呼び出し。シークレットや秘密鍵を保持できます。`client_secret_*` または `private_key_jwt` を使います。
- **FAPI grade client**: 送信者制約付きトークン（DPoP / mTLS）、PAR、非対称鍵認証で強化された confidential client。
:::

::: details このページで触れる仕様
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 §2.1（クライアント種別）、§2.3（クライアント認証）
- [RFC 7521](https://datatracker.ietf.org/doc/html/rfc7521) / [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523) — Assertion ベースのクライアント認証
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps
- [RFC 8705](https://datatracker.ietf.org/doc/html/rfc8705) — Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §9（クライアント認証）
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — §5.3.2.1（許可されるクライアント認証方式）
:::

## Public client

public client は、ユーザが制御するデバイス上でコードが動くアプリケーションです。SPA、モバイルアプリ、ネイティブデスクトップアプリ、CLI が該当します。**バイナリやページに同梱したものは攻撃者の手にも渡る** ため、長寿命のシークレットを隠しておく場所がありません。

### いつ使うか

public client は「ユーザの端末で人をログインさせる」クライアントに使います。

- ブラウザ内 SPA が `/auth` にリダイレクトし、JavaScript から `/token` で認可コードと PKCE の verifier を交換する。
- モバイル / デスクトップアプリが custom URI scheme、claimed `https`、または loopback redirect で認可コードを受け取る。
- CLI がローカル loopback listener を開き、ブラウザログイン後に認可コードを受け取る。

バックエンドだけで動くサーバ側 RP やサービス間呼び出しでは、secret や秘密鍵を保持できるので confidential client を選びます。

### なぜ仕様として分かれているか

クレデンシャルは、クライアントがそれを秘密にしておけて初めて認証の役に立ちます。SPA やモバイルアプリに `client_secret` を要求すると、開発者は JavaScript bundle、アプリ binary、設定ファイルのどこかに埋め込むしかありません。その値は配布先の全ユーザ、つまり攻撃者にも渡るので、仕様上は秘密として扱えません。

```jsonc
// NG: SPA bundle に secret を同梱するしかなく、secret として扱えない
{
  "client_id": "browser-spa",
  "token_endpoint_auth_method": "client_secret_basic",
  "client_secret": "shipped-in-javascript"
}

// OK: public client として登録し、code + PKCE で守る
{
  "client_id": "browser-spa",
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code"],
  "redirect_uris": ["https://app.example.com/callback"]
}
```

そこで OAuth / OIDC は public client を明示的に認め、別の仕組みで守ります。登録済み `client_id`、redirect URI の完全一致、リクエストごとの PKCE、リフレッシュトークンのローテーション、必要に応じた DPoP です。public client は「信用しないクライアント」ではなく、「シークレットを保持できない前提で別の防御を積むクライアント」です。

本ライブラリは `TokenEndpointAuthMethod` が `"none"` のクライアントを public として扱います。シークレットがない分は、次の保護で補います。

- **PKCE が必須**。OP は `S256` のみを受理し、`plain` はプロファイルに関係なく拒否します（[設計判断 #14](/ja/security/design-judgments#dj-14)）。`code_verifier` は、フローを開始したクライアントと終わらせるクライアントが同じであることを示すリクエストごとのシークレットです。これがなければ、リダイレクトで奪われた認可コードだけでトークンが発行されてしまいます。
- **リフレッシュトークンはローテーションされ、DPoP に結び付けられる**。リフレッシュ交換が成功するたびに前のリフレッシュトークンは無効化され、次のトークンはクライアントが提示した DPoP 鍵に結び付けられます。public client で漏洩したリフレッシュトークンは、対応する鍵がなければ再利用できません。すでにローテーション済みのトークンが再提示された場合は連鎖全体が失効します。詳細は[設計判断 #15](/ja/security/design-judgments#dj-15)。
- **loopback redirect が許容される**。RFC 8252 §7.3 により、CLI は OS が割り当てる ephemeral port を `127.0.0.1` / `[::1]` 上で利用できます。詳細は[Redirect URI](/ja/concepts/redirect-uri)。

public client も ID トークンとリフレッシュトークンを受け取り、`/userinfo` を呼び出せます。厳しい条件下で動くだけで、RP としての機能は変わりません。

## Confidential client

confidential client は、シークレットや秘密鍵をユーザの手が届かないストレージ（サーバ側の環境変数、シークレットマネージャ、HSM など）に保管できるバックエンドサービスです。`TokenEndpointAuthMethod` には `"none"` 以外を登録します。

confidential client には次の扱いが加わります。

- **token endpoint での認証**。すべての `POST /token` でクレデンシャルを送り、OP は何かを発行する前にそれを検証します。検証メソッドは下表のいずれかです。
- **緩めのリフレッシュトークンポリシー**。他のクライアントと同様にローテーションされますが、連鎖自体は既定では DPoP に結び付けられません — 各リフレッシュで発行されるアクセストークンは提示された鍵に結び付けられますが、リフレッシュトークンの連鎖そのものはリフレッシュごとに鍵を切り替えられます。詳細は[設計判断 #15](/ja/security/design-judgments#dj-15)。
- **first-party 自動同意の対象になり得る**。`op.WithFirstPartyClients(...)` で、審査済みの社内クライアントの同意画面をスキップできます。対象は静的シード由来と admin プロビジョン由来のクライアントだけで、DCR 由来は意図的に除外されます。FAPI 2.0 プロファイルとの併用は `op.New` が拒否します。

## FAPI grade client

FAPI 2.0 Security Profile は、confidential クライアント、PAR、送信者制約付きアクセストークン（DPoP または mTLS）、mTLS または `private_key_jwt` によるクライアント認証を要求します。署名付きリクエストオブジェクトは、この仕様の必須要件ではありません。本ライブラリの `profile.FAPI2Baseline` は、追加で JAR を要求し、トークンエンドポイントのクライアント認証には `private_key_jwt` だけを許可します。mTLS は送信者制約として使えますが、mTLS によるクライアント認証 2 方式は選択できません（後述）。詳しくは [FAPI 2.0 入門](/ja/concepts/fapi) を参照してください。

プロトコル上「FAPI クライアント種別」が別にあるわけではありません。FAPI grade client は、追加要件を満たした confidential client です。本ライブラリは構築時とリクエスト時にその要件を強制します。

## 認証メソッド

本ライブラリは IANA の "OAuth Token Endpoint Authentication Methods" レジストリにある 6 つの方式を `op.AuthMethod` 定数として持っています。実際に使えるのは 4 方式で、mTLS によるクライアント認証 2 方式は定数として名前があるだけで選択できません。

次の図は、クライアントの構造から登録する `token_endpoint_auth_method` の値までを辿ります。public client は `none`、confidential client は `client_secret_*` 系、FAPI grade client は非対称メソッドに行き着きます。

<figure class="fig">
  <div class="fig-head">クライアントの構造が認証メソッドを決める</div>
  <svg class="fig-svg" role="img" aria-labelledby="authmethod-decision-title" viewBox="0 0 960 392" xmlns="http://www.w3.org/2000/svg">
    <title id="authmethod-decision-title">3 種類のクライアント構造と、それぞれが到達するトークンエンドポイント認証メソッドを示した図。public クライアントは none と PKCE、confidential クライアントは client secret、FAPI 相当のクライアントは private_key_jwt と送信者制約を使います。</title>
    <text class="fg-lbl" x="32" y="40">クライアントの構造</text>
    <text class="fg-lbl" x="560" y="40">token_endpoint_auth_method</text>
    <!-- public -->
    <rect class="fg-box" x="32" y="64" width="336" height="72" rx="8"/>
    <text class="fg-t" x="48" y="92">public クライアント</text>
    <text class="fg-s" x="48" y="116">SPA · ネイティブアプリ · CLI</text>
    <path class="fg-edge" d="M368,100 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="464" y="90" text-anchor="middle">秘密を保持できない</text>
    <rect class="fg-box" x="560" y="64" width="368" height="72" rx="8"/>
    <text class="fg-m" x="576" y="92">none</text>
    <text class="fg-s" x="576" y="116">PKCE (S256) を必ず併用する</text>
    <!-- confidential -->
    <rect class="fg-box" x="32" y="168" width="336" height="96" rx="8"/>
    <text class="fg-t" x="48" y="196">confidential クライアント</text>
    <text class="fg-s" x="48" y="220">バックエンド web アプリ · サービス</text>
    <path class="fg-edge" d="M368,216 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="464" y="206" text-anchor="middle">secret を保持する</text>
    <rect class="fg-box" x="560" y="168" width="368" height="96" rx="8"/>
    <text class="fg-m" x="576" y="196">client_secret_basic</text>
    <text class="fg-m" x="576" y="220">client_secret_post</text>
    <text class="fg-s" x="576" y="244">どちらかを選んで登録する</text>
    <!-- FAPI -->
    <rect class="fg-box fg-box--accent" x="32" y="296" width="336" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="324">FAPI 相当のクライアント</text>
    <text class="fg-s" x="48" y="348">送信者制約付き · 高保証</text>
    <path class="fg-edge fg-edge--accent" d="M368,332 H560" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="464" y="322" text-anchor="middle">FAPI 2.0 プロファイル</text>
    <rect class="fg-box fg-box--accent" x="560" y="296" width="368" height="72" rx="8"/>
    <text class="fg-m" x="576" y="324">private_key_jwt</text>
    <text class="fg-s" x="576" y="348">加えて DPoP または mTLS の送信者制約</text>
  </svg>
  <figcaption class="fig-note">構造は選んで名乗るものではなく、コードがどこで動くかによって決まります。ブラウザや端末に配布されるものは秘密を保持できないため、登録内容が何であれ public クライアントです。</figcaption>
</figure>

| メソッド | 事前共有シークレット？ | 非対称？ | FAPI 2.0？ | 主な用途 |
|---|---|---|---|---|
| `none` | — | — | 不可 | public client（SPA、native、CLI）+ PKCE。 |
| `client_secret_basic` | あり | — | 不可 | 共有シークレット保持のバックエンド。HTTP Basic で送る。confidential client の既定。 |
| `client_secret_post` | あり | — | 不可 | 同じシークレットを form body で送る。新規デプロイには非推奨 — Basic が標準的な通信路上の形式。 |
| `private_key_jwt` | — | あり | 可 | バックエンドが自分の秘密鍵で短寿命の JWT アサーションに署名し、OP が登録済み JWKS で検証。本ライブラリの FAPI 設定で使う方式。 |
| `tls_client_auth` | — | あり（PKI） | 選択不可 | RFC 8705 の方式名として定義されていますが、静的クライアントでの指定は `op.New` が、動的登録での指定は登録エンドポイントが拒否し、discovery にも載りません。`private_key_jwt` を使ってください。 |
| `self_signed_tls_client_auth` | — | あり（pin） | 選択不可 | `tls_client_auth` と同じです。 |

mTLS で結び付けたアクセストークン（RFC 8705 §3）は別の機能で、この 2 方式を必要としません。`feature.MTLS` を有効にすると、クライアントが証明書を提示した場合、どの方式で認証したかにかかわらず `cnf.x5t#S256` が付きます。

`client_secret_jwt`（HS256 共有シークレット JWT）は **実装していません**。共有シークレット JWT は漏洩時の被害を広げるだけで、`private_key_jwt` にない利点がありません。

`private_key_jwt` の assertion は次のように厳密に検査します。

- `iss` と `sub` は `client_id` と一致し、`aud` は受理する audience のいずれか（[Issuer](/ja/concepts/issuer) を参照）で、`exp` は現在から最長 5 分先までです。
- `jti` は必須で、256 文字以下、かつ 1 回限りです。再送された assertion は `invalid_client` になります。
- `jwks_uri` で登録したクライアントが未知の `kid` で署名した場合は、検証失敗の前に、1 回だけ throttle 付きでキャッシュを迂回して JWKS を再取得します。正当な鍵ローテーションにはすぐ追従でき、ランダムな `kid` による外向き fetch の増幅は起きません。
- 過負荷や一時的な障害でクライアントの JWKS を取得できないときは、`/token` が `invalid_client` ではなく `503 server_error` を返します。クライアントストアの障害では `500 server_error` です。どちらもクライアント側で再試行できます。

::: tip メソッドはクライアントごとに 1 つに絞る
discovery 文書には OP が受理するすべてのメソッドが列挙されますが、各クライアントが登録するのは正確に 1 つです。1 クライアント上での複数メソッド混在は標準化されておらず、ダウングレード攻撃の研究論文の元ネタになってきました — 本ライブラリは登録メソッドと正確に照合し、フォールバックを拒否します。
:::

## プロビジョニング方法

クライアントとその `TokenEndpointAuthMethod` が OP に届く経路は 2 つあります。

**静的シード** は `op.WithStaticClients(seeds ...ClientSeed)` で渡します。シードは 3 種類の型付きビルダのどれかで、認証メソッドはビルダが決めます。

| ビルダ | 登録されるメソッド | クレデンシャルのフィールド |
|---|---|---|
| `op.PublicClient` | `none` | なし |
| `op.ConfidentialClient` | `client_secret_basic`（既定）または `client_secret_post`（`AuthMethod` で指定） | `Secret`（Argon2id でハッシュ化）または `SecretHash` |
| `op.PrivateKeyJWTClient` | `private_key_jwt` | `JWKS`（公開鍵セット。`op.LoadPublicJWKS` の戻り値など） |

```go
jwks, err := op.LoadPublicJWKS("keys/fapi-client.jwks.json")
if err != nil {
    return err
}

provider, err := op.New(
    // ...
    op.WithStaticClients(
        op.PublicClient{
            ID:           "web-spa",
            RedirectURIs: []string{"https://app.example.com/callback"},
            Scopes:       []string{"openid", "profile"},
        },
        op.ConfidentialClient{
            ID:           "billing-backend",
            Secret:       os.Getenv("BILLING_CLIENT_SECRET"),
            RedirectURIs: []string{"https://billing.example.com/callback"},
            Scopes:       []string{"openid"},
        },
        op.PrivateKeyJWTClient{
            ID:           "bank-connector",
            JWKS:         jwks,
            RedirectURIs: []string{"https://bank.example.com/callback"},
            Scopes:       []string{"openid"},
        },
    ),
)
```

シードはすべて構築時に検証され、不正なものがあれば `op.New` は起動を拒否します。特に重要なルールは次の 2 つです。

- `client_secret_basic` または `client_secret_post` を使う `ConfidentialClient` には、`Secret` か `SecretHash` が必須です。どちらもないシードは拒否されます。空のハッシュでは空の `client_secret` が通ってしまうためです。
- クライアント記録は `jwks` と `jwks_uri` を同時に持てません（RFC 7591 §2）。動的登録はこの組み合わせを拒否し、bring-your-own ストアなどで両方を持つ記録ができても、request object の検証、`private_key_jwt`、レスポンス暗号化のどれでも拒否されます。

静的シードは、社内ツール、FAPI デプロイ、シングルテナント SaaS のような既知のクライアント集団に向いています。

**Dynamic Client Registration（RFC 7591）** は `op.WithDynamicRegistration(...)` で有効にします。RP は `POST /register` で実行時に自己登録します。OP は同じ検証を適用し、生成した `client_secret` を保管時にハッシュ化し、plaintext は 1 回だけ返します（[設計判断 #20](/ja/security/design-judgments#dj-20)）。RFC 7592 の管理エンドポイントも公開されます。マーケットプレース、マルチテナント SaaS、OP の運用者がクライアントを事前に把握できない場面に向いています。

2 つの経路は同じ OP 上で共存できます。静的な FAPI クライアントの群れと、パートナー連携用の動的クライアントを同居させる構成はよくあります。

::: warning public client も登録は必要
「public client」は「誰でも飛び込んで来られる」という意味ではありません。`client_id` は静的シードか DCR のどちらかで発行されたもので、OP は知らない `client_id` のリクエストを拒否します。PKCE のみの認証は、OP がすでに知っている `client_id` が対象で、「無登録モード」ではありません。
:::

## 次に読む

- [scope と claim](/ja/concepts/scopes-and-claims) — 認証を済ませたクライアントが何を要求できるか。
- [送信者制約](/ja/concepts/sender-constraint) — DPoP / mTLS でアクセストークンをクライアントが保持する鍵に bind する。FAPI grade の必須要件。
- [Dynamic Client Registration](/ja/use-cases/dynamic-registration) — 実行時自己登録の経路とライフサイクル全体。
- [FAPI 2.0 入門](/ja/concepts/fapi) — 高保証デプロイ向けにすべてを束ねるプロファイル。
