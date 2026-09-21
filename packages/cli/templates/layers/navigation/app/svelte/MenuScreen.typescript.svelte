<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { PLUS_ICON_URI, REACT_NATIVE_LOGO_URI, SVELTE_LOGO_URI } from './image-uris';

  const navigation = useStackNavigation();
  let count = $state<number>(0);
</script>

<safe-area-view class="screen">
  <view class="brand-row">
    <image
      class="brand-logo brand-logo-react"
      resizeMode="contain"
      source={{ uri: REACT_NATIVE_LOGO_URI }}
    />
    <image class="plus-icon" resizeMode="contain" source={{ uri: PLUS_ICON_URI }} />
    <image
      class="brand-logo brand-logo-svelte"
      resizeMode="contain"
      source={{ uri: SVELTE_LOGO_URI }}
    />
  </view>

  <text class="title">Welcome to SymbioteNative!</text>
  <text class="subtitle">Framework-agnostic React Native, driven by Svelte.</text>

  <view class="counter-card">
    <text class="counter-label">TAPS</text>
    <text class="counter-value">{count}</text>
  </view>

  <view class="button-row">
    <pressable class="button-primary" onPress={() => (count += 1)}>
      <text class="button-primary-text">Tap me</text>
    </pressable>
    <pressable class="button-secondary" onPress={() => navigation.current.push('Details')}>
      <text class="button-secondary-text">Go to Details</text>
    </pressable>
  </view>
</safe-area-view>
