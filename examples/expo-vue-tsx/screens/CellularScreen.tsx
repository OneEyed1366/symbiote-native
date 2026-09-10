import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Platform, ScrollView } from '@symbiote-native/vue';
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
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * Cellular demo: @symbiote-native/cellular — a one-shot info card (generation + carrier/SIM
 * fields, every field except generation returns null on iOS/web upstream — Android-only in
 * practice) plus a permission card driving usePermissions(). Most fields need a physical device
 * with a SIM card; a simulator/emulator reports null/UNKNOWN for nearly everything. Vue TSX twin
 * of ../../expo-react/screens/CellularScreen.tsx.
 */
export const CellularScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Cellular].line];

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
        <ScrollView
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
                @symbiote-native/cellular — cellular generation and carrier/SIM
                info. Every field except generation is Android-only upstream
                (iOS/web return null); a physical device with an active SIM is
                needed for real values.
              </text>
            </view>
          </view>

          <view testID="cellular-info-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Cellular info</text>
            </view>
            <ValueRow label="Generation" value={generationLabelText.value} />
            {Platform.OS === 'android' && (
              <>
                <ValueRow
                  label="Allows VoIP"
                  value={valueLabel(allowsVoip.value)}
                />
                <ValueRow
                  label="ISO country code"
                  value={valueLabel(isoCountryCode.value)}
                />
                <ValueRow
                  label="Carrier name"
                  value={valueLabel(carrierName.value)}
                />
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

          <view testID="cellular-permission-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Permission</text>
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
        </ScrollView>
      </safe-area-view>
    );
  },
  { name: 'CellularScreen' },
);
