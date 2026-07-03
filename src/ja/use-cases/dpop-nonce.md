---
title: DPoP nonce フロー
description: RFC 9449 §8 / §9 — サーバ供給の nonce を DPoP proof に組み込み、事前計算 proof 攻撃を阻止する。
---

# ユースケース — DPoP nonce フロー

## DPoP とは何か、nonce とは何か

**DPoP**（"Demonstrating Proof of Possession", RFC 9449）は、アクセストークンをクライアントが保持する鍵に紐づける仕組みです。クライアントは API 呼び出しのたびに、その鍵で署名した新しい JWT を `DPoP:` ヘッダで提示し、「私はこのトークンを発行されたクライアントと同一です」と証明します。漏洩した DPoP-bound トークンは、鍵を持たない攻撃者にとって無価値です。

**nonce** は RFC 9449 §8 / §9 が追加する補強策です。これがないと、クライアントは事前に DPoP proof をいくつも作って手元に置けてしまい、クライアントを一時的に侵害した攻撃者がそれをまとめて持ち出して後から再利用できる、という穴が残ります。nonce はその穴を塞ぎます: OP がサーバ側で生成した最新 nonce を発行し、次の DPoP proof には **必ずその nonce を含める** ことを要求します。事前計算した proof は即座に無効化されます。

::: details このページで触れる仕様
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP, §8（OP が供給する nonce）, §9（リソースサーバが供給する nonce）
- [FAPI 2.0 Baseline](https://openid.net/specs/fapi-2_0-baseline.html) — nonce 許容
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-2_0-message-signing.html) — nonce 必須
:::

::: details 用語の補足
- **DPoP proof** — クライアントがリクエスト毎に署名する小さな JWT。「アクセストークンがバインドされた秘密鍵を、いまも自分が保持している」ことを示します。基本は [送信者制約](/ja/concepts/sender-constraint) を参照。
- **事前計算 proof 攻撃** — クライアントの端末を一時的に侵害した攻撃者が、有効な proof をまとめて持ち出して後から再利用するシナリオ。nonce が無いと、proof は `iat` 窓が許す限り有効なままです。
:::

短くまとめると、nonce フローは次の 2 種の攻撃を遮ります:

- **事前計算 proof** — proof を傍受しても、次の nonce を知らない攻撃者は再利用できません。
- **stage-and-fire** — オフラインで仕込んだ長寿命 proof は、OP が nonce をローテーションすると無効化されます。

> **ソース:** [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce)

## フロー

<style scoped>
.dpop-nonce-dg text{stroke:none;fill:currentColor;}
.dpop-nonce-dg .d-actor{font-family:var(--vp-font-family-base);font-size:13px;font-weight:600;}
.dpop-nonce-dg .d-cap{font-family:var(--vp-font-family-mono);font-size:10px;}
.dpop-nonce-dg .d-prose{font-family:var(--vp-font-family-base);font-size:12px;font-weight:600;}
.dpop-nonce-dg .d-mono{font-family:var(--vp-font-family-mono);font-size:11px;}
.dpop-nonce-dg .op-accent{stroke:var(--vp-c-brand-2);}
.dpop-nonce-dg .op-fill{fill:var(--vp-c-brand-2);}
.dpop-nonce-dg .life{opacity:0.3;stroke-width:1;}
.dpop-nonce-dg .note{opacity:0.4;stroke-width:1;}
</style>

<svg class="dpop-nonce-dg" role="img" aria-labelledby="dpop-nonce-flow-title" viewBox="0 0 760 486" style="width:100%;height:auto;max-width:760px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="dpop-nonce-flow-title">DPoP nonce ハンドシェイクのシーケンス: OP は最初の proof を use_dpop_nonce と DPoP-Nonce ヘッダで拒否し、クライアントは nonce claim を入れて再試行し、以降の呼び出しは毎回ローテーションされる最新 nonce を運ぶ。</title>
  <line class="life" x1="130" y1="68" x2="130" y2="472"/>
  <line class="life op-accent" x1="630" y1="68" x2="630" y2="472"/>
  <rect x="55" y="14" width="150" height="30" rx="5"/>
  <rect class="op-accent" x="555" y="14" width="150" height="30" rx="5"/>
  <text class="d-actor" x="130" y="33" text-anchor="middle">RP / クライアント</text>
  <text class="d-actor op-fill" x="630" y="33" text-anchor="middle">OP</text>
  <text class="d-cap" x="130" y="58" text-anchor="middle">priv_dpop を保有</text>
  <text class="d-cap op-fill" x="630" y="58" text-anchor="middle">本ライブラリ</text>
  <text class="d-mono" x="380" y="98" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="380" y="111" text-anchor="middle">nonce なし</text>
  <path d="M130,120 H630"/>
  <path d="M623,116 L630,120 L623,124"/>
  <text class="d-mono" x="380" y="150" text-anchor="middle">400 use_dpop_nonce</text>
  <text class="d-mono" x="380" y="163" text-anchor="middle">DPoP-Nonce: nonce-1</text>
  <path d="M630,172 H130"/>
  <path d="M137,168 L130,172 L137,176"/>
  <path d="M130,196 h16 v16 h-16"/>
  <path d="M137,206 L130,210 L137,214"/>
  <text class="d-prose" x="156" y="200">proof を作り直す</text>
  <text class="d-mono" x="156" y="213">nonce = nonce-1</text>
  <text class="d-mono" x="380" y="246" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="380" y="259" text-anchor="middle">nonce = nonce-1</text>
  <path d="M130,268 H630"/>
  <path d="M623,264 L630,268 L623,272"/>
  <text class="d-mono" x="380" y="298" text-anchor="middle">200 · access_token (DPoP バインド)</text>
  <text class="d-mono" x="380" y="311" text-anchor="middle">DPoP-Nonce: nonce-2</text>
  <path d="M630,320 H130"/>
  <path d="M137,316 L130,320 L137,324"/>
  <rect class="note" x="238" y="336" width="284" height="24" rx="4"/>
  <text class="d-prose" x="380" y="352" text-anchor="middle">以降の呼び出しは最新 nonce を運ぶ</text>
  <text class="d-mono" x="380" y="386" text-anchor="middle">GET /userinfo · DPoP: &lt;proof&gt;</text>
  <text class="d-mono" x="380" y="399" text-anchor="middle">nonce = nonce-2</text>
  <path d="M130,408 H630"/>
  <path d="M623,404 L630,408 L623,412"/>
  <text class="d-mono" x="380" y="438" text-anchor="middle">200 · { user claims }</text>
  <text class="d-mono" x="380" y="451" text-anchor="middle">DPoP-Nonce: nonce-3</text>
  <path d="M630,460 H130"/>
  <path d="M137,456 L130,460 L137,464"/>
</svg>

## 実装

ライブラリは in-memory リファレンス実装を同梱しています。シングルプロセス用、HA セーフではありませんが、開発と小規模 deploy には十分:

```go
import "github.com/libraz/go-oidc-provider/op"

src, err := op.NewInMemoryDPoPNonceSource(ctx, 5*time.Minute)
if err != nil { /* ... */ }

op.New(
  /* 必須オプション */
  op.WithFeature(feature.DPoP),
  op.WithDPoPNonceSource(src),
)
```

ローテーション間隔（上の `5*time.Minute`）は「現行」nonce が切り替わる頻度です。current と previous の両方が受理されるので、ローテーション境界でリクエストが競合してもハード失敗にはなりません。

::: warning 複数インスタンス構成
プロセスローカルな nonce ソースはレプリカを跨げません — インスタンス B はインスタンス A が出した nonce を知りません。本番 HA 構成では、独自 `DPoPNonceSource` の裏に共有ストア（Redis）を置きます。Redis nonce ソースをライブラリに同梱しないのは意図的です。オプション群（TTL、ローテーション周期、ローテーション境界の取りこぼし許容度）が運用ごとに異なりすぎるためです。
:::

## OP が nonce を要求するエンドポイント

| Endpoint | nonce 必須？ | 設定箇所 |
|---|---|---|
| `/token` | `DPoPNonceSource` 設定時は常に必須 | `op.WithDPoPNonceSource` |
| `/userinfo` | `DPoPNonceSource` 設定時は常に必須 | 同上 |
| `/par` | `DPoPNonceSource` 設定時は常に必須 | 同上 |

`/par` と `/token` は nonce の発行・要求を対称に行うので、PAR（プッシュ型認可リクエスト）を使う SPA も `/token` と同じ nonce リトライループを `/par` 呼び出しで回すことになります。

FAPI 2.0 Message Signing は nonce を強制、Baseline は許可。ライブラリは仕様に追従するので、プロファイルを切り替えればデフォルトも切り替わります。

## 動作確認

```sh
# nonce なしの最初の呼び出し
curl -i -X POST -H "DPoP: <nonce なしの proof>" \
  -d 'grant_type=authorization_code&code=...' \
  http://localhost:8080/oidc/token | head -20
# HTTP/1.1 400 Bad Request
# DPoP-Nonce: <fresh-nonce>
# {"error":"use_dpop_nonce", ...}
```

`DPoP-Nonce` の値を次の proof の `nonce` claim に入れて再試行します。

## 続きはこちら

- [送信者制約](/ja/concepts/sender-constraint) — DPoP がそもそも何のためにあるか。
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — nonce をデフォルトで強制するプロファイル。
