<script lang="ts">
  import {
    addScreenshotListener,
    allowScreenCaptureAsync,
    disableAppSwitcherProtectionAsync,
    enableAppSwitcherProtectionAsync,
    isAvailableAsync,
    preventScreenCaptureAsync,
    removeScreenshotListener,
    useScreenshotListener,
  } from '@symbiote-native/screen-capture/svelte';
  import type { EventSubscription } from '@symbiote-native/screen-capture/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import ScreenCapturePermissionsCard from './ScreenCapturePermissionsCard.svelte';
  import ScreenCapturePreventHolder from './ScreenCapturePreventHolder.svelte';

  const ROUTE = ROUTE_NAME.ScreenCapture;
  const color = lineColorOf(ROUTE);

  let isAvailable = $state('checking…');
  let hookKey = $state('hook-demo');
  let isHookOn = $state(false);
  let imperativeKey = $state('manual-demo');
  let preventStatus = $state('idle');
  let blurIntensity = $state('0.5');
  let switcherStatus = $state('idle');
  let hookCount = $state(0);
  let manualCount = $state(0);
  let isManualOn = $state(false);
  let subscription: EventSubscription | null = null;

  $effect(() => {
    void isAvailableAsync().then(available => {
      isAvailable = available ? 'YES' : 'NO';
    });
  });

  useScreenshotListener(() => {
    hookCount += 1;
  });

  function runPrevent(label: string, call: () => Promise<void>): void {
    call()
      .then(() => {
        preventStatus = `${label} ok`;
      })
      .catch((error: Error) => {
        preventStatus = `${label} failed: ${error.message}`;
      });
  }

  function runSwitcher(label: string, call: () => Promise<void>): void {
    call()
      .then(() => {
        switcherStatus = `${label} ok`;
      })
      .catch((error: Error) => {
        switcherStatus = `${label} failed: ${error.message}`;
      });
  }

  function toggleManual(next: boolean): void {
    isManualOn = next;
    if (next) {
      subscription = addScreenshotListener(() => {
        manualCount += 1;
      });
    } else if (subscription !== null) {
      removeScreenshotListener(subscription);
      subscription = null;
    }
  }

  function intensity(): number | undefined {
    const value = Number(blurIntensity);
    return Number.isNaN(value) ? undefined : value;
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="screen-capture-scroll"
  title="Screen Capture"
  body="Protect private screens: block screenshots and screen recording, blur the app-switcher preview and find out when a screenshot is taken."
>
  <Scenario
    testID="screen-capture-prevent-card"
    title="Hide sensitive content from screenshots and recordings"
    why="Banking details, one-time codes and private documents should not end up in the camera roll or in a screen recording."
    steps={[
      'Turn protection on',
      'Take a screenshot or start a screen recording',
      'Open the capture',
    ]}
    expect="The capture is black while protection is on and normal again after it is released. Protection stays until every key is released."
  >
    <ResultRow
      testID="screen-capture-available"
      label="isAvailableAsync"
      value={isAvailable}
    />
    <Field
      testID="screen-capture-hook-key-input"
      label="hook key"
      value={hookKey}
      onChange={next => {
        hookKey = next;
      }}
    />
    <ToggleRow
      testID="screen-capture-hook-switch"
      label="usePreventScreenCapture(key)"
      value={isHookOn}
      onChange={next => {
        isHookOn = next;
      }}
      {color}
    />
    {#if isHookOn}
      <ScreenCapturePreventHolder keyName={hookKey} />
    {/if}
    <Field
      testID="screen-capture-key-input"
      label="imperative key (calls are counted per key)"
      value={imperativeKey}
      onChange={next => {
        imperativeKey = next;
      }}
    />
    <ActionButton
      testID="screen-capture-prevent-button"
      title="preventScreenCaptureAsync"
      onPress={() =>
        runPrevent('prevent', () => preventScreenCaptureAsync(imperativeKey))}
      {color}
    />
    <ActionButton
      testID="screen-capture-allow-button"
      title="allowScreenCaptureAsync"
      onPress={() =>
        runPrevent('allow', () => allowScreenCaptureAsync(imperativeKey))}
      {color}
    />
    <ResultRow
      testID="screen-capture-status"
      label="Last call"
      value={preventStatus}
    />
  </Scenario>

  <Scenario
    testID="screen-capture-switcher-card"
    title="Blur the app in the task switcher (iOS)"
    why="The app-switcher preview is a screenshot too. Blur it so a glance over a shoulder does not reveal the screen."
    steps={[
      'Turn the blur on',
      'Go to the home screen and open the app switcher',
    ]}
    expect="The preview of this app is blurred while protection is on and sharp again after you turn it off."
  >
    <Field
      testID="screen-capture-blur-input"
      label="blurIntensity (0 - 1)"
      value={blurIntensity}
      onChange={next => {
        blurIntensity = next;
      }}
    />
    <ActionButton
      testID="screen-capture-switcher-enable-button"
      title="enableAppSwitcherProtectionAsync"
      onPress={() =>
        runSwitcher('enable', () =>
          enableAppSwitcherProtectionAsync(intensity()),
        )}
      {color}
    />
    <ActionButton
      testID="screen-capture-switcher-disable-button"
      title="disableAppSwitcherProtectionAsync"
      onPress={() =>
        runSwitcher('disable', () => disableAppSwitcherProtectionAsync())}
      {color}
    />
    <ResultRow
      testID="screen-capture-switcher-status"
      label="Last call"
      value={switcherStatus}
    />
  </Scenario>

  <Scenario
    testID="screen-capture-screenshot-card"
    title="Notice when the user takes a screenshot"
    why="Warn the user, log the event or hide content when someone screenshots a private screen. Android 13 and later need the storage permission from the explorer for detection."
    steps={['Start listening', 'Take a screenshot while this screen is open']}
    expect="The screenshot counter goes up by one for each screenshot."
  >
    <ResultRow
      testID="screen-capture-hook-count"
      label="useScreenshotListener count"
      value={String(hookCount)}
    />
    <ToggleRow
      testID="screen-capture-manual-switch"
      label="addScreenshotListener / removeScreenshotListener"
      value={isManualOn}
      onChange={toggleManual}
      {color}
    />
    <ResultRow
      testID="screen-capture-manual-count"
      label="manual listener count"
      value={String(manualCount)}
    />
  </Scenario>

  <Explorer testID="screen-capture-explorer" {color}>
    <ScreenCapturePermissionsCard />
  </Explorer>
</ScreenShell>
