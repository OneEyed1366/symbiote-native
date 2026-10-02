<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
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
} from '@symbiote-native/navigation-bar/vue';
import type {
  INavigationBarStackEntry,
  INavigationBarStyle,
} from '@symbiote-native/navigation-bar/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import NavigationBarHookValue from './NavigationBarHookValue.vue';

const ROUTE = ROUTE_NAME.NavigationBar;
const color = lineColorOf(ROUTE);
const MAX_LOGGED_EVENTS = 8;
const IS_ANDROID = Platform.select({ android: true, default: false });
// A static `style="light"` on a component reads as the HTML style attribute, so it is bound
const FIRST_INSTANCE_STYLE: INavigationBarStyle = 'light';

const STYLES: readonly { label: string; value: INavigationBarStyle }[] = [
  { label: 'auto', value: 'auto' },
  { label: 'inverted', value: 'inverted' },
  { label: 'light', value: 'light' },
  { label: 'dark', value: 'dark' },
];

const style = ref<INavigationBarStyle>('auto');
const lines = ref<string[]>([]);
const isListening = ref(false);
let subscription: ReturnType<typeof addVisibilityListener> | null = null;
const isFirstOn = ref(false);
const isSecondOn = ref(false);
const isSecondHidden = ref(true);
const depth = ref(0);
const entries: INavigationBarStackEntry[] = [];

onUnmounted(() => {
  subscription?.remove();
  subscription = null;
});

function toggleListener(next: boolean): void {
  isListening.value = next;
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
}

function takeLast(): INavigationBarStackEntry {
  const last = entries.pop();
  if (last === undefined) {
    throw new Error('push an entry first');
  }
  return last;
}

function chooseStyle(next: INavigationBarStyle): void {
  style.value = next;
  setStyle(next);
}

const visibilityCalls = [
  { label: 'setHidden(true)', run: async () => setHidden(true) },
  { label: 'setHidden(false)', run: async () => setHidden(false) },
  { label: 'setVisibilityAsync(hidden)', run: () => setVisibilityAsync('hidden') },
  { label: 'setVisibilityAsync(visible)', run: () => setVisibilityAsync('visible') },
  { label: 'getVisibilityAsync', run: () => getVisibilityAsync() },
];

const stackCalls = [
  {
    label: 'pushStackEntry(hidden)',
    run: async () => {
      entries.push(pushStackEntry({ hidden: true }));
      depth.value = entries.length;
    },
  },
  {
    label: 'replaceStackEntry(last, light)',
    run: async () => {
      entries.push(replaceStackEntry(takeLast(), { style: 'light' }));
      depth.value = entries.length;
    },
  },
  {
    label: 'popStackEntry(last)',
    run: async () => {
      popStackEntry(takeLast());
      depth.value = entries.length;
    },
  },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="navigation-bar-scroll"
    title="Navigation Bar"
    body="Android only. Style and hide the system navigation bar for full-screen content, and react when it comes back."
  >
    <template v-if="IS_ANDROID">
      <Scenario
        testID="navigation-bar-style-card"
        title="Go edge-to-edge for a video, a game or a reader (Android)"
        why="Hide the system navigation bar for full-screen content and match its icon color to your screen. A swipe from the edge brings the bar back temporarily."
        :steps="[
          'Choose a style (light or dark icons)',
          'Press setHidden(true)',
          'Swipe from the bottom edge, then press setHidden(false)',
        ]"
        expect="The bar disappears and comes back on command, and getVisibilityAsync reports hidden or visible accordingly."
      >
        <ChoiceRow
          testID="navigation-bar-style"
          label="style"
          :options="STYLES"
          :value="style"
          :onChange="chooseStyle"
          :color="color"
        />
        <CallConsole
          isBare
          prefix="navigation-bar-visibility"
          title="Visibility calls"
          :color="color"
          :calls="visibilityCalls"
        />
      </Scenario>

      <Scenario
        testID="navigation-bar-listener-card"
        title="React when the bar appears or hides"
        why="Adjust padding or pause a video when the user swipes the system bar in or out over your content."
        :steps="['Turn listening on', 'Swipe the bar in and out from the bottom edge']"
        expect="Each change adds a line to the log below with the new visibility."
      >
        <ToggleRow
          testID="navigation-bar-listener-switch"
          label="listen"
          :value="isListening"
          :onChange="toggleListener"
          :color="color"
        />
        <text testID="navigation-bar-listener-log" class="info-text">
          {{ lines.length === 0 ? 'no events yet, swipe the bar in and out' : lines.join('\n') }}
        </text>
      </Scenario>

      <Explorer testID="navigation-bar-explorer" :color="color">
        <Card testID="navigation-bar-component-card" title="NavigationBar component">
          <ToggleRow
            testID="navigation-bar-first-switch"
            label="first instance: style light"
            :value="isFirstOn"
            :onChange="next => (isFirstOn = next)"
            :color="color"
          />
          <ToggleRow
            testID="navigation-bar-second-switch"
            label="second instance mounted (last one wins)"
            :value="isSecondOn"
            :onChange="next => (isSecondOn = next)"
            :color="color"
          />
          <ToggleRow
            testID="navigation-bar-second-hidden-switch"
            label="second instance: hidden"
            :value="isSecondHidden"
            :onChange="next => (isSecondHidden = next)"
            :color="color"
          />
          <NavigationBar v-if="isFirstOn" :style="FIRST_INSTANCE_STYLE" />
          <NavigationBar v-if="isSecondOn" :hidden="isSecondHidden" />
          <NavigationBarHookValue />
        </Card>
        <CallConsole
          prefix="navigation-bar-stack"
          title="Entry stack (imperative twin of the component)"
          :color="color"
          :calls="stackCalls"
        />
        <ResultRow testID="navigation-bar-depth" label="stack depth" :value="String(depth)" />
      </Explorer>
    </template>
    <Card v-else testID="navigation-bar-unsupported-card" title="Android only">
      <text class="info-text">
        The system navigation bar exists on Android only, run this screen on an Android device or
        emulator.
      </text>
    </Card>
  </ScreenShell>
</template>
