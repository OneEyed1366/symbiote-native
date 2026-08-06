<!--
  @symbiote-native/screen-orientation tour stop — useScreenOrientation() seeds current
  orientation/lock and subscribes to live changes; the three buttons exercise the imperative
  lockAsync/unlockAsync core functions directly. Vue SFC twin of
  ../../react/screens/ScreenOrientationScreen.tsx.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  Orientation,
  OrientationLock,
  lockAsync,
  unlockAsync,
  useScreenOrientation,
} from '@symbiote-native/screen-orientation/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const ORIENTATION_LABEL: Record<Orientation, string> = {
  [Orientation.UNKNOWN]: 'Unknown',
  [Orientation.PORTRAIT_UP]: 'Portrait up',
  [Orientation.PORTRAIT_DOWN]: 'Portrait down',
  [Orientation.LANDSCAPE_LEFT]: 'Landscape left',
  [Orientation.LANDSCAPE_RIGHT]: 'Landscape right',
};

const ORIENTATION_LOCK_LABEL: Record<OrientationLock, string> = {
  [OrientationLock.DEFAULT]: 'Default',
  [OrientationLock.ALL]: 'All',
  [OrientationLock.PORTRAIT]: 'Portrait',
  [OrientationLock.PORTRAIT_UP]: 'Portrait up',
  [OrientationLock.PORTRAIT_DOWN]: 'Portrait down',
  [OrientationLock.LANDSCAPE]: 'Landscape',
  [OrientationLock.LANDSCAPE_LEFT]: 'Landscape left',
  [OrientationLock.LANDSCAPE_RIGHT]: 'Landscape right',
  [OrientationLock.OTHER]: 'Other',
  [OrientationLock.UNKNOWN]: 'Unknown',
};

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation];
const lineColor = LINE_COLOR[lineInfo.line];

const screenOrientation = useScreenOrientation();
const orientationText = computed(() => ORIENTATION_LABEL[screenOrientation.value.orientation]);
const orientationLockText = computed(
  () => ORIENTATION_LOCK_LABEL[screenOrientation.value.orientationLock],
);

function handleLockPortrait(): void {
  void lockAsync(OrientationLock.PORTRAIT_UP);
}

function handleLockLandscape(): void {
  void lockAsync(OrientationLock.LANDSCAPE);
}

function handleUnlock(): void {
  void unlockAsync();
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="screen-orientation-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Screen Orientation</Text>
          <Text class="hero-body"
            >@symbiote-native/screen-orientation — live orientation state plus lock/unlock
            controls.</Text
          >
        </View>
      </View>

      <View testID="screen-orientation-state-card" class="screen-orientation-card">
        <Text class="screen-orientation-card-title">Current state</Text>
        <View class="screen-orientation-row">
          <Text class="screen-orientation-row-label">Orientation</Text>
          <Text testID="screen-orientation-value" class="screen-orientation-value-text">{{
            orientationText
          }}</Text>
        </View>
        <View class="screen-orientation-row">
          <Text class="screen-orientation-row-label">Orientation lock</Text>
          <Text testID="screen-orientation-lock-value" class="screen-orientation-value-text">{{
            orientationLockText
          }}</Text>
        </View>
      </View>

      <View testID="screen-orientation-actions-card" class="screen-orientation-card">
        <Text class="screen-orientation-card-title">Lock controls</Text>
        <View class="button-row">
          <ActionButton
            testID="screen-orientation-lock-portrait-button"
            title="Lock portrait"
            :onPress="handleLockPortrait"
            :color="lineColor"
          />
          <ActionButton
            testID="screen-orientation-lock-landscape-button"
            title="Lock landscape"
            :onPress="handleLockLandscape"
            :color="lineColor"
          />
          <ActionButton
            testID="screen-orientation-unlock-button"
            title="Unlock"
            :onPress="handleUnlock"
            :color="lineColor"
          />
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
