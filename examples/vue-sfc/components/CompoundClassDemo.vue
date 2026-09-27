<!-- A `<style scoped>` block, and specifically the COMPOUND selector inside it — `.badge.loud`
  applies only to an element carrying both tokens, layering over `.badge` rather than replacing it
  (symbiote-sfc-style-compiler skill §5b). Twin of the Svelte canary — must look identical. -->

<!-- plain: `.badge` alone, compound rule must NOT reach it. loud: static class="badge loud",
  `.badge.loud` wins the two colours it restates. dynamic: same pair via a :class object the
  compiler can't resolve statically — both paths must agree. -->

<!-- The dynamic badge's LABEL is deliberately constant: an e2e journey screenshot-diffs it across
  the toggle, and a label that changed with state would pass even with the rule dead. -->

<!-- `section-nested` / `section-label` / `row` are NOT defined below — they come from App.css and
  pass through unscoped, which is the other half of the rule. -->
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
    <text class="note-text" testID="compound-badge-readout">
      {{
        isLoud
          ? 'dynamic badge carries both tokens — green border, same pill shape'
          : 'dynamic badge carries only .badge — grey border'
      }}
    </text>
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
