<script setup lang="ts">
import { computed, ref } from 'vue';
import StyleShowcaseToggle from '../../components/StyleShowcaseToggle.vue';
import { classList } from './class-list';

const tokenA = ref(false);
const tokenB = ref(false);
const tokenC = ref(false);

const triClass = computed(() =>
  classList('sc-tri', {
    'sc-t-a': tokenA.value,
    'sc-t-b': tokenB.value,
    'sc-t-c': tokenC.value,
  }),
);
const activeTokenCount = computed(
  () => [tokenA.value, tokenB.value, tokenC.value].filter(Boolean).length,
);
</script>

<template>
  <view class="sc-panel">
    <text class="sc-panel-title">
      3 · Compound selectors — eight combinations, four tokens
    </text>
    <text class="sc-panel-note">
      Rules keyed on one, two, and all three modifiers over a shared base. With
      everything on, the node carries FOUR class tokens — the count at which the
      retired collapse-and-permute registry silently stopped matching. Each rule
      restates only what it changes, so the base's size and centring have to
      survive underneath all of them.
    </text>
    <view :class="triClass" testID="sc-tri-tile">
      <text class="sc-tri-text">
        {{
          tokenA && tokenB && tokenC
            ? 'three-token rule'
            : `${activeTokenCount} modifier(s)`
        }}
      </text>
    </view>
    <text class="sc-readout" testID="sc-tri-readout">
      {{ triClass }}
    </text>
    <StyleShowcaseToggle
      testID="sc-tri-a-toggle"
      label=".sc-t-a · lime ring"
      :active="tokenA"
      :onToggle="() => (tokenA = !tokenA)"
    />
    <StyleShowcaseToggle
      testID="sc-tri-b-toggle"
      label=".sc-t-b · blue fill"
      :active="tokenB"
      :onToggle="() => (tokenB = !tokenB)"
    />
    <StyleShowcaseToggle
      testID="sc-tri-c-toggle"
      label=".sc-t-c · round"
      :active="tokenC"
      :onToggle="() => (tokenC = !tokenC)"
    />
  </view>
</template>
