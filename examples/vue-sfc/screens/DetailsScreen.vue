<!--
  A second native screen, pushed onto the SAME RNSScreenStack the canary screen lives in —
  proves push/pop, the native header (title from options, back button/back-title), and
  route.params round-tripping through the navigator handle. Vue SFC twin of
  .examples/react/screens/DetailsScreen.tsx.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useStackNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';

// This screen is only ever mounted under a Stack, so useStackNavigation() hands back the
// Stack-specific handle (pop/canGoBack/…) directly — no union narrowing. useRoute() reads the
// current route off the injected navigation scope.
const route = useRoute();
const navigation = useStackNavigation();

const paramsLabel = computed(() => {
  const params = route.value.params;
  return typeof params === 'object' && params !== null && 'openedFrom' in params
    ? String(params.openedFrom)
    : 'none';
});
</script>

<template>
  <safe-area-view class="screen">
    <view class="section">
      <text class="section-label">Navigation demo · Details screen</text>
      <text class="info-text">{{ `route.params: ${paramsLabel}` }}</text>
      <text class="info-text">{{
        `canGoBack: ${navigation.canGoBack()}`
      }}</text>
      <ActionButton
        testID="nav-pop"
        title="← Pop back"
        :onPress="() => navigation.pop()"
        :color="LINE_COLOR.primitives"
      />
    </view>
  </safe-area-view>
</template>
