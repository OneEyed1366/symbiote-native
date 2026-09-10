import { createSignal, onCleanup } from 'solid-js';
import { Platform, ScrollView } from '@symbiote-native/solid';
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

  const [generation, setGeneration] = createSignal<CellularGeneration | null>(
    null,
  );
  const [allowsVoip, setAllowsVoip] = createSignal<boolean | null>(null);
  const [isoCountryCode, setIsoCountryCode] = createSignal<string | null>(null);
  const [carrierName, setCarrierName] = createSignal<string | null>(null);
  const [mobileCountryCode, setMobileCountryCode] = createSignal<string | null>(
    null,
  );
  const [mobileNetworkCode, setMobileNetworkCode] = createSignal<string | null>(
    null,
  );
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

        <view testID="cellular-info-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Cellular info</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Generation</text>
            <text class="value-text">
              {generation() === null
                ? 'checking…'
                : generationLabel(generation()!)}
            </text>
          </view>
          {Platform.OS === 'android' && (
            <>
              <view class="capability-row">
                <text class="capability-label">Allows VoIP</text>
                <text class="value-text">{valueLabel(allowsVoip())}</text>
              </view>
              <view class="capability-row">
                <text class="capability-label">ISO country code</text>
                <text class="value-text">{valueLabel(isoCountryCode())}</text>
              </view>
              <view class="capability-row">
                <text class="capability-label">Carrier name</text>
                <text class="value-text">{valueLabel(carrierName())}</text>
              </view>
              <view class="capability-row">
                <text class="capability-label">Mobile country code</text>
                <text class="value-text">
                  {valueLabel(mobileCountryCode())}
                </text>
              </view>
              <view class="capability-row">
                <text class="capability-label">Mobile network code</text>
                <text class="value-text">
                  {valueLabel(mobileNetworkCode())}
                </text>
              </view>
            </>
          )}
        </view>

        <view testID="cellular-permission-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Permission</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Phone-state permission status</text>
            <text class="value-text">{permissionLabel()}</text>
          </view>
          <ActionButton
            testID="cellular-request-permission"
            title="Request permission"
            onPress={() => permissions.request()}
            color={lineColor}
          />
        </view>
      </ScrollView>
    </safe-area-view>
  );
}
