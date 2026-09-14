import { useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { resolveRouteFromUrl } from '@symbiote-native/navigation';
import {
  APP_LINKING_CONFIG,
  SAMPLE_DEEP_LINK_URL,
} from '../navigation-linking';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Deep-linking demo: APP_LINKING_CONFIG (navigation-linking.ts) is the SAME config wired at the
 * root via useLinkingIntegration (App.tsx) for real OS deep links — here resolveRouteFromUrl is
 * called directly against a typed-in URL so the resolution itself is provable inside the running
 * app without needing an actual OS-level deep link.
 */
export function DeepLinkingScreen() {
  const [url, setUrl] = useState(SAMPLE_DEEP_LINK_URL);
  const [resolved, setResolved] = useState<string | undefined>(undefined);

  const onResolve = () => {
    const route = resolveRouteFromUrl(APP_LINKING_CONFIG, url);
    setResolved(JSON.stringify(route, null, 2));
  };

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DeepLinking];

  return (
    <safe-area-view className="screen">
      <view className="section">
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.routing }}
          >
            <text className="hero-badge-text">DL</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Deep linking</text>
            <text className="hero-body">
              A typed URL resolved to a route through resolveRouteFromUrl, the
              same path a real deep link or push notification would take.
            </text>
          </view>
        </view>
        <text className="info-text">
          prefixes: symbiotecanary:// · https://canary.symbiote-native.dev
        </text>
        <text className="note-text">
          Details → details/:id · HeaderOptions → header-options · TabsDemo →
          tabs
        </text>
        <text-input
          testID="deep-link-input"
          value={url}
          onValueChange={event => setUrl(event.text)}
          placeholder="symbiotecanary://details/42"
          placeholderTextColor="#41506a"
          className="text-input"
        />
        <ActionButton
          testID="deep-link-resolve"
          title="Resolve"
          onPress={onResolve}
          color={LINE_COLOR.routing}
        />
        <view className="parity-list">
          <text testID="deep-link-result" className="list-row-text">
            {resolved ?? 'tap Resolve to see the parsed route'}
          </text>
        </view>
      </view>
    </safe-area-view>
  );
}
