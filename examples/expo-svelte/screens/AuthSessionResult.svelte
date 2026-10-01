<script lang="ts">
  import Card from '../components/Card.svelte';
  import { summarize } from '../components/call-console';

  let { result }: { result: unknown } = $props();
</script>

<Card testID="auth-session-result-card" title="Last session result">
  <text testID="auth-session-result" class="info-text">
    {result === null ? 'nothing yet' : summarize(result)}
  </text>
</Card>
