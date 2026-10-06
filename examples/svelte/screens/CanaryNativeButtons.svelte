<script lang="ts">
  import { ActionSheetIOS, Alert, Linking, Platform, Share, Vibration } from '@symbiote-native/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ACCENT, SHEET_CANCEL_INDEX, SHEET_OPTIONS, SITE } from './canary-shared';

  // A rejected promise (no native module, user cancel) is expected here, so it is dropped
  function share(): void {
    void Share.share({ message: 'Sent from symbiote', url: SITE }).catch(() => {});
  }

  function showAlert(): void {
    Alert.alert('symbiote', 'Native AlertManager reached.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Vibrate', onPress: () => Vibration.vibrate() },
    ]);
  }

  function showActionSheet(): void {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: SHEET_OPTIONS, cancelButtonIndex: SHEET_CANCEL_INDEX },
      (index: number) => {
        if (index === 0) share();
        if (index === 1) Vibration.vibrate();
      },
    );
  }

  function openSite(): void {
    void Linking.openURL(SITE).catch(() => {});
  }
</script>

<!-- JS -> native imperative modules: each working button proves its module name resolved -->
<view class="row">
  <view class="flex1">
    <ActionButton title="Alert" onPress={showAlert} color={ACCENT} />
  </view>
  <!-- ActionSheetIOS has no Android native module, so it is iOS-only by design -->
  {#if Platform.OS !== 'android'}
    <view class="flex1">
      <ActionButton title="Action sheet" onPress={showActionSheet} color={ACCENT} />
    </view>
  {/if}
</view>
<view class="row">
  <view class="flex1">
    <ActionButton title="Share" onPress={share} color={ACCENT} />
  </view>
  <view class="flex1">
    <ActionButton title="Vibrate" onPress={() => Vibration.vibrate()} color={ACCENT} />
  </view>
</view>
<ActionButton title="Open svelte.dev" onPress={openSite} color={ACCENT} />
