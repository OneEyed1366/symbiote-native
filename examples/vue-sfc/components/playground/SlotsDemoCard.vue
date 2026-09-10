<!--
  Default slot + named slot (#footer) + scoped slot (#body, handing a computed `tone` back up to
  the parent's slot content) — the SAME mechanism vue-adapter-slots documents as load-bearing for
  every list/cell surface in this adapter (FlatList's #item, SectionList's #sectionHeader), just
  exercised directly here instead of through a list. useSlots() checks slot PRESENCE at runtime
  (whether the parent bothered to pass #footer); defineSlots() is the sibling compiler macro for
  IDE/type hints only — it compiles away, so there is nothing to read back from it at runtime, it
  just needs to be present for the type-check half of this row.
-->
<script setup lang="ts">
import { useSlots } from 'vue';

defineSlots<{
  default?: () => unknown;
  footer?: () => unknown;
  body?: (scope: { tone: string }) => unknown;
}>();

const slots = useSlots();
const hasFooter = !!slots.footer;
const tone = 'scoped-from-child';
</script>

<template>
  <view class="a11y-card">
    <text class="switch-label">SlotsDemoCard</text>
    <slot />
    <slot name="body" :tone="tone" />
    <text class="note-text" testID="slots-has-footer">{{
      `useSlots(): footer slot passed = ${hasFooter}`
    }}</text>
    <slot name="footer" />
  </view>
</template>
