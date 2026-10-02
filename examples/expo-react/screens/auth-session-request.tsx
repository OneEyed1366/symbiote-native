import { useState } from 'react';
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
} from '@symbiote-native/auth-session';
import type {
  IAuthRequestConfig,
  IDiscoveryDocument,
} from '@symbiote-native/auth-session';
import {
  useAuthRequest,
  useAuthRequestResult,
  useAutoDiscovery,
  useLoadedAuthRequest,
} from '@symbiote-native/auth-session/react';
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

export function RedirectCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <>
      <Card testID="auth-session-redirect-card" title="makeRedirectUri options">
        <Field testID="auth-session-scheme-input" label="scheme" value={form.scheme} onChange={scheme => setForm({ scheme })} />
        <Field testID="auth-session-path-input" label="path" value={form.path} onChange={path => setForm({ path })} />
        <Field testID="auth-session-query-input" label="queryParams (JSON object)" value={form.queryParams} onChange={queryParams => setForm({ queryParams })} />
        <ToggleRow testID="auth-session-triple-switch" label="isTripleSlashed" value={form.isTripleSlashed} onChange={isTripleSlashed => setForm({ isTripleSlashed })} color={color} />
        <ToggleRow testID="auth-session-localhost-switch" label="preferLocalhost" value={form.preferLocalhost} onChange={preferLocalhost => setForm({ preferLocalhost })} color={color} />
        <Field testID="auth-session-native-input" label="native" value={form.native} onChange={native => setForm({ native })} />
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
              const uri = makeRedirectUri(redirectOptions(form));
              setForm({ redirectUri: uri });
              return uri;
            },
          },
          { label: 'dismiss', run: async () => dismiss() },
        ]}
      />
    </>
  );
}

export function DiscoveryCard({
  form,
  setForm,
  discovery,
  setDiscovery,
}: {
  form: IForm;
  setForm: ISetForm;
  discovery: IDiscoveryDocument | null;
  setDiscovery: (value: IDiscoveryDocument | null) => void;
}) {
  const [isHookOn, setIsHookOn] = useState(false);
  return (
    <>
      <Card testID="auth-session-discovery-card" title="Discovery">
        <Field testID="auth-session-issuer-input" label="issuer" value={form.issuer} onChange={issuer => setForm({ issuer })} />
        <ToggleRow testID="auth-session-autodiscovery-switch" label="useAutoDiscovery(issuer)" value={isHookOn} onChange={setIsHookOn} color={color} />
        {isHookOn && <AutoDiscoveryProbe issuer={form.issuer} onValue={setDiscovery} />}
        <ResultRow
          testID="auth-session-discovery-endpoints"
          label="authorizationEndpoint"
          value={discovery?.authorizationEndpoint ?? 'not resolved'}
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
              const url = issuerWithWellKnownUrl(form.issuer);
              const document = await fetchDiscoveryAsync(url);
              setDiscovery(document);
              return { url, ...document };
            },
          },
          {
            label: 'resolveDiscoveryAsync',
            run: async () => {
              const document = await resolveDiscoveryAsync(form.issuer);
              setDiscovery(document);
              return document;
            },
          },
        ]}
      />
    </>
  );
}

function AutoDiscoveryProbe({ issuer, onValue }: { issuer: string; onValue: (value: IDiscoveryDocument | null) => void }) {
  const document = useAutoDiscovery(issuer);
  return (
    <ActionButton
      testID="auth-session-autodiscovery-use"
      title={document === null ? 'discovery loading…' : 'use the hook result'}
      onPress={() => onValue(document)}
      color={color}
    />
  );
}

export function ConfigCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="auth-session-config-card" title="AuthRequest config">
      <Field testID="auth-session-client-input" label="clientId" value={form.clientId} onChange={clientId => setForm({ clientId })} />
      <Field testID="auth-session-redirect-input" label="redirectUri" value={form.redirectUri} onChange={redirectUri => setForm({ redirectUri })} />
      <Field testID="auth-session-scopes-input" label="scopes (space separated)" value={form.scopes} onChange={scopes => setForm({ scopes })} />
      <Field testID="auth-session-secret-input" label="clientSecret" value={form.clientSecret} onChange={clientSecret => setForm({ clientSecret })} />
      <ChoiceRow testID="auth-session-response-type" label="responseType" options={choices(Object.values(ResponseType))} value={form.responseType} onChange={responseType => setForm({ responseType })} color={color} />
      <ChoiceRow testID="auth-session-challenge-method" label="codeChallengeMethod" options={choices(Object.values(CodeChallengeMethod))} value={form.codeChallengeMethod} onChange={codeChallengeMethod => setForm({ codeChallengeMethod })} color={color} />
      <ChoiceRow testID="auth-session-prompt" label="prompt" options={choices<Prompt | typeof NO_PROMPT>([NO_PROMPT, ...Object.values(Prompt)])} value={form.prompt} onChange={prompt => setForm({ prompt })} color={color} />
      <Field testID="auth-session-state-input" label="state" value={form.state} onChange={state => setForm({ state })} />
      <Field testID="auth-session-extra-input" label="extraParams (JSON object)" value={form.extraParams} onChange={extraParams => setForm({ extraParams })} />
      <ToggleRow testID="auth-session-pkce-switch" label="usePKCE" value={form.usePKCE} onChange={usePKCE => setForm({ usePKCE })} color={color} />
    </Card>
  );
}

export function ManualFlowCard({
  form,
  discovery,
  onResult,
}: {
  form: IForm;
  discovery: IDiscoveryDocument | null;
  onResult: (result: unknown) => void;
}) {
  const [returnUrl, setReturnUrl] = useState('');
  const request = () => new AuthRequest(toRequestConfig(form));
  const needDiscovery = () => {
    if (discovery === null) {
      throw new Error('resolve discovery first');
    }
    return discovery;
  };
  return (
    <>
      <Field testID="auth-session-return-input" label="return url for parseReturnUrl" value={returnUrl} onChange={setReturnUrl} />
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
              onResult(result);
              return result;
            },
          },
          { label: 'parseReturnUrl', run: async () => request().parseReturnUrl(returnUrl) },
          {
            label: 'loadAsync(config, issuer)',
            run: async () => {
              const loaded = await loadAsync(toRequestConfig(form), form.issuer);
              return loaded.state;
            },
          },
        ]}
      />
    </>
  );
}

function HookFlow({ form, discovery, onResult }: { form: IForm; discovery: IDiscoveryDocument | null; onResult: (result: unknown) => void }) {
  const [request, result, promptAsync] = useAuthRequest(toRequestConfig(form), discovery);
  return (
    <>
      <ResultRow testID="auth-session-hook-state" label="useAuthRequest" value={`${request === null ? 'request loading' : 'request ready'}, result ${result?.type ?? 'none'}`} />
      <ActionButton
        testID="auth-session-hook-prompt"
        title="promptAsync from useAuthRequest"
        onPress={() => promptAsync().then(onResult)}
        color={color}
      />
    </>
  );
}

function SplitHookFlow({ form, discovery }: { form: IForm; discovery: IDiscoveryDocument | null }) {
  const request = useLoadedAuthRequest(toRequestConfig(form), discovery, AuthRequest);
  const [result, promptAsync] = useAuthRequestResult(request, discovery);
  return (
    <>
      <ResultRow testID="auth-session-split-state" label="useLoadedAuthRequest + useAuthRequestResult" value={`${request === null ? 'request loading' : 'request ready'}, result ${result?.type ?? 'none'}`} />
      <ActionButton
        testID="auth-session-split-prompt"
        title="promptAsync from useAuthRequestResult"
        onPress={() => promptAsync()}
        color={color}
      />
    </>
  );
}

export function HookFlowCard({ form, discovery, onResult }: { form: IForm; discovery: IDiscoveryDocument | null; onResult: (result: unknown) => void }) {
  const [mode, setMode] = useState<'off' | 'combined' | 'split'>('off');
  return (
    <Card testID="auth-session-hooks-card" title="Hook flows">
      <ChoiceRow testID="auth-session-hook-mode" label="mounted hook" options={choices(['off', 'combined', 'split'] as const)} value={mode} onChange={setMode} color={color} />
      {mode === 'combined' && <HookFlow form={form} discovery={discovery} onResult={onResult} />}
      {mode === 'split' && <SplitHookFlow form={form} discovery={discovery} />}
    </Card>
  );
}

export function ResultCard({ result }: { result: unknown }) {
  return (
    <Card testID="auth-session-result-card" title="Last session result">
      <text testID="auth-session-result" className="info-text">
        {result === null ? 'nothing yet' : summarize(result)}
      </text>
    </Card>
  );
}
