<script setup lang="ts">
import { ref } from 'vue';
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
} from '@symbiote-native/auth-session/vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import { parseRecord } from './auth-session-form';
import type { IForm } from './auth-session-form';
import { classify, need, tokenSummary } from './auth-session-token-helpers';

const props = defineProps<{
  form: IForm;
  discovery: IDiscoveryDocument | null;
  token: TokenResponse | null;
  color: string;
  setToken: (token: TokenResponse | null) => void;
}>();

const HINT_CHOICES = Object.values(TokenTypeHint).map(value => ({ label: value, value }));

const code = ref('');
const refresh = ref('');
const hint = ref(TokenTypeHint.AccessToken);
const url = ref('https://example.com/');
const params = ref('');

const endpoints = (): IDiscoveryDocument => need(props.discovery, 'resolve discovery');
const current = (): TokenResponse => need(props.token, 'get a token');
const base = () => ({
  clientId: props.form.clientId,
  scopes: props.form.scopes.split(' ').filter(scope => scope !== ''),
});
const refreshToken = (): string | undefined =>
  refresh.value.trim() === '' ? props.token?.refreshToken : refresh.value.trim();
const accessConfig = () => ({
  ...base(),
  code: code.value,
  redirectUri: props.form.redirectUri,
  extraParams: parseRecord(props.form.extraParams),
});

const tokenCalls = [
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
        { ...base(), token: current().accessToken, tokenTypeHint: hint.value },
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
];

const requestClassCalls = [
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
        tokenTypeHint: hint.value,
      });
      return request.getQueryBody();
    },
  },
];

const tokenResponseCalls = [
  {
    label: 'TokenResponse.fromQueryParams',
    run: async () => {
      const next = TokenResponse.fromQueryParams(parseRecord(params.value) ?? {});
      props.setToken(next);
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
];

const fetchCalls = [
  {
    label: 'requestAsync GET json',
    run: () => requestAsync(url.value, { method: 'GET', dataType: 'json' }),
  },
];
</script>

<template>
  <Card testID="auth-session-token-card" title="Token request inputs">
    <Field
      testID="auth-session-code-input"
      label="authorization code"
      :value="code"
      :onChange="next => (code = next)"
    />
    <Field
      testID="auth-session-refresh-input"
      label="refreshToken (empty uses the last token)"
      :value="refresh"
      :onChange="next => (refresh = next)"
    />
    <ChoiceRow
      testID="auth-session-hint"
      label="TokenTypeHint"
      :options="HINT_CHOICES"
      :value="hint"
      :onChange="next => (hint = next)"
      :color="color"
    />
    <Field
      testID="auth-session-query-params-input"
      label="fromQueryParams (JSON object)"
      :value="params"
      :onChange="next => (params = next)"
      placeholder='{"access_token": "abc", "expires_in": "3600"}'
    />
    <Field
      testID="auth-session-request-url-input"
      label="requestAsync url"
      :value="url"
      :onChange="next => (url = next)"
    />
  </Card>
  <CallConsole
    prefix="auth-session-token-calls"
    title="Token endpoint calls"
    :color="color"
    :calls="tokenCalls"
  />
  <CallConsole
    prefix="auth-session-request-classes"
    title="Request classes"
    :color="color"
    hint="Each class builds the request without sending it, getQueryBody shows the wire form."
    :calls="requestClassCalls"
  />
  <CallConsole
    prefix="auth-session-token-response"
    title="TokenResponse"
    :color="color"
    :calls="tokenResponseCalls"
  />
  <CallConsole prefix="auth-session-fetch" title="requestAsync" :color="color" :calls="fetchCalls" />
</template>
