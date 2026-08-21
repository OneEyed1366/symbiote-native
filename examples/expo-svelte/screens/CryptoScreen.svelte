<script lang="ts">
  // @symbiote-native/crypto tour stop — three fire-and-inspect actions, each with its own result
  // box: randomUUID() (sync), digestStringAsync(SHA256, ...) (async hex digest), and
  // getRandomBytesAsync(16) (async byte array). Svelte twin of
  // examples/expo-vue-sfc/screens/CryptoScreen.vue.
  import {
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
  import {
    CryptoDigestAlgorithm,
    digestStringAsync,
    getRandomBytesAsync,
    randomUUID,
  } from '@symbiote-native/crypto/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const DIGEST_SAMPLE_TEXT = 'some fixed sample string';
  const RANDOM_BYTE_COUNT = 16;

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Crypto];
  const lineColor = LINE_COLOR[lineInfo.line];

  let uuidResult = $state<string | null>(null);
  let digestResult = $state<string | null>(null);
  let randomBytesResult = $state<string | null>(null);

  function handleGenerateUuid(): void {
    uuidResult = randomUUID();
  }

  function handleDigestSha256(): void {
    void digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      DIGEST_SAMPLE_TEXT,
    ).then(value => {
      digestResult = value;
    });
  }

  function handleGetRandomBytes(): void {
    void getRandomBytesAsync(RANDOM_BYTE_COUNT).then(bytes => {
      randomBytesResult = Array.from(bytes).join(', ');
    });
  }
</script>

<SafeAreaView class="screen">
  <ScrollView
    testID="crypto-scroll"
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
        <Text class="hero-title">Crypto</Text>
        <Text class="hero-body">
          @symbiote-native/crypto — cryptographically secure random bytes,
          randomUUID, and string digest hashing (SHA-1/256/384/512, MD2/4/5).
        </Text>
      </View>
    </View>
    <View testID="crypto-uuid-card" class="crypto-card">
      <Text class="crypto-card-title">Random UUID</Text>
      <ActionButton
        testID="crypto-generate-uuid-button"
        title="Generate UUID"
        onPress={handleGenerateUuid}
        color={lineColor}
      />{#if uuidResult !== null}<View class="crypto-result-box">
          <Text testID="crypto-uuid-result-value" class="crypto-result-text">
            {uuidResult}
          </Text>
        </View>{/if}
    </View>
    <View testID="crypto-digest-card" class="crypto-card">
      <Text class="crypto-card-title">Digest</Text>
      <Text class="info-text">
        {`SHA-256 of "${DIGEST_SAMPLE_TEXT}"`}
      </Text>
      <ActionButton
        testID="crypto-digest-sha256-button"
        title="Digest SHA-256"
        onPress={handleDigestSha256}
        color={lineColor}
      />{#if digestResult !== null}<View class="crypto-result-box">
          <Text testID="crypto-digest-result-value" class="crypto-result-text">
            {digestResult}
          </Text>
        </View>{/if}
    </View>
    <View testID="crypto-random-bytes-card" class="crypto-card">
      <Text class="crypto-card-title">Random bytes</Text>
      <ActionButton
        testID="crypto-get-random-bytes-button"
        title="Get 16 random bytes"
        onPress={handleGetRandomBytes}
        color={lineColor}
      />{#if randomBytesResult !== null}<View class="crypto-result-box">
          <Text
            testID="crypto-random-bytes-result-value"
            class="crypto-result-text"
          >
            {randomBytesResult}
          </Text>
        </View>{/if}
    </View>
  </ScrollView>
</SafeAreaView>
