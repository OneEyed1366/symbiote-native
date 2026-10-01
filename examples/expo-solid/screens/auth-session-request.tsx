import { Show, createSignal } from 'solid-js';
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
} from '@symbiote-native/auth-session/solid';
import type {
  IAuthRequestConfig,
  IDiscoveryDocument,
} from '@symbiote-native/auth-session/solid';
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

export function RedirectCard(props: { form: IForm; setForm: ISetForm }) {
  return (
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
  );
}

export function DiscoveryCard(props: {
  form: IForm;
  setForm: ISetForm;
  discovery: IDiscoveryDocument | null;
  setDiscovery: (value: IDiscoveryDocument | null) => void;
}) {
  const [isHookOn, setIsHookOn] = createSignal(false);
  return (
    <>
      <Card testID="auth-session-discovery-card" title="Discovery">
        <Field testID="auth-session-issuer-input" label="issuer" value={props.form.issuer} onChange={issuer => props.setForm({ issuer })} />
        <ToggleRow testID="auth-session-autodiscovery-switch" label="useAutoDiscovery(issuer)" value={isHookOn()} onChange={setIsHookOn} color={color} />
        <Show when={isHookOn()}>
          <AutoDiscoveryProbe issuer={props.form.issuer} onValue={props.setDiscovery} />
        </Show>
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
}

function AutoDiscoveryProbe(props: { issuer: string; onValue: (value: IDiscoveryDocument | null) => void }) {
  const document = useAutoDiscovery(() => props.issuer);
  return (
    <ActionButton
      testID="auth-session-autodiscovery-use"
      title={document() === null ? 'discovery loading…' : 'use the hook result'}
      onPress={() => props.onValue(document())}
      color={color}
    />
  );
}

export function ConfigCard(props: { form: IForm; setForm: ISetForm }) {
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

export function ManualFlowCard(props: {
  form: IForm;
  discovery: IDiscoveryDocument | null;
  onResult: (result: unknown) => void;
}) {
  const [returnUrl, setReturnUrl] = createSignal('');
  const request = () => new AuthRequest(toRequestConfig(props.form));
  const needDiscovery = () => {
    if (props.discovery === null) {
      throw new Error('resolve discovery first');
    }
    return props.discovery;
  };
  return (
    <>
      <Field testID="auth-session-return-input" label="return url for parseReturnUrl" value={returnUrl()} onChange={setReturnUrl} />
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
          { label: 'parseReturnUrl', run: async () => request().parseReturnUrl(returnUrl()) },
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
}

type IFlowProps = { form: IForm; discovery: IDiscoveryDocument | null; onResult: (result: unknown) => void };

function HookFlow(props: IFlowProps) {
  const [request, result, promptAsync] = useAuthRequest(() => toRequestConfig(props.form), () => props.discovery);
  return (
    <>
      <ResultRow testID="auth-session-hook-state" label="useAuthRequest" value={`${request() === null ? 'request loading' : 'request ready'}, result ${result()?.type ?? 'none'}`} />
      <ActionButton
        testID="auth-session-hook-prompt"
        title="promptAsync from useAuthRequest"
        onPress={() => promptAsync().then(props.onResult)}
        color={color}
      />
    </>
  );
}

function SplitHookFlow(props: { form: IForm; discovery: IDiscoveryDocument | null }) {
  const request = useLoadedAuthRequest(() => toRequestConfig(props.form), () => props.discovery, AuthRequest);
  const [result, promptAsync] = useAuthRequestResult(request, () => props.discovery);
  return (
    <>
      <ResultRow testID="auth-session-split-state" label="useLoadedAuthRequest + useAuthRequestResult" value={`${request() === null ? 'request loading' : 'request ready'}, result ${result()?.type ?? 'none'}`} />
      <ActionButton
        testID="auth-session-split-prompt"
        title="promptAsync from useAuthRequestResult"
        onPress={() => promptAsync()}
        color={color}
      />
    </>
  );
}

export function HookFlowCard(props: IFlowProps) {
  const [mode, setMode] = createSignal<'off' | 'combined' | 'split'>('off');
  return (
    <Card testID="auth-session-hooks-card" title="Hook flows">
      <ChoiceRow testID="auth-session-hook-mode" label="mounted hook" options={choices(['off', 'combined', 'split'] as const)} value={mode()} onChange={next => setMode(next)} color={color} />
      <Show when={mode() === 'combined'}>
        <HookFlow form={props.form} discovery={props.discovery} onResult={props.onResult} />
      </Show>
      <Show when={mode() === 'split'}>
        <SplitHookFlow form={props.form} discovery={props.discovery} />
      </Show>
    </Card>
  );
}

export function ResultCard(props: { result: unknown }) {
  return (
    <Card testID="auth-session-result-card" title="Last session result">
      <text testID="auth-session-result" class="info-text">
        {props.result === null ? 'nothing yet' : summarize(props.result)}
      </text>
    </Card>
  );
}
