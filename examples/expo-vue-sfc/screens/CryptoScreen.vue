<script setup lang="ts">
import { ref } from 'vue';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytesAsync,
  randomUUID,
} from '@symbiote-native/crypto/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const DIGEST_SAMPLE_STRING = 'some fixed sample string';
const RANDOM_BYTE_COUNT = 16;

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
const lineColor = LINE_COLOR[lineInfo.line];

const uuid = ref<string | null>(null);
const digest = ref<string | null>(null);
const randomBytes = ref<string | null>(null);

function handleGenerateUuid(): void {
  uuid.value = randomUUID();
}

function handleDigest(): void {
  void digestStringAsync(CryptoDigestAlgorithm.SHA256, DIGEST_SAMPLE_STRING).then(value => {
    digest.value = value;
  });
}

function handleGetRandomBytes(): void {
  void getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
    randomBytes.value = Array.from(bytes).join(', ');
  });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="crypto-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Crypto</text>
          <text class="hero-body">
            Generate secure random bytes and unique ids, and hash strings with SHA or MD algorithms,
            using the platform's native cryptography instead of JavaScript code.
          </text>
        </view>
      </view>

      <Scenario
        testID="crypto-scenario"
        title="Create unique ids, tokens and checksums"
        why="Use a random UUID as an idempotency key, random bytes as a nonce or session secret, and a digest to verify that a file or a password input is unchanged."
        :steps="[
          'Press the UUID button twice',
          'Generate random bytes',
          'Hash the same text twice with SHA-256',
        ]"
        expect="Every UUID and byte string differs, while the same text always gives the same SHA-256 digest. Known test vectors match the published values."
      />

      <view testID="crypto-uuid-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Random UUID</text>
        </view>
        <ActionButton
          testID="crypto-uuid-button"
          title="Generate UUID"
          :onPress="handleGenerateUuid"
          :color="lineColor"
        />
        <ValueRow v-if="uuid !== null" label="UUID" :value="uuid" />
      </view>

      <view testID="crypto-digest-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Digest</text>
        </view>
        <ActionButton
          testID="crypto-digest-button"
          title="Digest SHA-256"
          :onPress="handleDigest"
          :color="lineColor"
        />
        <ValueRow v-if="digest !== null" label="SHA-256" :value="digest" />
      </view>

      <view testID="crypto-random-bytes-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Random bytes</text>
        </view>
        <ActionButton
          testID="crypto-random-bytes-button"
          title="Get 16 random bytes"
          :onPress="handleGetRandomBytes"
          :color="lineColor"
        />
        <ValueRow v-if="randomBytes !== null" label="Bytes" :value="randomBytes" />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
