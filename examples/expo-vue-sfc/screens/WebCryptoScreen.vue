<!--
  @symbiote-native/standard-web-crypto tour stop — two independent actions: generate random bytes
  via the polyfill's own `webCrypto.getRandomValues` (rendered as a hex string, same "long value"
  case CryptoScreen's stacked result-box handles), and install the polyfill onto `globalThis.crypto`
  then report whether it stuck. Vue SFC twin of ../../react/screens/WebCryptoScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import {
  webCrypto,
  polyfillWebCrypto,
} from '@symbiote-native/standard-web-crypto/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const RANDOM_BYTE_COUNT = 16;
const HEX_RADIX = 16;
const HEX_PAD_LENGTH = 2;

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto];
const lineColor = LINE_COLOR[lineInfo.line];

const randomBytesResult = ref<string | null>(null);
const polyfillInstalledResult = ref<boolean | null>(null);

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(HEX_RADIX).padStart(HEX_PAD_LENGTH, '0'))
    .join('');
}

function handleGenerateRandomBytes(): void {
  const bytes = webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT));
  randomBytesResult.value = toHex(bytes);
}

function handleInstallPolyfill(): void {
  polyfillWebCrypto();
  polyfillInstalledResult.value = typeof globalThis.crypto !== 'undefined';
}
</script>

<template>
  <safe-area-view class="screen">
    <ScrollView
      testID="web-crypto-scroll"
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
          <text class="hero-title">Web Crypto</text>
          <text class="hero-body"
            >@symbiote-native/standard-web-crypto — a Web Crypto API
            `getRandomValues` polyfill built on @symbiote-native/crypto's native
            random source.</text
          >
        </view>
      </view>

      <view testID="web-crypto-random-bytes-card" class="web-crypto-card">
        <text class="web-crypto-card-title">Random bytes</text>
        <ActionButton
          testID="web-crypto-generate-random-bytes-button"
          title="Generate 16 random bytes"
          :onPress="handleGenerateRandomBytes"
          :color="lineColor"
        />
        <view v-if="randomBytesResult !== null" class="web-crypto-result-box">
          <text
            testID="web-crypto-random-bytes-result-value"
            class="web-crypto-result-text"
            >{{ randomBytesResult }}</text
          >
        </view>
      </view>

      <view testID="web-crypto-polyfill-card" class="web-crypto-card">
        <text class="web-crypto-card-title">Polyfill</text>
        <ActionButton
          testID="web-crypto-install-polyfill-button"
          title="Install polyfill"
          :onPress="handleInstallPolyfill"
          :color="lineColor"
        />
        <view v-if="polyfillInstalledResult !== null" class="web-crypto-row">
          <text class="web-crypto-row-label">globalThis.crypto defined</text>
          <text
            testID="web-crypto-polyfill-result-value"
            class="web-crypto-value-text"
            >{{ polyfillInstalledResult ? 'Yes' : 'No' }}</text
          >
        </view>
      </view>
    </ScrollView>
  </safe-area-view>
</template>
