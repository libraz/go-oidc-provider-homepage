---
title: DPoP (RFC 9449)
description: Demonstrating Proof of Possession — クライアントが保有する鍵にアクセストークン（任意でリフレッシュトークンも）を結び付け、漏洩したトークン単体では使えなくする方式。
pageClass: pg-concepts-dpop
---

# DPoP — Demonstrating Proof of Possession

**DPoP**（RFC 9449）は、クライアントが保有する鍵にアクセストークンを結び付ける仕組みです。同じ鍵で署名された新しい証明（DPoP proof）が無ければ、漏洩したアクセストークンは使えません。API 呼び出しごとに小さな JWT が同行し、OP とリソースサーバはトークンと合わせてこの証明も検証します。

DPoP は HTTP 層だけで完結する方式です。クライアントは TLS クライアント証明書を持つ必要がなく、OP もリバースプロキシのヘッダ仕様を意識する必要がありません。SPA・モバイル・バックエンドのいずれでも同じ流れが使えます。この移植性の高さが、FAPI 2.0 Security Profile が DPoP を送信者制約付きトークンの 2 つの選択肢の片方として認める理由です（もう片方は [mTLS](/ja/concepts/mtls)）。Security Profile の対象は confidential client なので、後半の公開クライアントの例は本ライブラリの一般的な OAuth 動作として説明します。

::: details このページで触れる仕様
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP (Demonstrating Proof of Possession)
- [RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638) — JWK Thumbprint
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — Final
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-message-signing-2_0.html) — Final
:::

## DPoP proof の仕組み

DPoP proof はクライアントが保有する秘密鍵で署名した JWT（RFC 9449 §4）です。リクエストごとに新しい proof を生成します。

**JOSE ヘッダ**

| フィールド | 値 |
|---|---|
| `typ` | `dpop+jwt`（必須） |
| `alg` | `ES256` / `EdDSA` / `PS256`（本ライブラリの許可リスト、`internal/dpop/proof.go` 参照） |
| `jwk` | 署名鍵の公開鍵部分。ヘッダに同梱 |

**ペイロード claim**

| Claim | 意味 |
|---|---|
| `htm` | リクエストの HTTP メソッド（`POST`、`GET` など）。この 1 リクエストに固定。 |
| `htu` | クエリと fragment を取り除いたリクエスト URL。`/orders` 用 proof を `/admin/payouts` で再利用することを防ぎます。 |
| `iat` | proof 署名時刻。OP の鮮度判定窓（既定 60 秒）外は拒否。 |
| `jti` | proof ごとの一意な乱数値。OP は鮮度判定窓の間 `jti` をキャッシュし、同じ proof の再利用を防ぎます。 |
| `ath` | 任意。アクセストークンの SHA-256。proof がアクセストークンと組で提示される場合は必須（RFC 9449 §4.2）。 |
| `nonce` | 任意。OP が §8 / §9 の nonce フローを運用しているときにサーバから供給される値。 |

<figure class="fig">
  <div class="fig-head">リクエストごとに 1 つの proof を、2 か所で検証する</div>
  <svg class="fig-svg" role="img" aria-labelledby="dpop-proof-flow-title" viewBox="0 0 960 476" xmlns="http://www.w3.org/2000/svg">
    <title id="dpop-proof-flow-title">DPoP proof の一連の流れ。クライアントはリクエストごとに新しい proof を署名し、OP はそれを検証して鍵の thumbprint を cnf.jkt としてアクセストークンに書き込みます。リソースサーバは後続の proof を同じ結び付きと照合します。</title>
    <!-- ライフライン -->
    <line class="fg-life" x1="150" y1="62" x2="150" y2="462"/>
    <line class="fg-life fg-life--accent" x1="500" y1="62" x2="500" y2="462"/>
    <line class="fg-life" x1="830" y1="62" x2="830" y2="462"/>
    <!-- 登場人物 -->
    <rect class="fg-box" x="60" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="150" y="35" text-anchor="middle">RP / クライアント</text>
    <text class="fg-mxs" x="150" y="49" text-anchor="middle">priv_dpop を保有</text>
    <rect class="fg-box fg-box--accent" x="410" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t fg-accent" x="500" y="35" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="500" y="49" text-anchor="middle">go-oidc-provider</text>
    <rect class="fg-box" x="740" y="16" width="180" height="42" rx="6"/>
    <text class="fg-t" x="830" y="35" text-anchor="middle">リソースサーバ</text>
    <text class="fg-xs" x="830" y="49" text-anchor="middle">結び付きを再検証する</text>
    <!-- 1 -->
    <circle class="fg-badge" cx="15" cy="107" r="8.5"/>
    <text class="fg-badge-t" x="15" y="110" text-anchor="middle">1</text>
    <path class="fg-edge" d="M150,98 h30 v18 h-30" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="192" y="102">DPoP proof を構築して署名する</text>
    <text class="fg-mxs" x="192" y="115">jti · htm:POST · htu:/token · iat</text>
    <text class="fg-mxs" x="192" y="128">typ: dpop+jwt · alg: ES256 · jwk</text>
    <!-- 2 -->
    <circle class="fg-badge" cx="15" cy="162" r="8.5"/>
    <text class="fg-badge-t" x="15" y="165" text-anchor="middle">2</text>
    <path class="fg-edge" d="M150,162 H500" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="325" y="156" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <!-- 3 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="194" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="197" text-anchor="middle">3</text>
    <path class="fg-edge fg-edge--accent" d="M500,186 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s" x="542" y="190">proof を検証する</text>
    <text class="fg-mxs" x="542" y="203">typ/alg/jwk · htm/htu · iat · jti · nonce</text>
    <!-- 4 -->
    <circle class="fg-badge fg-badge--accent" cx="15" cy="240" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="243" text-anchor="middle">4</text>
    <path class="fg-edge fg-edge--accent" d="M500,232 h30 v16 h-30" marker-end="url(#fg-ac)"/>
    <text class="fg-s fg-accent" x="542" y="236">鍵をトークンに結び付ける</text>
    <text class="fg-mxs" x="542" y="249">cnf.jkt = JWK の SHA-256 thumbprint</text>
    <!-- 5 -->
    <circle class="fg-badge" cx="15" cy="286" r="8.5"/>
    <text class="fg-badge-t" x="15" y="289" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M500,286 H150" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="325" y="280" text-anchor="middle">200 · access_token · token_type: DPoP</text>
    <!-- 6 -->
    <circle class="fg-badge" cx="15" cy="320" r="8.5"/>
    <text class="fg-badge-t" x="15" y="323" text-anchor="middle">6</text>
    <path class="fg-edge" d="M150,312 h30 v16 h-30" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="192" y="316">API 呼び出し用に新しい proof を作る</text>
    <text class="fg-mxs" x="192" y="329">こちらには ath = SHA-256(access_token) も載る</text>
    <!-- 7 -->
    <circle class="fg-badge" cx="15" cy="378" r="8.5"/>
    <text class="fg-badge-t" x="15" y="381" text-anchor="middle">7</text>
    <path class="fg-edge" d="M150,378 H830" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="490" y="358" text-anchor="middle">GET /api</text>
    <text class="fg-mxs fg-halo" x="490" y="371" text-anchor="middle">Authorization: DPoP &lt;token&gt; · DPoP: &lt;proof&gt;</text>
    <!-- 8 -->
    <circle class="fg-badge" cx="15" cy="412" r="8.5"/>
    <text class="fg-badge-t" x="15" y="415" text-anchor="middle">8</text>
    <path class="fg-edge" d="M830,404 h-30 v16 h30" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="788" y="408" text-anchor="end">proof を検証し、続けて結び付きを検証する</text>
    <text class="fg-mxs" x="788" y="421" text-anchor="end">cnf.jkt == thumbprint(proof.jwk)</text>
    <!-- 9 -->
    <circle class="fg-badge" cx="15" cy="456" r="8.5"/>
    <text class="fg-badge-t" x="15" y="459" text-anchor="middle">9</text>
    <path class="fg-edge" d="M830,456 H150" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="490" y="450" text-anchor="middle">200 OK</text>
  </svg>
  <figcaption class="fig-note">手順 5 で返るトークンは単体では役に立ちません。<code>cnf.jkt</code> の元になった鍵で署名した proof が無ければ手順 8 で落ちます。リクエストごとに署名が 1 つ増える代わりに、盗まれたトークンが無価値になる — これがこの仕組みの取引です。</figcaption>
</figure>

OP とリソースサーバは同じチェックリストを通します。リソースサーバは加えて、proof の `jwk` の指紋（thumbprint）がアクセストークンの `cnf.jkt` と一致することも確認します。

DPoP 付きアクセストークンは `Authorization: DPoP <token>` で提示する必要があります。`Authorization: Bearer <token>` ではありません。OP は `/userinfo` でこれを強制します。送信者制約付きトークンを Bearer scheme で提示した場合、トークンのバイト列自体が有効でも拒否されます。RFC 9449 §7.1 では scheme も proof-of-possession 契約の一部だからです。

`DPoP` proof ヘッダは 1 つだけでなければなりません。`DPoP` ヘッダが複数ある場合は、先頭が空で後続に有効な proof がある場合も含め、OP は拒否します。後続の値だけを選んだり、黙って bearer 経路へフォールバックしたりはしません。共有ゲートは `/par`、`/token`、`/device_authorization`、`/bc-authorize`（CIBA）でこの規則を適用し、`/userinfo` の proof 検証も同じ規則に従います。

## Confirmation claim — `cnf.jkt`

`/token` で最初に提示された proof が、どの鍵に結び付けるかを確定させます。OP は proof の `jwk` の RFC 7638 JWK thumbprint（SHA-256 ハッシュの対象となる JWK フィールドを RFC 7638 が正準化）を計算し、アクセストークンに `cnf.jkt` として書き込みます。以後、このアクセストークンを使うリクエストはすべて **同じ鍵** で署名された proof を提示する必要があり、リソースサーバは thumbprint を再計算して照合します。

`cnf` 自体は単なる JSON object で、その内側の **メンバ名** が「どの種類の結び付きか」を示します（RFC 7800）。DPoP では `jkt`、mTLS では `x5t#S256` を使います。1 つのトークンに両方のメンバを持たせることもできます。両方の結び付きがある場合、利用側 endpoint は両方を満たすように検証します。つまり DPoP proof は `jkt` に、提示証明書は `x5t#S256` に一致しなければなりません。本ライブラリは `/userinfo` でこの conjunction を適用し、device-code と CIBA の grant binding でも記録されたすべての方式を要求します。

::: details なぜ鍵そのものではなく thumbprint なのか
thumbprint は JSON 再エンコードを跨いでも安定する、短い識別子です。RFC 7638 が「JWK のどのフィールドを、どの順でハッシュするか」を厳密に規定しているので、クライアントとサーバは同じ鍵に対して同じハッシュ値を計算できます。鍵そのものを埋め込むとアクセストークンが大きくなりますが、thumbprint なら 32 byte（base64url で 43 文字）で済みます。
:::

## Replay 防御

DPoP は独立した 4 つの検査を重ね、proof 1 通を盗み出した攻撃者に何の利益もないようにします:

- **`jti` 重複排除。** OP は受理した proof の `jti` を `store.ConsumedJTIStore.Mark` に通します（`internal/dpop/verify.go`）。鮮度判定窓の中で同じ `jti` が再提示されると `ErrProofReplayed` を返してリクエストは失敗します。この store は PAR / JAR のリプレイ防御で使う store と共通なので、Redis サブストア 1 つで全部をカバーできます。
- **`iat` 窓。** 対称 60 秒の鮮度判定窓より古いか未来すぎる proof は `ErrProofIatWindow` で拒否されます。短く取ることに意味があり、`jti` キャッシュが消えても盗まれた proof が使える時間を限定します。
- **`htm` + `htu` 一致。** あるメソッド・URL 用の proof は別エンドポイントで提示できません。OP は両側を RFC 9449 §4.3 の正準形（scheme / host を小文字化、デフォルトポートを除去、クエリ・fragment を除去）に揃えてから比較します。
- **`ath` による結び付き。** proof がアクセストークンと組で提示される場合、proof は `ath = SHA-256(access_token)` を持つ必要があります。別のアクセストークン用の proof は `ErrProofATHMismatch` で失敗します。

これら全体で、正規クライアントですら一度使った proof を再利用できなくなります。proof の束を盗み出した攻撃者は `jti` キャッシュに弾かれ、アクセストークンを盗み出した攻撃者は鍵が無いので proof を作れず、あるエンドポイント用に作った proof を別エンドポイントに転用することもできません。

## サーバ供給 nonce (RFC 9449 §8 / §9)

ここまで述べた 4 つの claim はいずれもクライアントの時計に依存します。クライアントが一時的に侵害された場合、`iat` 窓いっぱいの間有効な proof を事前生成して持ち出される可能性があります。RFC 9449 §8 / §9 はサーバ供給 nonce でこの穴を塞ぎます。

`DPoPNonceSource` を構成すると、OP は応答ヘッダ `DPoP-Nonce` で新しい nonce を発行します。次の proof はこれを `nonce` claim に含めなければなりません。攻撃者は次回の nonce を予測できないため、事前計算した proof は即座に無効化されます。

本ライブラリには単一プロセス用の in-memory 参照実装（`op.NewInMemoryDPoPNonceSource`）が同梱されています。マルチレプリカの HA 構成では、共有 store を持つ自前の `DPoPNonceSource` を差し込みます。Final の FAPI 2.0 Security Profile と Message Signing 仕様では DPoP nonce は任意です。本ライブラリで `DPoPNonceSource` を構成すると、nonce チャレンジと検証のフローが有効になります。本ライブラリの validator は `profile.FAPI2MessageSigning` と DPoP を併用する場合にこの source を要求しますが、Final Message Signing 仕様の要件ではありません。

組み込み手順、ローテーションのパイプライン、複数インスタンス運用の注意点は[DPoP nonce フロー](/ja/use-cases/dpop-nonce)に詳しく書いています。

## 本ライブラリが何を結び付けるか

アクセストークンは、`feature.DPoP` が有効でクライアントが `/token` で proof を提示した場合（あるいは authorize / PAR 要求で `dpop_jkt` により鍵を事前確約した場合）、常に DPoP に結び付けられます。以下のリフレッシュトークンの扱いはライブラリの方針です。Final の FAPI 2.0 Security Profile は例外的な状況を除く通常のリフレッシュトークンローテーションを禁止するため、適合性を主張する前に本ライブラリの通常動作を確認してください。

リフレッシュトークンは[設計判断 #15](/ja/security/design-judgments#dj-15)に従います。公開クライアントには結び付け、confidential クライアントには結び付けません:

- **公開クライアント**（`token_endpoint_auth_method = "none"`、典型的には SPA とネイティブアプリ）では、リフレッシュトークンの連鎖は最初の発行で DPoP に結び付けられ、RFC 9449 §5.4 の規則に従って以降のローテーションでも結び付きが継承されます。鍵が無ければリフレッシュトークン単体は無価値で、これはまさに RFC 9449 §1 が想定する脅威モデルです。
- **Confidential クライアント**（`private_key_jwt`、`client_secret_*`）では、リフレッシュトークンの連鎖は結び付けません。リクエストごとに DPoP 鍵をローテーションでき（OFCS の plan がこの動作を検証しています）、連鎖が生きている間ずっと 1 つの鍵に縛られることはありません。各リフレッシュで発行されるアクセストークンは、その交換時に提示された鍵に結び付けられ続けるので、漏洩面はアクセストークンに限定されます。

トレードオフは明示的です。confidential クライアントは鍵ローテーションの自由度を得る代わりに、リフレッシュトークンの連鎖を保護のない bearer のまま残します。token endpoint のクレデンシャルは別の制御であり、共有シークレットの場合もあるため、リフレッシュトークンの漏洩には保管、通信、運用面の対策が必要です。

## `dpop_jkt` リクエストパラメータ

RFC 9449 §10 では、クライアントが authorize 要求（または PAR 要求）に `dpop_jkt=<thumbprint>` を含めることで、発行されるアクセストークンの結び付き先 DPoP 鍵を **事前確約** できます。攻撃者が自分の鍵で code を交換するタイプの code-substitution 攻撃の窓を塞ぎます。FAPI 2.0 Security Profile はクライアントにこのパラメータの送信を必須としていませんが、DPoP を使う認可サーバは Authorization Code Binding to DPoP Key に対応する必要があります。PKCE で動かす公開クライアントは PAR + token endpoint での DPoP に頼るのが一般的です。

本ライブラリは `dpop_jkt` を PAR（`internal/parendpoint/par.go`）で取り扱います。PAR 要求が DPoP proof を伴っていれば、OP はその thumbprint をスナップショットに刻み、別の鍵で来る `/token` 交換を拒否します。

## 実装例

DPoP のみの最小構成:

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

op.New(
  /* 必須オプション */
  op.WithFeature(feature.DPoP),
)
```

§8 / §9 nonce フローを併用する場合:

```go
import (
  "context"
  "time"

  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/feature"
)

src, err := op.NewInMemoryDPoPNonceSource(ctx, 5*time.Minute)
if err != nil { /* ... */ }

op.New(
  /* 必須オプション */
  op.WithFeature(feature.DPoP),
  op.WithDPoPNonceSource(src),
)
```

`op.WithProfile(profile.FAPI2Baseline)` はライブラリ設定として PAR と JAR を自動有効化したうえで、`feature.DPoP` と `feature.MTLS` に対する `RequiredAnyOf` 制約を課します。JAR は Final Security Profile では任意です。どちらの送信者制約も指定されていなければ、`op.New` は DPoP を既定メンバーとして選びます。`feature.MTLS` を明示している場合はそれで制約を満たすため、DPoP は追加されません。

## DPoP が向いているケース

- **SPA とモバイルアプリ** — クライアントはメモリやプラットフォームのセキュアストレージに鍵を保持できます。CA インフラは不要。
- **ファーストパーティ API** — RP と RS の両方を自分で制御する場面では、PKI 運用と調整しなくても DPoP を導入できます。
- **多様なクライアントが同居する環境** — DPoP はプレーン HTTPS で動作するため、TLS 終端を触らずに展開できます。
- **ログ・プロキシ経由の漏洩対策** — 送信者制約と `jti` キャッシュ・`iat` 窓が組み合わさり、トークン漏洩そのものを構造的に無価値にします。

## DPoP が向かないケース

- **既存 PKI を持つバックエンドサービス** — すべてのサービスが内部 CA 発行のクライアント証明書を既に持っている場合、[mTLS](/ja/concepts/mtls)で同じ基盤を再利用するほうが、新しい鍵管理面を増やさずに済みます。
- **リクエストごとの署名コストを許容できないクライアント** — API 呼び出しごとに JWS 1 通の署名コストが発生します。1 本のチャネルを使い回す制約デバイスは、TLS 層で結び付ける mTLS のほうが向くことがあります。
- **既に mTLS 一択で標準化された規制環境** — 一部のオープンバンキング地域では、ネットワーク層で mTLS のみを許容しています。DPoP を上から重ねる前にローカルプロファイルを確認してください。

## 次に読む

- [mTLS (RFC 8705)](/ja/concepts/mtls) — もう一方の送信者制約方式。TLS 証明書に結び付けます。
- [送信者制約 — 選定ガイド](/ja/concepts/sender-constraint) — 比較表と使い分けの指針。
- [DPoP nonce フロー](/ja/use-cases/dpop-nonce) — §8 / §9 nonce パイプラインの詳細な組み込み手順。
- [設計判断](/ja/security/design-judgments) — 公開 / confidential クライアントでのリフレッシュトークン結び付けの差を含む、解決済みの仕様間トレードオフ。
