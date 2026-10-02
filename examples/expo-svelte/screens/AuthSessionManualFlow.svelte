<script lang="ts">
  import { AuthRequest, loadAsync } from '@symbiote-native/auth-session/svelte';
  import type { IDiscoveryDocument } from '@symbiote-native/auth-session/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Field from '../components/Field.svelte';
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

  let returnUrl = $state('');

  const request = (): AuthRequest => new AuthRequest(toRequestConfig(form));

  function needDiscovery(): IDiscoveryDocument {
    if (discovery === null) {
      throw new Error('resolve discovery first');
    }
    return discovery;
  }
</script>

<Field testID="auth-session-return-input" label="return url for parseReturnUrl" value={returnUrl} onChange={next => (returnUrl = next)} />
<CallConsole
  prefix="auth-session-manual"
  title="new AuthRequest(config)"
  {color}
  calls={[
    { label: 'getAuthRequestConfigAsync', run: () => request().getAuthRequestConfigAsync() },
    { label: 'makeAuthUrlAsync', run: () => request().makeAuthUrlAsync(needDiscovery()) },
    {
      label: 'promptAsync',
      run: async () => {
        const result = await request().promptAsync(needDiscovery());
        onResult(result);
        return result;
      },
    },
    { label: 'parseReturnUrl', run: async () => request().parseReturnUrl(returnUrl) },
    {
      label: 'loadAsync(config, issuer)',
      run: async () => {
        const loaded = await loadAsync(toRequestConfig(form), form.issuer);
        return loaded.state;
      },
    },
  ]}
/>
