---
title: トークン交換（RFC 8693） — 組み込み
description: RFC 8693 token-exchange grant を有効化 — TokenExchangePolicy、`act` チェーン、audience 正規化、`cnf` の再バインド。
---

# 使い方 — トークン交換（RFC 8693）

概念的背景（なりすましと委譲の違い、`act` の記録、なぜ `cnf` を再バインドするか）は [Token Exchange 入門](/ja/concepts/token-exchange) を先に読んでください。このページは組み込み手順を扱います。

::: details `subject_token` と `actor_token` の違い
**`subject_token`** は、新しいトークンを **その代わりに** 発行する対象であるユーザ(またはサービス)を表すトークンです — 発行されるトークンの `sub` はここから来ます。**`actor_token`** は、トークン交換を実行する呼び出し側を表すトークンです — subject の **代理として** 動作するサービスを示します。「service-a が alice の代わりに service-b を呼ぶ」チェーンでは、alice のアクセストークンが subject_token、service-a 自身のアクセストークンが actor_token です。subject == actor の自己交換(self-exchange)は検出され、OP は `act` claim を省略します。実質的な委譲が起きていないためです。
:::

::: details `act` チェーンとは
RFC 8693 §4.1 は `act` claim を「誰が誰の代わりに動作したか」の記録として定義しています。発行トークンの `act.sub` は actor の subject。actor 自体が過去の exchange の結果なら、その `act` がさらに内側に入れ子になりチェーン(`alice → service-a → service-b`)が形成されます。リソースサーバは `act` を辿ってチェーン全体の認可を確認します(「transfer は alice が service-a 経由なら可、bob が service-a 経由は不可」 等)。OP は深さの上限を強制し、悪意あるチェーンが無制限に伸びないようにしています。
:::

## 全体像

トークン交換は「入力トークンをそのまま別 audience にコピーする」処理ではありません。OP は subject と actor を検証し、scope と audience を狭め、`act` チェーンを構成し、送信者制約を呼び出し側の鍵へ付け替えてから、新しいアクセストークンを発行します。

<svg class="tx-flow" role="img" aria-labelledby="token-exchange-flow-title" viewBox="0 0 760 420" style="width:100%;height:auto;max-width:760px;display:block;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="token-exchange-flow-title">トークン交換の全体像。service-a が Alice の subject_token と自身の actor_token を OP に送り、OP が検証、scope 積集合、audience 正規化、act チェーン構築、cnf 再バインド、ポリシー判定を通して service-b 向けトークンを発行する。</title>
  <defs>
    <marker id="tx-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="30" y="44" width="190" height="76" rx="8"/>
  <text class="h" x="125" y="72" text-anchor="middle">subject_token</text>
  <text class="t sub" x="125" y="94" text-anchor="middle">Alice のアクセストークン</text>
  <text class="m sub" x="125" y="112" text-anchor="middle">sub=alice · scope=profile write</text>

  <rect x="30" y="164" width="190" height="76" rx="8"/>
  <text class="h" x="125" y="192" text-anchor="middle">actor_token</text>
  <text class="t sub" x="125" y="214" text-anchor="middle">service-a 自身のトークン</text>
  <text class="m sub" x="125" y="232" text-anchor="middle">sub=service-a</text>

  <rect class="accent" x="292" y="34" width="220" height="260" rx="8"/>
  <text class="h accent-text" x="402" y="64" text-anchor="middle">OP /token</text>
  <text class="m sub" x="402" y="84" text-anchor="middle">grant_type=token-exchange</text>
  <rect class="soft" x="318" y="106" width="168" height="30" rx="6"/>
  <text class="t" x="402" y="126" text-anchor="middle">1. 入力トークン検証</text>
  <rect class="soft" x="318" y="146" width="168" height="30" rx="6"/>
  <text class="t" x="402" y="166" text-anchor="middle">2. scope 積集合</text>
  <rect class="soft" x="318" y="186" width="168" height="30" rx="6"/>
  <text class="t" x="402" y="206" text-anchor="middle">3. audience 正規化</text>
  <rect class="soft" x="318" y="226" width="168" height="30" rx="6"/>
  <text class="t" x="402" y="246" text-anchor="middle">4. act / cnf を再構成</text>
  <rect class="soft" x="318" y="266" width="168" height="30" rx="6"/>
  <text class="t" x="402" y="286" text-anchor="middle">5. Policy.Allow</text>

  <rect x="580" y="82" width="150" height="88" rx="8"/>
  <text class="h" x="655" y="112" text-anchor="middle">発行トークン</text>
  <text class="m sub" x="655" y="134" text-anchor="middle">aud=service-b</text>
  <text class="m sub" x="655" y="152" text-anchor="middle">act.sub=service-a</text>

  <rect x="580" y="218" width="150" height="72" rx="8"/>
  <text class="h" x="655" y="248" text-anchor="middle">service-b</text>
  <text class="t sub" x="655" y="270" text-anchor="middle">act と cnf を検証</text>

  <path d="M220 82 H288" marker-end="url(#tx-arrow)"/>
  <path d="M220 202 H288" marker-end="url(#tx-arrow)"/>
  <path d="M512 126 H576" marker-end="url(#tx-arrow)"/>
  <path d="M655 170 V214" marker-end="url(#tx-arrow)"/>
  <text class="m sub" x="253" y="70" text-anchor="middle">POST</text>
  <text class="m sub" x="253" y="190" text-anchor="middle">POST</text>
  <text class="m sub" x="546" y="114" text-anchor="middle">200</text>

  <rect class="soft" x="78" y="326" width="604" height="56" rx="8"/>
  <text class="t" x="380" y="350" text-anchor="middle">重要: 発行トークンの `cnf` は Alice ではなく service-a の鍵に結び付く</text>
  <text class="m sub" x="380" y="370" text-anchor="middle">subject_token.cnf ではなく、呼び出し側 actor の検証済み DPoP / mTLS 証明を使う</text>
</svg>

## grant を有効化

```go
import (
  "github.com/libraz/go-oidc-provider/op"
  "github.com/libraz/go-oidc-provider/op/storeadapter/inmem"
)

provider, err := op.New(
  op.WithIssuer("https://op.example.com"),
  op.WithStore(inmem.New()),
  op.WithKeyset(myKeyset),
  op.WithCookieKeys(myCookieKey),

  op.RegisterTokenExchange(myPolicy),
  // ...
)
```

`op.RegisterTokenExchange(...)` が行うこと:

1. RFC 8693 URN（`urn:ietf:params:oauth:grant-type:token-exchange`）を `/token` に登録
2. ライブラリ内蔵のハンドラを組み込み — `subject_token` / `actor_token` の解決、audience の正規化、scope の積集合、`act` チェーンの構築、`cnf` の再バインド、TTL の頭打ち
3. 組み込み側が提供する `TokenExchangePolicy` を、リクエスト単位の受理可否判定に登録

::: warning ポリシーは必須、既定拒否(deny-by-default)
nil の `TokenExchangePolicy` は `op.New` で失敗します(`op.ErrTokenExchangePolicyNil`)。この grant に安全な既定は存在せず、すべての交換は配備側のポリシーで評価される必要があります。`RegisterTokenExchange` を 2 度呼ぶと `op.ErrTokenExchangeDuplicate` で失敗します。
:::

## `TokenExchangePolicy` を実装する

ポリシーのインターフェース自体は小さいですが、交換の判断はすべてここに乗ります。完全に解決済みの `TokenExchangeRequest`（subject / actor は検証済み、audience は正規化済み、scope は積集合適用済み）を受け取り、`*TokenExchangeDecision`（任意の追加絞り込み）またはエラーを返します。

```go
type myPolicy struct{ /* dependencies */ }

func (p *myPolicy) Allow(ctx context.Context, req op.TokenExchangeRequest) (*op.TokenExchangeDecision, error) {
    // 未知の audience を拒否
    for _, aud := range req.RequestedAudience {
        if !p.audienceAllowed(req.Client.ID, aud) {
            return nil, &op.Error{Code: "invalid_target", Description: "audience not allowed for this client"}
        }
    }

    // 送信者制約のない subject token から送信者制約付き audience への委譲を拒否
    if req.Actor != nil && req.SubjectToken.Confirmation == nil && p.audienceRequiresProof(req.RequestedAudience) {
        return nil, &op.Error{Code: "invalid_grant", Description: "downstream requires sender-bound subject"}
    }

    // 長寿命サービスチェーン用にリフレッシュトークンの発行を明示
    if req.Actor != nil && p.actorEligibleForRefresh(req.Actor) {
        return &op.TokenExchangeDecision{
            IssueRefreshToken: op.PtrBool(true),
        }, nil
    }
    return nil, nil // プロバイダの既定値で受理
}
```

### Decision のルール

| フィールド | 振る舞い |
|---|---|
| `GrantedScope` | 非空のとき、プロバイダが計算したセットを **置き換え**。`req.RequestedScope` の部分集合であること必須。広い値は `invalid_scope` |
| `GrantedAudience` | 非空のとき、プロバイダが計算したセットを置き換え。`req.RequestedAudience` の部分集合であること必須。広い値は `invalid_target` |
| `GrantedTTL` | 非ゼロのとき、プロバイダ計算の上限よりさらに短くアクセストークンの寿命を絞り込みます。上限超過は監査警告付きで黙って切り詰められ、負値は拒否されます |
| `IssueIDToken` | `*bool` で上書き。既定は `subject_token` が id_token なら true、それ以外は false |
| `IssueRefreshToken` | `*bool` で上書き。既定は nil でリフレッシュトークン発行なし。有効化は `op.PtrBool(true)`。「未設定」と「false」を組み込み側が混同できないようポインタ形 |
| `ExtraClaims` | id_token にマージされます。予約済み claim フィルタが適用され、`iss / sub / aud / iat / exp / auth_time / nonce / acr / amr / azp / at_hash / c_hash / sid / act / cnf` は黙って破棄されます — ポリシー側で `act` チェーンを書き換える、`sub` を乗っ取る、`cnf` を捏造する、といった操作はできません |

この部分集合ルールは、ポリシー決定を適用した後にも再検証されます。ポリシーのバグで scope や audience が広がった場合、拡張されたトークンを発行せず `invalid_scope` / `invalid_target` と監査イベントで拒否します。

### エラーセマンティクス

| return | 通信路上の応答 |
|---|---|
| `(nil, nil)` | プロバイダの既定値で交換を受理 |
| `(*Decision, nil)` | Decision を適用(さらなる絞り込みは可)、交換を受理 |
| `(_, *op.Error)` | そのまま返却 — 仕様エラーコード(`invalid_grant`、`invalid_target`、`invalid_scope`、`unauthorized_client`)から選ぶ |
| `(_, それ以外のエラー)` | `invalid_grant` に丸める。原因の詳細はサーバ側ログにのみ残す |

## ポリシーが呼ばれる **前** に OP が強制すること

これらは交渉不能で、ポリシーは絞り込みはできても拡張はできません:

- **`act` チェーンの構築**: actor が subject と異なるときは、OP が actor の検証済み資格情報から発行トークンの `act` claim を構成。呼び出し側に `act` を捏造させない
- **audience の正規化**: RFC 8707 §2 のとおり scheme と host を小文字化し、末尾スラッシュを除去。リクエストがパラメータを省略した場合は `subject_token.audience` から既定値を補完
- **scope の積集合**: requested ∩ subject_token.scope ∩ client の許可リスト。空集合になれば `invalid_scope`
- **TTL の上限**: min(`GrantedTTL`、`subject_token` の残り、OP のグローバル上限)
- **`cnf` の再バインド**: 発行トークンの `cnf`(DPoP `jkt` または mTLS `x5t#S256`)は **呼び出し側** actor の検証済み証明。subject のものではない
- **自己交換(self-exchange)の検出**: `subject_token.client_id` == `req.Client.ID` のとき `act` エントリは追加されない(実質的な委譲ではないため)

::: details scope の積集合とは
発行されるトークンの scope は 3 つの上限を同時に超えられません — (a) リクエストが要求した範囲、(b) subject_token がもともと持っていた範囲、(c) 呼び出し側クライアントが登録上許可されている範囲。OP は 3 者を交差させ、空集合になれば `invalid_scope` です。これがトークン交換を安全にしている肝で、`profile` しか持っていなかったユーザトークンから service-a が魔法のように `admin:write` を獲得することはできません。
:::

::: details TTL 上限とは
発行されるトークンの寿命は 3 値の最小値になります — ポリシーが返した `GrantedTTL`(あれば)、subject_token の残り寿命(ユーザのセッションが本来終わるはずだった時刻を超えて延伸できない)、OP のグローバルなアクセストークン TTL 上限。上限を超えた値は拒否ではなく、監査警告を残したうえで黙って上限まで切り詰められます。ポリシーが返した値がわずかに大きい程度では、リクエスト全体を失敗扱い(fail-close)にはしません。
:::

::: details `cnf` の再バインドとは
subject_token は alice の DPoP 鍵に紐付いている可能性がありますが、交換後のトークンは service-a に渡るので、alice ではなく service-a の鍵に紐付いていなければなりません。そうでないと service-a がトークンを使えません。OP は subject_token の confirmation を、呼び出し actor の検証済み DPoP / mTLS 証明に差し替えることで再バインドします。意義については [送信者制約](/ja/concepts/sender-constraint) を参照してください。
:::

::: details 自己交換(self-exchange)とは
subject_token を保有していたクライアントと交換を要求しているクライアントが同一の場合（`subject_token.client_id == req.Client.ID`）、実質的な委譲は発生していません。自分のトークンを自分で絞り込んでいるだけです。RFC 8693 は `act` を実際の委譲の記録として位置付けているので、OP は自己交換の場合に `act` を省略します。「service-a が service-a 自身の代わりに動作した」という無意味なチェーン要素を残さないためです。
:::

## 通信路上での交換リクエスト

```sh
curl -s \
  -u service-a:<secret> \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  -d "subject_token=$ALICES_ACCESS_TOKEN" \
  -d 'subject_token_type=urn:ietf:params:oauth:token-type:access_token' \
  -d "actor_token=$SERVICE_A_TOKEN" \
  -d 'actor_token_type=urn:ietf:params:oauth:token-type:access_token' \
  -d 'audience=https://api.b.example.com' \
  -d 'scope=write:transfer' \
  https://op.example.com/oidc/token
```

発行アクセストークンをデコードすると、以下のような claim が乗ります:

```json
{
  "sub": "alice",
  "act": { "sub": "service-a", "client_id": "service-a" },
  "aud": ["https://api.b.example.com"],
  "scope": "write:transfer",
  "cnf": { "jkt": "<service-a の DPoP thumbprint>" },
  "iss": "https://op.example.com",
  "exp": ...
}
```

Service B は `cnf.jkt` に対して DPoP 証明を検証し、`act.sub` を見て委譲ポリシーを適用します(「transfer は alice が service-a 経由なら可、bob が service-a 経由は不可」 など)。

## リフレッシュトークンは明示時だけ発行

トークン交換リクエストは既定でリフレッシュトークンを **発行しません**。RFC 8693 §2.2.1 はこの応答パラメータを OPTIONAL としており、これは多段の委譲が subject_token の寿命を超えて気付かれずに延伸するのを防ぐためです。

発行するにはポリシーで `IssueRefreshToken: op.PtrBool(true)` を返します。素の bool ではなくポインタ形なのは、構造体ゼロ値で誤って有効化してしまうのを避けるためです。OP は自分の `RefreshTokenStore` を通じてリフレッシュトークンを生成・永続化し、発行アクセストークンと同じ grant 識別子と DPoP / mTLS バインディングを共有させます。発行されると `token_exchange.refresh_issued` 監査イベントが発火し、SOC からの可視性が確保されます。

## 監査シグナルのペアリング

成功した交換はすべて `token_exchange.requested`（ハンドラ入場）+ `token_exchange.granted`（発行）の 2 つを発火します。拒否は `requested` + 失敗系イベントのいずれかを発火します:

- `policy_denied` / `policy_error` — ポリシーがエラーを返却
- `scope_inflation_blocked` — 積集合の外側にある scope を要求
- `audience_blocked` — ポリシーの許可リスト外の audience を要求
- `ttl_capped` — 発行 TTL を上限で切り詰め(警告のみ。拒否ではない)
- `act_chain_too_deep` — ネストした act チェーンの深さが上限を超過
- `subject_token_invalid` — subject_token 検証失敗
- `subject_token_registry_error` — レジストリ参照の障害（一時的な停止など）。通信路上の応答は `invalid_grant`

完全なリストは [監査イベントカタログ](/ja/reference/audit-events#token-exchange-rfc-8693) を参照してください。

## 動かしてみる

[`examples/33-token-exchange-delegation`](https://github.com/libraz/go-oidc-provider/tree/main/examples/33-token-exchange-delegation):

```sh
(cd examples/33-token-exchange-delegation && go run -tags example .)
```

フロントエンド → service-a → service-b のチェーンです。service-a が Alice のトークンを委譲トークン（`act={sub: service-a}`）に交換し、service-b のリソースサーバ側検証器が `act.sub` を辿ります。チェーンを持たないトークンは拒否されます。ファイル: `op.go`(OP の組み立て + `TokenExchangePolicy`)、`service_a.go`(中継)、`service_b.go`(リソースサーバ)、`probe.go`(self-verify)。

## 続きはこちら

- [Token Exchange 入門](/ja/concepts/token-exchange) — なりすましと委譲の概念的背景
- [Custom Grant の組み込み](/ja/use-cases/custom-grant) — token-exchange が使う URN ルーティングの差し込み口。他の URN を書く組み込み側も同じ形をたどる
- [送信者制約](/ja/concepts/sender-constraint) — `cnf` の再バインドが actor 側に張るのが正しい既定である理由
