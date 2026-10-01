<script lang="ts">
  import type { IDiscoveryDocument } from '@symbiote-native/auth-session/svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import AuthSessionHookFlow from './AuthSessionHookFlow.svelte';
  import AuthSessionSplitHookFlow from './AuthSessionSplitHookFlow.svelte';
  import type { IForm } from './auth-session-form';

  let {
    form,
    discovery,
    color,
    onResult,
  }: {
    form: IForm;
    discovery: IDiscoveryDocument | null;
    color: string;
    onResult: (result: unknown) => void;
  } = $props();

  const FLOW = { off: 'off', combined: 'combined', split: 'split' } as const;
  type IFlow = (typeof FLOW)[keyof typeof FLOW];
  const FLOW_CHOICES = Object.values(FLOW).map(value => ({ label: value, value }));

  let mode = $state<IFlow>(FLOW.off);
</script>

<Card testID="auth-session-hooks-card" title="Hook flows">
  <ChoiceRow testID="auth-session-hook-mode" label="mounted hook" options={FLOW_CHOICES} value={mode} onChange={next => (mode = next)} {color} />
  {#if mode === FLOW.combined}
    <AuthSessionHookFlow {form} {discovery} {color} {onResult} />
  {:else if mode === FLOW.split}
    <AuthSessionSplitHookFlow {form} {discovery} {color} />
  {/if}
</Card>
