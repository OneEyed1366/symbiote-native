<!--
  @symbiote-native/tracking-transparency tour stop — usePermissions() auto-fetches the current
  status on mount; get()/request() re-fetch on demand. getAdvertisingId() is a plain synchronous
  core call that may return null (iOS Simulator, not yet authorized, or declined). Vue SFC twin of
  ../../react/screens/TrackingTransparencyScreen.tsx.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  getAdvertisingId,
  usePermissions,
} from '@symbiote-native/tracking-transparency/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
const lineColor = LINE_COLOR[lineInfo.line];

const { status, get, request } = usePermissions();
const advertisingId = ref<string | null>(getAdvertisingId());

const statusText = computed(() => status.value?.status ?? 'checking…');
const grantedStatus = computed<ICapabilityStatus>(() => {
  if (status.value === null) return 'checking';
  return status.value.granted ? 'yes' : 'no';
});

function handleGet(): void {
  void get();
}

function handleRequest(): void {
  void request().then(() => {
    advertisingId.value = getAdvertisingId();
  });
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="tracking-transparency-scroll"
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
          <Text class="hero-title">Tracking Transparency</Text>
          <Text class="hero-body"
            >@symbiote-native/tracking-transparency — App Tracking Transparency
            permission status plus the advertising ID it gates. Android/web
            always report granted.</Text
          >
        </View>
      </View>

      <View
        testID="tracking-transparency-permission-card"
        class="tracking-transparency-card"
      >
        <Text class="tracking-transparency-card-title">Permission</Text>
        <View class="tracking-transparency-row">
          <Text class="tracking-transparency-row-label">Status</Text>
          <Text
            testID="tracking-transparency-status-value"
            class="tracking-transparency-value-text"
            >{{ statusText }}</Text
          >
        </View>
        <View class="tracking-transparency-row">
          <Text class="tracking-transparency-row-label">Granted</Text>
          <View
            :class="`tracking-transparency-status-badge tracking-transparency-status-badge-${grantedStatus}`"
          >
            <Text class="tracking-transparency-status-text">{{
              grantedStatus === 'checking'
                ? 'CHECKING…'
                : grantedStatus === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</Text>
          </View>
        </View>
        <View class="button-row">
          <ActionButton
            testID="tracking-transparency-get-button"
            title="Get"
            :onPress="handleGet"
            :color="lineColor"
          />
          <ActionButton
            testID="tracking-transparency-request-button"
            title="Request"
            :onPress="handleRequest"
            :color="lineColor"
          />
        </View>
      </View>

      <View
        testID="tracking-transparency-advertising-id-card"
        class="tracking-transparency-card"
      >
        <Text class="tracking-transparency-card-title">Advertising ID</Text>
        <View class="tracking-transparency-result-box">
          <Text
            testID="tracking-transparency-advertising-id-value"
            class="tracking-transparency-result-text"
            >{{ advertisingId ?? 'null' }}</Text
          >
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
