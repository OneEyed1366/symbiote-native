<script setup lang="ts">
import { computed } from 'vue';
import { useAuthRequest } from '@symbiote-native/auth-session/vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import { toRequestConfig } from './auth-session-form';
import type { IForm } from './auth-session-form';

const props = defineProps<{
  form: IForm;
  discovery: IDiscoveryDocument | null;
  color: string;
  onResult: (result: unknown) => void;
}>();

const [request, result, promptAsync] = useAuthRequest(
  () => toRequestConfig(props.form),
  () => props.discovery,
);

const stateText = computed(
  () =>
    `${request.value === null ? 'request loading' : 'request ready'}, result ${result.value?.type ?? 'none'}`,
);
</script>

<template>
  <ResultRow testID="auth-session-hook-state" label="useAuthRequest" :value="stateText" />
  <ActionButton
    testID="auth-session-hook-prompt"
    title="promptAsync from useAuthRequest"
    :onPress="() => promptAsync().then(onResult)"
    :color="color"
  />
</template>
