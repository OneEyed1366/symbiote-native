import { createEffect, createSignal } from 'solid-js';
import { Platform, SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/solid';
import {
  getStringAsync,
  getUrlAsync,
  hasStringAsync,
  hasUrlAsync,
  setStringAsync,
  setUrlAsync,
} from '@symbiote-native/clipboard';
import { createClipboard } from '@symbiote-native/clipboard/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label = () =>
    props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO';
  return (
    <View class={`status-badge status-badge-${props.status}`}>
      <Text class="status-badge-text">{label()}</Text>
    </View>
  );
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <View testID={props.testID} class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <CapabilityBadge status={props.status} />
    </View>
  );
}

/**
 * @symbiote-native/clipboard canary demo: a value card (current clipboard string, seeded via
 * getStringAsync() on mount and refreshed on every createClipboard() change event) plus a
 * hasStringAsync() status row, a copy-text card driving setStringAsync, and, iOS-only, a URL
 * get/set/has row (getUrlAsync/setUrlAsync/hasUrlAsync - iOS-only upstream). Copy something
 * outside the app (another app, a share sheet) to see the value below update on its own.
 */
export function ClipboardScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
  const lineColor = LINE_COLOR[lineInfo.line];

  const clipboardEvent = createClipboard();
  const [clipboardText, setClipboardText] = createSignal<string | null>(null);
  const [hasString, setHasString] = createSignal<ICapabilityStatus>('checking');
  const [inputText, setInputText] = createSignal('');

  const [urlText, setUrlText] = createSignal('');
  const [clipboardUrl, setClipboardUrl] = createSignal<string | null>(null);
  const [hasUrl, setHasUrl] = createSignal<ICapabilityStatus>('checking');

  // clipboardEvent only carries the changed content TYPES, not the string itself - re-fetch the
  // actual value on mount (clipboardEvent starts null) and on every subsequent change event.
  // createEffect (not a bare body call) because this must re-run every time the tracked
  // clipboardEvent() signal changes, not just once at mount.
  createEffect(() => {
    clipboardEvent();
    let isCurrent = true;
    Promise.all([getStringAsync(), hasStringAsync()]).then(([text, hasText]) => {
      if (isCurrent) {
        setClipboardText(text);
        setHasString(toCapabilityStatus(hasText));
      }
    });
    return () => {
      isCurrent = false;
    };
  });

  createEffect(() => {
    clipboardEvent();
    if (Platform.OS !== 'ios') {
      return;
    }
    let isCurrent = true;
    Promise.all([getUrlAsync(), hasUrlAsync()]).then(([url, hasUrlValue]) => {
      if (isCurrent) {
        setClipboardUrl(url);
        setHasUrl(toCapabilityStatus(hasUrlValue));
      }
    });
  });

  const handleCopy = () => {
    setStringAsync(inputText());
  };

  const handleSetUrl = () => {
    setUrlAsync(urlText()).then(() => getUrlAsync().then(setClipboardUrl));
  };

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="clipboard-scroll"
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
            <Text class="hero-title">Clipboard</Text>
            <Text class="hero-body">
              @symbiote-native/clipboard — read/write clipboard text and URLs,
              plus a live change-event subscription via createClipboard(). Copy
              something outside the app to see the value below update on its
              own.
            </Text>
          </View>
        </View>

        <View testID="clipboard-value-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Current value</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Clipboard text</Text>
            <Text class="value-text">
              {clipboardText() === null
                ? 'checking…'
                : clipboardText() || '(empty)'}
            </Text>
          </View>
          <CapabilityRow
            testID="clipboard-has-string"
            label="Has string"
            status={hasString()}
          />
        </View>

        <View testID="clipboard-copy-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Copy text</Text>
          </View>
          <TextInput
            testID="clipboard-copy-input"
            value={inputText()}
            onValueChange={setInputText}
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
        </View>

        {Platform.OS === 'ios' && (
          <View testID="clipboard-url-card" class="feature-card">
            <View class="feature-card-header">
              <Text class="feature-card-title">URL (iOS only)</Text>
            </View>
            <View class="capability-row">
              <Text class="capability-label">Clipboard URL</Text>
              <Text class="value-text">
                {clipboardUrl() === null ? 'checking…' : clipboardUrl() || '(none)'}
              </Text>
            </View>
            <CapabilityRow
              testID="clipboard-has-url"
              label="Has URL"
              status={hasUrl()}
            />
            <TextInput
              testID="clipboard-url-input"
              value={urlText()}
              onValueChange={setUrlText}
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
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
