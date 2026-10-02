import { defineComponent, ref } from 'vue';
import {
  AuthRequest,
  CodeChallengeMethod,
  Prompt,
  ResponseType,
  dismiss,
  fetchDiscoveryAsync,
  issuerWithWellKnownUrl,
  loadAsync,
  makeRedirectUri,
  resolveDiscoveryAsync,
  useAuthRequest,
  useAuthRequestResult,
  useAutoDiscovery,
  useLoadedAuthRequest,
} from '@symbiote-native/auth-session/vue';
import type {
  IAuthRequestConfig,
  IDiscoveryDocument,
} from '@symbiote-native/auth-session/vue';
import { ActionButton } from '../components/ActionButton';
import { CallConsole, summarize } from '../components/CallConsole';
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
const NO_PROMPT = 'no prompt';
const HOOK_MODE = { off: 'off', combined: 'combined', split: 'split' } as const;
type IHookMode = (typeof HOOK_MODE)[keyof typeof HOOK_MODE];

export type IForm = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  clientSecret: string;
  responseType: ResponseType;
  codeChallengeMethod: CodeChallengeMethod;
  prompt: Prompt | typeof NO_PROMPT;
  state: string;
  extraParams: string;
  usePKCE: boolean;
  scheme: string;
  path: string;
  queryParams: string;
  isTripleSlashed: boolean;
  preferLocalhost: boolean;
  native: string;
};
export type ISetForm = (patch: Partial<IForm>) => void;

export const INITIAL_FORM: IForm = {
  issuer: 'https://demo.duendesoftware.com',
  clientId: 'interactive.public',
  redirectUri: '',
  scopes: 'openid profile email',
  clientSecret: '',
  responseType: ResponseType.Code,
  codeChallengeMethod: CodeChallengeMethod.S256,
  prompt: NO_PROMPT,
  state: '',
  extraParams: '',
  usePKCE: true,
  scheme: 'canaryexpo',
  path: 'redirect',
  queryParams: '',
  isTripleSlashed: false,
  preferLocalhost: false,
  native: '',
};

function choices<T extends string>(values: readonly T[]) {
  return values.map(value => ({ label: value, value }));
}

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

export function parseRecord(text: string): Record<string, string> | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('expected a JSON object');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
}

export function toRequestConfig(form: IForm): IAuthRequestConfig {
  return {
    clientId: form.clientId,
    redirectUri: form.redirectUri,
    scopes: form.scopes.split(' ').filter(scope => scope !== ''),
    clientSecret: optional(form.clientSecret),
    responseType: form.responseType,
    codeChallengeMethod: form.codeChallengeMethod,
    prompt: form.prompt === NO_PROMPT ? undefined : form.prompt,
    state: optional(form.state),
    extraParams: parseRecord(form.extraParams),
    usePKCE: form.usePKCE,
  };
}

function redirectOptions(form: IForm) {
  return {
    scheme: optional(form.scheme),
    path: optional(form.path),
    queryParams: parseRecord(form.queryParams),
    isTripleSlashed: form.isTripleSlashed,
    preferLocalhost: form.preferLocalhost,
    native: optional(form.native),
  };
}

type IFormProps = { form: IForm; setForm: ISetForm };

export const RedirectCard = defineComponent<IFormProps>(
  props => () => (
    <>
      <Card testID="auth-session-redirect-card" title="makeRedirectUri options">
        <Field testID="auth-session-scheme-input" label="scheme" value={props.form.scheme} onChange={scheme => props.setForm({ scheme })} />
        <Field testID="auth-session-path-input" label="path" value={props.form.path} onChange={path => props.setForm({ path })} />
        <Field testID="auth-session-query-input" label="queryParams (JSON object)" value={props.form.queryParams} onChange={queryParams => props.setForm({ queryParams })} />
        <ToggleRow testID="auth-session-triple-switch" label="isTripleSlashed" value={props.form.isTripleSlashed} onChange={isTripleSlashed => props.setForm({ isTripleSlashed })} color={color} />
        <ToggleRow testID="auth-session-localhost-switch" label="preferLocalhost" value={props.form.preferLocalhost} onChange={preferLocalhost => props.setForm({ preferLocalhost })} color={color} />
        <Field testID="auth-session-native-input" label="native" value={props.form.native} onChange={native => props.setForm({ native })} />
      </Card>
      <CallConsole
        prefix="auth-session-redirect"
        title="Redirect and lifecycle"
        color={color}
        hint="The redirect uri must be registered with the provider, and Android also needs a matching intent filter for the scheme."
        calls={[
          {
            label: 'makeRedirectUri',
            run: async () => {
              const uri = makeRedirectUri(redirectOptions(props.form));
              props.setForm({ redirectUri: uri });
              return uri;
            },
          },
          { label: 'dismiss', run: async () => dismiss() },
        ]}
      />
    </>
  ),
  { name: 'RedirectCard', props: ['form', 'setForm'] },
);

type IAutoDiscoveryProbeProps = {
  issuer: string;
  onValue: (value: IDiscoveryDocument | null) => void;
};

const AutoDiscoveryProbe = defineComponent<IAutoDiscoveryProbeProps>(
  props => {
    const document = useAutoDiscovery(() => props.issuer);
    return () => (
      <ActionButton
        testID="auth-session-autodiscovery-use"
        title={document.value === null ? 'discovery loading…' : 'use the hook result'}
        onPress={() => props.onValue(document.value)}
        color={color}
      />
    );
  },
  { name: 'AutoDiscoveryProbe', props: ['issuer', 'onValue'] },
);

type IDiscoveryCardProps = IFormProps & {
  discovery: IDiscoveryDocument | null;
  setDiscovery: (value: IDiscoveryDocument | null) => void;
};

export const DiscoveryCard = defineComponent<IDiscoveryCardProps>(
  props => {
    const isHookOn = ref(false);
    return () => (
      <>
        <Card testID="auth-session-discovery-card" title="Discovery">
          <Field testID="auth-session-issuer-input" label="issuer" value={props.form.issuer} onChange={issuer => props.setForm({ issuer })} />
          <ToggleRow testID="auth-session-autodiscovery-switch" label="useAutoDiscovery(issuer)" value={isHookOn.value} onChange={next => { isHookOn.value = next; }} color={color} />
          {isHookOn.value && <AutoDiscoveryProbe issuer={props.form.issuer} onValue={props.setDiscovery} />}
          <ResultRow
            testID="auth-session-discovery-endpoints"
            label="authorizationEndpoint"
            value={props.discovery?.authorizationEndpoint ?? 'not resolved'}
          />
        </Card>
        <CallConsole
          prefix="auth-session-discovery"
          title="Discovery calls"
          color={color}
          calls={[
            {
              label: 'fetchDiscoveryAsync',
              run: async () => {
                const url = issuerWithWellKnownUrl(props.form.issuer);
                const document = await fetchDiscoveryAsync(url);
                props.setDiscovery(document);
                return { url, ...document };
              },
            },
            {
              label: 'resolveDiscoveryAsync',
              run: async () => {
                const document = await resolveDiscoveryAsync(props.form.issuer);
                props.setDiscovery(document);
                return document;
              },
            },
          ]}
        />
      </>
    );
  },
  { name: 'DiscoveryCard', props: ['form', 'setForm', 'discovery', 'setDiscovery'] },
);

export function ConfigCard(props: IFormProps) {
  return (
    <Card testID="auth-session-config-card" title="AuthRequest config">
      <Field testID="auth-session-client-input" label="clientId" value={props.form.clientId} onChange={clientId => props.setForm({ clientId })} />
      <Field testID="auth-session-redirect-input" label="redirectUri" value={props.form.redirectUri} onChange={redirectUri => props.setForm({ redirectUri })} />
      <Field testID="auth-session-scopes-input" label="scopes (space separated)" value={props.form.scopes} onChange={scopes => props.setForm({ scopes })} />
      <Field testID="auth-session-secret-input" label="clientSecret" value={props.form.clientSecret} onChange={clientSecret => props.setForm({ clientSecret })} />
      <ChoiceRow testID="auth-session-response-type" label="responseType" options={choices(Object.values(ResponseType))} value={props.form.responseType} onChange={responseType => props.setForm({ responseType })} color={color} />
      <ChoiceRow testID="auth-session-challenge-method" label="codeChallengeMethod" options={choices(Object.values(CodeChallengeMethod))} value={props.form.codeChallengeMethod} onChange={codeChallengeMethod => props.setForm({ codeChallengeMethod })} color={color} />
      <ChoiceRow testID="auth-session-prompt" label="prompt" options={choices<Prompt | typeof NO_PROMPT>([NO_PROMPT, ...Object.values(Prompt)])} value={props.form.prompt} onChange={prompt => props.setForm({ prompt })} color={color} />
      <Field testID="auth-session-state-input" label="state" value={props.form.state} onChange={state => props.setForm({ state })} />
      <Field testID="auth-session-extra-input" label="extraParams (JSON object)" value={props.form.extraParams} onChange={extraParams => props.setForm({ extraParams })} />
      <ToggleRow testID="auth-session-pkce-switch" label="usePKCE" value={props.form.usePKCE} onChange={usePKCE => props.setForm({ usePKCE })} color={color} />
    </Card>
  );
}

type IManualFlowProps = {
  form: IForm;
  discovery: IDiscoveryDocument | null;
  onResult: (result: unknown) => void;
};

export const ManualFlowCard = defineComponent<IManualFlowProps>(
  props => {
    const returnUrl = ref('');
    const request = () => new AuthRequest(toRequestConfig(props.form));
    const needDiscovery = () => {
      if (props.discovery === null) {
        throw new Error('resolve discovery first');
      }
      return props.discovery;
    };
    return () => (
      <>
        <Field testID="auth-session-return-input" label="return url for parseReturnUrl" value={returnUrl.value} onChange={next => { returnUrl.value = next; }} />
        <CallConsole
          prefix="auth-session-manual"
          title="new AuthRequest(config)"
          color={color}
          calls={[
            { label: 'getAuthRequestConfigAsync', run: () => request().getAuthRequestConfigAsync() },
            { label: 'makeAuthUrlAsync', run: () => request().makeAuthUrlAsync(needDiscovery()) },
            {
              label: 'promptAsync',
              run: async () => {
                const result = await request().promptAsync(needDiscovery());
                props.onResult(result);
                return result;
              },
            },
            { label: 'parseReturnUrl', run: async () => request().parseReturnUrl(returnUrl.value) },
            {
              label: 'loadAsync(config, issuer)',
              run: async () => {
                const loaded = await loadAsync(toRequestConfig(props.form), props.form.issuer);
                return loaded.state;
              },
            },
          ]}
        />
      </>
    );
  },
  { name: 'ManualFlowCard', props: ['form', 'discovery', 'onResult'] },
);

const HookFlow = defineComponent<IManualFlowProps>(
  props => {
    const [request, result, promptAsync] = useAuthRequest(() => toRequestConfig(props.form), () => props.discovery);
    return () => (
      <>
        <ResultRow testID="auth-session-hook-state" label="useAuthRequest" value={`${request.value === null ? 'request loading' : 'request ready'}, result ${result.value?.type ?? 'none'}`} />
        <ActionButton
          testID="auth-session-hook-prompt"
          title="promptAsync from useAuthRequest"
          onPress={() => promptAsync().then(props.onResult)}
          color={color}
        />
      </>
    );
  },
  { name: 'HookFlow', props: ['form', 'discovery', 'onResult'] },
);

const SplitHookFlow = defineComponent<{ form: IForm; discovery: IDiscoveryDocument | null }>(
  props => {
    const request = useLoadedAuthRequest(() => toRequestConfig(props.form), () => props.discovery, AuthRequest);
    const [result, promptAsync] = useAuthRequestResult(request, () => props.discovery);
    return () => (
      <>
        <ResultRow testID="auth-session-split-state" label="useLoadedAuthRequest + useAuthRequestResult" value={`${request.value === null ? 'request loading' : 'request ready'}, result ${result.value?.type ?? 'none'}`} />
        <ActionButton
          testID="auth-session-split-prompt"
          title="promptAsync from useAuthRequestResult"
          onPress={() => promptAsync()}
          color={color}
        />
      </>
    );
  },
  { name: 'SplitHookFlow', props: ['form', 'discovery'] },
);

export const HookFlowCard = defineComponent<IManualFlowProps>(
  props => {
    const mode = ref<IHookMode>(HOOK_MODE.off);
    return () => (
      <Card testID="auth-session-hooks-card" title="Hook flows">
        <ChoiceRow testID="auth-session-hook-mode" label="mounted hook" options={choices(Object.values(HOOK_MODE))} value={mode.value} onChange={next => { mode.value = next; }} color={color} />
        {mode.value === HOOK_MODE.combined && <HookFlow form={props.form} discovery={props.discovery} onResult={props.onResult} />}
        {mode.value === HOOK_MODE.split && <SplitHookFlow form={props.form} discovery={props.discovery} />}
      </Card>
    );
  },
  { name: 'HookFlowCard', props: ['form', 'discovery', 'onResult'] },
);

export function ResultCard(props: { result: unknown }) {
  return (
    <Card testID="auth-session-result-card" title="Last session result">
      <text testID="auth-session-result" class="info-text">
        {props.result === null ? 'nothing yet' : summarize(props.result)}
      </text>
    </Card>
  );
}
