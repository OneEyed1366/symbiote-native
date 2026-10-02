import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  CellularGeneration,
  allowsVoipAsync,
  getCarrierNameAsync,
  getCellularGenerationAsync,
  getIsoCountryCodeAsync,
  getMobileCountryCodeAsync,
  getMobileNetworkCodeAsync,
} from '@symbiote-native/cellular';
import { usePermissions } from '@symbiote-native/cellular/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function generationLabel(generation: CellularGeneration): string {
  switch (generation) {
    case CellularGeneration.CELLULAR_2G:
      return '2G';
    case CellularGeneration.CELLULAR_3G:
      return '3G';
    case CellularGeneration.CELLULAR_4G:
      return '4G';
    case CellularGeneration.CELLULAR_5G:
      return '5G';
    case CellularGeneration.UNKNOWN:
    default:
      return 'Unknown';
  }
}

function valueLabel(value: string | boolean | null): string {
  if (value === null) return 'checking…';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value || '(none)';
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

export const CellularScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
    const lineColor = LINE_COLOR[lineInfo.line];

    const generation: Ref<CellularGeneration | null> = ref(null);
    const allowsVoip: Ref<boolean | null> = ref(null);
    const isoCountryCode: Ref<string | null> = ref(null);
    const carrierName: Ref<string | null> = ref(null);
    const mobileCountryCode: Ref<string | null> = ref(null);
    const mobileNetworkCode: Ref<string | null> = ref(null);
    const { status: permissionStatus, request: requestPermission } =
      usePermissions();

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      Promise.all([
        getCellularGenerationAsync(),
        allowsVoipAsync(),
        getIsoCountryCodeAsync(),
        getCarrierNameAsync(),
        getMobileCountryCodeAsync(),
        getMobileNetworkCodeAsync(),
      ]).then(([gen, voip, iso, carrier, mcc, mnc]) => {
        if (isMounted) {
          generation.value = gen;
          allowsVoip.value = voip;
          isoCountryCode.value = iso;
          carrierName.value = carrier;
          mobileCountryCode.value = mcc;
          mobileNetworkCode.value = mnc;
        }
      });
    });

    const generationLabelText = computed(() =>
      generation.value === null
        ? 'checking…'
        : generationLabel(generation.value),
    );
    const permissionLabel = computed(() =>
      permissionStatus.value === null
        ? 'checking…'
        : permissionStatus.value.status,
    );

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="cellular-scroll"
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
              <text class="hero-title">Cellular</text>
              <text class="hero-body">
                Find out about the mobile connection: network generation (2G to
                5G), carrier name, country code and whether VoIP is allowed. Only
                the generation works on iOS, a physical device with a SIM is
                needed.
              </text>
            </view>
          </view>

          <Scenario
            testID="cellular-scenario"
            title="Choose video quality from the mobile network generation"
            why="On 3G, lower the stream quality or skip auto-downloads, on 5G allow them. The carrier and country help pick the right payment or support options."
            steps={['Turn Wi-Fi off so the phone uses mobile data', 'Read the generation and carrier in the card']}
            expect="The generation shows 3G, 4G or 5G and the carrier name appears on Android. Fields the platform does not provide show as unavailable."
          />

          <view testID="cellular-info-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Cellular info</text>
            </view>
            <ValueRow label="Generation" value={generationLabelText.value} />
            {Platform.OS === 'android' && (
              <>
                <ValueRow label="Allows VoIP" value={valueLabel(allowsVoip.value)} />
                <ValueRow
                  label="ISO country code"
                  value={valueLabel(isoCountryCode.value)}
                />
                <ValueRow label="Carrier name" value={valueLabel(carrierName.value)} />
                <ValueRow
                  label="Mobile country code"
                  value={valueLabel(mobileCountryCode.value)}
                />
                <ValueRow
                  label="Mobile network code"
                  value={valueLabel(mobileNetworkCode.value)}
                />
              </>
            )}
          </view>

          <view testID="cellular-permission-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Permission</text>
            </view>
            <ValueRow
              label="Phone-state permission status"
              value={permissionLabel.value}
            />
            <ActionButton
              testID="cellular-request-permission"
              title="Request permission"
              onPress={() => requestPermission()}
              color={lineColor}
            />
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'CellularScreen' },
);
