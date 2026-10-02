<script setup lang="ts">
import { computed } from 'vue';
import { useAutoDiscovery } from '@symbiote-native/auth-session/vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import ActionButton from '../components/ActionButton.vue';

const props = defineProps<{
  issuer: string;
  color: string;
  onValue: (value: IDiscoveryDocument | null) => void;
}>();

const documentRef = useAutoDiscovery(() => props.issuer);
function useResult(): void {
  props.onValue(documentRef.value);
}

const title = computed(() =>
  documentRef.value === null ? 'discovery loading…' : 'use the hook result',
);
</script>

<template>
  <ActionButton
    testID="auth-session-autodiscovery-use"
    :title="title"
    :onPress="useResult"
    :color="color"
  />
</template>
