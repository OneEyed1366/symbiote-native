<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  BrightnessMode,
  addBrightnessListener,
  getBrightnessAsync,
  getSystemBrightnessModeAsync,
  isUsingSystemBrightnessAsync,
  restoreSystemBrightnessAsync,
  setBrightnessAsync,
  setSystemBrightnessModeAsync,
} from '@symbiote-native/brightness';
import type { EventSubscription } from '@symbiote-native/brightness';
import { usePermissions } from '@symbiote-native/brightness/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { CAPABILITY_LABEL, toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

type IBrightnessStep = { label: string; value: number };

const PENDING_LABEL = 'checking…';
const PERCENT_SCALE = 100;
const ANDROID_OS = 'android';
const isAndroidOs = Platform.OS === ANDROID_OS;

const BRIGHTNESS_STEPS: readonly IBrightnessStep[] = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

function brightnessModeLabel(mode: BrightnessMode): string {
  switch (mode) {
    case BrightnessMode.AUTOMATIC:
      return 'Automatic';
    case BrightnessMode.MANUAL:
      return 'Manual';
    default:
      return 'Unknown';
  }
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
const lineColor = LINE_COLOR[lineInfo.line];

const brightness = ref<number | null>(null);
const systemMode = ref<BrightnessMode>(BrightnessMode.UNKNOWN);
const systemUsageStatus = ref<ICapabilityStatus>('checking');
const { status: permissionStatus, request: requestPermission } = usePermissions();

let subscription: EventSubscription | null = null;

onMounted(() => {
  void getBrightnessAsync().then(value => {
    brightness.value = value;
  });
  subscription = addBrightnessListener(event => {
    brightness.value = event.brightness;
  });
  if (isAndroidOs) {
    void Promise.all([getSystemBrightnessModeAsync(), isUsingSystemBrightnessAsync()]).then(
      ([mode, isUsingSystem]) => {
        systemMode.value = mode;
        systemUsageStatus.value = toCapabilityStatus(isUsingSystem);
      },
    );
  }
});

onUnmounted(() => subscription?.remove());

function handleSetBrightness(value: number): void {
  void setBrightnessAsync(value).then(() =>
    getBrightnessAsync().then(current => {
      brightness.value = current;
    }),
  );
}

function handleSetSystemMode(mode: BrightnessMode): void {
  void setSystemBrightnessModeAsync(mode).then(() =>
    getSystemBrightnessModeAsync().then(current => {
      systemMode.value = current;
    }),
  );
}

function handleRestoreSystem(): void {
  void restoreSystemBrightnessAsync().then(() =>
    isUsingSystemBrightnessAsync().then(isUsingSystem => {
      systemUsageStatus.value = toCapabilityStatus(isUsingSystem);
    }),
  );
}

const brightnessLabel = computed(() =>
  brightness.value === null ? PENDING_LABEL : `${Math.round(brightness.value * PERCENT_SCALE)}%`,
);
const permissionLabel = computed(() =>
  permissionStatus.value === null ? PENDING_LABEL : permissionStatus.value.status,
);
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="brightness-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Brightness</text>
          <text class="hero-body">
            Read and change the screen brightness from the app, for example to make a QR code or a
            boarding pass easy to scan. Android can also change the system-wide value after the
            user grants the write settings permission.
          </text>
        </view>
      </view>

      <Scenario
        testID="brightness-scenario"
        title="Brighten the screen to show a QR code or a ticket"
        why="Scanners read a bright screen much better. Raise the brightness while the code is on screen and restore the user's level afterwards."
        :steps="[
          'Note the current brightness in the live card',
          'Set a new value with the controls',
          'Restore the system value',
        ]"
        expect="The screen visibly brightens or dims, and the live card shows the new value. Restoring returns to the system setting."
      />

      <view testID="brightness-live-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Live brightness</text>
        </view>
        <ValueRow label="Screen brightness" :value="brightnessLabel" />
        <view class="button-row">
          <ActionButton
            v-for="step in BRIGHTNESS_STEPS"
            :key="step.label"
            :testID="`brightness-set-${step.label}`"
            :title="step.label"
            :onPress="() => handleSetBrightness(step.value)"
            :color="lineColor"
          />
        </view>
      </view>

      <view v-if="isAndroidOs" testID="brightness-system-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">System brightness (Android only)</text>
        </view>
        <ValueRow label="Mode" :value="brightnessModeLabel(systemMode)" />
        <view class="capability-row" testID="brightness-using-system">
          <text class="capability-label">Using system value</text>
          <view :class="`status-badge status-badge-${systemUsageStatus}`">
            <text class="status-badge-text">{{ CAPABILITY_LABEL[systemUsageStatus] }}</text>
          </view>
        </view>
        <view class="button-row">
          <ActionButton
            testID="brightness-mode-automatic"
            title="Automatic"
            :onPress="() => handleSetSystemMode(BrightnessMode.AUTOMATIC)"
            :color="lineColor"
          />
          <ActionButton
            testID="brightness-mode-manual"
            title="Manual"
            :onPress="() => handleSetSystemMode(BrightnessMode.MANUAL)"
            :color="lineColor"
          />
          <ActionButton
            testID="brightness-restore-system"
            title="Restore system"
            :onPress="handleRestoreSystem"
            :color="lineColor"
          />
        </view>
      </view>

      <view testID="brightness-permission-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Permission</text>
        </view>
        <ValueRow label="SYSTEM_BRIGHTNESS status" :value="permissionLabel" />
        <ActionButton
          testID="brightness-request-permission"
          title="Request permission"
          :onPress="() => requestPermission()"
          :color="lineColor"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
