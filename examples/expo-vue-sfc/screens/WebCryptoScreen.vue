<script setup lang="ts">
import { ref } from 'vue';
import { polyfillWebCrypto, webCrypto } from '@symbiote-native/standard-web-crypto/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const RANDOM_BYTE_COUNT = 16;
const HEX_RADIX = 16;
const HEX_PAD_LENGTH = 2;

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto];
const lineColor = LINE_COLOR[lineInfo.line];

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(HEX_RADIX).padStart(HEX_PAD_LENGTH, '0'))
    .join(' ');
}

// `globalThis.crypto` is not a typed global without the DOM lib, so it is read untyped
function hasGlobalCrypto(): boolean {
  return Reflect.get(globalThis, 'crypto') !== undefined;
}

const randomBytesHex = ref<string | null>(null);
const isPolyfillInstalled = ref(hasGlobalCrypto());

function handleGenerateRandomBytes(): void {
  const bytes = webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT));
  randomBytesHex.value = toHex(bytes);
}

function handleInstallPolyfill(): void {
  polyfillWebCrypto();
  isPolyfillInstalled.value = hasGlobalCrypto();
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="web-crypto-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Web Crypto</text>
          <text class="hero-body">
            Make web libraries that expect crypto.getRandomValues, such as uuid, nanoid or wallet
            libraries, work on React Native by installing it on globalThis.crypto over the native
            random source.
          </text>
        </view>
      </view>

      <Scenario
        testID="web-crypto-scenario"
        title="Run a web library that needs crypto.getRandomValues"
        why="Libraries like uuid and nanoid call the Web Crypto API and crash without it. One polyfill call at startup gives them secure random numbers from the native source."
        :steps="[
          'Press Install polyfill',
          'Check that globalThis.crypto is installed',
          'Generate random bytes',
        ]"
        expect="The installed row switches to Yes, and every press of the random bytes button shows 16 different values."
      />

      <view testID="web-crypto-random-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Random bytes</text>
        </view>
        <ActionButton
          testID="web-crypto-random-button"
          title="Generate 16 random bytes"
          :onPress="handleGenerateRandomBytes"
          :color="lineColor"
        />
        <ValueRow v-if="randomBytesHex" label="Bytes (hex)" :value="randomBytesHex" />
      </view>

      <view testID="web-crypto-polyfill-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Polyfill</text>
        </view>
        <ActionButton
          testID="web-crypto-polyfill-button"
          title="Install polyfill"
          :onPress="handleInstallPolyfill"
          :color="lineColor"
        />
        <ValueRow
          label="globalThis.crypto installed"
          :value="isPolyfillInstalled ? 'Yes' : 'No'"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
