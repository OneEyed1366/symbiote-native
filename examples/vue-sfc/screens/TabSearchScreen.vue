<!-- Prints what `jumpTo` passed in, and writes back through `setParams` with its own key -->
<script setup lang="ts">
import { useIsFocused, useRoute, useTabNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';

const route = useRoute();
const tabs = useTabNavigation();
const isFocused = useIsFocused();
const COLOR = LINE_COLOR.structure;
</script>

<template>
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <text class="section-label">Search tab</text>
      <text class="info-text">{{ `focused: ${isFocused}` }}</text>
      <text testID="tabs-search-params" class="info-text">
        {{ `params: ${JSON.stringify(route.params) ?? 'none'}` }}
      </text>
      <ActionButton
        testID="tabs-set-params"
        title="setParams on this tab"
        :onPress="() => tabs.setParams({ touched: true }, route.key)"
        :color="COLOR"
      />
    </view>
  </scroll-view>
</template>
