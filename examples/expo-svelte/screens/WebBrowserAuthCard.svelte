<script lang="ts">
  import {
    WebBrowserResultType,
    dismissAuthSession,
    maybeCompleteAuthSession,
    openAuthSessionAsync,
  } from '@symbiote-native/web-browser';
  import CallConsole from '../components/CallConsole.svelte';
  import Field from '../components/Field.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { toOpenOptions } from './web-browser-options';
  import type { IOptionsForm } from './web-browser-options';

  let { url, options }: { url: string; options: IOptionsForm } = $props();

  const color = lineColorOf(ROUTE_NAME.WebBrowser);

  let redirectUrl = $state('canaryexpo://redirect');
  let skipRedirectCheck = $state(false);
</script>

<Scenario
  testID="web-browser-auth-card"
  title="Run a browser sign-in that comes back to the app"
  why="Sign-in and payment pages live on the web. An auth session opens them and resolves with the redirect URL when the page sends the user to your app scheme."
  steps={[
    'Point the url at a page that redirects to canaryexpo://redirect',
    'Press openAuthSessionAsync',
    'Finish or cancel the page',
  ]}
  expect="After the redirect the result is success with the returned URL. Cancelling gives cancel or dismiss, and dismissAuthSession closes the session from code."
>
  <Field
    testID="web-browser-redirect-input"
    label="redirectUrl (the page must redirect here)"
    value={redirectUrl}
    onChange={next => {
      redirectUrl = next;
    }}
  />
  <ToggleRow
    testID="web-browser-skip-switch"
    label="skipRedirectCheck (for maybeCompleteAuthSession)"
    value={skipRedirectCheck}
    onChange={next => {
      skipRedirectCheck = next;
    }}
    {color}
  />
  <CallConsole
    isBare
    prefix="web-browser-auth-calls"
    title="Auth session calls"
    {color}
    hint={`Results are WebBrowserResultType values: ${Object.values(WebBrowserResultType).join(', ')}, or success with the redirect url.`}
    calls={[
      {
        label: 'openAuthSessionAsync',
        run: () => openAuthSessionAsync(url, redirectUrl, toOpenOptions(options)),
      },
      { label: 'dismissAuthSession', run: async () => dismissAuthSession() },
      {
        label: 'maybeCompleteAuthSession',
        run: async () => maybeCompleteAuthSession({ skipRedirectCheck }),
      },
    ]}
  />
</Scenario>
