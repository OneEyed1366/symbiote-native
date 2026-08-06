<!--
  @symbiote-native/brightness tour stop — a live brightness card (seeded via getBrightnessAsync(),
  refreshed by addBrightnessListener() — iOS-only upstream, so on Android the value only changes
  via the buttons below) plus a set-brightness action row, an Android-only system-brightness-mode
  card, and a permission card driving usePermissions(). Vue SFC twin of
  ../../react/screens/BrightnessScreen.tsx.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  BrightnessMode,
  addBrightnessListener,
  getBrightnessAsync,
  getSystemBrightnessModeAsync,
  isUsingSystemBrightnessAsync,
  restoreSystemBrightnessAsync,
  setBrightnessAsync,
  setSystemBrightnessModeAsync,
  type EventSubscription,
} from '@symbiote-native/brightness';
import { usePermissions } from '@symbiote-native/brightness/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function brightnessModeLabel(mode: BrightnessMode): string {
  switch (mode) {
    case BrightnessMode.AUTOMATIC:
      return 'Automatic';
    case BrightnessMode.MANUAL:
      return 'Manual';
    case BrightnessMode.UNKNOWN:
    default:
      return 'Unknown';
  }
}

const BRIGHTNESS_STEPS: readonly { label: string; value: number }[] = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
const lineColor = LINE_COLOR[lineInfo.line];

const brightness = ref<number | null>(null);
const systemMode = ref<BrightnessMode>(BrightnessMode.UNKNOWN);
const isUsingSystem = ref<ICapabilityStatus>('checking');
const { status: permissionStatus, request: requestPermission } = usePermissions();

let subscription: EventSubscription | undefined;

onMounted(() => {
  void getBrightnessAsync().then(value => {
    brightness.value = value;
  });
  subscription = addBrightnessListener(event => {
    brightness.value = event.brightness;
  });

  if (Platform.OS === 'android') {
    void Promise.all([getSystemBrightnessModeAsync(), isUsingSystemBrightnessAsync()]).then(
      ([mode, usingSystem]) => {
        systemMode.value = mode;
        isUsingSystem.value = usingSystem ? 'yes' : 'no';
      },
    );
  }
});

onUnmounted(() => {
  subscription?.remove();
});

function handleSetBrightness(value: number): void {
  void setBrightnessAsync(value).then(() => getBrightnessAsync().then(value_ => {
    brightness.value = value_;
  }));
}

function handleSetSystemMode(mode: BrightnessMode): void {
  void setSystemBrightnessModeAsync(mode).then(() => getSystemBrightnessModeAsync().then(mode_ => {
    systemMode.value = mode_;
  }));
}

function handleRestoreSystem(): void {
  void restoreSystemBrightnessAsync().then(() => isUsingSystemBrightnessAsync().then(usingSystem => {
    isUsingSystem.value = usingSystem ? 'yes' : 'no';
  }));
}

const brightnessLabel = computed(() =>
  brightness.value === null ? 'checking…' : `${Math.round(brightness.value * 100)}%`,
);
const systemModeLabel = computed(() => brightnessModeLabel(systemMode.value));
const permissionLabel = computed(() =>
  permissionStatus.value === null ? 'checking…' : permissionStatus.value.status,
);
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="brightness-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Brightness</Text>
          <Text class="hero-body"
            >@symbiote-native/brightness — screen brightness get/set, Android system-brightness
            mode, and an iOS-only live listener. Requires SYSTEM_BRIGHTNESS permission on Android
            before setting the system-wide value.</Text
          >
        </View>
      </View>

      <View testID="brightness-live-card" class="brightness-card">
        <Text class="brightness-card-title">Live brightness</Text>
        <View class="brightness-row">
          <Text class="brightness-row-label">Screen brightness</Text>
          <Text testID="brightness-level-value" class="brightness-value-text">{{ brightnessLabel }}</Text>
        </View>
        <View class="button-row">
          <ActionButton
            v-for="step in BRIGHTNESS_STEPS"
            :key="step.label"
            :testID="`brightness-set-${step.label}`"
            :title="step.label"
            :onPress="() => handleSetBrightness(step.value)"
            :color="lineColor"
          />
        </View>
      </View>

      <View v-if="Platform.OS === 'android'" testID="brightness-system-card" class="brightness-card">
        <Text class="brightness-card-title">System brightness (Android only)</Text>
        <View class="brightness-row">
          <Text class="brightness-row-label">Mode</Text>
          <Text testID="brightness-mode-value" class="brightness-value-text">{{ systemModeLabel }}</Text>
        </View>
        <View testID="brightness-using-system" class="brightness-row">
          <Text class="brightness-row-label">Using system value</Text>
          <View :class="`brightness-status-badge brightness-status-badge-${isUsingSystem}`">
            <Text class="brightness-status-text">{{
              isUsingSystem === 'checking' ? 'CHECKING…' : isUsingSystem === 'yes' ? 'YES' : 'NO'
            }}</Text>
          </View>
        </View>
        <View class="button-row">
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
        </View>
      </View>

      <View testID="brightness-permission-card" class="brightness-card">
        <Text class="brightness-card-title">Permission</Text>
        <View class="brightness-row">
          <Text class="brightness-row-label">SYSTEM_BRIGHTNESS status</Text>
          <Text testID="brightness-permission-value" class="brightness-value-text">{{ permissionLabel }}</Text>
        </View>
        <ActionButton
          testID="brightness-request-permission"
          title="Request permission"
          :onPress="() => requestPermission()"
          :color="lineColor"
        />
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
