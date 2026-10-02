<script setup lang="ts">
import { ref } from 'vue';
import { AuthRequest, loadAsync } from '@symbiote-native/auth-session/vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import CallConsole from '../components/CallConsole.vue';
import Field from '../components/Field.vue';
import { toRequestConfig } from './auth-session-form';
import type { IForm } from './auth-session-form';

const props = defineProps<{
  form: IForm;
  discovery: IDiscoveryDocument | null;
  color: string;
  onResult: (result: unknown) => void;
}>();

const returnUrl = ref('');

const request = (): AuthRequest => new AuthRequest(toRequestConfig(props.form));

function needDiscovery(): IDiscoveryDocument {
  if (props.discovery === null) {
    throw new Error('resolve discovery first');
  }
  return props.discovery;
}

const calls = [
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
];
</script>

<template>
  <Field
    testID="auth-session-return-input"
    label="return url for parseReturnUrl"
    :value="returnUrl"
    :onChange="next => (returnUrl = next)"
  />
  <CallConsole
    prefix="auth-session-manual"
    title="new AuthRequest(config)"
    :color="color"
    :calls="calls"
  />
</template>
