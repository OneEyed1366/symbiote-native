<script lang="ts">
  // @symbiote-native/standard-web-crypto tour stop — two independent actions: generate random bytes
  // via the polyfill's own `webCrypto.getRandomValues` (rendered as a hex string, same "long value"
  // case CryptoScreen's stacked result-box handles), and install the polyfill onto `globalThis.crypto`
  // then report whether it stuck. Svelte twin of examples/expo-vue-sfc/screens/WebCryptoScreen.vue.
  import {
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
  import {
    webCrypto,
    polyfillWebCrypto,
  } from '@symbiote-native/standard-web-crypto/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const RANDOM_BYTE_COUNT = 16;
  const HEX_RADIX = 16;
  const HEX_PAD_LENGTH = 2;

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto];
  const lineColor = LINE_COLOR[lineInfo.line];

  let randomBytesResult = $state<string | null>(null);
  let isPolyfillInstalledResult = $state<boolean | null>(null);

  function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(byte => byte.toString(HEX_RADIX).padStart(HEX_PAD_LENGTH, '0'))
      .join('');
  }

  function handleGenerateRandomBytes(): void {
    const bytes = webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT));
    randomBytesResult = toHex(bytes);
  }

  function handleInstallPolyfill(): void {
    polyfillWebCrypto();
    isPolyfillInstalledResult = typeof globalThis.crypto !== 'undefined';
  }
</script>

<SafeAreaView class="screen">
  <ScrollView
    testID="web-crypto-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
    </View>
    <View class="hero-card">
      <View class="hero-badge" style={{ backgroundColor: lineColor }}>
        <Text class="hero-badge-text">{lineInfo.code}</Text>
      </View>
      <View class="hero-copy">
        <Text class="hero-title">Web Crypto</Text>
        <Text class="hero-body">
          @symbiote-native/standard-web-crypto — a Web Crypto API
          `getRandomValues` polyfill built on @symbiote-native/crypto's native
          random source.
        </Text>
      </View>
    </View>
    <View testID="web-crypto-random-bytes-card" class="web-crypto-card">
      <Text class="web-crypto-card-title">Random bytes</Text>
      <ActionButton
        testID="web-crypto-generate-random-bytes-button"
        title="Generate 16 random bytes"
        onPress={handleGenerateRandomBytes}
        color={lineColor}
      />{#if randomBytesResult !== null}<View class="web-crypto-result-box">
          <Text
            testID="web-crypto-random-bytes-result-value"
            class="web-crypto-result-text"
          >
            {randomBytesResult}
          </Text>
        </View>{/if}
    </View>
    <View testID="web-crypto-polyfill-card" class="web-crypto-card">
      <Text class="web-crypto-card-title">Polyfill</Text>
      <ActionButton
        testID="web-crypto-install-polyfill-button"
        title="Install polyfill"
        onPress={handleInstallPolyfill}
        color={lineColor}
      />{#if isPolyfillInstalledResult !== null}<View class="web-crypto-row">
          <Text class="web-crypto-row-label">globalThis.crypto defined</Text>
          <Text
            testID="web-crypto-polyfill-result-value"
            class="web-crypto-value-text"
          >
            {isPolyfillInstalledResult ? 'Yes' : 'No'}
          </Text>
        </View>{/if}
    </View>
  </ScrollView>
</SafeAreaView>
