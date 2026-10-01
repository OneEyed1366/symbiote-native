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
} from '@symbiote-native/haptics/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const ANDROID_OS = 'android';
const isAndroidOs = Platform.OS === ANDROID_OS;

const IMPACT_STYLES: readonly { label: string; style: ImpactFeedbackStyle }[] = [
  { label: 'Light', style: ImpactFeedbackStyle.Light },
  { label: 'Medium', style: ImpactFeedbackStyle.Medium },
  { label: 'Heavy', style: ImpactFeedbackStyle.Heavy },
  { label: 'Rigid', style: ImpactFeedbackStyle.Rigid },
  { label: 'Soft', style: ImpactFeedbackStyle.Soft },
];

const NOTIFICATION_TYPES: readonly { label: string; type: NotificationFeedbackType }[] = [
  { label: 'Success', type: NotificationFeedbackType.Success },
  { label: 'Warning', type: NotificationFeedbackType.Warning },
  { label: 'Error', type: NotificationFeedbackType.Error },
];

const ANDROID_HAPTICS: readonly { label: string; type: AndroidHaptics }[] = [
  { label: 'Confirm', type: AndroidHaptics.Confirm },
  { label: 'Reject', type: AndroidHaptics.Reject },
  { label: 'Gesture start', type: AndroidHaptics.Gesture_Start },
  { label: 'Gesture end', type: AndroidHaptics.Gesture_End },
  { label: 'Toggle on', type: AndroidHaptics.Toggle_On },
  { label: 'Toggle off', type: AndroidHaptics.Toggle_Off },
  { label: 'Clock tick', type: AndroidHaptics.Clock_Tick },
  { label: 'Context click', type: AndroidHaptics.Context_Click },
  { label: 'Drag start', type: AndroidHaptics.Drag_Start },
  { label: 'Keyboard tap', type: AndroidHaptics.Keyboard_Tap },
  { label: 'Keyboard press', type: AndroidHaptics.Keyboard_Press },
  { label: 'Keyboard release', type: AndroidHaptics.Keyboard_Release },
  { label: 'Long press', type: AndroidHaptics.Long_Press },
  { label: 'Virtual key', type: AndroidHaptics.Virtual_Key },
  { label: 'Virtual key release', type: AndroidHaptics.Virtual_Key_Release },
  { label: 'No haptics', type: AndroidHaptics.No_Haptics },
  { label: 'Segment tick', type: AndroidHaptics.Segment_Tick },
  { label: 'Segment frequent tick', type: AndroidHaptics.Segment_Frequent_Tick },
  { label: 'Text handle move', type: AndroidHaptics.Text_Handle_Move },
];

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Haptics];
const lineColor = LINE_COLOR[lineInfo.line];

const lastFired = ref<string | null>(null);

function handleImpact(style: ImpactFeedbackStyle, label: string): void {
  void impactAsync(style);
  lastFired.value = `impactAsync(${label})`;
}

function handleNotification(type: NotificationFeedbackType, label: string): void {
  void notificationAsync(type);
  lastFired.value = `notificationAsync(${label})`;
}

function handleSelection(): void {
  void selectionAsync();
  lastFired.value = 'selectionAsync()';
}

function handleAndroidHaptic(type: AndroidHaptics, label: string): void {
  void performAndroidHapticsAsync(type);
  lastFired.value = `performAndroidHapticsAsync(${label})`;
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="haptics-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Haptics</text>
          <text class="hero-body">
            Add a tactile feel to the app: taps, success and error buzzes and selection ticks
            through iOS's Taptic Engine and Android's vibrator. A simulator cannot vibrate, use a
            real device.
          </text>
        </view>
      </view>

      <Scenario
        testID="haptics-scenario"
        title="Confirm a tap, a success or an error by feel"
        why="A light tap on a button, a double buzz for success and a sharp one for an error make the app feel physical and let users act without looking."
        :steps="[
          'Press the impact buttons from light to heavy',
          'Press the notification buttons',
          'Press selection while scrolling a picker-like list',
        ]"
        expect="Each press vibrates differently on a real phone, and the last fired row names the call that reached the native module."
      />

      <view testID="haptics-impact-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Impact</text>
        </view>
        <view class="button-row">
          <ActionButton
            v-for="item in IMPACT_STYLES"
            :key="item.label"
            :testID="`haptics-impact-${item.label.toLowerCase()}`"
            :title="item.label"
            :onPress="() => handleImpact(item.style, item.label)"
            :color="lineColor"
          />
        </view>
      </view>

      <view testID="haptics-notification-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Notification</text>
        </view>
        <view class="button-row">
          <ActionButton
            v-for="item in NOTIFICATION_TYPES"
            :key="item.label"
            :testID="`haptics-notification-${item.label.toLowerCase()}`"
            :title="item.label"
            :onPress="() => handleNotification(item.type, item.label)"
            :color="lineColor"
          />
        </view>
      </view>

      <view testID="haptics-selection-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Selection</text>
        </view>
        <ActionButton
          testID="haptics-selection-button"
          title="Selection"
          :onPress="handleSelection"
          :color="lineColor"
        />
      </view>

      <view v-if="isAndroidOs" testID="haptics-android-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Android haptics</text>
        </view>
        <text class="info-text">
          performAndroidHapticsAsync() drives the device haptics engine directly — Android only.
        </text>
        <view class="button-row">
          <ActionButton
            v-for="item in ANDROID_HAPTICS"
            :key="item.type"
            :testID="`haptics-android-${item.type}`"
            :title="item.label"
            :onPress="() => handleAndroidHaptic(item.type, item.label)"
            :color="lineColor"
          />
        </view>
      </view>

      <view v-if="lastFired" testID="haptics-last-fired" class="feature-card">
        <text class="value-text">{{ `Last fired: ${lastFired}` }}</text>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
