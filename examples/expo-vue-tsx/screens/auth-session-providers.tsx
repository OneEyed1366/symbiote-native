import { defineComponent, ref } from 'vue';
import {
  FacebookAuthRequest,
  GoogleAuthRequest,
  facebookDiscovery,
  googleDiscovery,
  useFacebookAuthRequest,
  useGoogleAuthRequest,
  useGoogleIdTokenAuthRequest,
} from '@symbiote-native/auth-session/vue';
import type { IAuthSessionResult } from '@symbiote-native/auth-session/vue';
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
const MODE = {
  off: 'off',
  google: 'google',
  googleIdToken: 'googleIdToken',
  facebook: 'facebook',
} as const;
type IMode = (typeof MODE)[keyof typeof MODE];
const MODES: readonly { label: string; value: IMode }[] = [
  { label: 'off', value: MODE.off },
  { label: 'useGoogleAuthRequest', value: MODE.google },
  { label: 'useGoogleIdTokenAuthRequest', value: MODE.googleIdToken },
  { label: 'useFacebookAuthRequest', value: MODE.facebook },
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

type IPrompterProps = { label: string; state: string; onPress: () => void };

function Prompter(props: IPrompterProps) {
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

const GoogleCodeProbe = defineComponent<{ form: IProviderForm }>(
  props => {
    const [request, result, promptAsync] = useGoogleAuthRequest(() => googleConfig(props.form), () => ({ scheme: props.form.scheme }));
    return () => <Prompter label="useGoogleAuthRequest" state={describe(request.value, result.value)} onPress={() => promptAsync()} />;
  },
  { name: 'GoogleCodeProbe', props: ['form'] },
);

const GoogleIdTokenProbe = defineComponent<{ form: IProviderForm }>(
  props => {
    const [request, result, promptAsync] = useGoogleIdTokenAuthRequest(() => googleConfig(props.form), () => ({ scheme: props.form.scheme }));
    return () => <Prompter label="useGoogleIdTokenAuthRequest" state={describe(request.value, result.value)} onPress={() => promptAsync()} />;
  },
  { name: 'GoogleIdTokenProbe', props: ['form'] },
);

const FacebookProbe = defineComponent<{ form: IProviderForm }>(
  props => {
    const [request, result, promptAsync] = useFacebookAuthRequest(() => ({ clientId: props.form.clientId }), () => ({ scheme: props.form.scheme }));
    return () => <Prompter label="useFacebookAuthRequest" state={describe(request.value, result.value)} onPress={() => promptAsync()} />;
  },
  { name: 'FacebookProbe', props: ['form'] },
);

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

export const ProviderCards = defineComponent(
  () => {
    const form = ref<IProviderForm>({
      clientId: '',
      webClientId: '',
      iosClientId: '',
      androidClientId: '',
      loginHint: '',
      selectAccount: false,
      shouldAutoExchangeCode: true,
      scheme: 'canaryexpo',
    });
    const mode = ref<IMode>(MODE.off);
    const setForm: ISetProvider = patch => {
      form.value = { ...form.value, ...patch };
    };

    return () => (
      <>
        <Card testID="auth-session-provider-card" title="Google and Facebook hooks">
          <ProviderFields form={form.value} setForm={setForm} />
          <ChoiceRow testID="auth-session-provider-mode" label="mounted hook" options={MODES} value={mode.value} onChange={next => { mode.value = next; }} color={color} />
          {mode.value === MODE.google && <GoogleCodeProbe form={form.value} />}
          {mode.value === MODE.googleIdToken && <GoogleIdTokenProbe form={form.value} />}
          {mode.value === MODE.facebook && <FacebookProbe form={form.value} />}
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
                const request = new GoogleAuthRequest({ clientId: form.value.clientId || 'demo', redirectUri: `${form.value.scheme}:/redirect` });
                return request.makeAuthUrlAsync(googleDiscovery);
              },
            },
            {
              label: 'FacebookAuthRequest',
              run: async () => {
                const request = new FacebookAuthRequest({ clientId: form.value.clientId || 'demo', redirectUri: `${form.value.scheme}:/redirect` });
                return request.makeAuthUrlAsync(facebookDiscovery);
              },
            },
          ]}
        />
      </>
    );
  },
  { name: 'ProviderCards' },
);
