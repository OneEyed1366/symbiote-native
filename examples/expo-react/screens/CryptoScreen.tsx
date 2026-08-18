import { useCallback, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
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
    <View className="capability-row">
      <Text className="capability-label">{label}</Text>
      <Text className="value-text">{value}</Text>
    </View>
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
    <SafeAreaView className="screen">
      <ScrollView
        testID="crypto-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Crypto</Text>
            <Text className="hero-body">
              @symbiote-native/crypto — cryptographically secure random bytes,
              randomUUID, and string digest hashing (SHA-1/256/384/512,
              MD2/4/5).
            </Text>
          </View>
        </View>

        <View testID="crypto-uuid-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Random UUID</Text>
          </View>
          <ActionButton
            testID="crypto-uuid-button"
            title="Generate UUID"
            onPress={handleGenerateUuid}
            color={lineColor}
          />
          {uuid !== null && <ValueRow label="UUID" value={uuid} />}
        </View>

        <View testID="crypto-digest-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Digest</Text>
          </View>
          <ActionButton
            testID="crypto-digest-button"
            title="Digest SHA-256"
            onPress={handleDigest}
            color={lineColor}
          />
          {digest !== null && <ValueRow label="SHA-256" value={digest} />}
        </View>

        <View testID="crypto-random-bytes-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Random bytes</Text>
          </View>
          <ActionButton
            testID="crypto-random-bytes-button"
            title="Get 16 random bytes"
            onPress={handleGetRandomBytes}
            color={lineColor}
          />
          {randomBytes !== null && (
            <ValueRow label="Bytes" value={randomBytes} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
