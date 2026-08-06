import { defineComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { Platform, SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/vue';
import { getStringAsync, getUrlAsync, hasStringAsync, hasUrlAsync, setStringAsync, setUrlAsync } from '@symbiote-native/clipboard';
import { useClipboard } from '@symbiote-native/clipboard/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow(props: { testID: string; label: string; status: ICapabilityStatus }) {
  return (
    <View testID={props.testID} class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <View class={`auth-status-badge auth-status-badge-${props.status}`}>
        <Text class="auth-status-text">
          {props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO'}
        </Text>
      </View>
    </View>
  );
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

/**
 * Clipboard demo: @symbiote-native/clipboard — the current text value is seeded via
 * getStringAsync() on mount, then re-fetched every time useClipboard()'s change listener fires
 * (the listener event itself only carries `contentTypes`, not the string, matching upstream's
 * own addClipboardListener payload — so a fresh read is the only way to see the new content). On
 * iOS only, a second card exercises the URL-specific get/set/has surface. Vue TSX twin of
 * ../../expo-react/screens/LocalAuthScreen.tsx's capability-card shape.
 */
export const ClipboardScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Clipboard].line];

    const clipboardText = ref('');
    const hasString = ref<ICapabilityStatus>('checking');
    const inputText = ref('');
    const clipboardEvent = useClipboard();

    const urlValue: Ref<string | null> = ref(null);
    const hasUrl = ref<ICapabilityStatus>('checking');
    const urlInput = ref('');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function refreshString() {
      getStringAsync().then(value => {
        if (isMounted) clipboardText.value = value;
      });
      hasStringAsync().then(value => {
        if (isMounted) hasString.value = toCapabilityStatus(value);
      });
    }

    function refreshUrl() {
      getUrlAsync().then(value => {
        if (isMounted) urlValue.value = value;
      });
      hasUrlAsync().then(value => {
        if (isMounted) hasUrl.value = toCapabilityStatus(value);
      });
    }

    onMounted(() => {
      refreshString();
      if (Platform.OS === 'ios') refreshUrl();
    });

    watch(clipboardEvent, () => {
      refreshString();
    });

    function handleCopy() {
      setStringAsync(inputText.value).then(refreshString);
    }

    function handleSetUrl() {
      setUrlAsync(urlInput.value).then(refreshUrl);
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="clipboard-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Clipboard</Text>
              <Text class="hero-body">
                @symbiote-native/clipboard — reads and writes the system clipboard text/URL
                content, plus a change listener. iOS 16+ may prompt for paste permission on every
                read.
              </Text>
            </View>
          </View>

          <View testID="clipboard-value-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Current value</Text>
            </View>
            <Text testID="clipboard-current-text" class="auth-value-text">
              {clipboardText.value || '(empty)'}
            </Text>
            <CapabilityRow testID="clipboard-has-string" label="Has text" status={hasString.value} />
          </View>

          <View testID="clipboard-copy-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Copy text</Text>
            </View>
            <TextInput
              testID="clipboard-input"
              value={inputText.value}
              onValueChange={(text: string) => {
                inputText.value = text;
              }}
              placeholder="Type something to copy…"
              placeholderTextColor="#41506a"
              class="text-input"
            />
            <ActionButton testID="clipboard-copy-button" title="Copy text" onPress={handleCopy} color={lineColor} />
          </View>

          {Platform.OS === 'ios' && (
            <View testID="clipboard-url-card" class="auth-card">
              <View class="auth-card-header">
                <Text class="auth-card-title">URL</Text>
              </View>
              <ValueRow label="Current URL" value={urlValue.value ?? '(none)'} />
              <CapabilityRow testID="clipboard-has-url" label="Has URL" status={hasUrl.value} />
              <TextInput
                testID="clipboard-url-input"
                value={urlInput.value}
                onValueChange={(text: string) => {
                  urlInput.value = text;
                }}
                placeholder="https://example.com"
                placeholderTextColor="#41506a"
                class="text-input"
              />
              <ActionButton testID="clipboard-set-url-button" title="Set URL" onPress={handleSetUrl} color={lineColor} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'ClipboardScreen' },
);
