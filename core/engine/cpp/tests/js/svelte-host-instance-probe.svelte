<script>
  let { onCapture } = $props();
  let box = $state.raw(null);
  $effect(() => {
    if (box !== null) onCapture(box);
  });
</script>

<view testID="ref-box" bind:this={box} />
