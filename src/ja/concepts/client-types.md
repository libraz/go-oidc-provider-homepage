---
title: クライアント種別
description: public / confidential / FAPI grade のクライアント分類、本ライブラリが実装する認証メソッド、登録の方法。
pageClass: pg-concepts-client-types
---

# クライアント種別

**クライアント** とは、OP にトークンを要求するアプリケーションのことです。クライアントは構造的に **public**（シークレットを保持できない）と **confidential**（保持できる）の 2 つに分かれ、FAPI 2.0 構成は confidential のさらに上に高水準の要件を積みます。どの区分に属するかが token endpoint での認証メソッドを決め、その選択はリフレッシュトークンのポリシー、送信者制約の必須化、同意画面をスキップできるかどうかに連鎖していきます。

::: tip 30 秒で頭に入れる相関図
- **public client** — SPA、ネイティブアプリ、モバイルアプリ。コードがユーザの手に届くのでシークレットは保持できません。`none` + PKCE を使います。
- **confidential client** — バックエンドサービス、機械間呼び出し。シークレットや秘密鍵を保持できます。`client_secret_*` または `private_key_jwt` を使います。
- **FAPI grade client** — 送信者制約付きトークン（DPoP / mTLS）、PAR、非対称鍵認証で強化された confidential client。
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

public client とは、ユーザが制御するデバイス上でコードが動くアプリケーションのことです。典型例は SPA、モバイルアプリ、ネイティブデスクトップアプリ、CLI です。本質的な特徴は **バイナリやページに同梱されたものは攻撃者の手にも渡る** という点です。長寿命のシークレットを隠しておく場所はありません。

### いつ使うか

public client は「ユーザの端末で人をログインさせる」クライアントに使います。

- ブラウザ内 SPA が `/authorize` にリダイレクトし、JavaScript から `/token` で code + PKCE を交換する。
- モバイル / デスクトップアプリが custom URI scheme、claimed `https`、または loopback redirect で認可コードを受け取る。
- CLI がローカル loopback listener を開き、ブラウザログイン後に認可コードを受け取る。

バックエンドだけで動くサーバ側 RP やサービス間呼び出しでは、secret や秘密鍵を保持できるので confidential client を選びます。

### なぜ仕様として分かれているか

この分類は、クライアントを「シークレットを持てるかどうか」で正しく扱うためにあります。SPA やモバイルアプリに `client_secret` を要求すると、開発者は secret を JavaScript bundle、アプリ binary、設定ファイルのどこかに埋め込むしかありません。その値は配布先の全ユーザ、つまり攻撃者にも渡るので、仕様上は秘密として扱えません。

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

そこで OAuth / OIDC は public client を明示的に認めます。長寿命 secret で認証したふりをする代わりに、登録済み `client_id`、redirect URI の完全一致、リクエストごとの PKCE、refresh token rotation、必要に応じた DPoP で保護します。public client は「信用しないクライアント」ではなく、「secret を保持できない前提で別の防御を積むクライアント」です。

本ライブラリは `TokenEndpointAuthMethod` が `"none"` のクライアントを public として扱います。シークレットの不在を補う構造的な保護は次のとおりです。

- **PKCE が必須**。OP は `S256` のみを受理し、`plain` はプロファイルに関係なく拒否します（[設計判断 #14](/ja/security/design-judgments#dj-14)）。`code_verifier` は「フローを開始したクライアントと終わらせるクライアントが同じである」ことを示すリクエストごとのシークレット — これがなければ、redirect で奪われた認可コードだけでトークンが発行されてしまいます。
- **リフレッシュトークンはローテーションされ、DPoP に結び付けられる**。リフレッシュ交換が成功するたびに前のリフレッシュトークンは無効化され、次のトークンはクライアントが提示した DPoP 鍵に結び付けられます。public client で漏洩したリフレッシュトークンは、対応する鍵がなければ再利用できません。すでにローテーション済みのトークンが再提示された場合は連鎖全体が失効します。詳細は[設計判断 #15](/ja/security/design-judgments#dj-15)。
- **loopback redirect が許容される**。RFC 8252 §7.3 により、CLI は OS が割り当てる ephemeral port を `127.0.0.1` / `[::1]` 上で利用できます。詳細は[Redirect URI](/ja/concepts/redirect-uri)。

public client も ID トークン・リフレッシュトークンの受領、`/userinfo` の呼び出しが可能です — フル機能の RP として扱われ、ただ厳しい環境で動いているだけです。

## Confidential client

confidential client とは、ユーザの手の届かないストレージにシークレットや秘密鍵を保管できるバックエンドサービスのことです — サーバ側の環境変数、シークレットマネージャ、HSM など。本質的な特徴は **クレデンシャルが攻撃者からは簡単には読めない場所にある** ことです。`TokenEndpointAuthMethod` には `"none"` 以外を登録します。

confidential client が得られるもの:

- **token endpoint での認証**。すべての `POST /token` でクレデンシャルを送り、OP は何かを発行する前にそれを検証します。検証メソッドは下表のいずれかです。
- **緩めのリフレッシュトークンポリシー**。他のクライアントと同様にローテーションされますが、連鎖自体は既定では DPoP に結び付けられません — 各リフレッシュで発行されるアクセストークンは提示された鍵に結び付けられますが、リフレッシュトークンの連鎖そのものはリフレッシュごとに鍵を切り替えられます。詳細は[設計判断 #15](/ja/security/design-judgments#dj-15)。
- **first-party 自動同意の対象になり得る**。`op.WithFirstPartyClients(...)` で審査済みの社内クライアントの consent prompt をスキップできます — 対象は静的・admin プロビジョン由来のクライアントのみで、DCR 由来は意図的に除外されます。

## FAPI grade client

FAPI 2.0 Security Profile は、confidential クライアント、PAR、送信者制約付きアクセストークン（DPoP または mTLS）、mTLS または `private_key_jwt` によるクライアント認証を要求します。署名付きリクエストオブジェクトは、この仕様の必須要件ではありません。本ライブラリの `profile.FAPI2Baseline` 設定は、追加で JAR を要求し、トークンエンドポイントのクライアント認証には `private_key_jwt` を使います。mTLS は送信者制約に利用できますが、`tls_client_auth` と `self_signed_tls_client_auth` は `/token` で処理されません。詳しくは [FAPI 2.0 入門](/ja/concepts/fapi) を参照してください。

プロトコル上「FAPI クライアント種別」が別物として存在するわけではありません — FAPI grade client は追加要件を満たした confidential client です。本ライブラリは構築時およびリクエスト時にその一致を強制します。

## 認証メソッド

本ライブラリは IANA の "OAuth Token Endpoint Authentication Methods" レジストリにある 6 つの方式を `op.AuthMethod` 定数として認識します。そのうち `/token` で選択できるのは 4 方式です。2 つの mTLS クライアント認証方式には内部の検証器がありますが、`/token` の認証方式としては処理されません。

次の決定木は、クライアントの構造から登録する `token_endpoint_auth_method` の値までを辿ります — public client は `none`、confidential client は `client_secret_*` 系、FAPI grade client は非対称メソッドに落ちます。

<figure class="fig">
  <div class="fig-head">クライアントの構造が認証メソッドを決める</div>
  <svg class="fig-svg" role="img" aria-labelledby="authmethod-decision-title" viewBox="0 0 960 322" xmlns="http://www.w3.org/2000/svg">
    <title id="authmethod-decision-title">3 種類のクライアント構造と、それぞれが到達するトークンエンドポイント認証メソッドを示した図。public クライアントは none と PKCE、confidential クライアントは client secret、FAPI 相当のクライアントは private_key_jwt と送信者制約を使います。</title>
    <text class="fg-lbl" x="40" y="28">クライアントの構造</text>
    <text class="fg-lbl" x="564" y="28">token_endpoint_auth_method</text>
    <!-- public -->
    <rect class="fg-box" x="36" y="40" width="344" height="72" rx="8"/>
    <text class="fg-t" x="56" y="70">public クライアント</text>
    <text class="fg-xs" x="56" y="90">SPA · ネイティブアプリ · CLI</text>
    <path class="fg-edge" d="M384,76 H556" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="470" y="69" text-anchor="middle">秘密を保持できない</text>
    <rect class="fg-box" x="560" y="40" width="364" height="72" rx="8"/>
    <text class="fg-m" x="580" y="70">none</text>
    <text class="fg-xs" x="580" y="90">PKCE (S256) を必ず併用する</text>
    <!-- confidential -->
    <rect class="fg-box" x="36" y="128" width="344" height="72" rx="8"/>
    <text class="fg-t" x="56" y="158">confidential クライアント</text>
    <text class="fg-xs" x="56" y="178">バックエンド web アプリ · サービス</text>
    <path class="fg-edge" d="M384,164 H556" marker-end="url(#fg-a)"/>
    <text class="fg-xs" x="470" y="157" text-anchor="middle">client secret を保持する</text>
    <rect class="fg-box" x="560" y="128" width="364" height="72" rx="8"/>
    <text class="fg-m" x="580" y="155">client_secret_basic</text>
    <text class="fg-m" x="580" y="173">client_secret_post</text>
    <text class="fg-xs" x="580" y="191">どちらかを選んで登録する</text>
    <!-- FAPI -->
    <rect class="fg-box fg-box--accent" x="36" y="216" width="344" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="56" y="246">FAPI 相当のクライアント</text>
    <text class="fg-xs" x="56" y="266">送信者制約付き · 高保証</text>
    <path class="fg-edge fg-edge--accent" d="M384,252 H556" marker-end="url(#fg-ac)"/>
    <text class="fg-xs" x="470" y="245" text-anchor="middle">FAPI 2.0 プロファイル</text>
    <rect class="fg-box fg-box--accent" x="560" y="216" width="364" height="72" rx="8"/>
    <text class="fg-m" x="580" y="246">private_key_jwt</text>
    <text class="fg-xs" x="580" y="266">加えて DPoP または mTLS の送信者制約</text>
  </svg>
  <figcaption class="fig-note">構造は選んで名乗るものではなく、コードがどこで動くかによって決まります。ブラウザや端末に配布されるものは秘密を保持できないため、登録内容が何であれ public クライアントです。</figcaption>
</figure>

| メソッド | 事前共有シークレット？ | 非対称？ | FAPI 2.0？ | 主な用途 |
|---|---|---|---|---|
| `none` | — | — | 不可 | public client（SPA、native、CLI）+ PKCE。 |
| `client_secret_basic` | あり | — | 不可 | 共有シークレット保持のバックエンド。HTTP Basic で送る。confidential client の既定。 |
| `client_secret_post` | あり | — | 不可 | 同じシークレットを form body で送る。新規デプロイには非推奨 — Basic が標準的な通信路上の形式。 |
| `private_key_jwt` | — | あり | 可 | バックエンドが自分の秘密鍵で短寿命の JWT アサーションに署名し、OP が登録済み JWKS で検証。本ライブラリの FAPI 設定で使う方式。 |
| `tls_client_auth` | — | あり（PKI） | RFC 検証器のみ | RFC 8705 検証器は内部にありますが、`/token` のクライアント認証方式としては振り分けられません。 |
| `self_signed_tls_client_auth` | — | あり（pin） | RFC 検証器のみ | RFC 8705 検証器は内部にありますが、`/token` のクライアント認証方式としては振り分けられません。 |

`client_secret_jwt`（HS256 共有シークレット JWT）は **実装していません**。共有シークレット JWT は漏洩シークレットの被害範囲を広げる一方で、`private_key_jwt` が提供しないものを何ひとつ提供しません。本ライブラリはこの攻撃面を増やしません。

`jwks_uri` で登録された `private_key_jwt` クライアントでは、未知の `kid` で署名された assertion を受けたとき、検証失敗の前に 1 回だけ throttle 付きでキャッシュを迂回して JWKS を再取得します。正当な RP 鍵ローテーションは即時に回復し、ランダムな未知 `kid` は外向き fetch を増幅できません。

::: tip メソッドはクライアントごとに 1 つに絞る
discovery 文書には OP が受理するすべてのメソッドが列挙されますが、各クライアントが登録するのは正確に 1 つです。1 クライアント上での複数メソッド混在は標準化されておらず、ダウングレード攻撃の研究論文の元ネタになってきました — 本ライブラリは登録メソッドと正確に照合し、フォールバックを拒否します。
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
