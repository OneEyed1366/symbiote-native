import { createSignal } from 'solid-js';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytesAsync,
  randomUUID,
} from '@symbiote-native/crypto';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DIGEST_SAMPLE_STRING = 'some fixed sample string';
const RANDOM_BYTE_COUNT = 16;

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

/**
 * @symbiote-native/crypto canary demo: three one-shot calls covering the package's whole
 * surface - randomUUID (sync), digestStringAsync (async, SHA-256 of a fixed sample string), and
 * getRandomBytesAsync (async, a fixed-length random buffer).
 */
export function CryptoScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [uuid, setUuid] = createSignal<string | null>(null);
  const [digest, setDigest] = createSignal<string | null>(null);
  const [randomBytes, setRandomBytes] = createSignal<string | null>(null);

  const handleGenerateUuid = () => {
    setUuid(randomUUID());
  };

  const handleDigest = () => {
    digestStringAsync(CryptoDigestAlgorithm.SHA256, DIGEST_SAMPLE_STRING).then(
      setDigest,
    );
  };

  const handleGetRandomBytes = () => {
    getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
      setRandomBytes(Array.from(bytes).join(', '));
    });
  };

  return (
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
              @symbiote-native/crypto — cryptographically secure random bytes,
              randomUUID, and string digest hashing (SHA-1/256/384/512,
              MD2/4/5).
            </text>
          </view>
        </view>

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
          {uuid() !== null && <ValueRow label="UUID" value={uuid()!} />}
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
          {digest() !== null && <ValueRow label="SHA-256" value={digest()!} />}
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
          {randomBytes() !== null && (
            <ValueRow label="Bytes" value={randomBytes()!} />
          )}
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
