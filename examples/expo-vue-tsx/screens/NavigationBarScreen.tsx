import { defineComponent, onUnmounted, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  NavigationBar,
  addVisibilityListener,
  getVisibilityAsync,
  popStackEntry,
  pushStackEntry,
  replaceStackEntry,
  setHidden,
  setStyle,
  setVisibilityAsync,
  useVisibility,
} from '@symbiote-native/navigation-bar/vue';
import type {
  INavigationBarStackEntry,
  INavigationBarStyle,
} from '@symbiote-native/navigation-bar/vue';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  ChoiceRow,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.NavigationBar;
const color = lineColorOf(ROUTE);
const MAX_LOGGED_EVENTS = 8;
const IS_ANDROID = Platform.select({ android: true, default: false });

const STYLES: readonly { label: string; value: INavigationBarStyle }[] = [
  { label: 'auto', value: 'auto' },
  { label: 'inverted', value: 'inverted' },
  { label: 'light', value: 'light' },
  { label: 'dark', value: 'dark' },
];

const ImperativeCard = defineComponent(
  () => {
    const style = ref<INavigationBarStyle>('auto');
    return () => (
      <Scenario
        testID="navigation-bar-style-card"
        title="Go edge-to-edge for a video, a game or a reader (Android)"
        why="Hide the system navigation bar for full-screen content and match its icon color to your screen. A swipe from the edge brings the bar back temporarily."
        steps={['Choose a style (light or dark icons)', 'Press setHidden(true)', 'Swipe from the bottom edge, then press setHidden(false)']}
        expect="The bar disappears and comes back on command, and getVisibilityAsync reports hidden or visible accordingly."
      >
        <ChoiceRow
          testID="navigation-bar-style"
          label="style"
          options={STYLES}
          value={style.value}
          onChange={next => {
            style.value = next;
            setStyle(next);
          }}
          color={color}
        />
        <CallConsole
          isBare
          prefix="navigation-bar-visibility"
          title="Visibility calls"
          color={color}
          calls={[
            { label: 'setHidden(true)', run: async () => setHidden(true) },
            { label: 'setHidden(false)', run: async () => setHidden(false) },
            { label: 'setVisibilityAsync(hidden)', run: () => setVisibilityAsync('hidden') },
            { label: 'setVisibilityAsync(visible)', run: () => setVisibilityAsync('visible') },
            { label: 'getVisibilityAsync', run: () => getVisibilityAsync() },
          ]}
        />
      </Scenario>
    );
  },
  { name: 'ImperativeCard' },
);

const ListenerCard = defineComponent(
  () => {
    const lines = ref<string[]>([]);
    const isOn = ref(false);
    let subscription: ReturnType<typeof addVisibilityListener> | null = null;

    onUnmounted(() => {
      subscription?.remove();
    });

    const toggle = (next: boolean) => {
      isOn.value = next;
      if (next) {
        subscription = addVisibilityListener(event => {
          lines.value = [
            `${event.visibility} (rawVisibility ${event.rawVisibility})`,
            ...lines.value,
          ].slice(0, MAX_LOGGED_EVENTS);
        });
      } else {
        subscription?.remove();
        subscription = null;
      }
    };

    return () => (
      <Scenario
        testID="navigation-bar-listener-card"
        title="React when the bar appears or hides"
        why="Adjust padding or pause a video when the user swipes the system bar in or out over your content."
        steps={['Turn listening on', 'Swipe the bar in and out from the bottom edge']}
        expect="Each change adds a line to the log below with the new visibility."
      >
        <ToggleRow
          testID="navigation-bar-listener-switch"
          label="listen"
          value={isOn.value}
          onChange={toggle}
          color={color}
        />
        <text testID="navigation-bar-listener-log" class="info-text">
          {lines.value.length === 0
            ? 'no events yet, swipe the bar in and out'
            : lines.value.join('\n')}
        </text>
      </Scenario>
    );
  },
  { name: 'ListenerCard' },
);

const HookValue = defineComponent(
  () => {
    const visibility = useVisibility();
    return () => (
      <ResultRow
        testID="navigation-bar-hook"
        label="useVisibility"
        value={visibility.value ?? 'loading…'}
      />
    );
  },
  { name: 'HookValue' },
);

const DeclarativeCard = defineComponent(
  () => {
    const isFirstOn = ref(false);
    const isSecondOn = ref(false);
    const isSecondHidden = ref(true);
    return () => (
      <Card testID="navigation-bar-component-card" title="NavigationBar component">
        <ToggleRow
          testID="navigation-bar-first-switch"
          label="first instance: style light"
          value={isFirstOn.value}
          onChange={next => {
            isFirstOn.value = next;
          }}
          color={color}
        />
        <ToggleRow
          testID="navigation-bar-second-switch"
          label="second instance mounted (last one wins)"
          value={isSecondOn.value}
          onChange={next => {
            isSecondOn.value = next;
          }}
          color={color}
        />
        <ToggleRow
          testID="navigation-bar-second-hidden-switch"
          label="second instance: hidden"
          value={isSecondHidden.value}
          onChange={next => {
            isSecondHidden.value = next;
          }}
          color={color}
        />
        {isFirstOn.value && <NavigationBar style="light" />}
        {isSecondOn.value && <NavigationBar hidden={isSecondHidden.value} />}
        <HookValue />
      </Card>
    );
  },
  { name: 'DeclarativeCard' },
);

const StackCard = defineComponent(
  () => {
    const entries: INavigationBarStackEntry[] = [];
    const depth = ref(0);
    const sync = () => {
      depth.value = entries.length;
    };
    const takeLast = (): INavigationBarStackEntry => {
      const last = entries.pop();
      if (last === undefined) {
        throw new Error('push an entry first');
      }
      return last;
    };

    return () => (
      <>
        <CallConsole
          prefix="navigation-bar-stack"
          title="Entry stack (imperative twin of the component)"
          color={color}
          calls={[
            {
              label: 'pushStackEntry(hidden)',
              run: async () => {
                entries.push(pushStackEntry({ hidden: true }));
                sync();
              },
            },
            {
              label: 'replaceStackEntry(last, light)',
              run: async () => {
                entries.push(replaceStackEntry(takeLast(), { style: 'light' }));
                sync();
              },
            },
            {
              label: 'popStackEntry(last)',
              run: async () => {
                popStackEntry(takeLast());
                sync();
              },
            },
          ]}
        />
        <ResultRow
          testID="navigation-bar-depth"
          label="stack depth"
          value={String(depth.value)}
        />
      </>
    );
  },
  { name: 'StackCard' },
);

export function NavigationBarScreen() {
  return (
    <ScreenShell
      route={ROUTE}
      testID="navigation-bar-scroll"
      title="Navigation Bar"
      body="Android only. Style and hide the system navigation bar for full-screen content, and react when it comes back."
    >
      {IS_ANDROID ? (
        <>
          <ImperativeCard />
          <ListenerCard />
          <Explorer testID="navigation-bar-explorer" color={color}>
            <DeclarativeCard />
            <StackCard />
          </Explorer>
        </>
      ) : (
        <Card testID="navigation-bar-unsupported-card" title="Android only">
          <text class="info-text">
            The system navigation bar exists on Android only, run this screen on an Android
            device or emulator.
          </text>
        </Card>
      )}
    </ScreenShell>
  );
}
