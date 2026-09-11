import { useCallback, useState } from 'react';
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

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

/**
 * @symbiote-native/crypto canary demo: three one-shot calls covering the package's whole
 * surface — randomUUID (sync), digestStringAsync (async, SHA-256 of a fixed sample string), and
 * getRandomBytesAsync (async, a fixed-length random buffer).
 */
export function CryptoScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [uuid, setUuid] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [randomBytes, setRandomBytes] = useState<string | null>(null);

  const handleGenerateUuid = useCallback(() => {
    setUuid(randomUUID());
  }, []);

  const handleDigest = useCallback(() => {
    digestStringAsync(CryptoDigestAlgorithm.SHA256, DIGEST_SAMPLE_STRING).then(
      setDigest,
    );
  }, []);

  const handleGetRandomBytes = useCallback(() => {
    getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
      setRandomBytes(Array.from(bytes).join(', '));
    });
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="crypto-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Crypto</text>
            <text className="hero-body">
              @symbiote-native/crypto — cryptographically secure random bytes,
              randomUUID, and string digest hashing (SHA-1/256/384/512,
              MD2/4/5).
            </text>
          </view>
        </view>

        <view testID="crypto-uuid-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Random UUID</text>
          </view>
          <ActionButton
            testID="crypto-uuid-button"
            title="Generate UUID"
            onPress={handleGenerateUuid}
            color={lineColor}
          />
          {uuid !== null && <ValueRow label="UUID" value={uuid} />}
        </view>

        <view testID="crypto-digest-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Digest</text>
          </view>
          <ActionButton
            testID="crypto-digest-button"
            title="Digest SHA-256"
            onPress={handleDigest}
            color={lineColor}
          />
          {digest !== null && <ValueRow label="SHA-256" value={digest} />}
        </view>

        <view testID="crypto-random-bytes-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Random bytes</text>
          </view>
          <ActionButton
            testID="crypto-random-bytes-button"
            title="Get 16 random bytes"
            onPress={handleGetRandomBytes}
            color={lineColor}
          />
          {randomBytes !== null && (
            <ValueRow label="Bytes" value={randomBytes} />
          )}
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
