import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/react';
import {
  getStringAsync,
  getUrlAsync,
  hasStringAsync,
  hasUrlAsync,
  setStringAsync,
  setUrlAsync,
} from '@symbiote-native/clipboard';
import { useClipboard } from '@symbiote-native/clipboard/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <View className={`status-badge status-badge-${status}`}>
      <Text className="status-badge-text">{label}</Text>
    </View>
  );
}

function CapabilityRow({
  testID,
  label,
  status,
}: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <View testID={testID} className="capability-row">
      <Text className="capability-label">{label}</Text>
      <CapabilityBadge status={status} />
    </View>
  );
}

/**
 * @symbiote-native/clipboard canary demo: a value card (current clipboard string, seeded via
 * getStringAsync() on mount and refreshed on every useClipboard() change event) plus a
 * hasStringAsync() status row, a copy-text card driving setStringAsync, and, iOS-only, a URL
 * get/set/has row (getUrlAsync/setUrlAsync/hasUrlAsync — iOS-only upstream). Copy something
 * outside the app (another app, a share sheet) to see the value below update on its own.
 */
export function ClipboardScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
  const lineColor = LINE_COLOR[lineInfo.line];

  const clipboardEvent = useClipboard();
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [hasString, setHasString] = useState<ICapabilityStatus>('checking');
  const [inputText, setInputText] = useState('');

  // clipboardEvent only carries the changed content TYPES, not the string itself — re-fetch the
  // actual value on mount (clipboardEvent starts null) and on every subsequent change event.
  useEffect(() => {
    let isMounted = true;
    Promise.all([getStringAsync(), hasStringAsync()]).then(
      ([text, hasText]) => {
        if (isMounted) {
          setClipboardText(text);
          setHasString(toCapabilityStatus(hasText));
        }
      },
    );
    return () => {
      isMounted = false;
    };
  }, [clipboardEvent]);

  const [urlText, setUrlText] = useState('');
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [hasUrl, setHasUrl] = useState<ICapabilityStatus>('checking');

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    let isMounted = true;
    Promise.all([getUrlAsync(), hasUrlAsync()]).then(([url, hasUrlValue]) => {
      if (isMounted) {
        setClipboardUrl(url);
        setHasUrl(toCapabilityStatus(hasUrlValue));
      }
    });
    return () => {
      isMounted = false;
    };
  }, [clipboardEvent]);

  const handleCopy = useCallback(() => {
    setStringAsync(inputText);
  }, [inputText]);

  const handleSetUrl = useCallback(() => {
    setUrlAsync(urlText).then(() => getUrlAsync().then(setClipboardUrl));
  }, [urlText]);

  return (
    <SafeAreaView className="screen">
      <ScrollView
        testID="clipboard-scroll"
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
            <Text className="hero-title">Clipboard</Text>
            <Text className="hero-body">
              @symbiote-native/clipboard — read/write clipboard text and URLs,
              plus a live change-event subscription via useClipboard(). Copy
              something outside the app to see the value below update on its
              own.
            </Text>
          </View>
        </View>

        <View testID="clipboard-value-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Current value</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Clipboard text</Text>
            <Text className="value-text">
              {clipboardText === null
                ? 'checking…'
                : clipboardText || '(empty)'}
            </Text>
          </View>
          <CapabilityRow
            testID="clipboard-has-string"
            label="Has string"
            status={hasString}
          />
        </View>

        <View testID="clipboard-copy-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Copy text</Text>
          </View>
          <TextInput
            testID="clipboard-copy-input"
            value={inputText}
            onValueChange={setInputText}
            placeholder="Type something to copy"
            placeholderTextColor="#41506a"
            className="text-input"
          />
          <ActionButton
            testID="clipboard-copy-button"
            title="Copy text"
            onPress={handleCopy}
            color={lineColor}
          />
        </View>

        {Platform.OS === 'ios' && (
          <View testID="clipboard-url-card" className="feature-card">
            <View className="feature-card-header">
              <Text className="feature-card-title">URL (iOS only)</Text>
            </View>
            <View className="capability-row">
              <Text className="capability-label">Clipboard URL</Text>
              <Text className="value-text">
                {clipboardUrl === null ? 'checking…' : clipboardUrl || '(none)'}
              </Text>
            </View>
            <CapabilityRow
              testID="clipboard-has-url"
              label="Has URL"
              status={hasUrl}
            />
            <TextInput
              testID="clipboard-url-input"
              value={urlText}
              onValueChange={setUrlText}
              placeholder="https://example.com"
              placeholderTextColor="#41506a"
              className="text-input"
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
