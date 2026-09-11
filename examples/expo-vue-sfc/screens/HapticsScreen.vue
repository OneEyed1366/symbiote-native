<!--
  @symbiote-native/haptics tour stop — fire-and-forget buttons over impactAsync (5
  ImpactFeedbackStyle values), notificationAsync (3 NotificationFeedbackType values), and
  selectionAsync, plus an Android-only card driving performAndroidHapticsAsync over the full
  AndroidHaptics enum. No async result to render — a standing "last fired" readout is the only
  feedback, since the real feedback is physical (Taptic Engine / Vibrator) and invisible on a
  Simulator. Vue SFC twin of ../../react/screens/HapticsScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from '@symbiote-native/haptics';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Haptics];
const lineColor = LINE_COLOR[lineInfo.line];

const IMPACT_STYLES: readonly { style: ImpactFeedbackStyle; label: string }[] =
  [
    { style: ImpactFeedbackStyle.Light, label: 'Light' },
    { style: ImpactFeedbackStyle.Medium, label: 'Medium' },
    { style: ImpactFeedbackStyle.Heavy, label: 'Heavy' },
    { style: ImpactFeedbackStyle.Rigid, label: 'Rigid' },
    { style: ImpactFeedbackStyle.Soft, label: 'Soft' },
  ];

const NOTIFICATION_TYPES: readonly {
  type: NotificationFeedbackType;
  label: string;
}[] = [
  { type: NotificationFeedbackType.Success, label: 'Success' },
  { type: NotificationFeedbackType.Warning, label: 'Warning' },
  { type: NotificationFeedbackType.Error, label: 'Error' },
];

// AndroidHaptics is a string enum keyed PascalCase-with-underscores (Gesture_Start, Toggle_On,
// ...) — deriving the button caption from the key avoids hand-typing all 17 labels twice.
const ANDROID_HAPTICS: readonly { type: AndroidHaptics; label: string }[] =
  Object.entries(AndroidHaptics).map(([key, value]) => ({
    type: value,
    label: key.replace(/_/g, ' '),
  }));

const lastFired = ref<string | null>(null);

function fireImpact(style: ImpactFeedbackStyle): void {
  lastFired.value = `impact: ${style}`;
  void impactAsync(style);
}

function fireNotification(type: NotificationFeedbackType): void {
  lastFired.value = `notification: ${type}`;
  void notificationAsync(type);
}

function fireSelection(): void {
  lastFired.value = 'selection';
  void selectionAsync();
}

function fireAndroidHaptic(type: AndroidHaptics): void {
  lastFired.value = `android: ${type}`;
  void performAndroidHapticsAsync(type);
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="haptics-scroll"
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
          <text class="hero-title">Haptics</text>
          <text class="hero-body"
            >@symbiote-native/haptics — impact/notification/selection feedback
            via iOS's Taptic Engine and Android's Vibrator API, plus a direct
            Android haptics-engine path. The Simulator plays no physical
            feedback; a real device is needed to feel it.</text
          >
        </view>
      </view>

      <view testID="haptics-impact-card" class="haptics-card">
        <text class="haptics-card-title">Impact</text>
        <view class="button-row">
          <ActionButton
            v-for="item in IMPACT_STYLES"
            :key="item.style"
            :testID="`haptics-impact-${item.style}-button`"
            :title="item.label"
            :onPress="() => fireImpact(item.style)"
            :color="lineColor"
          />
        </view>
      </view>

      <view testID="haptics-notification-card" class="haptics-card">
        <text class="haptics-card-title">Notification</text>
        <view class="button-row">
          <ActionButton
            v-for="item in NOTIFICATION_TYPES"
            :key="item.type"
            :testID="`haptics-notification-${item.type}-button`"
            :title="item.label"
            :onPress="() => fireNotification(item.type)"
            :color="lineColor"
          />
        </view>
      </view>

      <view testID="haptics-selection-card" class="haptics-card">
        <text class="haptics-card-title">Selection</text>
        <view class="button-row">
          <ActionButton
            testID="haptics-selection-button"
            title="Selection"
            :onPress="fireSelection"
            :color="lineColor"
          />
        </view>
      </view>

      <view
        v-if="Platform.OS === 'android'"
        testID="haptics-android-card"
        class="haptics-card"
      >
        <text class="haptics-card-title">Android haptics</text>
        <view class="button-row">
          <ActionButton
            v-for="item in ANDROID_HAPTICS"
            :key="item.type"
            :testID="`haptics-android-${item.type}-button`"
            :title="item.label"
            :onPress="() => fireAndroidHaptic(item.type)"
            :color="lineColor"
          />
        </view>
      </view>

      <view testID="haptics-last-fired-card" class="haptics-last-fired-card">
        <text class="haptics-last-fired-label">LAST FIRED</text>
        <text
          testID="haptics-last-fired-value"
          class="haptics-last-fired-value"
          >{{ lastFired ?? 'nothing yet' }}</text
        >
      </view>
    </scroll-view>
  </safe-area-view>
</template>
