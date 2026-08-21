import { createSignal, onCleanup } from 'solid-js';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import {
  CellularGeneration,
  allowsVoipAsync,
  getCarrierNameAsync,
  getCellularGenerationAsync,
  getIsoCountryCodeAsync,
  getMobileCountryCodeAsync,
  getMobileNetworkCodeAsync,
} from '@symbiote-native/cellular';
import { createPermissions } from '@symbiote-native/cellular/solid';
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

/**
 * @symbiote-native/cellular canary demo: a one-shot info card (generation + carrier/SIM fields,
 * every field except generation returns null on iOS/web upstream - Android-only in practice)
 * plus a permission card driving createPermissions(). Most fields need a physical device with a
 * SIM card; a simulator/emulator reports null/UNKNOWN for nearly everything.
 */
export function CellularScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [generation, setGeneration] = createSignal<CellularGeneration | null>(null);
  const [allowsVoip, setAllowsVoip] = createSignal<boolean | null>(null);
  const [isoCountryCode, setIsoCountryCode] = createSignal<string | null>(null);
  const [carrierName, setCarrierName] = createSignal<string | null>(null);
  const [mobileCountryCode, setMobileCountryCode] = createSignal<string | null>(null);
  const [mobileNetworkCode, setMobileNetworkCode] = createSignal<string | null>(null);
  const permissions = createPermissions();

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  Promise.all([
    getCellularGenerationAsync(),
    allowsVoipAsync(),
    getIsoCountryCodeAsync(),
    getCarrierNameAsync(),
    getMobileCountryCodeAsync(),
    getMobileNetworkCodeAsync(),
  ]).then(([gen, voip, iso, carrier, mcc, mnc]) => {
    if (!disposed) {
      setGeneration(gen);
      setAllowsVoip(voip);
      setIsoCountryCode(iso);
      setCarrierName(carrier);
      setMobileCountryCode(mcc);
      setMobileNetworkCode(mnc);
    }
  });

  const permissionLabel = () =>
    permissions.status() === null ? 'checking…' : permissions.status()!.status;

  return (
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

        <View testID="cellular-info-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Cellular info</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Generation</Text>
            <Text class="value-text">
              {generation() === null ? 'checking…' : generationLabel(generation()!)}
            </Text>
          </View>
          {Platform.OS === 'android' && (
            <>
              <View class="capability-row">
                <Text class="capability-label">Allows VoIP</Text>
                <Text class="value-text">{valueLabel(allowsVoip())}</Text>
              </View>
              <View class="capability-row">
                <Text class="capability-label">ISO country code</Text>
                <Text class="value-text">{valueLabel(isoCountryCode())}</Text>
              </View>
              <View class="capability-row">
                <Text class="capability-label">Carrier name</Text>
                <Text class="value-text">{valueLabel(carrierName())}</Text>
              </View>
              <View class="capability-row">
                <Text class="capability-label">Mobile country code</Text>
                <Text class="value-text">
                  {valueLabel(mobileCountryCode())}
                </Text>
              </View>
              <View class="capability-row">
                <Text class="capability-label">Mobile network code</Text>
                <Text class="value-text">
                  {valueLabel(mobileNetworkCode())}
                </Text>
              </View>
            </>
          )}
        </View>

        <View testID="cellular-permission-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Permission</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">
              Phone-state permission status
            </Text>
            <Text class="value-text">{permissionLabel()}</Text>
          </View>
          <ActionButton
            testID="cellular-request-permission"
            title="Request permission"
            onPress={() => permissions.request()}
            color={lineColor}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
