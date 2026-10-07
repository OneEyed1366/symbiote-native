<script setup lang="ts">
import { ActionSheetIOS, Alert, Linking, Platform, Share, Vibration } from '@symbiote-native/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';
import { SHEET_CANCEL_INDEX, SHEET_OPTIONS, SITE } from './canary-shared';

const COLOR = LINE_COLOR.primitives;
const HAS_ACTION_SHEET = Platform.OS !== 'android';

// A rejected promise (no native module, user cancel) is expected here, so it is dropped
function share(): void {
  Share.share({ message: 'Sent from symbiote', url: SITE }).catch(() => {});
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

<template>
  <!-- JS -> native imperative modules: each working button proves its module name resolved -->
  <view class="row">
    <view class="flex1">
      <ActionButton
        title="Alert"
        :color="COLOR"
        @press="showAlert"
      />
    </view>
    <!-- ActionSheetIOS has no Android native module, so it is iOS-only by design -->
    <view
      v-if="HAS_ACTION_SHEET"
      class="flex1"
    >
      <ActionButton
        title="Action sheet"
        :color="COLOR"
        @press="showActionSheet"
      />
    </view>
  </view>
  <view class="row">
    <view class="flex1">
      <ActionButton
        title="Share"
        :color="COLOR"
        @press="share"
      />
    </view>
    <view class="flex1">
      <ActionButton
        title="Vibrate"
        :color="COLOR"
        @press="Vibration.vibrate()"
      />
    </view>
  </view>
  <ActionButton
    title="Open vuejs.org"
    :color="COLOR"
    @press="openSite"
  />
</template>
