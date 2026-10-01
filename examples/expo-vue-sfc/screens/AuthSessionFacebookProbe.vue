<script setup lang="ts">
import { computed } from 'vue';
import { useFacebookAuthRequest } from '@symbiote-native/auth-session/vue';
import AuthSessionPrompter from './AuthSessionPrompter.vue';
import { describe } from './auth-session-provider-form';
import type { IProviderForm } from './auth-session-provider-form';

const props = defineProps<{ form: IProviderForm }>();

const [request, result, promptAsync] = useFacebookAuthRequest(
  () => ({ clientId: props.form.clientId }),
  () => ({ scheme: props.form.scheme }),
);

const state = computed(() => describe(request.value, result.value));
</script>

<template>
  <AuthSessionPrompter label="useFacebookAuthRequest" :state="state" :onPress="() => promptAsync()" />
</template>
