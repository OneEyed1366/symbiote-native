import { defineComponent, ref } from 'vue';
import {
  AccessTokenRequest,
  AuthError,
  GrantType,
  RefreshTokenRequest,
  ResponseError,
  RevokeTokenRequest,
  TokenError,
  TokenResponse,
  TokenTypeHint,
  exchangeCodeAsync,
  fetchUserInfoAsync,
  getCurrentTimeInSeconds,
  refreshAsync,
  requestAsync,
  revokeAsync,
} from '@symbiote-native/auth-session/vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { parseRecord } from './auth-session-request';
import type { IForm } from './auth-session-request';

const color = lineColorOf(ROUTE_NAME.AuthSession);

function need<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} first`);
  }
  return value;
}

function tokenSummary(token: TokenResponse) {
  return {
    accessToken: `${token.accessToken.slice(0, 12)}…`,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
    issuedAt: token.issuedAt,
    hasRefreshToken: token.refreshToken !== undefined,
    scope: token.scope,
  };
}

function classify(error: unknown): string {
  if (error instanceof TokenError) {
    return `TokenError ${error.code}: ${error.message}`;
  }
  if (error instanceof ResponseError) {
    return `ResponseError ${error.code}: ${error.message}`;
  }
  if (error instanceof AuthError) {
    return `AuthError ${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

type IProps = {
  form: IForm;
  discovery: IDiscoveryDocument | null;
  token: TokenResponse | null;
  setToken: (token: TokenResponse | null) => void;
};

type ITokenInputsProps = {
  hint: TokenTypeHint;
  setHint: (value: TokenTypeHint) => void;
  code: string;
  setCode: (value: string) => void;
  refresh: string;
  setRefresh: (value: string) => void;
  url: string;
  setUrl: (value: string) => void;
  params: string;
  setParams: (value: string) => void;
};

function TokenInputs(props: ITokenInputsProps) {
  return (
    <Card testID="auth-session-token-card" title="Token request inputs">
      <Field testID="auth-session-code-input" label="authorization code" value={props.code} onChange={props.setCode} />
      <Field testID="auth-session-refresh-input" label="refreshToken (empty uses the last token)" value={props.refresh} onChange={props.setRefresh} />
      <ChoiceRow
        testID="auth-session-hint"
        label="TokenTypeHint"
        options={Object.values(TokenTypeHint).map(value => ({ label: value, value }))}
        value={props.hint}
        onChange={props.setHint}
        color={color}
      />
      <Field testID="auth-session-query-params-input" label="fromQueryParams (JSON object)" value={props.params} onChange={props.setParams} placeholder='{"access_token": "abc", "expires_in": "3600"}' />
      <Field testID="auth-session-request-url-input" label="requestAsync url" value={props.url} onChange={props.setUrl} />
    </Card>
  );
}

export const TokenCards = defineComponent<IProps>(
  props => {
    const code = ref('');
    const refresh = ref('');
    const hint = ref(TokenTypeHint.AccessToken);
    const url = ref('https://example.com/');
    const params = ref('');
    const endpoints = () => need(props.discovery, 'resolve discovery');
    const scopes = () => props.form.scopes.split(' ').filter(scope => scope !== '');
    const base = () => ({ clientId: props.form.clientId, scopes: scopes() });
    const refreshToken = () => (refresh.value.trim() === '' ? props.token?.refreshToken : refresh.value.trim());
    const accessConfig = () => ({
      ...base(),
      code: code.value,
      redirectUri: props.form.redirectUri,
      extraParams: parseRecord(props.form.extraParams),
    });

    return () => (
      <>
        <TokenInputs
          hint={hint.value}
          setHint={next => { hint.value = next; }}
          code={code.value}
          setCode={next => { code.value = next; }}
          refresh={refresh.value}
          setRefresh={next => { refresh.value = next; }}
          url={url.value}
          setUrl={next => { url.value = next; }}
          params={params.value}
          setParams={next => { params.value = next; }}
        />
        <CallConsole
          prefix="auth-session-token-calls"
          title="Token endpoint calls"
          color={color}
          calls={[
            {
              label: 'exchangeCodeAsync',
              run: async () => {
                const next = await exchangeCodeAsync(accessConfig(), endpoints());
                props.setToken(next);
                return tokenSummary(next);
              },
            },
            {
              label: 'refreshAsync',
              run: async () => {
                const next = await refreshAsync({ ...base(), refreshToken: refreshToken() }, endpoints());
                props.setToken(next);
                return tokenSummary(next);
              },
            },
            {
              label: 'revokeAsync',
              run: () =>
                revokeAsync(
                  { ...base(), token: need(props.token, 'get a token').accessToken, tokenTypeHint: hint.value },
                  endpoints(),
                ),
            },
            {
              label: 'fetchUserInfoAsync',
              run: () => fetchUserInfoAsync({ accessToken: need(props.token, 'get a token').accessToken }, endpoints()),
            },
            {
              label: 'provoke TokenError (bad code)',
              run: async () => {
                try {
                  await exchangeCodeAsync({ ...accessConfig(), code: 'invalid-code' }, endpoints());
                  return 'unexpectedly succeeded';
                } catch (error) {
                  return classify(error);
                }
              },
            },
          ]}
        />
        <CallConsole
          prefix="auth-session-request-classes"
          title="Request classes"
          color={color}
          hint="Each class builds the request without sending it, getQueryBody shows the wire form."
          calls={[
            {
              label: 'AccessTokenRequest',
              run: async () => {
                const request = new AccessTokenRequest(accessConfig());
                return { grant: GrantType.AuthorizationCode, config: request.getRequestConfig(), body: request.getQueryBody() };
              },
            },
            {
              label: 'RefreshTokenRequest',
              run: async () => {
                const request = new RefreshTokenRequest({ ...base(), refreshToken: refreshToken() });
                return { grant: GrantType.RefreshToken, body: request.getQueryBody() };
              },
            },
            {
              label: 'RevokeTokenRequest',
              run: async () => {
                const request = new RevokeTokenRequest({ ...base(), token: 'sample-token', tokenTypeHint: hint.value });
                return request.getQueryBody();
              },
            },
          ]}
        />
        <CallConsole
          prefix="auth-session-token-response"
          title="TokenResponse"
          color={color}
          calls={[
            {
              label: 'TokenResponse.fromQueryParams',
              run: async () => {
                const next = TokenResponse.fromQueryParams(parseRecord(params.value) ?? {});
                props.setToken(next);
                return tokenSummary(next);
              },
            },
            { label: 'getCurrentTimeInSeconds', run: async () => getCurrentTimeInSeconds() },
            { label: 'TokenResponse.isTokenFresh', run: async () => TokenResponse.isTokenFresh(need(props.token, 'get a token')) },
            { label: 'shouldRefresh', run: async () => need(props.token, 'get a token').shouldRefresh() },
            { label: 'getRequestConfig', run: async () => need(props.token, 'get a token').getRequestConfig() },
            {
              label: 'refreshAsync (instance)',
              run: async () => tokenSummary(await need(props.token, 'get a token').refreshAsync(base(), endpoints())),
            },
          ]}
        />
        <CallConsole
          prefix="auth-session-fetch"
          title="requestAsync"
          color={color}
          calls={[{ label: 'requestAsync GET json', run: () => requestAsync(url.value, { method: 'GET', dataType: 'json' }) }]}
        />
      </>
    );
  },
  { name: 'TokenCards', props: ['form', 'discovery', 'token', 'setToken'] },
);
