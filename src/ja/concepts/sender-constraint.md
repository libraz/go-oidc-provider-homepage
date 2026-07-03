---
title: 送信者制約 — 選定ガイド
description: Bearer トークンと送信者制約付きトークン。DPoP と mTLS のどちらを選ぶかの判断軸。
---

# 送信者制約 — DPoP と mTLS の選び方

保護のない bearer トークンは **bearer-authoritative** です — バイト列を持つ者が API を呼べてしまいます。トークンが漏れると(ログ、中継 proxy、ブラウザ拡張、サードパーティ SDK)、漏らした側は有効期限まで全アクセス権を握ります。

**送信者制約付き** アクセストークンは、正規クライアントが保有する鍵にバインドされます。バイト列が漏れても、攻撃者は鍵を一緒に盗まないと使えません。本ページは選定ガイドです — それぞれの仕組みは [DPoP](/ja/concepts/dpop) と [mTLS](/ja/concepts/mtls) の専用ページに分かれています。

::: details トークン replay とは何か
攻撃者が漏洩した有効なアクセストークン(ログや侵害された proxy など)を、自分のマシンから再送して API を呼ぶ攻撃です。RS は構文的に有効なトークンを見て応答してしまいます。送信者制約があれば、攻撃者は対応する鍵も提示する必要があり、構造的に replay が成立しません。
:::

::: details proof-of-possession とは
「トークンのバイト列だけでなく、対応する鍵を保有していることを示してください」という考え方の総称です。DPoP / mTLS、それより古い holder-of-key トークンなどはすべて proof-of-possession 方式です。本ライブラリの DPoP / mTLS は、この考え方の現代的な OAuth ネイティブ実装になります。
:::

## 2026 年に bearer トークンを残すリスク

トークン漏洩は仮想の話ではありません:

- **ログ** — リバースプロキシのアクセスログ、アプリログ、observability パイプラインは、明示的に剥がさない限り `Authorization` ヘッダを残しがちです。ログに残った bearer は TTL いっぱい再利用できてしまいます。
- **ブラウザ拡張・SDK** — ブラウザ拡張はページと同じプロセス境界の中で動作するため、ページが付ける任意のヘッダを読めます。モバイル SDK もアプリと同じプロセス内に居ます。
- **侵害された中継** — CDN エッジや proxy が 1 つでも侵害されれば、そこを通るすべてのリクエストが攻撃者の手に渡ります。bearer トークンは収穫対象として最も価値があります。
- **stage-and-fire** — 開発者のマシンに一時的にアクセスできた攻撃者は、トークンをコピーして後日インターネット側から使えます。

構造的な解は、バイト列だけでは不十分にすることです。送信者制約は、すべてのリクエストを正規クライアントが保有する鍵に紐付けることでこれを達成します。漏洩自体は依然として起きますが、漏洩が API 侵害に繋がらなくなります。

::: tip 送信者制約と TLS の違い
TLS は通信路上のトークンを保護します。一度アプリ層(OP、RS、ロギング middleware、デバッグエンドポイント)に届いた bearer トークンは平文で、それらの場所のいずれかから漏れる可能性が残ります。送信者制約はトークンを end-to-end で守ります。
:::

## 本ライブラリの 2 つのバインド方式

**DPoP**(RFC 9449)は、クライアントがリクエスト毎に自分の鍵で署名する方式です。proof は小さな JWT(`htm`、`htu`、`iat`、`jti`、任意の `ath` と `nonce`)で、HTTP ヘッダ `DPoP:` に乗せます。プレーン HTTPS で動作し、TLS クライアント証明書を要しません。詳細は [DPoP](/ja/concepts/dpop) を参照してください。

**mTLS**(RFC 8705)は、TLS ハンドシェイクで提示した X.509 証明書にトークンをバインドする方式です。OP は証明書の SHA-256 thumbprint を `cnf.x5t#S256` として発行 token に書き込み、リソースサーバは観測した証明書の thumbprint を照合します。詳細は [mTLS](/ja/concepts/mtls) を参照してください。

## 比較

| 観点 | DPoP | mTLS |
|---|---|---|
| 仕様 | RFC 9449 | RFC 8705 |
| 鍵媒体 | クライアントが保持する秘密鍵(署名できる任意の機器) | クライアント TLS 証明書(PKI 発行 / 自己署名) |
| ブラウザ対応 | 可(SPA、モバイル、JWT を署名できるあらゆる主体) | 弱 — ブラウザはクライアント証明書を実用的に提示できない |
| リクエスト毎の追加成果物 | アプリ側で署名する fresh な JWS proof | なし(TLS 層でバインド) |
| proxy / TLS 終端への依存 | なし — プレーン HTTPS で動く | 終端側が証明書をヘッダで前送りする必要あり |
| `cnf` メンバ | `cnf.jkt`(JWK thumbprint) | `cnf.x5t#S256`(X.509 thumbprint) |
| リフレッシュトークンバインド既定 | public はバインド、confidential は非バインド([設計判断 #15](/ja/security/design-judgments#dj-15)) | クライアントが token endpoint で mTLS を使ったときにバインド |
| バインドを越えた replay 防御 | `jti` キャッシュ、`iat` 窓、任意のサーバ nonce | TLS セッション再利用 + 証明書 thumbprint 照合 |
| FAPI 2.0 Baseline 受理 | 可 | 可 |
| FAPI 2.0 Message Signing | 可(§8 / §9 nonce 併用) | 可 |

FAPI 2.0 Baseline は **どちらか一方** での送信者制約付きトークンを要求し、本ライブラリは両方を受理します。`op.WithProfile(profile.FAPI2Baseline)` は `[feature.DPoP, feature.MTLS]` に対する `RequiredAnyOf` を課します。どちらも有効化されていなければ構築時に `feature.DPoP` を既定メンバーとして選びます。`feature.MTLS` を明示している場合はそれで制約を満たすため、DPoP は追加されません。

## 使い分けの指針

<style scoped>
.sc-tree text{stroke:none;fill:currentColor;}
.sc-tree .t-start{font-family:var(--vp-font-family-base);font-size:12px;font-weight:600;}
.sc-tree .t-q{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;}
.sc-tree .t-sub{font-family:var(--vp-font-family-base);font-size:11px;fill:var(--vp-c-text-2);}
.sc-tree .t-out{font-family:var(--vp-font-family-base);font-size:14px;font-weight:700;}
.sc-tree .t-mono{font-family:var(--vp-font-family-mono);font-size:11px;}
.sc-tree .t-edge{font-family:var(--vp-font-family-base);font-size:11px;font-weight:600;fill:var(--vp-c-text-3);}
.sc-tree .op-accent{stroke:var(--vp-c-brand-2);}
.sc-tree .op-fill{fill:var(--vp-c-brand-2);}
.sc-tree .rs-stroke{stroke:var(--vp-c-text-3);}
.sc-tree .rs-fill{fill:var(--vp-c-text-3);}
</style>

<svg class="sc-tree" role="img" aria-labelledby="sc-choose-tree-title" viewBox="0 0 710 490" style="width:100%;height:auto;max-width:710px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="sc-choose-tree-title">送信者制約を選ぶための決定木。ブラウザ中心のクライアントは DPoP、PKI 証明書を持つバックエンドは mTLS、B2B や規制環境は mTLS または両方、異種混在環境は両方を有効化し、迷ったら既定は DPoP。</title>
  <rect x="60" y="8" width="230" height="36" rx="8"/>
  <text class="t-start" x="175" y="30" text-anchor="middle">送信者制約の選び方</text>
  <line x1="175" y1="44" x2="175" y2="64"/>
  <path d="M171,57 L175,64 L179,57"/>
  <rect x="20" y="64" width="310" height="54" rx="8"/>
  <text class="t-q" x="175" y="87" text-anchor="middle">ブラウザ中心のクライアント?</text>
  <text class="t-sub" x="175" y="104" text-anchor="middle">SPA / モバイル / public クライアント</text>
  <line x1="330" y1="91" x2="440" y2="91"/>
  <path d="M433,87 L440,91 L433,95"/>
  <text class="t-edge" x="385" y="85" text-anchor="middle">はい</text>
  <rect class="op-accent" x="440" y="67" width="250" height="48" rx="8"/>
  <text class="t-out op-fill" x="565" y="88" text-anchor="middle">DPoP</text>
  <text class="t-mono op-fill" x="565" y="104" text-anchor="middle">cnf.jkt</text>
  <line x1="175" y1="118" x2="175" y2="154"/>
  <path d="M171,147 L175,154 L179,147"/>
  <text class="t-edge" x="188" y="139" text-anchor="start">いいえ</text>
  <rect x="20" y="154" width="310" height="54" rx="8"/>
  <text class="t-q" x="175" y="177" text-anchor="middle">PKI 証明書を持つバックエンド?</text>
  <text class="t-sub" x="175" y="194" text-anchor="middle">内部 CA を運用している</text>
  <line x1="330" y1="181" x2="440" y2="181"/>
  <path d="M433,177 L440,181 L433,185"/>
  <text class="t-edge" x="385" y="175" text-anchor="middle">はい</text>
  <rect class="rs-stroke" x="440" y="157" width="250" height="48" rx="8"/>
  <text class="t-out rs-fill" x="565" y="178" text-anchor="middle">mTLS</text>
  <text class="t-mono rs-fill" x="565" y="194" text-anchor="middle">cnf.x5t#S256</text>
  <line x1="175" y1="208" x2="175" y2="244"/>
  <path d="M171,237 L175,244 L179,237"/>
  <rect x="20" y="244" width="310" height="54" rx="8"/>
  <text class="t-q" x="175" y="267" text-anchor="middle">B2B・オープンバンキング・規制環境?</text>
  <text class="t-sub" x="175" y="284" text-anchor="middle">ネットワーク層が既に要求</text>
  <line x1="330" y1="271" x2="440" y2="271"/>
  <path d="M433,267 L440,271 L433,275"/>
  <text class="t-edge" x="385" y="265" text-anchor="middle">はい</text>
  <rect class="rs-stroke" x="440" y="247" width="250" height="48" rx="8"/>
  <text class="t-out rs-fill" x="565" y="268" text-anchor="middle">mTLS(または両方)</text>
  <text class="t-sub" x="565" y="284" text-anchor="middle">規制が要求</text>
  <line x1="175" y1="298" x2="175" y2="334"/>
  <path d="M171,327 L175,334 L179,327"/>
  <rect x="20" y="334" width="310" height="54" rx="8"/>
  <text class="t-q" x="175" y="357" text-anchor="middle">異種混在環境?</text>
  <text class="t-sub" x="175" y="374" text-anchor="middle">SPA とバックエンドが混在</text>
  <line x1="330" y1="361" x2="440" y2="361"/>
  <path d="M433,357 L440,361 L433,365"/>
  <text class="t-edge" x="385" y="355" text-anchor="middle">はい</text>
  <rect x="440" y="337" width="250" height="48" rx="8"/>
  <text class="t-out" x="565" y="358" text-anchor="middle">両方</text>
  <text class="t-sub" x="565" y="374" text-anchor="middle">各クライアントが選択</text>
  <line x1="175" y1="388" x2="175" y2="424"/>
  <path d="M171,417 L175,424 L179,417"/>
  <rect class="op-accent" x="20" y="424" width="310" height="48" rx="8"/>
  <text class="t-out op-fill" x="175" y="453" text-anchor="middle">迷ったら DPoP を既定に</text>
</svg>

選択は、既存インフラから自然に決まることが多いです:

- **SPA、モバイル、ブラウザ中心のクライアント →** DPoP。ブラウザはクライアント証明書を確実には提示できず、モバイルでの証明書プロビジョニングも UX が悪いためです。DPoP の鍵はメモリかプラットフォームのセキュアストレージに置けます。
- **ファーストパーティ API(両端を自分で制御) →** DPoP。運用負荷が低く、PKI が不要です。
- **内部 CA を運用済みのバックエンドサービス →** mTLS。既存 PKI を再利用でき、新しい鍵管理面を増やしません。
- **B2B サービスメッシュ、オープンバンキング、規制環境 →** mTLS。多くのケースで規制側がネットワーク層で既に mTLS を要求しており、RFC 8705 はその上に token バインドを重ねるだけで済みます。
- **異種混在環境(SPA + バックエンド) →** 両方を有効化。OP が discovery で両方を出し、クライアントごとに使えるほうを選びます。

迷ったら DPoP を既定にしてください。前提となるインフラが少なく、どのクライアント環境でも動きます。

## さらに読む

- [DPoP (RFC 9449)](/ja/concepts/dpop) — proof の構造、replay 防御、`cnf.jkt`、サーバ nonce、public / confidential での refresh バインド差。
- [mTLS (RFC 8705)](/ja/concepts/mtls) — サブモード(`tls_client_auth` と `self_signed_tls_client_auth`)、`cnf.x5t#S256`、リバースプロキシ構成。

## 次に読む

- [ユースケース: FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — 送信者制約を有効化した完全な組み込み例。
- [DPoP nonce フロー](/ja/use-cases/dpop-nonce) — RFC 9449 §8 / §9 のサーバ供給 nonce パイプライン。
- [設計判断](/ja/security/design-judgments) — public / confidential での refresh バインド差を含む、解決済みの仕様間トレードオフ。
