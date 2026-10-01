<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
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
  } from '@symbiote-native/navigation-bar/svelte';
  import type {
    INavigationBarStackEntry,
    INavigationBarStyle,
  } from '@symbiote-native/navigation-bar/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import NavigationBarHookValue from './NavigationBarHookValue.svelte';

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

  let style = $state<INavigationBarStyle>('auto');
  let lines = $state<string[]>([]);
  let isListening = $state(false);
  let subscription: ReturnType<typeof addVisibilityListener> | null = null;
  let isFirstOn = $state(false);
  let isSecondOn = $state(false);
  let isSecondHidden = $state(true);
  let depth = $state(0);
  const entries: INavigationBarStackEntry[] = [];

  function toggleListener(next: boolean): void {
    isListening = next;
    if (next) {
      subscription = addVisibilityListener(event => {
        lines = [
          `${event.visibility} (rawVisibility ${event.rawVisibility})`,
          ...lines,
        ].slice(0, MAX_LOGGED_EVENTS);
      });
    } else {
      subscription?.remove();
      subscription = null;
    }
  }

  function takeLast(): INavigationBarStackEntry {
    const last = entries.pop();
    if (last === undefined) {
      throw new Error('push an entry first');
    }
    return last;
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="navigation-bar-scroll"
  title="Navigation Bar"
  body="Android only. Style and hide the system navigation bar for full-screen content, and react when it comes back."
>
  {#if IS_ANDROID}
    <Scenario
      testID="navigation-bar-style-card"
      title="Go edge-to-edge for a video, a game or a reader (Android)"
      why="Hide the system navigation bar for full-screen content and match its icon color to your screen. A swipe from the edge brings the bar back temporarily."
      steps={[
        'Choose a style (light or dark icons)',
        'Press setHidden(true)',
        'Swipe from the bottom edge, then press setHidden(false)',
      ]}
      expect="The bar disappears and comes back on command, and getVisibilityAsync reports hidden or visible accordingly."
    >
      <ChoiceRow
        testID="navigation-bar-style"
        label="style"
        options={STYLES}
        value={style}
        onChange={next => {
          style = next;
          setStyle(next);
        }}
        {color}
      />
      <CallConsole
        isBare
        prefix="navigation-bar-visibility"
        title="Visibility calls"
        {color}
        calls={[
          { label: 'setHidden(true)', run: async () => setHidden(true) },
          { label: 'setHidden(false)', run: async () => setHidden(false) },
          {
            label: 'setVisibilityAsync(hidden)',
            run: () => setVisibilityAsync('hidden'),
          },
          {
            label: 'setVisibilityAsync(visible)',
            run: () => setVisibilityAsync('visible'),
          },
          { label: 'getVisibilityAsync', run: () => getVisibilityAsync() },
        ]}
      />
    </Scenario>

    <Scenario
      testID="navigation-bar-listener-card"
      title="React when the bar appears or hides"
      why="Adjust padding or pause a video when the user swipes the system bar in or out over your content."
      steps={[
        'Turn listening on',
        'Swipe the bar in and out from the bottom edge',
      ]}
      expect="Each change adds a line to the log below with the new visibility."
    >
      <ToggleRow
        testID="navigation-bar-listener-switch"
        label="listen"
        value={isListening}
        onChange={toggleListener}
        {color}
      />
      <text testID="navigation-bar-listener-log" class="info-text">
        {lines.length === 0
          ? 'no events yet, swipe the bar in and out'
          : lines.join('\n')}
      </text>
    </Scenario>

    <Explorer testID="navigation-bar-explorer" {color}>
      <Card testID="navigation-bar-component-card" title="NavigationBar component">
        <ToggleRow
          testID="navigation-bar-first-switch"
          label="first instance: style light"
          value={isFirstOn}
          onChange={next => {
            isFirstOn = next;
          }}
          {color}
        />
        <ToggleRow
          testID="navigation-bar-second-switch"
          label="second instance mounted (last one wins)"
          value={isSecondOn}
          onChange={next => {
            isSecondOn = next;
          }}
          {color}
        />
        <ToggleRow
          testID="navigation-bar-second-hidden-switch"
          label="second instance: hidden"
          value={isSecondHidden}
          onChange={next => {
            isSecondHidden = next;
          }}
          {color}
        />
        {#if isFirstOn}
          <NavigationBar style="light" />
        {/if}
        {#if isSecondOn}
          <NavigationBar hidden={isSecondHidden} />
        {/if}
        <NavigationBarHookValue />
      </Card>
      <CallConsole
        prefix="navigation-bar-stack"
        title="Entry stack (imperative twin of the component)"
        {color}
        calls={[
          {
            label: 'pushStackEntry(hidden)',
            run: async () => {
              entries.push(pushStackEntry({ hidden: true }));
              depth = entries.length;
            },
          },
          {
            label: 'replaceStackEntry(last, light)',
            run: async () => {
              entries.push(replaceStackEntry(takeLast(), { style: 'light' }));
              depth = entries.length;
            },
          },
          {
            label: 'popStackEntry(last)',
            run: async () => {
              popStackEntry(takeLast());
              depth = entries.length;
            },
          },
        ]}
      />
      <ResultRow
        testID="navigation-bar-depth"
        label="stack depth"
        value={String(depth)}
      />
    </Explorer>
  {:else}
    <Card testID="navigation-bar-unsupported-card" title="Android only">
      <text class="info-text">
        The system navigation bar exists on Android only, run this screen on an
        Android device or emulator.
      </text>
    </Card>
  {/if}
</ScreenShell>
