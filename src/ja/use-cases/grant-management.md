---
title: Grant management
description: OAuth 2.0 Grant Management エンドポイントで長命な grant を id 指定で操作し、削除は指定した grant_id だけに限定します。
pageClass: pg-use-cases-grant-management
---

# 使い方 — Grant management

grant が長命になると、継続的な支払いマンデートや常設のデータアクセス同意のように、「一度認可して終わり」では足りない場面が出てきます。クライアントには、grant に名前を付ける、後から内容を追加する、いま保持している内容を読み戻す、不要になったら失効させる、という操作が必要です。[OAuth 2.0 Grant Management draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-grant-management) は各 grant に安定した `grant_id` と、それに対する 5 つのアクションを与えます。

`op.WithGrantManagement` は `grant_management_action` / `grant_id` の認可パラメータを処理し、grant management エンドポイント（照会 / 失効）をマウントし、token レスポンスに `grant_id` を刻み、discovery で feature を公開します。

これは、初回認可のあともクライアントが同意のような grant を管理する必要がある場合に使います。特に grant を後から拡張する、またはブラウザセッションとは独立して失効する必要がある場合に有効です。短命な一回限りのサインインフローでは有効にしない方がよいです。クライアントが grant に名前を付ける必要がないなら、通常の認可コード、リフレッシュトークンローテーション、通常のトークン失効の方が単純です。

<svg role="img" aria-labelledby="gm-lifecycle-title" viewBox="0 0 760 300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="gm-lifecycle-title">grant のライフサイクル。create / replace / merge は認可リクエストに乗って grant の scope と authorization_details を決め、query / revoke は grant management エンドポイントへの操作。grant に紐づくトークンに届くのは revoke だけ。</title>

  <text class="gm-cap" x="111" y="26" text-anchor="middle">認可リクエストに乗る</text>

  <rect x="16" y="40" width="190" height="40" rx="6"/>
  <text class="gm-mode" x="30" y="59">create</text>
  <text class="gm-note" x="30" y="73">grant_id なし — OP が採番</text>

  <rect x="16" y="92" width="190" height="40" rx="6"/>
  <text class="gm-mode" x="30" y="111">replace</text>
  <text class="gm-note" x="30" y="125">scope := 新リクエストの内容</text>

  <rect x="16" y="144" width="190" height="40" rx="6"/>
  <text class="gm-mode" x="30" y="163">merge</text>
  <text class="gm-note" x="30" y="177">scope := 既存 ∪ 新規</text>

  <path d="M206 60 H240"/>
  <path d="M206 112 H240"/>
  <path d="M206 164 H240"/>
  <path d="M240 60 V164"/>
  <path d="M240 108 H272"/>
  <path d="M266 104 L274 108 L266 112"/>

  <rect class="gm-grant" x="274" y="60" width="212" height="96" rx="8"/>
  <text class="gm-grant-title" x="380" y="88" text-anchor="middle">Grant</text>
  <text class="gm-mono" x="380" y="108" text-anchor="middle">grant_id = g-9f3c…</text>
  <rect class="gm-chip" x="288" y="118" width="184" height="28" rx="5"/>
  <text class="gm-chip-text" x="380" y="136" text-anchor="middle">scope + authorization_details</text>

  <path d="M380 156 V196"/>
  <path d="M376 190 L380 199 L384 190"/>

  <rect class="gm-tokens" x="274" y="200" width="212" height="86" rx="8"/>
  <text class="gm-sub" x="380" y="220" text-anchor="middle">この grant に紐づくトークン</text>
  <text class="gm-token" x="380" y="240" text-anchor="middle">JWT アクセストークン</text>
  <text class="gm-token" x="380" y="258" text-anchor="middle">opaque アクセストークン</text>
  <text class="gm-token" x="380" y="276" text-anchor="middle">リフレッシュトークン</text>

  <text class="gm-cap" x="649" y="26" text-anchor="middle">grant management エンドポイント</text>

  <rect x="554" y="40" width="190" height="40" rx="6"/>
  <text class="gm-mono" x="568" y="60">GET …/{grant_id}</text>
  <text class="gm-note" x="568" y="74">scope と details を返す</text>

  <rect x="554" y="92" width="190" height="40" rx="6"/>
  <text class="gm-mono" x="568" y="112">DELETE …/{grant_id}</text>
  <text class="gm-note" x="568" y="126">204 · grant レコード削除</text>

  <text class="gm-sub" x="649" y="152" text-anchor="middle">紐づくトークンすべてに波及</text>

  <path d="M552 60 H520 V90 H492"/>
  <path d="M498 86 L490 90 L498 94"/>
  <path d="M552 112 H520 V243 H492"/>
  <path d="M498 239 L490 243 L498 247"/>
</svg>

下段の箱に届くのは `revoke` だけです。`create` / `replace` / `merge` は grant が保持する内容を書き換え、`query` はそれを読み戻します。`revoke` は grant レコードを削除したうえで、そこにぶら下がるトークンを失効させます。

::: warning Experimental — IETF draft を追跡
Grant Management は公開済みの RFC ではなく IETF draft です。`op.GrantManagementAction` enum と `op.WithGrantManagement` は godoc で `Experimental:` と明記されており、draft 更新によって通信仕様に互換性のない変更が入り得ます。
:::

::: details 5 つのアクション
- **`create`** — 新規 grant を開始する。`grant_id` を伴ってはなりません。OP が採番して返します。
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

第 1 引数は OP が受理するアクションの **閉じた集合** です。`grant_management_actions_supported` として公開され、エンドポイントはこの集合の外の操作を拒否します。第 2 引数は `actionRequired` で、`true` のとき `grant_management_action` を欠いた認可リクエストは拒否されます（discovery が `grant_management_action_required: true` を公開）。アクションは最低 1 つ必要で、それぞれ 5 つの値のいずれかである必要があります。重複や未知のアクションは `op.New` で拒否されます。

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

同じパラメータは [PAR](/ja/use-cases/fapi2-baseline) の push でも検証されます。認可コード交換のあと、token レスポンスが grant の id を保持します:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "grant_id": "g-9f3c..."
}
```

後でその grant を拡張するには、クライアントは受け取った `grant_id` を添えて `grant_management_action=replace`（scope / `authorization_details` を上書き）または `merge`（和集合）で再認可します。

| アクション | `grant_id` | scope / `authorization_details` への影響 |
|---|---|---|
| `create` | 不可 | 新しいリクエストの内容に設定する |
| `replace` | 必須 | 新しいリクエストの内容で上書きする |
| `merge` | 必須 | 既存と新しいリクエストを和集合する |

## grant の照会

grant id を末尾に付けてエンドポイントを `GET` し、所有クライアントとして認証します。OP はクライアントの所有権を強制し — クライアントは他のクライアントの grant を読めません — grant の現在の scope と `authorization_details` を返します:

```sh
curl -u demo:demo-secret https://op.example.com/oidc/grant_management/g-9f3c...
```

```json
{
  "scopes": [{"scope": "openid profile"}],
  "authorization_details": [{"type": "payment_initiation", "actions": ["initiate"]}]
}
```

## grant の失効

`DELETE` は指定された `grant_id` だけを削除し、その grant に紐付く artefact へ cascade します。grant の JWT アクセストークンを tombstone / denylist し、grant に束ねられた opaque アクセストークンとリフレッシュトークンを失効させ、grant レコードを削除します。これにより後続の照会は「もう存在しない」と応答します。同じ subject / client が持つ別の grant には影響しません。

成功時、OP は `204 No Content` を返し、指定 grant の `grant_management.revoked` 監査イベントを発火します。grant が確実に存在しない場合、または別 client の所有である場合は、cascade を試みず `404` を返します。grant store が存在を判断できない障害を返した場合、OP は `500 server_error` を返し、cascade を行いません。cascade の副作用が失敗した場合は、`500 server_error` を返して `grant_management.revoke_failed` を発火し、grant を再試行可能かつ照会可能な状態に残します。失効成功とは記録しません。別リクエストが先に削除したことによる最終 delete の `NotFound` は冪等な成功として扱い、`204` を返します。

`grant_id` を失効単位として扱ってください。subject または client の全 grant を失効させたい配備では、grant ID を列挙して各 ID を明示的に削除してください。

```sh
curl -u demo:demo-secret -X DELETE https://op.example.com/oidc/grant_management/g-9f3c...
```

公開済みの `grant_management_actions_supported` 集合にない操作に対しては、エンドポイントは `405 Method Not Allowed` を返し、`Allow` ヘッダには有効な操作だけを並べます。そのため `query` だけを登録したクライアントには `DELETE` は受理されません。

## 続きはこちら

- [Rich authorization requests](/ja/use-cases/authorization-details) — grant が保持し `merge` が和集合する `authorization_details`。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — 失効カスケードが撤去するもの。
- [監査イベント](/ja/reference/audit-events) — `grant_management.revoked` イベントの形。
