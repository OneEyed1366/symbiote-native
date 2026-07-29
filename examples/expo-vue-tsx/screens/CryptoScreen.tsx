import { defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytesAsync,
  randomUUID,
} from '@symbiote-native/crypto/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DIGEST_SAMPLE_STRING = 'some fixed sample string';
const RANDOM_BYTE_COUNT = 16;

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

/**
 * Crypto demo: @symbiote-native/crypto — three one-shot calls with no per-instance state: a UUID
 * generator, a SHA-256 digest over a fixed sample string, and a random-bytes fetch rendered as
 * comma-separated numbers. Vue TSX twin of ../../expo-react/screens/CryptoScreen.tsx.
 */
export const CryptoScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Crypto].line];

    const uuid: Ref<string | null> = ref(null);
    const digest: Ref<string | null> = ref(null);
    const randomBytes: Ref<string | null> = ref(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function handleGenerateUuid() {
      uuid.value = randomUUID();
    }

    function handleDigest() {
      digestStringAsync(CryptoDigestAlgorithm.SHA256, DIGEST_SAMPLE_STRING).then(value => {
        if (isMounted) digest.value = value;
      });
    }

    function handleGetRandomBytes() {
      getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
        if (isMounted) randomBytes.value = Array.from(bytes).join(', ');
      });
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="crypto-scroll" class="screen" contentContainerStyle="scroll-content">
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
                @symbiote-native/crypto — cryptographically secure random bytes, randomUUID, and
                string digest hashing (SHA-1/256/384/512, MD2/4/5), no per-instance state.
              </Text>
            </View>
          </View>

          <View testID="crypto-actions-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Random + digest</Text>
            </View>
            <ActionButton
              testID="crypto-uuid-button"
              title="Generate UUID"
              onPress={handleGenerateUuid}
              color={lineColor}
            />
            <ValueRow label="UUID" value={uuid.value ?? 'not generated yet'} />
            <ActionButton
              testID="crypto-digest-button"
              title="Digest SHA-256"
              onPress={handleDigest}
              color={lineColor}
            />
            <ValueRow label="SHA-256 digest" value={digest.value ?? 'not computed yet'} />
            <ActionButton
              testID="crypto-random-bytes-button"
              title="Get 16 random bytes"
              onPress={handleGetRandomBytes}
              color={lineColor}
            />
            <ValueRow label="Random bytes" value={randomBytes.value ?? 'not generated yet'} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'CryptoScreen' },
);
