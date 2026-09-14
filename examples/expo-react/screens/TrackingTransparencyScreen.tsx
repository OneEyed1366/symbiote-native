import { useEffect, useState } from 'react';
import {
  getAdvertisingId,
  usePermissions,
} from '@symbiote-native/tracking-transparency/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

/**
 * @symbiote-native/tracking-transparency canary demo: usePermissions() auto-fetches status on
 * mount and exposes get/request as imperative callbacks; getAdvertisingId() is a plain sync
 * call fetched once on mount, expected to read null on Android/the iOS simulator.
 */
export function TrackingTransparencyScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [status, requestPermission, getPermission] = usePermissions();
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
              @symbiote-native/tracking-transparency — the iOS App Tracking
              Transparency prompt (always granted on Android) plus the
              advertising-ID getter.
            </text>
          </view>
        </view>

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
