<script lang="ts">
  // Split off CanaryScreen.svelte to keep it under 400 lines. createTunnel: no ref, no target
  // node - TunnelIn just registers its snippet content from wherever it's mounted; TunnelOut
  // (mounted in CanaryScreen's overlay host) reads it back through its own normal render.
  import { TunnelIn, type ITunnel } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const ACCENT = '#ff3e00';

  let { tunnel }: { tunnel: ITunnel } = $props();

  let toastVisible = $state(false);
</script>

<ActionButton
  testID="tunnel-toast-open"
  title="Show toast (createTunnel)"
  onPress={() => (toastVisible = true)}
  color={ACCENT}
/>
{#if toastVisible}
  <TunnelIn {tunnel}>
    <view testID="tunnel-toast-card" class="modal-card">
      <text class="modal-body">Ported via createTunnel ✦</text>
      <ActionButton
        testID="tunnel-toast-dismiss"
        title="Dismiss"
        onPress={() => (toastVisible = false)}
        color={ACCENT}
      />
    </view>
  </TunnelIn>
{/if}
