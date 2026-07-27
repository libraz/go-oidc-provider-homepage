---
title: DPoP (RFC 9449)
description: Demonstrating Proof of Possession — クライアントが保有する鍵にアクセストークン（任意でリフレッシュトークンも）を結び付け、漏洩したトークン単体では使えなくする方式。
pageClass: pg-concepts-dpop
---

# DPoP — Demonstrating Proof of Possession

**DPoP**（RFC 9449）は、クライアントが保有する鍵にアクセストークンを結び付ける仕組みです。同じ鍵で署名された新しい証明（DPoP proof）が無ければ、漏洩したアクセストークンは使えません。API 呼び出しごとに小さな JWT が同行し、OP とリソースサーバはトークンと合わせてこの証明も検証します。

DPoP は HTTP 層だけで完結する方式です。クライアントは TLS クライアント証明書を持つ必要がなく、OP もリバースプロキシのヘッダ仕様を意識する必要がありません。SPA・モバイル・バックエンドのいずれでも同じ流れが使えます。この移植性の高さが、FAPI 2.0 Baseline が DPoP を送信者制約付きトークンの 2 つの選択肢の片方として認める理由です（もう片方は[mTLS](/ja/concepts/mtls)）。

::: details このページで触れる仕様
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP (Demonstrating Proof of Possession)
- [RFC 7638](https://datatracker.ietf.org/doc/html/rfc7638) — JWK Thumbprint
- [RFC 7800](https://datatracker.ietf.org/doc/html/rfc7800) — Confirmation (`cnf`) claim
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html)
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html)
:::

## DPoP proof の仕組み

DPoP proof はクライアントが保有する秘密鍵で署名した JWT（RFC 9449 §4）です。リクエストごとに新しい proof を生成します。

**JOSE ヘッダ**

| フィールド | 値 |
|---|---|
| `typ` | `dpop+jwt`(必須) |
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

<svg class="dpop-flow-dg" role="img" aria-labelledby="dpop-proof-flow-title" viewBox="0 0 760 556" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="dpop-proof-flow-title">DPoP proof のシーケンス: クライアントがリクエストごとに proof を署名し、OP がアクセストークンに cnf.jkt を書き込み、リソースサーバがその値と proof を照合する。</title>
  <line class="life" x1="110" y1="68" x2="110" y2="540"/>
  <line class="life op-accent" x1="380" y1="68" x2="380" y2="540"/>
  <line class="life rs-stroke" x1="650" y1="68" x2="650" y2="540"/>
  <rect x="35" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="305" y="14" width="150" height="30" rx="5"/>
  <rect class="rs-stroke" x="575" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="110" y="33" text-anchor="middle">RP / クライアント</text>
  <text class="d-actor op-fill" x="380" y="33" text-anchor="middle">OP</text>
  <text class="d-actor rs-fill" x="650" y="33" text-anchor="middle">リソースサーバ</text>
  <text class="d-cap" x="110" y="58" text-anchor="middle">priv_dpop を保有</text>
  <text class="d-cap op-fill" x="380" y="58" text-anchor="middle">本ライブラリ</text>
  <text class="d-cap rs-fill" x="650" y="58" text-anchor="middle">結び付きを検証</text>
  <path d="M110,99 h16 v12 h-16"/>
  <path d="M117,107 L110,111 L117,115"/>
  <text class="d-prose" x="134" y="96">DPoP proof を構築・署名</text>
  <text class="d-mono" x="134" y="108">jti · htm:POST · htu:/token · iat</text>
  <text class="d-mono" x="134" y="120">hdr: typ dpop+jwt · alg ES256 · jwk</text>
  <path d="M110,160 H380"/>
  <path d="M373,156 L380,160 L373,164"/>
  <text class="d-mono" x="245" y="152" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
  <path class="op-accent" d="M380,199 h16 v12 h-16"/>
  <path class="op-accent" d="M387,207 L380,211 L387,215"/>
  <text class="d-prose op-fill" x="404" y="201">proof を検証</text>
  <text class="d-mono" x="404" y="213">typ/alg/jwk, htm/htu, iat, jti, nonce</text>
  <path class="op-accent" d="M380,252 h16 v12 h-16"/>
  <path class="op-accent" d="M387,260 L380,264 L387,268"/>
  <text class="d-prose op-fill" x="404" y="254">アクセストークンに鍵を結び付ける</text>
  <text class="d-mono" x="404" y="266">cnf.jkt = SHA-256(jwk thumbprint)</text>
  <path d="M380,312 H110"/>
  <path d="M117,308 L110,312 L117,316"/>
  <text class="d-mono" x="245" y="304" text-anchor="middle">200 · access_token · token_type: DPoP</text>
  <path d="M110,351 h16 v12 h-16"/>
  <path d="M117,359 L110,363 L117,367"/>
  <text class="d-prose" x="134" y="353">API 呼び出し用に新しい proof</text>
  <text class="d-mono" x="134" y="365">adds ath = SHA-256(access_token)</text>
  <path d="M110,417 H650"/>
  <path d="M643,413 L650,417 L643,421"/>
  <text class="d-mono" x="380" y="409" text-anchor="middle">GET /api · Authorization: DPoP · DPoP: &lt;proof&gt;</text>
  <path class="rs-stroke" d="M650,456 h-16 v12 h16"/>
  <path class="rs-stroke" d="M643,464 L650,468 L643,472"/>
  <text class="d-prose rs-fill" x="626" y="458" text-anchor="end">proof を検証</text>
  <text class="d-mono" x="626" y="470" text-anchor="end">+ cnf.jkt == proof.jwk thumbprint</text>
  <path d="M650,520 H110"/>
  <path d="M117,516 L110,520 L117,524"/>
  <text class="d-mono" x="380" y="512" text-anchor="middle">200 OK</text>
</svg>

OP とリソースサーバは同じチェックリストを通します。リソースサーバは加えて、proof の `jwk` の指紋（thumbprint）がアクセストークンの `cnf.jkt` と一致することも確認します。

DPoP 付きアクセストークンは `Authorization: DPoP <token>` で提示する必要があります。`Authorization: Bearer <token>` ではありません。OP は `/userinfo` でこれを強制します。送信者制約付きトークンを Bearer scheme で提示した場合、トークンのバイト列自体が有効でも拒否されます。RFC 9449 §7.1 では scheme も proof-of-possession 契約の一部だからです。

## Confirmation claim — `cnf.jkt`

`/token` で最初に提示された proof が、どの鍵に結び付けるかを確定させます。OP は proof の `jwk` の SHA-256 指紋（thumbprint。RFC 7638 がハッシュ対象とする JWK フィールドを正準化しています）を計算し、アクセストークンに `cnf.jkt` として書き込みます。以後、このアクセストークンを使うリクエストはすべて **同じ鍵** で署名された proof を提示する必要があり、リソースサーバは指紋を再計算して照合します。

`cnf` 自体は単なる JSON object で、その内側の **メンバ名** が「どの種類の結び付きか」を示します（RFC 7800）。DPoP では `jkt` を使い、mTLS は `x5t#S256` を使います — 同じトークン上に両方が同居することはありません。

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

本ライブラリには単一プロセス用の in-memory 参照実装（`op.NewInMemoryDPoPNonceSource`）が同梱されています。マルチレプリカの HA 構成では、共有 store を持つ自前の `DPoPNonceSource` を差し込みます。FAPI 2.0 Message Signing は nonce を必須化し、Baseline は許可します。

組み込み手順、ローテーションのパイプライン、複数インスタンス運用の注意点は[DPoP nonce フロー](/ja/use-cases/dpop-nonce)に詳しく書いています。

## 本ライブラリが何を結び付けるか

アクセストークンは、`feature.DPoP` が有効でクライアントが `/token` で proof を提示した場合（あるいは authorize / PAR 要求で `dpop_jkt` により鍵を事前確約した場合）、常に DPoP に結び付けられます。

リフレッシュトークンは[設計判断 #15](/ja/security/design-judgments#dj-15)に従います。公開クライアントには結び付け、confidential クライアントには結び付けません:

- **公開クライアント**（`token_endpoint_auth_method = "none"`、典型的には SPA とネイティブアプリ）では、リフレッシュトークンの連鎖は最初の発行で DPoP に結び付けられ、RFC 9449 §5.4 の規則に従って以降のローテーションでも結び付きが継承されます。鍵が無ければリフレッシュトークン単体は無価値で、これはまさに RFC 9449 §1 が想定する脅威モデルです。
- **Confidential クライアント**（`private_key_jwt`、`client_secret_*`）では、リフレッシュトークンの連鎖は結び付けません。リクエストごとに DPoP 鍵をローテーションでき（OFCS の plan がこの動作を検証しています）、連鎖の生涯を 1 鍵に縛りません。各リフレッシュで発行されるアクセストークンは、その交換時に提示された鍵に結び付けられ続けるので、漏洩面はアクセストークンに限定されます。

トレードオフは明示的です。confidential クライアントは鍵ローテーションの自由度を得る代わりに、リフレッシュトークンの連鎖を保護のない bearer のまま残します。confidential クライアントはそもそも長寿命の非対称クレデンシャルで token endpoint に認証しているため、リフレッシュトークン単体の漏洩で攻撃者が新しいトークンを発行させることはできません。

## `dpop_jkt` リクエストパラメータ

RFC 9449 §10 では、公開クライアントが authorize 要求（または PAR 要求）に `dpop_jkt=<thumbprint>` を含めることで、発行されるアクセストークンの結び付き先 DPoP 鍵を **事前確約** できます。攻撃者が自分の鍵で code を交換するタイプの code-substitution 攻撃の窓を塞ぎます。FAPI 2.0 Baseline では必須ではなく（token endpoint での mTLS / DPoP で十分）、PKCE で動かす公開クライアントは PAR + token endpoint での DPoP に頼るのが一般的です。

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

`op.WithProfile(profile.FAPI2Baseline)` は PAR と JAR を自動有効化したうえで、`feature.DPoP` と `feature.MTLS` に対する `RequiredAnyOf` 制約を課します。どちらの送信者制約も指定されていなければ、`op.New` は DPoP を既定メンバーとして選びます。`feature.MTLS` を明示している場合はそれで制約を満たすため、DPoP は追加されません。

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
