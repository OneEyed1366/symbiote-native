<script lang="ts">
  import { Platform } from '@symbiote-native/svelte';
  import {
    coolDownAsync,
    dismissBrowser,
    getCustomTabsSupportingBrowsersAsync,
    mayInitWithUrlAsync,
    openBrowserAsync,
    warmUpAsync,
  } from '@symbiote-native/web-browser';
  import ActionButton from '../components/ActionButton.svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import WebBrowserAuthCard from './WebBrowserAuthCard.svelte';
  import WebBrowserOptionsCard from './WebBrowserOptionsCard.svelte';
  import { INITIAL_OPTIONS, toOpenOptions } from './web-browser-options';
  import type { IOptionsForm, ISetOptions } from './web-browser-options';

  const ROUTE = ROUTE_NAME.WebBrowser;
  const color = lineColorOf(ROUTE);
  const DEMO_URL = 'https://symbiote-native.dev';
  const IS_ANDROID = Platform.select({ android: true, default: false });

  let url = $state(DEMO_URL);
  let options = $state<IOptionsForm>(INITIAL_OPTIONS);
  let lastResult = $state('idle');
  let servicePackage = $state<string | undefined>(undefined);

  const setOptions: ISetOptions = patch => {
    options = { ...options, ...patch };
  };

  function open(): void {
    lastResult = 'opening…';
    openBrowserAsync(url, toOpenOptions(options))
      .then(result => {
        lastResult = `result: ${result.type}`;
      })
      .catch((error: Error) => {
        lastResult = `open failed: ${error.message}`;
      });
  }

  function dismiss(): void {
    dismissBrowser()
      .then(result => {
        lastResult = `dismissed: ${result.type}`;
      })
      .catch((error: Error) => {
        lastResult = `dismiss failed: ${error.message}`;
      });
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="web-browser-scroll"
  title="Web Browser"
  body="Show web content in an in-app browser that keeps the user inside your app, and run browser-based sign-in flows that return to the app with a result."
>
  <Scenario
    testID="web-browser-open-card"
    title="Open a link or a help page without leaving the app"
    why="Terms of service, help articles and links open in Safari View Controller or a Chrome Custom Tab on top of your app, with shared cookies and one tap to get back."
    steps={[
      'Press Open (the sample URL is preset)',
      'Close the browser with Done or the back button',
      'Press Open again and use Dismiss from the app (iOS)',
    ]}
    expect="The page opens in the in-app browser. Last result says cancel when closed by the user and dismiss when closed by the app on iOS, and opened on Android as soon as the tab launches."
  >
    <Field
      testID="web-browser-url-input"
      label="url"
      value={url}
      onChange={next => {
        url = next;
      }}
      placeholder="https://example.com"
    />
    <ActionButton testID="web-browser-open-button" title="Open" onPress={open} {color} />
    <ActionButton testID="web-browser-dismiss-button" title="Dismiss" onPress={dismiss} {color} />
    <ResultRow testID="web-browser-result" label="Last result" value={lastResult} />
  </Scenario>

  <WebBrowserAuthCard {url} {options} />

  <Explorer testID="web-browser-explorer" {color}>
    <WebBrowserOptionsCard form={options} setForm={setOptions} />
    {#if IS_ANDROID}
      <CallConsole
        prefix="web-browser-custom-tabs"
        title="Custom Tabs service (Android)"
        {color}
        hint="Android only, the calls reject on iOS."
        calls={[
          {
            label: 'getCustomTabsSupportingBrowsersAsync',
            run: () => getCustomTabsSupportingBrowsersAsync(),
          },
          {
            label: 'warmUpAsync',
            run: async () => {
              const result = await warmUpAsync();
              servicePackage = result.servicePackage;
              return result;
            },
          },
          {
            label: 'mayInitWithUrlAsync',
            run: () => mayInitWithUrlAsync(url, servicePackage),
          },
          { label: 'coolDownAsync', run: () => coolDownAsync(servicePackage) },
        ]}
      />
    {/if}
  </Explorer>
</ScreenShell>
