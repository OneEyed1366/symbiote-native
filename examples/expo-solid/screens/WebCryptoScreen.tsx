import { Show, createSignal, type Accessor } from 'solid-js';
import { ScrollView } from '@symbiote-native/solid';
import webCrypto, {
  polyfillWebCrypto,
} from '@symbiote-native/standard-web-crypto';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const RANDOM_BYTE_COUNT = 16;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

// `globalThis.crypto` isn't a typed global in this app's tsconfig (no DOM lib - see
// polyfillWebCrypto's own doc comment for why the package itself avoids `declare global`
// here too), so Reflect.get reads it untyped instead of tripping a TS7017 index-signature error.
function hasGlobalCrypto(): boolean {
  return Reflect.get(globalThis, 'crypto') !== undefined;
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

/**
 * @symbiote-native/standard-web-crypto canary demo: getRandomValues via the module's own
 * `webCrypto` instance, plus polyfillWebCrypto() installing that instance onto
 * globalThis.crypto (checked afterward - no ambient `crypto` exists until the polyfill runs).
 */
export function WebCryptoScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StandardWebCrypto];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [randomBytesHex, setRandomBytesHex] = createSignal<string | null>(null);
  const [isPolyfillInstalled, setIsPolyfillInstalled] =
    createSignal(hasGlobalCrypto());

  const handleGenerateRandomBytes = () => {
    const bytes = webCrypto.getRandomValues(new Uint8Array(RANDOM_BYTE_COUNT));
    setRandomBytesHex(toHex(bytes));
  };

  const handleInstallPolyfill = () => {
    polyfillWebCrypto();
    setIsPolyfillInstalled(hasGlobalCrypto());
  };

  return (
    <safe-area-view class="screen">
      <ScrollView
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
              @symbiote-native/standard-web-crypto — a Web Crypto API
              getRandomValues polyfill over @symbiote-native/crypto's native
              random source, installable onto globalThis.crypto.
            </text>
          </view>
        </view>

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
          <Show when={randomBytesHex()}>
            {(value: Accessor<string>) => (
              <ValueRow label="Bytes (hex)" value={value()} />
            )}
          </Show>
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
          <ValueRow
            label="globalThis.crypto installed"
            value={isPolyfillInstalled() ? 'Yes' : 'No'}
          />
        </view>
      </ScrollView>
    </safe-area-view>
  );
}
