<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import type { IDiscoveryDocument, TokenResponse } from '@symbiote-native/auth-session/vue';
import Explorer from '../components/Explorer.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AuthSessionConfig from './AuthSessionConfig.vue';
import AuthSessionDiscovery from './AuthSessionDiscovery.vue';
import AuthSessionHookFlows from './AuthSessionHookFlows.vue';
import AuthSessionManualFlow from './AuthSessionManualFlow.vue';
import AuthSessionProviders from './AuthSessionProviders.vue';
import AuthSessionRedirect from './AuthSessionRedirect.vue';
import AuthSessionResult from './AuthSessionResult.vue';
import AuthSessionTokens from './AuthSessionTokens.vue';
import { INITIAL_FORM } from './auth-session-form';
import type { IForm } from './auth-session-form';

const color = lineColorOf(ROUTE_NAME.AuthSession);

const form = ref<IForm>({ ...INITIAL_FORM });
// The document, token and result are replaced whole, never mutated, so they stay shallow
const discovery = shallowRef<IDiscoveryDocument | null>(null);
const token = shallowRef<TokenResponse | null>(null);
const result = shallowRef<unknown>(null);

function setForm(patch: Partial<IForm>): void {
  form.value = { ...form.value, ...patch };
}

function setDiscovery(value: IDiscoveryDocument | null): void {
  discovery.value = value;
}

function setToken(value: TokenResponse | null): void {
  token.value = value;
}

function setResult(value: unknown): void {
  result.value = value;
}
</script>

<template>
  <ScreenShell
    :route="ROUTE_NAME.AuthSession"
    testID="auth-session-scroll"
    title="Auth Session"
    body="Sign users in with any OAuth 2 or OpenID Connect provider through the system browser, with PKCE, token exchange and refresh. Ready-made flows for Google and Facebook."
  >
    <Scenario
      testID="auth-session-scenario"
      title="Sign in with an identity provider"
      why="Let users log in with their existing account. The provider page opens in a secure browser, your app receives a code, exchanges it for tokens and never sees the password."
      :steps="[
        'Set the redirect scheme (canaryexpo is registered in this app)',
        'Enter the provider issuer and your client id below',
        'Press the manual flow button and sign in',
      ]"
      expect="The result card shows the authorization code or an error from the provider. The token cards below exchange and refresh it."
    />
    <AuthSessionRedirect :form="form" :setForm="setForm" :color="color" />
    <AuthSessionDiscovery
      :form="form"
      :setForm="setForm"
      :discovery="discovery"
      :setDiscovery="setDiscovery"
      :color="color"
    />
    <AuthSessionConfig :form="form" :setForm="setForm" :color="color" />
    <AuthSessionManualFlow :form="form" :discovery="discovery" :color="color" :onResult="setResult" />
    <AuthSessionResult :result="result" />
    <Explorer testID="auth-session-explorer" :color="color">
      <AuthSessionHookFlows
        :form="form"
        :discovery="discovery"
        :color="color"
        :onResult="setResult"
      />
      <AuthSessionTokens
        :form="form"
        :discovery="discovery"
        :token="token"
        :color="color"
        :setToken="setToken"
      />
      <AuthSessionProviders />
    </Explorer>
  </ScreenShell>
</template>
