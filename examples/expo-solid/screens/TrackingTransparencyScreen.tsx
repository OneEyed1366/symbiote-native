import { createSignal } from 'solid-js';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';
import { useTrackingPermissions } from '@symbiote-native/tracking-transparency/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

// `getAdvertisingId()` reads null on Android and the iOS simulator
export function TrackingTransparencyScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [status, requestPermission, getPermission] = useTrackingPermissions();
  // Synchronous native read, so seeding once in the component body is enough
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
