import { createSignal } from 'solid-js';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
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
    <View class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <Text class="value-text">{props.value}</Text>
    </View>
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
    <SafeAreaView class="screen">
      <ScrollView
        testID="crypto-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Crypto</Text>
            <Text class="hero-body">
              @symbiote-native/crypto — cryptographically secure random bytes,
              randomUUID, and string digest hashing (SHA-1/256/384/512,
              MD2/4/5).
            </Text>
          </View>
        </View>

        <View testID="crypto-uuid-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Random UUID</Text>
          </View>
          <ActionButton
            testID="crypto-uuid-button"
            title="Generate UUID"
            onPress={handleGenerateUuid}
            color={lineColor}
          />
          {uuid() !== null && <ValueRow label="UUID" value={uuid()!} />}
        </View>

        <View testID="crypto-digest-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Digest</Text>
          </View>
          <ActionButton
            testID="crypto-digest-button"
            title="Digest SHA-256"
            onPress={handleDigest}
            color={lineColor}
          />
          {digest() !== null && <ValueRow label="SHA-256" value={digest()!} />}
        </View>

        <View testID="crypto-random-bytes-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Random bytes</Text>
          </View>
          <ActionButton
            testID="crypto-random-bytes-button"
            title="Get 16 random bytes"
            onPress={handleGetRandomBytes}
            color={lineColor}
          />
          {randomBytes() !== null && (
            <ValueRow label="Bytes" value={randomBytes()!} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
