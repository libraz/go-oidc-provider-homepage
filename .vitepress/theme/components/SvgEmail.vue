<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

// 'libraz@libraz.net' encoded — decoded client-side so crawlers
// do not see the literal string in static HTML.
const encoded = 'bGlicmF6QGxpYnJhei5uZXQ='
const text = ref('')
const href = computed(() => (text.value ? `mailto:${text.value}` : '#'))
const svgRef = ref<SVGSVGElement | null>(null)
const viewBox = ref('0 0 240 30')

onMounted(async () => {
  text.value = atob(encoded)
  await nextTick()
  const textEl = svgRef.value?.querySelector('text')
  if (textEl) {
    const bbox = textEl.getBBox()
    // Crop the viewBox to actual text bounds so trailing whitespace
    // does not introduce a gap when the SVG sits next to surrounding
    // punctuation (e.g. a period at the end of a sentence).
    viewBox.value = `0 0 ${Math.ceil(bbox.x + bbox.width)} 30`
  }
})
</script>

<template>
  <a :href="href" class="svg-email" rel="nofollow">
    <svg
      ref="svgRef"
      :viewBox="viewBox"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Email address"
    >
      <text x="0" y="22" class="svg-email-text">{{ text }}</text>
    </svg>
  </a>
</template>

<style scoped>
.svg-email {
  display: inline-block;
  vertical-align: middle;
  text-decoration: none;
}

.svg-email svg {
  height: 1.5em;
  width: auto;
}

.svg-email-text {
  font-size: 20px;
  font-family: var(--vp-font-family-base);
  fill: var(--vp-c-brand-1);
}

.svg-email:hover .svg-email-text {
  text-decoration: underline;
  fill: var(--vp-c-brand-2);
}
</style>
