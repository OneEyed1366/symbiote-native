import { useEffect, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/react';
import {
  CellularGeneration,
  allowsVoipAsync,
  getCarrierNameAsync,
  getCellularGenerationAsync,
  getIsoCountryCodeAsync,
  getMobileCountryCodeAsync,
  getMobileNetworkCodeAsync,
} from '@symbiote-native/cellular';
import { usePermissions } from '@symbiote-native/cellular/react';
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
 * every field except generation returns null on iOS/web upstream — Android-only in practice)
 * plus a permission card driving usePermissions(). Most fields need a physical device with a
 * SIM card; a simulator/emulator reports null/UNKNOWN for nearly everything.
 */
export function CellularScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [generation, setGeneration] = useState<CellularGeneration | null>(null);
  const [allowsVoip, setAllowsVoip] = useState<boolean | null>(null);
  const [isoCountryCode, setIsoCountryCode] = useState<string | null>(null);
  const [carrierName, setCarrierName] = useState<string | null>(null);
  const [mobileCountryCode, setMobileCountryCode] = useState<string | null>(
    null,
  );
  const [mobileNetworkCode, setMobileNetworkCode] = useState<string | null>(
    null,
  );
  const [permissionStatus, requestPermission] = usePermissions();

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getCellularGenerationAsync(),
      allowsVoipAsync(),
      getIsoCountryCodeAsync(),
      getCarrierNameAsync(),
      getMobileCountryCodeAsync(),
      getMobileNetworkCodeAsync(),
    ]).then(([gen, voip, iso, carrier, mcc, mnc]) => {
      if (isMounted) {
        setGeneration(gen);
        setAllowsVoip(voip);
        setIsoCountryCode(iso);
        setCarrierName(carrier);
        setMobileCountryCode(mcc);
        setMobileNetworkCode(mnc);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const permissionLabel =
    permissionStatus === null ? 'checking…' : permissionStatus.status;

  return (
    <SafeAreaView className="screen">
      <ScrollView
        testID="cellular-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Cellular</Text>
            <Text className="hero-body">
              @symbiote-native/cellular — cellular generation and carrier/SIM
              info. Every field except generation is Android-only upstream
              (iOS/web return null); a physical device with an active SIM is
              needed for real values.
            </Text>
          </View>
        </View>

        <View testID="cellular-info-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Cellular info</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Generation</Text>
            <Text className="value-text">
              {generation === null ? 'checking…' : generationLabel(generation)}
            </Text>
          </View>
          {Platform.OS === 'android' && (
            <>
              <View className="capability-row">
                <Text className="capability-label">Allows VoIP</Text>
                <Text className="value-text">{valueLabel(allowsVoip)}</Text>
              </View>
              <View className="capability-row">
                <Text className="capability-label">ISO country code</Text>
                <Text className="value-text">{valueLabel(isoCountryCode)}</Text>
              </View>
              <View className="capability-row">
                <Text className="capability-label">Carrier name</Text>
                <Text className="value-text">{valueLabel(carrierName)}</Text>
              </View>
              <View className="capability-row">
                <Text className="capability-label">Mobile country code</Text>
                <Text className="value-text">
                  {valueLabel(mobileCountryCode)}
                </Text>
              </View>
              <View className="capability-row">
                <Text className="capability-label">Mobile network code</Text>
                <Text className="value-text">
                  {valueLabel(mobileNetworkCode)}
                </Text>
              </View>
            </>
          )}
        </View>

        <View testID="cellular-permission-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Permission</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">
              Phone-state permission status
            </Text>
            <Text className="value-text">{permissionLabel}</Text>
          </View>
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
}
