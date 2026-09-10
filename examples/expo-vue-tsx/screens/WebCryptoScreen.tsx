import { defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import {
  webCrypto,
  polyfillWebCrypto,
} from '@symbiote-native/standard-web-crypto/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const RANDOM_BYTE_COUNT = 16;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * Web Crypto demo: @symbiote-native/standard-web-crypto — a partial W3C Web Crypto polyfill
 * over @symbiote-native/crypto's random source. Plain re-export, same for every adapter, so this
 * screen exercises the module directly plus the `globalThis.crypto` polyfill installer.
 */
export const WebCryptoScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto];
    const lineColor =
      LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto].line];

    const randomBytesHex: Ref<string | null> = ref(null);
    const hasGlobalCrypto: Ref<boolean> = ref(
      typeof globalThis.crypto !== 'undefined',
    );

    function handleGenerateRandomBytes() {
      const bytes = webCrypto.getRandomValues(
        new Uint8Array(RANDOM_BYTE_COUNT),
      );
      randomBytesHex.value = bytesToHex(bytes);
    }

    function handleInstallPolyfill() {
      polyfillWebCrypto();
      hasGlobalCrypto.value = typeof globalThis.crypto !== 'undefined';
    }

    return () => (
      <safe-area-view class="screen">
        <ScrollView
          testID="standard-web-crypto-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">Web Crypto</text>
              <text class="hero-body">
                @symbiote-native/standard-web-crypto — a partial W3C Web Crypto
                API polyfill exposing crypto.getRandomValues, backed by
                @symbiote-native/crypto's native random source.
              </text>
            </view>
          </view>

          <view testID="standard-web-crypto-actions-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Random bytes</text>
            </view>
            <ActionButton
              testID="standard-web-crypto-random-bytes-button"
              title="Generate 16 random bytes"
              onPress={handleGenerateRandomBytes}
              color={lineColor}
            />
            <ValueRow
              label="Random bytes (hex)"
              value={randomBytesHex.value ?? 'not generated yet'}
            />
          </view>

          <view testID="standard-web-crypto-polyfill-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Polyfill</text>
            </view>
            <ActionButton
              testID="standard-web-crypto-polyfill-button"
              title="Install polyfill"
              onPress={handleInstallPolyfill}
              color={lineColor}
            />
            <ValueRow
              label="globalThis.crypto"
              value={hasGlobalCrypto.value ? 'defined' : 'undefined'}
            />
          </view>
        </ScrollView>
      </safe-area-view>
    );
  },
  { name: 'WebCryptoScreen' },
);
