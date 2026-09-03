<!--
  The one toggle-row shape every interactive tile on StyleShowcaseScreen reuses: an ActionButton
  that states its own on/off in the title and wears the Styling line's tint while on. `onToggle`
  stays a plain callback PROP rather than a `@toggle` emit, matching ActionButton's own `onPress`.
  Vue SFC twin of the local `Toggle` in .examples/react/screens/StyleShowcaseScreen.tsx.
-->
<script setup lang="ts">
import ActionButton from './ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';

defineProps<{
  label: string;
  active: boolean;
  onToggle: () => void;
  testID: string;
}>();
</script>

<template>
  <ActionButton
    :testID="testID"
    :title="`${label} — ${active ? 'on' : 'off'}`"
    :color="active ? LINE_COLOR.styling : '#41506a'"
    :onPress="onToggle"
  />
</template>
