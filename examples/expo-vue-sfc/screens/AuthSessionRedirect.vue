<script setup lang="ts">
import { dismiss, makeRedirectUri } from '@symbiote-native/auth-session/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { redirectOptions } from './auth-session-form';
import type { IForm, ISetForm } from './auth-session-form';

const props = defineProps<{ form: IForm; setForm: ISetForm; color: string }>();

const calls = [
  {
    label: 'makeRedirectUri',
    run: async () => {
      const uri = makeRedirectUri(redirectOptions(props.form));
      props.setForm({ redirectUri: uri });
      return uri;
    },
  },
  { label: 'dismiss', run: async () => dismiss() },
];
</script>

<template>
  <Card testID="auth-session-redirect-card" title="makeRedirectUri options">
    <Field
      testID="auth-session-scheme-input"
      label="scheme"
      :value="form.scheme"
      :onChange="scheme => setForm({ scheme })"
    />
    <Field
      testID="auth-session-path-input"
      label="path"
      :value="form.path"
      :onChange="path => setForm({ path })"
    />
    <Field
      testID="auth-session-query-input"
      label="queryParams (JSON object)"
      :value="form.queryParams"
      :onChange="queryParams => setForm({ queryParams })"
    />
    <ToggleRow
      testID="auth-session-triple-switch"
      label="isTripleSlashed"
      :value="form.isTripleSlashed"
      :onChange="isTripleSlashed => setForm({ isTripleSlashed })"
      :color="color"
    />
    <ToggleRow
      testID="auth-session-localhost-switch"
      label="preferLocalhost"
      :value="form.preferLocalhost"
      :onChange="preferLocalhost => setForm({ preferLocalhost })"
      :color="color"
    />
    <Field
      testID="auth-session-native-input"
      label="native"
      :value="form.native"
      :onChange="native => setForm({ native })"
    />
  </Card>
  <CallConsole
    prefix="auth-session-redirect"
    title="Redirect and lifecycle"
    :color="color"
    hint="The redirect uri must be registered with the provider, and Android also needs a matching intent filter for the scheme."
    :calls="calls"
  />
</template>
