import { defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { webCrypto, polyfillWebCrypto } from '@symbiote-native/standard-web-crypto/vue';
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
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
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
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto].line];

    const randomBytesHex: Ref<string | null> = ref(null);
    const hasGlobalCrypto: Ref<boolean> = ref(typeof globalThis.crypto !== 'undefined');

    function handleGenerateRandomBytes() {
      const bytes = webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT));
      randomBytesHex.value = bytesToHex(bytes);
    }

    function handleInstallPolyfill() {
      polyfillWebCrypto();
      hasGlobalCrypto.value = typeof globalThis.crypto !== 'undefined';
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="standard-web-crypto-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Web Crypto</Text>
              <Text class="hero-body">
                @symbiote-native/standard-web-crypto — a partial W3C Web Crypto API polyfill
                exposing crypto.getRandomValues, backed by @symbiote-native/crypto's native random
                source.
              </Text>
            </View>
          </View>

          <View testID="standard-web-crypto-actions-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Random bytes</Text>
            </View>
            <ActionButton
              testID="standard-web-crypto-random-bytes-button"
              title="Generate 16 random bytes"
              onPress={handleGenerateRandomBytes}
              color={lineColor}
            />
            <ValueRow label="Random bytes (hex)" value={randomBytesHex.value ?? 'not generated yet'} />
          </View>

          <View testID="standard-web-crypto-polyfill-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Polyfill</Text>
            </View>
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
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'WebCryptoScreen' },
);
