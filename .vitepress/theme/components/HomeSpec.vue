<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

type Part = { text: string; mono?: boolean }
type Row = { key: string; parts: Part[]; link: string }

const { lang } = useData()
const isJa = computed(() => lang.value === 'ja')

const heading = computed(() => (isJa.value ? 'ライブラリ仕様' : 'Specification'))

const rows = computed<Row[]>(() =>
  isJa.value
    ? [
        {
          key: 'INTERFACE',
          parts: [
            { text: 'op.New(...)', mono: true },
            { text: ' が ' },
            { text: 'http.Handler', mono: true },
            { text: ' を返す — ' },
            { text: 'net/http', mono: true },
            { text: '、' },
            { text: 'chi', mono: true },
            { text: '、' },
            { text: 'gin', mono: true }
          ],
          link: '/ja/getting-started/mount'
        },
        {
          key: 'PROFILE',
          parts: [
            { text: 'op.WithProfile(profile.FAPI2Baseline)', mono: true },
            { text: ' — PAR · JAR · DPoP を一括有効化' }
          ],
          link: '/ja/use-cases/fapi2-baseline'
        },
        {
          key: 'STORAGE',
          parts: [
            { text: 'Store インターフェースで持ち込み — ' },
            { text: 'inmem', mono: true },
            { text: ' · ' },
            { text: 'sql', mono: true },
            { text: ' · ' },
            { text: 'redis', mono: true },
            { text: ' · ' },
            { text: 'composite', mono: true }
          ],
          link: '/ja/use-cases/sql-store'
        },
        {
          key: 'TOKENS',
          parts: [
            { text: '自動ローテーション、再利用検知、' },
            { text: 'offline_access', mono: true },
            { text: ' の TTL 分離' }
          ],
          link: '/ja/concepts/refresh-tokens'
        },
        {
          key: 'CONFORMANCE',
          parts: [{ text: 'OFCS 138 PASSED · 0 FAILED · 3 プラン' }],
          link: '/ja/compliance/ofcs'
        },
        {
          key: 'SPA',
          parts: [{ text: 'ヘッドレス interaction で React からログインを駆動' }],
          link: '/ja/use-cases/spa-custom-interaction'
        }
      ]
    : [
        {
          key: 'INTERFACE',
          parts: [
            { text: 'op.New(...)', mono: true },
            { text: ' returns ' },
            { text: 'http.Handler', mono: true },
            { text: ' — ' },
            { text: 'net/http', mono: true },
            { text: ', ' },
            { text: 'chi', mono: true },
            { text: ', ' },
            { text: 'gin', mono: true }
          ],
          link: '/getting-started/mount'
        },
        {
          key: 'PROFILE',
          parts: [
            { text: 'op.WithProfile(profile.FAPI2Baseline)', mono: true },
            { text: ' — PAR · JAR · DPoP at one switch' }
          ],
          link: '/use-cases/fapi2-baseline'
        },
        {
          key: 'STORAGE',
          parts: [
            { text: 'BYO via store interface — ' },
            { text: 'inmem', mono: true },
            { text: ' · ' },
            { text: 'sql', mono: true },
            { text: ' · ' },
            { text: 'redis', mono: true },
            { text: ' · ' },
            { text: 'composite', mono: true }
          ],
          link: '/use-cases/sql-store'
        },
        {
          key: 'TOKENS',
          parts: [
            { text: 'Refresh rotation, reuse detection, ' },
            { text: 'offline_access', mono: true },
            { text: ' TTL bucket' }
          ],
          link: '/concepts/refresh-tokens'
        },
        {
          key: 'CONFORMANCE',
          parts: [{ text: 'OFCS 138 PASSED · 0 FAILED · 3 plans' }],
          link: '/compliance/ofcs'
        },
        {
          key: 'SPA',
          parts: [{ text: 'Headless interaction driver — drive login from a React SPA' }],
          link: '/use-cases/spa-custom-interaction'
        }
      ]
)
</script>

<template>
  <section class="op-spec" :aria-label="heading">
    <div class="op-spec-inner">
      <header class="op-spec-header">
        <span class="op-spec-kicker">§ SPEC</span>
        <h2 class="op-spec-heading">{{ heading }}</h2>
      </header>
      <div class="op-spec-list" role="list">
        <a v-for="row in rows" :key="row.key" :href="row.link" class="op-spec-row" role="listitem">
          <span class="op-spec-key">{{ row.key }}</span>
          <span class="op-spec-desc">
            <template v-for="(p, j) in row.parts" :key="j"
              ><code v-if="p.mono">{{ p.text }}</code
              ><template v-else>{{ p.text }}</template></template
            >
          </span>
        </a>
      </div>
    </div>
  </section>
</template>
