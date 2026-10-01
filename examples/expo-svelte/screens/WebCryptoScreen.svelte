<script lang="ts">
  import {
    webCrypto,
    polyfillWebCrypto,
  } from '@symbiote-native/standard-web-crypto/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

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

  let randomBytesHex = $state<string | null>(null);
  let isPolyfillInstalled = $state(hasGlobalCrypto());

  function handleGenerateRandomBytes(): void {
    const bytes = webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT));
    randomBytesHex = toHex(bytes);
  }

  function handleInstallPolyfill(): void {
    polyfillWebCrypto();
    isPolyfillInstalled = hasGlobalCrypto();
  }
</script>

{#snippet valueRow(label: string, value: string)}
  <view class="capability-row">
    <text class="capability-label">{label}</text>
    <text class="value-text">{value}</text>
  </view>
{/snippet}

<safe-area-view class="screen">
  <scroll-view
    testID="web-crypto-scroll"
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
          Make web libraries that expect crypto.getRandomValues, such as uuid,
          nanoid or wallet libraries, work on React Native by installing it on
          globalThis.crypto over the native random source.
        </text>
      </view>
    </view>

    <Scenario
      testID="web-crypto-scenario"
      title="Run a web library that needs crypto.getRandomValues"
      why="Libraries like uuid and nanoid call the Web Crypto API and crash without it. One polyfill call at startup gives them secure random numbers from the native source."
      steps={[
        'Press Install polyfill',
        'Check that globalThis.crypto is installed',
        'Generate random bytes',
      ]}
      expect="The installed row switches to Yes, and every press of the random bytes button shows 16 different values."
    />

    <view testID="web-crypto-random-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Random bytes</text>
      </view>
      <ActionButton
        testID="web-crypto-random-button"
        title="Generate 16 random bytes"
        onPress={handleGenerateRandomBytes}
        color={lineColor}
      />
      {#if randomBytesHex}
        {@render valueRow('Bytes (hex)', randomBytesHex)}
      {/if}
    </view>

    <view testID="web-crypto-polyfill-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Polyfill</text>
      </view>
      <ActionButton
        testID="web-crypto-polyfill-button"
        title="Install polyfill"
        onPress={handleInstallPolyfill}
        color={lineColor}
      />
      {@render valueRow(
        'globalThis.crypto installed',
        isPolyfillInstalled ? 'Yes' : 'No',
      )}
    </view>
  </scroll-view>
</safe-area-view>
