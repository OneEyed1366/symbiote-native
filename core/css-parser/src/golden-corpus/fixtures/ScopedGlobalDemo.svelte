<script lang="ts">
  // Fixture, not a running component. examples/svelte has exactly one styled component and it
  // carries no :global(), so the escape hatch had no golden coverage on this adapter either.
  let isLoud = $state(false);
</script>

<View class="panel">
  <View class="panel wide" />
  <View class={['panel', isLoud && 'wide']} />
  <View class="untouched" />
</View>

<style>
  .panel {
    padding: 9px;
  }

  .panel.wide {
    padding: 19px;
  }

  :global(.untouched) {
    margin: 0;
  }
</style>
