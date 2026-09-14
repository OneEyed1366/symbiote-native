<script lang="ts" module>
</script>

<script lang="ts">
  // <svelte:boundary> demo target (Special Elements · Yes) — throws during INIT (not inside an
  // event handler) when told to, which is exactly the case a boundary's `failed` snippet exists
  // to catch. A throw inside a handler is ordinary try/catch territory, not this row's point.
  let { shouldThrow }: { shouldThrow: boolean } = $props();

  // Reading `shouldThrow` here (not inside an $effect/$derived) is deliberate, not a missed
  // closure — svelte-check's own `state_referenced_locally` warning is an expected false-positive
  // for this exact pattern: SpecialElementsDemo.svelte remounts this component via {#key
  // shouldThrow} whenever the flag flips, so a fresh read at init is precisely what makes the
  // throw fire again.
  if (shouldThrow)
    throw new Error('ApiPlaygroundScreen: BoundaryChild threw on purpose');
</script>

<text class="info-text" testID="boundary-child-ok">
  BoundaryChild mounted without throwing.
</text>
