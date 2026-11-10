<!-- Prints what `jumpTo` passed in, and writes back through `setParams` with its own key -->
<script lang="ts">
  import {
    useIsFocused,
    useRoute,
    useTabNavigation,
  } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { LINE_COLOR } from '../navigation-lines';

  const COLOR = LINE_COLOR.structure;
  const route = useRoute();
  const tabs = useTabNavigation();
  const isFocused = useIsFocused();
</script>

<scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
  <view class="scroll-content">
    <text class="section-label">Search tab</text>
    <text class="info-text">{`focused: ${isFocused.current}`}</text>
    <text testID="tabs-search-params" class="info-text">
      {`params: ${JSON.stringify(route.current.params) ?? 'none'}`}
    </text>
    <ActionButton
      testID="tabs-set-params"
      title="setParams on this tab"
      onPress={() => tabs.current.setParams({ touched: true }, route.current.key)}
      color={COLOR}
    />
  </view>
</scroll-view>
