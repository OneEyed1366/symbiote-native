import { useCallback, useEffect, useState } from 'react';
import { Platform } from '@symbiote-native/react';
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
  const label =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <view className={`status-badge status-badge-${status}`}>
      <text className="status-badge-text">{label}</text>
    </view>
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
  const [systemMode, setSystemMode] = useState<BrightnessMode>(
    BrightnessMode.UNKNOWN,
  );
  const [isUsingSystem, setIsUsingSystem] =
    useState<ICapabilityStatus>('checking');
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
    Promise.all([
      getSystemBrightnessModeAsync(),
      isUsingSystemBrightnessAsync(),
    ]).then(([mode, usingSystem]) => {
      if (isMounted) {
        setSystemMode(mode);
        setIsUsingSystem(usingSystem ? 'yes' : 'no');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSetBrightness = useCallback((value: number) => {
    setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(setBrightness),
    );
  }, []);

  const handleSetSystemMode = useCallback((mode: BrightnessMode) => {
    setSystemBrightnessModeAsync(mode).then(() =>
      getSystemBrightnessModeAsync().then(setSystemMode),
    );
  }, []);

  const handleRestoreSystem = useCallback(() => {
    restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(value =>
        setIsUsingSystem(value ? 'yes' : 'no'),
      ),
    );
  }, []);

  const brightnessLabel =
    brightness === null ? 'checking…' : `${Math.round(brightness * 100)}%`;
  const permissionLabel =
    permissionStatus === null ? 'checking…' : permissionStatus.status;

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="brightness-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Brightness</text>
            <text className="hero-body">
              @symbiote-native/brightness — screen brightness get/set, Android
              system-brightness mode, and an iOS-only live listener. Requires
              SYSTEM_BRIGHTNESS permission on Android before setting the
              system-wide value.
            </text>
          </view>
        </view>

        <view testID="brightness-live-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Live brightness</text>
          </view>
          <view className="capability-row">
            <text className="capability-label">Screen brightness</text>
            <text className="value-text">{brightnessLabel}</text>
          </view>
          <view className="button-row">
            {BRIGHTNESS_STEPS.map(({ label, value }) => (
              <ActionButton
                key={label}
                testID={`brightness-set-${label}`}
                title={label}
                onPress={() => handleSetBrightness(value)}
                color={lineColor}
              />
            ))}
          </view>
        </view>

        {Platform.OS === 'android' && (
          <view testID="brightness-system-card" className="feature-card">
            <view className="feature-card-header">
              <text className="feature-card-title">
                System brightness (Android only)
              </text>
            </view>
            <view className="capability-row">
              <text className="capability-label">Mode</text>
              <text className="value-text">
                {brightnessModeLabel(systemMode)}
              </text>
            </view>
            <view className="capability-row" testID="brightness-using-system">
              <text className="capability-label">Using system value</text>
              <CapabilityBadge status={isUsingSystem} />
            </view>
            <view className="button-row">
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
            </view>
          </view>
        )}

        <view testID="brightness-permission-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Permission</text>
          </view>
          <view className="capability-row">
            <text className="capability-label">SYSTEM_BRIGHTNESS status</text>
            <text className="value-text">{permissionLabel}</text>
          </view>
          <ActionButton
            testID="brightness-request-permission"
            title="Request permission"
            onPress={() => requestPermission()}
            color={lineColor}
          />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
