<!--
  @symbiote-native/tracking-transparency tour stop — usePermissions() auto-fetches the current
  status on mount; get()/request() re-fetch on demand. getAdvertisingId() is a plain synchronous
  core call that may return null (iOS Simulator, not yet authorized, or declined). Vue SFC twin of
  ../../react/screens/TrackingTransparencyScreen.tsx.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import {} from '@symbiote-native/vue';
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
  <safe-area-view class="screen">
    <scroll-view
      testID="tracking-transparency-scroll"
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
          <text class="hero-title">Tracking Transparency</text>
          <text class="hero-body"
            >@symbiote-native/tracking-transparency — App Tracking Transparency
            permission status plus the advertising ID it gates. Android/web
            always report granted.</text
          >
        </view>
      </view>

      <view
        testID="tracking-transparency-permission-card"
        class="tracking-transparency-card"
      >
        <text class="tracking-transparency-card-title">Permission</text>
        <view class="tracking-transparency-row">
          <text class="tracking-transparency-row-label">Status</text>
          <text
            testID="tracking-transparency-status-value"
            class="tracking-transparency-value-text"
            >{{ statusText }}</text
          >
        </view>
        <view class="tracking-transparency-row">
          <text class="tracking-transparency-row-label">Granted</text>
          <view
            :class="`tracking-transparency-status-badge tracking-transparency-status-badge-${grantedStatus}`"
          >
            <text class="tracking-transparency-status-text">{{
              grantedStatus === 'checking'
                ? 'CHECKING…'
                : grantedStatus === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
        <view class="button-row">
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
        </view>
      </view>

      <view
        testID="tracking-transparency-advertising-id-card"
        class="tracking-transparency-card"
      >
        <text class="tracking-transparency-card-title">Advertising ID</text>
        <view class="tracking-transparency-result-box">
          <text
            testID="tracking-transparency-advertising-id-value"
            class="tracking-transparency-result-text"
            >{{ advertisingId ?? 'null' }}</text
          >
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
