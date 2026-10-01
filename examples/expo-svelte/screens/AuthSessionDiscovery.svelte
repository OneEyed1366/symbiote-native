<script lang="ts">
  import {
    fetchDiscoveryAsync,
    issuerWithWellKnownUrl,
    resolveDiscoveryAsync,
  } from '@symbiote-native/auth-session/svelte';
  import type { IDiscoveryDocument } from '@symbiote-native/auth-session/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import AuthSessionAutoDiscoveryProbe from './AuthSessionAutoDiscoveryProbe.svelte';
  import type { IForm, ISetForm } from './auth-session-form';

  let {
    form,
    setForm,
    discovery,
    setDiscovery,
    color,
  }: {
    form: IForm;
    setForm: ISetForm;
    discovery: IDiscoveryDocument | null;
    setDiscovery: (value: IDiscoveryDocument | null) => void;
    color: string;
  } = $props();

  let isHookOn = $state(false);
</script>

<Card testID="auth-session-discovery-card" title="Discovery">
  <Field testID="auth-session-issuer-input" label="issuer" value={form.issuer} onChange={issuer => setForm({ issuer })} />
  <ToggleRow testID="auth-session-autodiscovery-switch" label="useAutoDiscovery(issuer)" value={isHookOn} onChange={next => (isHookOn = next)} {color} />
  {#if isHookOn}
    <AuthSessionAutoDiscoveryProbe issuer={form.issuer} {color} onValue={setDiscovery} />
  {/if}
  <ResultRow
    testID="auth-session-discovery-endpoints"
    label="authorizationEndpoint"
    value={discovery?.authorizationEndpoint ?? 'not resolved'}
  />
</Card>
<CallConsole
  prefix="auth-session-discovery"
  title="Discovery calls"
  {color}
  calls={[
    {
      label: 'fetchDiscoveryAsync',
      run: async () => {
        const url = issuerWithWellKnownUrl(form.issuer);
        const document = await fetchDiscoveryAsync(url);
        setDiscovery(document);
        return { url, ...document };
      },
    },
    {
      label: 'resolveDiscoveryAsync',
      run: async () => {
        const document = await resolveDiscoveryAsync(form.issuer);
        setDiscovery(document);
        return document;
      },
    },
  ]}
/>
