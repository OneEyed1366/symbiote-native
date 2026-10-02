import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
import { usePermissions } from '@symbiote-native/brightness/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label =
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view class={`status-badge status-badge-${props.status}`}>
      <text class="status-badge-text">{label}</text>
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
function useScreenBrightness() {
  const brightness = ref<number | null>(null);
  let isMounted = true;
  let subscription: ReturnType<typeof addBrightnessListener> | undefined;
  onMounted(() => {
    getBrightnessAsync().then(value => {
      if (isMounted) brightness.value = value;
    });
    subscription = addBrightnessListener(event => {
      if (isMounted) brightness.value = event.brightness;
    });
  });
  onUnmounted(() => {
    isMounted = false;
    subscription?.remove();
  });
  const setTo = (value: number) => {
    setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(next => {
        brightness.value = next;
      }),
    );
  };
  return { brightness, setTo };
}

// Android-only system-wide brightness mode and the "using system value" flag
function useSystemBrightness() {
  const systemMode = ref<BrightnessMode>(BrightnessMode.UNKNOWN);
  const isUsingSystem = ref<ICapabilityStatus>('checking');
  let isMounted = true;
  onMounted(() => {
    if (Platform.OS === 'android') {
      Promise.all([
        getSystemBrightnessModeAsync(),
        isUsingSystemBrightnessAsync(),
      ]).then(([mode, usingSystem]) => {
        if (isMounted) {
          systemMode.value = mode;
          isUsingSystem.value = usingSystem ? 'yes' : 'no';
        }
      });
    }
  });
  onUnmounted(() => {
    isMounted = false;
  });
  const setMode = (mode: BrightnessMode) => {
    setSystemBrightnessModeAsync(mode).then(() =>
      getSystemBrightnessModeAsync().then(next => {
        systemMode.value = next;
      }),
    );
  };
  const restore = () => {
    restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(value => {
        isUsingSystem.value = value ? 'yes' : 'no';
      }),
    );
  };
  return { systemMode, isUsingSystem, setMode, restore };
}

export const BrightnessScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
    const lineColor = LINE_COLOR[lineInfo.line];

    const { brightness, setTo: handleSetBrightness } = useScreenBrightness();
    const {
      systemMode,
      isUsingSystem,
      setMode: handleSetSystemMode,
      restore: handleRestoreSystem,
    } = useSystemBrightness();
    const { status: permissionStatus, request: requestPermission } =
      usePermissions();

    const brightnessLabel = computed(() =>
      brightness.value === null
        ? 'checking…'
        : `${Math.round(brightness.value * 100)}%`,
    );
    const permissionLabel = computed(() =>
      permissionStatus.value === null
        ? 'checking…'
        : permissionStatus.value.status,
    );

    return () => (
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
              <text class="value-text">{brightnessLabel.value}</text>
            </view>
            <view class="button-row">
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
            <view testID="brightness-system-card" class="feature-card">
              <view class="feature-card-header">
                <text class="feature-card-title">
                  System brightness (Android only)
                </text>
              </view>
              <view class="capability-row">
                <text class="capability-label">Mode</text>
                <text class="value-text">
                  {brightnessModeLabel(systemMode.value)}
                </text>
              </view>
              <view class="capability-row" testID="brightness-using-system">
                <text class="capability-label">Using system value</text>
                <CapabilityBadge status={isUsingSystem.value} />
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
              <text class="value-text">{permissionLabel.value}</text>
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
  },
  { name: 'BrightnessScreen' },
);
