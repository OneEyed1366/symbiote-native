import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/vue';
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
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
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
      <SafeAreaView class="screen">
        <ScrollView
          testID="cellular-scroll"
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
              <Text class="hero-title">Cellular</Text>
              <Text class="hero-body">
                @symbiote-native/cellular — cellular generation and carrier/SIM
                info. Every field except generation is Android-only upstream
                (iOS/web return null); a physical device with an active SIM is
                needed for real values.
              </Text>
            </View>
          </View>

          <View testID="cellular-info-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Cellular info</Text>
            </View>
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
          </View>

          <View testID="cellular-permission-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Permission</Text>
            </View>
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
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'CellularScreen' },
);
