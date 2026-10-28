---
title: DPoP nonce フロー
description: RFC 9449 §8 / §9 — サーバが供給する nonce を DPoP proof に組み込み、事前計算 proof 攻撃を起こしにくくする（任意の強化策）。
pageClass: pg-use-cases-dpop-nonce
---

# ユースケース — DPoP nonce フロー

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
  <svg class="fig-svg" role="img" aria-labelledby="uc-dpopnonce-title" viewBox="0 0 960 624" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-dpopnonce-title">OP は最初の proof を use_dpop_nonce で拒否し、ヘッダで nonce を返します。クライアントはその nonce を入れて proof を作り直し、成功します。以後の proof は OP が新しい値を渡すまで受理値を再利用でき、成功応答に DPoP-Nonce ヘッダが必ず付くわけではありません。</title>
    <!-- lifelines -->
    <line class="fg-life" x1="192" y1="88" x2="192" y2="600"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="600"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">RP / クライアント</text>
    <text class="fg-mxs" x="192" y="72" text-anchor="middle">priv_dpop を保有</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- first proof -->
    <path class="fg-edge" d="M192,144 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="110" text-anchor="middle">POST /token</text>
    <text class="fg-xs" x="508" y="132" text-anchor="middle">まだ nonce が無い — 事前に知る手段がない</text>
    <!-- challenge -->
    <path class="fg-edge fg-edge--accent" d="M824,216 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="182" text-anchor="middle">400 use_dpop_nonce</text>
    <text class="fg-mxs" x="508" y="204" text-anchor="middle">DPoP-Nonce: nonce-1</text>
    <!-- rebuild -->
    <path class="fg-edge" d="M192,256 h40 v24 h-40" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="248" y="262">proof を作り直す</text>
    <text class="fg-mxs" x="248" y="284">nonce = nonce-1</text>
    <!-- retry -->
    <path class="fg-edge" d="M192,360 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="326" text-anchor="middle">POST /token</text>
    <text class="fg-mxs" x="508" y="348" text-anchor="middle">DPoP: &lt;proof, nonce-1&gt;</text>
    <!-- accepted -->
    <path class="fg-edge fg-edge--accent" d="M824,432 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="398" text-anchor="middle">200 · access_token</text>
    <text class="fg-xs" x="508" y="420" text-anchor="middle">nonce-1 を引き続き受理 — 新しいヘッダは不要</text>
    <!-- reuse -->
    <path class="fg-edge" d="M192,504 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="508" y="470" text-anchor="middle">GET /userinfo</text>
    <text class="fg-mxs" x="508" y="492" text-anchor="middle">DPoP: &lt;proof, nonce-1&gt;</text>
    <!-- reuse accepted -->
    <path class="fg-edge fg-edge--accent" d="M824,576 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="508" y="542" text-anchor="middle">200 · { user claims }</text>
    <text class="fg-xs" x="508" y="564" text-anchor="middle">この成功応答に DPoP-Nonce ヘッダはない</text>
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

ローテーション間隔（上の `5*time.Minute`）は「現行」nonce が切り替わる頻度です。正の値が必須で、0 以下だと `op.NewInMemoryDPoPNonceSource` がエラーを返します。OP は現行値と直前の値の両方を受理するので、ローテーション境界でリクエストが競合してもハード失敗にはなりません。

::: warning 複数インスタンス構成
プロセスローカルな nonce ソースはレプリカを跨げません — インスタンス B はインスタンス A が出した nonce を知りません。本番 HA 構成では、独自 `DPoPNonceSource` の裏に共有ストア（Redis）を置きます。Redis nonce ソースをライブラリに同梱しないのは意図的です。オプション群（TTL、ローテーション周期、ローテーション境界の取りこぼし許容度）が運用ごとに異なりすぎるためです。
:::

## OP が nonce を要求するエンドポイント

以下のどのエンドポイントも、リクエストが DPoP proof を持ち、`op.WithDPoPNonceSource` で nonce ソースが設定されていれば nonce を要求します。違うのはチャレンジの形です。

| Endpoint | nonce が無い・古いときのチャレンジ |
|---|---|
| `/token`、`/par`、`/device_authorization`、`/bc-authorize`（CIBA） | `400` と JSON エラー `use_dpop_nonce`、レスポンスヘッダ `DPoP-Nonce` |
| `/userinfo` | `401` と `WWW-Authenticate: DPoP error="use_dpop_nonce"`、レスポンスヘッダ `DPoP-Nonce`（RFC 9449 §9、リソースサーバ向けの形） |

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

`DPoP-Nonce` の値を次の proof の `nonce` claim に入れて再試行します。`use_dpop_nonce` が続く場合の多くは、クライアントがヘッダを読んでいないか、値を発行したのとは nonce の輪が異なるレプリカに当たっています。

## 続きはこちら

- [送信者制約](/ja/concepts/sender-constraint) — DPoP がそもそも何のためにあるか。
- [FAPI 2.0 Baseline](/ja/use-cases/fapi2-baseline) — DPoP nonce source を任意のままにする本ライブラリのプロファイル。
