---
title: SPA / 対話画面のカスタマイズ
description: JSON の状態エンドポイントを通じて、SPA からログインと同意を扱います。終端のエンベロープ、CSP、ceremony の origin ルールも明記します。
pageClass: pg-use-cases-spa-custom-interaction
---

# ユースケース — SPA / 対話画面のカスタマイズ

## 「対話画面（interaction）」レイヤとは

RP の `/auth` へのリダイレクトから、OP が code を付けて RP へ戻すまでの間に、OP は **interaction** を実行します。ログイン、任意の MFA ステップアップ、任意の同意画面、任意のアカウント選択です。OIDC Core 1.0 §3.1 は通信路上のデータ（要求パラメータと最終応答）を定めていますが、**この中間のページをどう描画するか**は定めていません。UX は OP ごとに選びます。

ライブラリはこの UX を、差し替え可能な `interaction.Driver` として扱います。既定のドライバはサーバ側で HTML を描画します。JSON ドライバは同じ画面を JSON で返すので、SPA が描画できます。独自のドライバを書けば、任意のフロントエンドと接続できます。どの場合も状態機械は OP にあります。フロントエンドは次の prompt を取得してユーザの回答を送り返し、その次を OP が決めます。

::: info どのオプションを使うか
| 目的 | 使うもの |
|---|---|
| ログイン全体を扱う SPA（React、Vue、Svelte など） | `op.WithSPAUI(op.SPAUI{LoginMount: "/login"})`。OP が状態エンドポイント `/login/state/{uid}` を公開し、`StaticDir` を設定すれば入口とアセットも配信します。最後のリダイレクトは、SPA が辿れる JSON のエンベロープに変換されます。 |
| ブラウザ以外のクライアント、または HTML 以外を描画するドライバ | `op.WithInteractionDriver(...)`（たとえば `interaction.JSONDriver{}`）。状態エンドポイントは `/interaction/{uid}` で、最後の応答は RP への素の `302` です。`fetch()` ではこれを辿れません。 |

このページは SPA の経路を扱います。通しで動く例は [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) です。名前に反して、同梱のバンドルは素の HTML、CSS、JS です。
:::

::: details このページで触れる仕様
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — §3.1（認可エンドポイント）、§3.1.2.4（同意）
- [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html) — `/end_session`
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE（Proof Key for Code Exchange）
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — OAuth 2.0 for Native Apps, §8.1（ブラウザ上の public client）
- [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749) — §5.2（エラーの JSON 応答）
:::

::: details 用語の補足
- **対話画面（interaction）レイヤ**: RP の `/auth` へのリダイレクトから、OP が code を付けて戻すまでの間の処理全体です（ログイン、任意の MFA ステップアップ、任意の同意、任意のアカウント選択）。通信路上のパラメータは仕様で決まっていますが、中間ページの見せ方は決まっていません。ここが差し替え口です。
- **JSON ドライバ**: 画面を HTML ではなく JSON で返すドライバです。フロントエンドは `{ type: "auth.password" | "consent.scope" | ... }` を取得して描画し、回答を送り返します。
- **CSP（Content Security Policy）**: ページが読み込んでよいリソースの種類をブラウザに伝えるレスポンスヘッダ（`Content-Security-Policy: default-src 'none'; ...`）です。OP 自身の HTML ページは厳格なポリシーを持つので、悪意ある `error_description` が XSS に化けることはありません。
:::

> **ソース:** [`examples/10-react-login`](https://github.com/libraz/go-oidc-provider/tree/main/examples/10-react-login) は `op.WithSPAUI` で OP 側に SPA をマウントする構成です。[`examples/16-custom-interaction`](https://github.com/libraz/go-oidc-provider/tree/main/examples/16-custom-interaction) は `JSONDriver` を独自ドライバで包む例です。[`examples/17-spa-composite-store`](https://github.com/libraz/go-oidc-provider/tree/main/examples/17-spa-composite-store) は本番に近い組み合わせで、SPA interaction、永続状態用の MySQL、セッション・interaction・消費済み JTI 用の Redis を一緒に動かします。バンドルはビルド手順なしで動かすために手書きですが、接続点はフレームワークに依存しません。

## アーキテクチャ

`op.WithSPAUI` を使うと、`/auth` はブラウザを `LoginMount/{uid}` にリダイレクトします。SPA は `LoginMount/state/{uid}` で OP と通信します。

| メソッド | パス | 役割 |
|---|---|---|
| `GET` | `LoginMount/{uid}` | SPA の入口（`index.html`）。`StaticDir` を設定すると OP が配信し、未設定なら自前のルートで配信 |
| `GET` | `LoginMount/assets/{path...}` | バンドルのアセット。`StaticDir` を設定したときに配信 |
| `GET` | `LoginMount/state/{uid}` | 現在の prompt を JSON で返す |
| `POST` | `LoginMount/state/{uid}` | 現在の prompt に対するユーザの送信を受ける |
| `DELETE` | `LoginMount/state/{uid}` | 進行中の interaction をキャンセルする |

`op.SPAUI` のうちルーティングに影響するフィールドは `LoginMount` だけです。`ConsentMount` と `LogoutMount` は非推奨で何もしません。同意は同じ状態ルートを通り、ログアウトの確認は通常の `/end_session` のフローに残ります。

<figure class="fig">
  <div class="fig-head">SPA が各画面を JSON で取りにいく</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-spa-title" viewBox="0 0 960 920" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-spa-title">authorize エンドポイントは、ブラウザをログイン用マウントの SPA 入口へリダイレクトします。以降 SPA は各 interaction の状態を OP から JSON で取得し、回答を送り返し、最後に redirect エンベロープに従って RP へ戻ります。</title>
    <line class="fg-life" x1="192" y1="88" x2="192" y2="896"/>
    <line class="fg-life" x1="512" y1="88" x2="512" y2="896"/>
    <line class="fg-life fg-life--accent" x1="824" y1="88" x2="824" y2="896"/>
    <!-- actors -->
    <rect class="fg-box" x="88" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="192" y="50" text-anchor="middle">ユーザのブラウザ</text>
    <text class="fg-xs" x="192" y="72" text-anchor="middle">リダイレクトを辿る</text>
    <rect class="fg-box" x="408" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t" x="512" y="50" text-anchor="middle">SPA バンドル</text>
    <text class="fg-xs" x="512" y="72" text-anchor="middle">自前のコード · 自前の UI</text>
    <rect class="fg-box fg-box--accent" x="720" y="24" width="208" height="64" rx="8"/>
    <text class="fg-t fg-accent" x="824" y="50" text-anchor="middle">OP</text>
    <text class="fg-mxs" x="824" y="72" text-anchor="middle">go-oidc-provider</text>
    <!-- authorize request -->
    <path class="fg-edge" d="M192,136 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m fg-halo" x="508" y="126" text-anchor="middle">GET /auth?…</text>
    <!-- redirect to shell -->
    <path class="fg-edge fg-edge--accent" d="M824,208 H192" marker-end="url(#fg-ac)"/>
    <text class="fg-m fg-halo" x="508" y="174" text-anchor="middle">302 → /login/{uid}</text>
    <text class="fg-xs fg-halo" x="508" y="196" text-anchor="middle">uid を作成 · cookie を設定</text>
    <!-- fetch shell -->
    <path class="fg-edge" d="M192,272 H512" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="352" y="262" text-anchor="middle">GET /login/{uid}</text>
    <!-- shell returned -->
    <path class="fg-edge fg-edge--muted" d="M512,328 H192" marker-end="url(#fg-am)"/>
    <text class="fg-m" x="352" y="318" text-anchor="middle">200 index.html</text>
    <!-- fetch state -->
    <path class="fg-edge" d="M512,400 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="366" text-anchor="middle">GET /login/state/{uid}</text>
    <text class="fg-mxs" x="668" y="388" text-anchor="middle">Accept: application/json</text>
    <!-- prompt -->
    <path class="fg-edge fg-edge--accent" d="M824,472 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="668" y="438" text-anchor="middle">200 { type:"auth.password" }</text>
    <text class="fg-mxs" x="668" y="460" text-anchor="middle">inputs · state_ref · …</text>
    <!-- render the form -->
    <path class="fg-edge fg-edge--muted" d="M512,504 h40 v24 h-40" marker-end="url(#fg-am)"/>
    <text class="fg-s" x="568" y="510">フォームを自前で描画する</text>
    <!-- submit credentials -->
    <path class="fg-edge" d="M512,592 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="558" text-anchor="middle">POST /login/state/{uid}</text>
    <text class="fg-mxs" x="668" y="580" text-anchor="middle">{ state_ref, values }</text>
    <!-- consent prompt -->
    <path class="fg-edge fg-edge--accent" d="M824,664 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="668" y="630" text-anchor="middle">200 { type:"consent.scope" }</text>
    <text class="fg-xs" x="668" y="652" text-anchor="middle">または redirect 応答</text>
    <!-- submit scopes -->
    <path class="fg-edge" d="M512,736 H824" marker-end="url(#fg-a)"/>
    <text class="fg-m" x="668" y="702" text-anchor="middle">POST /login/state/{uid}</text>
    <text class="fg-mxs" x="668" y="724" text-anchor="middle">approved_scopes</text>
    <!-- redirect envelope -->
    <path class="fg-edge fg-edge--accent" d="M824,808 H512" marker-end="url(#fg-ac)"/>
    <text class="fg-m" x="668" y="774" text-anchor="middle">200 { type:"redirect", … }</text>
    <text class="fg-mxs" x="668" y="796" text-anchor="middle">location=https://rp/cb?code=…</text>
    <!-- navigate -->
    <path class="fg-edge" d="M512,872 H192" marker-end="url(#fg-a)"/>
    <text class="fg-s" x="352" y="862" text-anchor="middle">ブラウザを location へ遷移させる</text>
  </svg>
  <figcaption class="fig-note">SPA の入口を返したあと、OP が返すのは JSON だけです。OP は各画面が何を尋ねるべきかを記述するだけで、見た目も描画に使うフレームワークも組み込み側にあります。</figcaption>
</figure>

## コード

### SPA をマウントする

```go
provider, err := op.New(
  /* 必須オプション */
  op.WithSPAUI(op.SPAUI{
    LoginMount: "/login",
    StaticDir:  "./web/dist", // 省略可。OP が入口とアセットを配信する
  }),
)
if err != nil {
  log.Fatal(err)
}
http.ListenAndServe(":8080", provider)
```

`StaticDir` が空なら、OP は状態ルートだけを公開し、`LoginMount/{uid}` へリダイレクトします。その入口は自前で配信してください。

```go
mux := http.NewServeMux()
mux.Handle("GET /login/{uid}", spaShell) // 自前の index.html を返す
mux.Handle("/", provider)                // /login/state/{uid} とプロトコルのエンドポイントは OP が持つ
```

`op.WithSPAUI` を使わない場合、既定のドライバは HTML ドライバです。`op.WithInteractionDriver(interaction.JSONDriver{})` だけを渡すと、同じ JSON の契約が `/interaction/{uid}` に移りますが、そこでの終端の応答は `fetch()` で読めない `302` です。ブラウザの SPA には `op.WithSPAUI` を使ってください。

### フロントエンドのコード

::: code-group

```jsx [React]
import { useEffect, useState } from "react";

// FieldKind の値: 0=text, 1=password, 2=otp code, 3=email, 4=hidden。
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

// 最終的な認可応答は、リダイレクトではなくエンベロープで届く。
function deliver(next) {
  if (next.type === "redirect") {
    window.location.href = next.location;
    return true;
  }
  if (next.type === "form_post") {
    const form = document.createElement("form");
    form.method = "post";
    form.action = next.action;
    for (const [name, value] of Object.entries(next.fields)) {
      const input = document.createElement("input");
      Object.assign(input, { type: "hidden", name, value });
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return true;
  }
  return false;
}

export function Interaction({ uid }) {
  const stateURL = `/login/state/${uid}`;
  const [prompt, setPrompt] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    fetch(stateURL, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setPrompt);
  }, [uid]);

  async function onSubmit(e) {
    e.preventDefault();
    const r = await fetch(stateURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": prompt.csrf_token ?? "",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ state_ref: prompt.state_ref, values }),
    });
    if (!r.ok) return; // 本文を parse する前にステータスを確認する。JSON とは限らない
    const next = await r.json();
    if (!deliver(next)) {
      setPrompt(next);
      setValues({});
    }
  }

  if (!prompt) return null;
  return (
    <form onSubmit={onSubmit}>
      {prompt.inputs?.map((f) => (
        <label key={f.Name}>
          <span>{f.Label || f.Name}</span>
          <input
            name={f.Name}
            type={inputTypeFor(f.Kind)}
            required={f.Required}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.Name]: e.target.value }))
            }
          />
        </label>
      ))}
      <button type="submit">Continue</button>
    </form>
  );
}
```

```vue [Vue 3]
<script setup>
import { ref, reactive, onMounted } from "vue";

const props = defineProps({ uid: String });
const stateURL = `/login/state/${props.uid}`;
const prompt = ref(null);
const values = reactive({});

// FieldKind の値: 0=text, 1=password, 2=otp code, 3=email, 4=hidden。
const inputTypeFor = (kind) =>
  ({ 1: "password", 3: "email", 4: "hidden" })[kind] ?? "text";

// 最終的な認可応答は、リダイレクトではなくエンベロープで届く。
function deliver(next) {
  if (next.type === "redirect") {
    window.location.href = next.location;
    return true;
  }
  if (next.type === "form_post") {
    const form = document.createElement("form");
    form.method = "post";
    form.action = next.action;
    for (const [name, value] of Object.entries(next.fields)) {
      const input = document.createElement("input");
      Object.assign(input, { type: "hidden", name, value });
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return true;
  }
  return false;
}

onMounted(async () => {
  const r = await fetch(stateURL, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (r.ok) prompt.value = await r.json();
});

async function onSubmit() {
  const r = await fetch(stateURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": prompt.value.csrf_token ?? "",
      Accept: "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      state_ref: prompt.value.state_ref,
      values,
    }),
  });
  if (!r.ok) return; // 本文を parse する前にステータスを確認する。JSON とは限らない
  const next = await r.json();
  if (!deliver(next)) {
    prompt.value = next;
    for (const k of Object.keys(values)) delete values[k];
  }
}
</script>

<template>
  <form v-if="prompt" @submit.prevent="onSubmit">
    <label v-for="f in prompt.inputs" :key="f.Name">
      <span>{{ f.Label || f.Name }}</span>
      <input
        :name="f.Name"
        :type="inputTypeFor(f.Kind)"
        :required="f.Required"
        v-model="values[f.Name]"
      />
    </label>
    <button type="submit">Continue</button>
  </form>
</template>
```

:::

どちらのタブも同じループです。prompt を GET し、その `inputs` を描画し、`{ state_ref, values }` を POST して、応答が終端のエンベロープになるまで繰り返します。ここでは汎用の `inputs` だけを描画しています。実際のフロントエンドは `prompt.type` でも分岐させてください。同意、アカウント選択、captcha、パスキーの prompt は、内容を `data` に載せるためです。

通信路上の形は、`op/interaction` の定義そのままです。

- **Prompt**: `type`、`data`、`inputs`、`state_ref`、`csrf_token` に加えて、ロケール情報の `locale`、`ui_locales_hint`、`locales_available`（[i18n / ロケール解決](/ja/use-cases/i18n#解決済みロケールの読み取り) を参照）を持ちます。JSON タグは lower_snake_case です。組み込みの種別は `auth.password`、`auth.totp`、`auth.email_otp.send`、`auth.email_otp.verify`、`auth.passkey`、`auth.recovery_code`、`captcha`、`consent.scope`、`interaction.chooser` です。独自の prompt には組織のプリフィックスを付けます。
- **`FieldSpec` と `data`**: これらの Go 構造体には JSON タグがないため、メンバー名は大文字で始まります（`Name`、`Kind`、`Label`、`Required`、`MaxLen`、`MinLen`、`Pattern`、そして `Scopes`、`Client`、`Accounts`、`AddAccountURL`）。`Kind` は上のコードにある整数の列挙です。
- **まずステータス**: `200` は prompt か終端のエンベロープを運びます。`204` は interaction がキャンセルされ、通知すべき `redirect_uri` がなかったことを表します。それ以外はエラーで、本文は通常 `{"error", "error_description"}` ですが、`text/plain` のこともあります。`r.json()` を呼ぶ前に `r.ok` を確認してください。
- **終端のエンベロープ**: 最終的な認可応答はリダイレクトにできません。`fetch()` は cross-origin のリダイレクトを辿れず、自動送信の HTML ページも実行できないためです。そこで OP は 2 種類のエンベロープのどちらかを返し、SPA がそれをドキュメントレベルで届けます。

| `type` | 形 | SPA がすること | 対応するレスポンスモード |
|---|---|---|---|
| `redirect` | `{"type":"redirect","location":"<url>"}` | `window.location.href = location` | `query`、JARM の `query.jwt` / `fragment.jwt` |
| `form_post` | `{"type":"form_post","action":"<redirect_uri>","fields":{...}}` | 隠しフォームを作って送信する | `form_post`、JARM の `form_post.jwt` |

`form_post` の分岐を省くと、フローが止まります。RP に応答が届きません。

::: tip 同意のステップ
`prompt.type === "consent.scope"` のときは、scope を `prompt.data.Scopes`（各要素は `Name`、`Description`、`Required`）から、クライアントを `prompt.data.Client` から読みます。prompt は、`approved_scopes` という text の入力を 1 つ宣言します。SPA は承認した scope 名をスペースで連結して、`{ approved_scopes: "openid profile" }` として送ります。一部だけの承認もできますが、必須の scope を外した送信は 4xx で拒否されます。リクエスト全体を拒否するときは、状態の URL に `DELETE` を送ります。[カスタム同意 UI](/ja/use-cases/custom-consent-ui) も参照してください。
:::

::: info なぜ `X-CSRF-Token` を送るのか
OP は `HttpOnly` の `__Host-oidc_csrf` cookie を設定し、同じ値を各 prompt の `csrf_token` にも入れます。script から cookie は読めないため、SPA が値を得る手段は prompt だけです。SPA の仕事は、POST のたびに `prompt.csrf_token` を `X-CSRF-Token` ヘッダにコピーすることです。OP はヘッダと cookie を照合します（double-submit パターン）。SPA がトークンを生成したり保存したりすることはありません。
:::

## エラーの描画

リダイレクト先を信頼できる前に失敗した場合（未登録の `client_id`、壊れたリクエストなど）の返し方は、ドライバによって変わります。JSON ドライバは常に RFC 6749 §5.2 のエンベロープ `{"error": "...", "error_description": "...", "state": "..."}` を返します。HTML ドライバも同じですが、リクエストが `Accept: text/html` を優先する場合は、同じ項目を 1 つの要素の `data-*` 属性として持つページを返します。

```html
<div id="op-error"
     data-code="invalid_request_uri"
     data-description="request_uri has expired"
     data-state="abc">
  <h1>Authorization error</h1>
  ...
</div>
```

このページには script、style、画像が含まれず、攻撃者が制御できる `state` を含むすべての値が HTML エスケープされています。HTML ドライバの既定のポリシー `default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'` のもとで配信されます。

## CORS と cookie

SPA の入口を OP と同じ origin から配信する場合（上のコードの構成）は、CORS の設定は不要で、`credentials: "same-origin"` が正しい指定です。

SPA が別の origin にあるときは、その origin を `op.WithCORSOrigins` に追加します。ceremony（状態ルートと `/end_session` の確認）が受け付けるのは、issuer の origin と `op.WithCORSOrigins` に渡した origin だけで、クライアントの `redirect_uri` の origin は数えません。さらに、その origin は issuer と same-site でなければなりません。本当に cross-site の origin は preflight を通過することはありますが、ブラウザが `__Host-` の ceremony cookie を送らないため（`__Host-oidc_interaction` は `SameSite=Lax`、`__Host-oidc_csrf` と `__Host-oidc_logout_csrf` は `SameSite=Strict`）、状態ルートは `404` を返します。ログイン UI は、`op.example.com` と並べた `login.example.com` のような issuer の兄弟ホストに置き、OP を絶対 URL で呼び、`credentials: "include"` を指定してください。API 側の話は [SPA 向け CORS](/ja/use-cases/cors-spa) にあります。

## SPA 全体を作らずに同意画面を変える

同意画面の文言だけを変えるなら、`op.WithLocale` でキーを重ねます。同梱の HTML ドライバがそれを使い、CSP と CSRF の扱いもそのまま残ります。トランスポートは OP に任せたままマークアップを自前にしたいなら、`op.WithConsentUI` を使います。ただし `op.WithSPAUI` とは同時に使えません。[カスタム同意 UI](/ja/use-cases/custom-consent-ui) と [i18n / ロケール解決](/ja/use-cases/i18n) を参照してください。
