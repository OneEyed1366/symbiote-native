<script lang="ts">
  import { useAutoDiscovery } from '@symbiote-native/auth-session/svelte';
  import type { IDiscoveryDocument } from '@symbiote-native/auth-session/svelte';
  import ActionButton from '../components/ActionButton.svelte';

  let {
    issuer,
    color,
    onValue,
  }: {
    issuer: string;
    color: string;
    onValue: (value: IDiscoveryDocument | null) => void;
  } = $props();

  const document = useAutoDiscovery(() => issuer);
</script>

<ActionButton
  testID="auth-session-autodiscovery-use"
  title={document.current === null ? 'discovery loading…' : 'use the hook result'}
  onPress={() => onValue(document.current)}
  {color}
/>
