<script lang="ts">
  import { dismiss, makeRedirectUri } from '@symbiote-native/auth-session/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { redirectOptions } from './auth-session-form';
  import type { IForm, ISetForm } from './auth-session-form';

  let { form, setForm, color }: { form: IForm; setForm: ISetForm; color: string } = $props();
</script>

<Card testID="auth-session-redirect-card" title="makeRedirectUri options">
  <Field testID="auth-session-scheme-input" label="scheme" value={form.scheme} onChange={scheme => setForm({ scheme })} />
  <Field testID="auth-session-path-input" label="path" value={form.path} onChange={path => setForm({ path })} />
  <Field testID="auth-session-query-input" label="queryParams (JSON object)" value={form.queryParams} onChange={queryParams => setForm({ queryParams })} />
  <ToggleRow testID="auth-session-triple-switch" label="isTripleSlashed" value={form.isTripleSlashed} onChange={isTripleSlashed => setForm({ isTripleSlashed })} {color} />
  <ToggleRow testID="auth-session-localhost-switch" label="preferLocalhost" value={form.preferLocalhost} onChange={preferLocalhost => setForm({ preferLocalhost })} {color} />
  <Field testID="auth-session-native-input" label="native" value={form.native} onChange={native => setForm({ native })} />
</Card>
<CallConsole
  prefix="auth-session-redirect"
  title="Redirect and lifecycle"
  {color}
  hint="The redirect uri must be registered with the provider, and Android also needs a matching intent filter for the scheme."
  calls={[
    {
      label: 'makeRedirectUri',
      run: async () => {
        const uri = makeRedirectUri(redirectOptions(form));
        setForm({ redirectUri: uri });
        return uri;
      },
    },
    { label: 'dismiss', run: async () => dismiss() },
  ]}
/>
