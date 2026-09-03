import { createSignal } from 'solid-js';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import { getAdvertisingId } from '@symbiote-native/tracking-transparency';
import { createPermissions } from '@symbiote-native/tracking-transparency/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <Text class="value-text">{props.value}</Text>
    </View>
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

  const { status, request: requestPermission, get: getPermission } = createPermissions();
  // getAdvertisingId() is a synchronous native read (unlike the async permission fetch above), so
  // seeding the signal once in the component body - which runs exactly once - is the whole thing.
  const [advertisingId] = createSignal<string | null>(getAdvertisingId());

  return (
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
              @symbiote-native/tracking-transparency — the iOS App Tracking
              Transparency prompt (always granted on Android) plus the
              advertising-ID getter.
            </Text>
          </View>
        </View>

        <View
          testID="tracking-transparency-permission-card"
          class="feature-card"
        >
          <View class="feature-card-header">
            <Text class="feature-card-title">Permission</Text>
          </View>
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
        </View>

        <View
          testID="tracking-transparency-advertising-id-card"
          class="feature-card"
        >
          <View class="feature-card-header">
            <Text class="feature-card-title">Advertising ID</Text>
          </View>
          <ValueRow label="Advertising ID" value={advertisingId() ?? 'null'} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
