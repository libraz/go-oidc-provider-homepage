---
title: Grant management
description: OAuth 2.0 Grant Management エンドポイントで、長命な grant を id 指定で作成・置換・統合・照会・失効する。
---

# ユースケース — Grant management

grant が長命になると、継続的な支払いマンデートや常設のデータアクセス同意のように、「一度認可して終わり」では足りない場面が出てきます。クライアントには、grant に名前を付ける、後から内容を追加する、いま保持している内容を読み戻す、不要になったら失効させる、という操作が必要です。[OAuth 2.0 Grant Management draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-grant-management) は各 grant に安定した `grant_id` と、それに対する 5 つのアクションを与えます。

`op.WithGrantManagement` は `grant_management_action` / `grant_id` の認可パラメータを処理し、grant management エンドポイント（照会 / 失効）をマウントし、token レスポンスに `grant_id` を刻み、discovery で feature を公開します。

これは、初回認可のあともクライアントが同意のような grant を管理する必要がある場合に使います。特に grant を後から拡張する、またはブラウザセッションとは独立して失効する必要がある場合に有効です。短命な一回限りのサインインフローでは有効にしない方がよいです。クライアントが grant に名前を付ける必要がないなら、通常の認可コード、リフレッシュトークンローテーション、通常のトークン失効の方が単純です。

::: warning Experimental — IETF draft を追跡
Grant Management は公開済みの RFC ではなく IETF draft です。`op.GrantManagementAction` enum と `op.WithGrantManagement` は godoc で `Experimental:` と明記されており、v1.0 までに通信仕様に互換性のない draft 更新があれば変わり得ます。
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

`DELETE` は grant を失効させ、関連するトークンへカスケードします。grant の JWT アクセストークンを tombstone / denylist し、grant に束ねられた opaque アクセストークンとリフレッシュトークンを失効させ、grant レコードを削除します。これにより後続の照会は「もう存在しない」と応答します。

失効単位は「指定された `grant_id` だけ」ではなく、同じ subject と同じ client が持つ active grant 全体です。実装は対象 grant の subject を基準に `Grants.ListBySubject` を引き、同じ `ClientID` の grant ID を集めて同じ cascade を適用します。複数の履歴 grant を保持するストアでも、クライアントから見える同一ユーザ・同一クライアントの同意状態が中途半端に残らないようにするためです。OP は `204 No Content` を返し、`grant_management.revoked` 監査イベントに `revoked_grant_ids` を載せます。

```sh
curl -u demo:demo-secret -X DELETE https://op.example.com/oidc/grant_management/g-9f3c...
```

公開済みの `grant_management_actions_supported` 集合にない操作に対しては、エンドポイントは `405 Method Not Allowed` を返し、`Allow` ヘッダには有効な操作だけを並べます。そのため `query` だけを登録したクライアントには `DELETE` は受理されません。

## 続きはこちら

- [Rich authorization requests](/ja/use-cases/authorization-details) — grant が保持し `merge` が和集合する `authorization_details`。
- [リフレッシュトークン](/ja/concepts/refresh-tokens) — 失効カスケードが撤去するもの。
- [監査イベント](/ja/reference/audit-events) — `grant_management.revoked` イベントの形。
