import { defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {} from '@symbiote-native/vue';
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
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
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
      digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        DIGEST_SAMPLE_STRING,
      ).then(value => {
        if (isMounted) digest.value = value;
      });
    }

    function handleGetRandomBytes() {
      getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
        if (isMounted) randomBytes.value = Array.from(bytes).join(', ');
      });
    }

    return () => (
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
                MD2/4/5), no per-instance state.
              </text>
            </view>
          </view>

          <view testID="crypto-actions-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Random + digest</text>
            </view>
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
            <ValueRow
              label="SHA-256 digest"
              value={digest.value ?? 'not computed yet'}
            />
            <ActionButton
              testID="crypto-random-bytes-button"
              title="Get 16 random bytes"
              onPress={handleGetRandomBytes}
              color={lineColor}
            />
            <ValueRow
              label="Random bytes"
              value={randomBytes.value ?? 'not generated yet'}
            />
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'CryptoScreen' },
);
