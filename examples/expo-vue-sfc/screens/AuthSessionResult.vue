<script setup lang="ts">
import Card from '../components/Card.vue';
import { summarize } from '../components/call-console';

defineProps<{ result: unknown }>();
</script>

<template>
  <Card testID="auth-session-result-card" title="Last session result">
    <text testID="auth-session-result" class="info-text">
      {{ result === null ? 'nothing yet' : summarize(result) }}
    </text>
  </Card>
</template>
