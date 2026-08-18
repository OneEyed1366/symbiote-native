<script lang="ts">
  // One half of the <svelte:component this={...}> demo (Component Composition · Partial) —
  // deliberately a distinct component, not a prop variant, since the row is about swapping
  // component IDENTITY, not just values.
  import { Text, View } from '@symbiote-native/svelte';
</script>

<View class="hero-badge" style={{ backgroundColor: '#f6ad55' }}>
  <Text class="hero-badge-text">☀</Text>
</View>
