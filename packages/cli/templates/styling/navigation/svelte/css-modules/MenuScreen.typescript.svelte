<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import styles from './App.module.css';

  const navigation = useStackNavigation();
</script>

<view class={styles.container}>
  <text>Welcome to SymbioteNative!</text>
  <pressable onPress={() => navigation.current.push('Details')}>
    <text>Go to Details</text>
  </pressable>
</view>
