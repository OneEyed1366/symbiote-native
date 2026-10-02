import { defineComponent, onUnmounted, ref } from 'vue';
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
  usePermissions,
  usePreventScreenCapture,
  useScreenshotListener,
} from '@symbiote-native/screen-capture/vue';
import type {
  EventSubscription,
  PermissionResponse,
} from '@symbiote-native/screen-capture/vue';
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

const PreventHolder = defineComponent<{ keyName: string }>(
  props => {
    usePreventScreenCapture(props.keyName);
    return () => null;
  },
  { name: 'PreventHolder', props: ['keyName'] },
);

const PreventCard = defineComponent(
  () => {
    const isAvailable = ref('checking…');
    const hookKey = ref('hook-demo');
    const isHookOn = ref(false);
    const imperativeKey = ref('manual-demo');
    const status = ref('idle');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });
    isAvailableAsync().then(available => {
      if (isMounted) {
        isAvailable.value = available ? 'YES' : 'NO';
      }
    });

    const run = (label: string, call: () => Promise<void>) =>
      call()
        .then(() => {
          status.value = `${label} ok`;
        })
        .catch((error: Error) => {
          status.value = `${label} failed: ${error.message}`;
        });

    return () => (
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
          value={isAvailable.value}
        />
        <Field
          testID="screen-capture-hook-key-input"
          label="hook key"
          value={hookKey.value}
          onChange={text => {
            hookKey.value = text;
          }}
        />
        <ToggleRow
          testID="screen-capture-hook-switch"
          label="usePreventScreenCapture(key)"
          value={isHookOn.value}
          onChange={next => {
            isHookOn.value = next;
          }}
          color={color}
        />
        {isHookOn.value && <PreventHolder keyName={hookKey.value} />}
        <Field
          testID="screen-capture-key-input"
          label="imperative key (calls are counted per key)"
          value={imperativeKey.value}
          onChange={text => {
            imperativeKey.value = text;
          }}
        />
        <ActionButton
          testID="screen-capture-prevent-button"
          title="preventScreenCaptureAsync"
          onPress={() =>
            run('prevent', () => preventScreenCaptureAsync(imperativeKey.value))
          }
          color={color}
        />
        <ActionButton
          testID="screen-capture-allow-button"
          title="allowScreenCaptureAsync"
          onPress={() => run('allow', () => allowScreenCaptureAsync(imperativeKey.value))}
          color={color}
        />
        <ResultRow testID="screen-capture-status" label="Last call" value={status.value} />
      </Scenario>
    );
  },
  { name: 'PreventCard' },
);

const SwitcherCard = defineComponent(
  () => {
    const blurIntensity = ref('0.5');
    const status = ref('idle');
    const run = (label: string, call: () => Promise<void>) =>
      call()
        .then(() => {
          status.value = `${label} ok`;
        })
        .catch((error: Error) => {
          status.value = `${label} failed: ${error.message}`;
        });
    const intensity = () => Number(blurIntensity.value);

    return () => (
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
          value={blurIntensity.value}
          onChange={text => {
            blurIntensity.value = text;
          }}
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
          value={status.value}
        />
      </Scenario>
    );
  },
  { name: 'SwitcherCard' },
);

const ScreenshotCard = defineComponent(
  () => {
    const hookCount = ref(0);
    const manualCount = ref(0);
    const isManualOn = ref(false);
    let subscription: EventSubscription | null = null;

    useScreenshotListener(() => {
      hookCount.value += 1;
    });

    onUnmounted(() => {
      if (subscription !== null) {
        removeScreenshotListener(subscription);
      }
    });

    const toggleManual = (next: boolean) => {
      isManualOn.value = next;
      if (next) {
        subscription = addScreenshotListener(() => {
          manualCount.value += 1;
        });
      } else if (subscription !== null) {
        removeScreenshotListener(subscription);
        subscription = null;
      }
    };

    return () => (
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
          value={String(hookCount.value)}
        />
        <ToggleRow
          testID="screen-capture-manual-switch"
          label="addScreenshotListener / removeScreenshotListener"
          value={isManualOn.value}
          onChange={toggleManual}
          color={color}
        />
        <ResultRow
          testID="screen-capture-manual-count"
          label="manual listener count"
          value={String(manualCount.value)}
        />
      </Scenario>
    );
  },
  { name: 'ScreenshotCard' },
);

const PermissionsCard = defineComponent(
  () => {
    const permissions = usePermissions();
    const direct = ref('not called');
    const run = (call: () => Promise<PermissionResponse>) =>
      call()
        .then(response => {
          direct.value = describePermission(response);
        })
        .catch((failure: Error) => {
          direct.value = `failed: ${failure.message}`;
        });

    return () => (
      <Card testID="screen-capture-permissions-card" title="Permissions">
        <ResultRow
          testID="screen-capture-permission-hook"
          label="usePermissions state"
          value={
            permissions.error.value === null
              ? describePermission(permissions.status.value)
              : permissions.error.value.message
          }
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
          value={direct.value}
        />
      </Card>
    );
  },
  { name: 'PermissionsCard' },
);

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
