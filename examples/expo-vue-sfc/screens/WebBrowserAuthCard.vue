<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  WebBrowserResultType,
  dismissAuthSession,
  maybeCompleteAuthSession,
  openAuthSessionAsync,
} from '@symbiote-native/web-browser';
import CallConsole from '../components/CallConsole.vue';
import Field from '../components/Field.vue';
import Scenario from '../components/Scenario.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { toOpenOptions } from './web-browser-options';
import type { IOptionsForm } from './web-browser-options';

const props = defineProps<{ url: string; options: IOptionsForm }>();

const color = lineColorOf(ROUTE_NAME.WebBrowser);

const redirectUrl = ref('canaryexpo://redirect');
const skipRedirectCheck = ref(false);

const hint = `Results are WebBrowserResultType values: ${Object.values(WebBrowserResultType).join(', ')}, or success with the redirect url.`;

const calls = computed(() => [
  {
    label: 'openAuthSessionAsync',
    run: () => openAuthSessionAsync(props.url, redirectUrl.value, toOpenOptions(props.options)),
  },
  { label: 'dismissAuthSession', run: async () => dismissAuthSession() },
  {
    label: 'maybeCompleteAuthSession',
    run: async () => maybeCompleteAuthSession({ skipRedirectCheck: skipRedirectCheck.value }),
  },
]);
</script>

<template>
  <Scenario
    testID="web-browser-auth-card"
    title="Run a browser sign-in that comes back to the app"
    why="Sign-in and payment pages live on the web. An auth session opens them and resolves with the redirect URL when the page sends the user to your app scheme."
    :steps="[
      'Point the url at a page that redirects to canaryexpo://redirect',
      'Press openAuthSessionAsync',
      'Finish or cancel the page',
    ]"
    expect="After the redirect the result is success with the returned URL. Cancelling gives cancel or dismiss, and dismissAuthSession closes the session from code."
  >
    <Field
      testID="web-browser-redirect-input"
      label="redirectUrl (the page must redirect here)"
      :value="redirectUrl"
      :onChange="next => (redirectUrl = next)"
    />
    <ToggleRow
      testID="web-browser-skip-switch"
      label="skipRedirectCheck (for maybeCompleteAuthSession)"
      :value="skipRedirectCheck"
      :onChange="next => (skipRedirectCheck = next)"
      :color="color"
    />
    <CallConsole
      isBare
      prefix="web-browser-auth-calls"
      title="Auth session calls"
      :color="color"
      :hint="hint"
      :calls="calls"
    />
  </Scenario>
</template>
