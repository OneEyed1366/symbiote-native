<script setup lang="ts">
import { ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  coolDownAsync,
  dismissBrowser,
  getCustomTabsSupportingBrowsersAsync,
  mayInitWithUrlAsync,
  openBrowserAsync,
  warmUpAsync,
} from '@symbiote-native/web-browser';
import ActionButton from '../components/ActionButton.vue';
import CallConsole from '../components/CallConsole.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import WebBrowserAuthCard from './WebBrowserAuthCard.vue';
import WebBrowserOptionsCard from './WebBrowserOptionsCard.vue';
import { INITIAL_OPTIONS, toOpenOptions } from './web-browser-options';
import type { IOptionsForm, ISetOptions } from './web-browser-options';

const ROUTE = ROUTE_NAME.WebBrowser;
const color = lineColorOf(ROUTE);
const DEMO_URL = 'https://symbiote-native.dev';
const IS_ANDROID = Platform.select({ android: true, default: false });

const url = ref(DEMO_URL);
const options = ref<IOptionsForm>(INITIAL_OPTIONS);
const lastResult = ref('idle');
const servicePackage = ref<string | undefined>(undefined);

const setOptions: ISetOptions = patch => {
  options.value = { ...options.value, ...patch };
};

function open(): void {
  lastResult.value = 'opening…';
  openBrowserAsync(url.value, toOpenOptions(options.value))
    .then(result => {
      lastResult.value = `result: ${result.type}`;
    })
    .catch((error: Error) => {
      lastResult.value = `open failed: ${error.message}`;
    });
}

function dismiss(): void {
  dismissBrowser()
    .then(result => {
      lastResult.value = `dismissed: ${result.type}`;
    })
    .catch((error: Error) => {
      lastResult.value = `dismiss failed: ${error.message}`;
    });
}

const customTabsCalls = [
  {
    label: 'getCustomTabsSupportingBrowsersAsync',
    run: () => getCustomTabsSupportingBrowsersAsync(),
  },
  {
    label: 'warmUpAsync',
    run: async () => {
      const result = await warmUpAsync();
      servicePackage.value = result.servicePackage;
      return result;
    },
  },
  {
    label: 'mayInitWithUrlAsync',
    run: () => mayInitWithUrlAsync(url.value, servicePackage.value),
  },
  { label: 'coolDownAsync', run: () => coolDownAsync(servicePackage.value) },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="web-browser-scroll"
    title="Web Browser"
    body="Show web content in an in-app browser that keeps the user inside your app, and run browser-based sign-in flows that return to the app with a result."
  >
    <Scenario
      testID="web-browser-open-card"
      title="Open a link or a help page without leaving the app"
      why="Terms of service, help articles and links open in Safari View Controller or a Chrome Custom Tab on top of your app, with shared cookies and one tap to get back."
      :steps="[
        'Press Open (the sample URL is preset)',
        'Close the browser with Done or the back button',
        'Press Open again and use Dismiss from the app (iOS)',
      ]"
      expect="The page opens in the in-app browser. Last result says cancel when closed by the user and dismiss when closed by the app on iOS, and opened on Android as soon as the tab launches."
    >
      <Field
        testID="web-browser-url-input"
        label="url"
        :value="url"
        :onChange="next => (url = next)"
        placeholder="https://example.com"
      />
      <ActionButton testID="web-browser-open-button" title="Open" :onPress="open" :color="color" />
      <ActionButton
        testID="web-browser-dismiss-button"
        title="Dismiss"
        :onPress="dismiss"
        :color="color"
      />
      <ResultRow testID="web-browser-result" label="Last result" :value="lastResult" />
    </Scenario>

    <WebBrowserAuthCard :url="url" :options="options" />

    <Explorer testID="web-browser-explorer" :color="color">
      <WebBrowserOptionsCard :form="options" :setForm="setOptions" />
      <CallConsole
        v-if="IS_ANDROID"
        prefix="web-browser-custom-tabs"
        title="Custom Tabs service (Android)"
        :color="color"
        hint="Android only, the calls reject on iOS."
        :calls="customTabsCalls"
      />
    </Explorer>
  </ScreenShell>
</template>
