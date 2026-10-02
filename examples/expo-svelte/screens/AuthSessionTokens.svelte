<script lang="ts">
  import {
    AccessTokenRequest,
    GrantType,
    RefreshTokenRequest,
    RevokeTokenRequest,
    TokenResponse,
    TokenTypeHint,
    exchangeCodeAsync,
    fetchUserInfoAsync,
    getCurrentTimeInSeconds,
    refreshAsync,
    requestAsync,
    revokeAsync,
  } from '@symbiote-native/auth-session/svelte';
  import type { IDiscoveryDocument } from '@symbiote-native/auth-session/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import { parseRecord } from './auth-session-form';
  import type { IForm } from './auth-session-form';
  import { classify, need, tokenSummary } from './auth-session-token-helpers';

  let {
    form,
    discovery,
    token,
    color,
    setToken,
  }: {
    form: IForm;
    discovery: IDiscoveryDocument | null;
    token: TokenResponse | null;
    color: string;
    setToken: (token: TokenResponse | null) => void;
  } = $props();

  const HINT_CHOICES = Object.values(TokenTypeHint).map(value => ({ label: value, value }));

  let code = $state('');
  let refresh = $state('');
  let hint = $state(TokenTypeHint.AccessToken);
  let url = $state('https://example.com/');
  let params = $state('');

  const endpoints = (): IDiscoveryDocument => need(discovery, 'resolve discovery');
  const current = (): TokenResponse => need(token, 'get a token');
  const base = () => ({
    clientId: form.clientId,
    scopes: form.scopes.split(' ').filter(scope => scope !== ''),
  });
  const refreshToken = (): string | undefined =>
    refresh.trim() === '' ? token?.refreshToken : refresh.trim();
  const accessConfig = () => ({
    ...base(),
    code,
    redirectUri: form.redirectUri,
    extraParams: parseRecord(form.extraParams),
  });
</script>

<Card testID="auth-session-token-card" title="Token request inputs">
  <Field testID="auth-session-code-input" label="authorization code" value={code} onChange={next => (code = next)} />
  <Field testID="auth-session-refresh-input" label="refreshToken (empty uses the last token)" value={refresh} onChange={next => (refresh = next)} />
  <ChoiceRow testID="auth-session-hint" label="TokenTypeHint" options={HINT_CHOICES} value={hint} onChange={next => (hint = next)} {color} />
  <Field testID="auth-session-query-params-input" label="fromQueryParams (JSON object)" value={params} onChange={next => (params = next)} placeholder={'{"access_token": "abc", "expires_in": "3600"}'} />
  <Field testID="auth-session-request-url-input" label="requestAsync url" value={url} onChange={next => (url = next)} />
</Card>
<CallConsole
  prefix="auth-session-token-calls"
  title="Token endpoint calls"
  {color}
  calls={[
    {
      label: 'exchangeCodeAsync',
      run: async () => {
        const next = await exchangeCodeAsync(accessConfig(), endpoints());
        setToken(next);
        return tokenSummary(next);
      },
    },
    {
      label: 'refreshAsync',
      run: async () => {
        const next = await refreshAsync({ ...base(), refreshToken: refreshToken() }, endpoints());
        setToken(next);
        return tokenSummary(next);
      },
    },
    {
      label: 'revokeAsync',
      run: () =>
        revokeAsync(
          { ...base(), token: current().accessToken, tokenTypeHint: hint },
          endpoints(),
        ),
    },
    {
      label: 'fetchUserInfoAsync',
      run: () => fetchUserInfoAsync({ accessToken: current().accessToken }, endpoints()),
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
  {color}
  hint="Each class builds the request without sending it, getQueryBody shows the wire form."
  calls={[
    {
      label: 'AccessTokenRequest',
      run: async () => {
        const request = new AccessTokenRequest(accessConfig());
        return {
          grant: GrantType.AuthorizationCode,
          config: request.getRequestConfig(),
          body: request.getQueryBody(),
        };
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
        const request = new RevokeTokenRequest({
          ...base(),
          token: 'sample-token',
          tokenTypeHint: hint,
        });
        return request.getQueryBody();
      },
    },
  ]}
/>
<CallConsole
  prefix="auth-session-token-response"
  title="TokenResponse"
  {color}
  calls={[
    {
      label: 'TokenResponse.fromQueryParams',
      run: async () => {
        const next = TokenResponse.fromQueryParams(parseRecord(params) ?? {});
        setToken(next);
        return tokenSummary(next);
      },
    },
    { label: 'getCurrentTimeInSeconds', run: async () => getCurrentTimeInSeconds() },
    { label: 'TokenResponse.isTokenFresh', run: async () => TokenResponse.isTokenFresh(current()) },
    { label: 'shouldRefresh', run: async () => current().shouldRefresh() },
    { label: 'getRequestConfig', run: async () => current().getRequestConfig() },
    {
      label: 'refreshAsync (instance)',
      run: async () => tokenSummary(await current().refreshAsync(base(), endpoints())),
    },
  ]}
/>
<CallConsole
  prefix="auth-session-fetch"
  title="requestAsync"
  {color}
  calls={[
    {
      label: 'requestAsync GET json',
      run: () => requestAsync(url, { method: 'GET', dataType: 'json' }),
    },
  ]}
/>
