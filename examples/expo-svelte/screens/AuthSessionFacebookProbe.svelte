<script lang="ts">
  import { useFacebookAuthRequest } from '@symbiote-native/auth-session/svelte';
  import AuthSessionPrompter from './AuthSessionPrompter.svelte';
  import { describe } from './auth-session-provider-form';
  import type { IProviderForm } from './auth-session-provider-form';

  let { form }: { form: IProviderForm } = $props();

  const [request, result, promptAsync] = useFacebookAuthRequest(
    () => ({ clientId: form.clientId }),
    () => ({ scheme: form.scheme }),
  );
</script>

<AuthSessionPrompter
  label="useFacebookAuthRequest"
  state={describe(request.current, result.current)}
  onPress={() => promptAsync()}
/>
