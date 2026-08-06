import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  return (
    <View class={`auth-status-badge auth-status-badge-${props.status}`}>
      <Text class="auth-status-text">
        {props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO'}
      </Text>
    </View>
  );
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

function brightnessModeLabel(mode: BrightnessMode): string {
  switch (mode) {
    case BrightnessMode.AUTOMATIC: return 'Automatic';
    case BrightnessMode.MANUAL: return 'Manual';
    case BrightnessMode.UNKNOWN:
    default: return 'Unknown';
  }
}

const BRIGHTNESS_STEPS: readonly { label: string; value: number }[] = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

/**
 * Brightness demo: @symbiote-native/brightness — a live brightness card (seeded via
 * getBrightnessAsync(), refreshed by addBrightnessListener() — iOS-only upstream, so on Android
 * the value only changes via the buttons below), a set-brightness action row, an Android-only
 * system-brightness-mode card, and a permission card driving usePermissions(). Vue TSX twin of
 * ../../expo-react/screens/BrightnessScreen.tsx.
 */
export const BrightnessScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Brightness].line];

    const brightness = ref<number | null>(null);
    const systemMode = ref<BrightnessMode>(BrightnessMode.UNKNOWN);
    const isUsingSystem = ref<ICapabilityStatus>('checking');
    const { status: permissionStatus, request: requestPermission } = usePermissions();

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    let subscription: ReturnType<typeof addBrightnessListener> | undefined;
    onMounted(() => {
      getBrightnessAsync().then(value => {
        if (isMounted) brightness.value = value;
      });
      subscription = addBrightnessListener(event => {
        if (isMounted) brightness.value = event.brightness;
      });

      if (Platform.OS === 'android') {
        Promise.all([getSystemBrightnessModeAsync(), isUsingSystemBrightnessAsync()]).then(
          ([mode, usingSystem]) => {
            if (isMounted) {
              systemMode.value = mode;
              isUsingSystem.value = usingSystem ? 'yes' : 'no';
            }
          },
        );
      }
    });

    onUnmounted(() => {
      subscription?.remove();
    });

    function handleSetBrightness(value: number) {
      setBrightnessAsync(value).then(() => getBrightnessAsync().then(value => (brightness.value = value)));
    }

    function handleSetSystemMode(mode: BrightnessMode) {
      setSystemBrightnessModeAsync(mode).then(() =>
        getSystemBrightnessModeAsync().then(mode => (systemMode.value = mode)),
      );
    }

    function handleRestoreSystem() {
      restoreSystemBrightnessAsync().then(() =>
        isUsingSystemBrightnessAsync().then(value => (isUsingSystem.value = value ? 'yes' : 'no')),
      );
    }

    const brightnessLabel = computed(() =>
      brightness.value === null ? 'checking…' : `${Math.round(brightness.value * 100)}%`,
    );
    const permissionLabel = computed(() =>
      permissionStatus.value === null ? 'checking…' : permissionStatus.value.status,
    );

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="brightness-scroll" class="screen" contentContainerStyle="scroll-content">
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
                @symbiote-native/brightness — screen brightness get/set, Android system-brightness
                mode, and an iOS-only live listener. Requires SYSTEM_BRIGHTNESS permission on
                Android before setting the system-wide value.
              </Text>
            </View>
          </View>

          <View testID="brightness-live-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Live brightness</Text>
            </View>
            <ValueRow label="Screen brightness" value={brightnessLabel.value} />
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

          {Platform.OS === 'android' && (
            <View testID="brightness-system-card" class="auth-card">
              <View class="auth-card-header">
                <Text class="auth-card-title">System brightness (Android only)</Text>
              </View>
              <ValueRow label="Mode" value={brightnessModeLabel(systemMode.value)} />
              <View class="auth-capability-row" testID="brightness-using-system">
                <Text class="auth-capability-label">Using system value</Text>
                <CapabilityBadge status={isUsingSystem.value} />
              </View>
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
          )}

          <View testID="brightness-permission-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Permission</Text>
            </View>
            <ValueRow label="SYSTEM_BRIGHTNESS status" value={permissionLabel.value} />
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
  },
  { name: 'BrightnessScreen' },
);
