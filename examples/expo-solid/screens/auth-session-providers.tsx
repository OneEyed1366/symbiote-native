import { Show, createSignal } from 'solid-js';
import {
  FacebookAuthRequest,
  GoogleAuthRequest,
  facebookDiscovery,
  googleDiscovery,
  useFacebookAuthRequest,
  useGoogleAuthRequest,
  useGoogleIdTokenAuthRequest,
} from '@symbiote-native/auth-session/solid';
import type { IAuthSessionResult } from '@symbiote-native/auth-session/solid';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.AuthSession);
type IMode = 'off' | 'google' | 'googleIdToken' | 'facebook';
const MODES: readonly { label: string; value: IMode }[] = [
  { label: 'off', value: 'off' },
  { label: 'useGoogleAuthRequest', value: 'google' },
  { label: 'useGoogleIdTokenAuthRequest', value: 'googleIdToken' },
  { label: 'useFacebookAuthRequest', value: 'facebook' },
];

type IProviderForm = {
  clientId: string;
  webClientId: string;
  iosClientId: string;
  androidClientId: string;
  loginHint: string;
  selectAccount: boolean;
  shouldAutoExchangeCode: boolean;
  scheme: string;
};
type ISetProvider = (patch: Partial<IProviderForm>) => void;

function describe(
  request: GoogleAuthRequest | FacebookAuthRequest | null,
  result: IAuthSessionResult | null,
): string {
  return `${request === null ? 'request loading' : 'request ready'}, result ${result?.type ?? 'none'}`;
}

function Prompter(props: { label: string; state: string; onPress: () => void }) {
  return (
    <>
      <ResultRow testID="auth-session-provider-state" label={props.label} value={props.state} />
      <ActionButton testID="auth-session-provider-prompt" title="promptAsync" onPress={props.onPress} color={color} />
    </>
  );
}

function googleConfig(form: IProviderForm) {
  return {
    clientId: form.clientId,
    webClientId: form.webClientId,
    iosClientId: form.iosClientId,
    androidClientId: form.androidClientId,
    loginHint: form.loginHint === '' ? undefined : form.loginHint,
    selectAccount: form.selectAccount,
    shouldAutoExchangeCode: form.shouldAutoExchangeCode,
  };
}

function GoogleCodeProbe(props: { form: IProviderForm }) {
  const [request, result, promptAsync] = useGoogleAuthRequest(() => googleConfig(props.form), () => ({ scheme: props.form.scheme }));
  return <Prompter label="useGoogleAuthRequest" state={describe(request(), result())} onPress={() => promptAsync()} />;
}

function GoogleIdTokenProbe(props: { form: IProviderForm }) {
  const [request, result, promptAsync] = useGoogleIdTokenAuthRequest(() => googleConfig(props.form), () => ({ scheme: props.form.scheme }));
  return <Prompter label="useGoogleIdTokenAuthRequest" state={describe(request(), result())} onPress={() => promptAsync()} />;
}

function FacebookProbe(props: { form: IProviderForm }) {
  const [request, result, promptAsync] = useFacebookAuthRequest(() => ({ clientId: props.form.clientId }), () => ({ scheme: props.form.scheme }));
  return <Prompter label="useFacebookAuthRequest" state={describe(request(), result())} onPress={() => promptAsync()} />;
}

function ProviderFields(props: { form: IProviderForm; setForm: ISetProvider }) {
  return (
    <>
      <Field testID="auth-session-provider-client-input" label="clientId (Facebook app id or Google fallback)" value={props.form.clientId} onChange={clientId => props.setForm({ clientId })} />
      <Field testID="auth-session-web-client-input" label="webClientId" value={props.form.webClientId} onChange={webClientId => props.setForm({ webClientId })} />
      <Field testID="auth-session-ios-client-input" label="iosClientId" value={props.form.iosClientId} onChange={iosClientId => props.setForm({ iosClientId })} />
      <Field testID="auth-session-android-client-input" label="androidClientId" value={props.form.androidClientId} onChange={androidClientId => props.setForm({ androidClientId })} />
      <Field testID="auth-session-login-hint-input" label="loginHint" value={props.form.loginHint} onChange={loginHint => props.setForm({ loginHint })} />
      <Field testID="auth-session-provider-scheme-input" label="redirect scheme" value={props.form.scheme} onChange={scheme => props.setForm({ scheme })} />
      <ToggleRow testID="auth-session-select-account-switch" label="selectAccount" value={props.form.selectAccount} onChange={selectAccount => props.setForm({ selectAccount })} color={color} />
      <ToggleRow testID="auth-session-auto-exchange-switch" label="shouldAutoExchangeCode" value={props.form.shouldAutoExchangeCode} onChange={shouldAutoExchangeCode => props.setForm({ shouldAutoExchangeCode })} color={color} />
    </>
  );
}

export function ProviderCards() {
  const [form, setFormState] = createSignal<IProviderForm>({
    clientId: '',
    webClientId: '',
    iosClientId: '',
    androidClientId: '',
    loginHint: '',
    selectAccount: false,
    shouldAutoExchangeCode: true,
    scheme: 'canaryexpo',
  });
  const [mode, setMode] = createSignal<IMode>('off');
  const setForm: ISetProvider = patch => setFormState(previous => ({ ...previous, ...patch }));

  return (
    <>
      <Card testID="auth-session-provider-card" title="Google and Facebook hooks">
        <ProviderFields form={form()} setForm={setForm} />
        <ChoiceRow testID="auth-session-provider-mode" label="mounted hook" options={MODES} value={mode()} onChange={next => setMode(next)} color={color} />
        <Show when={mode() === 'google'}>
          <GoogleCodeProbe form={form()} />
        </Show>
        <Show when={mode() === 'googleIdToken'}>
          <GoogleIdTokenProbe form={form()} />
        </Show>
        <Show when={mode() === 'facebook'}>
          <FacebookProbe form={form()} />
        </Show>
      </Card>
      <CallConsole
        prefix="auth-session-provider-classes"
        title="Provider classes and discovery"
        color={color}
        calls={[
          { label: 'googleDiscovery', run: async () => googleDiscovery },
          { label: 'facebookDiscovery', run: async () => facebookDiscovery },
          {
            label: 'GoogleAuthRequest',
            run: async () => {
              const request = new GoogleAuthRequest({ clientId: form().clientId || 'demo', redirectUri: `${form().scheme}:/redirect` });
              return request.makeAuthUrlAsync(googleDiscovery);
            },
          },
          {
            label: 'FacebookAuthRequest',
            run: async () => {
              const request = new FacebookAuthRequest({ clientId: form().clientId || 'demo', redirectUri: `${form().scheme}:/redirect` });
              return request.makeAuthUrlAsync(facebookDiscovery);
            },
          },
        ]}
      />
    </>
  );
}
