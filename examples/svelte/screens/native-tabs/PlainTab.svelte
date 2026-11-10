<script lang="ts">
  import { useRoute } from '@symbiote-native/navigation/svelte';

  const PLAIN_TABS: Record<string, { testID: string; body: string }> = {
    Inbox: { testID: 'native-tabs-inbox', body: 'Inbox carries the badge' },
    Locked: { testID: 'native-tabs-locked-tab', body: 'You opened Locked' },
    Search: { testID: 'native-tabs-search-tab', body: 'The search role tab' },
  };

  // Inbox, Locked and Search are one view each, the route name picks which one it is
  const route = useRoute();
  const tab = $derived(PLAIN_TABS[route.current.name]);
</script>

<view testID={tab?.testID} class="screen">
  <view class="scroll-content">
    <text class="info-text">{tab?.body}</text>
  </view>
</view>
