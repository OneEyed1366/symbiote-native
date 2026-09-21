<script>
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';

  const navigation = useStackNavigation();
</script>

<safe-area-view class="screen">
  <view class="details-card">
    <text class="details-title">You made it!</text>
    <text class="details-body">
      This screen was pushed by the Stack navigator — proof navigation actually works.
    </text>
  </view>
  <pressable class="button-secondary" onPress={() => navigation.current.pop()}>
    <text class="button-secondary-text">Go back</text>
  </pressable>
</safe-area-view>
