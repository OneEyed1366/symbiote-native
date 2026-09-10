<!--
  A `<style scoped>` block, and specifically the COMPOUND selector inside it — `.badge.loud`
  applies only to an element carrying both tokens, and layers over `.badge` rather than replacing
  it. That combination was silently dead until 2026-08-14 (the scope suffix is appended per
  template token, while the registered key carries it once at the end; symbiote-sfc-style-compiler
  skill §5b), so it is on screen here to keep it honest. Twin of
  examples/svelte/components/CompoundClassDemo.svelte — the two canaries must look identical.

  What each badge proves:
    plain    — `.badge` alone; the compound rule must NOT reach it.
    loud     — static class="badge loud"; `.badge`'s radius/padding survive, `.badge.loud` wins
               the two colours it restates. `.loud` has no standalone rule of its own, which is
               the arrangement that also needed the token list, not just the key.
    dynamic  — the same pair through a :class object the compiler cannot resolve statically, so
               it is scoped at runtime instead of at build time. Both paths must agree.

  The dynamic badge's LABEL is deliberately constant: the e2e journey proves the rule by
  screenshot-diffing that badge across the toggle, and a label that changed with the state
  would make the diff pass even with the compound rule dead.

  `section-nested` / `section-label` / `row` are NOT defined below — they come from App.css and
  pass through unscoped, which is the other half of the rule.
-->
<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from './ActionButton.vue';

const isLoud = ref(false);
</script>

<template>
  <view class="section-nested">
    <text class="section-label">Compound class · scoped style block</text>
    <view class="row">
      <view class="badge" testID="compound-badge-plain">
        <text class="badge-text">plain</text>
      </view>
      <view class="badge loud" testID="compound-badge-loud">
        <text class="badge-text">loud</text>
      </view>
      <view
        :class="isLoud ? 'badge loud' : 'badge'"
        testID="compound-badge-dynamic"
      >
        <text class="badge-text">dynamic</text>
      </view>
    </view>
    <text class="note-text" testID="compound-badge-readout">{{
      isLoud
        ? 'dynamic badge carries both tokens — green border, same pill shape'
        : 'dynamic badge carries only .badge — grey border'
    }}</text>
    <ActionButton
      testID="compound-badge-toggle"
      :title="isLoud ? 'Drop .loud' : 'Add .loud'"
      color="#42b883"
      :onPress="() => (isLoud = !isLoud)"
    />
  </view>
</template>

<style scoped>
.badge {
  padding: 8px;
  border-radius: 999px;
  border-width: 1px;
  border-color: #41506a;
  background-color: #13243a;
}

/* Restates ONLY the two colours: the padding and radius above must survive on `badge loud`. */
.badge.loud {
  border-color: #42b883;
  background-color: #0f2a20;
}

.badge-text {
  font-size: 13px;
  color: #cbd5e1;
}
</style>
