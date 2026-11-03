<script lang="ts">
  import { useRoute } from '@symbiote-native/navigation/svelte';

  const route = useRoute();
</script>

<scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
  <view class="scroll-content">
    <text class="section-label">Profile tab</text>
    <text testID="tabs-profile-params" class="info-text">
      {`params: ${JSON.stringify(route.current.params) ?? 'none'}`}
    </text>
  </view>
</scroll-view>
