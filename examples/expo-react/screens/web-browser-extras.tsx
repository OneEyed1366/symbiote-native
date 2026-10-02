import { useState } from 'react';
import {
  WebBrowserPresentationStyle,
  WebBrowserResultType,
  dismissAuthSession,
  maybeCompleteAuthSession,
  openAuthSessionAsync,
} from '@symbiote-native/web-browser';
import type { IAuthSessionOpenOptions } from '@symbiote-native/web-browser';
import { CallConsole } from '../components/CallConsole';
import { Scenario } from '../components/Scenario';
import {
  Card,
  ChoiceRow,
  Field,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.WebBrowser);
const DEFAULT_STYLE = 'default';

export type IOptionsForm = {
  toolbarColor: string;
  secondaryToolbarColor: string;
  controlsColor: string;
  browserPackage: string;
  enableBarCollapsing: boolean;
  showTitle: boolean;
  enableDefaultShareMenuItem: boolean;
  showInRecents: boolean;
  createTask: boolean;
  useProxyActivity: boolean;
  readerMode: boolean;
  preferEphemeralSession: boolean;
  preferUniversalLinks: boolean;
  dismissButtonStyle: string;
  presentationStyle: string;
};
export type ISetOptions = (patch: Partial<IOptionsForm>) => void;

export const INITIAL_OPTIONS: IOptionsForm = {
  toolbarColor: '#0b1622',
  secondaryToolbarColor: '',
  controlsColor: '',
  browserPackage: '',
  enableBarCollapsing: true,
  showTitle: false,
  enableDefaultShareMenuItem: false,
  showInRecents: false,
  createTask: true,
  useProxyActivity: false,
  readerMode: false,
  preferEphemeralSession: false,
  preferUniversalLinks: false,
  dismissButtonStyle: DEFAULT_STYLE,
  presentationStyle: DEFAULT_STYLE,
};

const DISMISS_STYLES: readonly IAuthSessionOpenOptions['dismissButtonStyle'][] = ['done', 'close', 'cancel'];

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

export function toOpenOptions(form: IOptionsForm): IAuthSessionOpenOptions {
  return {
    toolbarColor: optional(form.toolbarColor),
    secondaryToolbarColor: optional(form.secondaryToolbarColor),
    controlsColor: optional(form.controlsColor),
    browserPackage: optional(form.browserPackage),
    enableBarCollapsing: form.enableBarCollapsing,
    showTitle: form.showTitle,
    enableDefaultShareMenuItem: form.enableDefaultShareMenuItem,
    showInRecents: form.showInRecents,
    createTask: form.createTask,
    useProxyActivity: form.useProxyActivity,
    readerMode: form.readerMode,
    preferEphemeralSession: form.preferEphemeralSession,
    preferUniversalLinks: form.preferUniversalLinks,
    dismissButtonStyle: DISMISS_STYLES.find(style => style === form.dismissButtonStyle),
    presentationStyle: Object.values(WebBrowserPresentationStyle).find(
      style => style === form.presentationStyle,
    ),
  };
}

function choices(values: readonly string[]) {
  return [DEFAULT_STYLE, ...values].map(value => ({ label: value, value }));
}

export function OptionsCard({ form, setForm }: { form: IOptionsForm; setForm: ISetOptions }) {
  return (
    <Card testID="web-browser-options-card" title="Browser options">
      <Field testID="web-browser-toolbar-input" label="toolbarColor" value={form.toolbarColor} onChange={toolbarColor => setForm({ toolbarColor })} />
      <Field testID="web-browser-secondary-input" label="secondaryToolbarColor (Android)" value={form.secondaryToolbarColor} onChange={secondaryToolbarColor => setForm({ secondaryToolbarColor })} />
      <Field testID="web-browser-controls-input" label="controlsColor (iOS)" value={form.controlsColor} onChange={controlsColor => setForm({ controlsColor })} />
      <Field testID="web-browser-package-input" label="browserPackage (Android)" value={form.browserPackage} onChange={browserPackage => setForm({ browserPackage })} />
      <ToggleRow testID="web-browser-collapse-switch" label="enableBarCollapsing" value={form.enableBarCollapsing} onChange={enableBarCollapsing => setForm({ enableBarCollapsing })} color={color} />
      <ToggleRow testID="web-browser-title-switch" label="showTitle (Android)" value={form.showTitle} onChange={showTitle => setForm({ showTitle })} color={color} />
      <ToggleRow testID="web-browser-share-switch" label="enableDefaultShareMenuItem (Android)" value={form.enableDefaultShareMenuItem} onChange={enableDefaultShareMenuItem => setForm({ enableDefaultShareMenuItem })} color={color} />
      <ToggleRow testID="web-browser-recents-switch" label="showInRecents (Android)" value={form.showInRecents} onChange={showInRecents => setForm({ showInRecents })} color={color} />
      <ToggleRow testID="web-browser-task-switch" label="createTask (Android)" value={form.createTask} onChange={createTask => setForm({ createTask })} color={color} />
      <ToggleRow testID="web-browser-proxy-switch" label="useProxyActivity (Android)" value={form.useProxyActivity} onChange={useProxyActivity => setForm({ useProxyActivity })} color={color} />
      <ToggleRow testID="web-browser-reader-switch" label="readerMode (iOS)" value={form.readerMode} onChange={readerMode => setForm({ readerMode })} color={color} />
      <ChoiceRow testID="web-browser-dismiss-style" label="dismissButtonStyle (iOS)" options={choices(['done', 'close', 'cancel'])} value={form.dismissButtonStyle} onChange={dismissButtonStyle => setForm({ dismissButtonStyle })} color={color} />
      <ChoiceRow testID="web-browser-presentation" label="presentationStyle (iOS)" options={choices(Object.values(WebBrowserPresentationStyle))} value={form.presentationStyle} onChange={presentationStyle => setForm({ presentationStyle })} color={color} />
    </Card>
  );
}

export function AuthSessionCard({ url, options }: { url: string; options: IOptionsForm }) {
  const [redirectUrl, setRedirectUrl] = useState('canaryexpo://redirect');
  const [skipRedirectCheck, setSkipRedirectCheck] = useState(false);
  return (
    <Scenario
      testID="web-browser-auth-card"
      title="Run a browser sign-in that comes back to the app"
      why="Sign-in and payment pages live on the web. An auth session opens them and resolves with the redirect URL when the page sends the user to your app scheme."
      steps={['Point the url at a page that redirects to canaryexpo://redirect', 'Press openAuthSessionAsync', 'Finish or cancel the page']}
      expect="After the redirect the result is success with the returned URL. Cancelling gives cancel or dismiss, and dismissAuthSession closes the session from code."
    >
      <Field testID="web-browser-redirect-input" label="redirectUrl (the page must redirect here)" value={redirectUrl} onChange={setRedirectUrl} />
      <ToggleRow testID="web-browser-skip-switch" label="skipRedirectCheck (for maybeCompleteAuthSession)" value={skipRedirectCheck} onChange={setSkipRedirectCheck} color={color} />
      <CallConsole
        isBare
        prefix="web-browser-auth-calls"
        title="Auth session calls"
        color={color}
        hint={`Results are WebBrowserResultType values: ${Object.values(WebBrowserResultType).join(', ')}, or success with the redirect url.`}
        calls={[
          { label: 'openAuthSessionAsync', run: () => openAuthSessionAsync(url, redirectUrl, toOpenOptions(options)) },
          { label: 'dismissAuthSession', run: async () => dismissAuthSession() },
          { label: 'maybeCompleteAuthSession', run: async () => maybeCompleteAuthSession({ skipRedirectCheck }) },
        ]}
      />
    </Scenario>
  );
}
