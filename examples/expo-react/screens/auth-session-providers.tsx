import { useState } from 'react';
import {
  FacebookAuthRequest,
  GoogleAuthRequest,
  facebookDiscovery,
  googleDiscovery,
} from '@symbiote-native/auth-session';
import type { IAuthSessionResult } from '@symbiote-native/auth-session';
import {
  useFacebookAuthRequest,
  useGoogleAuthRequest,
  useGoogleIdTokenAuthRequest,
} from '@symbiote-native/auth-session/react';
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

function Prompter({ label, state, onPress }: { label: string; state: string; onPress: () => void }) {
  return (
    <>
      <ResultRow testID="auth-session-provider-state" label={label} value={state} />
      <ActionButton testID="auth-session-provider-prompt" title="promptAsync" onPress={onPress} color={color} />
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

function GoogleCodeProbe({ form }: { form: IProviderForm }) {
  const [request, result, promptAsync] = useGoogleAuthRequest(googleConfig(form), { scheme: form.scheme });
  return <Prompter label="useGoogleAuthRequest" state={describe(request, result)} onPress={() => promptAsync()} />;
}

function GoogleIdTokenProbe({ form }: { form: IProviderForm }) {
  const [request, result, promptAsync] = useGoogleIdTokenAuthRequest(googleConfig(form), { scheme: form.scheme });
  return <Prompter label="useGoogleIdTokenAuthRequest" state={describe(request, result)} onPress={() => promptAsync()} />;
}

function FacebookProbe({ form }: { form: IProviderForm }) {
  const [request, result, promptAsync] = useFacebookAuthRequest({ clientId: form.clientId }, { scheme: form.scheme });
  return <Prompter label="useFacebookAuthRequest" state={describe(request, result)} onPress={() => promptAsync()} />;
}

function ProviderFields({ form, setForm }: { form: IProviderForm; setForm: ISetProvider }) {
  return (
    <>
      <Field testID="auth-session-provider-client-input" label="clientId (Facebook app id or Google fallback)" value={form.clientId} onChange={clientId => setForm({ clientId })} />
      <Field testID="auth-session-web-client-input" label="webClientId" value={form.webClientId} onChange={webClientId => setForm({ webClientId })} />
      <Field testID="auth-session-ios-client-input" label="iosClientId" value={form.iosClientId} onChange={iosClientId => setForm({ iosClientId })} />
      <Field testID="auth-session-android-client-input" label="androidClientId" value={form.androidClientId} onChange={androidClientId => setForm({ androidClientId })} />
      <Field testID="auth-session-login-hint-input" label="loginHint" value={form.loginHint} onChange={loginHint => setForm({ loginHint })} />
      <Field testID="auth-session-provider-scheme-input" label="redirect scheme" value={form.scheme} onChange={scheme => setForm({ scheme })} />
      <ToggleRow testID="auth-session-select-account-switch" label="selectAccount" value={form.selectAccount} onChange={selectAccount => setForm({ selectAccount })} color={color} />
      <ToggleRow testID="auth-session-auto-exchange-switch" label="shouldAutoExchangeCode" value={form.shouldAutoExchangeCode} onChange={shouldAutoExchangeCode => setForm({ shouldAutoExchangeCode })} color={color} />
    </>
  );
}

export function ProviderCards() {
  const [form, setFormState] = useState<IProviderForm>({
    clientId: '',
    webClientId: '',
    iosClientId: '',
    androidClientId: '',
    loginHint: '',
    selectAccount: false,
    shouldAutoExchangeCode: true,
    scheme: 'canaryexpo',
  });
  const [mode, setMode] = useState<IMode>('off');
  const setForm: ISetProvider = patch => setFormState(previous => ({ ...previous, ...patch }));

  return (
    <>
      <Card testID="auth-session-provider-card" title="Google and Facebook hooks">
        <ProviderFields form={form} setForm={setForm} />
        <ChoiceRow testID="auth-session-provider-mode" label="mounted hook" options={MODES} value={mode} onChange={setMode} color={color} />
        {mode === 'google' && <GoogleCodeProbe form={form} />}
        {mode === 'googleIdToken' && <GoogleIdTokenProbe form={form} />}
        {mode === 'facebook' && <FacebookProbe form={form} />}
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
              const request = new GoogleAuthRequest({ clientId: form.clientId || 'demo', redirectUri: `${form.scheme}:/redirect` });
              return request.makeAuthUrlAsync(googleDiscovery);
            },
          },
          {
            label: 'FacebookAuthRequest',
            run: async () => {
              const request = new FacebookAuthRequest({ clientId: form.clientId || 'demo', redirectUri: `${form.scheme}:/redirect` });
              return request.makeAuthUrlAsync(facebookDiscovery);
            },
          },
        ]}
      />
    </>
  );
}
