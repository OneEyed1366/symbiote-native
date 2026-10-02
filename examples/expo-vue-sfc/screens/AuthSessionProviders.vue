<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  FacebookAuthRequest,
  GoogleAuthRequest,
  facebookDiscovery,
  googleDiscovery,
} from '@symbiote-native/auth-session/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AuthSessionFacebookProbe from './AuthSessionFacebookProbe.vue';
import AuthSessionGoogleIdTokenProbe from './AuthSessionGoogleIdTokenProbe.vue';
import AuthSessionGoogleProbe from './AuthSessionGoogleProbe.vue';
import { INITIAL_PROVIDER_FORM, MODE, MODES } from './auth-session-provider-form';
import type { IMode, IProviderForm } from './auth-session-provider-form';

const color = lineColorOf(ROUTE_NAME.AuthSession);

const form = reactive<IProviderForm>({ ...INITIAL_PROVIDER_FORM });
const mode = ref<IMode>(MODE.off);

const redirectUri = (): string => `${form.scheme}:/redirect`;
const clientId = (): string => form.clientId || 'demo';

const calls = [
  { label: 'googleDiscovery', run: async () => googleDiscovery },
  { label: 'facebookDiscovery', run: async () => facebookDiscovery },
  {
    label: 'GoogleAuthRequest',
    run: async () => {
      const request = new GoogleAuthRequest({
        clientId: clientId(),
        redirectUri: redirectUri(),
      });
      return request.makeAuthUrlAsync(googleDiscovery);
    },
  },
  {
    label: 'FacebookAuthRequest',
    run: async () => {
      const request = new FacebookAuthRequest({
        clientId: clientId(),
        redirectUri: redirectUri(),
      });
      return request.makeAuthUrlAsync(facebookDiscovery);
    },
  },
];
</script>

<template>
  <Card testID="auth-session-provider-card" title="Google and Facebook hooks">
    <Field
      testID="auth-session-provider-client-input"
      label="clientId (Facebook app id or Google fallback)"
      :value="form.clientId"
      :onChange="next => (form.clientId = next)"
    />
    <Field
      testID="auth-session-web-client-input"
      label="webClientId"
      :value="form.webClientId"
      :onChange="next => (form.webClientId = next)"
    />
    <Field
      testID="auth-session-ios-client-input"
      label="iosClientId"
      :value="form.iosClientId"
      :onChange="next => (form.iosClientId = next)"
    />
    <Field
      testID="auth-session-android-client-input"
      label="androidClientId"
      :value="form.androidClientId"
      :onChange="next => (form.androidClientId = next)"
    />
    <Field
      testID="auth-session-login-hint-input"
      label="loginHint"
      :value="form.loginHint"
      :onChange="next => (form.loginHint = next)"
    />
    <Field
      testID="auth-session-provider-scheme-input"
      label="redirect scheme"
      :value="form.scheme"
      :onChange="next => (form.scheme = next)"
    />
    <ToggleRow
      testID="auth-session-select-account-switch"
      label="selectAccount"
      :value="form.selectAccount"
      :onChange="next => (form.selectAccount = next)"
      :color="color"
    />
    <ToggleRow
      testID="auth-session-auto-exchange-switch"
      label="shouldAutoExchangeCode"
      :value="form.shouldAutoExchangeCode"
      :onChange="next => (form.shouldAutoExchangeCode = next)"
      :color="color"
    />
    <ChoiceRow
      testID="auth-session-provider-mode"
      label="mounted hook"
      :options="MODES"
      :value="mode"
      :onChange="next => (mode = next)"
      :color="color"
    />
    <AuthSessionGoogleProbe v-if="mode === MODE.google" :form="form" />
    <AuthSessionGoogleIdTokenProbe v-else-if="mode === MODE.googleIdToken" :form="form" />
    <AuthSessionFacebookProbe v-else-if="mode === MODE.facebook" :form="form" />
  </Card>
  <CallConsole
    prefix="auth-session-provider-classes"
    title="Provider classes and discovery"
    :color="color"
    :calls="calls"
  />
</template>
