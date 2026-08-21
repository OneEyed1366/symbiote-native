import { defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  getAdvertisingId,
  usePermissions,
} from '@symbiote-native/tracking-transparency/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
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
      <SafeAreaView class="screen">
        <ScrollView
          testID="tracking-transparency-scroll"
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
              <Text class="hero-title">Tracking Transparency</Text>
              <Text class="hero-body">
                @symbiote-native/tracking-transparency — App Tracking
                Transparency permission status plus the advertising ID it gates.
                Android/web always report granted.
              </Text>
            </View>
          </View>

          <View testID="tracking-transparency-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Permission</Text>
            </View>
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
          </View>

          <View
            testID="tracking-transparency-advertising-id-card"
            class="auth-card"
          >
            <View class="auth-card-header">
              <Text class="auth-card-title">Advertising ID</Text>
            </View>
            <ValueRow label="ID" value={advertisingId.value ?? 'null'} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'TrackingTransparencyScreen' },
);
