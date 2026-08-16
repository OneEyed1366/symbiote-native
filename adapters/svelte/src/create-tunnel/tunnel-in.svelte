<script lang="ts">
  // Registers the default `children` snippet under `tunnel` — mount this anywhere, any surface.
  // See tunnel.ts's header for why `tunnel` is an explicit prop rather than an `<In>` closured
  // per createTunnel() call the way React/Vue's is.
  import type { Snippet } from 'svelte';
  import type { ITunnel } from './tunnel';

  let { tunnel, children }: { tunnel: ITunnel; children: Snippet } = $props();

  // Reserved once at component init (stable for this instance's whole lifetime), not inside the
  // effect — an effect re-running (e.g. because `children` changed) must update the SAME
  // registry slot, never mint a new id and leave the old one orphaned.
  const id = tunnel.reserveId();

  $effect(() => {
    // Reads `children` — re-runs (updating the same slot) if the caller passes a new snippet
    // reference; the common case (a stable inline snippet whose CLOSED-OVER values change) needs
    // no re-run at all, since re-rendering happens naturally where TunnelOut renders it.
    tunnel.items.set(id, children);
    return () => {
      tunnel.items.delete(id);
    };
  });
</script>
