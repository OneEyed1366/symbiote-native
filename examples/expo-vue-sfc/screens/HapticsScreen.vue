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
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/vue';
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
  <SafeAreaView class="screen">
    <ScrollView
      testID="haptics-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Haptics</Text>
          <Text class="hero-body"
            >@symbiote-native/haptics — impact/notification/selection feedback
            via iOS's Taptic Engine and Android's Vibrator API, plus a direct
            Android haptics-engine path. The Simulator plays no physical
            feedback; a real device is needed to feel it.</Text
          >
        </View>
      </View>

      <View testID="haptics-impact-card" class="haptics-card">
        <Text class="haptics-card-title">Impact</Text>
        <View class="button-row">
          <ActionButton
            v-for="item in IMPACT_STYLES"
            :key="item.style"
            :testID="`haptics-impact-${item.style}-button`"
            :title="item.label"
            :onPress="() => fireImpact(item.style)"
            :color="lineColor"
          />
        </View>
      </View>

      <View testID="haptics-notification-card" class="haptics-card">
        <Text class="haptics-card-title">Notification</Text>
        <View class="button-row">
          <ActionButton
            v-for="item in NOTIFICATION_TYPES"
            :key="item.type"
            :testID="`haptics-notification-${item.type}-button`"
            :title="item.label"
            :onPress="() => fireNotification(item.type)"
            :color="lineColor"
          />
        </View>
      </View>

      <View testID="haptics-selection-card" class="haptics-card">
        <Text class="haptics-card-title">Selection</Text>
        <View class="button-row">
          <ActionButton
            testID="haptics-selection-button"
            title="Selection"
            :onPress="fireSelection"
            :color="lineColor"
          />
        </View>
      </View>

      <View
        v-if="Platform.OS === 'android'"
        testID="haptics-android-card"
        class="haptics-card"
      >
        <Text class="haptics-card-title">Android haptics</Text>
        <View class="button-row">
          <ActionButton
            v-for="item in ANDROID_HAPTICS"
            :key="item.type"
            :testID="`haptics-android-${item.type}-button`"
            :title="item.label"
            :onPress="() => fireAndroidHaptic(item.type)"
            :color="lineColor"
          />
        </View>
      </View>

      <View testID="haptics-last-fired-card" class="haptics-last-fired-card">
        <Text class="haptics-last-fired-label">LAST FIRED</Text>
        <Text
          testID="haptics-last-fired-value"
          class="haptics-last-fired-value"
          >{{ lastFired ?? 'nothing yet' }}</Text
        >
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
