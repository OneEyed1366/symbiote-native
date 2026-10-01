<script lang="ts">
  import {
    AuthRequest,
    useAuthRequestResult,
    useLoadedAuthRequest,
  } from '@symbiote-native/auth-session/svelte';
  import type { IDiscoveryDocument } from '@symbiote-native/auth-session/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { toRequestConfig } from './auth-session-form';
  import type { IForm } from './auth-session-form';

  let {
    form,
    discovery,
    color,
  }: { form: IForm; discovery: IDiscoveryDocument | null; color: string } = $props();

  const request = useLoadedAuthRequest(
    () => toRequestConfig(form),
    () => discovery,
    AuthRequest,
  );
  const [result, promptAsync] = useAuthRequestResult(
    () => request.current,
    () => discovery,
  );
</script>

<ResultRow
  testID="auth-session-split-state"
  label="useLoadedAuthRequest + useAuthRequestResult"
  value={`${request.current === null ? 'request loading' : 'request ready'}, result ${result.current?.type ?? 'none'}`}
/>
<ActionButton
  testID="auth-session-split-prompt"
  title="promptAsync from useAuthRequestResult"
  onPress={() => promptAsync()}
  {color}
/>
