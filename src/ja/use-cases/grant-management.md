---
title: Grant management
description: OAuth 2.0 Grant Management エンドポイントで長命な grant を id 指定で操作し、削除は指定した grant_id だけに限定します。
pageClass: pg-use-cases-grant-management
---

# ユースケース — Grant management

*grant* は、あるユーザがあるクライアントに何を同意したかを OP が記録したものです。scope と、[RAR](/ja/use-cases/authorization-details) を使う場合は `authorization_details` が入ります。通常、OP はユーザとクライアントの組ごとに grant を 1 つだけ持ち、新しい認可のたびにそれを黙って更新するため、クライアントが grant に名前を付けることはありません。継続的な支払いマンデートや常設のデータアクセス同意のように grant が長く続く場合は、クライアントが grant を名指しして、後から内容を追加し、いまの内容を読み戻し、不要になったら失効させる必要があります。[OAuth 2.0 Grant Management draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-grant-management) は、各 grant に安定した `grant_id` と、それに対する 5 つのアクションを定めています。

`op.WithGrantManagement` は `grant_management_action` / `grant_id` の認可パラメータを処理し、grant management エンドポイント（照会 / 失効）をマウントし、token レスポンスに `grant_id` を刻み、discovery で feature を公開します。

初回の認可のあとも、クライアントが同意にあたる grant を管理する必要がある場合に使います。特に、grant が後から増えうる場合や、ブラウザのセッションとは独立して失効させたい場合に向いています。短命なサインインのためには不要です。クライアントが grant を名指しする必要がなければ、認可コード、リフレッシュトークンのローテーション、通常のトークン失効のほうが単純です。

<figure class="fig">
  <div class="fig-head">grant を決めるもの、トークンまで届くもの</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-grantmgmt-title" viewBox="0 0 960 368" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-grantmgmt-title">create・replace・merge は認可リクエストに乗り、grant の scope と authorization details を決めます。query と revoke は grant management エンドポイントへの操作です。5 つのうち、grant に紐づくトークンまで届くのは revoke だけです。</title>
    <!-- labels -->
    <text class="fg-lbl" x="32" y="40">認可リクエストに乗るもの</text>
    <text class="fg-lbl" x="688" y="40">grant エンドポイント</text>
    <!-- create -->
    <rect class="fg-box" x="32" y="56" width="264" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="84">create</text>
    <text class="fg-s" x="48" y="108">grant_id なし — OP が採番</text>
    <!-- replace -->
    <rect class="fg-box" x="32" y="160" width="264" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="188">replace</text>
    <text class="fg-s" x="48" y="212">scope := このリクエスト</text>
    <!-- merge -->
    <rect class="fg-box" x="32" y="264" width="264" height="72" rx="8"/>
    <text class="fg-m fg-accent" x="48" y="292">merge</text>
    <text class="fg-s" x="48" y="316">scope := 既存 + 新規</text>
    <!-- into the grant -->
    <path class="fg-leader" d="M296,92 H320 M296,196 H320 M296,300 H320 M320,92 V300"/>
    <path class="fg-edge fg-edge--accent" d="M320,196 H344" marker-end="url(#fg-ac)"/>
    <!-- grant -->
    <rect class="fg-box fg-box--accent" x="344" y="112" width="296" height="96" rx="8"/>
    <text class="fg-t2 fg-accent" x="360" y="140">grant</text>
    <text class="fg-mxs" x="360" y="164">grant_id = g-9f3c…</text>
    <text class="fg-xs" x="360" y="188">scope + details、レコードは 1 つ</text>
    <!-- to tokens -->
    <path class="fg-edge" d="M492,208 V248" marker-end="url(#fg-a)"/>
    <!-- tokens -->
    <rect class="fg-box fg-box--sub" x="344" y="248" width="296" height="96" rx="8"/>
    <text class="fg-t2" x="360" y="276">紐づくトークン</text>
    <text class="fg-mxs" x="360" y="300">アクセストークン (JWT, opaque)</text>
    <text class="fg-mxs" x="360" y="324">リフレッシュトークン</text>
    <!-- query -->
    <rect class="fg-box" x="688" y="56" width="240" height="96" rx="8"/>
    <text class="fg-mxs" x="704" y="84">GET …/{grant_id}</text>
    <text class="fg-xs" x="704" y="108">scope と details を読む</text>
    <text class="fg-xs" x="704" y="132">何も変更しない</text>
    <path class="fg-edge fg-edge--muted" d="M688,136 H640" marker-end="url(#fg-am)"/>
    <!-- revoke -->
    <rect class="fg-box fg-box--danger" x="688" y="248" width="240" height="96" rx="8"/>
    <text class="fg-mxs" x="704" y="276">DELETE …/{grant_id}</text>
    <text class="fg-xs" x="704" y="300">204 · レコードが消える</text>
    <text class="fg-xs fg-danger" x="704" y="324">紐づくトークンも失効する</text>
    <path class="fg-edge fg-edge--danger" d="M688,296 H640" marker-end="url(#fg-ad)"/>
  </svg>
  <figcaption class="fig-note">DELETE の矢印だけがトークンに届きます。grant の scope を変えても、発行済みのトークンは変わりません。新しい scope が効くのは次回以降の発行からです。ただし、<code>replace</code> で <code>authorization_details</code> の要素を外すと、その要素は opaque アクセストークンとリフレッシュトークンのチェーンから取り除かれます。発行済みの JWT は、有効期限まで claim をそのまま持ちます。</figcaption>
</figure>

下段の箱に届くのは `revoke` だけです。`create` / `replace` / `merge` は grant が保持する内容を書き換え、`query` はそれを読み戻します。`revoke` は grant レコードを削除したうえで、そこにぶら下がるトークンを失効させます。

::: warning Experimental — IETF draft を追跡
Grant Management は公開済みの RFC ではなく IETF draft です。`op.GrantManagementAction` enum と `op.WithGrantManagement` は godoc で `Experimental:` と明記されており、draft 更新によって通信仕様に互換性のない変更が入り得ます。
:::

::: details 5 つのアクション
- **`create`** — 新規 grant を開始する。`grant_id` を伴ってはなりません。OP が採番して返します。同じユーザとクライアントでも、`create` のたびに別の grant ができます。
- **`replace`** — 参照先の grant の scope と `authorization_details` を、新しいリクエストの内容で上書きする。`grant_id` が必須です。
- **`merge`** — 参照先の grant の scope と `authorization_details` を、新しいリクエストの内容と和集合する。`grant_id` が必須です。
- **`query`** — grant を読む。`GET {grant_management_endpoint}/{grant_id}`。
- **`revoke`** — grant を削除する。`DELETE {grant_management_endpoint}/{grant_id}`。

`create` / `replace` / `merge` は認可リクエストに乗ります。`query` / `revoke` は grant management エンドポイントへの操作です。
:::

## 設定

```go
import "github.com/libraz/go-oidc-provider/op"

op.New(
  /* 必須オプション */
  op.WithGrantManagement([]op.GrantManagementAction{
    op.GrantActionCreate, op.GrantActionReplace, op.GrantActionMerge,
    op.GrantActionQuery, op.GrantActionRevoke,
  }, false),
)
```

第 1 引数は OP が受理するアクションの **閉じた集合** です。`grant_management_actions_supported` として公開され、エンドポイントはこの集合の外の操作を拒否します。第 2 引数は `actionRequired` で、`true` のとき `grant_management_action` を欠いた認可リクエストは拒否されます（discovery が `grant_management_action_required: true` を公開）。アクションは最低 1 つ必要で、それぞれ 5 つの値のいずれかである必要があります。重複や未知のアクションは `op.New` で拒否され、`WithGrantManagement` を 2 度呼んだ場合も同様です。

discovery 文書はこう公開します:

```json
{
  "grant_management_endpoint": "https://op.example.com/oidc/grant_management",
  "grant_management_actions_supported": ["create", "replace", "merge", "query", "revoke"]
}
```

エンドポイントのパスは既定でマウント prefix 配下の `/grant_management` です。`op.WithEndpoints(op.Endpoints{GrantManagement: "..."})` で上書きできます。

## grant の作成と拡張

クライアントは認可リクエストで `grant_management_action`（`replace` / `merge` では `grant_id` も）を渡します:

```sh
# create — grant_id は不可
curl -G --data-urlencode 'grant_management_action=create' \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=demo' \
  --data-urlencode 'redirect_uri=https://rp.example.com/callback' \
  --data-urlencode 'scope=openid profile' \
  https://op.example.com/oidc/auth
```

同じパラメータは [PAR](/ja/use-cases/fapi2-baseline) の push でも検証されます。`create`、`replace`、`merge` のリクエストは、必ず明示的な同意画面を通ります。ファーストパーティ向けの同意の省略も、キャッシュ済みの grant による省略も適用されません。認可コードを交換すると、token レスポンスに grant の id が入ります。

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "grant_id": "g-9f3c..."
}
```

後でその grant を変更するには、クライアントは受け取った `grant_id` を添えて、`grant_management_action=replace`（scope / `authorization_details` を上書き）または `merge`（和集合）で再認可します。ログイン中のユーザとこのクライアントのものではない `grant_id` は、`invalid_grant` で拒否されます。

| アクション | `grant_id` | scope / `authorization_details` への影響 |
|---|---|---|
| `create` | 不可 | 新しいリクエストの内容に設定する |
| `replace` | 必須 | 新しいリクエストの内容で上書きする |
| `merge` | 必須 | 既存と新しいリクエストを和集合する |

## grant の照会

grant id を末尾に付けてエンドポイントを `GET` し、所有者のクライアントとして認証します。このエンドポイントを呼べるのは **confidential** クライアントだけで、public クライアントは `401 invalid_client` になります。URL パスに含まれる `grant_id` は秘密ではなく、プロキシのログやブラウザの履歴に残るためです。OP は所有者を確認するので、クライアントが他のクライアントの grant を読むことはできません。応答には、grant の現在の scope と `authorization_details` が入ります。

```sh
curl -u demo:demo-secret https://op.example.com/oidc/grant_management/g-9f3c...
```

```json
{
  "scopes": [{"scope": "openid profile"}],
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

grant にその項目の内容がなければ、メンバーごと省かれます。

## grant の失効

`DELETE` が対象にするのは、指定された `grant_id` と、それに紐付くものだけです。具体的には、grant の JWT アクセストークン（失効方式に応じて tombstone かレジストリで失効）、opaque アクセストークン、リフレッシュトークン、そして最後に grant レコードです。そのため、後続の照会では「存在しない」と応答します。同じ subject とクライアントが持つ別の grant には影響しません。subject やクライアントのすべての grant を失効させたい場合は、grant ID を列挙して自分で削除してください。

| 結果 | 応答 |
|---|---|
| 失効に成功 | `204 No Content`。その grant の `grant_management.revoked` 監査イベントを記録。別のリクエストが先に削除していた場合も `204` |
| grant が存在しない、または別のクライアントのもの | `404 invalid_request`。連鎖失効は試みない |
| grant ストアが存在の有無を判断できない | `500 server_error`。連鎖失効は行わない。再試行する |
| 連鎖失効の途中で失敗 | `500 server_error` と `grant_management.revoke_failed` の監査イベント。grant レコードは残るので、照会も再実行もできる |
| public クライアント | `401 invalid_client` |

```sh
curl -u demo:demo-secret -X DELETE https://op.example.com/oidc/grant_management/g-9f3c...
```

公開済みの `grant_management_actions_supported` 集合にない操作に対しては、エンドポイントは `405 Method Not Allowed` を返し、`Allow` ヘッダには有効な操作だけを並べます。そのため `query` だけを登録したクライアントには `DELETE` は受理されません。

## 続きはこちら

- [Rich authorization requests](/ja/use-cases/authorization-details) — grant が保持し `merge` が和集合する `authorization_details`。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — 失効カスケードが撤去するもの。
- [監査イベント](/ja/reference/audit-events) — `grant_management.revoked` イベントの形。
