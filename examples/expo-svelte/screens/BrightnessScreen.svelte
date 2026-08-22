<script lang="ts">
  // @symbiote-native/brightness tour stop — a live brightness card (seeded via getBrightnessAsync(),
  // refreshed by addBrightnessListener() — iOS-only upstream, so on Android the value only changes
  // via the buttons below) plus a set-brightness action row, an Android-only system-brightness-mode
  // card, and a permission card driving usePermissions(). Svelte twin of
  // examples/expo-vue-sfc/screens/BrightnessScreen.vue.
  import {
    Platform,
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
  import {
    BrightnessMode,
    addBrightnessListener,
    getBrightnessAsync,
    getSystemBrightnessModeAsync,
    isUsingSystemBrightnessAsync,
    restoreSystemBrightnessAsync,
    setBrightnessAsync,
    setSystemBrightnessModeAsync,
    usePermissions,
    type EventSubscription,
  } from '@symbiote-native/brightness/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';
  type IBrightnessStep = { label: string; value: number };

  const CAPABILITY_LABEL: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  const PENDING_LABEL = 'checking…';
  const PERCENT_SCALE = 100;

  const BRIGHTNESS_STEPS: readonly IBrightnessStep[] = [
    { label: '25%', value: 0.25 },
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1 },
  ];

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

  function toCapabilityStatus(isEnabled: boolean): ICapabilityStatus {
    return isEnabled ? 'yes' : 'no';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Brightness];
  const lineColor = LINE_COLOR[lineInfo.line];

  let brightness = $state<number | null>(null);
  let systemMode = $state<BrightnessMode>(BrightnessMode.UNKNOWN);
  let systemUsageStatus = $state<ICapabilityStatus>('checking');
  const permissions = usePermissions();

  // Vue's onMounted/onUnmounted pair collapses into ONE effect whose returned function is the
  // teardown. Every touch of the state above is a WRITE, never a read, so the dependency set stays
  // empty: it runs once on mount and removes the listener once on unmount.
  $effect(() => {
    void getBrightnessAsync().then(value => {
      brightness = value;
    });
    const subscription: EventSubscription = addBrightnessListener(event => {
      brightness = event.brightness;
    });

    if (Platform.OS === 'android') {
      void Promise.all([
        getSystemBrightnessModeAsync(),
        isUsingSystemBrightnessAsync(),
      ]).then(([mode, isUsingSystem]) => {
        systemMode = mode;
        systemUsageStatus = toCapabilityStatus(isUsingSystem);
      });
    }

    return () => subscription.remove();
  });

  function handleSetBrightness(value: number): void {
    void setBrightnessAsync(value).then(() =>
      getBrightnessAsync().then(current => {
        brightness = current;
      }),
    );
  }

  function handleSetSystemMode(mode: BrightnessMode): void {
    void setSystemBrightnessModeAsync(mode).then(() =>
      getSystemBrightnessModeAsync().then(current => {
        systemMode = current;
      }),
    );
  }

  function handleRestoreSystem(): void {
    void restoreSystemBrightnessAsync().then(() =>
      isUsingSystemBrightnessAsync().then(isUsingSystem => {
        systemUsageStatus = toCapabilityStatus(isUsingSystem);
      }),
    );
  }

  const brightnessLabel = $derived(
    brightness === null
      ? PENDING_LABEL
      : `${Math.round(brightness * PERCENT_SCALE)}%`,
  );
  const systemModeLabel = $derived(brightnessModeLabel(systemMode));
  const permissionLabel = $derived(
    permissions.status === null ? PENDING_LABEL : permissions.status.status,
  );
</script>

<SafeAreaView class="screen">
  <ScrollView
    testID="brightness-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
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
          SYSTEM_BRIGHTNESS permission on Android before setting the system-wide
          value.
        </Text>
      </View>
    </View>
    <View testID="brightness-live-card" class="brightness-card">
      <Text class="brightness-card-title">Live brightness</Text>
      <View class="brightness-row">
        <Text class="brightness-row-label">Screen brightness</Text>
        <Text testID="brightness-level-value" class="brightness-value-text">
          {brightnessLabel}
        </Text>
      </View>
      <View class="button-row">
        {#each BRIGHTNESS_STEPS as step (step.label)}<ActionButton
            testID={`brightness-set-${step.label}`}
            title={step.label}
            onPress={() => handleSetBrightness(step.value)}
            color={lineColor}
          />{/each}
      </View>
    </View>{#if Platform.OS === 'android'}<View
        testID="brightness-system-card"
        class="brightness-card"
      >
        <Text class="brightness-card-title">
          System brightness (Android only)
        </Text>
        <View class="brightness-row">
          <Text class="brightness-row-label">Mode</Text>
          <Text testID="brightness-mode-value" class="brightness-value-text">
            {systemModeLabel}
          </Text>
        </View>
        <View testID="brightness-using-system" class="brightness-row">
          <Text class="brightness-row-label">Using system value</Text>
          <View
            class={`brightness-status-badge brightness-status-badge-${systemUsageStatus}`}
          >
            <Text class="brightness-status-text">
              {CAPABILITY_LABEL[systemUsageStatus]}
            </Text>
          </View>
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
      </View>{/if}<View
      testID="brightness-permission-card"
      class="brightness-card"
    >
      <Text class="brightness-card-title">Permission</Text>
      <View class="brightness-row">
        <Text class="brightness-row-label">SYSTEM_BRIGHTNESS status</Text>
        <Text
          testID="brightness-permission-value"
          class="brightness-value-text"
        >
          {permissionLabel}
        </Text>
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
