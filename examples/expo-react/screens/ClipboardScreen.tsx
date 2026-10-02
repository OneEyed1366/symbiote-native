import { useCallback, useEffect, useState } from 'react';
import { Platform } from '@symbiote-native/react';
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
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <view className={`status-badge status-badge-${status}`}>
      <text className="status-badge-text">{label}</text>
    </view>
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
    <view testID={testID} className="capability-row">
      <text className="capability-label">{label}</text>
      <CapabilityBadge status={status} />
    </view>
  );
}

const IS_IOS = Platform.select({ ios: true, default: false });

type IClipboardEvent = ReturnType<typeof useClipboard>;

// The change event only carries content types, so the value is fetched again on every event
function useClipboardText(clipboardEvent: IClipboardEvent) {
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [hasString, setHasString] = useState<ICapabilityStatus>('checking');

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

  return { clipboardText, hasString };
}

function useClipboardUrl(clipboardEvent: IClipboardEvent) {
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [hasUrl, setHasUrl] = useState<ICapabilityStatus>('checking');

  useEffect(() => {
    if (!IS_IOS) {
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

  return { clipboardUrl, setClipboardUrl, hasUrl };
}

export function ClipboardScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
  const lineColor = LINE_COLOR[lineInfo.line];

  const clipboardEvent = useClipboard();
  const { clipboardText, hasString } = useClipboardText(clipboardEvent);
  const { clipboardUrl, setClipboardUrl, hasUrl } = useClipboardUrl(clipboardEvent);
  const [inputText, setInputText] = useState('');
  const [urlText, setUrlText] = useState('');
  const handleCopy = useCallback(() => {
    setStringAsync(inputText);
  }, [inputText]);

  const handleSetUrl = useCallback(() => {
    setUrlAsync(urlText).then(() => getUrlAsync().then(setClipboardUrl));
  }, [urlText]);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="clipboard-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Clipboard</text>
            <text className="hero-body">
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
        <view testID="clipboard-value-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Current value</text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Clipboard text</text>
            <text className="value-text">
              {clipboardText === null
                ? 'checking…'
                : clipboardText || '(empty)'}
            </text>
          </view>
          <CapabilityRow
            testID="clipboard-has-string"
            label="Has string"
            status={hasString}
          />
        </view>

        <view testID="clipboard-copy-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Copy text</text>
          </view>
          <text-input
            testID="clipboard-copy-input"
            value={inputText}
            onValueChange={event => setInputText(event.text)}
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
        </view>

        {IS_IOS && (
          <view testID="clipboard-url-card" className="feature-card">
            <view className="feature-card-header">
              <text className="feature-card-title">URL (iOS only)</text>
            </view>
            <view className="capability-row">
              <text className="capability-label">Clipboard URL</text>
              <text className="value-text">
                {clipboardUrl === null ? 'checking…' : clipboardUrl || '(none)'}
              </text>
            </view>
            <CapabilityRow
              testID="clipboard-has-url"
              label="Has URL"
              status={hasUrl}
            />
            <text-input
              testID="clipboard-url-input"
              value={urlText}
              onValueChange={event => setUrlText(event.text)}
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
          </view>
        )}
      </scroll-view>
    </safe-area-view>
  );
}
