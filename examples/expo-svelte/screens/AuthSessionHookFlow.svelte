<script lang="ts">
  import { useAuthRequest } from '@symbiote-native/auth-session/svelte';
  import type { IDiscoveryDocument } from '@symbiote-native/auth-session/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { toRequestConfig } from './auth-session-form';
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

  const [request, result, promptAsync] = useAuthRequest(
    () => toRequestConfig(form),
    () => discovery,
  );
</script>

<ResultRow
  testID="auth-session-hook-state"
  label="useAuthRequest"
  value={`${request.current === null ? 'request loading' : 'request ready'}, result ${result.current?.type ?? 'none'}`}
/>
<ActionButton
  testID="auth-session-hook-prompt"
  title="promptAsync from useAuthRequest"
  onPress={() => promptAsync().then(onResult)}
  {color}
/>
