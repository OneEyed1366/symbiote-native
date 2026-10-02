<script lang="ts">
  import { useGoogleIdTokenAuthRequest } from '@symbiote-native/auth-session/svelte';
  import AuthSessionPrompter from './AuthSessionPrompter.svelte';
  import { describe, googleConfig } from './auth-session-provider-form';
  import type { IProviderForm } from './auth-session-provider-form';

  let { form }: { form: IProviderForm } = $props();

  const [request, result, promptAsync] = useGoogleIdTokenAuthRequest(
    () => googleConfig(form),
    () => ({ scheme: form.scheme }),
  );
</script>

<AuthSessionPrompter
  label="useGoogleIdTokenAuthRequest"
  state={describe(request.current, result.current)}
  onPress={() => promptAsync()}
/>
