<script>
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { StyleSheet } from '@symbiote-native/svelte';

  const navigation = useStackNavigation();
  const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
</script>

<view style={styles.container}>
  <text>Welcome to SymbioteNative!</text>
  <pressable onPress={() => navigation.current.push('Details')}>
    <text>Go to Details</text>
  </pressable>
</view>
