import { useCallback, useEffect, useState } from 'react';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import {
  BrightnessMode,
  addBrightnessListener,
  getBrightnessAsync,
  getSystemBrightnessModeAsync,
  isUsingSystemBrightnessAsync,
  restoreSystemBrightnessAsync,
  setBrightnessAsync,
  setSystemBrightnessModeAsync,
} from '@symbiote-native/brightness';
import { usePermissions } from '@symbiote-native/brightness/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label = status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <View className={`status-badge status-badge-${status}`}>
      <Text className="status-badge-text">{label}</Text>
    </View>
  );
}

function brightnessModeLabel(mode: BrightnessMode): string {
  switch (mode) {
    case BrightnessMode.AUTOMATIC:
      return 'Automatic';
    case BrightnessMode.MANUAL:
      return 'Manual';
    case BrightnessMode.UNKNOWN:
    default:
      return 'Unknown';
  }
}

const BRIGHTNESS_STEPS: readonly { label: string; value: number }[] = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

/**
 * @symbiote-native/brightness canary demo: a live brightness card (seeded via
 * getBrightnessAsync(), refreshed by addBrightnessListener() — iOS-only upstream, so on
 * Android the value only changes via the buttons below), a set-brightness action row, an
 * Android-only system-brightness-mode card, and a permission card driving usePermissions().
 */
export function BrightnessScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [brightness, setBrightness] = useState<number | null>(null);
  const [systemMode, setSystemMode] = useState<BrightnessMode>(BrightnessMode.UNKNOWN);
  const [isUsingSystem, setIsUsingSystem] = useState<ICapabilityStatus>('checking');
  const [permissionStatus, requestPermission] = usePermissions();

  useEffect(() => {
    let isMounted = true;
    getBrightnessAsync().then(value => {
      if (isMounted) setBrightness(value);
    });
    const subscription = addBrightnessListener(event => {
      if (isMounted) setBrightness(event.brightness);
    });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    let isMounted = true;
    Promise.all([getSystemBrightnessModeAsync(), isUsingSystemBrightnessAsync()]).then(
      ([mode, usingSystem]) => {
        if (isMounted) {
          setSystemMode(mode);
          setIsUsingSystem(usingSystem ? 'yes' : 'no');
        }
      },
    );
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSetBrightness = useCallback((value: number) => {
    setBrightnessAsync(value).then(() => getBrightnessAsync().then(setBrightness));
  }, []);

  const handleSetSystemMode = useCallback((mode: BrightnessMode) => {
    setSystemBrightnessModeAsync(mode).then(() => getSystemBrightnessModeAsync().then(setSystemMode));
  }, []);

  const handleRestoreSystem = useCallback(() => {
    restoreSystemBrightnessAsync().then(() => isUsingSystemBrightnessAsync().then(value => setIsUsingSystem(value ? 'yes' : 'no')));
  }, []);

  const brightnessLabel = brightness === null ? 'checking…' : `${Math.round(brightness * 100)}%`;
  const permissionLabel = permissionStatus === null ? 'checking…' : permissionStatus.status;

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="brightness-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Brightness</Text>
            <Text className="hero-body">
              @symbiote-native/brightness — screen brightness get/set, Android system-brightness
              mode, and an iOS-only live listener. Requires SYSTEM_BRIGHTNESS permission on
              Android before setting the system-wide value.
            </Text>
          </View>
        </View>

        <View testID="brightness-live-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Live brightness</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">Screen brightness</Text>
            <Text className="value-text">{brightnessLabel}</Text>
          </View>
          <View className="button-row">
            {BRIGHTNESS_STEPS.map(({ label, value }) => (
              <ActionButton
                key={label}
                testID={`brightness-set-${label}`}
                title={label}
                onPress={() => handleSetBrightness(value)}
                color={lineColor}
              />
            ))}
          </View>
        </View>

        {Platform.OS === 'android' && (
          <View testID="brightness-system-card" className="feature-card">
            <View className="feature-card-header">
              <Text className="feature-card-title">System brightness (Android only)</Text>
            </View>
            <View className="capability-row">
              <Text className="capability-label">Mode</Text>
              <Text className="value-text">{brightnessModeLabel(systemMode)}</Text>
            </View>
            <View className="capability-row" testID="brightness-using-system">
              <Text className="capability-label">Using system value</Text>
              <CapabilityBadge status={isUsingSystem} />
            </View>
            <View className="button-row">
              <ActionButton
                testID="brightness-mode-automatic"
                title="Automatic"
                onPress={() => handleSetSystemMode(BrightnessMode.AUTOMATIC)}
                color={lineColor}
              />
              <ActionButton
                testID="brightness-mode-manual"
                title="Manual"
                onPress={() => handleSetSystemMode(BrightnessMode.MANUAL)}
                color={lineColor}
              />
              <ActionButton
                testID="brightness-restore-system"
                title="Restore system"
                onPress={handleRestoreSystem}
                color={lineColor}
              />
            </View>
          </View>
        )}

        <View testID="brightness-permission-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Permission</Text>
          </View>
          <View className="capability-row">
            <Text className="capability-label">SYSTEM_BRIGHTNESS status</Text>
            <Text className="value-text">{permissionLabel}</Text>
          </View>
          <ActionButton
            testID="brightness-request-permission"
            title="Request permission"
            onPress={() => requestPermission()}
            color={lineColor}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
