<script setup lang="ts">
import { ref } from 'vue';
import {
  fetchDiscoveryAsync,
  issuerWithWellKnownUrl,
  resolveDiscoveryAsync,
} from '@symbiote-native/auth-session/vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import ToggleRow from '../components/ToggleRow.vue';
import AuthSessionAutoDiscoveryProbe from './AuthSessionAutoDiscoveryProbe.vue';
import type { IForm, ISetForm } from './auth-session-form';

const props = defineProps<{
  form: IForm;
  setForm: ISetForm;
  discovery: IDiscoveryDocument | null;
  setDiscovery: (value: IDiscoveryDocument | null) => void;
  color: string;
}>();

const isHookOn = ref(false);

const calls = [
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
];
</script>

<template>
  <Card testID="auth-session-discovery-card" title="Discovery">
    <Field
      testID="auth-session-issuer-input"
      label="issuer"
      :value="form.issuer"
      :onChange="issuer => setForm({ issuer })"
    />
    <ToggleRow
      testID="auth-session-autodiscovery-switch"
      label="useAutoDiscovery(issuer)"
      :value="isHookOn"
      :onChange="next => (isHookOn = next)"
      :color="color"
    />
    <AuthSessionAutoDiscoveryProbe
      v-if="isHookOn"
      :issuer="form.issuer"
      :color="color"
      :onValue="setDiscovery"
    />
    <ResultRow
      testID="auth-session-discovery-endpoints"
      label="authorizationEndpoint"
      :value="discovery?.authorizationEndpoint ?? 'not resolved'"
    />
  </Card>
  <CallConsole prefix="auth-session-discovery" title="Discovery calls" :color="color" :calls="calls" />
</template>
