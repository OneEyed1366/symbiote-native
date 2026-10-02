<script setup lang="ts">
import { computed } from 'vue';
import { useGoogleIdTokenAuthRequest } from '@symbiote-native/auth-session/vue';
import AuthSessionPrompter from './AuthSessionPrompter.vue';
import { describe, googleConfig } from './auth-session-provider-form';
import type { IProviderForm } from './auth-session-provider-form';

const props = defineProps<{ form: IProviderForm }>();

const [request, result, promptAsync] = useGoogleIdTokenAuthRequest(
  () => googleConfig(props.form),
  () => ({ scheme: props.form.scheme }),
);

const state = computed(() => describe(request.value, result.value));
</script>

<template>
  <AuthSessionPrompter
    label="useGoogleIdTokenAuthRequest"
    :state="state"
    :onPress="() => promptAsync()"
  />
</template>
