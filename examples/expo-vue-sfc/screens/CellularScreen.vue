<!--
  @symbiote-native/cellular tour stop — a one-shot info card (generation + carrier/SIM fields,
  every field except generation returns null on iOS/web upstream — Android-only in practice) plus
  a permission card driving usePermissions(). Most fields need a physical device with a SIM card;
  a simulator/emulator reports null/UNKNOWN for nearly everything. Vue SFC twin of
  ../../react/screens/CellularScreen.tsx.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/vue';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

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
    case CellularGeneration.UNKNOWN:
    default:
      return 'Unknown';
  }
}

function valueLabel(value: string | boolean | null): string {
  if (value === null) return 'checking…';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value || '(none)';
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
const lineColor = LINE_COLOR[lineInfo.line];

const generation = ref<CellularGeneration | null>(null);
const allowsVoip = ref<boolean | null>(null);
const isoCountryCode = ref<string | null>(null);
const carrierName = ref<string | null>(null);
const mobileCountryCode = ref<string | null>(null);
const mobileNetworkCode = ref<string | null>(null);
const { status: permissionStatus, request: requestPermission } =
  usePermissions();

onMounted(() => {
  void Promise.all([
    getCellularGenerationAsync(),
    allowsVoipAsync(),
    getIsoCountryCodeAsync(),
    getCarrierNameAsync(),
    getMobileCountryCodeAsync(),
    getMobileNetworkCodeAsync(),
  ]).then(([gen, voip, iso, carrier, mcc, mnc]) => {
    generation.value = gen;
    allowsVoip.value = voip;
    isoCountryCode.value = iso;
    carrierName.value = carrier;
    mobileCountryCode.value = mcc;
    mobileNetworkCode.value = mnc;
  });
});

const generationText = computed(() =>
  generation.value === null ? 'checking…' : generationLabel(generation.value),
);
const allowsVoipText = computed(() => valueLabel(allowsVoip.value));
const isoCountryCodeText = computed(() => valueLabel(isoCountryCode.value));
const carrierNameText = computed(() => valueLabel(carrierName.value));
const mobileCountryCodeText = computed(() =>
  valueLabel(mobileCountryCode.value),
);
const mobileNetworkCodeText = computed(() =>
  valueLabel(mobileNetworkCode.value),
);
const permissionLabel = computed(() =>
  permissionStatus.value === null ? 'checking…' : permissionStatus.value.status,
);
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="cellular-scroll"
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
          <Text class="hero-title">Cellular</Text>
          <Text class="hero-body"
            >@symbiote-native/cellular — cellular generation and carrier/SIM
            info. Every field except generation is Android-only upstream
            (iOS/web return null); a physical device with an active SIM is
            needed for real values.</Text
          >
        </View>
      </View>

      <View testID="cellular-info-card" class="cellular-card">
        <Text class="cellular-card-title">Cellular info</Text>
        <View class="cellular-row">
          <Text class="cellular-row-label">Generation</Text>
          <Text
            testID="cellular-generation-value"
            class="cellular-value-text"
            >{{ generationText }}</Text
          >
        </View>
        <template v-if="Platform.OS === 'android'">
          <View class="cellular-row">
            <Text class="cellular-row-label">Allows VoIP</Text>
            <Text class="cellular-value-text">{{ allowsVoipText }}</Text>
          </View>
          <View class="cellular-row">
            <Text class="cellular-row-label">ISO country code</Text>
            <Text class="cellular-value-text">{{ isoCountryCodeText }}</Text>
          </View>
          <View class="cellular-row">
            <Text class="cellular-row-label">Carrier name</Text>
            <Text class="cellular-value-text">{{ carrierNameText }}</Text>
          </View>
          <View class="cellular-row">
            <Text class="cellular-row-label">Mobile country code</Text>
            <Text class="cellular-value-text">{{ mobileCountryCodeText }}</Text>
          </View>
          <View class="cellular-row">
            <Text class="cellular-row-label">Mobile network code</Text>
            <Text class="cellular-value-text">{{ mobileNetworkCodeText }}</Text>
          </View>
        </template>
      </View>

      <View testID="cellular-permission-card" class="cellular-card">
        <Text class="cellular-card-title">Permission</Text>
        <View class="cellular-row">
          <Text class="cellular-row-label">Phone-state permission status</Text>
          <Text
            testID="cellular-permission-value"
            class="cellular-value-text"
            >{{ permissionLabel }}</Text
          >
        </View>
        <ActionButton
          testID="cellular-request-permission"
          title="Request permission"
          :onPress="() => requestPermission()"
          :color="lineColor"
        />
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
