import { defineComponent, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  coolDownAsync,
  dismissBrowser,
  getCustomTabsSupportingBrowsersAsync,
  mayInitWithUrlAsync,
  openBrowserAsync,
  warmUpAsync,
} from '@symbiote-native/web-browser';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Field,
  ResultRow,
  ScreenShell,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import {
  AuthSessionCard,
  INITIAL_OPTIONS,
  OptionsCard,
  toOpenOptions,
} from './web-browser-extras';
import type { IOptionsForm, ISetOptions } from './web-browser-extras';

const ROUTE = ROUTE_NAME.WebBrowser;
const color = lineColorOf(ROUTE);
const DEMO_URL = 'https://symbiote-native.dev';
const IS_ANDROID = Platform.select({ android: true, default: false });

const OpenCard = defineComponent<{
  url: string;
  setUrl: (value: string) => void;
  options: IOptionsForm;
}>(
  props => {
    const lastResult = ref('idle');
    const open = () => {
      lastResult.value = 'opening…';
      openBrowserAsync(props.url, toOpenOptions(props.options))
        .then(result => {
          lastResult.value = `result: ${result.type}`;
        })
        .catch((error: Error) => {
          lastResult.value = `open failed: ${error.message}`;
        });
    };
    const dismiss = () =>
      dismissBrowser()
        .then(result => {
          lastResult.value = `dismissed: ${result.type}`;
        })
        .catch((error: Error) => {
          lastResult.value = `dismiss failed: ${error.message}`;
        });

    return () => (
      <Scenario
        testID="web-browser-open-card"
        title="Open a link or a help page without leaving the app"
        why="Terms of service, help articles and links open in Safari View Controller or a Chrome Custom Tab on top of your app, with shared cookies and one tap to get back."
        steps={['Press Open (the sample URL is preset)', 'Close the browser with Done or the back button', 'Press Open again and use Dismiss from the app (iOS)']}
        expect="The page opens in the in-app browser. Last result says cancel when closed by the user and dismiss when closed by the app on iOS, and opened on Android as soon as the tab launches."
      >
        <Field testID="web-browser-url-input" label="url" value={props.url} onChange={props.setUrl} placeholder="https://example.com" />
        <ActionButton testID="web-browser-open-button" title="Open" onPress={open} color={color} />
        <ActionButton testID="web-browser-dismiss-button" title="Dismiss" onPress={dismiss} color={color} />
        <ResultRow testID="web-browser-result" label="Last result" value={lastResult.value} />
      </Scenario>
    );
  },
  { name: 'OpenCard', props: ['url', 'setUrl', 'options'] },
);

const CustomTabsCalls = defineComponent<{ url: string }>(
  props => {
    const servicePackage = ref<string | undefined>(undefined);
    return () => (
      <CallConsole
        prefix="web-browser-custom-tabs"
        title="Custom Tabs service (Android)"
        color={color}
        hint="Android only, the calls reject on iOS."
        calls={[
          { label: 'getCustomTabsSupportingBrowsersAsync', run: () => getCustomTabsSupportingBrowsersAsync() },
          {
            label: 'warmUpAsync',
            run: async () => {
              const result = await warmUpAsync();
              servicePackage.value = result.servicePackage;
              return result;
            },
          },
          { label: 'mayInitWithUrlAsync', run: () => mayInitWithUrlAsync(props.url, servicePackage.value) },
          { label: 'coolDownAsync', run: () => coolDownAsync(servicePackage.value) },
        ]}
      />
    );
  },
  { name: 'CustomTabsCalls', props: ['url'] },
);

export const WebBrowserScreen = defineComponent(
  () => {
    const url = ref(DEMO_URL);
    const options = ref<IOptionsForm>(INITIAL_OPTIONS);
    const setUrl = (next: string) => {
      url.value = next;
    };
    const setOptions: ISetOptions = patch => {
      options.value = { ...options.value, ...patch };
    };

    return () => (
      <ScreenShell
        route={ROUTE}
        testID="web-browser-scroll"
        title="Web Browser"
        body="Show web content in an in-app browser that keeps the user inside your app, and run browser-based sign-in flows that return to the app with a result."
      >
        <OpenCard url={url.value} setUrl={setUrl} options={options.value} />
        <AuthSessionCard url={url.value} options={options.value} />
        <Explorer testID="web-browser-explorer" color={color}>
          <OptionsCard form={options.value} setForm={setOptions} />
          {IS_ANDROID && <CustomTabsCalls url={url.value} />}
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'WebBrowserScreen' },
);
