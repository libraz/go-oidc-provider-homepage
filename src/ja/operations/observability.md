---
title: 可観測性
description: 同期的な監査ログ、issuer ラベル付き Prometheus、組み込み側が所有する HTTP トレースを OP に接続します。
outline: 2
pageClass: pg-operations-observability
---

# 可観測性

本番で必要な可視化は 4 系統あります。ここでいう **監査イベント** は、OP がセキュリティ上意味のある判断（ログイン、トークン発行、リフレッシュトークンの再利用など）ごとに出す構造化レコードのことで、プロセスの動作を伝える運用ログとは別物です。

| 系統 | 載るもの | OP 側の差し込み口 | 組み込み側の責務 |
|---|---|---|---|
| 運用ログ | リクエストエラー、設定の問題、起動時の状態 | `WithLogger(*slog.Logger)` | 構造化ログの送り先 |
| 監査イベント | 発火するシグナルと予約語（[カタログ](/ja/reference/audit-events)） | `WithAuditLogger(*slog.Logger)` | SOC パイプライン |
| メトリクス | OIDC の業務カウンタ | `WithPrometheus(*prometheus.Registry)` | `/metrics` ルート |
| トレース | リクエストスパン | 内蔵なし | `http.Handler` を `otelhttp.NewMiddleware` でラップ |

ライブラリはこれらを意図的に分離しています。任意のサブセットだけを組み込むことができます。

<figure class="fig">
  <div class="fig-head">OP はイベントを出し、振り分けは運用基盤が担う</div>
  <svg class="fig-svg" role="img" aria-labelledby="observability-title" viewBox="0 0 960 480" xmlns="http://www.w3.org/2000/svg">
    <title id="observability-title">OP はプロトコル層の監査イベントを出し、その外側の HTTP 層はリクエスト ID とトレーススパンを出します。運用基盤がその両方を、運用ログ・監査ログ・メトリクス・トレースへ振り分けます。</title>
    <text class="fg-lbl" x="32" y="40">出す側</text>
    <text class="fg-lbl" x="568" y="40">届く先</text>
    <!-- http layer -->
    <rect class="fg-box" x="32" y="152" width="400" height="96" rx="8"/>
    <text class="fg-t" x="48" y="180">自前の HTTP 層</text>
    <text class="fg-s" x="48" y="204">OP を既に包んでいるミドルウェア</text>
    <text class="fg-mxs" x="48" y="228">リクエスト ID · スパン · status · latency</text>
    <!-- OP handler -->
    <rect class="fg-box fg-box--accent" x="32" y="280" width="400" height="96" rx="8"/>
    <text class="fg-t fg-accent" x="48" y="308">OP のハンドラ</text>
    <text class="fg-s" x="48" y="332">プロトコル処理だけを担う</text>
    <text class="fg-mxs" x="48" y="356">監査イベント — 判断 1 件につき 1 つ</text>
    <path class="fg-leader" d="M432,200 H500 M432,328 H500 M500,108 V420"/>
    <!-- 運用ログ -->
    <path class="fg-edge fg-edge--thin" d="M500,108 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="72" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="100">運用ログ</text>
    <text class="fg-s" x="584" y="124">このリクエストで何が起きたか</text>
    <!-- 監査ログ -->
    <path class="fg-edge fg-edge--thin" d="M500,212 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="176" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="204">監査ログ</text>
    <text class="fg-s" x="584" y="228">誰に何がいつ許可されたか</text>
    <!-- Prometheus -->
    <path class="fg-edge fg-edge--thin" d="M500,316 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="280" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="308">Prometheus</text>
    <text class="fg-s" x="584" y="332">エンドポイントごとの流量とレイテンシ</text>
    <!-- OpenTelemetry -->
    <path class="fg-edge fg-edge--thin" d="M500,420 H568" marker-end="url(#fg-a)"/>
    <rect class="fg-box" x="568" y="384" width="360" height="72" rx="8"/>
    <text class="fg-t" x="584" y="412">OpenTelemetry</text>
    <text class="fg-s" x="584" y="436">OP が収まっているスパン</text>
  </svg>
  <figcaption class="fig-note">本ライブラリは logger も registry も exporter も持ちません。イベントを出すだけで、振り分けは既存の基盤に任せます。だから OP は既存のダッシュボードの隣ではなく、その中に現れます。</figcaption>
</figure>

## 構造化ログ

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

op.New(
    /* ... */
    op.WithLogger(logger),
)
```

運用ログがカバーする範囲:

- 起動時の設定警告。
- エンドポイント内部のエラー（典型的には `IsServerError(err)` が一致するもの — [エラーカタログ](/ja/reference/errors) を参照）。
- ストアバックエンドの障害。

`WithLogger` を渡さない場合、ライブラリはログを破棄します（`slog.Default()` へのフォールバックはしません）。渡したハンドラは redaction フックで自動的にラップされ、OAuth/OIDC のシークレットにちなんだ名前の属性（`access_token`、`refresh_token`、`id_token`、`code`、`code_verifier`、`client_secret`、`password`、`state`、`nonce`、`dpop`、`authorization`、`cookie`、`set-cookie`）は、ハンドラに到達する前にマスクされます。

## 監査ログ

監査イベントは保管期間・索引・アクセス制御が運用ログとは違うので、独立した出力先（sink）にします:

```go
auditFile, _ := os.OpenFile("/var/log/op/audit.jsonl",
    os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
auditLogger := slog.New(slog.NewJSONHandler(auditFile, nil))

op.New(
    /* ... */
    op.WithAuditLogger(auditLogger),
)
```

各イベントは JSON 1 行で記録されます。すべてのレコードに `audit="true"` が付くので、共有のハンドラでも監査行だけを専用の出力先へ振り分けられます。`event` 属性にはイベント名（`"login.failed"` など）が入り、`msg` は人間向けの短いメッセージです。`actor_id`、`client_id`、`session_id`、`request_id`、`ip`、`user_agent`、`tag` は設定時だけ出力され、空でない `extras` グループにカテゴリ固有のフィールドが入ります。全イベント名は [監査イベントカタログ](/ja/reference/audit-events) を参照してください。

`WithAuditLogger` を渡さない場合、監査レコードは `WithLogger` のロガーへ流れます。どちらも渡さなければ破棄されます。

`WithAuditLogger` のハンドラは、リクエストの goroutine 上で同期的に実行され、OP はその戻りを待ってからレスポンスを書きます。出力先が遅いと、その遅延がトークン・認可・ログアウトのすべてのリクエストに乗ります。遅い I/O や無制限の queue でブロックさせず、並行呼び出しに対して安全にしてください。最終的な出力先がリモートなら、上限付きで並行安全な queue にレコードを渡します。OP はリトライせず、ハンドラが panic してもリクエストは失敗させずに回復します。カタログには OP が発火しない予約語もあるため、すべての定数を発火の証拠として扱わないでください。

::: tip 1 本のストリームを複数の出力先へ
1 つの `*slog.Logger` を fan-out 用のハンドラに通せば、ファイル + Loki + Splunk に同時に流せます。OP は自身で `slog.Record` を構築し、logger の `Handler().Handle(...)` に直接渡します。`logger.LogAttrs(...)` でイベントを作り直すことはありません。これにより `WithClock` が供給した監査 timestamp が保たれます。
:::

### introspection の store 障害

opaque access token または refresh token の lookup が `store.ErrNotFound` を返す場合は通常の inactive 結果であり、障害イベントは発火しません。それ以外の lookup error では、`store_unavailable` reason を付けた error level の `AuditIntrospectionError` (`introspection.error`) を発火します。`/introspect` の通信路上の応答は HTTP 200 と `{"active":false}` のままなので、アラートと調査では 5xx counter ではなく監査ストリームを参照してください。同じイベントは、`/introspect` でクライアント認証に失敗した場合の記録にも使われます。このエンドポイントが `client_authn.failure` ではなく専用のシグナルを持つのはそのためです。

## Prometheus メトリクス

```go
reg := prometheus.NewRegistry()

op.New(
    /* ... */
    op.WithPrometheus(reg),
)

// /metrics は好きなルートにマウント。通常は公開 OP のリスナでは
// なく、認可境界の裏に置く。
mux := http.NewServeMux()
mux.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
go http.ListenAndServe("127.0.0.1:9090", mux)
```

ライブラリは `/metrics` をマウントしません。ルートと境界は組み込み側が選択します。カウンタは監査カタログから厳選した部分集合で、同じ発行経路から更新されます。すべての系列に定数ラベル `issuer` が付くので、複数の provider が 1 つの registry を共有できます。ただし同じ issuer の provider を同じ registry に載せると `op.New` が失敗します。`client_id` ラベルは静的に登録したクライアントでのみ埋まり、動的登録のクライアントは空の値にまとまるため、カーディナリティは抑えられます。registry を渡して OP を動かし、全カウンタを一覧できる [`examples/52-prometheus-metrics`](https://github.com/libraz/go-oidc-provider/tree/main/examples/52-prometheus-metrics) も参照してください。

| カウンタ | ラベル | 数えるもの |
|---|---|---|
| `oidc_token_issued_total` | `grant_type`、`client_id` | 開始された refresh chain の数（開始した grant 別）。refresh token を発行しない grant は数えません |
| `oidc_tokens_refreshed_total` | `client_id` | 完了したリフレッシュトークンのローテーション |
| `oidc_login_attempts_total` | `factor`、`result` | ログインと MFA の試行 |
| `oidc_refresh_replay_detected_total`、`oidc_code_replay_detected_total` | なし | 再利用されたリフレッシュトークンと認可コード |
| `oidc_client_authn_failures_total` | `auth_method`、`reason` | クライアント認証の失敗 |
| `oidc_back_channel_logout_total`、`oidc_logout_failures_total` | `result`、`kind` | back-channel の配送結果と、ログアウト時の永続化失敗 |
| `oidc_dcr_events_total`、`oidc_device_authorization_events_total`、`oidc_device_code_events_total`、`oidc_ciba_events_total`、`oidc_token_exchange_events_total`、`oidc_custom_grant_events_total` | `event` | フローごとの結果。ラベルは、監査イベント名からプレフィックスを除いたもの |
| `oidc_introspection_errors_total`、`oidc_token_revoke_failures_total`、`oidc_key_retired_kid_presented_total` | なし、`kind`、なし | introspection の障害、失効の副作用の失敗、退役した `kid` の提示 |

### OP が出**さない**メトリクス

これらは OP ではなく HTTP ミドルウェアの領域です:

- HTTP リクエスト時間ヒストグラム — OP のハンドラの周りに `promhttp.InstrumentHandlerDuration` をかぶせてください。
- HTTP ステータスコードカウンタ — 同上。
- in-flight リクエストゲージ — 同上。

組み込みパターン:

```go
inFlight := prometheus.NewGauge(prometheus.GaugeOpts{
    Name: "op_http_requests_in_flight",
})
duration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
    Name: "op_http_request_duration_seconds",
}, []string{"code", "method"})
reg.MustRegister(inFlight, duration)

instrumented := promhttp.InstrumentHandlerInFlight(inFlight,
    promhttp.InstrumentHandlerDuration(duration, opHandler))

http.Handle("/", instrumented)
```

この分離があるため、HTTP 層を差し替え（chi、gin、fiber など）ても、OP 側のメトリクスには手を入れる必要がありません。

## トレース

OP は `http.Handler` を返します。OpenTelemetry の HTTP ミドルウェアで 1 度だけラップしてください:

```go
import "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

http.Handle("/", otelhttp.NewHandler(opHandler, "oidc-op"))
```

スパンを作るのは `otelhttp.NewHandler` などのミドルウェアであって、OP ではありません。本ライブラリは、リクエストのライフサイクルも業務処理も含め、OpenTelemetry のスパンを一切内蔵しません。`/token` 内の PKCE 検証にどれだけかかったかといった段階別のトレースが必要なら、組み込み側で計装してください。監査イベントカタログが提供するのはスパンではなく、離散的なイベント記録です。

## リクエスト ID

OP は `X-Request-ID` や `Traceparent` ヘッダからリクエスト ID を抽出することはなく、自ら ID を生成することもありません。監査レコードには `request_id` 属性がありますが、OP 自身のハンドラはこれを設定しないため、ストリームには現れません。リクエストとレスポンスの相関付けは、[トレース](#トレース)で HTTP 層全般について述べたのと同じく、組み込み側の責務です。

エッジでリクエスト ID を生成し、レスポンスに刻んで RP のログと相関を取れるようにし、OP の周りで組み込む自前のログでも相関キーとして使ってください:

```go
http.Handle("/", requestIDMiddleware(opHandler))

func requestIDMiddleware(h http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        rid := r.Header.Get("X-Request-ID")
        if rid == "" {
            rid = newUUID()
            r.Header.Set("X-Request-ID", rid)
        }
        w.Header().Set("X-Request-ID", rid)
        h.ServeHTTP(w, r)
    })
}
```

## 推奨ダッシュボード

最低限の本番ダッシュボードは以下を出します:

| パネル | ソース | アラート閾値 |
|---|---|---|
| `grant_type` 別の新規 refresh chain 数 | `oidc_token_issued_total` | ベースライン比 50 % 以上の持続的な低下 |
| `/token` の 5xx 率 | HTTP ミドルウェアのヒストグラム | 5 分窓で 0.5 % 超 |
| `refresh.replay_detected` の発生率 | `oidc_refresh_replay_detected_total` または監査ログ | 0 超（非ゼロ自体が要調査） |
| `bcl.no_sessions_for_subject` の発生率 | 監査ログ | 発生率の上昇を grant / client 状態と相関し、snapshot の文脈は別途確認 |
| アクティブセッション数 | ストアのクエリまたは自前メトリクス | 30 % 超の低下 |
| JWKS リクエスト率 | HTTP ミドルウェア | RP キャッシュの健全性指標 |

最初の 3 つが本番異常の S/N が高い指標です。`bcl.no_sessions_for_subject` の発生率が上昇したら、運用者は grant / client 状態と突き合わせて原因を絞り込んでください。設定した `posture` は logout trigger と session snapshot の永続性を読み解くための文脈であり、空の RP audience の原因ではありません。残り 2 つは RP 側の regression を捕まえます。

## レート制限と濫用シグナル

本ライブラリは認可エンドポイント・`/par`・`/token`・`/userinfo` その他の公開エンドポイントに対して、組み込みのレート制限を **同梱していません**。`WithRateLimit` のようなオプションも存在しません。レート制限は運用側の役割です — リバースプロキシ（NGINX、Envoy、Traefik）、エッジサービス（Cloudflare、Fastly）、あるいは `*op.Provider`（`http.Handler` を実装）の前段ミドルウェアが、IP 単位・クライアント単位のリクエスト枠を持つべき場所です。ライブラリ側にあるかのように書くのは誤った期待を生むだけです。

ライブラリが代わりに発行しているのは、実際の制限がどこに置かれていても濫用パイプラインが消費して攻撃者をスコアリングできる、構造化された監査イベント群です:

| 監査イベント | 定数 | 何を示すか |
|---|---|---|
| `pkce.violation` | `op.AuditPKCEViolation`（予約語） | カタログ名は予約されています。OP は PKCE 拒否を通信路上で返しますが、この監査イベントは発火しません。 |
| `redirect_uri.mismatch` | `op.AuditRedirectURIMismatch`（予約語） | カタログ名は予約されています。OP は mismatch を通信路上で返しますが、この監査イベントは発火しません。 |
| `client_authn.failure` | `op.AuditClientAuthnFailure` | `/token`・`/par`・`/device_authorization`・`/bc-authorize` でのクライアント認証失敗。`/introspect` は別の `op.AuditIntrospectionError` を使い、`/revoke` はどちらも使いません。 |
| `device_code.verification.user_code_brute_force` | `op.AuditDeviceCodeUserCodeBruteForce` | デバイスコード確認画面で user_code が総当たりされている。レコードに紐付く helper はレコード単位で制限し、最初の手入力画面を複数レプリカで動かす場合は共有 limiter と `devicecodekit.VerifyUserCodeByAttemptKey` を使います — 確認 helper は [Device Code](/ja/use-cases/device-code) を参照。 |
| `ciba.poll_abuse.lockout` | `op.AuditCIBAPollAbuseLockout` | クライアントが CIBA の `auth_req_id` を間隔より速くポーリングし続け、違反回数の閾値を超えた。閾値を超えたリクエスト自体には `slow_down` が返り、レコードが deny されるので、次のポーリングは `access_denied` になります。SOC ツールが相関できるよう、OP はイベントを発行します。 |
| `rate_limit.exceeded` | `op.AuditRateLimitExceeded` | 組み込み側のレート制限ミドルウェアから発火させるための予約イベント。ライブラリは定数だけ定義してカタログの一貫性を保ちますが、内部経路から発火させはしません。 |
| `rate_limit.bypassed` | `op.AuditRateLimitBypassed` | 同じ趣旨 — 組み込み側ミドルウェアが明示的な bypass（許可リスト済み IP、内部プローブ等）を記録するためのもの。 |

最後の 2 つは、ライブラリが運用側ミドルウェアと共有する語彙であって、内部イベントではありません。リバースプロキシやミドルウェアが枠を執行してリクエストを通した（あるいは拒否した）ときに、同じ監査ロガーへこれらを発行すれば、解析パイプラインが 1 本の一貫したストリームを観測できます。

::: tip 推奨パターン
1. **リバースプロキシまたはエッジサービスでグローバルなレートを執行する** — 例えば `/token` は IP 当たり 100 req/s、`/par` はもっと低めに。これが攻撃者にリクエストを「コスト」として支払わせる実機構です。
2. **監査パイプラインがバーストにアラートを出す** — 単一 IP・ASN・`client_id` から `client_authn.failure` が立て続けに来たとき。これは「誰かが OP を突いている」ことを示す S/N の高いイベントです。予約語である PKCE と redirect mismatch は現在 OP から発火しません。
3. **クライアント単位の許可リストで攻撃面を上流で削る。** `WithCORSOrigins` も `redirect_uris` レジストリも許可リストとして働きます — 小さく保つほど、設定ミスや侵害されたクライアントが晒す攻撃面は減ります。
:::

### ライブラリが内部でロックアウトしている挙動

汎用の IP 単位レート制限では塞げない 3 つの濫用経路だけは、ライブラリ側にロックアウトが組み込まれています — 攻撃者は IP を安価に切り替えられ、保護対象がエントロピーの低いコードや subject 単位の credential（任意の URL ではない）だからです:

- **ログインのブルートフォース（要素跨ぎ）。** `op.WithAuthnLockoutStore` を組み込むと、組み込みの第 2 要素 `Step`（`StepTOTP`、`StepEmailOTP`、`StepRecoveryCode`）が同じ subject 単位カウンタを参照するので、攻撃者が要素を切り替えて推測予算を 2 倍にすることはできません。ストアは 24 時間のローリングウィンドウを持ち、累計 30 回の失敗で 1 時間、90 回で 24 時間ロックします。このカウンタは primary credential（パスワードの試行制限はユーザストアの責務）と `ExternalStep` の要素には及びません。失敗した試行は、ロックを発動させた試行も含めて `op.AuditLoginFailed` または `op.AuditMFAFailed`、成功は `op.AuditLoginSuccess` または `op.AuditMFASuccess` になります。`op.AuditLockoutStalled` は、compare-and-swap の競合で失敗試行がカウントされずに中断されたことを示します。同じ `actor_id` で出続ける場合、その subject は閾値に達することなく推測を続けられる状態です。
- **Device Code user_code の総当たり。** レコードに紐付く helper では `op/devicecodekit` が record ごとの strike カウンタを持ちます。最初の手入力画面で `device_code` が無い場合は、opaque で安定した key と共有 `AttemptLimiter` を使って `VerifyUserCodeByAttemptKey` を呼びます。ミスマッチごとに `op.AuditDeviceCodeUserCodeBruteForce` が発火し、レプリカごとに予算が分かれることを防げます。
- **CIBA poll abuse。** トークンエンドポイントは、単一の `auth_req_id` が間隔より速くポーリングされた回数を数えます。閾値に達すると、リクエストストアの `Deny` を `reason="poll_abuse"` で呼んで `op.AuditCIBAPollAbuseLockout` が発火し、以後のポーリングには `access_denied` が返ります。グローバルなレート制限で行儀の良い RP まで巻き添えにすることなく、病的な RP だけを止められます。

これらの防御はいずれも **専用の** 監査イベントを発火します。`rate_limit.exceeded` / `rate_limit.bypassed` ではありません。

| 区分 | 執行する側 | 観測されるイベント |
|---|---|---|
| 汎用 HTTP レート制限（IP 単位、エンドポイント単位、`client_id` 単位） | 組み込み側ミドルウェア（リバースプロキシ、ゲートウェイ、Go ハンドラチェーン） | `op.AuditRateLimitExceeded` / `op.AuditRateLimitBypassed` — 組み込み側が OP の監査ロガーに発火させる |
| 用途特化のブルートフォース防御（ログイン、user_code、ポーリング間隔） | ライブラリ内部 | `op.AuditLoginFailed` / `op.AuditMFAFailed`、`op.AuditDeviceCodeUserCodeBruteForce`、`op.AuditCIBAPollAbuseLockout` |

それ以外 — `client_authn` 失敗の継続や、通信路上で返る PKCE / `redirect_uri` 拒否 — には組み込みの HTTP リミッタがありません。client-auth 失敗は監査シグナルですが、PKCE と redirect mismatch は予約語です。これは意図的な分担です。OP は所有するシグナルを発行する側、運用側はそれに対する応答（ブロック、スロットル、ページング）を決める側、という切り分けです。

## ログ保持

目安であり、実際の期間はコンプライアンス要件に置き換えてください。

| 系統 | 典型保持期間 |
|---|---|
| 運用 | 7 〜 30 日 |
| audit | **コンプライアンス要件次第**。典型的には 1 〜 7 年 |
| メトリクス | 高解像度で 30 〜 90 日、その後はロールアップ |

監査ログはロングテールでコストの掛かる系統です。保管はそれ用に分離して見積もってください。1 イベント自体は小さいですが、高負荷な OP では量が多くなります。
