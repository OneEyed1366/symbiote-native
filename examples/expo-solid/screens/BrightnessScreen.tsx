import { For, createSignal, onCleanup } from 'solid-js';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
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
    props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO';
  return (
    <View class={`status-badge status-badge-${props.status}`}>
      <Text class="status-badge-text">{label()}</Text>
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
  const [isUsingSystem, setIsUsingSystem] = createSignal<ICapabilityStatus>('checking');
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
    <SafeAreaView class="screen">
      <ScrollView
        testID="brightness-scroll"
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
            <Text class="hero-title">Brightness</Text>
            <Text class="hero-body">
              @symbiote-native/brightness — screen brightness get/set, Android
              system-brightness mode, and an iOS-only live listener. Requires
              SYSTEM_BRIGHTNESS permission on Android before setting the
              system-wide value.
            </Text>
          </View>
        </View>

        <View testID="brightness-live-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Live brightness</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Screen brightness</Text>
            <Text class="value-text">{brightnessLabel()}</Text>
          </View>
          <View class="button-row">
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
          </View>
        </View>

        {Platform.OS === 'android' && (
          <View testID="brightness-system-card" class="feature-card">
            <View class="feature-card-header">
              <Text class="feature-card-title">
                System brightness (Android only)
              </Text>
            </View>
            <View class="capability-row">
              <Text class="capability-label">Mode</Text>
              <Text class="value-text">
                {brightnessModeLabel(systemMode())}
              </Text>
            </View>
            <View class="capability-row" testID="brightness-using-system">
              <Text class="capability-label">Using system value</Text>
              <CapabilityBadge status={isUsingSystem()} />
            </View>
            <View class="button-row">
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

        <View testID="brightness-permission-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Permission</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">SYSTEM_BRIGHTNESS status</Text>
            <Text class="value-text">{permissionLabel()}</Text>
          </View>
          <ActionButton
            testID="brightness-request-permission"
            title="Request permission"
            onPress={() => permissions.request()}
            color={lineColor}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
