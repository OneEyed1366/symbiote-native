<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic. The platform decision is made once at mount, like the other adapters
  import {
    contactAccessButtonViewName,
    ensureContactAccessButtonRegistered,
  } from '../core/contact-access-button';
  import type { IContactAccessButtonProps } from '../core/contact-access-button';

  const props: IContactAccessButtonProps = $props();
  const isRegistered = ensureContactAccessButtonRegistered();
  const viewName = contactAccessButtonViewName();
</script>

{#if isRegistered}
  <svelte:element this={viewName} p={{ ...props }} />
{/if}
