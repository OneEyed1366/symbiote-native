<script lang="ts">
  import {
    CryptoDigestAlgorithm,
    digestStringAsync,
    getRandomBytesAsync,
    randomUUID,
  } from '@symbiote-native/crypto/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const DIGEST_SAMPLE_STRING = 'some fixed sample string';
  const RANDOM_BYTE_COUNT = 16;

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
  const lineColor = LINE_COLOR[lineInfo.line];

  let uuid = $state<string | null>(null);
  let digest = $state<string | null>(null);
  let randomBytes = $state<string | null>(null);

  function handleGenerateUuid(): void {
    uuid = randomUUID();
  }

  function handleDigest(): void {
    void digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      DIGEST_SAMPLE_STRING,
    ).then(value => {
      digest = value;
    });
  }

  function handleGetRandomBytes(): void {
    void getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
      randomBytes = Array.from(bytes).join(', ');
    });
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
    testID="crypto-scroll"
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
        <text class="hero-title">Crypto</text>
        <text class="hero-body">
          Generate secure random bytes and unique ids, and hash strings with SHA
          or MD algorithms, using the platform's native cryptography instead of
          JavaScript code.
        </text>
      </view>
    </view>

    <Scenario
      testID="crypto-scenario"
      title="Create unique ids, tokens and checksums"
      why="Use a random UUID as an idempotency key, random bytes as a nonce or session secret, and a digest to verify that a file or a password input is unchanged."
      steps={[
        'Press the UUID button twice',
        'Generate random bytes',
        'Hash the same text twice with SHA-256',
      ]}
      expect="Every UUID and byte string differs, while the same text always gives the same SHA-256 digest. Known test vectors match the published values."
    />

    <view testID="crypto-uuid-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Random UUID</text>
      </view>
      <ActionButton
        testID="crypto-uuid-button"
        title="Generate UUID"
        onPress={handleGenerateUuid}
        color={lineColor}
      />
      {#if uuid !== null}
        {@render valueRow('UUID', uuid)}
      {/if}
    </view>

    <view testID="crypto-digest-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Digest</text>
      </view>
      <ActionButton
        testID="crypto-digest-button"
        title="Digest SHA-256"
        onPress={handleDigest}
        color={lineColor}
      />
      {#if digest !== null}
        {@render valueRow('SHA-256', digest)}
      {/if}
    </view>

    <view testID="crypto-random-bytes-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Random bytes</text>
      </view>
      <ActionButton
        testID="crypto-random-bytes-button"
        title="Get 16 random bytes"
        onPress={handleGetRandomBytes}
        color={lineColor}
      />
      {#if randomBytes !== null}
        {@render valueRow('Bytes', randomBytes)}
      {/if}
    </view>
  </scroll-view>
</safe-area-view>
