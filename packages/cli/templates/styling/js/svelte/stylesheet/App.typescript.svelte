<script lang="ts">
  import { StyleSheet } from '@symbiote-native/svelte';

  let count = $state<number>(0);
  const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
</script>

<view style={styles.container}>
  <text>Welcome to SymbioteNative!</text>
  <pressable onPress={() => count++}>
    <text>Taps: {count}</text>
  </pressable>
</view>
