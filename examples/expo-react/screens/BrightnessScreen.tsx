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
import { Scenario } from '../components/Scenario';
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

// iOS pushes changes through the listener, Android only changes through the buttons
function useScreenBrightness() {
  const [brightness, setBrightness] = useState<number | null>(null);

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

  const set = useCallback((value: number) => {
    setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(setBrightness),
    );
  }, []);

  return { brightness, set };
}

function useSystemBrightness() {
  const [mode, setMode] = useState<BrightnessMode>(BrightnessMode.UNKNOWN);
  const [isUsingSystem, setIsUsingSystem] =
    useState<ICapabilityStatus>('checking');

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    let isMounted = true;
    Promise.all([
      getSystemBrightnessModeAsync(),
      isUsingSystemBrightnessAsync(),
    ]).then(([currentMode, usingSystem]) => {
      if (isMounted) {
        setMode(currentMode);
        setIsUsingSystem(usingSystem ? 'yes' : 'no');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const changeMode = useCallback((next: BrightnessMode) => {
    setSystemBrightnessModeAsync(next).then(() =>
      getSystemBrightnessModeAsync().then(setMode),
    );
  }, []);

  const restore = useCallback(() => {
    restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(value =>
        setIsUsingSystem(value ? 'yes' : 'no'),
      ),
    );
  }, []);

  return { mode, isUsingSystem, changeMode, restore };
}

export function BrightnessScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
  const lineColor = LINE_COLOR[lineInfo.line];

  const screen = useScreenBrightness();
  const system = useSystemBrightness();
  const [permissionStatus, requestPermission] = usePermissions();

  const brightnessLabel =
    screen.brightness === null
      ? 'checking…'
      : `${Math.round(screen.brightness * 100)}%`;
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
              Read and change the screen brightness from the app, for example to
              make a QR code or a boarding pass easy to scan. Android can also
              change the system-wide value after the user grants the write
              settings permission.
            </text>
          </view>
        </view>

        <Scenario
          testID="brightness-scenario"
          title="Brighten the screen to show a QR code or a ticket"
          why="Scanners read a bright screen much better. Raise the brightness while the code is on screen and restore the user's level afterwards."
          steps={['Note the current brightness in the live card', 'Set a new value with the controls', 'Restore the system value']}
          expect="The screen visibly brightens or dims, and the live card shows the new value. Restoring returns to the system setting."
        />
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
                onPress={() => screen.set(value)}
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
                {brightnessModeLabel(system.mode)}
              </text>
            </view>
            <view className="capability-row" testID="brightness-using-system">
              <text className="capability-label">Using system value</text>
              <CapabilityBadge status={system.isUsingSystem} />
            </view>
            <view className="button-row">
              <ActionButton
                testID="brightness-mode-automatic"
                title="Automatic"
                onPress={() => system.changeMode(BrightnessMode.AUTOMATIC)}
                color={lineColor}
              />
              <ActionButton
                testID="brightness-mode-manual"
                title="Manual"
                onPress={() => system.changeMode(BrightnessMode.MANUAL)}
                color={lineColor}
              />
              <ActionButton
                testID="brightness-restore-system"
                title="Restore system"
                onPress={system.restore}
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
