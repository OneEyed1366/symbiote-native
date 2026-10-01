<script setup lang="ts">
import { ref } from 'vue';
import type { IDiscoveryDocument } from '@symbiote-native/auth-session/vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import AuthSessionHookFlow from './AuthSessionHookFlow.vue';
import AuthSessionSplitHookFlow from './AuthSessionSplitHookFlow.vue';
import type { IForm } from './auth-session-form';

defineProps<{
  form: IForm;
  discovery: IDiscoveryDocument | null;
  color: string;
  onResult: (result: unknown) => void;
}>();

const FLOW = { off: 'off', combined: 'combined', split: 'split' } as const;
type IFlow = (typeof FLOW)[keyof typeof FLOW];
const FLOW_CHOICES = Object.values(FLOW).map(value => ({ label: value, value }));

const mode = ref<IFlow>(FLOW.off);
</script>

<template>
  <Card testID="auth-session-hooks-card" title="Hook flows">
    <ChoiceRow
      testID="auth-session-hook-mode"
      label="mounted hook"
      :options="FLOW_CHOICES"
      :value="mode"
      :onChange="next => (mode = next)"
      :color="color"
    />
    <AuthSessionHookFlow
      v-if="mode === FLOW.combined"
      :form="form"
      :discovery="discovery"
      :color="color"
      :onResult="onResult"
    />
    <AuthSessionSplitHookFlow
      v-else-if="mode === FLOW.split"
      :form="form"
      :discovery="discovery"
      :color="color"
    />
  </Card>
</template>
