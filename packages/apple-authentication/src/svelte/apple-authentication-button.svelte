<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import { renderAppleAuthenticationButton } from '../core/apple-authentication-button';
  import type { IAppleAuthenticationButtonProps } from '../core/apple-authentication-button';

  const props: IAppleAuthenticationButtonProps = $props();
  const descriptor = $derived(renderAppleAuthenticationButton({ ...props }));
</script>

{#if descriptor}
  <svelte:element
    this={descriptor.type}
    {@attach hostProps(descriptor.props)}
  />
{/if}
