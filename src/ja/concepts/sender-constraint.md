---
title: 送信者制約 — 選定ガイド
description: Bearer トークンと送信者制約付きトークン。DPoP と mTLS のどちらを選ぶかの判断軸。
pageClass: pg-concepts-sender-constraint
---

# 送信者制約 — DPoP と mTLS の選び方

保護のない Bearer トークンは、バイト列を持っている者なら使える方式です。トークンが漏れると（ログ、中継プロキシ、ブラウザ拡張、サードパーティ SDK など）、攻撃者は有効期限までその権限を使えます。

**送信者制約付き** アクセストークンは、正規クライアントが保有する鍵に結び付けられます。バイト列が漏れても、攻撃者は鍵を一緒に盗まないと使えません。本ページは選定ガイドです。それぞれの仕組みは [DPoP](/ja/concepts/dpop) と [mTLS](/ja/concepts/mtls) の専用ページに分けています。

::: details トークン replay とは何か
攻撃者が漏洩した有効なアクセストークン（ログや侵害されたプロキシなど）を、自分のマシンから再送して API を呼ぶ攻撃です。リソースサーバは構文的に有効なトークンを見て応答してしまいます。送信者制約があれば対応する鍵も必要になるため、トークンだけのリプレイを防げます。
:::

::: details proof-of-possession とは
「トークンのバイト列だけでなく、対応する鍵を保有していることを示してください」という考え方の総称です。DPoP / mTLS、それより古い holder-of-key トークンなどはすべて proof-of-possession 方式です。本ライブラリの DPoP / mTLS は、この考え方の現代的な OAuth ネイティブ実装になります。
:::

## 2026 年に Bearer トークンを残すリスク

トークン漏洩は仮想の話ではありません:

- **ログ** — リバースプロキシのアクセスログ、アプリログ、observability パイプラインは、明示的に剥がさない限り `Authorization` ヘッダを残しがちです。ログに残った bearer は TTL いっぱい再利用できてしまいます。
- **ブラウザ拡張・SDK** — ブラウザ拡張はページと同じプロセス境界の中で動作するため、ページが付ける任意のヘッダを読めます。モバイル SDK もアプリと同じプロセス内に居ます。
- **侵害された中継** — CDN エッジやプロキシが 1 つでも侵害されれば、そこを通るすべてのリクエストが攻撃者の手に渡ります。Bearer トークンは収穫対象として最も価値があります。
- **stage-and-fire** — 開発者のマシンに一時的にアクセスできた攻撃者は、トークンをコピーして後日インターネット側から使えます。

構造的な解は、バイト列だけでは不十分にすることです。送信者制約は、すべてのリクエストを正規クライアントが保有する鍵に紐付けることでこれを達成します。漏洩自体は依然として起きますが、トークン単独では API を侵害できなくなります。

::: tip 送信者制約と TLS の違い
TLS は通信路上のトークンを保護します。一度アプリ層（OP、RS、ロギング middleware、デバッグエンドポイント）に届いた Bearer トークンは平文で、それらの場所のいずれかから漏れる可能性が残ります。送信者制約は、トークンを通信路の外でも使い回されにくくします。
:::

## 本ライブラリの 2 つの結び付け方式

**DPoP**（RFC 9449）は、クライアントがリクエストごとに自分の鍵で署名する方式です。証明（proof）は小さな JWT（`htm`、`htu`、`iat`、`jti`、任意の `ath` と `nonce`）で、HTTP ヘッダ `DPoP:` に乗せます。通常の HTTPS で動作し、TLS クライアント証明書は不要です。詳細は [DPoP](/ja/concepts/dpop) を参照してください。

**mTLS**（RFC 8705）は、TLS ハンドシェイクで提示した X.509 証明書にトークンを結び付ける方式です。OP は証明書の SHA-256 指紋（thumbprint）を `cnf.x5t#S256` として発行トークンに書き込み、リソースサーバは観測した証明書の指紋を照合します。詳細は [mTLS](/ja/concepts/mtls) を参照してください。

## 比較

| 観点 | DPoP | mTLS |
|---|---|---|
| 仕様 | RFC 9449 | RFC 8705 |
| 鍵媒体 | クライアントが保持する秘密鍵（署名できる任意の機器） | クライアント TLS 証明書（PKI 発行 / 自己署名） |
| ブラウザ対応 | 可（SPA、モバイル、JWT を署名できるあらゆる主体） | 弱 — ブラウザはクライアント証明書を実用的に提示できない |
| リクエスト毎の追加成果物 | アプリ側で署名する新しい JWS proof | なし（TLS 層で結び付け） |
| プロキシ / TLS 終端への依存 | なし — 通常の HTTPS で動く | 終端側が証明書をヘッダで前送りする必要あり |
| `cnf` メンバ | `cnf.jkt`(JWK thumbprint) | `cnf.x5t#S256`(X.509 thumbprint) |
| リフレッシュトークン結び付けの既定 | 公開クライアントは結び付ける、confidential クライアントは結び付けない（[設計判断 #15](/ja/security/design-judgments#dj-15)） | 全クライアント種別で証明書に結び付ける。リフレッシュでは同じ証明書の提示が必要 |
| 結び付けを越えた replay 防御 | `jti` キャッシュ、`iat` 窓、任意のサーバ nonce | TLS セッション再利用 + 証明書 thumbprint 照合 |
| FAPI 2.0 Security Profile（confidential client）で利用可能 | 可 | 可 |
| FAPI 2.0 Message Signing | Security Profile を継承。DPoP nonce は任意 | Security Profile を継承 |

Final の FAPI 2.0 Security Profile は confidential client を対象とし、**どちらか一方** の方式による送信者制約付きトークンを要求します。Message Signing はこの要件を継承しますが、DPoP nonce を追加で要求しません。本ライブラリはトークンバインディングとして両方を受理します。`op.WithProfile(profile.FAPI2Baseline)` は `[feature.DPoP, feature.MTLS]` に対する `RequiredAnyOf` を課します。どちらも有効化されていなければ構築時に `feature.DPoP` を既定メンバーとして選びます。`feature.MTLS` を明示している場合はそれで制約を満たすため、DPoP は追加されません。本ライブラリの token endpoint クライアント認証には `private_key_jwt` を使いますが、Final Security Profile は mTLS も許可します。

以下の選定ガイドは、本ライブラリが対応する公開クライアントの配備も扱います。公開クライアントは Final Security Profile の対象クライアント要件には含まれません。

## 結び付けが適用される条件

`feature.DPoP` や `feature.MTLS` を有効にしただけでは、すべてのトークンが結び付くわけではありません。token endpoint は、リクエストが DPoP proof またはクライアント証明書を伴っていれば結び付け、伴っていなければ通常の bearer トークンを発行します。`profile.FAPI2Baseline`、`profile.FAPI2MessageSigning`、`profile.FAPICIBA` はこの抜け道を塞ぎ、結び付いていないリクエストを `/token` で `invalid_request` として拒否します。1 つのトークンが `cnf.jkt` と `cnf.x5t#S256` の両方を持つこともあり、その場合リソースサーバは両方を検証する必要があります。

| 状況 | 応答 |
|---|---|
| FAPI プロファイル下で、proof も証明書もない token リクエスト | `400 invalid_request` |
| DPoP に結び付いた連鎖のリフレッシュで、proof がない、または別の鍵で署名されている | `400 invalid_grant` |
| mTLS に結び付いた連鎖のリフレッシュで、証明書がない、または別の証明書 | `400 invalid_grant` |
| `/userinfo` に DPoP バインドのトークンを `Bearer` scheme で、または proof なしで提示 | `401`、`WWW-Authenticate` は `invalid_token` |
| `/userinfo` に mTLS バインドのトークンを、別の証明書または証明書なしで提示 | `401`、`WWW-Authenticate` は `invalid_token` |
| バインド済みトークンの introspection | `cnf` つきの active 応答。OP は proof を検査せず、リソースサーバが検査する |

introspection は、バインド済みのトークンでも `token_type: "Bearer"` を返します。バインドは `cnf` でだけ確認できます。

## 使い分けの指針

<figure class="fig">
  <div class="fig-head">既定は DPoP、証明書があるなら mTLS</div>
  <svg class="fig-svg" role="img" aria-labelledby="sc-choice-title" viewBox="0 0 960 568" xmlns="http://www.w3.org/2000/svg">
    <title id="sc-choice-title">送信者制約を選ぶための判定木。ブラウザ中心のクライアントは通常 DPoP、すでに PKI 証明書を持つバックエンドは mTLS を選べます。B2B や規制環境は制度やパートナー要件を確認し、混在環境は両方を有効化します。どれにも当てはまらない場合の既定は DPoP です。</title>
    <!-- 1 -->
    <rect class="fg-box" x="32" y="24" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="52">ブラウザ中心のクライアントか?</text>
    <text class="fg-xs" x="48" y="76">SPA · モバイルアプリ · public クライアント全般</text>
    <path class="fg-edge" d="M464,60 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="50" text-anchor="middle">はい</text>
    <rect class="fg-box" x="560" y="24" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="52">DPoP</text>
    <text class="fg-mxs" x="576" y="76">cnf.jkt · クライアントが生成する鍵</text>
    <path class="fg-edge" d="M248,96 V136" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="121">いいえ</text>
    <!-- 2 -->
    <rect class="fg-box" x="32" y="136" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="164">バックエンドは PKI 証明書を持っているか?</text>
    <text class="fg-xs" x="48" y="188">内部 CA を運用し、各サービスに発行している</text>
    <path class="fg-edge" d="M464,172 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="162" text-anchor="middle">はい</text>
    <rect class="fg-box" x="560" y="136" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="164">mTLS</text>
    <text class="fg-mxs" x="576" y="188">cnf.x5t#S256 · 発行済みの証明書</text>
    <path class="fg-edge" d="M248,208 V248" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="233">いいえ</text>
    <!-- 3 -->
    <rect class="fg-box" x="32" y="248" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="276">B2B・オープンバンキング・規制対象か?</text>
    <text class="fg-xs" x="48" y="300">制度やパートナーが証明書を求める場合がある</text>
    <path class="fg-edge" d="M464,284 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="274" text-anchor="middle">はい</text>
    <rect class="fg-box" x="560" y="248" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="276">mTLS、または両方</text>
    <text class="fg-xs" x="576" y="300">制度やパートナー標準を確認する</text>
    <path class="fg-edge" d="M248,320 V360" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="345">いいえ</text>
    <!-- 4 -->
    <rect class="fg-box" x="32" y="360" width="432" height="72" rx="8"/>
    <text class="fg-s" x="48" y="388">混在環境か?</text>
    <text class="fg-xs" x="48" y="412">SPA とバックエンドサービスが両方ある</text>
    <path class="fg-edge" d="M464,396 H560" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="512" y="386" text-anchor="middle">はい</text>
    <rect class="fg-box" x="560" y="360" width="368" height="72" rx="8"/>
    <text class="fg-t2" x="576" y="388">両方を有効化する</text>
    <text class="fg-xs" x="576" y="412">登録時に各クライアントがどちらかを選ぶ</text>
    <path class="fg-edge" d="M248,432 V472" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="260" y="457">いいえ</text>
    <!-- default -->
    <rect class="fg-box fg-box--accent" x="32" y="472" width="896" height="72" rx="8"/>
    <text class="fg-t2 fg-accent" x="48" y="500">迷ったら DPoP から始める</text>
    <text class="fg-xs" x="48" y="524">ネットワークにも PKI にも何も要求せず、あとから mTLS へ移すこともできます</text>
  </svg>
  <figcaption class="fig-note">どちらの方式も行き着く先は同じで、リソースサーバが照合する <code>cnf</code> claim です。問題は、全クライアントに現実的に配れる資格情報がどちらかという点だけです。自前で生成できる鍵か、誰かが発行して更新し続ける証明書か。</figcaption>
</figure>

選択は、既存インフラから自然に決まることが多いです:

- **SPA、モバイル、ブラウザ中心のクライアント →** DPoP。ブラウザはクライアント証明書を確実には提示できず、モバイルでの証明書プロビジョニングも UX が悪いためです。DPoP の鍵はメモリかプラットフォームのセキュアストレージに置けます。
- **ファーストパーティ API（両端を自分で制御） →** DPoP。運用負荷が低く、PKI が不要です。
- **内部 CA を運用済みのバックエンドサービス →** mTLS。既存 PKI を再利用でき、新しい鍵管理面を増やしません。
- **B2B サービスメッシュ、オープンバンキング、規制環境 →** 対象制度やパートナー標準が求める場合は mTLS。RFC 8705 はその上にトークンの結び付けを重ねます。
- **異種混在環境（SPA + バックエンド） →** 両方を有効化。OP が discovery で両方を出し、クライアントごとに使えるほうを選びます。

迷ったら DPoP を既定にしてください。前提となるインフラが少なく、より多くのクライアント環境に適用できます。

## さらに読む

- [DPoP (RFC 9449)](/ja/concepts/dpop) — proof の構造、リプレイ防御、`cnf.jkt`、サーバ nonce、公開 / confidential クライアントでのリフレッシュトークン結び付けの差。
- [mTLS (RFC 8705)](/ja/concepts/mtls) — サブモード（`tls_client_auth` と `self_signed_tls_client_auth`）、`cnf.x5t#S256`、リバースプロキシ構成。

## 次に読む

- [ユースケース: FAPI 2.0 Security Profile](/ja/use-cases/fapi2-baseline) — 送信者制約を有効化した完全な組み込み例。
- [DPoP nonce フロー](/ja/use-cases/dpop-nonce) — RFC 9449 §8 / §9 のサーバ供給 nonce パイプライン。
- [設計判断](/ja/security/design-judgments) — 公開 / confidential クライアントでのリフレッシュトークン結び付けの差を含む、解決済みの仕様間トレードオフ。
