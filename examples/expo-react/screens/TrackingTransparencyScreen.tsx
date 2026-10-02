import { useEffect, useState } from 'react';
import {
  getAdvertisingId,
  useTrackingPermissions,
} from '@symbiote-native/tracking-transparency/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

// `getAdvertisingId()` reads null on Android and the iOS simulator

export function TrackingTransparencyScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [status, requestPermission, getPermission] = useTrackingPermissions();
  const [advertisingId, setAdvertisingId] = useState<string | null>(null);

  useEffect(() => {
    setAdvertisingId(getAdvertisingId());
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="tracking-transparency-scroll"
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
            <text className="hero-title">Tracking Transparency</text>
            <text className="hero-body">
              Ask permission to track the user across apps before you use the
              advertising id. iOS shows the App Tracking Transparency prompt,
              Android always reports granted.
            </text>
          </view>
        </view>

        <Scenario
          testID="tracking-transparency-scenario"
          title="Ask before using the advertising id"
          why="Apple requires the tracking prompt before an app reads the advertising id for ads or attribution. Without consent the id is empty, so the app must work either way."
          steps={['Press Get to read the current status', 'Press Request and answer the system prompt', 'Read the advertising id below']}
          expect="The status changes to granted or denied after your answer. The id shows a value only after consent on a real iOS device and is null elsewhere."
        />
        <view
          testID="tracking-transparency-permission-card"
          className="feature-card"
        >
          <view className="feature-card-header">
            <text className="feature-card-title">Permission</text>
          </view>
          <ValueRow
            label="Status"
            value={status === null ? 'checking…' : status.status}
          />
          <ValueRow
            label="Granted"
            value={
              status === null ? 'checking…' : status.granted ? 'Yes' : 'No'
            }
          />
          <ActionButton
            testID="tracking-transparency-get-button"
            title="Get"
            onPress={() => getPermission()}
            color={lineColor}
          />
          <ActionButton
            testID="tracking-transparency-request-button"
            title="Request"
            onPress={() => requestPermission()}
            color={lineColor}
          />
        </view>

        <view
          testID="tracking-transparency-advertising-id-card"
          className="feature-card"
        >
          <view className="feature-card-header">
            <text className="feature-card-title">Advertising ID</text>
          </view>
          <ValueRow label="Advertising ID" value={advertisingId ?? 'null'} />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
