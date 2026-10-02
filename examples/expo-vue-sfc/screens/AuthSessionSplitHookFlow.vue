<script setup lang="ts">
import { computed } from 'vue';
import {
  AuthRequest,
  useAuthRequestResult,
  useLoadedAuthRequest,
} from '@symbiote-native/auth-session/vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import { toRequestConfig } from './auth-session-form';
import type { IForm } from './auth-session-form';

const props = defineProps<{ form: IForm; discovery: IDiscoveryDocument | null; color: string }>();

const request = useLoadedAuthRequest(
  () => toRequestConfig(props.form),
  () => props.discovery,
  AuthRequest,
);
const [result, promptAsync] = useAuthRequestResult(request, () => props.discovery);

const stateText = computed(
  () =>
    `${request.value === null ? 'request loading' : 'request ready'}, result ${result.value?.type ?? 'none'}`,
);
</script>

<template>
  <ResultRow
    testID="auth-session-split-state"
    label="useLoadedAuthRequest + useAuthRequestResult"
    :value="stateText"
  />
  <ActionButton
    testID="auth-session-split-prompt"
    title="promptAsync from useAuthRequestResult"
    :onPress="() => promptAsync()"
    :color="color"
  />
</template>
