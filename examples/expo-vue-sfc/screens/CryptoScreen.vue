<!--
  @symbiote-native/crypto tour stop — three fire-and-inspect actions, each with its own result
  box: randomUUID() (sync), digestStringAsync(SHA256, ...) (async hex digest), and
  getRandomBytesAsync(16) (async byte array). Vue SFC twin of
  ../../react/screens/CryptoScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytesAsync,
  randomUUID,
} from '@symbiote-native/crypto/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DIGEST_SAMPLE_TEXT = 'some fixed sample string';
const RANDOM_BYTE_COUNT = 16;

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
const lineColor = LINE_COLOR[lineInfo.line];

const uuidResult = ref<string | null>(null);
const digestResult = ref<string | null>(null);
const randomBytesResult = ref<string | null>(null);

function handleGenerateUuid(): void {
  uuidResult.value = randomUUID();
}

function handleDigestSha256(): void {
  void digestStringAsync(CryptoDigestAlgorithm.SHA256, DIGEST_SAMPLE_TEXT).then(
    value => {
      digestResult.value = value;
    },
  );
}

function handleGetRandomBytes(): void {
  void getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
    randomBytesResult.value = Array.from(bytes).join(', ');
  });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="crypto-scroll"
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
          <text class="hero-title">Crypto</text>
          <text class="hero-body"
            >@symbiote-native/crypto — cryptographically secure random bytes,
            randomUUID, and string digest hashing (SHA-1/256/384/512,
            MD2/4/5).</text
          >
        </view>
      </view>

      <view testID="crypto-uuid-card" class="crypto-card">
        <text class="crypto-card-title">Random UUID</text>
        <ActionButton
          testID="crypto-generate-uuid-button"
          title="Generate UUID"
          :onPress="handleGenerateUuid"
          :color="lineColor"
        />
        <view v-if="uuidResult !== null" class="crypto-result-box">
          <text testID="crypto-uuid-result-value" class="crypto-result-text">{{
            uuidResult
          }}</text>
        </view>
      </view>

      <view testID="crypto-digest-card" class="crypto-card">
        <text class="crypto-card-title">Digest</text>
        <text class="info-text">{{
          `SHA-256 of "${DIGEST_SAMPLE_TEXT}"`
        }}</text>
        <ActionButton
          testID="crypto-digest-sha256-button"
          title="Digest SHA-256"
          :onPress="handleDigestSha256"
          :color="lineColor"
        />
        <view v-if="digestResult !== null" class="crypto-result-box">
          <text
            testID="crypto-digest-result-value"
            class="crypto-result-text"
            >{{ digestResult }}</text
          >
        </view>
      </view>

      <view testID="crypto-random-bytes-card" class="crypto-card">
        <text class="crypto-card-title">Random bytes</text>
        <ActionButton
          testID="crypto-get-random-bytes-button"
          title="Get 16 random bytes"
          :onPress="handleGetRandomBytes"
          :color="lineColor"
        />
        <view v-if="randomBytesResult !== null" class="crypto-result-box">
          <text
            testID="crypto-random-bytes-result-value"
            class="crypto-result-text"
            >{{ randomBytesResult }}</text
          >
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
