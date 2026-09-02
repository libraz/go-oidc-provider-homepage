<script setup lang="ts">
/**
 * Shared arrowheads for every hand-authored figure on the site.
 *
 * Rendered once per document by Layout.vue so a page's SVG can reference
 * `url(#fg-a)` and friends without carrying its own `<defs>` — which,
 * with the same diagram appearing in both locales and often twice on one
 * page, would otherwise mean duplicate element ids in the document.
 *
 * The heads are sized in user space, so they stay identical whatever
 * stroke width the edge they terminate happens to use. Their fill comes
 * from figures.css, so they follow the light / dark tables like the rest
 * of the figure layer.
 *
 * `display: none` is deliberately avoided: some engines stop resolving
 * marker references into a subtree that was never laid out.
 */
</script>

<template>
  <svg class="fg-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <marker
        id="fg-a"
        markerUnits="userSpaceOnUse"
        markerWidth="9"
        markerHeight="8"
        refX="8.5"
        refY="4"
        orient="auto"
      >
        <path class="fg-head-ink" d="M0,0 L9,4 L0,8 Z" />
      </marker>
      <marker
        id="fg-ac"
        markerUnits="userSpaceOnUse"
        markerWidth="9"
        markerHeight="8"
        refX="8.5"
        refY="4"
        orient="auto"
      >
        <path class="fg-head-accent" d="M0,0 L9,4 L0,8 Z" />
      </marker>
      <marker
        id="fg-am"
        markerUnits="userSpaceOnUse"
        markerWidth="9"
        markerHeight="8"
        refX="8.5"
        refY="4"
        orient="auto"
      >
        <path class="fg-head-muted" d="M0,0 L9,4 L0,8 Z" />
      </marker>
      <marker
        id="fg-ad"
        markerUnits="userSpaceOnUse"
        markerWidth="9"
        markerHeight="8"
        refX="8.5"
        refY="4"
        orient="auto"
      >
        <path class="fg-head-danger" d="M0,0 L9,4 L0,8 Z" />
      </marker>
      <marker
        id="fg-ao"
        markerUnits="userSpaceOnUse"
        markerWidth="9"
        markerHeight="8"
        refX="8.5"
        refY="4"
        orient="auto"
      >
        <path class="fg-head-ok" d="M0,0 L9,4 L0,8 Z" />
      </marker>
    </defs>
  </svg>
</template>

<style scoped>
.fg-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
</style>
