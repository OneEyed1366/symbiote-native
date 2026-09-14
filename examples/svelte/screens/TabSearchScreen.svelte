<script lang="ts">
  // Tabs demo · Search tab: registered with a tabBarBadge (TabsDemoScreen.svelte's <TabScreen>).
  // Svelte twin of examples/vue-sfc/screens/TabSearchScreen.vue.
  import { useIsFocused } from '@symbiote-native/navigation/svelte';
  import { ROUTE_NAME } from '../routes';
  import { ROUTE_LINE_INFO } from '../navigation-lines';

  const isFocused = useIsFocused();
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];
</script>

<safe-area-view class="screen">
  <view class="section">
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <text class="section-label">Search tab</text>
    <text class="info-text">{`focused: ${isFocused.current}`}</text>
  </view>
</safe-area-view>
