<script lang="ts">
  // `TunnelIn` needs no ref or target, `TunnelOut` in the overlay host reads its content back
  import { TunnelIn, type ITunnel } from '@symbiote-native/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ACCENT } from './canary-shared';

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
