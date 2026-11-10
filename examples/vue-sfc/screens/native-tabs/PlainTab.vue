<!-- Inbox, Locked and Search are one view each, the route name picks which one it is -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';

const PLAIN_TABS: Record<string, { testID: string; body: string }> = {
  Inbox: { testID: 'native-tabs-inbox', body: 'Inbox carries the badge' },
  Locked: { testID: 'native-tabs-locked-tab', body: 'You opened Locked' },
  Search: { testID: 'native-tabs-search-tab', body: 'The search role tab' },
};

const route = useRoute();
const tab = computed(() => PLAIN_TABS[route.value.name]);
</script>

<template>
  <view :testID="tab?.testID" class="screen">
    <view class="scroll-content">
      <text class="info-text">{{ tab?.body }}</text>
    </view>
  </view>
</template>
