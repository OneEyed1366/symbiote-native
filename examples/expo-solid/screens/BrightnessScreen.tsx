import { For, createSignal, onCleanup } from 'solid-js';
import { Platform, ScrollView } from '@symbiote-native/solid';
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

/**
 * @symbiote-native/brightness canary demo: a live brightness card (seeded via
 * getBrightnessAsync(), refreshed by addBrightnessListener() - iOS-only upstream, so on
 * Android the value only changes via the buttons below), a set-brightness action row, an
 * Android-only system-brightness-mode card, and a permission card driving createPermissions().
 */
export function BrightnessScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [brightness, setBrightness] = createSignal<number | null>(null);
  const [systemMode, setSystemMode] = createSignal<BrightnessMode>(
    BrightnessMode.UNKNOWN,
  );
  const [isUsingSystem, setIsUsingSystem] =
    createSignal<ICapabilityStatus>('checking');
  const permissions = createPermissions();

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

  const handleSetBrightness = (value: number) => {
    setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(setBrightness),
    );
  };

  const handleSetSystemMode = (mode: BrightnessMode) => {
    setSystemBrightnessModeAsync(mode).then(() =>
      getSystemBrightnessModeAsync().then(setSystemMode),
    );
  };

  const handleRestoreSystem = () => {
    restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(value =>
        setIsUsingSystem(value ? 'yes' : 'no'),
      ),
    );
  };

  const brightnessLabel = () =>
    brightness() === null ? 'checking…' : `${Math.round(brightness()! * 100)}%`;
  const permissionLabel = () =>
    permissions.status() === null ? 'checking…' : permissions.status()!.status;

  return (
    <safe-area-view class="screen">
      <ScrollView
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
              @symbiote-native/brightness — screen brightness get/set, Android
              system-brightness mode, and an iOS-only live listener. Requires
              SYSTEM_BRIGHTNESS permission on Android before setting the
              system-wide value.
            </text>
          </view>
        </view>

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
      </ScrollView>
    </safe-area-view>
  );
}
