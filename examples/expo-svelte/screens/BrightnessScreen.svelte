<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
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
  import Scenario from '../components/Scenario.svelte';
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

  // Every touch of the state above is a write, so the dependency set stays empty and the effect
  // runs once on mount, its returned function removes the listener on unmount
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
  const permissionLabel = $derived(
    permissions.status === null ? PENDING_LABEL : permissions.status.status,
  );
</script>

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
          change the system-wide value after the user grants the write settings
          permission.
        </text>
      </view>
    </view>

    <Scenario
      testID="brightness-scenario"
      title="Brighten the screen to show a QR code or a ticket"
      why="Scanners read a bright screen much better. Raise the brightness while the code is on screen and restore the user's level afterwards."
      steps={[
        'Note the current brightness in the live card',
        'Set a new value with the controls',
        'Restore the system value',
      ]}
      expect="The screen visibly brightens or dims, and the live card shows the new value. Restoring returns to the system setting."
    />

    <view testID="brightness-live-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Live brightness</text>
      </view>
      <view class="capability-row">
        <text class="capability-label">Screen brightness</text>
        <text class="value-text">{brightnessLabel}</text>
      </view>
      <view class="button-row">
        {#each BRIGHTNESS_STEPS as step (step.label)}
          <ActionButton
            testID={`brightness-set-${step.label}`}
            title={step.label}
            onPress={() => handleSetBrightness(step.value)}
            color={lineColor}
          />
        {/each}
      </view>
    </view>

    {#if Platform.OS === 'android'}
      <view testID="brightness-system-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">System brightness (Android only)</text>
        </view>
        <view class="capability-row">
          <text class="capability-label">Mode</text>
          <text class="value-text">{brightnessModeLabel(systemMode)}</text>
        </view>
        <view class="capability-row" testID="brightness-using-system">
          <text class="capability-label">Using system value</text>
          <view class={`status-badge status-badge-${systemUsageStatus}`}>
            <text class="status-badge-text">
              {CAPABILITY_LABEL[systemUsageStatus]}
            </text>
          </view>
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
    {/if}

    <view testID="brightness-permission-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Permission</text>
      </view>
      <view class="capability-row">
        <text class="capability-label">SYSTEM_BRIGHTNESS status</text>
        <text class="value-text">{permissionLabel}</text>
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
