---
title: DPoP nonce フロー
description: RFC 9449 §8 / §9 — サーバが供給する nonce を DPoP proof に組み込み、事前計算 proof 攻撃を起こしにくくする（任意の強化策）。
pageClass: pg-use-cases-dpop-nonce
---

# 使い方 — DPoP nonce フロー

## DPoP とは何か、nonce とは何か

**DPoP**（"Demonstrating Proof of Possession", RFC 9449）は、アクセストークンをクライアントが保持する鍵に紐づける仕組みです。クライアントは API 呼び出しのたびに、その鍵で署名した新しい JWT を `DPoP:` ヘッダで提示し、「私はこのトークンを発行されたクライアントと同一です」と証明します。漏洩した DPoP-bound トークンは、鍵を持たない攻撃者にとって無価値です。

**nonce** は RFC 9449 §8 / §9 の任意の補強策です。サーバが nonce を要求する場合、クライアントはサーバから受け取った値を後続の proof に含めます。サーバが新しい値を渡すまでは、受理された nonce を再利用できます。したがって nonce はリクエストごとに新しくなる値ではなく、それだけで proof の再利用を検出するものでもありません。再利用の検出には proof の一意な `jti` とサーバ側の追跡を使い、nonce はサーバのチャレンジ前に作られた proof を使いにくくします。

::: details このページで触れる仕様
- [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) — DPoP, §8（OP が供給する nonce）, §9（リソースサーバが供給する nonce）
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-security-profile-2_0.html) — nonce 許容
- [FAPI 2.0 Message Signing](https://openid.net/specs/fapi-message-signing-2_0.html) — Message Signing 文書。本ライブラリは DPoP 有効時に nonce source の制約を追加
:::

::: details 用語の補足
- **DPoP proof** — クライアントがリクエスト毎に署名する小さな JWT。「アクセストークンがバインドされた秘密鍵を、いまも自分が保持している」ことを示します。基本は [送信者制約](/ja/concepts/sender-constraint) を参照。
- **事前計算 proof 攻撃** — クライアントの端末を一時的に侵害した攻撃者が、有効な proof をまとめて持ち出して後から再利用するシナリオです。主な再利用対策はサーバ側の `jti` チェックで、nonce を必須にするとサーバが受理値を供給する前に作られた proof も拒否できます。
:::

短くまとめると、nonce フローは次の 2 種の攻撃を遮ります:

- **事前計算 proof** — nonce が必須の場合、サーバが受理値を供給する前に作った proof は、その値を取得するまで受理されません。受理済み proof の再利用は `jti` の追跡で扱います。
- **stage-and-fire** — 古い nonce に対して作った proof は、OP がその値の受理をやめると失敗します。

> **ソース:** [`examples/51-dpop-nonce`](https://github.com/libraz/go-oidc-provider/tree/main/examples/51-dpop-nonce)

## フロー

<figure class="fig">
  <div class="fig-head">nonce を一度チャレンジし、受理値を再利用する</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-dpopnonce-title" viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dpopnonce-title">OP は最初の proof を use_dpop_nonce で拒否し、ヘッダで nonce を返します。クライアントはその nonce を入れて proof を作り直し、成功します。以後の proof は OP が新しい値を渡すまで受理値を再利用でき、成功応答に DPoP-Nonce ヘッダが必ず付くわけではありません。</title>
    <line class="fg-life" x1="200" y1="72" x2="200" y2="390"/>
    <line class="fg-life fg-life--accent" x1="700" y1="72" x2="700" y2="390"/>
    <rect class="fg-box" x="110" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t" x="200" y="44" text-anchor="middle">RP / クライアント</text>
    <text class="fg-mxs" x="200" y="59" text-anchor="middle">priv_dpop を保有</text>
    <rect class="fg-box fg-box--accent" x="610" y="24" width="180" height="44" rx="6"/>
    <text class="fg-t fg-accent" x="700" y="44" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="700" y="59" text-anchor="middle">go-oidc-provider</text>
    <circle class="fg-badge" cx="15" cy="112" r="8.5"/>
    <text class="fg-badge-t" x="15" y="115" text-anchor="middle">1</text>
    <path class="fg-edge" d="M200,112 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="450" y="92" text-anchor="middle">POST /token · DPoP: &lt;proof&gt;</text>
    <text class="fg-xs" x="450" y="105" text-anchor="middle">まだ nonce が無い — 事前に知る手段がない</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="158" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="161" text-anchor="middle">2</text>
    <path class="fg-edge fg-edge--accent" d="M700,158 H200" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="450" y="138" text-anchor="middle">400 use_dpop_nonce</text>
    <text class="fg-mxs" x="450" y="151" text-anchor="middle">DPoP-Nonce: nonce-1</text>
    <circle class="fg-badge" cx="15" cy="196" r="8.5"/>
    <text class="fg-badge-t" x="15" y="199" text-anchor="middle">3</text>
    <path class="fg-edge" d="M200,188 h28 v16 h-28" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="240" y="192">proof を作り直す</text>
    <text class="fg-mxs" x="240" y="205">nonce = nonce-1 を入れる</text>
    <circle class="fg-badge" cx="15" cy="242" r="8.5"/>
    <text class="fg-badge-t" x="15" y="245" text-anchor="middle">4</text>
    <path class="fg-edge" d="M200,242 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="450" y="236" text-anchor="middle">POST /token · DPoP: &lt;proof, nonce-1&gt;</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="288" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="291" text-anchor="middle">5</text>
    <path class="fg-edge fg-edge--accent" d="M700,288 H200" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="450" y="268" text-anchor="middle">200 · DPoP 結び付き付きの access_token</text>
    <text class="fg-mxs" x="450" y="281" text-anchor="middle">nonce-1 を引き続き受理 — 新しいヘッダは不要</text>
    <circle class="fg-badge" cx="15" cy="330" r="8.5"/>
    <text class="fg-badge-t" x="15" y="333" text-anchor="middle">6</text>
    <path class="fg-edge" d="M200,330 H700" marker-end="url(#fg-a)"/>
    <text class="fg-mxs" x="450" y="324" text-anchor="middle">GET /userinfo · DPoP: &lt;proof, nonce-1&gt;</text>
    <circle class="fg-badge fg-badge--accent" cx="15" cy="376" r="8.5"/>
    <text class="fg-badge-t fg-badge-t--accent" x="15" y="379" text-anchor="middle">7</text>
    <path class="fg-edge fg-edge--accent" d="M700,376 H200" marker-end="url(#fg-ac)"/>
    <text class="fg-mxs" x="450" y="356" text-anchor="middle">200 · { user claims }</text>
    <text class="fg-mxs" x="450" y="369" text-anchor="middle">この成功応答に DPoP-Nonce ヘッダはない</text>
  </svg>
  <figcaption class="fig-note">最初の拒否は特別扱いすべき失敗ではなく、ハンドシェイクそのものです。<code>use_dpop_nonce</code> を通常のエラーとして扱うクライアントは再試行を繰り返しますが、ヘッダを読むクライアントは次の 1 回で成功します。</figcaption>
</figure>

OP は、受理された nonce がないリクエストや、受理対象から外れた nonce を含むリクエストにチャレンジを返します。クライアントが返された値で再試行したあとは、OP が新しい値を渡すまでその nonce を再利用できます。成功応答に `DPoP-Nonce` ヘッダを付ける必要はありません。

`nonce` と `jti` は役割が異なります。`jti` は proof の一意な識別子で、本ライブラリの consumed-JTI ストアは同じ proof の再利用を拒否します。設定した nonce source は proof にサーバが受理する値を追加し、現行値と直前の値をローテーションできます。

## 実装

ライブラリは in-memory 参考実装を同梱しています。シングルプロセス用、HA セーフではありませんが、開発と小規模 deploy には十分:

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

ローテーション間隔（上の `5*time.Minute`）は「現行」nonce が切り替わる頻度です。OP は現行値と直前の値の両方を受理するので、ローテーション境界でリクエストが競合してもハード失敗にはなりません。

::: warning 複数インスタンス構成
プロセスローカルな nonce ソースはレプリカを跨げません — インスタンス B はインスタンス A が出した nonce を知りません。本番 HA 構成では、独自 `DPoPNonceSource` の裏に共有ストア（Redis）を置きます。Redis nonce ソースをライブラリに同梱しないのは意図的です。オプション群（TTL、ローテーション周期、ローテーション境界の取りこぼし許容度）が運用ごとに異なりすぎるためです。
:::

## OP が nonce を要求するエンドポイント

| Endpoint | nonce 必須？ | 設定箇所 |
|---|---|---|
| `/token` | DPoP proof が提示され、`DPoPNonceSource` を設定している場合に必須 | `op.WithDPoPNonceSource` |
| `/userinfo` | DPoP proof が提示され、`DPoPNonceSource` を設定している場合に必須 | 同上 |
| `/par` | DPoP proof が提示され、`DPoPNonceSource` を設定している場合に必須 | 同上 |
| `/device_authorization` | DPoP proof が提示され、`DPoPNonceSource` を設定している場合に必須 | 同上 |
| `/bc-authorize`（CIBA） | DPoP proof が提示され、`DPoPNonceSource` を設定している場合に必須 | 同上 |

`/par` と `/token` は同じ nonce チャレンジと検証を行うので、PAR（プッシュ型認可リクエスト）を使う SPA も `/token` と同じ nonce リトライループを `/par` 呼び出しで回すことになります。

`DPoP` ヘッダが提示された場合、表中のすべての endpoint はその値を 1 つだけ受け付けます。複数値は、先頭が空で後続に有効な proof がある場合も含め、不正として拒否されます。OP が後続の値だけを選んだり、黙って proof なしの経路として扱ったりすることはありません。

本ライブラリでは、FAPI 2.0 Message Signing プロファイルは DPoP が有効な場合に nonce source を必須とし、`profile.FAPI2Baseline` では任意のままです。現行の FAPI 2.0 Security Profile は nonce の利用を認めており、ここでのプロファイル別の必須化は本ライブラリの制約です。

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
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — DPoP nonce source を任意のままにする本ライブラリのプロファイル。
