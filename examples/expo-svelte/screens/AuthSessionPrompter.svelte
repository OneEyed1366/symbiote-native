<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  let { label, state, onPress }: { label: string; state: string; onPress: () => void } = $props();

  const color = lineColorOf(ROUTE_NAME.AuthSession);
</script>

<ResultRow testID="auth-session-provider-state" {label} value={state} />
<ActionButton testID="auth-session-provider-prompt" title="promptAsync" {onPress} {color} />
