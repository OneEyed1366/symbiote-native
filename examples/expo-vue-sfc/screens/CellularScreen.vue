<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  CellularGeneration,
  allowsVoipAsync,
  getCarrierNameAsync,
  getCellularGenerationAsync,
  getIsoCountryCodeAsync,
  getMobileCountryCodeAsync,
  getMobileNetworkCodeAsync,
} from '@symbiote-native/cellular';
import { usePermissions } from '@symbiote-native/cellular/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const PENDING_LABEL = 'checking…';
const EMPTY_LABEL = '(none)';
const ANDROID_OS = 'android';
const isAndroidOs = Platform.OS === ANDROID_OS;

function generationLabel(generation: CellularGeneration): string {
  switch (generation) {
    case CellularGeneration.CELLULAR_2G:
      return '2G';
    case CellularGeneration.CELLULAR_3G:
      return '3G';
    case CellularGeneration.CELLULAR_4G:
      return '4G';
    case CellularGeneration.CELLULAR_5G:
      return '5G';
    default:
      return 'Unknown';
  }
}

function valueLabel(value: string | boolean | null): string {
  if (value === null) return PENDING_LABEL;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value || EMPTY_LABEL;
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
const lineColor = LINE_COLOR[lineInfo.line];

const generation = ref<CellularGeneration | null>(null);
const allowsVoip = ref<boolean | null>(null);
const isoCountryCode = ref<string | null>(null);
const carrierName = ref<string | null>(null);
const mobileCountryCode = ref<string | null>(null);
const mobileNetworkCode = ref<string | null>(null);
const { status: permissionStatus, request: requestPermission } = usePermissions();

onMounted(() => {
  void Promise.all([
    getCellularGenerationAsync(),
    allowsVoipAsync(),
    getIsoCountryCodeAsync(),
    getCarrierNameAsync(),
    getMobileCountryCodeAsync(),
    getMobileNetworkCodeAsync(),
  ]).then(([currentGeneration, voip, iso, carrier, countryCode, networkCode]) => {
    generation.value = currentGeneration;
    allowsVoip.value = voip;
    isoCountryCode.value = iso;
    carrierName.value = carrier;
    mobileCountryCode.value = countryCode;
    mobileNetworkCode.value = networkCode;
  });
});

const generationText = computed(() =>
  generation.value === null ? PENDING_LABEL : generationLabel(generation.value),
);
const permissionLabel = computed(() =>
  permissionStatus.value === null ? PENDING_LABEL : permissionStatus.value.status,
);
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="cellular-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Cellular</text>
          <text class="hero-body">
            Find out about the mobile connection: network generation (2G to 5G), carrier name,
            country code and whether VoIP is allowed. Only the generation works on iOS, a physical
            device with a SIM is needed.
          </text>
        </view>
      </view>

      <Scenario
        testID="cellular-scenario"
        title="Choose video quality from the mobile network generation"
        why="On 3G, lower the stream quality or skip auto-downloads, on 5G allow them. The carrier and country help pick the right payment or support options."
        :steps="[
          'Turn Wi-Fi off so the phone uses mobile data',
          'Read the generation and carrier in the card',
        ]"
        expect="The generation shows 3G, 4G or 5G and the carrier name appears on Android. Fields the platform does not provide show as unavailable."
      />

      <view testID="cellular-info-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Cellular info</text>
        </view>
        <ValueRow label="Generation" :value="generationText" />
        <template v-if="isAndroidOs">
          <ValueRow label="Allows VoIP" :value="valueLabel(allowsVoip)" />
          <ValueRow label="ISO country code" :value="valueLabel(isoCountryCode)" />
          <ValueRow label="Carrier name" :value="valueLabel(carrierName)" />
          <ValueRow label="Mobile country code" :value="valueLabel(mobileCountryCode)" />
          <ValueRow label="Mobile network code" :value="valueLabel(mobileNetworkCode)" />
        </template>
      </view>

      <view testID="cellular-permission-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Permission</text>
        </view>
        <ValueRow label="Phone-state permission status" :value="permissionLabel" />
        <ActionButton
          testID="cellular-request-permission"
          title="Request permission"
          :onPress="() => requestPermission()"
          :color="lineColor"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
