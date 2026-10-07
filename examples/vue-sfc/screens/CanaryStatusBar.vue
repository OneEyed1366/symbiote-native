<script setup lang="ts">
import { ref } from 'vue';
import { Platform, StatusBar } from '@symbiote-native/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';

const COLOR = LINE_COLOR.primitives;
const BAR_RED = '#ff0000';
const BAR_DEFAULT = '#101a2c';
const IS_ANDROID = Platform.OS === 'android';

const isHidden = ref(false);
const isDark = ref(false);
const isRed = ref(false);
const isTranslucent = ref(false);

function toggleRed(): void {
  isRed.value = !isRed.value;
  StatusBar.setBackgroundColor(isRed.value ? BAR_RED : BAR_DEFAULT, true);
}

function toggleTranslucent(): void {
  isTranslucent.value = !isTranslucent.value;
  StatusBar.setTranslucent(isTranslucent.value);
}
</script>

<template>
  <!-- JS -> native: StatusBar renders nothing and drives the OS status bar from these props -->
  <StatusBar
    :bar-style="isDark ? 'dark-content' : 'light-content'"
    :hidden="isHidden"
    :animated="true"
  />
  <view class="row">
    <view class="flex1">
      <ActionButton
        :title="isHidden ? 'Show status bar' : 'Hide status bar'"
        :color="COLOR"
        @press="isHidden = !isHidden"
      />
    </view>
    <view class="flex1">
      <ActionButton
        :title="isDark ? 'Light text' : 'Dark text'"
        :color="COLOR"
        @press="isDark = !isDark"
      />
    </view>
  </view>
  <!-- Android-only window flags. PASS: the strip changes and the app stays rendered -->
  <view
    v-if="IS_ANDROID"
    class="row"
  >
    <view class="flex1">
      <ActionButton
        :title="isRed ? 'BG default' : 'BG red'"
        :color="COLOR"
        @press="toggleRed"
      />
    </view>
    <view class="flex1">
      <ActionButton
        :title="isTranslucent ? 'Opaque' : 'Translucent'"
        :color="COLOR"
        @press="toggleTranslucent"
      />
    </view>
  </view>
</template>
