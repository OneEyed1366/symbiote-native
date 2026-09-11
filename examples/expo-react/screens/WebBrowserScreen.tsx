import { useCallback, useState } from 'react';
import { Platform } from '@symbiote-native/react';
import {
  coolDownAsync,
  dismissBrowser,
  getCustomTabsSupportingBrowsersAsync,
  mayInitWithUrlAsync,
  openBrowserAsync,
  warmUpAsync,
} from '@symbiote-native/web-browser';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_URL = 'https://symbiote-native.dev';

const isAndroid = Platform.OS === 'android';

function describeList(items: readonly string[]): string {
  return items.length === 0 ? '(none)' : items.join(', ');
}

/**
 * @symbiote-native/web-browser canary demo: open a url in the in-app browser
 * (SFSafariViewController / Chrome Custom Tabs), read back the result type, and — on Android
 * only — the Custom Tabs service surface.
 *
 * The two platforms resolve differently: iOS waits for the browser to close and reports
 * 'cancel'/'dismiss', Android resolves 'opened' the moment the tab launches and never reports the
 * close.
 */
export function WebBrowserScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.WebBrowser];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [url, setUrl] = useState(DEMO_URL);
  const [lastResult, setLastResult] = useState('idle');
  const [servicePackage, setServicePackage] = useState<string | undefined>(
    undefined,
  );
  const [customTabsSummary, setCustomTabsSummary] = useState('not queried');

  const handleOpen = useCallback(() => {
    setLastResult('opening…');
    openBrowserAsync(url, {
      toolbarColor: '#0b1622',
      enableBarCollapsing: true,
    })
      .then(result => setLastResult(`result: ${result.type}`))
      .catch((error: Error) => setLastResult(`open failed: ${error.message}`));
  }, [url]);

  // iOS only — a Custom Tab cannot be closed programmatically, so this rejects on Android.
  const handleDismiss = useCallback(() => {
    dismissBrowser()
      .then(result => setLastResult(`dismissed: ${result.type}`))
      .catch((error: Error) =>
        setLastResult(`dismiss failed: ${error.message}`),
      );
  }, []);

  const handleWarmUp = useCallback(() => {
    warmUpAsync()
      .then(result => {
        setServicePackage(result.servicePackage);
        setLastResult(
          `warmed up: ${result.servicePackage ?? '(no service package)'}`,
        );
      })
      .catch((error: Error) =>
        setLastResult(`warm-up failed: ${error.message}`),
      );
  }, []);

  const handleMayInit = useCallback(() => {
    mayInitWithUrlAsync(url, servicePackage)
      .then(result =>
        setLastResult(
          `may-init: ${result.servicePackage ?? '(no service package)'}`,
        ),
      )
      .catch((error: Error) =>
        setLastResult(`may-init failed: ${error.message}`),
      );
  }, [url, servicePackage]);

  const handleCoolDown = useCallback(() => {
    coolDownAsync(servicePackage)
      .then(result =>
        setLastResult(
          `cooled down: ${result.servicePackage ?? '(no service package)'}`,
        ),
      )
      .catch((error: Error) =>
        setLastResult(`cool-down failed: ${error.message}`),
      );
  }, [servicePackage]);

  const handleQueryBrowsers = useCallback(() => {
    setCustomTabsSummary('querying…');
    getCustomTabsSupportingBrowsersAsync()
      .then(result => {
        setCustomTabsSummary(
          `default: ${result.defaultBrowserPackage ?? '(none)'} · browsers: ${describeList(
            result.browserPackages,
          )} · services: ${describeList(result.servicePackages)}`,
        );
      })
      .catch((error: Error) =>
        setCustomTabsSummary(`query failed: ${error.message}`),
      );
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="web-browser-scroll"
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
            <text className="hero-title">Web Browser</text>
            <text className="hero-body">
              @symbiote-native/web-browser — an in-app browser that keeps the
              user inside the app, unlike Linking.openURL, plus the OAuth auth
              session.
            </text>
          </view>
        </view>

        <view testID="web-browser-open-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Open a url</text>
          </view>
          <text-input
            testID="web-browser-url-input"
            value={url}
            onValueChange={event => setUrl(event.text)}
            placeholder="https://example.com"
            placeholderTextColor="#41506a"
            autoCapitalize="none"
            className="text-input"
          />
          <ActionButton
            testID="web-browser-open-button"
            title="Open"
            onPress={handleOpen}
            color={lineColor}
          />
          <ActionButton
            testID="web-browser-dismiss-button"
            title="Dismiss"
            onPress={handleDismiss}
            color={lineColor}
          />
          <text className="info-text">
            iOS resolves once the browser closes (cancel, or dismiss when closed
            by dismissBrowser); Android resolves opened as soon as the Custom
            Tab launches. Dismiss is iOS-only and rejects on Android.
          </text>
          <view className="capability-row">
            <text className="capability-label">Last result</text>
            <text testID="web-browser-result" className="value-text">
              {lastResult}
            </text>
          </view>
        </view>

        {isAndroid ? (
          <view testID="web-browser-custom-tabs-card" className="feature-card">
            <view className="feature-card-header">
              <text className="feature-card-title">Custom Tabs service</text>
            </view>
            <text className="info-text">
              Android only. getCustomTabsSupportingBrowsersAsync throws on iOS —
              its native stub is registered without the Async suffix, so the
              availability check fires before the not-Android branch — so this
              whole card is gated on Platform.OS.
            </text>
            <ActionButton
              testID="web-browser-query-browsers-button"
              title="List supporting browsers"
              onPress={handleQueryBrowsers}
              color={lineColor}
            />
            <view className="capability-row">
              <text className="capability-label">Browsers</text>
              <text testID="web-browser-custom-tabs" className="value-text">
                {customTabsSummary}
              </text>
            </view>
            <ActionButton
              testID="web-browser-warm-up-button"
              title="Warm up"
              onPress={handleWarmUp}
              color={lineColor}
            />
            <ActionButton
              testID="web-browser-may-init-button"
              title="May init with url"
              onPress={handleMayInit}
              color={lineColor}
            />
            <ActionButton
              testID="web-browser-cool-down-button"
              title="Cool down"
              onPress={handleCoolDown}
              color={lineColor}
            />
          </view>
        ) : null}
      </scroll-view>
    </safe-area-view>
  );
}
