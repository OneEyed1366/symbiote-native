<script setup lang="ts">
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

defineProps<{ label: string; state: string; onPress: () => void }>();

const color = lineColorOf(ROUTE_NAME.AuthSession);
</script>

<template>
  <ResultRow testID="auth-session-provider-state" :label="label" :value="state" />
  <ActionButton testID="auth-session-provider-prompt" title="promptAsync" :onPress="onPress" :color="color" />
</template>
