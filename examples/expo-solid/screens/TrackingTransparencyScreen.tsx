import { createSignal } from 'solid-js';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';
import { createPermissions } from '@symbiote-native/tracking-transparency/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

/**
 * @symbiote-native/tracking-transparency canary demo: createPermissions() auto-fetches status on
 * mount and exposes get/request as imperative callbacks; getAdvertisingId() is a plain sync
 * call fetched once on mount, expected to read null on Android/the iOS simulator.
 */
export function TrackingTransparencyScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  const {
    status,
    request: requestPermission,
    get: getPermission,
  } = createPermissions();
  // getAdvertisingId() is a synchronous native read (unlike the async permission fetch above), so
  // seeding the signal once in the component body - which runs exactly once - is the whole thing.
  const [advertisingId] = createSignal<string | null>(getAdvertisingId());

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="tracking-transparency-scroll"
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
            <text class="hero-title">Tracking Transparency</text>
            <text class="hero-body">
              @symbiote-native/tracking-transparency — the iOS App Tracking
              Transparency prompt (always granted on Android) plus the
              advertising-ID getter.
            </text>
          </view>
        </view>

        <view
          testID="tracking-transparency-permission-card"
          class="feature-card"
        >
          <view class="feature-card-header">
            <text class="feature-card-title">Permission</text>
          </view>
          <ValueRow
            label="Status"
            value={status() === null ? 'checking…' : status()!.status}
          />
          <ValueRow
            label="Granted"
            value={
              status() === null ? 'checking…' : status()!.granted ? 'Yes' : 'No'
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
          class="feature-card"
        >
          <view class="feature-card-header">
            <text class="feature-card-title">Advertising ID</text>
          </view>
          <ValueRow label="Advertising ID" value={advertisingId() ?? 'null'} />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
