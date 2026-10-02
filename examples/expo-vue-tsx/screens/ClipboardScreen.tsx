import { defineComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  getStringAsync,
  getUrlAsync,
  hasStringAsync,
  hasUrlAsync,
  setStringAsync,
  setUrlAsync,
} from '@symbiote-native/clipboard';
import { useClipboard } from '@symbiote-native/clipboard/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label =
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view class={`status-badge status-badge-${props.status}`}>
      <text class="status-badge-text">{label}</text>
    </view>
  );
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <view testID={props.testID} class="capability-row">
      <text class="capability-label">{props.label}</text>
      <CapabilityBadge status={props.status} />
    </view>
  );
}

// `clipboardEvent` carries only content types, so the text is re-fetched on every change
function useClipboardText(clipboardEvent: ReturnType<typeof useClipboard>) {
  const clipboardText = ref<string | null>(null);
  const hasString = ref<ICapabilityStatus>('checking');
  let isMounted = true;
  const refresh = () => {
    Promise.all([getStringAsync(), hasStringAsync()]).then(
      ([text, hasText]) => {
        if (isMounted) {
          clipboardText.value = text;
          hasString.value = toCapabilityStatus(hasText);
        }
      },
    );
  };
  onMounted(refresh);
  watch(clipboardEvent, refresh);
  onUnmounted(() => {
    isMounted = false;
  });
  return { clipboardText, hasString };
}

// URL get/set/has exists on iOS only
function useClipboardUrl(clipboardEvent: ReturnType<typeof useClipboard>) {
  const clipboardUrl = ref<string | null>(null);
  const hasUrl = ref<ICapabilityStatus>('checking');
  let isMounted = true;
  const refresh = () => {
    if (Platform.OS !== 'ios') {
      return;
    }
    Promise.all([getUrlAsync(), hasUrlAsync()]).then(([url, hasUrlValue]) => {
      if (isMounted) {
        clipboardUrl.value = url;
        hasUrl.value = toCapabilityStatus(hasUrlValue);
      }
    });
  };
  onMounted(refresh);
  watch(clipboardEvent, refresh);
  onUnmounted(() => {
    isMounted = false;
  });
  const setUrl = (text: string) =>
    setUrlAsync(text).then(() =>
      getUrlAsync().then(url => {
        clipboardUrl.value = url;
      }),
    );
  return { clipboardUrl, hasUrl, setUrl };
}

export const ClipboardScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
    const lineColor = LINE_COLOR[lineInfo.line];

    const clipboardEvent = useClipboard();
    const { clipboardText, hasString } = useClipboardText(clipboardEvent);
    const { clipboardUrl, hasUrl, setUrl } = useClipboardUrl(clipboardEvent);
    const inputText = ref('');
    const urlText = ref('');

    const handleCopy = () => {
      setStringAsync(inputText.value);
    };

    const handleSetUrl = () => {
      setUrl(urlText.value);
    };

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="clipboard-scroll"
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
              <text class="hero-title">Clipboard</text>
              <text class="hero-body">
                Copy and paste from the app: write text or a link to the system
                clipboard, read it back and follow changes live. Copy something
                in another app to see the value below update on its own.
              </text>
            </view>
          </view>

          <Scenario
            testID="clipboard-scenario"
            title="Copy a promo code or an invite link with one tap"
            why="Copy buttons save users from selecting text by hand. Reading the clipboard lets the app offer to paste a code or a link the user just copied elsewhere."
            steps={['Write some text and press copy', 'Open another app and paste', 'Copy something in another app and come back']}
            expect="The pasted text matches what you copied. The value card updates by itself when the clipboard changes outside the app."
          />

          <view testID="clipboard-value-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Current value</text>
            </view>
            <view class="capability-row">
              <text class="capability-label">Clipboard text</text>
              <text class="value-text">
                {clipboardText.value === null
                  ? 'checking…'
                  : clipboardText.value || '(empty)'}
              </text>
            </view>
            <CapabilityRow
              testID="clipboard-has-string"
              label="Has string"
              status={hasString.value}
            />
          </view>

          <view testID="clipboard-copy-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Copy text</text>
            </view>
            <text-input
              testID="clipboard-copy-input"
              value={inputText.value}
              onValueChange={event => {
                inputText.value = event.text;
              }}
              placeholder="Type something to copy"
              placeholderTextColor="#41506a"
              class="text-input"
            />
            <ActionButton
              testID="clipboard-copy-button"
              title="Copy text"
              onPress={handleCopy}
              color={lineColor}
            />
          </view>

          {Platform.OS === 'ios' && (
            <view testID="clipboard-url-card" class="feature-card">
              <view class="feature-card-header">
                <text class="feature-card-title">URL (iOS only)</text>
              </view>
              <view class="capability-row">
                <text class="capability-label">Clipboard URL</text>
                <text class="value-text">
                  {clipboardUrl.value === null
                    ? 'checking…'
                    : clipboardUrl.value || '(none)'}
                </text>
              </view>
              <CapabilityRow
                testID="clipboard-has-url"
                label="Has URL"
                status={hasUrl.value}
              />
              <text-input
                testID="clipboard-url-input"
                value={urlText.value}
                onValueChange={event => {
                  urlText.value = event.text;
                }}
                placeholder="https://example.com"
                placeholderTextColor="#41506a"
                class="text-input"
              />
              <ActionButton
                testID="clipboard-set-url-button"
                title="Set URL"
                onPress={handleSetUrl}
                color={lineColor}
              />
            </view>
          )}
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'ClipboardScreen' },
);
