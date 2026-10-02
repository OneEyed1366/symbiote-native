import { For, createSignal, onCleanup } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
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
import { createPermissions } from '@symbiote-native/brightness/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label = () =>
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view class={`status-badge status-badge-${props.status}`}>
      <text class="status-badge-text">{label()}</text>
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

// Kept apart so the screen body stays readable: the live app brightness and its listener
function createScreenBrightness() {
  const [brightness, setBrightness] = createSignal<number | null>(null);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  getBrightnessAsync().then(value => {
    if (!disposed) setBrightness(value);
  });
  const subscription = addBrightnessListener(event => {
    if (!disposed) setBrightness(event.brightness);
  });
  onCleanup(() => {
    subscription.remove();
  });
  const setTo = (value: number) => {
    setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(setBrightness),
    );
  };
  return { brightness, setTo };
}

// Android-only system-wide brightness mode and the "using system value" flag
function createSystemBrightness() {
  const [systemMode, setSystemMode] = createSignal<BrightnessMode>(
    BrightnessMode.UNKNOWN,
  );
  const [isUsingSystem, setIsUsingSystem] =
    createSignal<ICapabilityStatus>('checking');
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  if (Platform.OS === 'android') {
    Promise.all([
      getSystemBrightnessModeAsync(),
      isUsingSystemBrightnessAsync(),
    ]).then(([mode, usingSystem]) => {
      if (!disposed) {
        setSystemMode(mode);
        setIsUsingSystem(usingSystem ? 'yes' : 'no');
      }
    });
  }
  const setMode = (mode: BrightnessMode) => {
    setSystemBrightnessModeAsync(mode).then(() =>
      getSystemBrightnessModeAsync().then(setSystemMode),
    );
  };
  const restore = () => {
    restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(value =>
        setIsUsingSystem(value ? 'yes' : 'no'),
      ),
    );
  };
  return { systemMode, isUsingSystem, setMode, restore };
}

export function BrightnessScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
  const lineColor = LINE_COLOR[lineInfo.line];

  const { brightness, setTo: handleSetBrightness } = createScreenBrightness();
  const {
    systemMode,
    isUsingSystem,
    setMode: handleSetSystemMode,
    restore: handleRestoreSystem,
  } = createSystemBrightness();
  const permissions = createPermissions();

  const brightnessLabel = () =>
    brightness() === null ? 'checking…' : `${Math.round(brightness()! * 100)}%`;
  const permissionLabel = () =>
    permissions.status() === null ? 'checking…' : permissions.status()!.status;

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="brightness-scroll"
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
            <text class="hero-title">Brightness</text>
            <text class="hero-body">
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

        <view testID="brightness-live-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Live brightness</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Screen brightness</text>
            <text class="value-text">{brightnessLabel()}</text>
          </view>
          <view class="button-row">
            <For each={BRIGHTNESS_STEPS}>
              {({ label, value }) => (
                <ActionButton
                  testID={`brightness-set-${label}`}
                  title={label}
                  onPress={() => handleSetBrightness(value)}
                  color={lineColor}
                />
              )}
            </For>
          </view>
        </view>

        {Platform.OS === 'android' && (
          <view testID="brightness-system-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">
                System brightness (Android only)
              </text>
            </view>
            <view class="capability-row">
              <text class="capability-label">Mode</text>
              <text class="value-text">
                {brightnessModeLabel(systemMode())}
              </text>
            </view>
            <view class="capability-row" testID="brightness-using-system">
              <text class="capability-label">Using system value</text>
              <CapabilityBadge status={isUsingSystem()} />
            </view>
            <view class="button-row">
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

        <view testID="brightness-permission-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Permission</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">SYSTEM_BRIGHTNESS status</text>
            <text class="value-text">{permissionLabel()}</text>
          </view>
          <ActionButton
            testID="brightness-request-permission"
            title="Request permission"
            onPress={() => permissions.request()}
            color={lineColor}
          />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
