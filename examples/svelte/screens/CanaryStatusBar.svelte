<script lang="ts">
  import { Platform, StatusBar } from '@symbiote-native/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ACCENT, STATUS_BAR_DEFAULT, STATUS_BAR_RED } from './canary-shared';

  let isHidden = $state(false);
  let isDark = $state(false);
  let isRed = $state(false);
  let isTranslucent = $state(false);

  function toggleRed(): void {
    isRed = !isRed;
    StatusBar.setBackgroundColor(isRed ? STATUS_BAR_RED : STATUS_BAR_DEFAULT, true);
  }

  function toggleTranslucent(): void {
    isTranslucent = !isTranslucent;
    StatusBar.setTranslucent(isTranslucent);
  }
</script>

<!-- JS -> native: StatusBar renders nothing and drives the OS status bar from these props -->
<StatusBar barStyle={isDark ? 'dark-content' : 'light-content'} hidden={isHidden} animated />
<view class="row">
  <view class="flex1">
    <ActionButton
      title={isHidden ? 'Show status bar' : 'Hide status bar'}
      onPress={() => (isHidden = !isHidden)}
      color={ACCENT}
    />
  </view>
  <view class="flex1">
    <ActionButton title={isDark ? 'Light text' : 'Dark text'} onPress={() => (isDark = !isDark)} color={ACCENT} />
  </view>
</view>
<!-- Android-only window flags. PASS: the strip changes and the app stays rendered -->
{#if Platform.OS === 'android'}
  <view class="row">
    <view class="flex1">
      <ActionButton title={isRed ? 'BG default' : 'BG red'} onPress={toggleRed} color={ACCENT} />
    </view>
    <view class="flex1">
      <ActionButton title={isTranslucent ? 'Opaque' : 'Translucent'} onPress={toggleTranslucent} color={ACCENT} />
    </view>
  </view>
{/if}
