<!--
  @symbiote-native/system-ui tour stop — fetches the root view's background color on mount, then
  three buttons (Red/Blue/Reset) each set it and re-fetch, mirroring DeviceScreen's
  fetch-then-render actions shape. Vue SFC twin of ../../react/screens/SystemUiScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const RED = '#ef4444';
const BLUE = '#3b82f6';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
const lineColor = LINE_COLOR[lineInfo.line];

const backgroundColor = ref<string | null>(null);

async function refreshBackgroundColor(): Promise<void> {
  const value = await getBackgroundColorAsync();
  backgroundColor.value = value === null ? null : String(value);
}

function handleSetRed(): void {
  void setBackgroundColorAsync(RED).then(refreshBackgroundColor);
}

function handleSetBlue(): void {
  void setBackgroundColorAsync(BLUE).then(refreshBackgroundColor);
}

function handleReset(): void {
  void setBackgroundColorAsync(null).then(refreshBackgroundColor);
}

onMounted(() => {
  void refreshBackgroundColor();
});
</script>

<template>
  <safe-area-view class="screen">
    <ScrollView
      testID="system-ui-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">System UI</text>
          <text class="hero-body"
            >@symbiote-native/system-ui — sets and reads the root view's
            background color.</text
          >
        </view>
      </view>

      <view testID="system-ui-card" class="system-ui-card">
        <text class="system-ui-card-title">Background color</text>
        <view class="system-ui-row">
          <text class="system-ui-row-label">Current</text>
          <text
            testID="system-ui-background-color-value"
            class="system-ui-value-text"
            >{{ backgroundColor ?? 'not set' }}</text
          >
        </view>
        <view class="button-row">
          <ActionButton
            testID="system-ui-set-red-button"
            title="Red"
            :onPress="handleSetRed"
            :color="RED"
          />
          <ActionButton
            testID="system-ui-set-blue-button"
            title="Blue"
            :onPress="handleSetBlue"
            :color="BLUE"
          />
          <ActionButton
            testID="system-ui-reset-button"
            title="Reset"
            :onPress="handleReset"
            :color="lineColor"
          />
        </view>
      </view>
    </ScrollView>
  </safe-area-view>
</template>
