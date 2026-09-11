import { defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  getAdvertisingId,
  usePermissions,
} from '@symbiote-native/tracking-transparency/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * Tracking Transparency demo: @symbiote-native/tracking-transparency/vue's usePermissions
 * composable auto-fetches the current status on mount; get()/request() re-fetch on demand.
 * getAdvertisingId() is a plain synchronous core call, may be null (simulator, not authorized).
 */
export const TrackingTransparencyScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency];
    const lineColor =
      LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.TrackingTransparency].line];

    const { status, get, request } = usePermissions();
    const advertisingId: Ref<string | null> = ref(getAdvertisingId());

    function handleGet() {
      get();
    }

    function handleRequest() {
      request().then(() => {
        advertisingId.value = getAdvertisingId();
      });
    }

    return () => (
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
                @symbiote-native/tracking-transparency — App Tracking
                Transparency permission status plus the advertising ID it gates.
                Android/web always report granted.
              </text>
            </view>
          </view>

          <view testID="tracking-transparency-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Permission</text>
            </view>
            <ValueRow
              label="Status"
              value={status.value?.status ?? 'checking…'}
            />
            <ValueRow
              label="Granted"
              value={
                status.value === null
                  ? 'checking…'
                  : status.value.granted
                    ? 'true'
                    : 'false'
              }
            />
            <ActionButton
              testID="tracking-transparency-get-button"
              title="Get"
              onPress={handleGet}
              color={lineColor}
            />
            <ActionButton
              testID="tracking-transparency-request-button"
              title="Request"
              onPress={handleRequest}
              color={lineColor}
            />
          </view>

          <view
            testID="tracking-transparency-advertising-id-card"
            class="auth-card"
          >
            <view class="auth-card-header">
              <text class="auth-card-title">Advertising ID</text>
            </view>
            <ValueRow label="ID" value={advertisingId.value ?? 'null'} />
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'TrackingTransparencyScreen' },
);
