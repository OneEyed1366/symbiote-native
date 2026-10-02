import { Show, createSignal } from 'solid-js';
import {
  addScreenshotListener,
  allowScreenCaptureAsync,
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  getPermissionsAsync,
  isAvailableAsync,
  preventScreenCaptureAsync,
  removeScreenshotListener,
  requestPermissionsAsync,
} from '@symbiote-native/screen-capture';
import type {
  EventSubscription,
  PermissionResponse,
} from '@symbiote-native/screen-capture';
import {
  createPermissions,
  createPreventScreenCapture,
  createScreenshotListener,
} from '@symbiote-native/screen-capture/solid';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.ScreenCapture;
const color = lineColorOf(ROUTE);

function describePermission(response: PermissionResponse | null): string {
  return response === null
    ? 'loading…'
    : `${response.status}, granted ${response.granted}, canAskAgain ${response.canAskAgain}`;
}

function PreventHolder(props: { keyName: string }) {
  createPreventScreenCapture(props.keyName);
  return null;
}

function PreventCard() {
  const [isAvailable, setIsAvailable] = createSignal('checking…');
  const [hookKey, setHookKey] = createSignal('hook-demo');
  const [isHookOn, setIsHookOn] = createSignal(false);
  const [imperativeKey, setImperativeKey] = createSignal('manual-demo');
  const [status, setStatus] = createSignal('idle');

  isAvailableAsync().then(available =>
    setIsAvailable(available ? 'YES' : 'NO'),
  );

  const run = (label: string, call: () => Promise<void>) =>
    call()
      .then(() => setStatus(`${label} ok`))
      .catch((error: Error) => setStatus(`${label} failed: ${error.message}`));

  return (
    <Scenario
      testID="screen-capture-prevent-card"
      title="Hide sensitive content from screenshots and recordings"
      why="Banking details, one-time codes and private documents should not end up in the camera roll or in a screen recording."
      steps={['Turn protection on', 'Take a screenshot or start a screen recording', 'Open the capture']}
      expect="The capture is black while protection is on and normal again after it is released. Protection stays until every key is released."
    >
      <ResultRow
        testID="screen-capture-available"
        label="isAvailableAsync"
        value={isAvailable()}
      />
      <Field
        testID="screen-capture-hook-key-input"
        label="hook key"
        value={hookKey()}
        onChange={setHookKey}
      />
      <ToggleRow
        testID="screen-capture-hook-switch"
        label="usePreventScreenCapture(key)"
        value={isHookOn()}
        onChange={setIsHookOn}
        color={color}
      />
      <Show when={isHookOn()}>
        <PreventHolder keyName={hookKey()} />
      </Show>
      <Field
        testID="screen-capture-key-input"
        label="imperative key (calls are counted per key)"
        value={imperativeKey()}
        onChange={setImperativeKey}
      />
      <ActionButton
        testID="screen-capture-prevent-button"
        title="preventScreenCaptureAsync"
        onPress={() =>
          run('prevent', () => preventScreenCaptureAsync(imperativeKey()))
        }
        color={color}
      />
      <ActionButton
        testID="screen-capture-allow-button"
        title="allowScreenCaptureAsync"
        onPress={() => run('allow', () => allowScreenCaptureAsync(imperativeKey()))}
        color={color}
      />
      <ResultRow testID="screen-capture-status" label="Last call" value={status()} />
    </Scenario>
  );
}

function SwitcherCard() {
  const [blurIntensity, setBlurIntensity] = createSignal('0.5');
  const [status, setStatus] = createSignal('idle');
  const run = (label: string, call: () => Promise<void>) =>
    call()
      .then(() => setStatus(`${label} ok`))
      .catch((error: Error) => setStatus(`${label} failed: ${error.message}`));
  const intensity = () => Number(blurIntensity());

  return (
    <Scenario
      testID="screen-capture-switcher-card"
      title="Blur the app in the task switcher (iOS)"
      why="The app-switcher preview is a screenshot too. Blur it so a glance over a shoulder does not reveal the screen."
      steps={['Turn the blur on', 'Go to the home screen and open the app switcher']}
      expect="The preview of this app is blurred while protection is on and sharp again after you turn it off."
    >
      <Field
        testID="screen-capture-blur-input"
        label="blurIntensity (0 - 1)"
        value={blurIntensity()}
        onChange={setBlurIntensity}
      />
      <ActionButton
        testID="screen-capture-switcher-enable-button"
        title="enableAppSwitcherProtectionAsync"
        onPress={() =>
          run('enable', () =>
            enableAppSwitcherProtectionAsync(
              Number.isNaN(intensity()) ? undefined : intensity(),
            ),
          )
        }
        color={color}
      />
      <ActionButton
        testID="screen-capture-switcher-disable-button"
        title="disableAppSwitcherProtectionAsync"
        onPress={() =>
          run('disable', () => disableAppSwitcherProtectionAsync())
        }
        color={color}
      />
      <ResultRow
        testID="screen-capture-switcher-status"
        label="Last call"
        value={status()}
      />
    </Scenario>
  );
}

function ScreenshotCard() {
  const [hookCount, setHookCount] = createSignal(0);
  const [manualCount, setManualCount] = createSignal(0);
  const [isManualOn, setIsManualOn] = createSignal(false);
  let subscription: EventSubscription | null = null;

  createScreenshotListener(() => setHookCount(count => count + 1));

  const toggleManual = (next: boolean) => {
    setIsManualOn(next);
    if (next) {
      subscription = addScreenshotListener(() =>
        setManualCount(count => count + 1),
      );
    } else if (subscription !== null) {
      removeScreenshotListener(subscription);
      subscription = null;
    }
  };

  return (
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
        value={String(hookCount())}
      />
      <ToggleRow
        testID="screen-capture-manual-switch"
        label="addScreenshotListener / removeScreenshotListener"
        value={isManualOn()}
        onChange={toggleManual}
        color={color}
      />
      <ResultRow
        testID="screen-capture-manual-count"
        label="manual listener count"
        value={String(manualCount())}
      />
    </Scenario>
  );
}

function PermissionsCard() {
  const permissions = createPermissions();
  const [direct, setDirect] = createSignal('not called');
  const run = (call: () => Promise<PermissionResponse>) =>
    call()
      .then(response => setDirect(describePermission(response)))
      .catch((failure: Error) => setDirect(`failed: ${failure.message}`));

  return (
    <Card testID="screen-capture-permissions-card" title="Permissions">
      <ResultRow
        testID="screen-capture-permission-hook"
        label="usePermissions state"
        value={permissions.error() === null ? describePermission(permissions.status()) : (permissions.error()?.message ?? '')}
      />
      <ActionButton
        testID="screen-capture-hook-request"
        title="hook request()"
        onPress={() => permissions.request()}
        color={color}
      />
      <ActionButton
        testID="screen-capture-hook-get"
        title="hook get()"
        onPress={() => permissions.get()}
        color={color}
      />
      <ActionButton
        testID="screen-capture-get-button"
        title="getPermissionsAsync"
        onPress={() => run(getPermissionsAsync)}
        color={color}
      />
      <ActionButton
        testID="screen-capture-request-button"
        title="requestPermissionsAsync"
        onPress={() => run(requestPermissionsAsync)}
        color={color}
      />
      <ResultRow
        testID="screen-capture-direct"
        label="direct call"
        value={direct()}
      />
    </Card>
  );
}

export function ScreenCaptureScreen() {
  return (
    <ScreenShell
      route={ROUTE}
      testID="screen-capture-scroll"
      title="Screen Capture"
      body="Protect private screens: block screenshots and screen recording, blur the app-switcher preview and find out when a screenshot is taken."
    >
      <PreventCard />
      <SwitcherCard />
      <ScreenshotCard />
      <Explorer testID="screen-capture-explorer" color={color}>
        <PermissionsCard />
      </Explorer>
    </ScreenShell>
  );
}
